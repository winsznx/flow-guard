/**
 * Admin API Endpoints
 * Internal/operator-facing endpoints for system monitoring
 */

import os from 'node:os';
import { Router, Request, Response } from 'express';
import { ElectrumNetworkProvider } from 'cashscript';
import db from '../database/schema.js';

const router = Router();

type ServiceStatus = 'healthy' | 'degraded' | 'critical' | 'manual' | 'not_configured' | 'unreachable' | 'unknown';

interface RemoteServiceEnvelope {
  name: string;
  url: string | null;
  configured: boolean;
  reachable: boolean;
  status: ServiceStatus;
  data: Record<string, unknown> | null;
  error: string | null;
}

function classifyOverallStatus(statuses: ServiceStatus[]): ServiceStatus {
  if (statuses.some((status) => status === 'critical' || status === 'unreachable')) {
    return 'critical';
  }
  if (statuses.some((status) => status === 'degraded' || status === 'unknown')) {
    return 'degraded';
  }
  if (statuses.every((status) => status === 'not_configured')) {
    return 'not_configured';
  }
  if (statuses.some((status) => status === 'manual')) {
    return 'manual';
  }
  return 'healthy';
}

async function countRows(tableName: string): Promise<number> {
  try {
    const row = await db!.prepare(`SELECT COUNT(*)::int as count FROM "${tableName}"`).get() as { count?: number } | undefined;
    return Number(row?.count ?? 0);
  } catch {
    return 0;
  }
}

async function fetchJson(url: string, timeoutMs = 4000): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json() as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRemoteServiceStatus(name: string, baseUrl?: string): Promise<RemoteServiceEnvelope> {
  if (!baseUrl) {
    return {
      name,
      url: null,
      configured: false,
      reachable: false,
      status: 'not_configured',
      data: null,
      error: null,
    };
  }

  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const statusUrl = new URL('status', normalizedBaseUrl).toString();

  try {
    const data = await fetchJson(statusUrl);
    const service = (data.service as Record<string, unknown> | undefined) ?? {};

    return {
      name,
      url: statusUrl,
      configured: true,
      reachable: true,
      status: (service.status as ServiceStatus) || 'unknown',
      data,
      error: null,
    };
  } catch (error: any) {
    return {
      name,
      url: statusUrl,
      configured: true,
      reachable: false,
      status: 'unreachable',
      data: null,
      error: error.message,
    };
  }
}

async function getBackendStatus(network: 'mainnet' | 'chipnet', electrumServer?: string) {
  const provider = new ElectrumNetworkProvider(
    network,
    electrumServer ? { hostname: electrumServer } : undefined,
  );

  const networkStartedAt = Date.now();
  let networkStatus: ServiceStatus = 'healthy';
  let networkHeight: number | null = null;
  let networkLatencyMs: number | null = null;
  let networkError: string | null = null;

  try {
    networkHeight = await provider.getBlockHeight();
    networkLatencyMs = Date.now() - networkStartedAt;
  } catch (error: any) {
    networkStatus = 'degraded';
    networkError = error.message;
  } finally {
    await provider.disconnect().catch(() => undefined);
  }

  const vaultCount = await countRows('vaults');
  const streamCount = await countRows('streams');
  const proposalCount = await countRows('proposals');
  const airdropCount = await countRows('airdrops');
  const paymentCount = await countRows('payments');
  const budgetPlanCount = await countRows('budget_plans');

  const queryStartedAt = Date.now();
  await db!.prepare('SELECT COUNT(*) as count FROM streams').get();
  const queryLatencyMs = Date.now() - queryStartedAt;

  return {
    service: {
      name: 'FlowGuard Backend API',
      kind: 'backend',
      status: networkStatus,
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
    database: {
      engine: 'postgres',
      counts: {
        vaults: vaultCount,
        streams: streamCount,
        proposals: proposalCount,
        airdrops: airdropCount,
        payments: paymentCount,
        budgetPlans: budgetPlanCount,
        total: vaultCount + streamCount + proposalCount + airdropCount + paymentCount + budgetPlanCount,
      },
      queryLatencyMs,
    },
    network: {
      status: networkStatus,
      network,
      electrumServer: electrumServer || null,
      height: networkHeight,
      latencyMs: networkLatencyMs,
      error: networkError,
    },
    resources: {
      memoryRssMB: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(2)),
      heapUsedMB: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)),
      loadAverage: process.platform !== 'win32' ? os.loadavg() : [0, 0, 0],
      nodeVersion: process.version,
      platform: process.platform,
    },
    timestamp: new Date().toISOString(),
  };
}

async function buildSystemStatus() {
  const network = ((process.env.BCH_NETWORK || process.env.NETWORK) as 'mainnet' | 'chipnet') || 'chipnet';
  const electrumServer = process.env.ELECTRUM_SERVER;

  const [backendStatus, indexerStatus, executorStatus] = await Promise.all([
    getBackendStatus(network, electrumServer),
    fetchRemoteServiceStatus('Indexer', process.env.INDEXER_STATUS_URL),
    fetchRemoteServiceStatus('Executor', process.env.EXECUTOR_STATUS_URL),
  ]);

  const overallStatus = classifyOverallStatus([
    backendStatus.service.status as ServiceStatus,
    indexerStatus.status,
    executorStatus.status,
  ]);

  return {
    success: true,
    timestamp: new Date().toISOString(),
    overallStatus,
    services: {
      backend: backendStatus,
      indexer: indexerStatus,
      executor: executorStatus,
    },
    summary: {
      healthy: [backendStatus.service.status, indexerStatus.status, executorStatus.status].filter((status) => status === 'healthy').length,
      degraded: [backendStatus.service.status, indexerStatus.status, executorStatus.status].filter((status) => status === 'degraded').length,
      critical: [backendStatus.service.status, indexerStatus.status, executorStatus.status].filter((status) => status === 'critical' || status === 'unreachable').length,
      manual: [backendStatus.service.status, indexerStatus.status, executorStatus.status].filter((status) => status === 'manual').length,
      notConfigured: [backendStatus.service.status, indexerStatus.status, executorStatus.status].filter((status) => status === 'not_configured').length,
    },
  };
}

