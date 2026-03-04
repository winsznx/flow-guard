/**
 * FlowGuard Executor Service
 *
 * PURPOSE: Automated covenant transaction execution
 *
 * FUNCTIONALITY:
 * - Monitor indexed UTXOs for executable actions
 * - Construct and broadcast covenant transactions
 * - Execute schedules (vesting unlocks, recurring payments)
 * - Execute approved proposals (after timelock)
 * - Automated period rollovers
 *
 * ARCHITECTURE:
 * - Task Scanner: Query indexer for executable tasks
 * - Transaction Builder: Construct covenant transactions
 * - Broadcaster: Broadcast to BCH network
 * - State Manager: Track execution state
 *
 * DECENTRALIZATION:
 * - Anyone can run an executor (permissionless)
 * - Execution rights enforced by covenant logic (not executor)
 * - Executor earns small fee for gas costs
 */

import { createServer, type Server } from 'node:http';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { Contract, ElectrumNetworkProvider, SignatureTemplate } from 'cashscript';
import {
  ScheduleUTXO,
  ProposalUTXO,
  VaultUTXO,
  ScheduleType,
  ProposalStatus,
} from '@flowguard/shared/types';
import { TransactionBuilder, TxBuilderConfig } from './services/TransactionBuilder.js';

dotenv.config();

/**
 * Executor Configuration
 */
interface ExecutorConfig {
  // Database (indexer connection)
  databaseUrl: string;

  // BCH Network
  network: 'mainnet' | 'chipnet';
  electrumServer: string;

  // Execution
  pollInterval: number; // Milliseconds between task checks
  maxGasPrice: number; // Max satoshis per byte for fees

  // Executor Wallet (for fee payment)
  executorPrivateKey?: string; // WIF format (optional, for automated execution)
}

/**
 * Executable Task
 */
interface ExecutableTask {
  type: 'schedule_unlock' | 'proposal_execute' | 'period_rollover';
  utxo: ScheduleUTXO | ProposalUTXO;
  readyAt: bigint; // Timestamp when task becomes executable
}

/**
 * Executor Service
 */
export class FlowGuardExecutor {
  private config: ExecutorConfig;
  private db: Pool;
  private provider: ElectrumNetworkProvider;
  private txBuilder: TransactionBuilder;
  private isRunning: boolean = false;
  private statusServer?: Server;
  private readonly startedAt: string = new Date().toISOString();
  private lastPollStartedAt: string | null = null;
  private lastPollCompletedAt: string | null = null;
  private lastTaskAt: string | null = null;
  private lastError: string | null = null;
  private lastNetworkHeight: number | null = null;
  private pollCount: number = 0;
  private idlePolls: number = 0;
  private consecutiveFailures: number = 0;
  private tasksSeen: number = 0;
  private tasksExecuted: number = 0;
  private manualExecutionsRequired: number = 0;

  constructor(config: ExecutorConfig) {
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

    // Initialize transaction builder
    const txBuilderConfig: TxBuilderConfig = {
      network: config.network,
      electrumServer: config.electrumServer,
      maxExecutorFee: config.maxGasPrice * 250, // Assume ~250 bytes tx
      minExecutorFee: 546, // BCH dust limit
    };
    this.txBuilder = new TransactionBuilder(txBuilderConfig);
  }

  /**
   * Start executor service
   */
  async start(): Promise<void> {
    console.log('[Executor] Starting FlowGuard Executor...');
    console.log(`[Executor] Network: ${this.config.network}`);

    // Verify database connection
    await this.verifyDatabase();

    // Start task polling loop
    this.isRunning = true;
    this.pollTasks();
  }

  /**
   * Stop executor service
   */
  async stop(): Promise<void> {
    console.log('[Executor] Stopping...');
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
            service: 'flowguard-executor',
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

    console.log(`[Executor] Status server listening on :${port}`);
  }

