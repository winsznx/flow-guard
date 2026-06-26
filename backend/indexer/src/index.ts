import { createServer, type Server } from 'node:http';
import dotenv from 'dotenv';
import { Pool } from 'pg';

import { ElectrumClient, type ElectrumServerSpec } from './electrum-client.js';
import { startProjector } from './projector.js';
import { loadRegistry, type RegistryEntry } from './registry.js';
import { getSyncState, runMigrations, type SyncState } from './sync-state.js';

dotenv.config();

const DEFAULT_SERVERS: Record<'mainnet' | 'chipnet', string[]> = {
  mainnet: [
    'electrum.imaginary.cash:50002',
    'electrum.bitcoincashnode.org:50002',
    'bch.imaginary.cash:50002',
  ],
  chipnet: ['chipnet.imaginary.cash:50004'],
};

interface IndexerEnv {
  databaseUrl: string;
  network: 'mainnet' | 'chipnet';
  servers: ElectrumServerSpec[];
  confirmations: number;
  pollIntervalMs: number;
  statusPort: number;
}

function parseServerList(raw: string | undefined, network: 'mainnet' | 'chipnet'): ElectrumServerSpec[] {
  const items = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const source = items.length > 0 ? items : DEFAULT_SERVERS[network];
  return source.map((entry) => {
    const [host, portStr] = entry.split(':');
    if (!host || !portStr) throw new Error(`invalid electrum server entry: ${entry}`);
    const port = Number.parseInt(portStr, 10);
    if (!Number.isFinite(port)) throw new Error(`invalid electrum port: ${entry}`);
    // Standard electrum-cash ports: 50002 = TLS TCP, 50004 = WSS
    const scheme: ElectrumServerSpec['scheme'] = port === 50004 || port === 50003 ? 'wss' : 'tcp_tls';
    return { host, port, scheme };
  });
}

function loadEnv(): IndexerEnv {
  const databaseUrl = process.env.PG_CONNECTION_STRING ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('PG_CONNECTION_STRING (or DATABASE_URL) is required');
  const network = (process.env.BCH_NETWORK ?? process.env.NETWORK ?? 'mainnet') as 'mainnet' | 'chipnet';
  if (network !== 'mainnet' && network !== 'chipnet') throw new Error(`invalid BCH_NETWORK: ${network}`);
  return {
    databaseUrl,
    network,
    servers: parseServerList(process.env.ELECTRUM_SERVERS, network),
    confirmations: Number.parseInt(process.env.CONFIRMATIONS ?? '6', 10),
    pollIntervalMs: Number.parseInt(process.env.POLL_INTERVAL ?? '15000', 10),
    statusPort: Number.parseInt(process.env.STATUS_PORT ?? process.env.PORT ?? '8080', 10),
  };
}

function startStatusServer(
  port: number,
  snapshot: () => Promise<{ healthy: boolean; body: Record<string, unknown> }>,
): Promise<Server> {
  const server = createServer(async (req, res) => {
    try {
      const result = await snapshot();
      if (req.url === '/health') {
        res.writeHead(result.healthy ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: result.healthy ? 'ok' : 'degraded' }));
        return;
      }
      if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.body));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  });
  return new Promise((resolve, reject) => {
    server.listen(port, '0.0.0.0', () => {
      console.log(`[indexer] status server on :${port}`);
      resolve(server);
    });
    server.once('error', reject);
  });
}

async function main(): Promise<void> {
  const env = loadEnv();
  const pool = new Pool({ connectionString: env.databaseUrl });
  await pool.query('SELECT 1');
  console.log(`[indexer] database connected (network=${env.network})`);

  await runMigrations(pool);
  console.log('[indexer] schema migrations applied');

  const electrum = new ElectrumClient();
  await electrum.connect(env.servers);
  const server = electrum.currentServer;
  if (server) {
    console.log(`[indexer] connected to electrum ${server.host}:${server.port}`);
  }

  const registry: RegistryEntry[] = await loadRegistry(pool);
  console.log(`[indexer] registry loaded: ${registry.length} addresses`);

  const projector = await startProjector({
    pool,
    electrum,
    registry,
    network: env.network,
    confirmations: env.confirmations,
  });

  const statusServer = await startStatusServer(env.statusPort, async () => {
    let sync: SyncState | null = null;
    let dbOk = true;
    try {
      sync = await getSyncState(pool);
    } catch {
      dbOk = false;
    }
    const healthy = electrum.isConnected && dbOk;
    const current = electrum.currentServer;
    return {
      healthy,
      body: {
        network: env.network,
        electrumServer: current ? `${current.host}:${current.port}` : null,
        electrumConnected: electrum.isConnected,
        currentHeight: sync?.lastHeight ?? null,
        lastSafeHeight: sync?.lastSafeHeight ?? null,
        registrySize: projector.getRegistrySize(),
        confirmations: env.confirmations,
        pollIntervalMs: env.pollIntervalMs,
        timestamp: new Date().toISOString(),
      },
    };
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[indexer] ${signal} received, shutting down`);
    try {
      await projector.stop();
      await new Promise<void>((resolve) => statusServer.close(() => resolve()));
      await electrum.disconnect();
      await pool.end();
    } catch (err) {
      console.error('[indexer] shutdown error:', err);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
}

main().catch((err) => {
  console.error('[indexer] fatal:', err);
  process.exit(1);
});
