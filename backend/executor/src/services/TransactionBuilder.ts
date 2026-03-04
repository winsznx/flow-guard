/**
 * TransactionBuilder Service
 *
 * PURPOSE: Construct valid covenant transaction templates
 * - Build schedule unlock transactions
 * - Build proposal execution transactions
 * - Validate covenant compliance before broadcast
 * - Add executor fee outputs (bounded)
 *
 * ARCHITECTURE:
 * - Uses CashScript SDK for transaction construction
 * - Fetches UTXO data from indexer API
 * - Computes new state commitments
 * - Returns unsigned transaction hex (executor signs to claim fee)
 */

import { createHash } from 'node:crypto';
import { ElectrumNetworkProvider, Contract, SignatureTemplate } from 'cashscript';
import {
  ScheduleUTXO,
  ProposalUTXO,
  VaultUTXO,
  ScheduleState,
  VaultState,
  ProposalState,
  ProposalStatus,
  ScheduleType,
  VaultStatus,
} from '@flowguard/shared/types';

/**
 * Transaction Builder Configuration
 */
export interface TxBuilderConfig {
  network: 'mainnet' | 'chipnet';
  electrumServer: string;
  maxExecutorFee: number; // Max satoshis for executor fee (e.g., 1000 = 0.00001 BCH)
  minExecutorFee: number; // Min satoshis (dust limit, e.g., 546)
}

/**
 * Unsigned Transaction Template
 *
 * Returned to executor for signing + broadcast
 */
export interface UnsignedTransaction {
  hex: string; // Raw transaction hex
  fee: number; // Executor fee amount (satoshis)
  locktime: number; // Transaction locktime (for CLTV validation)
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
 * TransactionBuilder Service
 */
export class TransactionBuilder {
  private config: TxBuilderConfig;
  private provider: ElectrumNetworkProvider;

  constructor(config: TxBuilderConfig) {
    this.config = config;
    this.provider = new ElectrumNetworkProvider(
      config.network,
      config.electrumServer ? { hostname: config.electrumServer } : undefined,
    );
  }

