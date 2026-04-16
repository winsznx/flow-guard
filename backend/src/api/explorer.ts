import { Router } from 'express';
import db from '../database/schema.js';
import { streamService } from '../services/streamService.js';

const router = Router();

// Public activity feed — all FlowGuard activity across streams, payments, airdrops, vaults
router.get('/explorer/activity', async (req, res) => {
  try {
    const { type, token, status, limit } = req.query;
    const pageLimit = Math.min(Number(limit) || 50, 200);

    const results: any[] = [];

    // Fetch streams
    if (!type || type === 'vesting') {
      let sql = `SELECT * FROM streams WHERE 1=1`;
      const params: any[] = [];
      if (token && token !== 'ALL') { sql += ' AND token_type = ?'; params.push(token); }
      if (status && status !== 'ALL') { sql += ' AND status = ?'; params.push(status); }
      sql += ` ORDER BY created_at DESC LIMIT ${pageLimit}`;
      const rows = await db!.prepare(sql).all(...params) as any[];
      const enriched = streamService.enrichStreams(rows.map(rowToExplorerStream));
      results.push(...enriched.map((stream) => ({
        id: stream.id,
        stream_id: stream.stream_id,
        sender: stream.sender,
        recipient: stream.recipient,
        token_type: stream.token_type,
        total_amount: stream.total_amount,
        vested_amount: stream.vested_amount,
        progress_percentage: stream.progress_percentage,
        stream_type: stream.stream_type,
        status: stream.status,
        created_at: Number(stream.created_at),
        activity_type: 'STREAM',
      })));
    }

    // Fetch payments
    if (!type || type === 'payments') {
      let sql = `SELECT id, payment_id as stream_id, sender, recipient, token_type,
        amount_per_period as total_amount, total_paid as vested_amount,
        CASE WHEN status = 'COMPLETED' THEN 100 ELSE 0 END as progress_percentage,
        interval as stream_type, status, created_at, 'PAYMENT' as activity_type
        FROM payments WHERE 1=1`;
      const params: any[] = [];
      if (token && token !== 'ALL') { sql += ' AND token_type = ?'; params.push(token); }
      if (status && status !== 'ALL') { sql += ' AND status = ?'; params.push(status); }
      sql += ` ORDER BY created_at DESC LIMIT ${pageLimit}`;
      const rows = await db!.prepare(sql).all(...params) as any[];
      results.push(...rows.map(r => ({ ...r, created_at: Number(new Date(r.created_at)) / 1000 })));
    }

    // Fetch airdrops
    if (!type || type === 'airdrops') {
      let sql = `SELECT id, campaign_id as stream_id, creator as sender,
        '' as recipient, token_type,
        total_amount, (claimed_count * amount_per_claim) as vested_amount,
        CASE WHEN total_amount > 0 THEN ROUND((claimed_count * amount_per_claim) * 100.0 / total_amount) ELSE 0 END as progress_percentage,
        campaign_type as stream_type, status, created_at, 'AIRDROP' as activity_type
        FROM airdrops WHERE 1=1`;
      const params: any[] = [];
      if (token && token !== 'ALL') { sql += ' AND token_type = ?'; params.push(token); }
      if (status && status !== 'ALL') { sql += ' AND status = ?'; params.push(status); }
      sql += ` ORDER BY created_at DESC LIMIT ${pageLimit}`;
      const rows = await db!.prepare(sql).all(...params) as any[];
      results.push(...rows.map(r => ({ ...r, created_at: Number(new Date(r.created_at)) / 1000 })));
    }

    // Fetch treasury operations (proposals)
    if (!type || type === 'treasuries') {
      let sql = `SELECT p.id, p.vault_id as stream_id, '' as sender,
        p.recipient, 'BCH' as token_type,
        p.amount as total_amount,
        CASE WHEN p.status = 'EXECUTED' THEN p.amount ELSE 0 END as vested_amount,
        CASE WHEN p.status = 'EXECUTED' THEN 100 ELSE p.approval_count * 25 END as progress_percentage,
        'PROPOSAL' as stream_type, p.status, p.created_at, 'TREASURY' as activity_type
        FROM proposals p WHERE 1=1`;
      const params: any[] = [];
      if (status && status !== 'ALL') { sql += ' AND p.status = ?'; params.push(status); }
      sql += ` ORDER BY p.created_at DESC LIMIT ${pageLimit}`;
      const rows = await db!.prepare(sql).all(...params) as any[];
      results.push(...rows.map(r => ({ ...r, created_at: Number(new Date(r.created_at)) / 1000 })));
    }

    // Sort all by created_at desc
    results.sort((a, b) => b.created_at - a.created_at);

    const totalVolume = results.reduce((sum, r) => sum + (r.total_amount || 0), 0);
    const activeCount = results.filter(r => r.status === 'ACTIVE').length;
    const completedCount = results.filter(r => r.status === 'COMPLETED').length;

    res.json({
      streams: results.slice(0, pageLimit),
      stats: {
        totalVolume,
        activeCount,
        completedCount,
        totalCount: results.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Comprehensive stats moved to explorer-advanced.ts

export default router;

function rowToExplorerStream(row: any) {
  let amountPerInterval: number | undefined;
  let stepAmount: number | undefined;
  let trancheSchedule: Array<{ unlock_time: number; amount: number; cumulative_amount: number }> | undefined;
  if (row.constructor_params) {
    try {
      const params = JSON.parse(row.constructor_params);
      if (row.stream_type === 'RECURRING') {
        amountPerInterval = parseOnChainDisplayAmount(params[3]?.value, row.token_type);
      }
      if (row.stream_type === 'STEP') {
        stepAmount = parseOnChainDisplayAmount(params[8]?.value, row.token_type);
      }
      if (row.stream_type === 'TRANCHE') {
        const scheduleCount = Number(params[4]?.value || 0);
        let previousCumulative = 0;
        trancheSchedule = [];
        for (let index = 0; index < Math.min(scheduleCount, 8); index += 1) {
          const unlockTime = Number(params[5 + index * 2]?.value || 0);
          const cumulativeAmount = parseOnChainDisplayAmount(params[6 + index * 2]?.value, row.token_type) ?? 0;
          trancheSchedule.push({
            unlock_time: unlockTime,
            amount: cumulativeAmount - previousCumulative,
            cumulative_amount: cumulativeAmount,
          });
          previousCumulative = cumulativeAmount;
        }
      }
    } catch (error) {
      console.warn('[explorer] Failed to parse stream constructor params', { streamId: row.id, error });
    }
  }

  return {
    id: row.id,
    stream_id: row.stream_id,
    vault_id: row.vault_id || '',
    sender: row.sender,
    recipient: row.recipient,
    token_type: row.token_type,
    token_category: row.token_category || undefined,
    total_amount: row.total_amount,
    withdrawn_amount: row.withdrawn_amount,
    stream_type: row.stream_type,
    start_time: row.start_time,
    end_time: row.end_time || undefined,
    interval_seconds: row.interval_seconds || undefined,
    amount_per_interval: amountPerInterval,
    step_amount: stepAmount,
    tranche_schedule: trancheSchedule,
    cliff_timestamp: row.cliff_timestamp || undefined,
    cancelable: Boolean(row.cancelable),
    transferable: Boolean(row.transferable),
    refillable: Boolean(row.refillable),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseOnChainDisplayAmount(rawValue: unknown, tokenType: 'BCH' | 'CASHTOKENS') {
  const normalized = typeof rawValue === 'string'
    ? Number(rawValue)
    : typeof rawValue === 'number'
      ? rawValue
      : rawValue !== undefined
        ? Number(rawValue)
        : undefined;
  if (normalized === undefined || !Number.isFinite(normalized)) {
    return undefined;
  }
  return tokenType === 'BCH' ? normalized / 100_000_000 : normalized;
}
