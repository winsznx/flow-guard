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

function countRows(tableName: string): number {
  try {
    const row = db!.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count?: number } | undefined;
    return row?.count || 0;
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

  const vaultCount = countRows('vaults');
  const streamCount = countRows('streams');
  const proposalCount = countRows('proposals');
  const airdropCount = countRows('airdrops');
  const paymentCount = countRows('payments');
  const budgetPlanCount = countRows('budget_plans');

  const queryStartedAt = Date.now();
  db!.prepare('SELECT COUNT(*) as count FROM streams').get();
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
      engine: 'sqlite',
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

export default router;