  /**
   * Build schedule unlock transaction
   *
   * Transaction structure:
   * - Input[0]: ScheduleUTXO (current state)
   * - Output[0]: Updated ScheduleUTXO (or consumed if final unlock)
   * - Output[1]: Payout to beneficiary
   * - Output[2]: Executor fee
   * - tx.locktime = next_unlock_timestamp (CLTV validation)
   *
   * @param schedule - Schedule UTXO to unlock
   * @param executorAddress - Executor's BCH address (for fee payout)
   * @param beneficiaryAddress - Schedule beneficiary address
   * @returns Unsigned transaction template
   */
  async buildScheduleUnlock(
    schedule: ScheduleUTXO,
    executorAddress: string,
    beneficiaryAddress: string,
  ): Promise<UnsignedTransaction> {
    console.log(`[TxBuilder] Building schedule unlock for ${schedule.utxo.txid}:${schedule.utxo.vout}`);

    // 1. Decode current schedule state
    const currentState = schedule.state;

    // 2. Validate unlock conditions
    const currentTime = Math.floor(Date.now() / 1000);
    const nextUnlock = Number(currentState.nextUnlockTimestamp);

    if (currentTime < nextUnlock) {
      throw new Error(
        `Schedule not yet unlockable. Current: ${currentTime}, Required: ${nextUnlock}`,
      );
    }

    // Check cliff (if set)
    const cliff = Number(currentState.cliffTimestamp);
    if (cliff > 0 && currentTime < cliff) {
      throw new Error(`Cliff not reached. Current: ${currentTime}, Cliff: ${cliff}`);
    }

    // 3. Compute payout amount
    const payoutAmount = Number(currentState.amountPerInterval);

    // 4. Compute new schedule state
    const interval = Number(currentState.intervalSeconds);
    const newState: ScheduleState = {
      ...currentState,
      nextUnlockTimestamp: currentState.nextUnlockTimestamp + BigInt(interval),
      totalReleased: currentState.totalReleased + BigInt(payoutAmount),
    };

    // 5. Compute executor fee (bounded)
    const executorFee = Math.min(
      Math.max(this.config.minExecutorFee, Math.floor(payoutAmount * 0.001)), // 0.1% of payout
      this.config.maxExecutorFee,
    );

    // 6. Check if final unlock (remaining balance <= payout + fee)
    const remainingBalance = Number(schedule.satoshis) - payoutAmount - executorFee;
    const isFinalUnlock = remainingBalance < this.config.minExecutorFee;

    // 7. Construct transaction structure (pseudo-code, actual requires CashScript Contract)
    const tx: UnsignedTransaction = {
      hex: '', // To be filled by CashScript
      fee: executorFee,
      locktime: nextUnlock, // CLTV validation
      inputs: [
        {
          txid: schedule.utxo.txid,
          vout: schedule.utxo.vout,
          satoshis: schedule.satoshis,
        },
      ],
      outputs: [
        // Output 0: Payout to beneficiary
        {
          address: beneficiaryAddress,
          satoshis: BigInt(payoutAmount),
        },
        // Output 1: Updated ScheduleUTXO (or omitted if final)
        ...(isFinalUnlock
          ? []
          : [
            {
              address: schedule.address, // Same covenant address
              satoshis: BigInt(remainingBalance),
              token: {
                category: schedule.token?.category,
                nft: {
                  capability: 'none' as const,
                  commitment: this.encodeScheduleState(newState),
                },
              },
            },
          ]),
        // Output 2: Executor fee
        {
          address: executorAddress,
          satoshis: BigInt(executorFee),
        },
      ],
    };

    console.log(`[TxBuilder] Schedule unlock built:`, {
      payoutAmount,
      executorFee,
      isFinalUnlock,
      locktime: nextUnlock,
    });

    // NOTE: In production, this would use CashScript SDK to generate actual transaction hex:
    // const contract = Contract.fromArtifact(scheduleArtifact, [...constructorArgs], provider);
    // const unsignedTx = await contract.functions.unlock().to(outputs).withTime(locktime).build();
    // return { hex: unsignedTx.toHex(), ... };

    return tx;
  }

