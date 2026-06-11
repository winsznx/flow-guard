/**
 * Public Status API
 *
 * Drives the public-facing /status page (Stripe / Vercel / GitHub-Status style).
 * NO AUTH — must be safe to expose to the open internet.
 *
 * Hard rules for this surface:
 *   - No process internals (memoryRssMB, heapUsedMB, nodeVersion, platform, loadavg).
 *   - No internal service URLs (INDEXER_STATUS_URL, EXECUTOR_STATUS_URL hostnames).
 *   - No raw table-row counts (attacker-useful fingerprint).
 *   - Sanitize remote service payloads before re-emitting.
 *
 * Cached for STATUS_CACHE_TTL_MS to protect upstreams from bursty clients.
 */

import { Router, Request, Response } from 'express';
import { ElectrumNetworkProvider } from 'cashscript';
import db from '../database/schema.js';

type Health = 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'maintenance' | 'unknown';
type ComponentStatus = 'operational' | 'degraded' | 'outage' | 'maintenance' | 'unknown';
type NetworkName = 'mainnet' | 'chipnet';

interface PublicComponent {
  id: string;
  name: string;
  group: 'API' | 'Frontend' | 'Docs' | 'Explorer' | 'BCH Network' | 'Workers' | 'Database';
  status: ComponentStatus;
  description: string;
  latencyMs: number | null;
  /** 90-day uptime estimate. `null` until the component_samples store exists. */
  uptime90d: number | null;
  lastIncidentAt: string | null;
}

interface PublicStatusPayload {
  updatedAt: string;
  refreshIntervalSeconds: number;
  overall: Health;
  network: {
    name: NetworkName;
    isMainnet: boolean;
    displayName: string;
    /**
     * When `true`, this deployment is on a testnet. Surface a banner on the page
     * — chipnet is NOT for production traffic.
     */
    testnetWarning: boolean;
  };
  chain: {
    height: number | null;
    ageSeconds: number | null;
    latencyMs: number | null;
    /** Last N block heights, newest last. Drives the chain sparkline. */
    recentHeights: number[];
    error: string | null;
  };
  components: PublicComponent[];
  summary: {
    operational: number;
    degraded: number;
    outage: number;
  };
  /**
   * Recent incidents. Empty until an `incidents` table exists.
   * TODO(status-phase-2): backfill from incidents/incident_updates tables.
   */
  incidents: Array<{
    id: string;
    title: string;
    status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
    severity: 'minor' | 'major' | 'critical' | 'maintenance';
    startedAt: string;
    resolvedAt: string | null;
  }>;
}

const router = Router();

const STATUS_CACHE_TTL_MS = 10_000;
const REMOTE_FETCH_TIMEOUT_MS = 4_000;
const ELECTRUM_TIMEOUT_MS = 4_000;

interface CachedStatus {
  expiresAt: number;
  payload: PublicStatusPayload;
}

let cached: CachedStatus | null = null;

function resolveNetwork(): NetworkName {
  const raw = (process.env.BCH_NETWORK || process.env.NETWORK || 'chipnet').toLowerCase();
  return raw === 'mainnet' ? 'mainnet' : 'chipnet';
}

function classifyOverall(components: PublicComponent[]): Health {
  if (components.length === 0) return 'unknown';
  const outage = components.filter((c) => c.status === 'outage').length;
  const degraded = components.filter((c) => c.status === 'degraded').length;
  const maintenance = components.filter((c) => c.status === 'maintenance').length;

  if (outage >= 2) return 'major_outage';
  if (outage === 1) return 'partial_outage';
  if (degraded > 0) return 'degraded';
  if (maintenance > 0) return 'maintenance';
  return 'operational';
}

/** Map raw worker / remote service statuses to the public component vocabulary. */
function normalizeStatus(raw: string | undefined): ComponentStatus {
  switch (raw) {
    case 'healthy':
    case 'operational':
      return 'operational';
    case 'degraded':
    case 'unknown':
    case 'manual':
      return 'degraded';
    case 'critical':
    case 'unreachable':
    case 'outage':
      return 'outage';
    case 'not_configured':
      return 'unknown';
    case 'maintenance':
      return 'maintenance';
    default:
      return 'unknown';
  }
}

async function fetchWithTimeout(url: string, timeoutMs = REMOTE_FETCH_TIMEOUT_MS): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function probeDatabase(): Promise<{ status: ComponentStatus; latencyMs: number | null; error: string | null }> {
  const startedAt = Date.now();
  try {
    await db!.prepare('SELECT 1').get();
    return { status: 'operational', latencyMs: Date.now() - startedAt, error: null };
  } catch (error: any) {
    return { status: 'outage', latencyMs: null, error: error?.message ?? 'database unreachable' };
  }
}

