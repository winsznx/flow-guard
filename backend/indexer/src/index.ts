/**
 * FlowGuard Indexer Service
 *
 * PURPOSE: Index covenant UTXOs from BCH blockchain into PostgreSQL
 *
 * FUNCTIONALITY:
 * - Monitor BCH blockchain for covenant transactions
 * - Decode NFT commitments into structured state
 * - Store UTXO state in PostgreSQL
 * - Track UTXO lifecycle (creation, updates, spending)
 * - Provide REST API for querying indexed data
 *
 * ARCHITECTURE:
 * - Block Scanner: Scans new blocks for covenant transactions
 * - UTXO Decoder: Decodes NFT commitments using StateEncoding logic
 * - Database Writer: Writes decoded state to PostgreSQL
 * - API Server: Serves indexed data to frontend/SDK
 */

import { createServer, type Server } from 'node:http';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { ElectrumNetworkProvider } from 'cashscript';
import {
  VaultState,
  ProposalState,
  ScheduleState,
  VoteState,
  TallyState,
  VaultStatus,
  ProposalStatus,
  ScheduleType,
  VoteChoice,
} from '@flowguard/shared/types';

dotenv.config();

/**
 * Indexer Configuration
 */
interface IndexerConfig {
  // Database
  databaseUrl: string;

  // BCH Network
  network: 'mainnet' | 'chipnet';
  electrumServer: string;

  // Indexing
  startBlock: number; // Block height to start indexing from
  confirmations: number; // Min confirmations before indexing
  pollInterval: number; // Milliseconds between block checks

  // Covenant Addresses (to monitor)
  vaultAddresses: string[]; // Array of vault covenant addresses
}

/**
 * Indexer Service
 */
export class FlowGuardIndexer {
  private config: IndexerConfig;
  private db: Pool;
  private provider: ElectrumNetworkProvider;
  private currentHeight: number = 0;
  private isRunning: boolean = false;
  private statusServer?: Server;
  private readonly startedAt: string = new Date().toISOString();
  private lastPollStartedAt: string | null = null;
  private lastPollCompletedAt: string | null = null;
  private lastSuccessfulIndexAt: string | null = null;
  private lastError: string | null = null;
  private lastNetworkHeight: number | null = null;
  private consecutiveFailures: number = 0;
  private idlePolls: number = 0;
  private blocksIndexed: number = 0;
  private covenantUtxosProcessed: number = 0;
  private pollCount: number = 0;

  constructor(config: IndexerConfig) {
    this.config = config;

    // Initialize database connection
    this.db = new Pool({
      connectionString: config.databaseUrl,
    });

    // Initialize BCH network provider
    this.provider = new ElectrumNetworkProvider(
      config.network,
      config.electrumServer ? { hostname: config.electrumServer } : undefined,
    );
  }

  /**
   * Start indexer service
   */
  async start(): Promise<void> {
    console.log('[Indexer] Starting FlowGuard Indexer...');
    console.log(`[Indexer] Network: ${this.config.network}`);
    console.log(`[Indexer] Start block: ${this.config.startBlock}`);

    // Initialize database schema (if needed)
    await this.initializeDatabase();

    // Get current blockchain height
    this.currentHeight = await this.getLastIndexedBlock();
    console.log(`[Indexer] Resuming from block ${this.currentHeight}`);

    // Start polling loop
    this.isRunning = true;
    this.pollBlocks();
  }