  /**
   * Build proposal execution transaction
   *
   * Transaction structure:
   * - Input[0]: VaultUTXO (treasury)
   * - Input[1]: ProposalUTXO
   * - Input[2]: TallyUTXO (if governance vote)
   * - Output[0]: Updated VaultUTXO (new state)
   * - Output[1...n]: Payout outputs (matching proposal commitment)
   * - Output[n+1]: Updated ProposalUTXO (status=EXECUTED)
   * - Output[n+2]: Executor fee
   * - tx.locktime = execution_timelock (CLTV validation)
   *
   * @param proposal - Proposal UTXO to execute
   * @param vault - Associated vault UTXO
   * @param executorAddress - Executor's BCH address
   * @param payouts - Payout recipients (must match proposal commitment hash)
   * @returns Unsigned transaction template
   */
  async buildProposalExecution(
    proposal: ProposalUTXO,
    vault: VaultUTXO,
    executorAddress: string,
    payouts: Array<{ address: string; amount: number; category?: string }>,
  ): Promise<UnsignedTransaction> {
    console.log(`[TxBuilder] Building proposal execution for ${proposal.utxo.txid}:${proposal.utxo.vout}`);

    // 1. Validate proposal status
    if (proposal.state.status !== ProposalStatus.EXECUTABLE) {
      throw new Error(
        `Proposal not executable. Status: ${ProposalStatus[proposal.state.status]}`,
      );
    }

    // 2. Validate execution timelock
    const currentTime = Math.floor(Date.now() / 1000);
    const executionTimelock = Number(proposal.state.executionTimelock);

    if (currentTime < executionTimelock) {
      throw new Error(
        `Timelock not passed. Current: ${currentTime}, Required: ${executionTimelock}`,
      );
    }

    // 3. Validate payout total matches proposal commitment
    const payoutTotal = payouts.reduce((sum, p) => sum + p.amount, 0);
    if (payoutTotal !== Number(proposal.state.payoutTotal)) {
      throw new Error(
        `Payout total mismatch. Expected: ${proposal.state.payoutTotal}, Got: ${payoutTotal}`,
      );
    }

    // 4. Validate payout hash matches commitment
    const computedPayoutHash = this.computePayoutHash(payouts);
    if (!computedPayoutHash.equals(proposal.state.payoutHash)) {
      throw new Error('Payout hash mismatch. Payouts do not match proposal commitment.');
    }

    // 5. Compute new vault state
    const currentVaultState = vault.state;
    const periodDuration = 2592000; // 30 days in seconds (should come from policy)
    const currentPeriod = Math.floor(currentTime / periodDuration);
    const vaultPeriodId = Number(currentVaultState.currentPeriodId);

    let newSpentThisPeriod: bigint;
    let newPeriodId: bigint;

    if (currentPeriod > vaultPeriodId) {
      // New period started - reset counter
      newPeriodId = BigInt(currentPeriod);
      newSpentThisPeriod = BigInt(payoutTotal);
    } else {
      // Same period - accumulate
      newPeriodId = currentVaultState.currentPeriodId;
      newSpentThisPeriod = currentVaultState.spentThisPeriod + BigInt(payoutTotal);
    }

    // 6. Fetch vault policy for guardrail config
    // TODO: Implement vault policy fetching from database
    // For now, use placeholder values (should be fetched from vaults table policy_hash)
    const vaultPolicy = {
      periodCap: BigInt(10_000_000), // 0.1 BCH per period (satoshis)
      recipientCap: BigInt(5_000_000), // 0.05 BCH per recipient max
      allowlistEnabled: false,
      allowlist: [] as string[],
      categoryBudgets: {
        ops: BigInt(3_000_000), // 0.03 BCH per period
        grants: BigInt(5_000_000), // 0.05 BCH per period
        marketing: BigInt(2_000_000), // 0.02 BCH per period
      },
    };

    // 7. ENFORCE GUARDRAILS (OFF-CHAIN)
    // NOTE: Category budgets enforced here (off-chain) because VaultState
    // commitment doesn't have space for per-category spent tracking
    // See: contracts/core/VaultCovenant.cash L205-227 for explanation

    console.log(`[TxBuilder]   Enforcing guardrails:`, {
      periodCap: vaultPolicy.periodCap.toString(),
      recipientCap: vaultPolicy.recipientCap.toString(),
      allowlistEnabled: vaultPolicy.allowlistEnabled,
      categoryBudgets: {
        ops: vaultPolicy.categoryBudgets.ops.toString(),
        grants: vaultPolicy.categoryBudgets.grants.toString(),
        marketing: vaultPolicy.categoryBudgets.marketing.toString(),
      },
    });

    // 7.1 Validate period cap (total spending limit)
    if (vaultPolicy.periodCap > BigInt(0) && newSpentThisPeriod > vaultPolicy.periodCap) {
      throw new Error(
        `Period cap exceeded. Spent: ${newSpentThisPeriod}, Cap: ${vaultPolicy.periodCap}`,
      );
    }

    // 7.2 Validate recipient caps (per-recipient max)
    if (vaultPolicy.recipientCap > BigInt(0)) {
      for (const payout of payouts) {
        if (BigInt(payout.amount) > vaultPolicy.recipientCap) {
          throw new Error(
            `Recipient cap exceeded. Payout: ${payout.amount}, Cap: ${vaultPolicy.recipientCap}, Recipient: ${payout.address}`,
          );
        }
      }
    }

    // 7.3 Validate allowlist (if enabled)
    if (vaultPolicy.allowlistEnabled && vaultPolicy.allowlist.length > 0) {
      for (const payout of payouts) {
        if (!vaultPolicy.allowlist.includes(payout.address)) {
          throw new Error(
            `Recipient not in allowlist: ${payout.address}`,
          );
        }
      }
    }

    // 7.4 Validate category budgets (per-category spending caps)
    // Group payouts by category and validate totals
    const categoryTotals = {
      ops: BigInt(0),
      grants: BigInt(0),
      marketing: BigInt(0),
    };

    for (const payout of payouts) {
      const category = payout.category || 'ops'; // Default to ops if no category
      if (category in categoryTotals) {
        categoryTotals[category as keyof typeof categoryTotals] += BigInt(payout.amount);
      } else {
        throw new Error(`Unknown category: ${category}. Valid: ops, grants, marketing`);
      }
    }

    // Validate each category against budget
    for (const [category, total] of Object.entries(categoryTotals)) {
      const budget = vaultPolicy.categoryBudgets[category as keyof typeof vaultPolicy.categoryBudgets];
      if (budget > BigInt(0) && total > budget) {
        throw new Error(
          `Category budget exceeded. Category: ${category}, Spent: ${total}, Budget: ${budget}`,
        );
      }
    }

    console.log(`[TxBuilder]   ✓ All guardrails passed:`, {
      periodSpent: newSpentThisPeriod.toString(),
      categorySpent: Object.fromEntries(
        Object.entries(categoryTotals).map(([k, v]) => [k, v.toString()])
      ),
      payoutCount: payouts.length,
    });

    const newVaultState: VaultState = {
      ...currentVaultState,
      currentPeriodId: newPeriodId,
      spentThisPeriod: newSpentThisPeriod,
      lastUpdateTimestamp: BigInt(currentTime),
    };

    // 8. Compute executor fee
    const executorFee = Math.min(
      Math.max(this.config.minExecutorFee, Math.floor(payoutTotal * 0.001)),
      this.config.maxExecutorFee,
    );

    // 9. Construct transaction
    const tx: UnsignedTransaction = {
      hex: '',
      fee: executorFee,
      locktime: executionTimelock,
      inputs: [
        {
          txid: vault.utxo.txid,
          vout: vault.utxo.vout,
          satoshis: vault.satoshis,
        },
        {
          txid: proposal.utxo.txid,
          vout: proposal.utxo.vout,
          satoshis: proposal.satoshis,
        },
      ],
      outputs: [
        // Output 0: Updated VaultUTXO
        {
          address: vault.address,
          satoshis: vault.satoshis - BigInt(payoutTotal) - BigInt(executorFee),
          token: {
            category: vault.token?.category,
            nft: {
              capability: 'none' as const,
              commitment: this.encodeVaultState(newVaultState),
            },
          },
        },
        // Output 1...n: Payout outputs
        ...payouts.map((p) => ({
          address: p.address,
          satoshis: BigInt(p.amount),
        })),
        // Output n+1: Updated ProposalUTXO (status=EXECUTED)
        {
          address: proposal.address,
          satoshis: proposal.satoshis, // Preserve dust
          token: {
            category: proposal.token?.category,
            nft: {
              capability: 'none' as const,
              commitment: this.encodeProposalState({
                ...proposal.state,
                status: ProposalStatus.EXECUTED,
              }),
            },
          },
        },
        // Output n+2: Executor fee
        {
          address: executorAddress,
          satoshis: BigInt(executorFee),
        },
      ],
    };

    console.log(`[TxBuilder] Proposal execution built:`, {
      payoutTotal,
      executorFee,
      newVaultState: {
        periodId: newPeriodId.toString(),
        spent: newSpentThisPeriod.toString(),
      },
    });

    return tx;
  }

