/**
 * NFTMinter Service
 *
 * PURPOSE: Construct genesis transactions for covenant NFT minting
 * - VaultNFT (CreateVault)
 * - ProposalNFT (SubmitProposal)
 * - ScheduleNFT (CreateSchedule)
 * - VoteNFT (CastVote)
 * - TallyNFT (CreateTally)
 *
 * ARCHITECTURE:
 * - Uses CashScript SDK for covenant deployment
 * - Encodes NFT commitments per CashTokens spec
 * - Returns unsigned transaction templates for frontend signing
 *
 * CASHTOKENS NFT MINTING:
 * - NFT category = hash of genesis outpoint (first input txid:vout)
 * - NFT commitment = variable length 0-40 bytes (state encoding)
 * - Minting capability required in genesis tx (created automatically)
 */

import { ElectrumNetworkProvider, Contract, SignatureTemplate } from 'cashscript';
import crypto from 'crypto';
import {
  VaultState,
  ProposalState,
  VoteState,
  VaultStatus,
  ProposalStatus,
  ScheduleType,
  VoteChoice,
} from '@flowguard/shared/types/covenant-types';
import {
  encodeVaultState,
  encodeProposalState,
  encodeVoteState,
} from '@flowguard/shared/utils';

/**
 * NFT Minter Configuration
 */
export interface MinterConfig {
  network: 'mainnet' | 'chipnet';
  electrumServer: string;
  covenantArtifacts: {
    vaultCovenant: any; // Compiled CashScript artifact
    proposalCovenant: any;
    scheduleCovenant: any;
    voteLockCovenant: any;
    tallyCovenant: any;
  };
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
  nftCategory?: string; // NFT category ID (for reference)
}

/**
 * CreateVault Input Parameters
 */
export interface CreateVaultInput {
  fundingUTXOs: Array<{
    txid: string;
    vout: number;
    satoshis: bigint;
    privateKey?: string; // Optional, for server-side signing
  }>;
  initialBalance: bigint; // Satoshis to put in vault
  policyHash: Buffer; // SHA256 hash of policy document (32 bytes)
  signerPubkeys: Buffer[]; // Signer public keys (for signerSetHash)
  rolesMask: Buffer; // 3-byte bitfield for roles
  periodDuration: number; // Seconds per budget period
  periodCap: bigint; // Max spending per period (satoshis)
  recipientCap: bigint; // Max per recipient
  allowlistEnabled: boolean;
  allowlist: string[]; // BCH addresses (max 3 pre-Layla)
  categoryBudgets: {
    ops: bigint;
    grants: bigint;
    marketing: bigint;
  };
}

/**
 * SubmitProposal Input Parameters
 */
export interface SubmitProposalInput {
  vaultAddress: string; // Vault to spend from
  proposerDustUTXO: {
    txid: string;
    vout: number;
    satoshis: bigint;
  };
  payouts: Array<{
    address: string;
    amount: bigint;
    category: string; // ops/grants/marketing
  }>;
  requiredApprovals: number; // M-of-N threshold
  votingDuration: number; // Seconds (if governance vote)
  executionDelay: number; // Timelock delay in seconds
}

/**
 * CreateSchedule Input Parameters
 */
export interface CreateScheduleInput {
  fundingUTXOs: Array<{
    txid: string;
    vout: number;
    satoshis: bigint;
  }>;
  totalAmount: bigint; // Total to lock in schedule
  beneficiaryAddress: string;
  scheduleType: ScheduleType; // RECURRING, LINEAR_VESTING, STEP_VESTING
  intervalSeconds: bigint; // Time between unlocks
  amountPerInterval: bigint; // Amount per unlock
  cliffTimestamp: bigint; // Cliff (0 if none)
}

/**
 * CastVote Input Parameters
 */
export interface CastVoteInput {
  proposalId: string; // Proposal hash
  governanceTokenUTXOs: Array<{
    txid: string;
    vout: number;
    satoshis: bigint;
    tokenAmount: bigint; // GovernanceFT amount
  }>;
  voteChoice: VoteChoice; // FOR, AGAINST, ABSTAIN
  unlockTimestamp: bigint; // When tokens unlock (voting_end + buffer)
}

/**
 * NFTMinter Service
 */
