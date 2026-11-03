import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
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
import { generalLimiter, strictLimiter, queryLimiter, statusLimiter } from './middleware/rateLimiter.js';
import { requestLogger } from './middleware/requestLogger.js';
import { resolveBchNetwork } from './utils/network.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// One proxy hop in front of us: Caddy on the VPS, terminating TLS and forwarding to
// 127.0.0.1:3001. Must be set BEFORE route/middleware registration.
//
// This makes req.ip the address Caddy saw, which for traffic arriving through the
// Cloudflare Worker is a Cloudflare egress address, not the visitor. Rate limiting
// therefore does not key on req.ip alone — see clientRateLimitKey.
app.set('trust proxy', 1);

/**
 * Security headers. The API is JSON-only and never renders HTML, so the useful set
 * is narrow: stop it being framed, stop MIME sniffing, force HTTPS on repeat visits,
 * and drop the Express fingerprint.
 *
 * crossOriginResourcePolicy is deliberately 'cross-origin' rather than helmet's
 * 'same-origin' default. This API is meant to be called from other origins under
 * CORS (the wallet add-on, and any SDK consumer); the same-origin default would
 * block exactly those reads that the allowlist above is there to permit.
 */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // helmet defaults this to SAMEORIGIN, which would contradict the
  // frame-ancestors 'none' above for older browsers that only honour the header.
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    // No preload: that is a one-way door on the public HSTS list and belongs to a
    // deliberate decision about the whole flowguard.cash zone, not to this service.
    preload: false,
  },
}));

// CORS allowlist — explicit. Wildcard reflection + credentials is a cross-site takeover vector.
// Configure via CORS_ALLOWED_ORIGINS (comma-separated). Supports exact match and *.host wildcard patterns.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://flowguard.cash',
  'https://www.flowguard.cash',
  'https://app.flowguard.cash',
  'https://docs.flowguard.cash',
  'https://*.vercel.app',
];
const allowedOriginsConfig = (process.env.CORS_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowLocalhostInDev = process.env.NODE_ENV !== 'production';

/**
 * Origins presented by native WebView shells (Capacitor / Ionic), which is what a
 * wallet-hosted FlowGuard add-on runs as. Exact-match only, no wildcards, no port
 * range: these four literals are the complete set Capacitor 6 emits.
 *
 * Opt-in via CORS_ALLOW_NATIVE_APP_ORIGINS=true so the default production posture is
 * unchanged until an add-on actually ships. Not needed for Phase 1 (WalletConnect
 * pairing runs from a normal https origin) — landed now so the add-on PR does not
 * have to touch CORS under time pressure.
 */
const NATIVE_APP_ORIGINS: ReadonlySet<string> = new Set([
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'https://localhost',
]);
const allowNativeAppOrigins = process.env.CORS_ALLOW_NATIVE_APP_ORIGINS === 'true';

function originAllowed(origin: string): boolean {
  if (allowLocalhostInDev && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }
  if (allowNativeAppOrigins && NATIVE_APP_ORIGINS.has(origin)) {
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

/**
 * Marker for a rejected cross-origin request, so the handler below can answer 403
 * instead of letting it fall through to the generic 500. `cors` has no other way to
 * signal refusal: its origin callback either allows or errors.
 */
class OriginNotAllowedError extends Error {
  readonly origin: string;
  constructor(origin: string) {
    super(`Origin not allowed: ${origin}`);
    this.name = 'OriginNotAllowedError';
    this.origin = origin;
  }
}

app.use(cors({
  origin: (origin, callback) => {
    // Same-origin / curl / server-side: no Origin header — allow; nothing to leak cross-site.
    if (!origin) return callback(null, true);
    if (originAllowed(origin)) return callback(null, true);
    return callback(new OriginNotAllowedError(origin));
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

/**
 * A disallowed origin is a configuration answer, not a server fault. Left to the
 * generic handler it surfaced as 500 INTERNAL_ERROR, which reads as "the API is
 * broken" and sent people debugging the wrong thing. Deliberately still a hard
 * refusal rather than a silent `callback(null, false)`: a missing allowlist entry
 * should fail loudly, and no ACAO header is emitted either way.
 */
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (!(err instanceof OriginNotAllowedError)) return next(err);
  res.status(403).json({
    error: 'ORIGIN_NOT_ALLOWED',
    message: 'This origin is not in the API allowlist.',
    origin: err.origin,
    timestamp: Date.now(),
  });
});

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
app.use('/api/status', statusLimiter);

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
  // Report the network this process actually resolved. Previously hardcoded to
  // 'chipnet', which silently misreported every mainnet deploy — and this is the
  // field a client uses to detect a frontend/backend network mismatch.
  res.json({ message: 'FlowGuard API', version: '0.1.0', network: resolveBchNetwork() });
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
    // Same resolver the API and covenant builders use, so the banner cannot
    // disagree with the network the process actually runs on.
    console.log(`📡 Network: ${resolveBchNetwork()}`);

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