  /**
   * Encode ScheduleState into NFT commitment (48 bytes)
   *
   * Mirrors: contracts/lib/StateEncoding.cash :: encodeScheduleState()
   */
  private encodeScheduleState(state: ScheduleState): Buffer {
    const commitment = Buffer.alloc(48);

    // [0-3]: version (uint32 big-endian)
    commitment.writeUInt32BE(state.version, 0);

    // [4]: schedule_type (uint8)
    commitment.writeUInt8(state.scheduleType, 4);

    // [5-7]: reserved (zeros)

    // [8-15]: interval_seconds (uint64 big-endian)
    commitment.writeBigUInt64BE(state.intervalSeconds, 8);

    // [16-23]: next_unlock_timestamp
    commitment.writeBigUInt64BE(state.nextUnlockTimestamp, 16);

    // [24-31]: amount_per_interval
    commitment.writeBigUInt64BE(state.amountPerInterval, 24);

    // [32-39]: total_released
    commitment.writeBigUInt64BE(state.totalReleased, 32);

    // [40-47]: cliff_timestamp
    commitment.writeBigUInt64BE(state.cliffTimestamp, 40);

    return commitment;
  }

  /**
   * Encode VaultState into NFT commitment (32 bytes)
   *
   * Mirrors: contracts/lib/StateEncoding.cash :: encodeVaultState()
   */
  private encodeVaultState(state: VaultState): Buffer {
    const commitment = Buffer.alloc(32);

    // [0-3]: version
    commitment.writeUInt32BE(state.version, 0);

    // [4]: status
    commitment.writeUInt8(state.status, 4);

    // [5-7]: rolesMask (3 bytes)
    state.rolesMask.copy(commitment, 5, 0, 3);

    // [8-15]: current_period_id
    commitment.writeBigUInt64BE(state.currentPeriodId, 8);

    // [16-23]: spent_this_period
    commitment.writeBigUInt64BE(state.spentThisPeriod, 16);

    // [24-31]: last_update_timestamp
    commitment.writeBigUInt64BE(state.lastUpdateTimestamp, 24);

    return commitment;
  }