export class NFTMinter {
  private config: MinterConfig;
  private provider: ElectrumNetworkProvider;

  constructor(config: MinterConfig) {
    this.config = config;
    this.provider = new ElectrumNetworkProvider(config.network);
  }

  /**
   * Build CreateVault transaction
   *
   * Transaction structure:
   * - Input[0...n]: Funding UTXOs (BCH to seed vault)
   * - Output[0]: VaultUTXO (newly minted VaultNFT with initial state)
   * - Output[1]: ChangeUTXO (if any)
   *
   * NFT Minting:
   * - Category = hash(input[0].outpoint) = hash(fundingUTXOs[0].txid:vout)
   * - Commitment = encodeVaultState(initial_state)
   * - Capability = none (genesis minting handled by CashScript)
   *
   * @param input - CreateVault parameters
   * @returns Unsigned transaction template
   */
  async buildCreateVaultTx(input: CreateVaultInput): Promise<UnsignedTransaction> {
    console.log('[NFTMinter] Building CreateVault transaction...');

    // 1. Compute signerSetHash (hash of concatenated pubkeys)
    const signerSetHash = this.computeSignerSetHash(input.signerPubkeys);

    // 2. Encode initial VaultState commitment
    const initialState: VaultState = {
      version: 1,
      status: VaultStatus.ACTIVE,
      rolesMask: input.rolesMask,
      currentPeriodId: BigInt(Math.floor(Date.now() / 1000 / input.periodDuration)),
      spentThisPeriod: BigInt(0),
      lastUpdateTimestamp: BigInt(Math.floor(Date.now() / 1000)),
    };

    const vaultCommitment = encodeVaultState(initialState);

    // 3. Compute NFT category (hash of first input outpoint)
    // Category = hash(txid || vout) per CashTokens spec
    const genesisOutpoint = Buffer.concat([
      Buffer.from(input.fundingUTXOs[0].txid, 'hex').reverse(), // Little-endian
      Buffer.alloc(4),
    ]);
    genesisOutpoint.writeUInt32LE(input.fundingUTXOs[0].vout, 32);
    const nftCategory = crypto.createHash('sha256').update(genesisOutpoint).digest('hex');

    console.log('[NFTMinter]   NFT Category:', nftCategory);
    console.log('[NFTMinter]   Policy Hash:', input.policyHash.toString('hex'));
    console.log('[NFTMinter]   Signer Set Hash:', signerSetHash.toString('hex'));

    // 4. Instantiate VaultCovenant with constructor parameters
    // NOTE: In production, this would use CashScript Contract.fromArtifact()
    // For now, return transaction structure (actual contract deployment pending CashScript integration)

    const totalInputValue = input.fundingUTXOs.reduce(
      (sum, utxo) => sum + utxo.satoshis,
      BigInt(0),
    );

    const changeAmount = totalInputValue - input.initialBalance - BigInt(1000); // 1000 sat tx fee

    const tx: UnsignedTransaction = {
      hex: '', // To be filled by CashScript
      inputs: input.fundingUTXOs.map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        satoshis: utxo.satoshis,
      })),
      outputs: [
        // Output 0: VaultUTXO with minted VaultNFT
        {
          satoshis: input.initialBalance,
          token: {
            category: nftCategory,
            nft: {
              capability: 'none' as const,
              commitment: vaultCommitment,
            },
          },
        },
        // Output 1: Change (if any)
        ...(changeAmount > BigInt(546)
          ? [
              {
                satoshis: changeAmount,
              },
            ]
          : []),
      ],
      nftCategory,
    };

    console.log('[NFTMinter]   ✓ CreateVault tx built:', {
      inputCount: tx.inputs.length,
      outputCount: tx.outputs.length,
      initialBalance: input.initialBalance.toString(),
      nftCategory,
    });

    // TODO: Use CashScript SDK to generate actual transaction hex:
    // const contract = Contract.fromArtifact(
    //   this.config.covenantArtifacts.vaultCovenant,
    //   [input.policyHash, signerSetHash, input.rolesMask, ...],
    //   this.provider
    // );
    // const unsignedTx = await contract.deploy(input.initialBalance, vaultCommitment);
    // return { hex: unsignedTx.toHex(), ... };

    return tx;
  }

  /**
   * Build SubmitProposal transaction
   *
   * Transaction structure:
   * - Input[0]: ProposerDustUTXO (546 sats for ProposalNFT)
   * - Output[0]: ProposalUTXO (newly minted ProposalNFT)
   * - Output[1]: Change (if any)
   *
   * NFT Minting:
   * - Category = hash(input[0].outpoint)
   * - Commitment = encodeProposalState(initial_state)
   *
   * @param input - SubmitProposal parameters
   * @returns Unsigned transaction template
   */
  async buildSubmitProposalTx(input: SubmitProposalInput): Promise<UnsignedTransaction> {
    console.log('[NFTMinter] Building SubmitProposal transaction...');

    const payoutHash = this.computePayoutHash20(input.payouts);

    const payoutTotal = input.payouts.reduce((sum, p) => sum + p.amount, BigInt(0));

    const currentTime = Math.floor(Date.now() / 1000);
    const initialState: ProposalState = {
      version: 1,
      status: ProposalStatus.PENDING,
      approvalCount: 0,
      requiredApprovals: input.requiredApprovals,
      votingEndTimestamp: currentTime + input.votingDuration,
      executionTimelock: currentTime + input.executionDelay,
      payoutHash,
    };

    const proposalCommitment = encodeProposalState(initialState);

    // 4. Compute NFT category (hash of first input outpoint)
    const genesisOutpoint = Buffer.concat([
      Buffer.from(input.proposerDustUTXO.txid, 'hex').reverse(),
      Buffer.alloc(4),
    ]);
    genesisOutpoint.writeUInt32LE(input.proposerDustUTXO.vout, 32);
    const nftCategory = crypto.createHash('sha256').update(genesisOutpoint).digest('hex');

    console.log('[NFTMinter]   NFT Category:', nftCategory);
    console.log('[NFTMinter]   Payout Hash:', payoutHash.toString('hex'));
    console.log('[NFTMinter]   Payout Total:', payoutTotal.toString());

    const tx: UnsignedTransaction = {
      hex: '',
      inputs: [
        {
          txid: input.proposerDustUTXO.txid,
          vout: input.proposerDustUTXO.vout,
          satoshis: input.proposerDustUTXO.satoshis,
        },
      ],
      outputs: [
        // Output 0: ProposalUTXO with minted ProposalNFT
        {
          satoshis: BigInt(546), // Dust for NFT
          token: {
            category: nftCategory,
            nft: {
              capability: 'none' as const,
              commitment: proposalCommitment,
            },
          },
        },
        // Output 1: Change (if any)
        ...(input.proposerDustUTXO.satoshis > BigInt(546 + 500)
          ? [
              {
                satoshis: input.proposerDustUTXO.satoshis - BigInt(546 + 500), // 500 sat fee
              },
            ]
          : []),
      ],
      nftCategory,
    };

    console.log('[NFTMinter]   ✓ SubmitProposal tx built:', {
      nftCategory,
      status: ProposalStatus[initialState.status],
      requiredApprovals: initialState.requiredApprovals,
    });

    return tx;
  }

  /**
   * Build CreateSchedule transaction
   *
   * Transaction structure:
   * - Input[0...n]: Funding UTXOs (BCH to lock in schedule)
   * - Output[0]: ScheduleUTXO (newly minted ScheduleNFT)
   * - Output[1]: Change (if any)
   *
   * NFT Minting:
   * - Category = hash(input[0].outpoint)
   * - Commitment = encodeScheduleState(initial_state)
   *
   * @param input - CreateSchedule parameters
   * @returns Unsigned transaction template
   */
  async buildCreateScheduleTx(input: CreateScheduleInput): Promise<UnsignedTransaction> {
    console.log('[NFTMinter] Building CreateSchedule transaction...');

    // TODO_REVIEW: CreateScheduleInput does not carry the fields required by the
    // current ScheduleState shape (status/flags/recipientHash/scheduleCursor/pauseStart).
    // Inputs only provide scheduleType, intervalSeconds, amountPerInterval, cliffTimestamp
    // and a beneficiaryAddress string. The caller needs to be updated to pass the
    // covenant-aligned fields (recipientHash20, cancelable/transferable/usesTokens flags,
    // initial scheduleCursor) before this path can be wired to the shared codec.
    throw new Error(
      'buildCreateScheduleTx: ScheduleState shape mismatch. Input must provide ' +
        'recipientHash (20 bytes), flag bits (cancelable/transferable/usesTokens), ' +
        'and initial scheduleCursor before encoding. See TODO_REVIEW above.',
    );
  }

  /**
   * Build CastVote transaction
   *
   * Transaction structure:
   * - Input[0...n]: GovernanceFT UTXOs (tokens to lock with vote)
   * - Output[0]: VoteUTXO (minted VoteNFT + locked GovernanceFT)
   *
   * NFT Minting:
   * - Category = same as GovernanceFT category (vote locks tokens)
   * - Commitment = encodeVoteState(vote_choice, lock_time)
   *
   * @param input - CastVote parameters
   * @returns Unsigned transaction template
   */
  async buildCastVoteTx(input: CastVoteInput): Promise<UnsignedTransaction> {
    console.log('[NFTMinter] Building CastVote transaction...');

    const currentTime = Math.floor(Date.now() / 1000);
    const proposalIdPrefix = Buffer.from(input.proposalId.slice(0, 8), 'hex');

    const initialState: VoteState = {
      version: 1,
      proposalIdPrefix,
      voteChoice: input.voteChoice,
      lockTimestamp: currentTime,
      unlockTimestamp: Number(input.unlockTimestamp),
    };

    const voteCommitment = encodeVoteState(initialState);

    // 2. Compute total token amount
    const totalTokens = input.governanceTokenUTXOs.reduce(
      (sum, utxo) => sum + utxo.tokenAmount,
      BigInt(0),
    );

    // 3. NFT category = GovernanceFT category (tokens are locked)
    // NOTE: This assumes all governanceTokenUTXOs have the same category
    // In production, validate all inputs have matching category
    const nftCategory = 'governance-token-category-placeholder'; // Should be extracted from input UTXOs

    console.log('[NFTMinter]   Vote Choice:', VoteChoice[initialState.voteChoice]);
    console.log('[NFTMinter]   Total Tokens:', totalTokens.toString());
    console.log('[NFTMinter]   Unlock Time:', new Date(Number(input.unlockTimestamp) * 1000).toISOString());

    const tx: UnsignedTransaction = {
      hex: '',
      inputs: input.governanceTokenUTXOs.map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        satoshis: utxo.satoshis,
      })),
      outputs: [
        // Output 0: VoteUTXO (VoteNFT + locked GovernanceFT)
        {
          satoshis: BigInt(546), // Dust for NFT
          token: {
            category: nftCategory,
            nft: {
              capability: 'none' as const,
              commitment: voteCommitment,
            },
            amount: totalTokens, // Locked GovernanceFT amount
          },
        },
      ],
      nftCategory,
    };

    console.log('[NFTMinter]   ✓ CastVote tx built:', {
      inputCount: tx.inputs.length,
      voteChoice: VoteChoice[initialState.voteChoice],
      tokensLocked: totalTokens.toString(),
    });

    return tx;
  }

  private computeSignerSetHash(pubkeys: Buffer[]): Buffer {
    const concatenated = Buffer.concat(pubkeys);
    return crypto.createHash('sha256').update(concatenated).digest();
  }

  private computePayoutHash20(
    payouts: Array<{ address: string; amount: bigint; category?: string }>,
  ): Buffer {
    const buffers: Buffer[] = [];

    for (const payout of payouts) {
      const recipientHash = this.addressToHash160(payout.address);
      buffers.push(recipientHash);

      const amountBuf = Buffer.alloc(8);
      amountBuf.writeBigUInt64LE(payout.amount, 0);
      buffers.push(amountBuf);
    }

    const combined = Buffer.concat(buffers);
    const sha = crypto.createHash('sha256').update(combined).digest();
    return crypto.createHash('ripemd160').update(sha).digest();
  }

  // TODO_REVIEW: replace with proper CashAddr decoding (e.g. @bitauth/libauth
  // decodeCashAddress) so the payoutHash matches the covenant's hash160 expectation.
  private addressToHash160(_address: string): Buffer {
    return Buffer.alloc(20);
  }
}

export default NFTMinter;