async function probeChainTip(network: NetworkName): Promise<{
  status: ComponentStatus;
  height: number | null;
  ageSeconds: number | null;
  latencyMs: number | null;
  recentHeights: number[];
  error: string | null;
}> {
  const provider = new ElectrumNetworkProvider(network);
  const startedAt = Date.now();

  try {
    const height = await Promise.race<number>([
      provider.getBlockHeight(),
      new Promise<number>((_, reject) => setTimeout(() => reject(new Error('electrum timeout')), ELECTRUM_TIMEOUT_MS)),
    ]);
    const latencyMs = Date.now() - startedAt;

    // Build a tiny synthetic sparkline of the last 12 block heights so the UI has
    // something deterministic to render. Real per-block timestamps belong in
    // /api/status/network/bch (future phase).
    const recentHeights: number[] = [];
    for (let i = 11; i >= 0; i--) {
      recentHeights.push(Math.max(0, height - i));
    }

    return {
      status: 'operational',
      height,
      ageSeconds: null,
      latencyMs,
      recentHeights,
      error: null,
    };
  } catch (error: any) {
    return {
      status: 'outage',
      height: null,
      ageSeconds: null,
      latencyMs: null,
      recentHeights: [],
      error: error?.message ?? 'electrum unreachable',
    };
  } finally {
    await provider.disconnect().catch(() => undefined);
  }
}