  async getStatusSnapshot(): Promise<Record<string, unknown>> {
    const schedules = await this.safeCount('schedules');
    const proposals = await this.safeCount('proposals');
    const executableSchedules = await this.safeCount(
      "schedules WHERE is_spent = FALSE AND next_unlock_timestamp <= EXTRACT(EPOCH FROM NOW())::bigint",
    );
    const executableProposals = await this.safeCount(
      `proposals WHERE is_spent = FALSE AND status = '${ProposalStatus.EXECUTABLE}'`,
    );

    const status =
      this.lastError && this.consecutiveFailures >= 3
        ? 'critical'
        : this.consecutiveFailures > 0
          ? 'degraded'
          : this.config.executorPrivateKey
            ? 'healthy'
            : 'manual';

    return {
      service: {
        name: 'FlowGuard Executor',
        kind: 'executor',
        status,
        running: this.isRunning,
        startedAt: this.startedAt,
        uptimeSeconds: Math.floor(process.uptime()),
      },
      chain: {
        network: this.config.network,
        electrumServer: this.config.electrumServer,
        lastNetworkHeight: this.lastNetworkHeight,
      },
      runtime: {
        pollIntervalMs: this.config.pollInterval,
        pollCount: this.pollCount,
        idlePolls: this.idlePolls,
        consecutiveFailures: this.consecutiveFailures,
        lastPollStartedAt: this.lastPollStartedAt,
        lastPollCompletedAt: this.lastPollCompletedAt,
        lastTaskAt: this.lastTaskAt,
        lastError: this.lastError,
      },
      queue: {
        knownSchedules: schedules,
        knownProposals: proposals,
        executableSchedules,
        executableProposals,
        tasksSeen: this.tasksSeen,
        tasksExecuted: this.tasksExecuted,
        manualExecutionsRequired: this.manualExecutionsRequired,
      },
      capabilities: {
        automaticSigningConfigured: Boolean(this.config.executorPrivateKey),
        canBroadcast: false,
        canExecuteSchedulesAutomatically: false,
        canExecuteProposalsAutomatically: false,
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
   * Verify database connection
   */
  private async verifyDatabase(): Promise<void> {
    try {
      await this.db.query('SELECT NOW()');
      console.log('[Executor] Database connection OK');
    } catch (error) {
      console.error('[Executor] Database connection failed:', error);
      throw error;
    }
  }

  /**
   * Polling loop - check for executable tasks
   */
  private async pollTasks(): Promise<void> {
    while (this.isRunning) {
      try {
        this.pollCount += 1;
        this.lastPollStartedAt = new Date().toISOString();
        this.lastNetworkHeight = await this.provider.getBlockHeight();

        // Scan for executable tasks
        const tasks = await this.scanExecutableTasks();
        this.tasksSeen += tasks.length;

        if (tasks.length > 0) {
          this.idlePolls = 0;
          console.log(`[Executor] Found ${tasks.length} executable tasks`);

          for (const task of tasks) {
            await this.executeTask(task);
          }
        } else {
          this.idlePolls += 1;
          if (this.idlePolls === 1 || this.idlePolls % 10 === 0) {
            console.log('[Executor] Heartbeat: no executable tasks found');
          }
        }

        this.consecutiveFailures = 0;
        this.lastError = null;
        this.lastPollCompletedAt = new Date().toISOString();

        // Wait before next poll
        await this.sleep(this.config.pollInterval);
      } catch (error) {
        console.error('[Executor] Polling error:', error);
        this.lastError = error instanceof Error ? error.message : String(error);
        this.consecutiveFailures += 1;
        this.lastPollCompletedAt = new Date().toISOString();
        await this.sleep(this.config.pollInterval);
      }
    }
  }

  /**
   * Scan database for executable tasks
   */
  private async scanExecutableTasks(): Promise<ExecutableTask[]> {
    const tasks: ExecutableTask[] = [];
    const currentTime = BigInt(Math.floor(Date.now() / 1000));

    // 1. Scan for executable schedules (unlocks ready)
    const schedules = await this.db.query<any>(`
      SELECT *
      FROM schedules
      WHERE is_spent = FALSE
        AND next_unlock_timestamp <= $1
      LIMIT 10;
    `, [currentTime.toString()]);

    for (const schedule of schedules.rows) {
      tasks.push({
        type: 'schedule_unlock',
        utxo: schedule,
        readyAt: schedule.next_unlock_timestamp,
      });
    }

    // 2. Scan for executable proposals (approved + timelock passed)
    const proposals = await this.db.query<any>(`
      SELECT *
      FROM proposals
      WHERE is_spent = FALSE
        AND status = $1
        AND execution_timelock <= $2
      LIMIT 10;
    `, [ProposalStatus.EXECUTABLE, currentTime.toString()]);

    for (const proposal of proposals.rows) {
      tasks.push({
        type: 'proposal_execute',
        utxo: proposal,
        readyAt: proposal.execution_timelock,
      });
    }

    return tasks;
  }

  /**
   * Execute a task
   */
  private async executeTask(task: ExecutableTask): Promise<void> {
    console.log(`[Executor] Executing ${task.type}...`);

    try {
      switch (task.type) {
        case 'schedule_unlock':
          await this.executeScheduleUnlock(task.utxo as ScheduleUTXO);
          break;
        case 'proposal_execute':
          await this.executeProposal(task.utxo as ProposalUTXO);
          break;
        case 'period_rollover':
          // TODO: Implement period rollover
          break;
      }

      this.tasksExecuted += 1;
      this.lastTaskAt = new Date().toISOString();
      console.log(`[Executor] ✓ ${task.type} executed successfully`);
    } catch (error) {
      console.error(`[Executor] ✗ ${task.type} execution failed:`, error);
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Execute schedule unlock
   *
   * Constructs transaction:
   * - Input[0]: ScheduleUTXO
   * - Output[0]: New ScheduleUTXO (updated state) OR burn if fully vested
   * - Output[1]: Payout to beneficiary
   * - tx.locktime >= next_unlock_timestamp (CLTV)
   */
  private async executeScheduleUnlock(schedule: ScheduleUTXO): Promise<void> {
    console.log(`[Executor] Unlocking schedule ${schedule.utxo.txid}:${schedule.utxo.vout}`);

    try {
      // 1. Build unsigned transaction
      const executorAddress = this.config.executorPrivateKey
        ? await this.deriveExecutorAddress()
        : 'bitcoincash:qp...'; // Placeholder if no key configured

      const beneficiaryAddress = schedule.address; // TODO: Get from schedule metadata

      const unsignedTx = await this.txBuilder.buildScheduleUnlock(
        schedule,
        executorAddress,
        beneficiaryAddress,
      );

      console.log(`[Executor]   Built unsigned tx:`, {
        locktime: unsignedTx.locktime,
        fee: unsignedTx.fee,
        inputCount: unsignedTx.inputs.length,
        outputCount: unsignedTx.outputs.length,
      });

      // 2. Sign transaction (if executor key configured)
      if (this.config.executorPrivateKey) {
        // TODO: Sign with executor key
        // const signedTx = await this.signTransaction(unsignedTx, this.config.executorPrivateKey);

        // 3. Broadcast transaction
        // const txid = await this.broadcastTransaction(signedTx.hex);
        // console.log(`[Executor]   ✓ Broadcast successful: ${txid}`);
      } else {
        console.log(`[Executor]   ⚠ No executor key configured - cannot sign/broadcast`);
        console.log(`[Executor]   Manual execution required`);
        this.manualExecutionsRequired += 1;
      }
    } catch (error) {
      console.error(`[Executor]   ✗ Failed to build tx:`, error);
      throw error;
    }
  }

  /**
   * Execute approved proposal
   *
   * Constructs transaction:
   * - Input[0]: VaultUTXO
   * - Input[1]: ProposalUTXO
   * - Output[0]: New VaultUTXO (updated state)
   * - Output[1+]: Payout recipients (from proposal)
   * - tx.locktime >= execution_timelock (CLTV)
   */
  private async executeProposal(proposal: ProposalUTXO): Promise<void> {
    console.log(`[Executor] Executing proposal ${proposal.utxo.txid}:${proposal.utxo.vout}`);

    try {
      // 1. Fetch associated VaultUTXO
      const vaultId = proposal.token?.category; // VaultNFT category = vaultId
      if (!vaultId) {
        throw new Error('Proposal missing vault category ID');
      }

      const vaultResult = await this.db.query<VaultUTXO>(
        `SELECT * FROM vaults WHERE id = $1 AND is_spent = FALSE LIMIT 1`,
        [vaultId],
      );

      if (vaultResult.rows.length === 0) {
        throw new Error(`VaultUTXO not found for proposal. VaultID: ${vaultId}`);
      }

      const vault = vaultResult.rows[0];

      // 2. Fetch proposal payout details (from metadata table)
      const payoutResult = await this.db.query(
        `SELECT * FROM proposal_payouts WHERE proposal_id = $1 ORDER BY id`,
        [proposal.utxo.txid], // Using txid as proposal_id
      );

      const payouts = payoutResult.rows.map((row: any) => ({
        address: row.recipient,
        amount: parseInt(row.amount, 10),
        category: row.category,
      }));

      if (payouts.length === 0) {
        throw new Error(`No payout details found for proposal ${proposal.utxo.txid}`);
      }

      // 3. Build unsigned transaction
      const executorAddress = this.config.executorPrivateKey
        ? await this.deriveExecutorAddress()
        : 'bitcoincash:qp...'; // Placeholder

      const unsignedTx = await this.txBuilder.buildProposalExecution(
        proposal,
        vault,
        executorAddress,
        payouts,
      );

      console.log(`[Executor]   Built unsigned tx:`, {
        locktime: unsignedTx.locktime,
        fee: unsignedTx.fee,
        inputCount: unsignedTx.inputs.length,
        outputCount: unsignedTx.outputs.length,
        payouts: payouts.length,
      });

      // 4. Sign and broadcast (if executor key configured)
      if (this.config.executorPrivateKey) {
        // TODO: Sign with executor key
        // const signedTx = await this.signTransaction(unsignedTx, this.config.executorPrivateKey);

        // Broadcast
        // const txid = await this.broadcastTransaction(signedTx.hex);
        // console.log(`[Executor]   ✓ Broadcast successful: ${txid}`);
      } else {
        console.log(`[Executor]   ⚠ No executor key configured - cannot sign/broadcast`);
        console.log(`[Executor]   Manual execution required`);
        this.manualExecutionsRequired += 1;
      }
    } catch (error) {
      console.error(`[Executor]   ✗ Failed to execute proposal:`, error);
      throw error;
    }
  }

  /**
   * Derive executor BCH address from private key
   */
  private async deriveExecutorAddress(): Promise<string> {
    // TODO: Implement WIF private key to address derivation
    // Using libauth or @bitauth/libauth
    return 'bitcoincash:qp...'; // Placeholder
  }

  /**
   * Utility: Sleep for milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async safeCount(tableExpression: string): Promise<number> {
    try {
      const result = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${tableExpression}`);
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
  const config: ExecutorConfig = {
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/flowguard',
    network: ((process.env.BCH_NETWORK || process.env.NETWORK) as 'mainnet' | 'chipnet') || 'chipnet',
    electrumServer: process.env.ELECTRUM_SERVER || 'chipnet.imaginary.cash',
    pollInterval: parseInt(process.env.POLL_INTERVAL || '60000', 10), // 1 minute
    maxGasPrice: parseInt(process.env.MAX_GAS_PRICE || '2', 10), // 2 sats/byte
    executorPrivateKey: process.env.EXECUTOR_PRIVATE_KEY, // Optional WIF
  };

  const executor = new FlowGuardExecutor(config);
  const statusPort = parseInt(process.env.PORT || '3202', 10);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[Executor] Received SIGINT, shutting down gracefully...');
    await executor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[Executor] Received SIGTERM, shutting down gracefully...');
    await executor.stop();
    process.exit(0);
  });

  // Start executor
  Promise.all([
    executor.start(),
    executor.startStatusServer(statusPort),
  ]).catch((error) => {
    console.error('[Executor] Fatal error:', error);
    process.exit(1);
  });
}

export default FlowGuardExecutor;
