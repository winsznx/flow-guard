import { resolveBchNetwork } from '../utils/network.js';
import { Router, type Request, type Response } from 'express';
import {
  decodeTransaction,
  decodeAuthenticationInstructions,
  cashAddressToLockingBytecode,
  hash160,
  hexToBin,
  binToHex,
} from '@bitauth/libauth';
import { ElectrumNetworkProvider } from 'cashscript';
import { ProposalService } from '../services/proposalService.js';
import { CreateProposalDto, ApproveProposalDto, ProposalStatus } from '../models/Proposal.js';
import db from '../database/schema.js';
import { VaultService } from '../services/vaultService.js';
import { serializeWcTransaction } from '../utils/wcSerializer.js';
import { mergeMultisigSignatures } from '../utils/multisigMerge.js';
import { transactionExists, transactionHasExpectedOutput } from '../utils/txVerification.js';
import { TransactionService, type TransactionRecord } from '../services/transactionService.js';
import { requireWalletAuth, callerAddress} from '../middleware/auth.js';
import { uuidParam } from '../middleware/errorHandler.js';

const router = Router();
router.param('id', uuidParam);

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
  signed_payloads: string;
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

// Structural fingerprint of a signed tx (inputs/outputs/locktime, excluding witness data)
// used to detect substitution attacks across signers of the same session. Null on malformed hex.
function txStructuralFingerprint(txHex: string): string | null {
  try {
    const decoded = decodeTransaction(hexToBin(txHex));
    if (typeof decoded === 'string') return null;
    const inputs = decoded.inputs.map((input) => ({
      outpointHash: binToHex(input.outpointTransactionHash),
      outpointIndex: input.outpointIndex,
      sequence: input.sequenceNumber,
    }));
    const outputs = decoded.outputs.map((output) => ({
      bytecode: binToHex(output.lockingBytecode),
      value: output.valueSatoshis.toString(),
      tokenCategory: output.token?.category ? binToHex(output.token.category) : null,
      tokenAmount: output.token?.amount != null ? output.token.amount.toString() : null,
      nftCommitment: output.token?.nft?.commitment ? binToHex(output.token.nft.commitment) : null,
      nftCapability: output.token?.nft?.capability ?? null,
    }));
    return JSON.stringify({
      version: decoded.version,
      locktime: decoded.locktime,
      inputs,
      outputs,
    });
  } catch {
    return null;
  }
}

/**
 * True when some input pushes a 33-byte pubkey whose hash160 matches the P2PKH
 * address. ProposalCovenant.approve(sig, pubkey) pushes the approver's pubkey, so
 * this ties an approval tx to the signer that made it.
 */
export function txPushesPubkeyForAddress(txHex: string, address: string): boolean {
  const locking = cashAddressToLockingBytecode(address);
  if (typeof locking === 'string') return false;
  const b = locking.bytecode;
  const isP2pkh = b.length === 25 && b[0] === 0x76 && b[1] === 0xa9 && b[2] === 0x14 && b[23] === 0x88 && b[24] === 0xac;
  if (!isP2pkh) return false;
  const expectedHash = binToHex(b.slice(3, 23));

  const decoded = decodeTransaction(hexToBin(txHex));
  if (typeof decoded === 'string') return false;
  return decoded.inputs.some((input) =>
    decodeAuthenticationInstructions(input.unlockingBytecode).some((instruction) => {
      const data = (instruction as { data?: Uint8Array }).data;
      return data?.length === 33 && binToHex(hash160(data)) === expectedHash;
    }),
  );
}

