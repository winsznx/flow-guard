/**
 * ApprovalTxBuilder Service
 *
 * PURPOSE: Construct ApproveProposal transactions for M-of-N approval path
 * - Increments proposal approval_count
 * - Transitions status to APPROVED when approval_count reaches required_M
 * - Validates signer is in approver set
 * - Checks proposal not expired
 *
 * ARCHITECTURE:
 * - Uses ProposalCovenant for approval validation
 * - Fetches current ProposalUTXO state from indexer
 * - Constructs unsigned transaction for approver to sign
 * - Returns transaction template for frontend signing
 *
 * TRANSACTION STRUCTURE:
 * - Input[0]: ProposalUTXO (current state)
 * - Output[0]: ProposalUTXO (approval_count++, status updated if threshold reached)
 *
 * COVENANT VALIDATION (ProposalCovenant.approve()):
 * - Signer pubkey is in vault's signerSetHash
 * - approval_count < required_M before increment
 * - Proposal status is SUBMITTED or VOTING
 * - Proposal not expired (current_time < voting_end_timestamp)
 */

import { ElectrumNetworkProvider, Contract, SignatureTemplate } from 'cashscript';
import crypto from 'crypto';
import {
  ProposalState,
  ProposalStatus,
  ProposalUTXO,
} from '@flowguard/shared/types/covenant-types';
import { encodeProposalState } from '@flowguard/shared/utils';

/**
 * ApprovalTxBuilder Configuration
 */
export interface ApprovalTxBuilderConfig {
  network: 'mainnet' | 'chipnet';
  electrumServer: string;
  proposalCovenantArtifact?: any; // Compiled CashScript artifact
}

/**
 * Unsigned Transaction Template
 */
export interface UnsignedTransaction {
  hex: string; // Raw transaction hex
  inputs: Array<{
    txid: string;
    vout: number;
    satoshis: bigint;
  }>;
  outputs: Array<{
    address?: string;
    satoshis: bigint;
    token?: any;
  }>;
}

/**
 * ApproveProposal Input Parameters
 */
export interface ApproveProposalInput {
  proposalId: string; // Proposal UTXO id (txid:vout)
  approverPubkey: Buffer; // Approver's public key (33 bytes compressed)
  vaultAddress: string; // Associated vault address (for signerSetHash verification)
}

/**
 * ApprovalTxBuilder Service
 */
export class ApprovalTxBuilder {
  private config: ApprovalTxBuilderConfig;
  private provider: ElectrumNetworkProvider;

  constructor(config: ApprovalTxBuilderConfig) {
    this.config = config;
    this.provider = new ElectrumNetworkProvider(config.network);
  }

  /**
   * Build ApproveProposal transaction
   *
   * Transaction structure:
   * - Input[0]: ProposalUTXO (current state)
   * - Output[0]: ProposalUTXO (updated state: approval_count++, status updated if threshold reached)
   *
   * State transition:
   * - approval_count: current + 1
   * - status: SUBMITTED → SUBMITTED (if < required_M)
   *           SUBMITTED → APPROVED (if == required_M)
   *           VOTING → VOTING (if < required_M)
   *           VOTING → APPROVED (if == required_M)
   *
   * @param input - ApproveProposal parameters
   * @param currentProposal - Current ProposalUTXO state (from indexer)
   * @returns Unsigned transaction template
   */
  async buildApproveProposalTx(
    input: ApproveProposalInput,
    currentProposal: ProposalUTXO,
  ): Promise<UnsignedTransaction> {
    console.log(`[ApprovalTxBuilder] Building ApproveProposal transaction for ${input.proposalId}`);

    // 1. Validate proposal state
    this.validateProposalForApproval(currentProposal);

    // 2. Decode current ProposalState
    const currentState = currentProposal.state;

    console.log(`[ApprovalTxBuilder]   Current state:`, {
      status: ProposalStatus[currentState.status],
      approvalCount: currentState.approvalCount,
      requiredApprovals: currentState.requiredApprovals,
    });

    // 3. Compute new state (increment approval_count)
    const newApprovalCount = currentState.approvalCount + 1;
    const thresholdReached = newApprovalCount >= currentState.requiredApprovals;
    const newStatus = thresholdReached ? ProposalStatus.APPROVED : currentState.status;

    const newState: ProposalState = {
      ...currentState,
      approvalCount: newApprovalCount,
      status: newStatus,
    };

    console.log(`[ApprovalTxBuilder]   New state:`, {
      status: ProposalStatus[newStatus],
      approvalCount: newApprovalCount,
      thresholdReached,
    });

    // 4. Encode new ProposalState commitment
    const newCommitment = encodeProposalState(newState);

    // 5. Construct transaction
    const tx: UnsignedTransaction = {
      hex: '', // To be filled by CashScript or frontend
      inputs: [
        {
          txid: currentProposal.utxo.txid,
          vout: currentProposal.utxo.vout,
          satoshis: currentProposal.satoshis,
        },
      ],
      outputs: [
        // Output 0: Updated ProposalUTXO
        {
          address: currentProposal.address,
          satoshis: currentProposal.satoshis, // Preserve dust amount
          token: {
            category: currentProposal.token?.category,
            nft: {
              capability: 'none' as const,
              commitment: newCommitment,
            },
          },
        },
      ],
    };

    console.log(`[ApprovalTxBuilder]   ✓ ApproveProposal tx built:`, {
      inputCount: tx.inputs.length,
      outputCount: tx.outputs.length,
      newApprovalCount,
      statusTransition: `${ProposalStatus[currentState.status]} → ${ProposalStatus[newStatus]}`,
    });

    // TODO: Use CashScript SDK to generate actual transaction hex:
    // const contract = Contract.fromArtifact(
    //   this.config.proposalCovenantArtifact,
    //   [...constructorArgs],
    //   this.provider
    // );
    // const unsignedTx = await contract.functions.approve(
    //   approverSig,
    //   approverPubkey
    // ).to(tx.outputs[0]).build();
    // return { hex: unsignedTx.toHex(), ... };

    return tx;
  }

