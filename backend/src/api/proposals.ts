import { Router } from 'express';
import { ProposalService } from '../services/proposalService.js';
import { CreateProposalDto, ApproveProposalDto } from '../models/Proposal.js';
import db from '../database/schema.js';
import { VaultService } from '../services/vaultService.js';
import { serializeWcTransaction } from '../utils/wcSerializer.js';
import { transactionExists, transactionHasExpectedOutput } from '../utils/txVerification.js';
import { TransactionService } from '../services/transactionService.js';

const router = Router();

type ProposalExecutionSessionRow = {
  id: string;
  proposal_id: string;
  vault_id: string;
  signer_addresses: string;
  signer_pubkeys: string;
  signed_by: string;
  required_signatures: number;
  tx_hex: string;
  source_outputs: string;
  status: string;
  broadcast_tx_hash?: string | null;
};

function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

// Get all proposals (for stats/dashboard)
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM proposals';
    const params: any[] = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(String(status).toLowerCase());
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const rows = await db.prepare(query).all(...params) as any[];
    const proposals = rows.map((row: any) => ({
      id: row.id,
      vaultId: row.vault_id,
      proposalId: row.proposal_id,
      recipient: row.recipient,
      amount: row.amount,
      reason: row.reason,
      status: row.status,
      approvalCount: row.approval_count,
      approvals: JSON.parse(row.approvals),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      executedAt: row.executed_at ? new Date(row.executed_at) : undefined,
      txHash: row.tx_hash,
      contractAddress: row.contract_address || undefined,
    }));

    res.json({
      proposals,
      total: proposals.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create proposal
router.post('/vaults/:vaultId/proposals', async (req, res) => {
  try {
    const dto: CreateProposalDto = {
      vaultId: req.params.vaultId,
      ...req.body,
    };
    const creator = req.headers['x-user-address'] as string || 'unknown';

    const proposal = await ProposalService.createProposal(dto, creator);
    res.status(201).json(proposal);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// List proposals for a vault
router.get('/vaults/:vaultId/proposals', async (req, res) => {
  try {
    const proposals = await ProposalService.getVaultProposals(req.params.vaultId);
    res.json(proposals);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get proposal by ID
router.get('/:id', async (req, res) => {
  try {
    const proposal = await ProposalService.getProposalById(req.params.id);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    res.json(proposal);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Approve proposal
router.post('/:id/approve', async (req, res) => {
  try {
    const dto: ApproveProposalDto = {
      proposalId: req.params.id,
      approver: req.headers['x-user-address'] as string || 'unknown',
    };

    const proposal = await ProposalService.approveProposal(dto);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found or not approvable' });
    }
    res.json(proposal);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create on-chain proposal transaction
router.post('/:id/create-onchain', async (req, res) => {
  try {
    const proposalId = req.params.id as string;
    const funderAddress = ((req.headers['x-user-address'] as string) || req.body?.funderAddress || '').trim();
    if (!funderAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const proposal = await ProposalService.getProposalById(proposalId);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const built = await ProposalService.createOnChainProposalFundingTransaction(proposalId, funderAddress);
    const serialized = serializeWcTransaction(built.wcTransaction);

    await db.prepare(`
      UPDATE proposals
      SET contract_address = ?, constructor_params = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      built.proposalContractAddress,
      JSON.stringify(built.constructorParamsSerialized),
      proposalId,
    );

    return res.json({
      success: true,
      proposalContractAddress: built.proposalContractAddress,
      tokenCategory: built.tokenCategory,
      fundingSatoshis: built.fundingSatoshis.toString(),
      wcTransaction: serialized,
    });
  } catch (error: any) {
    console.error('POST /proposals/:id/create-onchain error:', error);
    return res.status(500).json({ error: error.message || 'Failed to build proposal creation transaction' });
  }
});

// Create on-chain approval transaction
router.post('/:id/approve-onchain', async (req, res) => {
  try {
    const proposalId = req.params.id as string;
    const signerAddress = ((req.headers['x-user-address'] as string) || req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const proposal = await ProposalService.getProposalById(proposalId);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const built = await ProposalService.createApproveProposalWcTransaction(proposalId, signerAddress);
    const serialized = serializeWcTransaction(built.wcTransaction);

    return res.json({
      success: true,
      proposalContractAddress: built.proposalContractAddress,
      newApprovalCount: built.newApprovalCount,
      isApproved: built.isApproved,
      wcTransaction: serialized,
    });
  } catch (error: any) {
    console.error('POST /proposals/:id/approve-onchain error:', error);
    return res.status(500).json({ error: error.message || 'Failed to build proposal approval transaction' });
  }
});

router.post('/:id/confirm-create', async (req, res) => {
  try {
    const proposalId = req.params.id as string;
    const { txHash } = req.body as { txHash?: string };
    if (!txHash) {
      return res.status(400).json({ error: 'txHash is required' });
    }

    const proposal = await ProposalService.getProposalById(proposalId);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    if (!proposal.contractAddress) {
      return res.status(400).json({ error: 'Proposal contract address missing; build create-onchain transaction first' });
    }

    const network = (process.env.BCH_NETWORK as 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet') || 'chipnet';
    if (!(await transactionExists(txHash, network))) {
      return res.status(409).json({
        error: 'Transaction hash not found on blockchain',
        message: 'Transaction is not indexed yet. Retry confirmation shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'TX_NOT_FOUND',
      });
    }

    const hasExpectedOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: proposal.contractAddress,
        minimumSatoshis: 546n,
        requireNft: true,
        requiredNftCapability: 'mutable',
        minimumNftCommitmentBytes: 40,
      },
      network,
    );
    if (!hasExpectedOutput) {
      return res.status(400).json({
        error: 'Proposal creation transaction does not include the expected covenant NFT output',
      });
    }

    await db.prepare(`
      UPDATE proposals
      SET tx_hash = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(txHash, 'pending', proposalId);

    await TransactionService.recordTransaction(txHash, 'proposal', {
      vaultId: proposal.vaultId,
      proposalId: proposal.id,
      amount: proposal.amount,
      toAddress: proposal.contractAddress,
    });

    const updated = await ProposalService.getProposalById(proposalId);
    return res.json({
      success: true,
      proposal: updated,
      txHash,
      state: 'confirmed',
      retryable: false,
      status: updated?.status || 'pending',
    });
  } catch (error: any) {
    console.error('POST /proposals/:id/confirm-create error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to confirm proposal creation',
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

router.post('/:id/confirm-approval', async (req, res) => {
  try {
    const proposalId = req.params.id as string;
    const signerAddress = ((req.headers['x-user-address'] as string) || req.body?.signerAddress || '').trim();
    const { txHash } = req.body as { txHash?: string };
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }
    if (!txHash) {
      return res.status(400).json({ error: 'txHash is required' });
    }

    const proposal = await ProposalService.getProposalById(proposalId);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    if (!proposal.contractAddress) {
      return res.status(400).json({ error: 'Proposal has no on-chain contract address' });
    }

    const network = (process.env.BCH_NETWORK as 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet') || 'chipnet';
    if (!(await transactionExists(txHash, network))) {
      return res.status(409).json({
        error: 'Transaction hash not found on blockchain',
        message: 'Transaction is not indexed yet. Retry confirmation shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'TX_NOT_FOUND',
      });
    }

    const hasExpectedOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: proposal.contractAddress,
        minimumSatoshis: 546n,
        requireNft: true,
        requiredNftCapability: 'mutable',
        minimumNftCommitmentBytes: 40,
      },
      network,
    );
    if (!hasExpectedOutput) {
      return res.status(400).json({
        error: 'Approval transaction does not include expected proposal covenant state output',
      });
    }

    const updatedProposal = await ProposalService.approveProposal({
      proposalId,
      approver: signerAddress,
    });
    if (!updatedProposal) {
      return res.status(409).json({ error: 'Proposal cannot be approved in its current state' });
    }

    await TransactionService.recordTransaction(txHash, 'approve', {
      vaultId: updatedProposal.vaultId,
      proposalId: updatedProposal.id,
      amount: updatedProposal.amount,
      fromAddress: signerAddress,
      toAddress: updatedProposal.contractAddress,
    });

    return res.json({
      success: true,
      proposal: updatedProposal,
      txHash,
      state: 'confirmed',
      retryable: false,
      status: updatedProposal.status,
    });
  } catch (error: any) {
    console.error('POST /proposals/:id/confirm-approval error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to confirm approval transaction',
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

async function handleExecuteProposal(req: any, res: any): Promise<any> {
  try {
    const proposalId = req.params.id as string;
    const signerAddress = ((req.headers['x-user-address'] as string) || req.body?.signerAddress || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required for execute signing' });
    }

    const proposal = await ProposalService.getProposalById(proposalId);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    if (proposal.status !== 'approved') {
      return res.status(400).json({ error: 'Proposal must be approved before execution signing' });
    }

    const vault = await VaultService.getVaultByVaultId(proposal.vaultId);
    if (!vault || !vault.contractAddress || !vault.signerPubkeys) {
      return res.status(400).json({ error: 'Vault is missing contract configuration for on-chain execution' });
    }

    const signerEntries = vault.signers
      .map((address, index) => ({ address, pubkey: vault.signerPubkeys?.[index] }))
      .filter((entry): entry is { address: string; pubkey: string } => Boolean(entry.pubkey));

    const signerEntry = signerEntries.find(
      (entry) => entry.address.toLowerCase() === signerAddress.toLowerCase(),
    );
    if (!signerEntry) {
      return res.status(403).json({ error: 'Only vault signers can participate in payout execution signing' });
    }

    const existingSession = await db.prepare(
      `SELECT * FROM proposal_execution_sessions
       WHERE proposal_id = ? AND status = 'pending'
       ORDER BY created_at DESC
       LIMIT 1`,
    ).get(proposalId) as ProposalExecutionSessionRow | undefined;

    if (existingSession) {
      const requiredSignerAddresses = parseJsonArray<string>(existingSession.signer_addresses);
      if (!requiredSignerAddresses.some((addr) => addr.toLowerCase() === signerAddress.toLowerCase())) {
        return res.status(403).json({
          error: 'This execute session requires signatures from a different signer pair',
          requiredSignerAddresses,
        });
      }

      const signedBy = parseJsonArray<string>(existingSession.signed_by);
      const sourceOutputs = parseJsonArray<any>(existingSession.source_outputs);
      return res.json({
        success: true,
        sessionId: existingSession.id,
        wcTransaction: {
          transaction: existingSession.tx_hex,
          sourceOutputs,
          broadcast: false,
          userPrompt: `Sign treasury payout for proposal #${proposal.proposalId}`,
        },
        signaturesCollected: signedBy.length,
        requiredSignatures: existingSession.required_signatures,
        requiredSignerAddresses,
        requiredSignerPubkeys: parseJsonArray<string>(existingSession.signer_pubkeys),
      });
    }

    // Select signer pair: requester + another approved signer when available.
    const approvedSet = new Set((proposal.approvals || []).map((addr) => addr.toLowerCase()));
    const secondSigner = signerEntries.find(
      (entry) =>
        entry.address.toLowerCase() !== signerAddress.toLowerCase() &&
        approvedSet.has(entry.address.toLowerCase()),
    ) || signerEntries.find(
      (entry) => entry.address.toLowerCase() !== signerAddress.toLowerCase(),
    );

    if (!secondSigner) {
      return res.status(400).json({ error: 'At least two signer keys are required to execute a payout' });
    }

    const signerPubkeys = [signerEntry.pubkey, secondSigner.pubkey];
    const signerAddresses = [signerEntry.address, secondSigner.address];
    const executeTx = await ProposalService.createExecutePayoutTransaction(proposalId, signerPubkeys);
    const serialized = serializeWcTransaction(executeTx.wcTransaction);
    const sessionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    await db.prepare(
      `INSERT INTO proposal_execution_sessions (
         id, proposal_id, vault_id, signer_addresses, signer_pubkeys, signed_by,
         required_signatures, tx_hex, source_outputs, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    ).run(
      sessionId,
      proposalId,
      proposal.vaultId,
      JSON.stringify(signerAddresses),
      JSON.stringify(signerPubkeys),
      JSON.stringify([]),
      2,
      serialized.transaction,
      JSON.stringify(serialized.sourceOutputs),
    );

    return res.json({
      success: true,
      sessionId,
      wcTransaction: {
        ...serialized,
        broadcast: false,
      },
      signaturesCollected: 0,
      requiredSignatures: 2,
      requiredSignerAddresses: signerAddresses,
      requiredSignerPubkeys: signerPubkeys,
      payoutSatoshis: executeTx.payoutSatoshis.toString(),
    });
  } catch (error: any) {
    console.error('POST /proposals/:id/execute error:', error);
    return res.status(500).json({ error: error.message || 'Failed to build execute transaction' });
  }
}

// Create execute payout transaction (legacy route)
router.post('/:id/execute-onchain', handleExecuteProposal);

// Create execute payout transaction (preferred route)
router.post('/:id/execute', handleExecuteProposal);

// Submit a partially signed execute transaction.
// Once the required signature count is reached, backend broadcasts and marks proposal executed.
router.post('/:id/execute-signature', async (req, res) => {
  try {
    const proposalId = req.params.id;
    const signerAddress = ((req.headers['x-user-address'] as string) || req.body?.signerAddress || '').trim();
    const { sessionId, signedTransaction } = req.body as { sessionId?: string; signedTransaction?: string };

    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }
    if (!sessionId || !signedTransaction) {
      return res.status(400).json({ error: 'sessionId and signedTransaction are required' });
    }

    const session = await db.prepare(
      `SELECT * FROM proposal_execution_sessions
       WHERE id = ? AND proposal_id = ? AND status = 'pending'
       LIMIT 1`,
    ).get(sessionId, proposalId) as ProposalExecutionSessionRow | undefined;

    if (!session) {
      return res.status(404).json({
        error: 'Active execute signing session not found',
        state: 'failed',
        retryable: false,
        errorCode: 'EXECUTION_SESSION_NOT_FOUND',
      });
    }

    const requiredSignerAddresses = parseJsonArray<string>(session.signer_addresses);
    if (!requiredSignerAddresses.some((addr) => addr.toLowerCase() === signerAddress.toLowerCase())) {
      return res.status(403).json({
        error: 'Signer is not part of this execute session',
        state: 'failed',
        retryable: false,
        errorCode: 'EXECUTION_SIGNER_NOT_ALLOWED',
      });
    }

    const signedBy = parseJsonArray<string>(session.signed_by);
    if (signedBy.some((addr) => addr.toLowerCase() === signerAddress.toLowerCase())) {
      return res.status(409).json({
        error: 'This signer already submitted a signature for the current session',
        signaturesCollected: signedBy.length,
        requiredSignatures: session.required_signatures,
        state: 'failed',
        retryable: false,
        errorCode: 'SIGNATURE_ALREADY_SUBMITTED',
      });
    }

    const updatedSignedBy = [...signedBy, signerAddress];
    const signaturesCollected = updatedSignedBy.length;

    await db.prepare(
      `UPDATE proposal_execution_sessions
       SET tx_hex = ?, signed_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(signedTransaction, JSON.stringify(updatedSignedBy), sessionId);

    if (signaturesCollected < session.required_signatures) {
      const remainingSigners = requiredSignerAddresses.filter(
        (addr) => !updatedSignedBy.some((signed) => signed.toLowerCase() === addr.toLowerCase()),
      );
      return res.json({
        success: true,
        pending: true,
        state: 'pending',
        retryable: false,
        sessionId,
        signaturesCollected,
        requiredSignatures: session.required_signatures,
        remainingSigners,
      });
    }

    const { ContractService } = await import('../services/contract-service.js');
    const contractService = new ContractService('chipnet');
    const txid = await contractService.broadcastTransaction(signedTransaction);

    await ProposalService.markProposalExecuted(proposalId, txid);
    await db.prepare(
      `UPDATE proposal_execution_sessions
       SET status = 'completed', broadcast_tx_hash = ?, tx_hex = ?, signed_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(txid, signedTransaction, JSON.stringify(updatedSignedBy), sessionId);

    return res.json({
      success: true,
      pending: false,
      state: 'confirmed',
      retryable: false,
      txid,
      txHash: txid,
      signaturesCollected,
      requiredSignatures: session.required_signatures,
    });
  } catch (error: any) {
    console.error('POST /proposals/:id/execute-signature error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to submit execute signature',
      state: 'failed',
      retryable: false,
      errorCode: 'EXECUTE_SIGNATURE_FAILED',
    });
  }
});

// Broadcast signed transaction
router.post('/broadcast', async (req, res) => {
  try {
    const { txHex, txType, vaultId, proposalId, amount, fromAddress, toAddress } = req.body;

    if (!txHex) {
      return res.status(400).json({ error: 'txHex is required' });
    }

    // Import ContractService
    const { ContractService } = await import('../services/contract-service.js');
    const contractService = new ContractService('chipnet');

    // Broadcast the signed transaction
    const txid = await contractService.broadcastTransaction(txHex);

    // Record transaction in database
    if (txType) {
      const { TransactionService } = await import('../services/transactionService.js');
      await TransactionService.recordTransaction(txid, txType, {
        vaultId,
        proposalId,
        amount,
        fromAddress,
        toAddress,
      });
    }

    res.json({ txid, success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