router.get('/admin/system/status', async (_req: Request, res: Response) => {
  try {
    const status = await buildSystemStatus();
    res.json(status);
  } catch (error: any) {
    console.error('GET /admin/system/status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system status',
      message: error.message,
    });
  }
});

router.get('/admin/indexer/status', async (_req: Request, res: Response) => {
  try {
    const status = await buildSystemStatus();
    res.json({
      success: true,
      timestamp: status.timestamp,
      service: status.services.indexer,
    });
  } catch (error: any) {
    console.error('GET /admin/indexer/status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch indexer status',
      message: error.message,
    });
  }
});

router.get('/admin/indexer/errors', async (_req: Request, res: Response) => {
  const indexerStatus = await fetchRemoteServiceStatus('Indexer', process.env.INDEXER_STATUS_URL);
  res.json({
    success: true,
    errors: indexerStatus.error ? [{ service: 'indexer', message: indexerStatus.error }] : [],
    total: indexerStatus.error ? 1 : 0,
  });
});

router.post('/admin/indexer/resync', async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
    message: 'Remote indexer resync control is not implemented yet.',
    fromBlock: req.body?.fromBlock ?? null,
  });
});

/**
 * GET /admin/export
 * Dumps the entire Postgres database as a JSON document.
 *
 * Authentication: requires the `x-admin-token` header to match the
 * ADMIN_EXPORT_TOKEN environment variable. If the env var is unset,
 * the endpoint is disabled.
 *
 * Usage:
 *   curl -H "x-admin-token: $ADMIN_EXPORT_TOKEN" \
 *     https://api.flowguard.cash/api/admin/export > backup.json
 */
router.get('/admin/export', async (req: Request, res: Response) => {
  const expectedToken = process.env.ADMIN_EXPORT_TOKEN?.trim();
  if (!expectedToken) {
    return res.status(503).json({
      success: false,
      error: 'Export endpoint disabled',
      message: 'Set ADMIN_EXPORT_TOKEN env var to enable.',
    });
  }

  const providedToken = req.headers['x-admin-token'];
  if (providedToken !== expectedToken) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid or missing x-admin-token header.',
    });
  }

  try {
    const tableRowsResult = await db!
      .prepare(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`)
      .all() as Array<{ table_name: string }>;

    const tables: Record<string, { rowCount: number; rows: any[] }> = {};

    for (const { table_name } of tableRowsResult) {
      const rows = await db!.prepare(`SELECT * FROM "${table_name}"`).all() as any[];
      const serialized = rows.map((row) => {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
            out[key] = { __type: 'bytes', hex: Buffer.from(value).toString('hex') };
          } else if (typeof value === 'bigint') {
            out[key] = { __type: 'bigint', value: value.toString() };
          } else if (value instanceof Date) {
            out[key] = value.toISOString();
          } else {
            out[key] = value;
          }
        }
        return out;
      });
      tables[table_name] = {
        rowCount: serialized.length,
        rows: serialized,
      };
    }

    const totalRows = Object.values(tables).reduce((sum, t) => sum + t.rowCount, 0);

    res.setHeader('Content-Disposition', `attachment; filename="flowguard-export-${Date.now()}.json"`);
    res.json({
      version: 2,
      exportedAt: new Date().toISOString(),
      engine: 'postgres',
      totalTables: tableRowsResult.length,
      totalRows,
      tables,
    });
  } catch (error: any) {
    console.error('[admin/export] Export failed:', error);
    res.status(500).json({
      success: false,
      error: 'Export failed',
      message: error.message,
    });
  }
});

/**
 * GET /admin/export/summary
 * Lightweight preview of what would be exported (table names and row counts).
 * Useful for verifying the export before downloading the full dump.
 */
router.get('/admin/export/summary', async (req: Request, res: Response) => {
  const expectedToken = process.env.ADMIN_EXPORT_TOKEN?.trim();
  if (!expectedToken) {
    return res.status(503).json({
      success: false,
      error: 'Export endpoint disabled',
      message: 'Set ADMIN_EXPORT_TOKEN env var to enable.',
    });
  }

  const providedToken = req.headers['x-admin-token'];
  if (providedToken !== expectedToken) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }

  try {
    const tableRows = await db!
      .prepare(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`)
      .all() as Array<{ name: string }>;

    const summary = await Promise.all(tableRows.map(async ({ name }) => {
      const row = await db!.prepare(`SELECT COUNT(*) as count FROM "${name}"`).get() as { count?: number };
      return { table: name, rowCount: Number(row?.count ?? 0) };
    }));

    const totalRows = summary.reduce((sum, s) => sum + s.rowCount, 0);

    res.json({
      success: true,
      exportedAt: new Date().toISOString(),
      totalTables: summary.length,
      totalRows,
      tables: summary,
    });
  } catch (error: any) {
    console.error('[admin/export/summary] Failed:', error);
    res.status(500).json({
      success: false,
      error: 'Summary failed',
      message: error.message,
    });
  }
});

export default router;