  /**
   * Encode ProposalState into NFT commitment (64 bytes)
   *
   * Mirrors: contracts/lib/StateEncoding.cash :: encodeProposalState()
   */
  private encodeProposalState(state: ProposalState): Buffer {
    const commitment = Buffer.alloc(64);

    // [0-3]: version
    commitment.writeUInt32BE(state.version, 0);

    // [4]: status
    commitment.writeUInt8(state.status, 4);

    // [5-7]: approval_count (uint24, 3 bytes big-endian)
    commitment.writeUInt8((state.approvalCount >> 16) & 0xff, 5);
    commitment.writeUInt8((state.approvalCount >> 8) & 0xff, 6);
    commitment.writeUInt8(state.approvalCount & 0xff, 7);

    // [8-11]: required_approvals
    commitment.writeUInt32BE(state.requiredApprovals, 8);

    // [12-19]: voting_end_timestamp
    commitment.writeBigUInt64BE(state.votingEndTimestamp, 12);

    // [20-27]: execution_timelock
    commitment.writeBigUInt64BE(state.executionTimelock, 20);

    // [28-35]: payout_total
    commitment.writeBigUInt64BE(state.payoutTotal, 28);

    // [36-63]: payout_hash (28 bytes)
    state.payoutHash.copy(commitment, 36, 0, 28);

    return commitment;
  }

  /**
   * Compute payout hash (SHA256 of payout data)
   *
   * Mirrors: VaultCovenant.cash payout hash computation
   *
   * Format: SHA256(recipient1 + amount1 + recipient2 + amount2 + ...)
   */
  private computePayoutHash(
    payouts: Array<{ address: string; amount: number }>,
  ): Buffer {
    // Convert addresses to hash160 (20 bytes)
    // Extract from P2PKH addresses
    const buffers: Buffer[] = [];

    for (const payout of payouts) {
      // Decode CashAddr to get hash160
      // NOTE: In production, use proper CashAddr decoding library
      const recipientHash = Buffer.alloc(20); // Placeholder
      buffers.push(recipientHash);

      // Add amount (8 bytes big-endian)
      const amountBuf = Buffer.alloc(8);
      amountBuf.writeBigUInt64BE(BigInt(payout.amount), 0);
      buffers.push(amountBuf);
    }

    const combined = Buffer.concat(buffers);
    return Buffer.from(createHash('sha256').update(combined).digest());
  }
}

export default TransactionBuilder;
