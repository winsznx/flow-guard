import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import vaultsRouter from './api/vaults.js';
import proposalsRouter from './api/proposals.js';
import cyclesRouter from './api/cycles.js';
import deploymentRouter from './api/deployment.js';
import transactionsRouter from './api/transactions.js';
import walletRouter from './api/wallet.js';
import budgetPlansRouter from './api/budgetPlans.js';
import streamsRouter from './api/streams.js';
import paymentsRouter from './api/payments.js';
import airdropsRouter from './api/airdrops.js';
import rewardsRouter from './api/rewards.js';
import bountiesRouter from './api/bounties.js';
import grantsRouter from './api/grants.js';
import governanceRouter from './api/governance.js';
import explorerRouter from './api/explorer.js';
import explorerAdvancedRouter from './api/explorer-advanced.js';
import adminRouter from './api/admin.js';
import statusRouter from './api/status.js';
import priceRouter from './api/price.js';
import authRouter from './api/auth.js';
import { initializeSchema } from './database/init.js';
import { initializeMasterKey } from './utils/keyEncryption.js';
import { startBlockchainMonitor, stopBlockchainMonitor } from './services/blockchain-monitor.js';
import { startCycleUnlockScheduler, stopCycleUnlockScheduler } from './services/cycle-unlock-scheduler.js';
import { startTransactionMonitor, stopTransactionMonitor } from './services/TransactionMonitor.js';
import { errorHandler } from './middleware/errorHandler.js';
import { generalLimiter, strictLimiter, queryLimiter } from './middleware/rateLimiter.js';
import { requestLogger } from './middleware/requestLogger.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Trust first proxy (Vercel / Railway / nginx) so rate-limit + req.ip see real client addresses.
// Must be set BEFORE route/middleware registration.
app.set('trust proxy', 1);

// CORS allowlist — explicit. Wildcard reflection + credentials is a cross-site takeover vector.
// Configure via CORS_ALLOWED_ORIGINS (comma-separated). Supports exact match and *.host wildcard patterns.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://flowguard.cash',
  'https://www.flowguard.cash',
  'https://docs.flowguard.cash',
  'https://*.vercel.app',
];
const allowedOriginsConfig = (process.env.CORS_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowLocalhostInDev = process.env.NODE_ENV !== 'production';

function originAllowed(origin: string): boolean {
  if (allowLocalhostInDev && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }
  return allowedOriginsConfig.some((pattern) => {
    if (pattern === origin) return true;
    if (pattern.startsWith('https://*.')) {
      const suffix = pattern.slice('https://*.'.length);
      return origin.startsWith('https://') && origin.endsWith(`.${suffix}`);
    }
    return false;
  });
}

app.use(cors({
  origin: (origin, callback) => {
    // Same-origin / curl / server-side: no Origin header — allow; nothing to leak cross-site.
    if (!origin) return callback(null, true);
    if (originAllowed(origin)) return callback(null, true);
    return callback(new Error(`Origin not allowed: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-user-address',
    'x-signer-public-key',
    'x-signed-nonce',
    'x-nonce-id',
  ],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400,
  optionsSuccessStatus: 200,
}));
app.use(express.json({ limit: '1mb' }));

// Structured access logs + per-request correlation ID (also surfaced as
// `x-request-id` response header so customers can quote it in support tickets).
app.use(requestLogger);

// Apply rate limiting globally
app.use('/api', generalLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'flowguard-backend', blockchain: 'connected' });
});

// API routes
// Apply strict rate limiting only to expensive creation/build endpoints
app.post('/api/vaults', strictLimiter);
app.post('/api/streams/create', strictLimiter);
app.post('/api/treasuries/:vaultId/batch-create', strictLimiter);
app.post('/api/payments/create', strictLimiter);
app.post('/api/airdrops/create', strictLimiter);
app.post('/api/airdrops/:id/generate-merkle', strictLimiter);
app.post('/api/rewards/create', strictLimiter);
app.post('/api/bounties/create', strictLimiter);
app.post('/api/grants/create', strictLimiter);
app.post('/api/vaults/:vaultId/budget-plans', strictLimiter);
app.get('/api/admin/export', strictLimiter);
// Apply query rate limiting to read-only endpoints
app.use('/api/explorer', queryLimiter);

app.use('/api', authRouter); // Nonce issuance — no auth required
app.use('/api/vaults', vaultsRouter);
app.use('/api', budgetPlansRouter); // Register BEFORE proposals to avoid route conflicts
app.use('/api', cyclesRouter);
app.use('/api/deployment', deploymentRouter);
app.use('/api', transactionsRouter);
app.use('/api/wallet', walletRouter);
app.use('/api', streamsRouter); // Vesting streams
app.use('/api', paymentsRouter); // Recurring payments
app.use('/api', airdropsRouter); // Mass distributions
app.use('/api', rewardsRouter); // Reward distributions
app.use('/api', bountiesRouter); // Bounty campaigns
app.use('/api', grantsRouter); // Grant programs
app.use('/api', governanceRouter); // Treasury governance
app.use('/api', explorerRouter); // Public activity explorer
app.use('/api', explorerAdvancedRouter); // Advanced explorer features
app.use('/api', statusRouter); // Public status surface (no auth)
app.use('/api', priceRouter);  // Public BCH price feed (no auth)
app.use('/api', adminRouter); // Admin/operator endpoints
app.use('/api', proposalsRouter); // LAST - has catch-all /:id routes

app.get('/api', (req, res) => {
  res.json({ message: 'FlowGuard API', version: '0.1.0', network: 'chipnet' });
});

// Error handler middleware (MUST be last)
app.use(errorHandler);

async function startServer() {
  console.log('[db] Initializing Postgres schema...');
  await initializeSchema();

  console.log('[crypto] Loading master key...');
  await initializeMasterKey();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 FlowGuard backend running on port ${PORT}`);
    console.log(`📡 Network: ${process.env.BCH_NETWORK || 'chipnet'}`);

    console.log('🔗 Starting blockchain monitor...');
    startBlockchainMonitor(30000);

    console.log('⏰ Starting cycle unlock scheduler...');
    startCycleUnlockScheduler(60000);

    console.log('📊 Starting transaction monitor...');
    startTransactionMonitor(30000);
  });
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  stopBlockchainMonitor();
  stopCycleUnlockScheduler();
  stopTransactionMonitor();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  stopBlockchainMonitor();
  stopCycleUnlockScheduler();
  stopTransactionMonitor();
  process.exit(0);
});
