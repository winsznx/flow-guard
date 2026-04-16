import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../database/schema.js';
import { VaultService } from '../services/vaultService.js';
import { VoteDeploymentService } from '../services/VoteDeploymentService.js';
import { VoteLockService } from '../services/VoteLockService.js';
import { VoteUnlockService } from '../services/VoteUnlockService.js';
import { serializeWcTransaction } from '../utils/wcSerializer.js';
import { transactionExists, transactionHasExpectedOutput } from '../utils/txVerification.js';

const router = Router();

function rowToProposal(row: any) {
  return {
    id: row.id,
    vaultId: row.vault_id,
    title: row.title,
    description: row.description,
    proposer: row.proposer,
    status: row.status,
    votesFor: row.votes_for,
    votesAgainst: row.votes_against,
    votesAbstain: row.votes_abstain,
    quorum: row.quorum,
    totalVotes: row.votes_for + row.votes_against + row.votes_abstain,
    votingEndsAt: new Date(row.voting_ends_at),
    createdAt: new Date(row.created_at),
  };
}

// List proposals for a vault
router.get('/vaults/:vaultId/governance', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM governance_proposals WHERE vault_id = ?';
    const params: any[] = [req.params.vaultId];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';
    const rows = await db!.prepare(sql).all(...params) as any[];
    res.json(rows.map(rowToProposal));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a governance proposal
router.post('/vaults/:vaultId/governance', async (req, res) => {
  try {
    const userAddress = req.headers['x-user-address'] as string;
    if (!userAddress) return res.status(401).json({ error: 'Authentication required' });

    const vault = await VaultService.getVaultByVaultId(req.params.vaultId);
    if (!vault) return res.status(404).json({ error: 'Vault not found' });

    const { title, description, quorum, votingDurationDays } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const durationDays = Number(votingDurationDays) || 7;
    const votingEndsAt = new Date(Date.now() + durationDays * 86400 * 1000).toISOString();

    const id = randomUUID();
    await db!.prepare(`
      INSERT INTO governance_proposals (id, vault_id, title, description, proposer, quorum, voting_ends_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.params.vaultId, title, description || null, userAddress, Number(quorum) || 0, votingEndsAt);

    const row = await db!.prepare('SELECT * FROM governance_proposals WHERE id = ?').get(id) as any;
    res.status(201).json(rowToProposal(row));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single proposal with vote breakdown
router.get('/governance/:proposalId', async (req, res) => {
  try {
    const row = await db!.prepare('SELECT * FROM governance_proposals WHERE id = ?').get(req.params.proposalId) as any;
    if (!row) return res.status(404).json({ error: 'Proposal not found' });

    const votes = await db!.prepare('SELECT * FROM governance_votes WHERE proposal_id = ? ORDER BY created_at DESC').all(req.params.proposalId) as any[];
    res.json({ ...rowToProposal(row), votes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Cast a vote
router.post('/governance/:proposalId/vote', async (req, res) => {
  try {
    const userAddress = req.headers['x-user-address'] as string;
    if (!userAddress) return res.status(401).json({ error: 'Authentication required' });

    const proposal = await db!.prepare('SELECT * FROM governance_proposals WHERE id = ?').get(req.params.proposalId) as any;
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    if (proposal.status !== 'ACTIVE') return res.status(400).json({ error: 'Proposal is not active' });

    const { vote, weight } = req.body;
    if (!['FOR', 'AGAINST', 'ABSTAIN'].includes(vote)) {
      return res.status(400).json({ error: 'vote must be FOR, AGAINST, or ABSTAIN' });
    }

    const voteWeight = Number(weight) || 1;
    const voteId = randomUUID();

    await db!.prepare(`
      INSERT INTO governance_votes (id, proposal_id, voter, vote, weight)
      VALUES (?, ?, ?, ?, ?)
    `).run(voteId, req.params.proposalId, userAddress, vote, voteWeight);

    // Update tally
    const tallyCol = vote === 'FOR' ? 'votes_for' : vote === 'AGAINST' ? 'votes_against' : 'votes_abstain';
    await db!.prepare(`UPDATE governance_proposals SET ${tallyCol} = ${tallyCol} + ?, updated_at = NOW()::TEXT WHERE id = ?`).run(voteWeight, req.params.proposalId);

    const updatedProposal = await db!.prepare('SELECT * FROM governance_proposals WHERE id = ?').get(req.params.proposalId) as any;
    res.json(rowToProposal(updatedProposal));
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Already voted on this proposal' });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/governance/:proposalId/lock
 * Lock governance tokens to vote
 */
router.post('/governance/:proposalId/lock', async (req, res) => {
  try {
    const { voterAddress, voteChoice, stakeAmount, tokenCategory } = req.body;

    if (!voterAddress) {
      return res.status(400).json({ error: 'Voter address is required' });
    }
    if (!['ABSTAIN', 'FOR', 'AGAINST'].includes(voteChoice)) {
      return res.status(400).json({ error: 'Vote choice must be ABSTAIN, FOR, or AGAINST' });
    }
    if (!stakeAmount || stakeAmount <= 0) {
      return res.status(400).json({ error: 'Stake amount must be greater than 0' });
    }

    const proposal = await db!.prepare('SELECT * FROM governance_proposals WHERE id = ?').get(req.params.proposalId) as any;
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const votingPeriodEnd = Math.floor(new Date(proposal.voting_ends_at).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);

    if (now > votingPeriodEnd) {
      return res.status(400).json({ error: 'Voting period has ended' });
    }

    if (proposal.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Proposal is not active' });
    }

    // Deploy vote lock contract
    const deploymentService = new VoteDeploymentService('chipnet');
    const deployment = await deploymentService.deployVoteLock({
      proposalId: req.params.proposalId,
      voter: voterAddress,
      voteChoice: voteChoice as 'ABSTAIN' | 'FOR' | 'AGAINST',
      stakeAmount,
      votingPeriodEnd,
      tokenCategory,
    });

    // Build lock transaction (returns WcTransactionObject — wallet signs P2PKH inputs)
    const lockService = new VoteLockService('chipnet');
    const lockTx = await lockService.buildLockTransaction({
      contractAddress: deployment.contractAddress,
      voterAddress,
      stakeAmount,
      tokenCategory: tokenCategory || '',
      nftCommitment: deployment.initialCommitment,
    });

    res.json({
      success: true,
      deployment: {
        contractAddress: deployment.contractAddress,
        voteId: deployment.voteId,
        constructorParams: deployment.constructorParams,
        initialCommitment: deployment.initialCommitment,
      },
      wcTransaction: serializeWcTransaction(lockTx),
    });
  } catch (error: any) {
    console.error(`POST /governance/${req.params.proposalId}/lock error:`, error);
    res.status(500).json({ error: 'Failed to create vote lock', message: error.message });
  }
});

/**
 * POST /api/governance/:proposalId/confirm-lock
 * Confirm vote lock transaction
 */
router.post('/governance/:proposalId/confirm-lock', async (req, res) => {
  try {
    const { voterAddress, voteChoice, weight, txHash, contractAddress, voteId: deployedVoteId, constructorParams, nftCommitment } = req.body;
    const voteWeight = Math.max(1, Math.trunc(Number(weight || 1)));

    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash is required' });
    }
    if (!voterAddress) {
      return res.status(400).json({ error: 'Voter address is required' });
    }
    if (!contractAddress) {
      return res.status(400).json({ error: 'Vote lock contract address is required' });
    }
    if (!['ABSTAIN', 'FOR', 'AGAINST'].includes(String(voteChoice))) {
      return res.status(400).json({ error: 'Vote choice must be ABSTAIN, FOR, or AGAINST' });
    }

    if (!(await transactionExists(txHash, 'chipnet'))) {
      return res.status(409).json({
        error: 'Transaction hash not found on chipnet',
        message: 'Transaction is not indexed yet. Retry confirmation shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'TX_NOT_FOUND',
      });
    }

    const hasExpectedLockOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: contractAddress,
        minimumSatoshis: 546n,
        minimumTokenAmount: BigInt(voteWeight),
        requireNft: true,
        requiredNftCapability: 'mutable',
        minimumNftCommitmentBytes: 20,
      },
      'chipnet',
    );
    if (!hasExpectedLockOutput) {
      return res.status(400).json({
        error: 'Lock transaction does not include expected vote-lock covenant output',
      });
    }

    const proposal = await db!.prepare('SELECT * FROM governance_proposals WHERE id = ?').get(req.params.proposalId) as any;
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Record vote in database — store contract data for later unlock
    const voteId = randomUUID();

    await db!.prepare(`
      INSERT INTO governance_votes (id, proposal_id, voter, vote, weight, contract_address, constructor_params, nft_commitment, vote_id, lock_tx_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      voteId,
      req.params.proposalId,
      voterAddress,
      voteChoice,
      voteWeight,
      contractAddress || null,
      constructorParams ? JSON.stringify(constructorParams) : null,
      nftCommitment || null,
      deployedVoteId || null,
      txHash,
      new Date().toISOString(),
    );

    // Update proposal tally
    const tallyCol = voteChoice === 'FOR' ? 'votes_for' : voteChoice === 'AGAINST' ? 'votes_against' : 'votes_abstain';
    await db!.prepare(`UPDATE governance_proposals SET ${tallyCol} = ${tallyCol} + ? WHERE id = ?`).run(voteWeight, req.params.proposalId);

    res.json({
      success: true,
      message: 'Vote locked and recorded',
      txHash,
      voteWeight,
      state: 'confirmed',
      retryable: false,
      status: String(proposal.status || 'active'),
    });
  } catch (error: any) {
    console.error(`POST /governance/${req.params.proposalId}/confirm-lock error:`, error);
    res.status(500).json({
      error: 'Failed to confirm vote lock',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

/**
 * POST /api/governance/:proposalId/unlock
 * Unlock governance tokens after voting period
 */
router.post('/governance/:proposalId/unlock', async (req, res) => {
  try {
    const { voterAddress, tokenCategory } = req.body;

    if (!voterAddress) {
      return res.status(400).json({ error: 'Voter address is required' });
    }

    const proposal = await db!.prepare('SELECT * FROM governance_proposals WHERE id = ?').get(req.params.proposalId) as any;
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Load stored vote record to get contract data from confirm-lock
    const voteRecord = await db!.prepare(
      'SELECT * FROM governance_votes WHERE proposal_id = ? AND voter = ?'
    ).get(req.params.proposalId, voterAddress) as any;

    if (!voteRecord) {
      return res.status(404).json({ error: 'No vote record found for this voter and proposal' });
    }

    if (!voteRecord.contract_address) {
      return res.status(400).json({ error: 'Vote lock contract data not recorded — cannot build unlock transaction' });
    }

    const contractAddress: string = voteRecord.contract_address;
    const constructorParams: any[] = voteRecord.constructor_params ? JSON.parse(voteRecord.constructor_params) : [];
    const currentCommitment: string = voteRecord.nft_commitment || '';
    const voteId: string = voteRecord.vote_id || '';
    const lockedStakeAmount = Number(voteRecord.weight || 0);

    if (!Number.isFinite(lockedStakeAmount) || lockedStakeAmount <= 0) {
      return res.status(400).json({ error: 'Stored vote lock amount is invalid' });
    }

    const votingPeriodEnd = Math.floor(new Date(proposal.voting_ends_at).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);

    // Build unlock transaction
    const unlockService = new VoteUnlockService('chipnet');
    const unlockTx = await unlockService.buildUnlockTransaction({
      voteId,
      contractAddress,
      voter: voterAddress,
      stakeAmount: lockedStakeAmount,
      votingPeriodEnd,
      currentTime: now,
      tokenCategory: tokenCategory || '',
      constructorParams,
      currentCommitment,
    });

    res.json({
      success: true,
      unlockTransaction: {
        unlockedAmount: unlockTx.unlockedAmount,
        wcTransaction: serializeWcTransaction(unlockTx.wcTransaction),
      },
    });
  } catch (error: any) {
    console.error(`POST /governance/${req.params.proposalId}/unlock error:`, error);
    res.status(500).json({ error: 'Failed to unlock tokens', message: error.message });
  }
});

/**
 * POST /api/governance/:proposalId/confirm-unlock
 * Confirm token unlock transaction
 */
router.post('/governance/:proposalId/confirm-unlock', async (req, res) => {
  try {
    const { voterAddress, txHash } = req.body;

    if (!voterAddress) {
      return res.status(400).json({ error: 'Voter address is required' });
    }
    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash is required' });
    }

    if (!(await transactionExists(txHash, 'chipnet'))) {
      return res.status(409).json({
        error: 'Transaction hash not found on chipnet',
        message: 'Transaction is not indexed yet. Retry confirmation shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'TX_NOT_FOUND',
      });
    }

    const voteRecord = await db!.prepare(
      'SELECT * FROM governance_votes WHERE proposal_id = ? AND voter = ?'
    ).get(req.params.proposalId, voterAddress) as any;
    if (!voteRecord) {
      return res.status(404).json({ error: 'No vote record found for this voter and proposal' });
    }

    const hasExpectedUnlockOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: voterAddress,
        minimumSatoshis: 546n,
        minimumTokenAmount: BigInt(Math.max(1, Math.trunc(Number(voteRecord.weight || 1)))),
      },
      'chipnet',
    );
    if (!hasExpectedUnlockOutput) {
      return res.status(400).json({
        error: 'Unlock transaction does not include expected voter token return output',
      });
    }

    // Update vote record with unlock tx_hash
    await db!.prepare(`
      UPDATE governance_votes
      SET updated_at = ?
      WHERE proposal_id = ? AND voter = ?
    `).run(new Date().toISOString(), req.params.proposalId, voterAddress);

    res.json({
      success: true,
      message: 'Token unlock confirmed',
      txHash,
      state: 'confirmed',
      retryable: false,
      status: 'UNLOCKED',
    });
  } catch (error: any) {
    console.error(`POST /governance/${req.params.proposalId}/confirm-unlock error:`, error);
    res.status(500).json({
      error: 'Failed to confirm unlock',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

export default router;