// Get all proposals (for stats/dashboard)
router.get('/proposals', async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM proposals WHERE status <> ?';
    const params: any[] = [ProposalStatus.ABANDONED];

    if (status) {
      query += ' AND status = ?';
      params.push(String(status).toLowerCase());
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const rows = await db.prepare(query).all(...params) as any[];
    // Unauthenticated and spans private vaults: same fields as the explorer feed, no reason/approvals.
    const proposals = rows.map((row: any) => ({
      id: row.id,
      vaultId: row.vault_id,
      proposalId: row.proposal_id,
      recipient: row.recipient,
      amount: row.amount,
      status: row.status,
      approvalCount: row.approval_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      executedAt: row.executed_at ? new Date(row.executed_at) : undefined,
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
router.post('/vaults/:vaultId/proposals', requireWalletAuth, async (req, res) => {
  try {
    // Proposals are keyed by the vault's DB id; the URL may carry either id form.
    const vault = await VaultService.getVaultByVaultId(req.params.vaultId);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }
    const creator = req.verifiedUser!.address;
    if (!VaultService.isCreator(vault, creator) && !VaultService.isSigner(vault, creator)) {
      return res.status(403).json({
        error: 'Only this treasury\'s creator or signers can create its requests',
        errorCode: 'NOT_VAULT_MEMBER',
      });
    }
    const dto: CreateProposalDto = {
      ...req.body,
      vaultId: vault.id,
    };

    const proposal = await ProposalService.createProposal(dto, creator);
    res.status(201).json(proposal);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// List proposals for a vault
router.get('/vaults/:vaultId/proposals', async (req, res) => {
  try {
    const vault = await VaultService.getVaultByVaultId(req.params.vaultId);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }
    if (!VaultService.canViewVault(vault, callerAddress(req) || '')) {
      return res.status(403).json({ error: 'Access denied: This vault is private' });
    }
    const proposals = await ProposalService.getVaultProposals(vault);
    res.json(proposals);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get proposal by ID
router.get('/proposals/:id', async (req, res) => {
  try {
    const proposal = await ProposalService.getProposalById(req.params.id);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    const vault = await VaultService.getVaultByVaultId(proposal.vaultId);
    if (vault && !VaultService.canViewVault(vault, callerAddress(req) || '')) {
      return res.status(403).json({ error: 'Access denied: This vault is private' });
    }
    res.json(proposal);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Abandon a request whose on-chain create was rejected or never broadcast, so the
// vault isn't left with a pending row and a pending state bit. Creator only. The row
// is kept as ABANDONED; a later confirm-create for it brings it back.
router.delete('/proposals/:id', requireWalletAuth, async (req, res) => {
  try {
    const proposal = await ProposalService.getProposalById(req.params.id as string);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    if (!proposal.creator || proposal.creator.toLowerCase() !== req.verifiedUser!.address.toLowerCase()) {
      return res.status(403).json({
        error: 'Only the wallet that created this request can remove it',
        errorCode: 'NOT_PROPOSAL_CREATOR',
      });
    }
    if (proposal.status === ProposalStatus.ABANDONED) {
      return res.json({ success: true, id: proposal.id });
    }
    if (proposal.status !== ProposalStatus.PENDING || proposal.txHash || proposal.approvalCount > 0) {
      return res.status(409).json({
        error: 'This request is already on chain and can no longer be removed',
        errorCode: 'PROPOSAL_ON_CHAIN',
      });
    }
    // create-onchain saves the covenant address before the wallet signs, so an address
    // alone doesn't mean it was funded. Coins at it do, even if confirm-create never ran.
    if (proposal.contractAddress) {
      let fundedUtxos: number;
      try {
        fundedUtxos = (await new ElectrumNetworkProvider(resolveBchNetwork()).getUtxos(proposal.contractAddress)).length;
      } catch (error) {
        console.error('DELETE /proposals/:id UTXO lookup failed:', error);
        return res.status(503).json({
          error: 'Could not check the request on chain. Try again shortly.',
          retryable: true,
          errorCode: 'CHAIN_UNAVAILABLE',
        });
      }
      if (fundedUtxos > 0) {
        return res.status(409).json({
          error: 'This request was already funded on chain and can no longer be removed',
          errorCode: 'PROPOSAL_ON_CHAIN',
        });
      }
    }

    if (!(await ProposalService.abandonPendingProposal(proposal))) {
      return res.status(409).json({
        error: 'This request changed while removing it. Reload and try again.',
        errorCode: 'PROPOSAL_ON_CHAIN',
      });
    }
    return res.json({ success: true, id: proposal.id });
  } catch (error: any) {
    console.error('DELETE /proposals/:id error:', error);
    return res.status(500).json({ error: error.message || 'Failed to remove proposal' });
  }
});

// Approve proposal
router.post('/proposals/:id/approve', requireWalletAuth, async (req, res) => {
  try {
    const dto: ApproveProposalDto = {
      proposalId: req.params.id,
      approver: callerAddress(req) || 'unknown',
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
router.post('/proposals/:id/create-onchain', requireWalletAuth, async (req, res) => {
  try {
    const proposalId = req.params.id as string;
    const funderAddress = req.verifiedUser!.address;

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
router.post('/proposals/:id/approve-onchain', requireWalletAuth, async (req, res) => {
  try {
    const proposalId = req.params.id as string;
    const signerAddress = req.verifiedUser!.address;

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

function isRecordedFor(
  recorded: TransactionRecord,
  proposalId: string,
  txType: TransactionRecord['txType'],
): boolean {
  return recorded.proposalId === proposalId && recorded.txType === txType;
}

router.post('/proposals/:id/confirm-create', requireWalletAuth, async (req, res) => {
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
    if (proposal.txHash && proposal.txHash !== txHash) {
      return res.status(409).json({
        error: 'This request was already confirmed with a different transaction',
        state: 'failed',
        retryable: false,
        errorCode: 'PROPOSAL_ALREADY_CONFIRMED',
      });
    }
    // The broadcast route records the tx under this proposal before confirm runs,
    // so only a row recorded for another proposal or step is a replay.
    const recordedTx = await TransactionService.getTransactionByHash(txHash);
    if (recordedTx && !isRecordedFor(recordedTx, proposal.id, 'proposal')) {
      return res.status(409).json({
        error: 'This transaction has already been recorded',
        state: 'failed',
        retryable: false,
        errorCode: 'TX_ALREADY_RECORDED',
      });
    }

    const network = resolveBchNetwork();
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
    `).run(txHash, ProposalStatus.PENDING, proposalId);

    if (!recordedTx) {
      await TransactionService.recordTransaction(txHash, 'proposal', {
        vaultId: proposal.vaultId,
        proposalId: proposal.id,
        amount: proposal.amount,
        toAddress: proposal.contractAddress,
      });
    }

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

router.post('/proposals/:id/confirm-approval', requireWalletAuth, async (req, res) => {
  try {
    const proposalId = req.params.id as string;
    const signerAddress = callerAddress(req);
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
    const recordedTx = await TransactionService.getTransactionByHash(txHash);
    if (recordedTx && !isRecordedFor(recordedTx, proposal.id, 'approve')) {
      return res.status(409).json({
        error: 'This transaction has already been recorded',
        state: 'failed',
        retryable: false,
        errorCode: 'TX_ALREADY_RECORDED',
      });
    }

    const network = resolveBchNetwork();
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
    const approvalTxHex = await new ElectrumNetworkProvider(network).getRawTransaction(txHash);
    if (!txPushesPubkeyForAddress(approvalTxHex, signerAddress)) {
      return res.status(403).json({
        error: 'Approval transaction was not signed by the authenticated wallet',
        state: 'failed',
        retryable: false,
        errorCode: 'APPROVER_MISMATCH',
      });
    }

    const updatedProposal = await ProposalService.approveProposal({
      proposalId,
      approver: signerAddress,
    });
    if (!updatedProposal) {
      return res.status(409).json({ error: 'Proposal cannot be approved in its current state' });
    }

    if (!recordedTx) {
      await TransactionService.recordTransaction(txHash, 'approve', {
        vaultId: updatedProposal.vaultId,
        proposalId: updatedProposal.id,
        amount: updatedProposal.amount,
        fromAddress: signerAddress,
        toAddress: updatedProposal.contractAddress,
      });
    }

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
    const signerAddress = callerAddress(req);
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
router.post('/proposals/:id/execute-onchain', requireWalletAuth, handleExecuteProposal);

// Create execute payout transaction (preferred route)
router.post('/proposals/:id/execute', requireWalletAuth, handleExecuteProposal);

// Submit a partially signed execute transaction.
// Once the required signature count is reached, backend broadcasts and marks proposal executed.
router.post('/proposals/:id/execute-signature', requireWalletAuth, async (req, res) => {
  try {
    const proposalId = req.params.id;
    // Identity comes from the verified wallet-auth proof, not from body headers.
    const signerAddress = req.verifiedUser!.address;
    const { sessionId, signedTransaction } = req.body as { sessionId?: string; signedTransaction?: string };

    if (!sessionId || !signedTransaction) {
      return res.status(400).json({ error: 'sessionId and signedTransaction are required' });
    }

    // Every signer must submit a tx whose structural fingerprint matches the canonical template,
    // preventing a malicious signer from substituting a different payload with a reused signature.
    const submittedFingerprint = txStructuralFingerprint(signedTransaction);
    if (!submittedFingerprint) {
      return res.status(400).json({
        error: 'signedTransaction is not a decodable BCH transaction hex',
        state: 'failed',
        retryable: false,
        errorCode: 'EXECUTION_TX_DECODE_FAILED',
      });
    }

    // Read-modify-write of the session row must be atomic across concurrent signer submissions;
    // FOR UPDATE inside withTransaction serializes them so the loser re-reads the updated state.
    const result = await db.withTransaction(async (client) => {
      const sessionResult = await client.query<ProposalExecutionSessionRow>(
        `SELECT * FROM proposal_execution_sessions
         WHERE id = $1 AND proposal_id = $2 AND status = 'pending'
         LIMIT 1
         FOR UPDATE`,
        [sessionId, proposalId],
      );
      const session = sessionResult.rows[0];
      if (!session) {
        return {
          status: 404,
          body: {
            error: 'Active execute signing session not found',
            state: 'failed',
            retryable: false,
            errorCode: 'EXECUTION_SESSION_NOT_FOUND',
          },
        };
      }

      const requiredSignerAddresses = parseJsonArray<string>(session.signer_addresses);
      if (!requiredSignerAddresses.some((addr) => addr.toLowerCase() === signerAddress.toLowerCase())) {
        return {
          status: 403,
          body: {
            error: 'Signer is not part of this execute session',
            state: 'failed',
            retryable: false,
            errorCode: 'EXECUTION_SIGNER_NOT_ALLOWED',
          },
        };
      }

      const signedBy = parseJsonArray<string>(session.signed_by);
      if (signedBy.some((addr) => addr.toLowerCase() === signerAddress.toLowerCase())) {
        return {
          status: 409,
          body: {
            error: 'This signer already submitted a signature for the current session',
            signaturesCollected: signedBy.length,
            requiredSignatures: session.required_signatures,
            state: 'failed',
            retryable: false,
            errorCode: 'SIGNATURE_ALREADY_SUBMITTED',
          },
        };
      }

      // Compare submitted tx structure against the canonical session template.
      // The session.tx_hex was set at session creation by ProposalService
      // (the unsigned wcTransaction hex) and never overwritten by signers
      // post-fix. If any signer's submission has a different structure, refuse.
      const canonicalFingerprint = txStructuralFingerprint(session.tx_hex);
      if (!canonicalFingerprint) {
        return {
          status: 500,
          body: {
            error: 'Canonical session transaction is unreadable',
            state: 'failed',
            retryable: false,
            errorCode: 'EXECUTION_SESSION_CORRUPT',
          },
        };
      }
      if (canonicalFingerprint !== submittedFingerprint) {
        return {
          status: 409,
          body: {
            error: 'Submitted transaction does not match the session template',
            message:
              'Signers must sign the canonical transaction the backend prepared at session creation. '
              + 'Re-fetch the session and sign the template returned by /execute.',
            state: 'failed',
            retryable: false,
            errorCode: 'EXECUTION_TX_STRUCTURE_MISMATCH',
          },
        };
      }

      const updatedSignedBy = [...signedBy, signerAddress];
      const signaturesCollected = updatedSignedBy.length;

      // Persist this signer's *witness-bearing* tx hex into a per-signer column
      // (`signed_payloads`) keyed by address. The canonical tx_hex is NOT
      // overwritten; broadcast assembly uses the per-signer payloads.
      const signedPayloads: Record<string, string> = (() => {
        try {
          const raw = (session as ProposalExecutionSessionRow & { signed_payloads?: string }).signed_payloads;
          return raw ? (JSON.parse(raw) as Record<string, string>) : {};
        } catch {
          return {};
        }
      })();
      signedPayloads[signerAddress.toLowerCase()] = signedTransaction;

      await client.query(
        `UPDATE proposal_execution_sessions
         SET signed_by = $1, signed_payloads = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [JSON.stringify(updatedSignedBy), JSON.stringify(signedPayloads), sessionId],
      );

      return {
        status: 200,
        body: null,
        nextState: {
          updatedSignedBy,
          signaturesCollected,
          requiredSignerAddresses,
          requiredSignatures: session.required_signatures,
          // Each wallet fills every signature slot with its own signature, so the
          // broadcast tx takes each slot's signature from the copy signed by that slot's key.
          finalTransaction: signaturesCollected >= session.required_signatures
            ? mergeMultisigSignatures(
              String(parseJsonArray<{ unlockingBytecode?: string }>(session.source_outputs)[0]?.unlockingBytecode ?? ''),
              parseJsonArray<string>(session.signer_addresses).map((address, index) => ({
                pubkey: parseJsonArray<string>(session.signer_pubkeys)[index],
                transactionHex: signedPayloads[address.toLowerCase()] ?? '',
              })).filter((entry) => entry.transactionHex),
            )
            : null,
        } as const,
      };
    });

    if (result.body) {
      return res.status(result.status).json(result.body);
    }

    const { updatedSignedBy, signaturesCollected, requiredSignerAddresses, requiredSignatures, finalTransaction } = result.nextState!;

    if (signaturesCollected < requiredSignatures) {
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
        requiredSignatures,
        remainingSigners,
      });
    }

    const { ContractService } = await import('../services/contract-service.js');
    const contractService = new ContractService(resolveBchNetwork());
    let txid: string;
    try {
      txid = await contractService.broadcastTransaction(finalTransaction!);
    } catch (broadcastError: any) {
      // Close the session so the signers can start a fresh one instead of being stuck at 2 of 2.
      await db.prepare(
        `UPDATE proposal_execution_sessions SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).run(sessionId);
      return res.status(502).json({
        error: broadcastError?.message || 'The payout transaction was rejected by the network',
        state: 'failed',
        retryable: true,
        errorCode: 'EXECUTION_BROADCAST_FAILED',
      });
    }

    await ProposalService.markProposalExecuted(proposalId, txid);
    await db.prepare(
      `UPDATE proposal_execution_sessions
       SET status = 'completed', broadcast_tx_hash = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(txid, sessionId);

    return res.json({
      success: true,
      pending: false,
      state: 'confirmed',
      retryable: false,
      txid,
      txHash: txid,
      signaturesCollected,
      requiredSignatures,
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
// Gated behind wallet-ownership proof: without auth this endpoint was a public
// BCH relay and let anyone poison the transactions index under any vault/proposal ID.
router.post('/broadcast', requireWalletAuth, async (req, res) => {
  try {
    const { txHex, txType, vaultId, proposalId, amount, toAddress } = req.body;

    if (!txHex) {
      return res.status(400).json({ error: 'txHex is required' });
    }

    // fromAddress is always bound to the authenticated signer — never accept
    // a client-supplied value since it becomes part of the audit trail.
    const fromAddress = req.verifiedUser!.address;

    // Import ContractService
    const { ContractService } = await import('../services/contract-service.js');
    const contractService = new ContractService(resolveBchNetwork());

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