  /**
   * Validate proposal is eligible for approval
   *
   * Checks:
   * - Status is SUBMITTED or VOTING
   * - approval_count < required_M (not already fully approved)
   * - Proposal not expired (current_time < voting_end_timestamp)
   *
   * @param proposal - Current ProposalUTXO
   * @throws Error if proposal cannot be approved
   */
  private validateProposalForApproval(proposal: ProposalUTXO): void {
    const state = proposal.state;
    const currentTime = Math.floor(Date.now() / 1000);

    // Check status
    if (state.status !== ProposalStatus.SUBMITTED && state.status !== ProposalStatus.VOTING) {
      throw new Error(
        `Proposal cannot be approved. Status: ${ProposalStatus[state.status]} (expected SUBMITTED or VOTING)`,
      );
    }

    // Check not already fully approved
    if (state.approvalCount >= state.requiredApprovals) {
      throw new Error(
        `Proposal already has required approvals. Current: ${state.approvalCount}, Required: ${state.requiredApprovals}`,
      );
    }

    // Check not expired
    const votingEnd = Number(state.votingEndTimestamp);
    if (votingEnd > 0 && currentTime >= votingEnd) {
      throw new Error(
        `Proposal expired. Current time: ${currentTime}, Voting end: ${votingEnd}`,
      );
    }

    console.log(`[ApprovalTxBuilder]   ✓ Proposal eligible for approval`);
  }

  /**
   * Verify signer is in approver set
   *
   * Checks if approver's pubkey is in the vault's signerSetHash.
   * This is a pre-validation before constructing the transaction.
   * The covenant will also validate this on-chain.
   *
   * @param approverPubkey - Approver's public key
   * @param vaultSignerSetHash - Vault's signerSetHash (from policy)
   * @param allSigners - All authorized signer pubkeys
   * @returns true if signer is authorized
   */
  verifySigner(
    approverPubkey: Buffer,
    vaultSignerSetHash: Buffer,
    allSigners: Buffer[],
  ): boolean {
    // Compute signerSetHash from all signers
    const computedHash = this.computeSignerSetHash(allSigners);

    // Verify it matches vault's signerSetHash
    if (!computedHash.equals(vaultSignerSetHash)) {
      throw new Error('Signer set hash mismatch');
    }

    // Check if approverPubkey is in allSigners
    const isAuthorized = allSigners.some((signer) => signer.equals(approverPubkey));

    if (!isAuthorized) {
      throw new Error(
        `Approver pubkey not in authorized signer set: ${approverPubkey.toString('hex')}`,
      );
    }

    console.log(`[ApprovalTxBuilder]   ✓ Signer authorized`);
    return true;
  }

  private computeSignerSetHash(pubkeys: Buffer[]): Buffer {
    const concatenated = Buffer.concat(pubkeys);
    return crypto.createHash('sha256').update(concatenated).digest();
  }
}

export default ApprovalTxBuilder;
