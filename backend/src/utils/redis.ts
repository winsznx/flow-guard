import { Redis } from 'ioredis';

let client: Redis | null = null;
let didLogConnect = false;

export function getRedis(): Redis | null {
  if (client) return client;
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;

  client = new Redis(url, {
    maxRetriesPerRequest: 3,
    connectTimeout: 5000,
    enableOfflineQueue: false,
    lazyConnect: false,
  });

  client.on('error', (err: Error) => {
    console.warn('[redis] error:', err.message);
  });
  client.on('connect', () => {
    if (didLogConnect) return;
    didLogConnect = true;
    console.log('[redis] connected');
  });
  client.on('reconnecting', () => {
    didLogConnect = false;
  });

  return client;
}

export async function pingRedis(): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    const pong = await r.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  await client.quit().catch(() => undefined);
  client = null;
  didLogConnect = false;
}