async function probeFrontendEdge(url: string | undefined, name: string, group: PublicComponent['group'], id: string, description: string): Promise<PublicComponent> {
  if (!url) {
    return {
      id,
      name,
      group,
      status: 'unknown',
      description,
      latencyMs: null,
      uptime90d: null,
      lastIncidentAt: null,
    };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    const status: ComponentStatus = response.ok ? 'operational' : response.status >= 500 ? 'outage' : 'degraded';
    return {
      id,
      name,
      group,
      status,
      description,
      latencyMs,
      uptime90d: null,
      lastIncidentAt: null,
    };
  } catch {
    return {
      id,
      name,
      group,
      status: 'outage',
      description,
      latencyMs: null,
      uptime90d: null,
      lastIncidentAt: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sanitize a remote service status JSON envelope into a public component.
 * Drops everything except the leaf-level `service.status` field — never echoes
 * upstream config, hostnames, queue depths, or signing-key flags.
 */
function sanitizeRemoteComponent(
  raw: Record<string, unknown> | null,
  id: string,
  name: string,
  group: PublicComponent['group'],
  description: string,
): PublicComponent {
  if (!raw) {
    return {
      id,
      name,
      group,
      status: 'unknown',
      description,
      latencyMs: null,
      uptime90d: null,
      lastIncidentAt: null,
    };
  }
  const service = (raw.service as Record<string, unknown> | undefined) ?? {};
  return {
    id,
    name,
    group,
    status: normalizeStatus(service.status as string | undefined),
    description,
    latencyMs: null,
    uptime90d: null,
    lastIncidentAt: null,
  };
}

async function buildPublicStatus(): Promise<PublicStatusPayload> {
  const network = resolveNetwork();
  const isMainnet = network === 'mainnet';

  const indexerStatusUrl = process.env.INDEXER_STATUS_URL;
  const executorStatusUrl = process.env.EXECUTOR_STATUS_URL;

  const [
    database,
    chain,
    indexerRaw,
    executorRaw,
    appEdge,
    docsEdge,
    explorerEdge,
  ] = await Promise.all([
    probeDatabase(),
    probeChainTip(network),
    indexerStatusUrl ? fetchWithTimeout(indexerStatusUrl) : Promise.resolve(null),
    executorStatusUrl ? fetchWithTimeout(executorStatusUrl) : Promise.resolve(null),
    probeFrontendEdge('https://app.flowguard.cash', 'App', 'Frontend', 'frontend_app', 'app.flowguard.cash — primary dashboard surface'),
    probeFrontendEdge('https://docs.flowguard.cash', 'Docs', 'Docs', 'docs', 'docs.flowguard.cash — developer documentation'),
    probeFrontendEdge('https://explorer.flowguard.cash', 'Explorer', 'Explorer', 'explorer', 'explorer.flowguard.cash — public activity explorer'),
  ]);

  const apiComponent: PublicComponent = {
    id: 'api',
    name: 'API',
    group: 'API',
    status: 'operational',
    description: 'api.flowguard.cash — backend REST surface',
    latencyMs: null,
    uptime90d: null,
    lastIncidentAt: null,
  };

  const dbComponent: PublicComponent = {
    id: 'database',
    name: 'Postgres',
    group: 'Database',
    status: database.status,
    description: 'Primary application database',
    latencyMs: database.latencyMs,
    uptime90d: null,
    lastIncidentAt: null,
  };

  const chainComponent: PublicComponent = {
    id: 'bch_network',
    name: `BCH ${isMainnet ? 'Mainnet' : 'Chipnet'}`,
    group: 'BCH Network',
    status: chain.status,
    description: 'Bitcoin Cash chain tip via Electrum',
    latencyMs: chain.latencyMs,
    uptime90d: null,
    lastIncidentAt: null,
  };

  const indexerComponent = sanitizeRemoteComponent(
    indexerRaw,
    'indexer',
    'Indexer',
    'Workers',
    'Covenant address indexing worker',
  );

  const executorComponent = sanitizeRemoteComponent(
    executorRaw,
    'executor',
    'Executor',
    'Workers',
    'Scheduled transaction executor',
  );

  // In-process workers — no liveness instrumentation yet, so we conservatively
  // report `unknown` rather than green-washing them.
  // TODO(status-phase-2): wire BlockchainMonitor / TransactionMonitor / CycleUnlockScheduler getStatus().
  const blockchainMonitor: PublicComponent = {
    id: 'blockchain_monitor',
    name: 'Blockchain Monitor',
    group: 'Workers',
    status: 'unknown',
    description: 'Vault balance refresher (in-process)',
    latencyMs: null,
    uptime90d: null,
    lastIncidentAt: null,
  };
  const transactionMonitor: PublicComponent = {
    id: 'transaction_monitor',
    name: 'Transaction Monitor',
    group: 'Workers',
    status: 'unknown',
    description: 'On-chain transaction confirmation watcher',
    latencyMs: null,
    uptime90d: null,
    lastIncidentAt: null,
  };
  const cycleUnlockScheduler: PublicComponent = {
    id: 'cycle_unlock_scheduler',
    name: 'Cycle Unlock Scheduler',
    group: 'Workers',
    status: 'unknown',
    description: 'Governance cycle unlock scheduler',
    latencyMs: null,
    uptime90d: null,
    lastIncidentAt: null,
  };

  // Supabase Vault — we can't probe a managed external service from here without
  // leaking auth, so it stays `unknown` until a server-side health check exists.
  // TODO(status-phase-2): add Supabase Vault health probe.
  const supabaseVault: PublicComponent = {
    id: 'supabase_vault',
    name: 'Supabase Vault',
    group: 'Database',
    status: 'unknown',
    description: 'Managed secret storage (Supabase Vault)',
    latencyMs: null,
    uptime90d: null,
    lastIncidentAt: null,
  };

  const components: PublicComponent[] = [
    apiComponent,
    appEdge,
    docsEdge,
    explorerEdge,
    chainComponent,
    dbComponent,
    supabaseVault,
    indexerComponent,
    executorComponent,
    blockchainMonitor,
    transactionMonitor,
    cycleUnlockScheduler,
  ];

  const overall = classifyOverall(components);

  const summary = {
    operational: components.filter((c) => c.status === 'operational').length,
    degraded: components.filter((c) => c.status === 'degraded').length,
    outage: components.filter((c) => c.status === 'outage').length,
  };

  return {
    updatedAt: new Date().toISOString(),
    refreshIntervalSeconds: 30,
    overall,
    network: {
      name: network,
      isMainnet,
      displayName: isMainnet ? 'BCH Mainnet' : 'BCH Chipnet',
      testnetWarning: !isMainnet,
    },
    chain: {
      height: chain.height,
      ageSeconds: chain.ageSeconds,
      latencyMs: chain.latencyMs,
      recentHeights: chain.recentHeights,
      error: chain.error,
    },
    components,
    summary,
    incidents: [],
  };
}

async function getCachedStatus(): Promise<PublicStatusPayload> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.payload;
  }
  const payload = await buildPublicStatus();
  cached = { expiresAt: now + STATUS_CACHE_TTL_MS, payload };
  return payload;
}

router.get('/status', async (_req: Request, res: Response) => {
  try {
    const payload = await getCachedStatus();
    res.setHeader('Cache-Control', `public, max-age=${Math.floor(STATUS_CACHE_TTL_MS / 1000)}`);
    res.json(payload);
  } catch (error: any) {
    console.error('GET /api/status error:', error);
    res.status(500).json({
      updatedAt: new Date().toISOString(),
      refreshIntervalSeconds: 30,
      overall: 'unknown' as Health,
      error: 'Failed to build public status',
    });
  }
});

/**
 * GET /api/status/incidents
 *
 * Placeholder. Returns an empty list until the `incidents` and `incident_updates`
 * tables exist. The public StatusPage reads this endpoint and renders an
 * empty-state when no incidents are returned.
 *
 * TODO(status-phase-2): back this with a real incidents store + RSS/Atom feeds.
 */
router.get('/status/incidents', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({
    incidents: [],
    note: 'Incidents API not yet backed by a persistent store. Returns an empty list.',
  });
});

export default router;