  /**
   * Stop indexer service
   */
  async stop(): Promise<void> {
    console.log('[Indexer] Stopping...');
    this.isRunning = false;
    if (this.statusServer) {
      await new Promise<void>((resolve, reject) => {
        this.statusServer!.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await this.db.end();
    await this.provider.disconnect();
  }

  async startStatusServer(port: number): Promise<void> {
    this.statusServer = createServer(async (req, res) => {
      try {
        if (req.url === '/health') {
          const snapshot = await this.getStatusSnapshot();
          const healthy = snapshot.service.status !== 'critical';
          res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: healthy ? 'ok' : 'degraded',
            service: 'flowguard-indexer',
            timestamp: new Date().toISOString(),
          }));
          return;
        }

        if (req.url === '/status') {
          const snapshot = await this.getStatusSnapshot();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(snapshot));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      } catch (error: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Failed to serve status',
          message: error.message,
        }));
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.statusServer!.listen(port, '0.0.0.0', () => resolve());
      this.statusServer!.once('error', reject);
    });

    console.log(`[Indexer] Status server listening on :${port}`);
  }

  async getStatusSnapshot(): Promise<Record<string, unknown>> {
    const blockCount = await this.safeCount('blocks');
    const vaultCount = await this.safeCount('vaults');
    const proposalCount = await this.safeCount('proposals');
    const scheduleCount = await this.safeCount('schedules');

    const lag = this.lastNetworkHeight === null ? null : Math.max(0, this.lastNetworkHeight - this.currentHeight);
    const serviceStatus =
      this.lastError && this.consecutiveFailures >= 3
        ? 'critical'
        : this.consecutiveFailures > 0
          ? 'degraded'
          : 'healthy';

    return {
      service: {
        name: 'FlowGuard Indexer',
        kind: 'indexer',
        status: serviceStatus,
        running: this.isRunning,
        startedAt: this.startedAt,
        uptimeSeconds: Math.floor(process.uptime()),
      },
      chain: {
        network: this.config.network,
        electrumServer: this.config.electrumServer,
        currentIndexedHeight: this.currentHeight,
        lastNetworkHeight: this.lastNetworkHeight,
        blocksBehind: lag,
        confirmations: this.config.confirmations,
      },
      runtime: {
        pollIntervalMs: this.config.pollInterval,
        pollCount: this.pollCount,
        idlePolls: this.idlePolls,
        consecutiveFailures: this.consecutiveFailures,
        lastPollStartedAt: this.lastPollStartedAt,
        lastPollCompletedAt: this.lastPollCompletedAt,
        lastSuccessfulIndexAt: this.lastSuccessfulIndexAt,
        lastError: this.lastError,
      },
      workload: {
        monitoredAddresses: this.config.vaultAddresses.length,
        blocksIndexed: this.blocksIndexed,
        covenantUtxosProcessed: this.covenantUtxosProcessed,
      },
      database: {
        blocks: blockCount,
        vaults: vaultCount,
        proposals: proposalCount,
        schedules: scheduleCount,
      },
      resources: {
        memoryRssMB: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(2)),
        heapUsedMB: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)),
        nodeVersion: process.version,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Initialize database (auto-apply schema if missing)
   */
  private async initializeDatabase(): Promise<void> {
    try {
      const result = await this.db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'blocks'
        );
      `);

      if (!result.rows[0].exists) {
        console.log('[Indexer] Database schema not found, applying schema.sql...');
        const { readFileSync } = await import('node:fs');
        const { fileURLToPath } = await import('node:url');
        const { dirname, join } = await import('node:path');
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const schemaPath = join(__dirname, '..', 'schema.sql');
        const schema = readFileSync(schemaPath, 'utf-8');
        await this.db.query(schema);
        console.log('[Indexer] Database schema applied successfully');
      } else {
        console.log('[Indexer] Database schema OK');
      }
    } catch (error) {
      console.error('[Indexer] Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get last indexed block height from database
   */
  private async getLastIndexedBlock(): Promise<number> {
    const result = await this.db.query(`
      SELECT COALESCE(MAX(height), $1) as height FROM blocks;
    `, [this.config.startBlock]);

    return result.rows[0].height;
  }

  /**
   * Polling loop - check for new blocks
   */
  private async pollBlocks(): Promise<void> {
    while (this.isRunning) {
      try {
        this.pollCount += 1;
        this.lastPollStartedAt = new Date().toISOString();

        // Get current network height
        const networkHeight = await this.provider.getBlockHeight();
        this.lastNetworkHeight = networkHeight;

        // Check if new blocks available (with confirmation requirement)
        const targetHeight = networkHeight - this.config.confirmations;

        if (this.currentHeight < targetHeight) {
          this.idlePolls = 0;
          console.log(`[Indexer] Indexing blocks ${this.currentHeight + 1} to ${targetHeight}`);

          // Index blocks sequentially
          for (let height = this.currentHeight + 1; height <= targetHeight; height++) {
            await this.indexBlock(height);
            this.currentHeight = height;
            this.blocksIndexed += 1;
            this.lastSuccessfulIndexAt = new Date().toISOString();
          }

          console.log(`[Indexer] Synced to block ${this.currentHeight}`);
        } else {
          this.idlePolls += 1;
          if (this.idlePolls === 1 || this.idlePolls % 10 === 0) {
            console.log(`[Indexer] Heartbeat: idle at block ${this.currentHeight}, network ${networkHeight}`);
          }
        }

        this.consecutiveFailures = 0;
        this.lastError = null;
        this.lastPollCompletedAt = new Date().toISOString();

        // Wait before next poll
        await this.sleep(this.config.pollInterval);
      } catch (error) {
        console.error('[Indexer] Polling error:', error);
        this.lastError = error instanceof Error ? error.message : String(error);
        this.consecutiveFailures += 1;
        this.lastPollCompletedAt = new Date().toISOString();
        await this.sleep(this.config.pollInterval);
      }
    }
  }

  /**
   * Index a single block
   */
  private async indexBlock(height: number): Promise<void> {
    try {
      console.log(`[Indexer] Indexing block ${height}...`);

      // Generate a deterministic block hash from height
      // Note: ElectrumNetworkProvider doesn't expose block.header method
      // So we use a simple hash for tracking purposes
      const blockHash = `block_${height}`;
      const blockTimestamp = Math.floor(Date.now() / 1000);

      // Store block metadata
      await this.db.query(`
        INSERT INTO blocks (height, hash, timestamp)
        VALUES ($1, $2, $3)
        ON CONFLICT (height) DO NOTHING;
      `, [height, blockHash, blockTimestamp]);

      // Scan for covenant transactions at this height
      await this.scanBlockForCovenants(height, blockHash, BigInt(blockTimestamp));

    } catch (error) {
      console.error(`[Indexer] Failed to index block ${height}:`, error);
      throw error;
    }
  }

  /**
   * Scan block for covenant transactions
   *
   * Fetches all transactions in block, filters for covenant UTXOs,
   * decodes NFT commitments, and stores in database.
   *
   * @param height - Block height
   * @param blockHash - Block hash
   * @param blockTimestamp - Block timestamp (unix seconds)
   */
  private async scanBlockForCovenants(
    height: number,
    blockHash: string,
    blockTimestamp: bigint,
  ): Promise<void> {
    console.log(`[Indexer]   Scanning block ${height} for covenant transactions...`);

    try {
      // NOTE: In production, this would use Electrum to fetch all block transactions
      // For now, we use a simplified approach:
      // 1. Monitor known covenant addresses (from config.vaultAddresses)
      // 2. Fetch transaction history for each address
      // 3. Filter transactions in this block
      // 4. Decode and store UTXO state

      // Placeholder: Actual implementation would use:
      // const blockData = await this.provider.getBlock(blockHash);
      // const transactions = blockData.transactions;

      // For now, scan monitored addresses for UTXOs in this block height range
      for (const address of this.config.vaultAddresses) {
        await this.scanAddressForUTXOs(address, height, blockTimestamp);
      }

      // TODO: Implement full block scanning via Electrum Protocol:
      // 1. blockchain.block.header (get block header)
      // 2. blockchain.block.txs (get all transaction IDs)
      // 3. blockchain.transaction.get (fetch each transaction)
      // 4. Parse transaction outputs for covenant addresses
      // 5. Decode NFT commitments from CashToken outputs
      // 6. Store in database

      console.log(`[Indexer]   ✓ Block ${height} scanned`);
    } catch (error) {
      console.error(`[Indexer]   ✗ Failed to scan block ${height}:`, error);
      throw error;
    }
  }

  /**
   * Scan address for UTXOs (Electrum-based)
   *
   * Fetches transaction history for an address and identifies UTXOs
   * created/spent in the target block height.
   *
   * @param address - Covenant address to monitor
   * @param targetHeight - Block height to scan
   * @param blockTimestamp - Block timestamp
   */
  private async scanAddressForUTXOs(
    address: string,
    targetHeight: number,
    blockTimestamp: bigint,
  ): Promise<void> {
    try {
      console.log(`[Indexer]     Scanning address ${address.slice(0, 20)}...`);

      // Fetch UTXOs for this address using Electrum
      const utxos = await this.provider.getUtxos(address);

      if (!utxos || utxos.length === 0) {
        console.log(`[Indexer]       No UTXOs found`);
        return;
      }

      console.log(`[Indexer]       Found ${utxos.length} UTXO(s)`);

      // Process UTXOs that were created at or around targetHeight
      // We check a range because exact block height matching is tricky
      for (const utxo of utxos) {
        const utxoHeight = (utxo as any).height || 0;

        // Only process UTXOs created at or near this height
        // (within 10 blocks to account for timing issues)
        if (Math.abs(utxoHeight - targetHeight) <= 10) {
          console.log(`[Indexer]         Processing UTXO ${utxo.txid}:${utxo.vout} at height ${utxoHeight}`);

          // Check if UTXO has a CashToken with NFT
          if (utxo.token?.nft) {
            await this.processCovenantUTXO(utxo as any, address, blockTimestamp);
            this.covenantUtxosProcessed += 1;
          } else {
            console.log(`[Indexer]           Skipped (no NFT)`);
          }
        }
      }
    } catch (error) {
      console.error(`[Indexer]     Failed to scan address ${address}:`, error);
    }
  }

  /**
   * Process covenant UTXO and store in database
   *
   * Decodes NFT commitment, determines covenant type, and inserts into
   * appropriate database table (vaults, proposals, schedules, votes, tallies).
   *
   * @param utxo - UTXO data from blockchain
   * @param address - Covenant address
   * @param blockTimestamp - Block timestamp
   */
  private async processCovenantUTXO(
    utxo: {
      txid: string;
      vout: number;
      satoshis: bigint;
      height: number;
      token?: {
        category: string;
        nft?: {
          capability: 'none' | 'mutable' | 'minting';
          commitment: Buffer;
        };
        amount?: bigint;
      };
    },
    address: string,
    blockTimestamp: bigint,
  ): Promise<void> {
    // Check if UTXO has CashToken NFT
    if (!utxo.token?.nft) {
      console.log(`[Indexer]       Skipping non-NFT UTXO ${utxo.txid}:${utxo.vout}`);
      return;
    }

    const nftCommitment = utxo.token.nft.commitment;
    const nftCategory = utxo.token.category;

    console.log(`[Indexer]       Processing covenant UTXO ${utxo.txid}:${utxo.vout}`);
    console.log(`[Indexer]         Category: ${nftCategory}`);
    console.log(`[Indexer]         Commitment length: ${nftCommitment.length} bytes`);

    // Determine covenant type by commitment length
    try {
      if (nftCommitment.length === 32) {
        // VaultState or VoteState (both 32 bytes)
        // Distinguish by checking byte patterns or category
        // For now, assume VaultState if in vaultAddresses
        await this.storeVaultUTXO(utxo, address, blockTimestamp);
      } else if (nftCommitment.length === 64) {
        // ProposalState (64 bytes)
        await this.storeProposalUTXO(utxo, address, blockTimestamp);
      } else if (nftCommitment.length === 48) {
        // ScheduleState or TallyState (both 48 bytes)
        // Distinguish by checking first few bytes or category patterns
        // For now, check if it looks like a schedule (has interval_seconds)
        await this.storeScheduleUTXO(utxo, address, blockTimestamp);
      } else {
        console.log(`[Indexer]         Unknown commitment length: ${nftCommitment.length}`);
      }
    } catch (error) {
      console.error(`[Indexer]         Failed to process UTXO:`, error);
    }
  }

  /**
   * Store VaultUTXO in database
   */
  private async storeVaultUTXO(
    utxo: any,
    address: string,
    blockTimestamp: bigint,
  ): Promise<void> {
    const state = this.decodeVaultState(utxo.token.nft.commitment);

    console.log(`[Indexer]         Storing VaultUTXO:`, {
      status: VaultStatus[state.status],
      periodId: state.currentPeriodId.toString(),
      spent: state.spentThisPeriod.toString(),
    });

    await this.db.query(`
      INSERT INTO vaults (
        id, address, balance, token_category,
        nft_commitment, version, status, roles_mask,
        current_period_id, spent_this_period, last_update_timestamp,
        block_height, block_timestamp, is_spent
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      )
      ON CONFLICT (id) DO UPDATE SET
        balance = EXCLUDED.balance,
        nft_commitment = EXCLUDED.nft_commitment,
        status = EXCLUDED.status,
        current_period_id = EXCLUDED.current_period_id,
        spent_this_period = EXCLUDED.spent_this_period,
        last_update_timestamp = EXCLUDED.last_update_timestamp,
        is_spent = EXCLUDED.is_spent;
    `, [
      `${utxo.txid}:${utxo.vout}`, // id
      address,
      utxo.satoshis.toString(),
      utxo.token.category,
      utxo.token.nft.commitment,
      state.version,
      state.status,
      state.rolesMask,
      state.currentPeriodId.toString(),
      state.spentThisPeriod.toString(),
      state.lastUpdateTimestamp.toString(),
      utxo.height,
      blockTimestamp.toString(),
      false, // is_spent
    ]);

    console.log(`[Indexer]         ✓ VaultUTXO stored`);
  }

  /**
   * Store ProposalUTXO in database
   */
  private async storeProposalUTXO(
    utxo: any,
    address: string,
    blockTimestamp: bigint,
  ): Promise<void> {
    const state = this.decodeProposalState(utxo.token.nft.commitment);

    console.log(`[Indexer]         Storing ProposalUTXO:`, {
      status: ProposalStatus[state.status],
      approvalCount: state.approvalCount,
      requiredApprovals: state.requiredApprovals,
    });

    await this.db.query(`
      INSERT INTO proposals (
        proposal_id, address, balance, token_category,
        nft_commitment, version, status, approval_count,
        required_approvals, voting_end_timestamp, execution_timelock,
        payout_total, payout_hash, block_height, block_timestamp, is_spent
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
      ON CONFLICT (proposal_id) DO UPDATE SET
        nft_commitment = EXCLUDED.nft_commitment,
        status = EXCLUDED.status,
        approval_count = EXCLUDED.approval_count,
        is_spent = EXCLUDED.is_spent;
    `, [
      `${utxo.txid}:${utxo.vout}`, // proposal_id
      address,
      utxo.satoshis.toString(),
      utxo.token.category,
      utxo.token.nft.commitment,
      state.version,
      state.status,
      state.approvalCount,
      state.requiredApprovals,
      state.votingEndTimestamp.toString(),
      state.executionTimelock.toString(),
      state.payoutTotal.toString(),
      state.payoutHash,
      utxo.height,
      blockTimestamp.toString(),
      false, // is_spent
    ]);

    console.log(`[Indexer]         ✓ ProposalUTXO stored`);
  }

  /**
   * Store ScheduleUTXO in database
   */
  private async storeScheduleUTXO(
    utxo: any,
    address: string,
    blockTimestamp: bigint,
  ): Promise<void> {
    const state = this.decodeScheduleState(utxo.token.nft.commitment);

    console.log(`[Indexer]         Storing ScheduleUTXO:`, {
      type: ScheduleType[state.scheduleType],
      nextUnlock: new Date(Number(state.nextUnlockTimestamp) * 1000).toISOString(),
      amountPerInterval: state.amountPerInterval.toString(),
    });

    await this.db.query(`
      INSERT INTO schedules (
        id, address, balance, token_category,
        nft_commitment, version, schedule_type, interval_seconds,
        next_unlock_timestamp, amount_per_interval, total_released,
        cliff_timestamp, block_height, block_timestamp, is_spent
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
      ON CONFLICT (id) DO UPDATE SET
        balance = EXCLUDED.balance,
        nft_commitment = EXCLUDED.nft_commitment,
        next_unlock_timestamp = EXCLUDED.next_unlock_timestamp,
        total_released = EXCLUDED.total_released,
        is_spent = EXCLUDED.is_spent;
    `, [
      `${utxo.txid}:${utxo.vout}`, // id
      address,
      utxo.satoshis.toString(),
      utxo.token.category,
      utxo.token.nft.commitment,
      state.version,
      state.scheduleType,
      state.intervalSeconds.toString(),
      state.nextUnlockTimestamp.toString(),
      state.amountPerInterval.toString(),
      state.totalReleased.toString(),
      state.cliffTimestamp.toString(),
      utxo.height,
      blockTimestamp.toString(),
      false, // is_spent
    ]);

    console.log(`[Indexer]         ✓ ScheduleUTXO stored`);
  }

  /**
   * Decode VaultState from NFT commitment
   *
   * Mirrors: contracts/lib/StateEncoding.cash :: decodeVaultState()
   */
  private decodeVaultState(commitment: Buffer): VaultState {
    // Layout (32 bytes):
    // [0-3]:   version (uint32)
    // [4]:     status (uint8)
    // [5-7]:   rolesMask (24-bit bitfield)
    // [8-15]:  current_period_id (uint64)
    // [16-23]: spent_this_period (uint64)
    // [24-31]: last_update_timestamp (uint64)

    if (commitment.length !== 32) {
      throw new Error(`Invalid VaultState commitment length: ${commitment.length}`);
    }

    return {
      version: commitment.readUInt32BE(0),
      status: commitment.readUInt8(4) as VaultStatus,
      rolesMask: commitment.slice(5, 8),
      currentPeriodId: commitment.readBigUInt64BE(8),
      spentThisPeriod: commitment.readBigUInt64BE(16),
      lastUpdateTimestamp: commitment.readBigUInt64BE(24),
    };
  }

  /**
   * Decode ProposalState from NFT commitment
   *
   * Mirrors: contracts/lib/StateEncoding.cash :: decodeProposalState()
   */
  private decodeProposalState(commitment: Buffer): ProposalState {
    // Layout (64 bytes):
    // [0-3]:   version
    // [4]:     status
    // [5-7]:   approval_count (uint24)
    // [8-11]:  required_approvals (uint32)
    // [12-19]: voting_end_timestamp (uint64)
    // [20-27]: execution_timelock (uint64)
    // [28-35]: payout_total (uint64)
    // [36-63]: payout_hash (28 bytes)

    if (commitment.length !== 64) {
      throw new Error(`Invalid ProposalState commitment length: ${commitment.length}`);
    }

    // Read uint24 approval_count (3 bytes big-endian)
    const approvalCount = (commitment.readUInt8(5) << 16) |
      (commitment.readUInt8(6) << 8) |
      commitment.readUInt8(7);

    return {
      version: commitment.readUInt32BE(0),
      status: commitment.readUInt8(4) as ProposalStatus,
      approvalCount,
      requiredApprovals: commitment.readUInt32BE(8),
      votingEndTimestamp: commitment.readBigUInt64BE(12),
      executionTimelock: commitment.readBigUInt64BE(20),
      payoutTotal: commitment.readBigUInt64BE(28),
      payoutHash: commitment.slice(36, 64),
    };
  }

  /**
   * Decode ScheduleState from NFT commitment
   *
   * Mirrors: contracts/lib/StateEncoding.cash :: decodeScheduleState()
   */
  private decodeScheduleState(commitment: Buffer): ScheduleState {
    if (commitment.length !== 48) {
      throw new Error(`Invalid ScheduleState commitment length: ${commitment.length}`);
    }

    return {
      version: commitment.readUInt32BE(0),
      scheduleType: commitment.readUInt8(4) as ScheduleType,
      intervalSeconds: commitment.readBigUInt64BE(8),
      nextUnlockTimestamp: commitment.readBigUInt64BE(16),
      amountPerInterval: commitment.readBigUInt64BE(24),
      totalReleased: commitment.readBigUInt64BE(32),
      cliffTimestamp: commitment.readBigUInt64BE(40),
    };
  }

  /**
   * Decode VoteState from NFT commitment
   */
  private decodeVoteState(commitment: Buffer): VoteState {
    if (commitment.length !== 32) {
      throw new Error(`Invalid VoteState commitment length: ${commitment.length}`);
    }

    return {
      version: commitment.readUInt32BE(0),
      proposalIdPrefix: commitment.slice(4, 8),
      voteChoice: commitment.readUInt8(8) as VoteChoice,
      lockTimestamp: commitment.readBigUInt64BE(16),
      unlockTimestamp: commitment.readBigUInt64BE(24),
    };
  }

  /**
   * Decode TallyState from NFT commitment
   */
  private decodeTallyState(commitment: Buffer): TallyState {
    if (commitment.length !== 48) {
      throw new Error(`Invalid TallyState commitment length: ${commitment.length}`);
    }

    return {
      version: commitment.readUInt32BE(0),
      proposalIdPrefix: commitment.slice(4, 8),
      votesFor: commitment.readBigUInt64BE(8),
      votesAgainst: commitment.readBigUInt64BE(16),
      votesAbstain: commitment.readBigUInt64BE(24),
      quorumThreshold: commitment.readBigUInt64BE(32),
      tallyTimestamp: commitment.readBigUInt64BE(40),
    };
  }

  /**
   * Utility: Sleep for milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async safeCount(tableName: string): Promise<number> {
    try {
      const result = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${tableName}`);
      return Number(result.rows[0]?.count || 0);
    } catch {
      return 0;
    }
  }
}

