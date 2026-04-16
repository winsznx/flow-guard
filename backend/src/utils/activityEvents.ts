import { randomUUID } from 'crypto';
import db from '../database/schema.js';

export type ActivityEntityType = 'stream' | 'payment' | 'airdrop' | 'reward' | 'bounty' | 'grant';

export interface ActivityEventInput {
  entityType: ActivityEntityType;
  entityId: string;
  eventType: string;
  actor?: string;
  amount?: number;
  status?: string;
  txHash?: string;
  details?: unknown;
  createdAt?: number;
}

export interface ActivityEventRow {
  id: string;
  entity_type: ActivityEntityType;
  entity_id: string;
  event_type: string;
  actor: string | null;
  amount: number | null;
  status: string | null;
  tx_hash: string | null;
  details: unknown;
  created_at: number;
}

export async function recordActivityEvent(input: ActivityEventInput): Promise<void> {
  const createdAt = Number.isFinite(input.createdAt)
    ? Math.max(0, Math.floor(Number(input.createdAt)))
    : Math.floor(Date.now() / 1000);

  await db!.prepare(`
    INSERT INTO activity_events (
      id, entity_type, entity_id, event_type, actor, amount, status, tx_hash, details, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    input.entityType,
    input.entityId,
    input.eventType,
    input.actor || null,
    typeof input.amount === 'number' ? input.amount : null,
    input.status || null,
    input.txHash || null,
    input.details !== undefined ? JSON.stringify(input.details) : null,
    createdAt,
  );
}

export async function listActivityEvents(
  entityType: ActivityEntityType,
  entityId: string,
  limit = 100,
): Promise<ActivityEventRow[]> {
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const rows = await db!.prepare(`
    SELECT id, entity_type, entity_id, event_type, actor, amount, status, tx_hash, details, created_at
    FROM activity_events
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(entityType, entityId, safeLimit) as Array<{
    id: string;
    entity_type: ActivityEntityType;
    entity_id: string;
    event_type: string;
    actor: string | null;
    amount: number | null;
    status: string | null;
    tx_hash: string | null;
    details: string | null;
    created_at: number;
  }>;

  return rows.map((row) => ({
    ...row,
    details: row.details ? safeParseDetails(row.details) : null,
  }));
}

export async function getLatestActivityEvents(
  entityType: ActivityEntityType,
  entityIds: string[],
): Promise<Map<string, ActivityEventRow>> {
  const dedupedIds = Array.from(new Set(entityIds.filter((id) => typeof id === 'string' && id.length > 0)));
  if (dedupedIds.length === 0) {
    return new Map();
  }

  const placeholders = dedupedIds.map(() => '?').join(', ');
  const rows = await db!.prepare(`
    SELECT id, entity_type, entity_id, event_type, actor, amount, status, tx_hash, details, created_at
    FROM activity_events
    WHERE entity_type = ? AND entity_id IN (${placeholders})
    ORDER BY created_at DESC
  `).all(entityType, ...dedupedIds) as Array<{
    id: string;
    entity_type: ActivityEntityType;
    entity_id: string;
    event_type: string;
    actor: string | null;
    amount: number | null;
    status: string | null;
    tx_hash: string | null;
    details: string | null;
    created_at: number;
  }>;

  const latestByEntity = new Map<string, ActivityEventRow>();
  for (const row of rows) {
    if (latestByEntity.has(row.entity_id)) {
      continue;
    }
    latestByEntity.set(row.entity_id, {
      ...row,
      details: row.details ? safeParseDetails(row.details) : null,
    });
  }

  return latestByEntity;
}

function safeParseDetails(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