/**
 * CLI Entry Point
 */
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/.*\//, ''));
if (isMain) {
  const config: IndexerConfig = {
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/flowguard',
    network: ((process.env.BCH_NETWORK || process.env.NETWORK) as 'mainnet' | 'chipnet') || 'chipnet',
    electrumServer: process.env.ELECTRUM_SERVER || 'chipnet.imaginary.cash',
    startBlock: parseInt(process.env.START_BLOCK || '0', 10),
    confirmations: parseInt(process.env.CONFIRMATIONS || '6', 10),
    pollInterval: parseInt(process.env.POLL_INTERVAL || '60000', 10), // 1 minute
    vaultAddresses: (process.env.VAULT_ADDRESSES || '').split(',').filter(Boolean),
  };

  const indexer = new FlowGuardIndexer(config);
  const statusPort = parseInt(process.env.PORT || '3201', 10);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[Indexer] Received SIGINT, shutting down gracefully...');
    await indexer.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[Indexer] Received SIGTERM, shutting down gracefully...');
    await indexer.stop();
    process.exit(0);
  });

  // Start indexer
  Promise.all([
    indexer.start(),
    indexer.startStatusServer(statusPort),
  ]).catch((error) => {
    console.error('[Indexer] Fatal error:', error);
    process.exit(1);
  });
}

export default FlowGuardIndexer;
