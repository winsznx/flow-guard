/**
 * Streams API Endpoints
 * Handles streaming payment operations
 */

import { resolveBchNetwork } from '../utils/network.js';
import { Router, Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import { cashAddressToLockingBytecode, hexToBin, binToHex } from '@bitauth/libauth';
import db from '../database/schema.js';
import { streamService, Stream, StreamClaim } from '../services/streamService.js';
import { StreamDeploymentService } from '../services/StreamDeploymentService.js';
import {
  CONTINUOUS_STREAM_CLAIM_BUDGET,
  MAX_RECURRING_STREAM_PAYMENTS,
  StreamFundingService,
  getStreamContractFundingSatoshis,
} from '../services/StreamFundingService.js';
import { FtVestingService, getFtStateReserveSatoshis, type FtScheduleArgs } from '../services/FtVestingService.js';
import { StreamClaimReserveError, StreamClaimService } from '../services/StreamClaimService.js';
import { ContractFactory, type ConstructorParam } from '../services/ContractFactory.js';
import { TOKEN_CANCEL_TOO_EARLY } from '../services/txFinality.js';
import { StreamCancelService } from '../services/StreamCancelService.js';
import { StreamControlService } from '../services/StreamControlService.js';
import { PaymentClaimService } from '../services/PaymentClaimService.js';
import {
  isValidStreamScheduleTemplate,
  streamScheduleTemplates,
} from '../services/streamShapeCatalog.js';
import { ContractService } from '../services/contract-service.js';
import { serializeWcTransaction } from '../utils/wcSerializer.js';
import {
  transactionExists,
  transactionHasExpectedOutput,
} from '../utils/txVerification.js';
import {
  displayAmountToOnChain,
  isFungibleTokenType,
  onChainAmountToDisplay,
} from '../utils/amounts.js';
import { resolveTokenDecimals } from '../utils/tokenMeta.js';
import {
  getLatestActivityEvents,
  listActivityEvents,
  recordActivityEvent,
} from '../utils/activityEvents.js';
import { requireWalletAuth, callerAddress, attachVerifiedUser } from '../middleware/auth.js';
import { uuidParam } from '../middleware/errorHandler.js';
import { VaultService } from '../services/vaultService.js';

const router = Router();
router.param('id', uuidParam);
const DAY_SECONDS = 24 * 60 * 60;

interface StreamLaunchContext {
  source: string;
  title?: string;
  description?: string;
  preferredLane?: string;
}

interface StreamBatchRow {
  id: string;
  vault_id?: string | null;
  sender: string;
  token_type: 'BCH' | 'CASHTOKENS';
  token_category?: string | null;
  stream_count: number;
  total_amount: number;
  status: 'PENDING' | 'ACTIVE' | 'PARTIAL' | 'FAILED';
  tx_hash?: string | null;
  launch_source?: string | null;
  launch_title?: string | null;
  launch_description?: string | null;
  preferred_lane?: string | null;
  created_at: number;
  updated_at: number;
}

// Batch status is stored only as PENDING or ACTIVE, so the finished states come from
// the batch's streams. A stream has paid out when it's COMPLETED, or when it isn't
// refillable and everything has been claimed. A batch is CANCELLED when every stream
// was cancelled, and COMPLETED when every stream was cancelled or paid out.
const STREAM_PAID_OUT_SQL = `(
  s.status = 'COMPLETED'
  OR (s.status <> 'CANCELLED' AND COALESCE(s.refillable, 0) = 0
    AND s.total_amount > 0 AND s.withdrawn_amount >= s.total_amount)
)`;
const STREAM_BATCH_ROWS_SQL = `(
  SELECT
    b.id, b.vault_id, b.sender, b.token_type, b.token_category, b.stream_count, b.total_amount,
    CASE
      WHEN b.status = 'PENDING' THEN b.status
      WHEN COUNT(s.id) > 0 AND SUM(CASE WHEN s.status = 'CANCELLED' THEN 1 ELSE 0 END) = COUNT(s.id) THEN 'CANCELLED'
      WHEN COUNT(s.id) > 0
        AND SUM(CASE WHEN s.status = 'CANCELLED' OR ${STREAM_PAID_OUT_SQL} THEN 1 ELSE 0 END) = COUNT(s.id) THEN 'COMPLETED'
      ELSE b.status
    END AS status,
    b.tx_hash, b.launch_source, b.launch_title, b.launch_description, b.preferred_lane,
    b.created_at, b.updated_at,
    SUM(CASE WHEN s.status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_streams,
    SUM(CASE WHEN s.status = 'PENDING' THEN 1 ELSE 0 END) AS pending_streams,
    SUM(CASE WHEN s.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_streams,
    SUM(CASE WHEN ${STREAM_PAID_OUT_SQL} THEN 1 ELSE 0 END) AS completed_streams
  FROM stream_batches b
  LEFT JOIN streams s ON s.batch_id = b.id
  GROUP BY b.id
)`;

router.get('/streams/templates', (_req: Request, res: Response) => {
  res.json({
    success: true,
    templates: streamScheduleTemplates,
  });
});

/**
 * GET /api/streams
 * List all streams for a recipient or sender
 * Query params: ?recipient={address} OR ?sender={address} [&status={status}]
 */
router.get('/streams', attachVerifiedUser, async (req: Request, res: Response) => {
  try {
    const { recipient, sender, address, status, vaultId, contextSource, treasury, limit, page, q } = req.query;
    const hasContextOnlyQuery = Boolean(vaultId || contextSource || treasury === 'true');
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 20)));
    const currentPage = Math.max(1, Math.trunc(Number(page) || 1));
    const offset = (currentPage - 1) * safeLimit;

    if (!recipient && !sender && !address && !hasContextOnlyQuery) {
      return res.status(400).json({
        error: 'Must provide either recipient, sender, address, or a treasury/context filter',
      });
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (sender && recipient) {
      conditions.push('sender = ?', 'recipient = ?');
      params.push(sender, recipient);
    } else if (sender) {
      conditions.push('sender = ?');
      params.push(sender);
    } else if (recipient) {
      conditions.push('recipient = ?');
      params.push(recipient);
    } else if (address) {
      conditions.push('(sender = ? OR recipient = ?)');
      params.push(address, address);
    }

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (vaultId) {
      conditions.push('vault_id = ?');
      params.push(vaultId);
    }
    if (contextSource) {
      conditions.push('launch_source = ?');
      params.push(contextSource);
    }
    const searchTerm = typeof q === 'string' ? q.trim().toLowerCase().replace(/[%_\\]/g, '').slice(0, 120) : '';
    if (searchTerm) {
      const pattern = `%${searchTerm}%`;
      conditions.push(
        "(LOWER(stream_id) LIKE ? OR LOWER(sender) LIKE ? OR LOWER(recipient) LIKE ? OR LOWER(COALESCE(description, '')) LIKE ?)",
      );
      params.push(pattern, pattern, pattern, pattern);
    }
    // sender/recipient/address/vaultId lists are public on their own, so with one of
    // them treasury only narrows to vault streams. Without one the list needs a signed-in caller.
    const hasPartyFilter = Boolean(sender || recipient || address || vaultId);
    if (treasury === 'true' && hasPartyFilter) {
      conditions.push('vault_id IS NOT NULL');
    } else if (!hasPartyFilter) {
      const viewerScope = await buildViewerScope(req, treasury === 'true', {
        vaultIdColumn: 'vault_id',
        ownRowsSql: '(sender = ? OR recipient = ?)',
      });
      if (!viewerScope) {
        return res.json({
          success: true,
          streams: [],
          total: 0,
          page: currentPage,
          limit: safeLimit,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: currentPage > 1,
        });
      }
      conditions.push(viewerScope.sql);
      params.push(...viewerScope.params);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalRow = await db!.prepare(`SELECT COUNT(*) as count FROM streams ${whereClause}`).get(...params) as { count: number };
    const total = Number(totalRow?.count || 0);
    const rows = await db!.prepare(`
      SELECT *
      FROM streams
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?
      OFFSET ?
    `).all(...params, safeLimit, offset) as any[];

    const streams = rows.map(rowToStream);

    const enrichedStreams = streamService.enrichStreams(streams);
    const latestByStreamId = await getLatestActivityEvents(
      'stream',
      enrichedStreams.map((stream) => String(stream.id)),
    );
    const responseStreams = enrichedStreams.map((stream) => ({
      ...stream,
      latest_event: latestByStreamId.get(String(stream.id)) || null,
    }));

    res.json({
      success: true,
      streams: responseStreams,
      total,
      page: currentPage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      hasNextPage: offset + responseStreams.length < total,
      hasPreviousPage: currentPage > 1,
    });
  } catch (error: any) {
    console.error('GET /streams error:', error);
    res.status(500).json({ error: 'Failed to fetch streams', message: error.message });
  }
});

router.get('/streams/activity', attachVerifiedUser, async (req: Request, res: Response) => {
  try {
    const { address, vaultId, contextSource, treasury, limit, page, eventType, dateFrom, dateTo } = req.query;
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 50)));
    const currentPage = Math.max(1, Math.trunc(Number(page) || 1));
    const offset = (currentPage - 1) * safeLimit;
    const conditions = [`ae.entity_type = 'stream'`];
    const params: unknown[] = [];

    if (address) {
      conditions.push('(s.sender = ? OR s.recipient = ?)');
      params.push(address, address);
    }
    if (vaultId) {
      conditions.push('s.vault_id = ?');
      params.push(vaultId);
    }
    if (contextSource) {
      conditions.push('s.launch_source = ?');
      params.push(contextSource);
    }
    if (treasury === 'true' && (address || vaultId)) {
      conditions.push('s.vault_id IS NOT NULL');
    } else if (!address && !vaultId) {
      const viewerScope = await buildViewerScope(req, treasury === 'true', {
        vaultIdColumn: 's.vault_id',
        ownRowsSql: '(s.sender = ? OR s.recipient = ?)',
      });
      if (!viewerScope) {
        return res.json({
          success: true,
          events: [],
          total: 0,
          page: currentPage,
          limit: safeLimit,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: currentPage > 1,
        });
      }
      conditions.push(viewerScope.sql);
      params.push(...viewerScope.params);
    }
    if (eventType) {
      conditions.push('ae.event_type = ?');
      params.push(eventType);
    }
    if (dateFrom) {
      const parsedDateFrom = Math.trunc(Number(dateFrom));
      if (Number.isFinite(parsedDateFrom) && parsedDateFrom > 0) {
        conditions.push('ae.created_at >= ?');
        params.push(parsedDateFrom);
      }
    }
    if (dateTo) {
      const parsedDateTo = Math.trunc(Number(dateTo));
      if (Number.isFinite(parsedDateTo) && parsedDateTo > 0) {
        conditions.push('ae.created_at <= ?');
        params.push(parsedDateTo);
      }
    }

    const whereClause = conditions.join(' AND ');
    const countRow = await db!.prepare(`
      SELECT COUNT(*) as count
      FROM activity_events ae
      INNER JOIN streams s ON s.id = ae.entity_id
      WHERE ${whereClause}
    `).get(...params) as { count: number };
    const total = Number(countRow?.count || 0);

    const rows = await db!.prepare(`
      SELECT
        ae.id,
        ae.entity_type,
        ae.entity_id,
        ae.event_type,
        ae.actor,
        ae.amount,
        ae.status,
        ae.tx_hash,
        ae.details,
        ae.created_at,
        s.stream_id,
        s.vault_id,
        s.sender,
        s.recipient,
        s.stream_type,
        s.schedule_template,
        s.launch_source,
        s.launch_title,
        s.launch_description,
        s.preferred_lane
      FROM activity_events ae
      INNER JOIN streams s ON s.id = ae.entity_id
      WHERE ${whereClause}
      ORDER BY ae.created_at DESC
      LIMIT ?
      OFFSET ?
    `).all(...params, safeLimit, offset) as Array<Record<string, unknown>>;

    const events = rows.map((row) => ({
      id: row.id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      event_type: row.event_type,
      actor: row.actor,
      amount: row.amount,
      status: row.status,
      tx_hash: row.tx_hash,
      details: typeof row.details === 'string' ? safeParseJson(row.details) : row.details,
      created_at: row.created_at,
      stream: {
        stream_id: row.stream_id,
        vault_id: row.vault_id,
        sender: row.sender,
        recipient: row.recipient,
        stream_type: row.stream_type,
        schedule_template: row.schedule_template,
        launch_context: row.launch_source
          ? {
              source: row.launch_source,
              title: row.launch_title || undefined,
              description: row.launch_description || undefined,
              preferredLane: row.preferred_lane || undefined,
            }
          : null,
      },
    }));

    res.json({
      success: true,
      events,
      total,
      page: currentPage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      hasNextPage: offset + events.length < total,
      hasPreviousPage: currentPage > 1,
    });
  } catch (error: any) {
    console.error('GET /streams/activity error:', error);
    res.status(500).json({ error: 'Failed to fetch stream activity', message: error.message });
  }
});

router.get('/streams/batch-runs', attachVerifiedUser, async (req: Request, res: Response) => {
  try {
    const { sender, address, vaultId, contextSource, treasury, status, limit, page } = req.query;
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 20)));
    const currentPage = Math.max(1, Math.trunc(Number(page) || 1));
    const offset = (currentPage - 1) * safeLimit;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (sender) {
      conditions.push('sb.sender = ?');
      params.push(sender);
    } else if (address) {
      conditions.push(`(
        sb.sender = ?
        OR EXISTS (
          SELECT 1 FROM streams sx
          WHERE sx.batch_id = sb.id
            AND (sx.sender = ? OR sx.recipient = ?)
        )
      )`);
      params.push(address, address, address);
    }

    if (vaultId) {
      conditions.push('sb.vault_id = ?');
      params.push(vaultId);
    }
    if (contextSource) {
      conditions.push('sb.launch_source = ?');
      params.push(contextSource);
    }
    if (treasury === 'true' && (sender || address || vaultId)) {
      conditions.push('sb.vault_id IS NOT NULL');
    } else if (!sender && !address && !vaultId) {
      const viewerScope = await buildViewerScope(req, treasury === 'true', {
        vaultIdColumn: 'sb.vault_id',
        ownRowsSql: `(sb.sender = ? OR EXISTS (
          SELECT 1 FROM streams sx WHERE sx.batch_id = sb.id AND sx.recipient = ?
        ))`,
      });
      if (!viewerScope) {
        return res.json({
          success: true,
          batches: [],
          total: 0,
          page: currentPage,
          limit: safeLimit,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: currentPage > 1,
        });
      }
      conditions.push(viewerScope.sql);
      params.push(...viewerScope.params);
    }
    if (status) {
      conditions.push('sb.status = ?');
      params.push(status);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRow = await db!.prepare(`
      SELECT COUNT(*) as count
      FROM ${STREAM_BATCH_ROWS_SQL} sb
      ${whereClause}
    `).get(...params) as { count: number };
    const total = Number(countRow?.count || 0);

    const rows = await db!.prepare(`
      SELECT *
      FROM ${STREAM_BATCH_ROWS_SQL} sb
      ${whereClause}
      ORDER BY sb.created_at DESC
      LIMIT ?
      OFFSET ?
    `).all(...params, safeLimit, offset) as Array<Record<string, unknown>>;

    res.json({
      success: true,
      batches: rows.map(rowToStreamBatch),
      total,
      page: currentPage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      hasNextPage: offset + rows.length < total,
      hasPreviousPage: currentPage > 1,
    });
  } catch (error: any) {
    console.error('GET /streams/batch-runs error:', error);
    res.status(500).json({ error: 'Failed to fetch stream batch runs', message: error.message });
  }
});

router.get('/streams/batch-runs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const batchRow = await db!.prepare(`
      SELECT *
      FROM ${STREAM_BATCH_ROWS_SQL} sb
      WHERE sb.id = ?
    `).get(id) as Record<string, unknown> | undefined;

    if (!batchRow) {
      return res.status(404).json({ error: 'Stream batch not found' });
    }

    const streamRows = await db!.prepare(`
      SELECT *
      FROM streams
      WHERE batch_id = ?
      ORDER BY created_at ASC, stream_id ASC
    `).all(id) as any[];

    const events = await listBatchActivityEvents(streamRows.map((row) => String(row.id)), 500);

    res.json({
      success: true,
      batch: rowToStreamBatch(batchRow),
      streams: streamRows.map((row) => streamService.enrichStream(rowToStream(row))),
      events,
    });
  } catch (error: any) {
    console.error(`GET /streams/batch-runs/${req.params.id} error:`, error);
    res.status(500).json({ error: 'Failed to fetch stream batch', message: error.message });
  }
});

router.get('/streams/batch-runs/:id/export', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const batchRow = await db!.prepare('SELECT * FROM stream_batches WHERE id = ?').get(id) as StreamBatchRow | undefined;
    if (!batchRow) {
      return res.status(404).json({ error: 'Stream batch not found' });
    }

    const rows = await db!.prepare(`
      SELECT *
      FROM streams
      WHERE batch_id = ?
      ORDER BY created_at ASC, stream_id ASC
    `).all(id) as any[];

    const csvHeader = [
      'streamId',
      'recipient',
      'amount',
      'description',
      'scheduleTemplate',
      'streamType',
      'startDate',
      'durationDays',
      'intervalDays',
      'cliffDays',
      'unlockPercent',
      'unlockDay',
      'trancheOffsetsDays',
      'tranchePercentages',
      'status',
      'contractAddress',
      'txHash',
    ];

    const csvRows = rows.map((row) => buildBatchExportRow(row));
    const csv = [
      csvHeader.join(','),
      ...csvRows.map((row) => csvHeader.map((column) => escapeCsvValue(String((row as Record<string, string>)[column] ?? ''))).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="flowguard-stream-batch-${id}.csv"`);
    res.send(csv);
  } catch (error: any) {
    console.error(`GET /streams/batch-runs/${req.params.id}/export error:`, error);
    res.status(500).json({ error: 'Failed to export stream batch', message: error.message });
  }
});

/**
 * GET /api/streams/:id
 * Get single stream details with claim history
 */
router.get('/streams/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const row = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    // Claims written before the UUID fix carry the logical #FG id; read both until backfilled.
    const claimRows = await db!.prepare('SELECT * FROM stream_claims WHERE stream_id IN (?, ?) ORDER BY claimed_at DESC').all(id, row.stream_id) as any[];

    const stream = rowToStream(row);
    const claims: StreamClaim[] = claimRows.map(c => ({
      id: c.id,
      stream_id: c.stream_id,
      recipient: c.recipient,
      amount: c.amount,
      claimed_at: c.claimed_at,
      tx_hash: c.tx_hash || undefined,
    }));
    const storedEvents = await listActivityEvents('stream', id, 200);
    const events = storedEvents;

    res.json({
      success: true,
      stream: { ...streamService.enrichStream(stream), claim_deferred_until: await getClaimDeferredUntil(row) },
      claims,
      events,
    });
  } catch (error: any) {
    console.error(`GET /streams/${req.params.id} error:`, error);
    res.status(500).json({ error: 'Failed to fetch stream', message: error.message });
  }
});

/**
 * POST /api/streams/create
 * Create a single stream
 */
router.post('/streams/create', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    // Sender is bound to the verified wallet proof; body value is ignored so
    // an attacker cannot create streams "from" a victim address.
    const sender = req.verifiedUser!.address;
    const {
      recipient,
      tokenType,
      tokenCategory,
      tokenDecimals: tokenDecimalsHint,
      totalAmount,
      streamType,
      startTime,
      endTime,
      cliffTimestamp,
      cancelable,
      transferable,
      description,
      vaultId,
      intervalSeconds,
      scheduleTemplate,
      refillable,
      hybridUnlockTimestamp,
      hybridUpfrontPercentage,
      trancheSchedule,
      launchContext,
    } = req.body;

    if (!recipient) {
      return res.status(400).json({ error: 'Recipient is required' });
    }
    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ error: 'Total amount must be greater than 0' });
    }
    if (!streamType || !['LINEAR', 'RECURRING', 'STEP', 'TRANCHE', 'HYBRID'].includes(streamType)) {
      return res.status(400).json({ error: 'Invalid stream type' });
    }
    if (!isP2pkhAddress(sender) || !isP2pkhAddress(recipient)) {
      return res.status(400).json({
        error: 'Invalid address type',
        message: 'Stream sender and recipient must be P2PKH cash addresses.',
      });
    }
    const cancelableRequested = cancelable !== false;
    // Like Sablier, a recipient can move their stream to a new wallet unless the sender turns
    // it off. Only the vesting covenants have a transfer path.
    const transferableRequested = transferable !== false && streamType !== 'RECURRING';
    const normalizedTokenType: 'BCH' | 'FUNGIBLE_TOKEN' = tokenType === 'FUNGIBLE_TOKEN' || tokenType === 'CASHTOKENS'
      ? 'FUNGIBLE_TOKEN'
      : 'BCH';
    const normalizedLaunchContext = normalizeLaunchContext(launchContext);
    if (normalizedTokenType === 'FUNGIBLE_TOKEN' && !tokenCategory) {
      return res.status(400).json({ error: 'Token category required for CashTokens' });
    }
    // Decimals source-of-truth is the token's BCMR registry, so FlowGuard scales
    // whole tokens to base units exactly as the sender's wallet does. The client
    // hint is only a fallback (e.g. chipnet, where no public indexer exists).
    const tokenDecimals = normalizedTokenType === 'FUNGIBLE_TOKEN'
      ? await resolveTokenDecimals(tokenCategory, resolveBchNetwork(), tokenDecimalsHint)
      : 0;
    const conversionDecimals = normalizedTokenType === 'FUNGIBLE_TOKEN' ? tokenDecimals : 0;
    if (scheduleTemplate && !isValidStreamScheduleTemplate(scheduleTemplate)) {
      return res.status(400).json({ error: 'Invalid schedule template' });
    }
    const refillableRequested = Boolean(refillable);
    if (refillableRequested && streamType !== 'RECURRING') {
      return res.status(400).json({
        error: 'Only recurring streams can be configured as refillable',
      });
    }
    const hybridUnlockTimestampValue = hybridUnlockTimestamp ? Number(hybridUnlockTimestamp) : undefined;
    const hybridUpfrontPercentageValue = hybridUpfrontPercentage !== undefined
      ? Number(hybridUpfrontPercentage)
      : undefined;

    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    console.log('[streams.create]', {
      network: resolveBchNetwork(),
      tokenType: normalizedTokenType,
      tokenCategory: tokenCategory ?? null,
      totalAmount,
      streamType,
      hasVault: Boolean(vaultId),
    });

    // Deploy stream contract with proper NFT state
    const deploymentService = new StreamDeploymentService(resolveBchNetwork());

    // Resolve vault linkage: support standalone streams while preserving nonzero
    // constructor vaultId expected by on-chain covenant invariants.
    let actualVaultId = deriveStandaloneVaultId(`${id}:${sender}:${recipient}:${now}`);
    if (vaultId) {
      const vaultRow = await db!.prepare('SELECT * FROM vaults WHERE vault_id = ?').get(vaultId) as any;
      if (vaultRow?.constructor_params) {
        const vaultParams = JSON.parse(vaultRow.constructor_params);
        if (vaultParams[0]?.type === 'bytes') {
          actualVaultId = vaultParams[0].value;
        }
      }
    }

    const scheduleEndTime = endTime || startTime + 86400 * 365;
    const resolvedEndTime = refillableRequested && streamType === 'RECURRING'
      ? 0
      : scheduleEndTime;
    const deploymentParams = {
      vaultId: actualVaultId,
      sender,
      recipient,
      totalAmount,
      startTime,
      endTime: resolvedEndTime,
      streamType: streamType as 'LINEAR' | 'STEP' | 'RECURRING' | 'TRANCHE' | 'HYBRID',
      cliffTime: cliffTimestamp,
      cancelable: cancelableRequested,
      transferable: transferableRequested,
      tokenType: normalizedTokenType,
      tokenCategory,
      tokenDecimals,
    };

    let intervalSecondsForRow: number | null = null;
    let hybridUnlockTimestampForRow: number | null = null;
    let hybridUpfrontAmountDisplayForRow: number | null = null;
    let normalizedTrancheSchedule: Array<{ unlockTime: number; cumulativeAmountDisplay: number }> = [];
    let cliffTimestampForRow = cliffTimestamp || null;
    let deployment;
    if (streamType === 'RECURRING') {
      const durationSeconds = Math.max(1, scheduleEndTime - startTime);
      const explicitIntervalSeconds = Number(intervalSeconds);
      if (!Number.isFinite(explicitIntervalSeconds) || explicitIntervalSeconds <= 0) {
        return res.status(400).json({
          error: 'Recurring streams require a valid intervalSeconds value',
        });
      }
      if (explicitIntervalSeconds > durationSeconds) {
        return res.status(400).json({
          error: 'Recurring interval must be shorter than or equal to the total schedule duration',
        });
      }
      if (durationSeconds % explicitIntervalSeconds !== 0) {
        return res.status(400).json({
          error: 'Recurring interval must divide the total schedule duration evenly',
        });
      }
      const intervalCount = Math.max(1, Math.floor(durationSeconds / explicitIntervalSeconds));
      const totalOnChain = displayAmountToOnChain(Number(totalAmount), normalizedTokenType, conversionDecimals);
      if (totalOnChain <= 0) {
        return res.status(400).json({ error: 'Recurring stream total amount must be greater than zero' });
      }
      if (intervalCount < 1) {
        return res.status(400).json({
          error: 'Recurring stream must include at least one unlock interval',
        });
      }
      if (intervalCount > MAX_RECURRING_STREAM_PAYMENTS) {
        return res.status(400).json({ error: getRecurringPaymentCountError(intervalCount) });
      }
      if (totalOnChain % intervalCount !== 0) {
        return res.status(400).json({
          error:
            'Recurring stream total amount must divide evenly across the selected cadence. ' +
            'Adjust the amount, duration, or interval.',
        });
      }
      intervalSecondsForRow = explicitIntervalSeconds;
      const amountPerIntervalOnChain = Math.floor(totalOnChain / intervalCount);
      const amountPerIntervalDisplay = onChainAmountToDisplay(amountPerIntervalOnChain, normalizedTokenType, conversionDecimals);
      deployment = await deploymentService.deployRecurringStream({
        ...deploymentParams,
        totalAmount: refillableRequested ? 0 : Number(totalAmount),
        endTime: resolvedEndTime,
        intervalSeconds: intervalSecondsForRow,
        amountPerInterval: amountPerIntervalDisplay,
      });
    } else if (streamType === 'STEP') {
      const durationSeconds = Math.max(1, resolvedEndTime - startTime);
      const explicitStepIntervalSeconds = Number(intervalSeconds);
      if (!Number.isFinite(explicitStepIntervalSeconds) || explicitStepIntervalSeconds <= 0) {
        return res.status(400).json({
          error: 'Step vesting requires a valid intervalSeconds value',
        });
      }
      if (explicitStepIntervalSeconds > durationSeconds) {
        return res.status(400).json({
          error: 'Step interval must be shorter than or equal to the total vesting duration',
        });
      }
      if (durationSeconds % explicitStepIntervalSeconds !== 0) {
        return res.status(400).json({
          error: 'Step interval must divide the total vesting duration evenly',
        });
      }
      const stepCount = Math.max(1, Math.floor(durationSeconds / explicitStepIntervalSeconds));
      const totalOnChain = displayAmountToOnChain(Number(totalAmount), normalizedTokenType, conversionDecimals);
      if (totalOnChain <= 0) {
        return res.status(400).json({ error: 'Step vesting total amount must be greater than zero' });
      }
      const stepAmountOnChain = Math.floor((totalOnChain + stepCount - 1) / stepCount);
      const stepAmountDisplay = onChainAmountToDisplay(stepAmountOnChain, normalizedTokenType, conversionDecimals);
      intervalSecondsForRow = explicitStepIntervalSeconds;
      const stepParams = {
        ...deploymentParams,
        stepInterval: intervalSecondsForRow,
        stepAmount: stepAmountDisplay,
      };
      deployment = normalizedTokenType === 'FUNGIBLE_TOKEN'
        ? await deploymentService.deployFtVestingStream(stepParams)
        : await deploymentService.deployVestingStream(stepParams);
    } else if (streamType === 'TRANCHE') {
      const normalized = normalizeTrancheSchedule({
        trancheSchedule,
        totalAmount: Number(totalAmount),
        tokenType: normalizedTokenType,
        decimals: conversionDecimals,
        startTime,
      });
      normalizedTrancheSchedule = normalized.schedule;
      cliffTimestampForRow = normalized.schedule[0].unlockTime > startTime
        ? normalized.schedule[0].unlockTime
        : null;
      deployment = await deploymentService.deployTrancheStream({
        ...deploymentParams,
        endTime: normalized.finalUnlockTime,
        trancheSchedule: normalized.schedule.map((tranche) => ({
          unlockTime: tranche.unlockTime,
          cumulativeAmount: tranche.cumulativeAmountDisplay,
        })),
      });
    } else if (streamType === 'HYBRID') {
      if (!Number.isFinite(hybridUnlockTimestampValue) || !hybridUnlockTimestampValue) {
        return res.status(400).json({
          error: 'Hybrid streams require a valid hybridUnlockTimestamp value',
        });
      }
      const resolvedHybridUpfrontPercentage = hybridUpfrontPercentageValue ?? Number.NaN;
      if (!Number.isFinite(resolvedHybridUpfrontPercentage) || resolvedHybridUpfrontPercentage <= 0 || resolvedHybridUpfrontPercentage >= 100) {
        return res.status(400).json({
          error: 'Hybrid streams require a hybridUpfrontPercentage between 0 and 100',
        });
      }
      if (hybridUnlockTimestampValue <= startTime) {
        return res.status(400).json({
          error: 'Hybrid unlock timestamp must be after the stream start time',
        });
      }
      if (hybridUnlockTimestampValue >= resolvedEndTime) {
        return res.status(400).json({
          error: 'Hybrid unlock timestamp must be before the stream end time',
        });
      }

      const totalOnChain = displayAmountToOnChain(Number(totalAmount), normalizedTokenType, conversionDecimals);
      const hybridUpfrontAmountOnChain = Math.max(
        1,
        Math.floor((totalOnChain * resolvedHybridUpfrontPercentage) / 100),
      );
      hybridUnlockTimestampForRow = hybridUnlockTimestampValue;
      hybridUpfrontAmountDisplayForRow = onChainAmountToDisplay(hybridUpfrontAmountOnChain, normalizedTokenType, conversionDecimals);
      cliffTimestampForRow = hybridUnlockTimestampForRow;

      deployment = await deploymentService.deployHybridStream({
        ...deploymentParams,
        endTime: resolvedEndTime,
        hybridUnlockTime: hybridUnlockTimestampForRow,
        hybridUpfrontAmount: hybridUpfrontAmountDisplayForRow,
      });
    } else {
      deployment = normalizedTokenType === 'FUNGIBLE_TOKEN'
        ? await deploymentService.deployFtVestingStream(deploymentParams)
        : await deploymentService.deployVestingStream(deploymentParams);
    }

    // Next sequence = MAX(existing #FG-*-NNN) + 1, NOT COUNT(*)+1: deletions leave
    // gaps, so COUNT can fall below the highest number and regenerate an in-use id.
    const maxRow = await db!.prepare(
      "SELECT COALESCE(MAX(CAST(substring(stream_id from '[0-9]+$') AS INTEGER)), 0) as maxseq FROM streams WHERE stream_id ~ '#FG-(TOK|BCH)-[0-9]+$'",
    ).get() as any;
    const streamId = streamService.generateStreamId(
      normalizedTokenType === 'BCH' ? 'BCH' : 'CASHTOKENS',
      Number(maxRow?.maxseq || 0) + 1,
    );

    // Store with PENDING status - becomes ACTIVE after funding tx confirmed
    await db!.prepare(`
      INSERT INTO streams (id, stream_id, vault_id, sender, recipient, token_type, token_category,
        token_decimals, total_amount, withdrawn_amount, stream_type, start_time, end_time, interval_seconds, cliff_timestamp,
        cancelable, transferable, refillable, status, schedule_template, launch_source, launch_title,
        launch_description, preferred_lane, description, created_at, updated_at, contract_address,
        constructor_params, nft_commitment, nft_capability)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, streamId, vaultId || null, sender, recipient,
      normalizedTokenType === 'BCH' ? 'BCH' : 'CASHTOKENS',
      tokenCategory || null,
      tokenDecimals,
      totalAmount,
      streamType,
      startTime,
      streamType === 'TRANCHE'
        ? normalizedTrancheSchedule[normalizedTrancheSchedule.length - 1]?.unlockTime || null
        : refillableRequested
          ? null
          : resolvedEndTime || null,
      intervalSecondsForRow,
      streamType === 'TRANCHE' || streamType === 'HYBRID'
        ? cliffTimestampForRow
        : cliffTimestamp || null,
      cancelableRequested ? 1 : 0,
      transferableRequested ? 1 : 0,
      refillableRequested ? 1 : 0,
      scheduleTemplate || null,
      normalizedLaunchContext?.source || null,
      normalizedLaunchContext?.title || null,
      normalizedLaunchContext?.description || null,
      normalizedLaunchContext?.preferredLane || null,
      description || null, now, now,
      deployment.contractAddress || null,
      JSON.stringify(deployment.constructorParams),
      deployment.initialCommitment,
      'mutable'
    );
    await recordActivityEvent({
      entityType: 'stream',
      entityId: id,
      eventType: 'created',
      actor: sender,
      amount: Number(totalAmount),
      status: 'PENDING',
      details: {
        streamId,
        streamType,
        scheduleTemplate: scheduleTemplate || null,
        startTime,
        endTime: streamType === 'TRANCHE'
          ? normalizedTrancheSchedule[normalizedTrancheSchedule.length - 1]?.unlockTime || null
          : refillableRequested
            ? null
            : resolvedEndTime || null,
        cliffTimestamp: streamType === 'TRANCHE' || streamType === 'HYBRID'
          ? cliffTimestampForRow
          : cliffTimestamp || null,
        refillable: refillableRequested,
        launchContext: normalizedLaunchContext,
        hybridUnlockTimestamp: hybridUnlockTimestampForRow,
        hybridUpfrontAmount: hybridUpfrontAmountDisplayForRow,
        trancheSchedule: streamType === 'TRANCHE' ? normalizedTrancheSchedule : undefined,
      },
      createdAt: now,
    });

    const row = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    const stream = streamService.enrichStream(rowToStream(row));

    res.json({
      success: true,
      message: 'Stream contract deployed - awaiting funding transaction',
      stream,
      deployment: {
        contractAddress: deployment.contractAddress,
        streamId,
        onChainStreamId: deployment.streamId,
        fundingRequired: deployment.fundingTxRequired,
        nftCommitment: deployment.initialCommitment,
      },
    });
  } catch (error: any) {
    console.error('POST /streams/create error:', error);
    res.status(500).json({ error: 'Failed to create stream', message: error.message });
  }
});

/**
 * Detect a two-UTXO CashToken vesting stream and parse its schedule from
 * constructor_params. FT vesting rows carry 10 params before funding (9 schedule
 * + ftCategory) and 11 after (stateCategory appended). BCH/other rows return null.
 */
function parseFtVestingRow(row: any): { args: FtScheduleArgs; ftCategory: string; stateCategory: string | null } | null {
  if (row?.token_type !== 'CASHTOKENS') return null;
  if (row.stream_type !== 'LINEAR' && row.stream_type !== 'STEP') return null;
  let cp: any[];
  try { cp = JSON.parse(row.constructor_params); } catch { return null; }
  if (!Array.isArray(cp) || cp.length < 10 || cp[9]?.type !== 'bytes') return null;
  const args: FtScheduleArgs = {
    vaultId: cp[0].value,
    senderHash: cp[1].value,
    scheduleType: Number(cp[2].value) === 2 ? 2 : 1,
    totalAmount: BigInt(cp[3].value),
    startTimestamp: BigInt(cp[4].value),
    endTimestamp: BigInt(cp[5].value),
    cliffTimestamp: BigInt(cp[6].value),
    stepInterval: BigInt(cp[7].value),
    stepAmount: BigInt(cp[8].value),
  };
  return { args, ftCategory: cp[9].value, stateCategory: cp[10]?.value ?? null };
}

/**
 * GET /api/streams/:id/funding-info
 * Get funding transaction parameters for a pending stream
 */
router.get('/streams/:id/funding-info', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const storedRow = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!storedRow) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    if (storedRow.status !== 'PENDING') {
      return res.status(400).json({
        error: 'Stream is not pending',
        message: `Stream status is ${storedRow.status}. Only PENDING streams can be funded.`,
      });
    }

    // Only the sender may move the schedule; anyone else gets the stored state.
    const row = req.verifiedUser!.address === storedRow.sender
      ? await rebaseUnfundedStreamSchedule(storedRow, Math.floor(Date.now() / 1000))
      : storedRow;

    // Two-UTXO CashToken stream: finalize the address from a fresh genesis anchor,
    // build the mint-authority-free funding tx, and persist the finalized state.
    const ftRow = parseFtVestingRow(row);
    if (ftRow) {
      const ftService = new FtVestingService(resolveBchNetwork());
      // CashToken genesis needs a coin at output-index 0. If the sender's wallet
      // has none, return a one-off self-send to mint one; the client signs it,
      // then re-requests funding-info (which now finds the fresh vout-0 anchor).
      let anchorPrep;
      try {
        anchorPrep = await ftService.buildAnchorPrepWc({ senderAddress: row.sender });
      } catch (anchorErr: any) {
        return res.status(400).json({ error: anchorErr?.message || 'Could not prepare your wallet for funding.' });
      }
      if (anchorPrep.needsAnchor && anchorPrep.wcTransaction) {
        return res.json({
          success: true,
          needsAnchor: true,
          message: ANCHOR_PREP_PROMPT,
          wcTransaction: serializeWcTransaction(anchorPrep.wcTransaction),
        });
      }
      let funding;
      try {
        funding = await ftService.buildFundingWc({
          args: ftRow.args,
          ftCategory: ftRow.ftCategory,
          tokenAmount: ftRow.args.totalAmount,
          senderAddress: row.sender,
          recipient: row.recipient,
          cancelable: row.cancelable === 1,
          transferable: row.transferable === 1,
          existingStateCategory: ftRow.stateCategory,
          stateReserve: getFtStateReserveSatoshis(getStreamMaxClaims(row)),
        });
      } catch (ftErr: any) {
        // These are user-fixable (not enough tokens/BCH, wallet not ready) — 400, clean message.
        return res.status(400).json({ error: ftErr?.message || 'Could not prepare the funding transaction.' });
      }
      // updated_at marks the address just handed out, so a rebase waits for it.
      await db!.prepare('UPDATE streams SET contract_address = ?, constructor_params = ?, nft_commitment = ?, updated_at = ? WHERE id = ?')
        .run(funding.contractAddress, JSON.stringify(funding.constructorParams), funding.initialCommitment, Math.floor(Date.now() / 1000), id);
      return res.json({
        success: true,
        fundingInfo: {
          streamId: row.stream_id,
          contractAddress: funding.contractAddress,
          sender: row.sender,
          recipient: row.recipient,
          amount: Number(ftRow.args.totalAmount),
          tokenType: 'CASHTOKENS',
          tokenCategory: ftRow.ftCategory,
          tokenAmount: Number(ftRow.args.totalAmount),
          nftCommitment: funding.initialCommitment,
          predictedCommitment: funding.initialCommitment,
          inputs: funding.inputs,
          outputs: funding.outputs,
          fee: funding.fee,
        },
        wcTransaction: serializeWcTransaction(funding.wcTransaction),
      });
    }

    const contractAddress = row.contract_address;
    if (!contractAddress) {
      return res.status(500).json({ error: 'Contract address not found for stream' });
    }

    const tokenType = row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' : 'BCH';
    const fundingAmount = displayAmountToOnChain(Number(row.total_amount), row.token_type, Number(row.token_decimals || 0));
    const now = Math.floor(Date.now() / 1000);
    const nftCommitment = getPendingFundingCommitment(row, now);
    if (!nftCommitment) {
      return res.status(400).json({ error: 'Missing stream NFT commitment for funding' });
    }

    // The BCH stateful covenant mints a state NFT, whose category genesis (like
    // CashToken genesis) requires a coin at output-index 0 — see StreamFundingService's
    // non-token branch. If the sender has no pure-BCH vout-0 coin, return a one-off
    // self-send to mint one; the client signs it, then re-requests funding-info
    // (which now finds the fresh anchor). Only the BCH path mints via vout-0.
    if (tokenType === 'BCH') {
      let bchAnchorPrep;
      try {
        bchAnchorPrep = await new FtVestingService(resolveBchNetwork()).buildAnchorPrepWc({
          senderAddress: row.sender,
          userPrompt: ANCHOR_PREP_PROMPT,
        });
      } catch (anchorErr: any) {
        return res.status(400).json({ error: anchorErr?.message || 'Could not prepare your wallet for funding.' });
      }
      if (bchAnchorPrep.needsAnchor && bchAnchorPrep.wcTransaction) {
        return res.json({
          success: true,
          needsAnchor: true,
          message: ANCHOR_PREP_PROMPT,
          wcTransaction: serializeWcTransaction(bchAnchorPrep.wcTransaction),
        });
      }
    }

    const fundingService = new StreamFundingService(resolveBchNetwork());
    const fundingTx = await fundingService.buildFundingTransaction({
      contractAddress,
      senderAddress: row.sender,
      amount: fundingAmount,
      tokenType,
      tokenCategory: row.token_category || undefined,
      nftCommitment,
      nftCapability: (row.nft_capability || 'mutable') as 'none' | 'mutable' | 'minting',
      contractSatoshis: getStreamContractFundingSatoshis(tokenType, BigInt(fundingAmount), getStreamMaxClaims(row)),
    });
    // updated_at marks the tx just handed out, so a rebase waits for it.
    await db!.prepare("UPDATE streams SET updated_at = ? WHERE id = ? AND status = 'PENDING'").run(now, id);

    res.json({
      success: true,
      fundingInfo: {
        streamId: row.stream_id,
        contractAddress,
        sender: row.sender,
        recipient: row.recipient,
        amount: fundingAmount,
        tokenType: row.token_type,
        tokenCategory: row.token_category,
        tokenAmount: row.token_type === 'CASHTOKENS' ? Number(row.total_amount) : undefined,
        nftCommitment,
        predictedCommitment: nftCommitment,
        inputs: fundingTx.inputs,
        outputs: fundingTx.outputs,
        fee: fundingTx.fee,
      },
      wcTransaction: serializeWcTransaction(fundingTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`GET /streams/${req.params.id}/funding-info error:`, error);
    res.status(500).json({ error: 'Failed to get funding info', message: error.message });
  }
});

/**
 * POST /api/streams/:id/confirm-funding
 * Mark stream as funded after successful funding transaction
 */
router.post('/streams/:id/confirm-funding', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { txHash } = req.body;
    const network = resolveBchNetwork();

    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash required' });
    }

    if (!(await transactionExists(txHash, network))) {
      return res.status(409).json({
        error: 'Transaction hash not found on network',
        message: 'Transaction is not indexed yet. Retry confirmation shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'TX_NOT_FOUND',
      });
    }

    let row = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    if (row.status !== 'PENDING') {
      return res.status(400).json({ error: 'Stream is not pending' });
    }

    // A PENDING stream is flipped to ACTIVE only when the funding tx carries the
    // expected output to THIS stream's contract address (checked below), which
    // binds the confirmation to the specific contract. The earlier "input must
    // come from the caller's address" guard broke multi-address / covenant
    // wallets that fund from a different address than they authenticate with.

    const isTokenStream = row.token_type === 'CASHTOKENS';
    const fundingAmountOnChain = displayAmountToOnChain(Number(row.total_amount), row.token_type, Number(row.token_decimals || 0));
    const minimumContractSatoshis = getStreamContractFundingSatoshis(
      isTokenStream ? 'FUNGIBLE_TOKEN' : 'BCH',
      BigInt(fundingAmountOnChain),
      getStreamMaxClaims(row),
    );

    // Two-UTXO CashToken funding splits the state NFT (stateCategory) and the
    // token vault (ftCategory) across TWO outputs, so validate each separately.
    const ftConfirmRow = parseFtVestingRow(row);
    let expectedContractOutput: boolean;
    if (ftConfirmRow && ftConfirmRow.stateCategory) {
      const stateNftOutput = await transactionHasExpectedOutput(
        txHash,
        {
          address: row.contract_address,
          minimumSatoshis: 546n,
          tokenCategory: ftConfirmRow.stateCategory,
          requireNft: true,
          requiredNftCapability: 'mutable',
          minimumNftCommitmentBytes: 32,
        },
        network,
      );
      const vaultOutput = await transactionHasExpectedOutput(
        txHash,
        {
          address: row.contract_address,
          minimumSatoshis: 546n,
          tokenCategory: ftConfirmRow.ftCategory,
          minimumTokenAmount: ftConfirmRow.args.totalAmount > 0n ? ftConfirmRow.args.totalAmount : 1n,
        },
        network,
      );
      expectedContractOutput = stateNftOutput && vaultOutput;
    } else {
      const paysContractAt = (address: string) => transactionHasExpectedOutput(
        txHash,
        {
          address,
          minimumSatoshis: minimumContractSatoshis,
          ...(isTokenStream && row.token_category
            ? {
                tokenCategory: row.token_category,
                minimumTokenAmount: BigInt(Math.max(0, Math.trunc(fundingAmountOnChain))),
              }
            : {}),
          requireNft: true,
          requiredNftCapability: 'mutable',
          minimumNftCommitmentBytes: 32,
        },
        network,
      );
      expectedContractOutput = await paysContractAt(row.contract_address);
      if (!expectedContractOutput) {
        // A wallet can hold a signed funding tx past a rebase and broadcast it to the
        // address it was built for. Take that payment and put back the schedule that
        // address was derived from, so the money isn't stranded at an old address.
        const restored = await restoreScheduleForEarlierAddress(row, paysContractAt);
        if (restored) {
          row = restored;
          expectedContractOutput = true;
        }
      }
    }

    if (!expectedContractOutput) {
      return res.status(400).json({
        error: 'Funding transaction does not include the expected contract output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const contractService = new ContractService(resolveBchNetwork());
    const predictedCommitment = getPendingFundingCommitment(row, now);
    const confirmedCommitment = await contractService.getNFTCommitment(row.contract_address)
      || predictedCommitment
      || row.nft_commitment
      || null;

    await db!.prepare(`
      UPDATE streams
      SET status = 'ACTIVE', tx_hash = ?, nft_commitment = ?, activated_at = ?, updated_at = ?
      WHERE id = ?
    `).run(txHash, confirmedCommitment, now, now, id);
    await recordActivityEvent({
      entityType: 'stream',
      entityId: id,
      eventType: 'funded',
      actor: row.sender,
      amount: Number(row.total_amount),
      status: 'ACTIVE',
      txHash,
      details: {
        contractAddress: row.contract_address,
        tokenType: row.token_type,
        tokenCategory: row.token_category || null,
      },
      createdAt: now,
    });

    const updatedRow = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    const stream = streamService.enrichStream(rowToStream(updatedRow));

    res.json({
      success: true,
      message: 'Stream funded successfully',
      stream,
      txHash,
      state: 'confirmed',
      retryable: false,
      status: stream.status,
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/confirm-funding error:`, error);
    res.status(500).json({
      error: 'Failed to confirm funding',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

/**
 * POST /api/streams/:id/claim
 * Build claim transaction for vested amount
 */
router.post('/streams/:id/claim', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { recipientAddress, signerAddress } = req.body;

    if (!recipientAddress) {
      return res.status(400).json({ error: 'Recipient address required' });
    }

    const row = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    if (row.status !== 'ACTIVE') {
      return res.status(400).json({
        error: 'Stream is not active',
        message: `Stream status is ${row.status}. Only ACTIVE streams can be claimed.`,
      });
    }
    if (!row.contract_address || !row.constructor_params) {
      return res.status(400).json({
        error: 'Stream contract is not fully configured',
        message: 'This stream has no deployable on-chain contract state.',
      });
    }

    // Verify recipient matches
    if (row.recipient.toLowerCase() !== recipientAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the stream recipient can claim funds' });
    }

    const contractService = new ContractService(resolveBchNetwork());
    const constructorParams = deserializeConstructorParams(row.constructor_params);
    const currentCommitment = await contractService.getNFTCommitment(row.contract_address);
    if (!currentCommitment) {
      return res.status(409).json({
        error: 'Stream state is still syncing',
        message: 'Unable to read live on-chain stream state right now. Retry claim in a few seconds.',
        state: 'pending',
        retryable: true,
        errorCode: 'STREAM_STATE_UNAVAILABLE',
      });
    }

    if (row.stream_type === 'RECURRING') {
      const recurringClaimService = new PaymentClaimService(resolveBchNetwork());
      const recurringState = parseRecurringCommitment(currentCommitment);
      const claimTx = await recurringClaimService.buildClaimTransaction({
        paymentId: row.stream_id,
        contractAddress: row.contract_address,
        recipient: row.recipient,
        amountPerInterval: Number(toBigIntParam(constructorParams[3], 'amountPerInterval')),
        intervalSeconds: Number(toBigIntParam(constructorParams[4], 'intervalSeconds')),
        totalPaid: Number(recurringState.totalPaid),
        nextPaymentTime: recurringState.nextPaymentTime,
        currentTime: Math.floor(Date.now() / 1000),
        endTime: row.end_time || undefined,
        tokenType: row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' : 'BCH',
        tokenCategory: row.token_category || undefined,
        feePayerAddress: signerAddress || recipientAddress,
        constructorParams,
        currentCommitment,
      });
      const claimableAmount = onChainAmountToDisplay(claimTx.claimableAmount, row.token_type, Number(row.token_decimals || 0));
      return res.json({
        success: true,
        claimableAmount,
        wcTransaction: serializeWcTransaction(claimTx.wcTransaction),
      });
    }

    // Two-UTXO CashToken stream: spend the state NFT + token vault together.
    const ftClaimRow = parseFtVestingRow(row);
    if (ftClaimRow && ftClaimRow.stateCategory) {
      const ftService = new FtVestingService(resolveBchNetwork());
      try {
        const claim = await ftService.buildClaimWc({
          args: ftClaimRow.args,
          stateCategory: ftClaimRow.stateCategory,
          ftCategory: ftClaimRow.ftCategory,
          recipientAddress: row.recipient,
          currentCommitment: hexToBin(currentCommitment),
          nowSeconds: Math.floor(Date.now() / 1000),
        });
        const claimableAmount = onChainAmountToDisplay(Number(claim.claimable), row.token_type, Number(row.token_decimals || 0));
        return res.json({
          success: true,
          claimableAmount,
          wcTransaction: serializeWcTransaction(claim.wcTransaction),
        });
      } catch (ftErr: any) {
        if (ftErr instanceof StreamClaimReserveError) {
          return res.status(409).json({
            error: ftErr.message,
            message: ftErr.message,
            retryable: false,
            errorCode: 'CLAIM_RESERVE_LIMITED',
            claimableFrom: ftErr.claimableFrom,
          });
        }
        return res.status(400).json({ error: ftErr?.message || 'Could not prepare the claim transaction.', retryable: true });
      }
    }

    const claimService = new StreamClaimService(resolveBchNetwork());
    const vestingState = parseVestingCommitmentState(currentCommitment);
    if (!vestingState) {
      return res.status(409).json({
        error: 'Stream state is still syncing',
        message: 'Unable to decode live stream commitment right now. Retry claim in a few seconds.',
        state: 'pending',
        retryable: true,
        errorCode: 'STREAM_STATE_UNAVAILABLE',
      });
    }
    if (vestingState.status !== 0) {
      return res.status(409).json({
        error: 'Stream is not claimable right now',
        message: `On-chain stream state is ${vestingState.status}. Refresh and retry after status sync.`,
        state: 'pending',
        retryable: true,
        errorCode: 'STREAM_STATUS_MISMATCH',
      });
    }
    const totalAmountOnChain = resolveOnChainStreamTotalAmount(row, constructorParams);
    const { startTime: onChainStartTime, endTime: onChainEndTime } = resolveOnChainStreamTimeBounds(
      row,
      constructorParams,
    );
    const scheduleDetails = getStreamScheduleDetails(row);

    // Build claim parameters
    const claimParams = {
      streamId: row.stream_id,
      contractAddress: row.contract_address,
      recipient: row.recipient,
      totalAmount: totalAmountOnChain,
      totalReleased: vestingState.totalReleased,
      startTime: onChainStartTime,
      endTime: onChainEndTime,
      currentTime: Math.floor(Date.now() / 1000),
      streamType: row.stream_type as 'LINEAR' | 'STEP' | 'TRANCHE' | 'HYBRID',
      stepInterval: scheduleDetails.intervalSeconds,
      stepAmount: scheduleDetails.stepAmountOnChain,
      hybridUnlockTime: scheduleDetails.hybridUnlockTime,
      hybridUpfrontAmount: scheduleDetails.hybridUpfrontAmountOnChain,
      trancheSchedule: scheduleDetails.trancheScheduleOnChain,
      tokenType: row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' as const : 'BCH' as const,
      tokenCategory: row.token_category,
      feePayerAddress: signerAddress || recipientAddress,
      constructorParams,
      currentCommitment,
    };

    // Validate claim
    const validation = claimService.validateClaim(claimParams);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const claimTx = await claimService.buildClaimTransaction(claimParams);
    const claimableAmount = onChainAmountToDisplay(claimTx.claimableAmount, row.token_type, Number(row.token_decimals || 0));

    res.json({
      success: true,
      claimableAmount,
      wcTransaction: serializeWcTransaction(claimTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/claim error:`, error);
    const message = typeof error?.message === 'string' ? error.message : 'Unknown claim builder error';

    if (error instanceof StreamClaimReserveError) {
      return res.status(409).json({
        error: message,
        message,
        retryable: false,
        errorCode: 'CLAIM_RESERVE_LIMITED',
        claimableFrom: error.claimableFrom,
      });
    }

    if (message.includes('No UTXOs found for stream contract')) {
      return res.status(409).json({
        error: 'Stream state is pending confirmation',
        message:
          'The stream contract UTXO is currently unavailable (often due to an unconfirmed pause/resume/cancel/fund tx). ' +
          'Wait for confirmation, refresh, and retry claim.',
      });
    }

    if (
      message.includes('Insufficient contract balance to preserve stream state UTXO')
      || message.includes('Insufficient contract balance to satisfy claim output')
    ) {
      return res.status(409).json({
        error: 'Insufficient fee reserve in stream contract',
        message:
          'This stream does not currently hold enough BCH to preserve covenant state after claim. ' +
          'Refill the stream with a small BCH reserve and retry.',
      });
    }

    if (message.includes('No funds available to claim') || message.includes('No payments available to claim')) {
      return res.status(400).json({
        error: 'Nothing to claim yet. Wait for more of the stream to be released, then try again.',
        retryable: true,
        errorCode: 'NOTHING_TO_CLAIM',
      });
    }

    return res.status(500).json({ error: 'Failed to build claim transaction', message });
  }
});

/**
 * POST /api/streams/:id/confirm-claim
 * Update stream state after successful claim
 */
router.post('/streams/:id/confirm-claim', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { claimedAmount, txHash } = req.body;

    if (!claimedAmount || !txHash) {
      return res.status(400).json({ error: 'Claimed amount and transaction hash required' });
    }

    if (!(await transactionExists(txHash, resolveBchNetwork()))) {
      return res.status(409).json({
        error: 'Transaction hash not found on chipnet',
        message: 'Transaction is not indexed yet. Retry confirmation shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'TX_NOT_FOUND',
      });
    }

    const row = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    const claimedAmountOnChain = displayAmountToOnChain(Number(claimedAmount), row.token_type, Number(row.token_decimals || 0));

    const expectedClaimOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: row.recipient,
        minimumSatoshis: BigInt(
          isFungibleTokenType(row.token_type)
            ? 546
            : Math.max(546, claimedAmountOnChain),
        ),
        ...(row.token_type === 'CASHTOKENS' && row.token_category
          ? {
              tokenCategory: row.token_category,
              minimumTokenAmount: BigInt(Math.max(0, Math.trunc(claimedAmountOnChain))),
            }
          : {}),
      },
      resolveBchNetwork(),
    );

    if (!expectedClaimOutput) {
      return res.status(400).json({
        error: 'Claim transaction does not include the expected recipient output',
      });
    }

    const newWithdrawnAmount = Number(row.withdrawn_amount || 0) + Number(claimedAmount);
    // The claim that releases the last of a fixed schedule finishes the stream on chain
    // (status byte 3), so the row follows. Refillable streams stay open until cancelled.
    const totalAmount = Number(row.total_amount || 0);
    const paidOut = !row.refillable && totalAmount > 0 && newWithdrawnAmount >= totalAmount * (1 - 1e-9);
    const nextStatus = paidOut ? 'COMPLETED' : row.status;

    await db!.prepare(`
      UPDATE streams
      SET withdrawn_amount = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(newWithdrawnAmount, nextStatus, Math.floor(Date.now() / 1000), id);

    // Record claim in stream_claims table
    await db!.prepare(`
      INSERT INTO stream_claims (id, stream_id, recipient, amount, claimed_at, tx_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      id,
      row.recipient,
      claimedAmount,
      Math.floor(Date.now() / 1000),
      txHash
    );
    await recordActivityEvent({
      entityType: 'stream',
      entityId: id,
      eventType: 'claim',
      actor: row.recipient,
      amount: Number(claimedAmount),
      status: String(row.status || 'ACTIVE'),
      txHash,
      details: {
        withdrawnAmountAfterClaim: newWithdrawnAmount,
      },
      createdAt: Math.floor(Date.now() / 1000),
    });

    const updatedRow = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    const stream = streamService.enrichStream(rowToStream(updatedRow));

    res.json({
      success: true,
      message: 'Claim confirmed',
      stream,
      txHash,
      state: 'confirmed',
      retryable: false,
      status: stream.status,
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/confirm-claim error:`, error);
    res.status(500).json({
      error: 'Failed to confirm claim',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

/**
 * GET /api/streams/:id/claim-info
 * Get claim transaction parameters for an active stream
 */
router.get('/streams/:id/claim-info', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const row = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    if (row.status !== 'ACTIVE') {
      return res.status(400).json({
        error: 'Stream is not active',
        message: `Stream status is ${row.status}. Only ACTIVE streams can be claimed.`,
      });
    }
    if (!row.contract_address || !row.constructor_params) {
      return res.status(400).json({
        error: 'Stream contract is not fully configured',
        message: 'This stream has no deployable on-chain contract state.',
      });
    }

    const contractService = new ContractService(resolveBchNetwork());
    const constructorParams = deserializeConstructorParams(row.constructor_params);
    const currentCommitment = await contractService.getNFTCommitment(row.contract_address);
    if (!currentCommitment) {
      return res.status(409).json({
        error: 'Stream state is still syncing',
        message: 'Unable to read live on-chain stream state right now. Retry shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'STREAM_STATE_UNAVAILABLE',
      });
    }

    if (row.stream_type === 'RECURRING') {
      const recurringClaimService = new PaymentClaimService(resolveBchNetwork());
      const recurringState = parseRecurringCommitment(currentCommitment);
      const claimTx = await recurringClaimService.buildClaimTransaction({
        paymentId: row.stream_id,
        contractAddress: row.contract_address,
        recipient: row.recipient,
        amountPerInterval: Number(toBigIntParam(constructorParams[3], 'amountPerInterval')),
        intervalSeconds: Number(toBigIntParam(constructorParams[4], 'intervalSeconds')),
        totalPaid: Number(recurringState.totalPaid),
        nextPaymentTime: recurringState.nextPaymentTime,
        currentTime: Math.floor(Date.now() / 1000),
        endTime: row.end_time || undefined,
        tokenType: row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' : 'BCH',
        tokenCategory: row.token_category || undefined,
        constructorParams,
        currentCommitment,
      });
      const claimableAmount = onChainAmountToDisplay(claimTx.claimableAmount, row.token_type, Number(row.token_decimals || 0));
      return res.json({
        success: true,
        claimInfo: {
          streamId: row.stream_id,
          contractAddress: row.contract_address,
          recipient: row.recipient,
          claimableAmount,
          totalReleased: onChainAmountToDisplay(Number(recurringState.totalPaid), row.token_type, Number(row.token_decimals || 0)),
          wcTransaction: serializeWcTransaction(claimTx.wcTransaction),
        },
      });
    }

    // Two-UTXO CashToken stream: compute claimable read-only from the state NFT.
    const ftInfoRow = parseFtVestingRow(row);
    if (ftInfoRow && ftInfoRow.stateCategory) {
      const state = parseVestingCommitmentState(currentCommitment);
      if (state) {
        const effTime = Math.floor(Date.now() / 1000) - 7200;
        const vested = FtVestingService.claimableVestedTotal(ftInfoRow.args, effTime, state.cursor);
        const claimableRaw = vested - BigInt(state.totalReleased);
        const claimableOnChain = claimableRaw > 0n ? claimableRaw : 0n;
        return res.json({
          success: true,
          claimInfo: {
            streamId: row.stream_id,
            contractAddress: row.contract_address,
            recipient: row.recipient,
            claimableAmount: onChainAmountToDisplay(Number(claimableOnChain), row.token_type, Number(row.token_decimals || 0)),
            totalReleased: onChainAmountToDisplay(state.totalReleased, row.token_type, Number(row.token_decimals || 0)),
            totalAmount: onChainAmountToDisplay(Number(ftInfoRow.args.totalAmount), row.token_type, Number(row.token_decimals || 0)),
            status: state.status,
          },
        });
      }
    }

    const claimService = new StreamClaimService(resolveBchNetwork());
    const vestingState = parseVestingCommitmentState(currentCommitment);
    if (!vestingState) {
      return res.status(409).json({
        error: 'Stream state is still syncing',
        message: 'Unable to decode live stream commitment right now. Retry shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'STREAM_STATE_UNAVAILABLE',
      });
    }
    if (vestingState.status !== 0) {
      return res.status(409).json({
        error: 'Stream is not claimable right now',
        message: `On-chain stream state is ${vestingState.status}. Refresh and retry after status sync.`,
        state: 'pending',
        retryable: true,
        errorCode: 'STREAM_STATUS_MISMATCH',
      });
    }
    const totalAmountOnChain = resolveOnChainStreamTotalAmount(row, constructorParams);
    const { startTime: onChainStartTime, endTime: onChainEndTime } = resolveOnChainStreamTimeBounds(
      row,
      constructorParams,
    );
    const scheduleDetails = getStreamScheduleDetails(row);

    // Build claim parameters
    const claimParams = {
      streamId: row.stream_id,
      contractAddress: row.contract_address,
      recipient: row.recipient,
      totalAmount: totalAmountOnChain,
      totalReleased: vestingState.totalReleased,
      startTime: onChainStartTime,
      endTime: onChainEndTime,
      currentTime: Math.floor(Date.now() / 1000),
      streamType: row.stream_type as 'LINEAR' | 'STEP' | 'TRANCHE' | 'HYBRID',
      stepInterval: scheduleDetails.intervalSeconds,
      stepAmount: scheduleDetails.stepAmountOnChain,
      hybridUnlockTime: scheduleDetails.hybridUnlockTime,
      hybridUpfrontAmount: scheduleDetails.hybridUpfrontAmountOnChain,
      trancheSchedule: scheduleDetails.trancheScheduleOnChain,
      tokenType: row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' as const : 'BCH' as const,
      tokenCategory: row.token_category,
      constructorParams,
      currentCommitment,
    };

    // Validate claim
    const validation = claimService.validateClaim(claimParams);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Claim validation failed',
        message: validation.error,
      });
    }

    // Build claim transaction parameters
    const claimTx = await claimService.buildClaimTransaction(claimParams);
    const claimableAmount = onChainAmountToDisplay(claimTx.claimableAmount, row.token_type, Number(row.token_decimals || 0));

    res.json({
      success: true,
      claimInfo: {
        streamId: row.stream_id,
        contractAddress: row.contract_address,
        recipient: row.recipient,
        claimableAmount,
        totalReleased: onChainAmountToDisplay(vestingState.totalReleased, row.token_type, Number(row.token_decimals || 0)),
        wcTransaction: serializeWcTransaction(claimTx.wcTransaction),
      },
    });
  } catch (error: any) {
    console.error(`GET /streams/${req.params.id}/claim-info error:`, error);
    res.status(500).json({ error: 'Failed to get claim info', message: error.message });
  }
});

/**
 * POST /api/streams/:id/pause
 * Pause an active stream (sender only)
 */
router.post('/streams/:id/pause', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const signerAddress = callerAddress(req);
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const row = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }
    if (String(row.sender).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the stream sender can pause this stream' });
    }
    if (String(row.status) !== 'ACTIVE') {
      return res.status(400).json({ error: 'Only ACTIVE streams can be paused' });
    }
    if (!row.cancelable) {
      return res.status(400).json({ error: 'This stream is not configured as pausable' });
    }
    if (!row.contract_address || !row.constructor_params) {
      return res.status(400).json({ error: 'Stream contract is not fully configured' });
    }

    const contractService = new ContractService(resolveBchNetwork());
    const currentCommitment = await contractService.getNFTCommitment(row.contract_address)
      || row.nft_commitment
      || '00'.repeat(40);

    const ftRow = parseFtVestingRow(row);
    if (ftRow && ftRow.stateCategory) {
      const ftService = new FtVestingService(resolveBchNetwork());
      const pause = await ftService.buildPauseWc({
        args: ftRow.args,
        stateCategory: ftRow.stateCategory,
        ftCategory: ftRow.ftCategory,
        currentCommitment: hexToBin(currentCommitment),
        nowSeconds: Math.floor(Date.now() / 1000),
      });
      return res.json({ success: true, message: 'Pause transaction ready', wcTransaction: serializeWcTransaction(pause.wcTransaction) });
    }

    const controlService = new StreamControlService(resolveBchNetwork());
    const pauseTx = await controlService.buildPauseTransaction({
      streamType: row.stream_type as 'LINEAR' | 'STEP' | 'RECURRING' | 'TRANCHE' | 'HYBRID',
      contractAddress: row.contract_address,
      constructorParams: deserializeConstructorParams(row.constructor_params),
      currentCommitment,
      currentTime: Math.floor(Date.now() / 1000),
      tokenType: row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' : 'BCH',
      tokenCategory: row.token_category || undefined,
    });

    return res.json({
      success: true,
      message: 'Pause transaction ready',
      wcTransaction: serializeWcTransaction(pauseTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/pause error:`, error);
    return res.status(500).json({ error: 'Failed to build pause transaction', message: error.message });
  }
});

/**
 * POST /api/streams/:id/confirm-pause
 * Confirm stream pause after on-chain tx broadcast
 */
router.post('/streams/:id/confirm-pause', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { txHash } = req.body;
    const signerAddress = callerAddress(req);
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }
    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash is required' });
    }
    if (!(await transactionExists(txHash, resolveBchNetwork()))) {
      return res.status(409).json({
        error: 'Transaction hash not found on chipnet',
        message: 'Transaction is not indexed yet. Retry confirmation shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'TX_NOT_FOUND',
      });
    }

    const row = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }
    if (String(row.sender).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the stream sender can confirm pause' });
    }
    if (String(row.status) !== 'ACTIVE') {
      return res.status(400).json({ error: `Cannot confirm pause for stream status ${row.status}` });
    }

    const hasStateOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: row.contract_address,
        minimumSatoshis: 546n,
        requireNft: true,
        requiredNftCapability: 'mutable',
        minimumNftCommitmentBytes: 32,
      },
      resolveBchNetwork(),
    );
    if (!hasStateOutput) {
      return res.status(400).json({
        error: 'Pause transaction does not include the expected stream state output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const contractService = new ContractService(resolveBchNetwork());
    const nextCommitment = await contractService.getNFTCommitment(row.contract_address)
      || row.nft_commitment
      || null;
    await db!.prepare(`
      UPDATE streams
      SET status = 'PAUSED', tx_hash = ?, nft_commitment = ?, updated_at = ?
      WHERE id = ?
    `).run(txHash, nextCommitment, now, id);
    await recordActivityEvent({
      entityType: 'stream',
      entityId: id,
      eventType: 'paused',
      actor: signerAddress,
      status: 'PAUSED',
      txHash,
      createdAt: now,
    });

    const updatedRow = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    const stream = streamService.enrichStream(rowToStream(updatedRow));

    return res.json({
      success: true,
      message: 'Stream pause confirmed',
      txHash,
      stream,
      state: 'confirmed',
      retryable: false,
      status: stream.status,
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/confirm-pause error:`, error);
    return res.status(500).json({
      error: 'Failed to confirm stream pause',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

/**
 * POST /api/streams/:id/resume
 * Resume a paused stream (sender only)
 */
router.post('/streams/:id/resume', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const signerAddress = callerAddress(req);
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const row = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }
    if (String(row.sender).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the stream sender can resume this stream' });
    }
    if (String(row.status) !== 'PAUSED') {
      return res.status(400).json({ error: 'Only PAUSED streams can be resumed' });
    }
    if (!row.contract_address || !row.constructor_params) {
      return res.status(400).json({ error: 'Stream contract is not fully configured' });
    }

    const contractService = new ContractService(resolveBchNetwork());
    const currentCommitment = await contractService.getNFTCommitment(row.contract_address)
      || row.nft_commitment
      || '00'.repeat(40);

    const ftRow = parseFtVestingRow(row);
    if (ftRow && ftRow.stateCategory) {
      const ftService = new FtVestingService(resolveBchNetwork());
      const resume = await ftService.buildResumeWc({
        args: ftRow.args,
        stateCategory: ftRow.stateCategory,
        ftCategory: ftRow.ftCategory,
        currentCommitment: hexToBin(currentCommitment),
        nowSeconds: Math.floor(Date.now() / 1000),
      });
      return res.json({ success: true, message: 'Resume transaction ready', wcTransaction: serializeWcTransaction(resume.wcTransaction) });
    }

    const controlService = new StreamControlService(resolveBchNetwork());
    const resumeTx = await controlService.buildResumeTransaction({
      streamType: row.stream_type as 'LINEAR' | 'STEP' | 'RECURRING' | 'TRANCHE' | 'HYBRID',
      contractAddress: row.contract_address,
      constructorParams: deserializeConstructorParams(row.constructor_params),
      currentCommitment,
      currentTime: Math.floor(Date.now() / 1000),
      tokenType: row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' : 'BCH',
      tokenCategory: row.token_category || undefined,
    });

    return res.json({
      success: true,
      message: 'Resume transaction ready',
      wcTransaction: serializeWcTransaction(resumeTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/resume error:`, error);
    return res.status(500).json({ error: 'Failed to build resume transaction', message: error.message });
  }
});

/**
 * POST /api/streams/:id/confirm-resume
 * Confirm stream resume after on-chain tx broadcast
 */
router.post('/streams/:id/confirm-resume', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { txHash } = req.body;
    const signerAddress = callerAddress(req);
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }
    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash is required' });
    }
    if (!(await transactionExists(txHash, resolveBchNetwork()))) {
      return res.status(409).json({
        error: 'Transaction hash not found on chipnet',
        message: 'Transaction is not indexed yet. Retry confirmation shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'TX_NOT_FOUND',
      });
    }

    const row = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }
    if (String(row.sender).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the stream sender can confirm resume' });
    }
    if (String(row.status) !== 'PAUSED') {
      return res.status(400).json({ error: `Cannot confirm resume for stream status ${row.status}` });
    }

    const hasStateOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: row.contract_address,
        minimumSatoshis: 546n,
        requireNft: true,
        requiredNftCapability: 'mutable',
        minimumNftCommitmentBytes: 32,
      },
      resolveBchNetwork(),
    );
    if (!hasStateOutput) {
      return res.status(400).json({
        error: 'Resume transaction does not include the expected stream state output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const contractService = new ContractService(resolveBchNetwork());
    const nextCommitment = await contractService.getNFTCommitment(row.contract_address)
      || row.nft_commitment
      || null;
    await db!.prepare(`
      UPDATE streams
      SET status = 'ACTIVE', tx_hash = ?, nft_commitment = ?, updated_at = ?
      WHERE id = ?
    `).run(txHash, nextCommitment, now, id);
    await recordActivityEvent({
      entityType: 'stream',
      entityId: id,
      eventType: 'resumed',
      actor: signerAddress,
      status: 'ACTIVE',
      txHash,
      createdAt: now,
    });

    const updatedRow = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    const stream = streamService.enrichStream(rowToStream(updatedRow));

    return res.json({
      success: true,
      message: 'Stream resume confirmed',
      txHash,
      stream,
      state: 'confirmed',
      retryable: false,
      status: stream.status,
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/confirm-resume error:`, error);
    return res.status(500).json({
      error: 'Failed to confirm stream resume',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

/**
 * POST /api/streams/:id/refill
 * Refill an open-ended recurring stream runway (sender only)
 */
router.post('/streams/:id/refill', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { refillAmount } = req.body;
    const signerAddress = callerAddress(req);
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const refillAmountDisplay = Number(refillAmount);
    if (!Number.isFinite(refillAmountDisplay) || refillAmountDisplay <= 0) {
      return res.status(400).json({ error: 'Refill amount must be greater than zero' });
    }

    const row = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }
    if (String(row.sender).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the stream sender can refill this stream' });
    }
    if (String(row.stream_type) !== 'RECURRING') {
      return res.status(400).json({ error: 'Only recurring streams support refill' });
    }
    if (!row.refillable) {
      return res.status(400).json({ error: 'This recurring stream is not configured as refillable' });
    }
    if (!isFungibleTokenType(row.token_type) && !ContractFactory.isV2(ContractFactory.typeForAddress(
      'RecurringPaymentCovenant',
      deserializeConstructorParams(row.constructor_params || '[]'),
      row.contract_address,
    ))) {
      return res.status(409).json({ error: REFILLABLE_UNAVAILABLE_ERROR, errorCode: 'REFILL_UNAVAILABLE' });
    }
    if (String(row.status) !== 'ACTIVE' && String(row.status) !== 'PAUSED') {
      return res.status(400).json({ error: 'Only ACTIVE or PAUSED recurring streams can be refilled' });
    }
    if (!row.contract_address || !row.constructor_params) {
      return res.status(400).json({ error: 'Stream contract is not fully configured' });
    }

    const refillAmountOnChain = displayAmountToOnChain(
      refillAmountDisplay,
      row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' : 'BCH',
      Number(row.token_decimals || 0),
    );
    if (refillAmountOnChain <= 0) {
      return res.status(400).json({ error: 'Refill amount is too small for this asset type' });
    }

    const contractService = new ContractService(resolveBchNetwork());
    const currentCommitment = await contractService.getNFTCommitment(row.contract_address)
      || row.nft_commitment
      || '00'.repeat(40);

    const controlService = new StreamControlService(resolveBchNetwork());
    const refillTx = await controlService.buildRefillTransaction({
      streamType: 'RECURRING',
      contractAddress: row.contract_address,
      constructorParams: deserializeConstructorParams(row.constructor_params),
      currentCommitment,
      currentTime: Math.floor(Date.now() / 1000),
      tokenType: row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' : 'BCH',
      tokenCategory: row.token_category || undefined,
      senderAddress: signerAddress,
      refillAmount: BigInt(refillAmountOnChain),
    });

    return res.json({
      success: true,
      message: 'Refill transaction ready',
      refillAmount: refillAmountDisplay,
      wcTransaction: serializeWcTransaction(refillTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/refill error:`, error);
    return res.status(500).json({ error: 'Failed to build refill transaction', message: error.message });
  }
});

/**
 * POST /api/streams/:id/confirm-refill
 * Confirm recurring stream refill after on-chain tx broadcast
 */
router.post('/streams/:id/confirm-refill', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { txHash, refillAmount } = req.body;
    const signerAddress = callerAddress(req);
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }
    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash is required' });
    }
    const refillAmountDisplay = Number(refillAmount);
    if (!Number.isFinite(refillAmountDisplay) || refillAmountDisplay <= 0) {
      return res.status(400).json({ error: 'Refill amount must be greater than zero' });
    }
    if (!(await transactionExists(txHash, resolveBchNetwork()))) {
      return res.status(409).json({
        error: 'Transaction hash not found on chipnet',
        message: 'Transaction is not indexed yet. Retry confirmation shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'TX_NOT_FOUND',
      });
    }

    const row = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }
    if (String(row.sender).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the stream sender can confirm refill' });
    }
    if (String(row.stream_type) !== 'RECURRING' || !row.refillable) {
      return res.status(400).json({ error: 'This stream does not support refill confirmation' });
    }

    const hasStateOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: row.contract_address,
        minimumSatoshis: 546n,
        ...(row.token_type === 'CASHTOKENS' && row.token_category
          ? {
              tokenCategory: row.token_category,
              minimumTokenAmount: 1n,
            }
          : {}),
        requireNft: true,
        requiredNftCapability: 'mutable',
        minimumNftCommitmentBytes: 32,
      },
      resolveBchNetwork(),
    );
    if (!hasStateOutput) {
      return res.status(400).json({
        error: 'Refill transaction does not include the expected recurring stream state output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const contractService = new ContractService(resolveBchNetwork());
    const nextCommitment = await contractService.getNFTCommitment(row.contract_address)
      || row.nft_commitment
      || null;
    const newTotalAmount = Number(row.total_amount || 0) + refillAmountDisplay;

    await db!.prepare(`
      UPDATE streams
      SET total_amount = ?, tx_hash = ?, nft_commitment = ?, updated_at = ?
      WHERE id = ?
    `).run(newTotalAmount, txHash, nextCommitment, now, id);
    await recordActivityEvent({
      entityType: 'stream',
      entityId: id,
      eventType: 'refilled',
      actor: signerAddress,
      amount: refillAmountDisplay,
      status: String(row.status || 'ACTIVE'),
      txHash,
      details: {
        totalAmountAfterRefill: newTotalAmount,
      },
      createdAt: now,
    });

    const updatedRow = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    const stream = streamService.enrichStream(rowToStream(updatedRow));

    return res.json({
      success: true,
      message: 'Recurring stream refill confirmed',
      txHash,
      stream,
      state: 'confirmed',
      retryable: false,
      status: stream.status,
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/confirm-refill error:`, error);
    return res.status(500).json({
      error: 'Failed to confirm refill',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

/**
 * POST /api/streams/:id/transfer
 * Transfer a transferable vesting stream to a new recipient
 */
router.post('/streams/:id/transfer', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newRecipientAddress } = req.body;
    const signerAddress = callerAddress(req);
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }
    if (!newRecipientAddress) {
      return res.status(400).json({ error: 'New recipient address is required' });
    }
    if (!isP2pkhAddress(newRecipientAddress)) {
      return res.status(400).json({ error: 'New recipient must be a P2PKH cash address' });
    }

    const row = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }
    if (String(row.stream_type) === 'RECURRING') {
      return res.status(400).json({
        error: 'Recurring streams currently do not support recipient transfer',
      });
    }
    if (!row.transferable) {
      return res.status(400).json({ error: 'This stream is not transferable' });
    }
    if (String(row.status) !== 'ACTIVE') {
      return res.status(400).json({ error: 'Only ACTIVE streams can transfer recipients' });
    }
    if (String(row.recipient).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the current recipient can transfer this stream' });
    }
    if (String(row.recipient).toLowerCase() === String(newRecipientAddress).toLowerCase()) {
      return res.status(400).json({ error: 'New recipient must differ from current recipient' });
    }
    if (!row.contract_address || !row.constructor_params) {
      return res.status(400).json({ error: 'Stream contract is not fully configured' });
    }

    const contractService = new ContractService(resolveBchNetwork());
    const currentCommitment = await contractService.getNFTCommitment(row.contract_address)
      || row.nft_commitment
      || '00'.repeat(40);

    const ftTransferRow = parseFtVestingRow(row);
    if (ftTransferRow && ftTransferRow.stateCategory) {
      const ftService = new FtVestingService(resolveBchNetwork());
      const transfer = await ftService.buildTransferWc({
        args: ftTransferRow.args,
        stateCategory: ftTransferRow.stateCategory,
        ftCategory: ftTransferRow.ftCategory,
        currentCommitment: hexToBin(currentCommitment),
        newRecipientAddress,
      });
      return res.json({ success: true, message: 'Transfer transaction ready', wcTransaction: serializeWcTransaction(transfer.wcTransaction) });
    }

    const controlService = new StreamControlService(resolveBchNetwork());
    const transferTx = await controlService.buildTransferTransaction({
      streamType: row.stream_type as 'LINEAR' | 'STEP' | 'TRANCHE' | 'HYBRID',
      contractAddress: row.contract_address,
      constructorParams: deserializeConstructorParams(row.constructor_params),
      currentCommitment,
      currentTime: Math.floor(Date.now() / 1000),
      currentRecipient: signerAddress,
      newRecipient: newRecipientAddress,
      tokenType: row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' : 'BCH',
      tokenCategory: row.token_category || undefined,
    });

    return res.json({
      success: true,
      message: 'Transfer transaction ready',
      nextRecipient: transferTx.nextRecipient,
      wcTransaction: serializeWcTransaction(transferTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/transfer error:`, error);
    return res.status(500).json({ error: 'Failed to build transfer transaction', message: error.message });
  }
});

/**
 * POST /api/streams/:id/confirm-transfer
 * Confirm vesting stream transfer after on-chain tx broadcast
 */
router.post('/streams/:id/confirm-transfer', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { txHash, newRecipientAddress } = req.body;
    const signerAddress = callerAddress(req);
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }
    if (!txHash || !newRecipientAddress) {
      return res.status(400).json({ error: 'Transaction hash and new recipient address are required' });
    }
    if (!(await transactionExists(txHash, resolveBchNetwork()))) {
      return res.status(409).json({
        error: 'Transaction hash not found on chipnet',
        message: 'Transaction is not indexed yet. Retry confirmation shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'TX_NOT_FOUND',
      });
    }

    const row = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }
    if (!row.transferable) {
      return res.status(400).json({ error: 'This stream is not transferable' });
    }
    if (String(row.stream_type) === 'RECURRING') {
      return res.status(400).json({ error: 'Recurring streams do not support recipient transfer' });
    }
    if (String(row.status) !== 'ACTIVE') {
      return res.status(400).json({ error: `Cannot confirm transfer for stream status ${row.status}` });
    }
    if (String(row.recipient).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the current recipient can confirm this transfer' });
    }

    const hasStateOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: row.contract_address,
        minimumSatoshis: 546n,
        requireNft: true,
        requiredNftCapability: 'mutable',
        minimumNftCommitmentBytes: 32,
      },
      resolveBchNetwork(),
    );
    if (!hasStateOutput) {
      return res.status(400).json({
        error: 'Transfer transaction does not include the expected stream state output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const contractService = new ContractService(resolveBchNetwork());
    const nextCommitment = await contractService.getNFTCommitment(row.contract_address)
      || row.nft_commitment
      || null;
    await db!.prepare(`
      UPDATE streams
      SET recipient = ?, tx_hash = ?, nft_commitment = ?, updated_at = ?
      WHERE id = ?
    `).run(newRecipientAddress, txHash, nextCommitment, now, id);
    await recordActivityEvent({
      entityType: 'stream',
      entityId: id,
      eventType: 'transferred',
      actor: signerAddress,
      status: String(row.status || 'ACTIVE'),
      txHash,
      details: {
        previousRecipient: row.recipient,
        newRecipient: newRecipientAddress,
      },
      createdAt: now,
    });

    const updatedRow = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    const stream = streamService.enrichStream(rowToStream(updatedRow));

    return res.json({
      success: true,
      message: 'Stream transfer confirmed',
      txHash,
      stream,
      state: 'confirmed',
      retryable: false,
      status: stream.status,
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/confirm-transfer error:`, error);
    return res.status(500).json({
      error: 'Failed to confirm stream transfer',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

/**
 * POST /api/streams/:id/cancel
 * Cancel a stream (sender only)
 */
router.post('/streams/:id/cancel', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const signerAddress = req.verifiedUser!.address;
    const allowUnsafeRecovery = req.body?.allowUnsafeRecovery === true;

    const row = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    const stream = rowToStream(row);

    if (!streamService.canCancel(stream, signerAddress)) {
      return res.status(403).json({
        error: 'Cannot cancel stream',
        reason: !stream.cancelable
          ? 'Stream is not cancelable'
          : stream.sender.toLowerCase() !== signerAddress.toLowerCase()
          ? 'Only sender can cancel'
          : 'Stream is not active',
      });
    }

    const constructorParams = deserializeConstructorParams(row.constructor_params || '[]');
    const contractService = new ContractService(resolveBchNetwork());
    const currentCommitment = await contractService.getNFTCommitment(row.contract_address)
      || row.nft_commitment
      || '00'.repeat(40);

    const ftCancelRow = parseFtVestingRow(row);
    if (ftCancelRow && ftCancelRow.stateCategory) {
      const ftService = new FtVestingService(resolveBchNetwork());
      const cancel = await ftService.buildCancelWc({
        args: ftCancelRow.args,
        stateCategory: ftCancelRow.stateCategory,
        ftCategory: ftCancelRow.ftCategory,
        currentCommitment: hexToBin(currentCommitment),
        recipientAddress: row.recipient,
        senderAddress: signerAddress, // unvested returns here, so it's safe by construction
        nowSeconds: Math.floor(Date.now() / 1000),
      });
      return res.json({
        success: true,
        message: 'Cancel transaction ready',
        vestedAmount: onChainAmountToDisplay(Number(cancel.claimableNow), row.token_type, Number(row.token_decimals || 0)),
        unvestedAmount: onChainAmountToDisplay(Number(cancel.unvested), row.token_type, Number(row.token_decimals || 0)),
        cancelReturnAddress: signerAddress,
        senderAddress: signerAddress,
        wcTransaction: serializeWcTransaction(cancel.wcTransaction),
      });
    }

    const cancelService = new StreamCancelService(resolveBchNetwork());
    const cancelTx = await cancelService.buildCancelTransaction({
      streamType: row.stream_type as 'LINEAR' | 'STEP' | 'RECURRING' | 'TRANCHE' | 'HYBRID',
      contractAddress: row.contract_address,
      sender: signerAddress,
      recipient: row.recipient,
      currentTime: Math.floor(Date.now() / 1000),
      tokenType: row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' : 'BCH',
      tokenCategory: row.token_category || undefined,
      feePayerAddress: signerAddress,
      constructorParams,
      currentCommitment,
    });

    // Safety guard: cancel return must resolve back to the sender wallet address.
    if (!allowUnsafeRecovery && cancelTx.cancelReturnAddress.toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(409).json({
        error: 'Unsafe cancel destination',
        message:
          'The stream sender hash resolves to a different return address than the signing wallet. ' +
          'Cancel is blocked to avoid stranded funds.',
        senderAddress: signerAddress,
        cancelReturnAddress: cancelTx.cancelReturnAddress,
      });
    }

    res.json({
      success: true,
      message: 'Cancel transaction ready',
      vestedAmount: cancelTx.vestedAmount,
      unvestedAmount: cancelTx.unvestedAmount,
      cancelReturnAddress: cancelTx.cancelReturnAddress,
      senderAddress: signerAddress,
      wcTransaction: serializeWcTransaction(cancelTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/cancel error:`, error);
    const message = typeof error?.message === 'string' ? error.message : 'Unknown cancel builder error';

    if (message.includes('No UTXOs found for stream contract')) {
      return res.status(409).json({
        error: 'Stream state is pending confirmation',
        message:
          'The stream contract UTXO is currently unavailable (often due to an unconfirmed claim/pause/resume/fund tx). ' +
          'Wait for confirmation, refresh, and retry cancel.',
        state: 'pending',
        retryable: true,
        errorCode: 'STREAM_UTXO_UNAVAILABLE',
      });
    }

    if (
      message.includes('Insufficient BCH in contract to satisfy cancellation outputs and network fee')
      || message.includes('Insufficient sponsor balance for cancel transaction')
    ) {
      return res.status(409).json({
        error: 'Insufficient fee reserve for stream cancel',
        message:
          'This cancel action requires additional BCH fee reserve. Top up the signer wallet or stream reserve and retry.',
        state: 'failed',
        retryable: false,
        errorCode: 'CANCEL_FEE_RESERVE_REQUIRED',
      });
    }

    if (message === TOKEN_CANCEL_TOO_EARLY) {
      return res.status(409).json({
        error: 'Too early to cancel',
        message,
        retryable: true,
        errorCode: 'CANCEL_BEFORE_START',
      });
    }

    if (message.includes('Claimable vested BCH is below dust')) {
      return res.status(409).json({
        error: 'Too early to cancel',
        message: 'The recipient has earned less than 0.00000546 BCH so far, which is too small to send. Wait a little and try again.',
        retryable: true,
        errorCode: 'CANCEL_VESTED_BELOW_DUST',
      });
    }

    if (message.includes('Unvested BCH is below dust')) {
      return res.status(409).json({
        error: 'Nearly all of this stream is released',
        message: "What's left to return is too small to send. Let the stream finish instead.",
        retryable: false,
        errorCode: 'CANCEL_REMAINDER_BELOW_DUST',
      });
    }

    res.status(500).json({ error: 'Failed to cancel stream', message });
  }
});

/**
 * POST /api/streams/:id/confirm-cancel
 * Confirm stream cancellation after on-chain tx broadcast
 */
router.post('/streams/:id/confirm-cancel', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { txHash } = req.body;
    const vestedAmount = parseOptionalDisplayAmount(req.body?.vestedAmount);
    const unvestedAmount = parseOptionalDisplayAmount(req.body?.unvestedAmount);
    const cancelReturnAddress = parseOptionalAddress(req.body?.cancelReturnAddress);
    const signerAddress = req.verifiedUser!.address;
    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash is required' });
    }
    if (!(await transactionExists(txHash, resolveBchNetwork()))) {
      return res.status(409).json({
        error: 'Transaction hash not found on chipnet',
        message: 'Transaction is not indexed yet. Retry confirmation shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'TX_NOT_FOUND',
      });
    }

    const row = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }
    if (!['ACTIVE', 'PAUSED'].includes(String(row.status))) {
      return res.status(400).json({ error: `Cannot confirm cancel for stream status ${row.status}` });
    }
    if (String(row.sender).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the stream sender can confirm cancellation' });
    }

    // A valid cancel spend must consume the covenant state UTXO without recreating it.
    const hasStateOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: row.contract_address,
        minimumSatoshis: 546n,
        requireNft: true,
      },
      resolveBchNetwork(),
    );
    if (hasStateOutput) {
      return res.status(400).json({
        error: 'Cancel transaction still includes a stream covenant state output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    await db!.prepare(`
      UPDATE streams
      SET status = 'CANCELLED', tx_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(txHash, now, id);
    await recordActivityEvent({
      entityType: 'stream',
      entityId: id,
      eventType: 'cancelled',
      actor: signerAddress,
      amount: unvestedAmount ?? undefined,
      status: 'CANCELLED',
      txHash,
      details: {
        vestedAmount,
        unvestedAmount,
        cancelReturnAddress,
        recipientAddress: row.recipient || null,
        senderAddress: row.sender || null,
      },
      createdAt: now,
    });

    const updatedRow = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    const stream = streamService.enrichStream(rowToStream(updatedRow));

    return res.json({
      success: true,
      message: 'Stream cancellation confirmed',
      txHash,
      stream,
      state: 'confirmed',
      retryable: false,
      status: stream.status,
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/confirm-cancel error:`, error);
    return res.status(500).json({
      error: 'Failed to confirm stream cancel',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

/**
 * POST /api/treasuries/:vaultId/batch-create
 * Batch create multiple streams from a treasury and return one funding tx.
 */
router.post('/treasuries/:vaultId/batch-create', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { vaultId } = req.params;
    // Sender is the verified wallet, as on single create; a body senderAddress is ignored.
    const senderAddress = req.verifiedUser!.address;
    const {
      tokenType = 'BCH',
      tokenCategory,
      tokenDecimals: tokenDecimalsHint,
      entries,
      launchContext,
    } = req.body;

    if (!isP2pkhAddress(senderAddress)) {
      return res.status(400).json({
        error: 'A valid senderAddress is required for batch stream creation',
      });
    }

    const vault = await VaultService.getVaultByVaultId(vaultId);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }
    if (!VaultService.isCreator(vault, senderAddress) && !VaultService.isSigner(vault, senderAddress)) {
      return res.status(403).json({ error: 'Only this treasury\'s creator or signers can create its streams' });
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries array is required' });
    }

    if (entries.length > 100) {
      return res.status(400).json({
        error: 'Batch stream creation is limited to 100 rows per transaction',
      });
    }

    const normalizedBatchTokenType: 'BCH' | 'FUNGIBLE_TOKEN' =
      tokenType === 'FUNGIBLE_TOKEN' || tokenType === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' : 'BCH';
    const normalizedLaunchContext = normalizeLaunchContext(launchContext);

    if (normalizedBatchTokenType === 'FUNGIBLE_TOKEN' && !tokenCategory) {
      return res.status(400).json({
        error: 'tokenCategory is required for CashToken batch stream lanes',
      });
    }

    const batchId = randomUUID();
    // MAX(sequence)+1, not COUNT(*)+1 — deletions leave gaps that would collide.
    const maxRow = await db!.prepare(
      "SELECT COALESCE(MAX(CAST(substring(stream_id from '[0-9]+$') AS INTEGER)), 0) as maxseq FROM streams WHERE stream_id ~ '#FG-(TOK|BCH)-[0-9]+$'",
    ).get() as any;
    const sequenceBase = Number(maxRow?.maxseq || 0) + 1;
    const now = Math.floor(Date.now() / 1000);

    const preparedStreams: Array<Awaited<ReturnType<typeof preparePendingStreamRecord>>> = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];

      if (!entry?.recipient || !isP2pkhAddress(entry.recipient)) {
        return res.status(400).json({
          error: `Entry ${index + 1} must include a valid P2PKH recipient address`,
        });
      }

      if (!entry.totalAmount || Number(entry.totalAmount) <= 0) {
        return res.status(400).json({
          error: `Entry ${index + 1} must include a positive totalAmount`,
        });
      }

      if (!entry.streamType || !['LINEAR', 'RECURRING', 'STEP', 'TRANCHE', 'HYBRID'].includes(entry.streamType)) {
        return res.status(400).json({
          error: `Entry ${index + 1} must include a valid streamType`,
        });
      }

      if (entry.scheduleTemplate && !isValidStreamScheduleTemplate(entry.scheduleTemplate)) {
        return res.status(400).json({
          error: `Entry ${index + 1} includes an invalid schedule template`,
        });
      }

      const prepared = await preparePendingStreamRecord({
        vaultId,
        sender: senderAddress,
        recipient: entry.recipient,
        tokenType: normalizedBatchTokenType,
        tokenCategory,
        tokenDecimalsHint,
        totalAmount: Number(entry.totalAmount),
        streamType: entry.streamType,
        startTime: Number(entry.startTime),
        endTime: Number(entry.endTime),
        cliffTimestamp: entry.cliffTimestamp ? Number(entry.cliffTimestamp) : undefined,
        cancelable: entry.cancelable !== false,
        transferable: entry.transferable !== false,
        description: entry.description || null,
        intervalSeconds: entry.intervalSeconds ? Number(entry.intervalSeconds) : undefined,
        scheduleTemplate: entry.scheduleTemplate || null,
        refillable: Boolean(entry.refillable),
        hybridUnlockTimestamp: entry.hybridUnlockTimestamp ? Number(entry.hybridUnlockTimestamp) : undefined,
        hybridUpfrontPercentage: entry.hybridUpfrontPercentage !== undefined
          ? Number(entry.hybridUpfrontPercentage)
          : undefined,
        trancheSchedule: entry.trancheSchedule,
        launchContext: normalizedLaunchContext,
        sequenceNumber: sequenceBase + index,
        createdAt: now,
      });
      preparedStreams.push(prepared);
    }

    const insertBatchStmt = db!.prepare(`
      INSERT INTO stream_batches (
        id, vault_id, sender, token_type, token_category, stream_count, total_amount, status,
        launch_source, launch_title, launch_description, preferred_lane, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)
    `);
    const insertStmt = db!.prepare(`
      INSERT INTO streams (id, stream_id, vault_id, batch_id, sender, recipient, token_type, token_category,
        token_decimals, total_amount, withdrawn_amount, stream_type, start_time, end_time, interval_seconds, cliff_timestamp,
        cancelable, transferable, refillable, status, schedule_template, launch_source, launch_title,
        launch_description, preferred_lane, description, created_at, updated_at, contract_address,
        constructor_params, nft_commitment, nft_capability)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await insertBatchStmt.run(
      batchId,
      vaultId,
      senderAddress,
      normalizedBatchTokenType === 'BCH' ? 'BCH' : 'CASHTOKENS',
      tokenCategory || null,
      preparedStreams.length,
      preparedStreams.reduce((sum, prepared) => sum + Number(prepared.totalAmount || 0), 0),
      normalizedLaunchContext?.source || null,
      normalizedLaunchContext?.title || null,
      normalizedLaunchContext?.description || null,
      normalizedLaunchContext?.preferredLane || null,
      now,
      now,
    );

    for (const prepared of preparedStreams) {
      await insertStmt.run(
        prepared.id,
        prepared.streamId,
        prepared.vaultId,
        batchId,
        prepared.sender,
        prepared.recipient,
        prepared.tokenType,
        prepared.tokenCategory,
        prepared.tokenDecimals,
        prepared.totalAmount,
        prepared.streamType,
        prepared.startTime,
        prepared.endTime,
        prepared.intervalSeconds,
        prepared.cliffTimestamp,
        prepared.cancelable ? 1 : 0,
        prepared.transferable ? 1 : 0,
        prepared.refillable ? 1 : 0,
        prepared.scheduleTemplate,
        prepared.launchSource,
        prepared.launchTitle,
        prepared.launchDescription,
        prepared.preferredLane,
        prepared.description,
        prepared.createdAt,
        prepared.createdAt,
        prepared.contractAddress,
        JSON.stringify(prepared.constructorParams),
        prepared.nftCommitment,
        'mutable',
      );

      await recordActivityEvent({
        entityType: 'stream',
        entityId: prepared.id,
        eventType: 'created',
        actor: prepared.sender,
        amount: prepared.totalAmount,
        status: 'PENDING',
        details: prepared.activityDetails,
        createdAt: prepared.createdAt,
      });
    }

    const fundingService = new StreamFundingService(resolveBchNetwork());
    const fundingTx = await fundingService.buildBatchFundingTransaction({
      senderAddress,
      items: preparedStreams.map((prepared) => {
        const amountOnChain = displayAmountToOnChain(prepared.totalAmount, prepared.tokenType as 'BCH' | 'CASHTOKENS', prepared.tokenDecimals);
        const itemTokenType = prepared.tokenType === 'BCH' ? 'BCH' as const : 'FUNGIBLE_TOKEN' as const;
        return {
          contractAddress: prepared.contractAddress,
          amount: amountOnChain,
          tokenType: itemTokenType,
          tokenCategory: prepared.tokenCategory || undefined,
          nftCommitment: prepared.nftCommitment,
          nftCapability: 'mutable' as const,
          contractSatoshis: getStreamContractFundingSatoshis(
            itemTokenType,
            BigInt(amountOnChain),
            getStreamMaxClaims({
              id: prepared.id,
              stream_type: prepared.streamType,
              token_type: prepared.tokenType,
              token_decimals: prepared.tokenDecimals,
              total_amount: prepared.totalAmount,
              start_time: prepared.startTime,
              end_time: prepared.endTime,
              interval_seconds: prepared.intervalSeconds,
              constructor_params: JSON.stringify(prepared.constructorParams),
            }),
          ),
        };
      }),
    });

    const createdRows = await Promise.all(preparedStreams.map(async (prepared) => {
      const row = await db!.prepare('SELECT * FROM streams WHERE id = ?').get(prepared.id) as any;
      return streamService.enrichStream(rowToStream(row));
    }));

    res.json({
      success: true,
      message: `Created ${createdRows.length} pending streams. Sign once to fund the full payroll run.`,
      streams: createdRows,
      batch: {
        id: batchId,
        streamCount: createdRows.length,
        totalAmount: createdRows.reduce((sum, stream) => sum + Number(stream.total_amount || 0), 0),
        sender: senderAddress,
        tokenType: normalizedBatchTokenType === 'BCH' ? 'BCH' : 'CASHTOKENS',
        tokenCategory: tokenCategory || null,
      },
      fundingInfo: {
        inputs: fundingTx.inputs,
        outputs: fundingTx.outputs,
        fee: fundingTx.fee,
      },
      wcTransaction: serializeWcTransaction(fundingTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /treasuries/${req.params.vaultId}/batch-create error:`, error);
    res.status(500).json({ error: 'Failed to create streams', message: error.message });
  }
});

router.post('/treasuries/:vaultId/batch-create/confirm', requireWalletAuth, async (req: Request, res: Response) => {
  try {
    const { vaultId } = req.params;
    const { txHash, streamIds, batchId } = req.body;

    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash required' });
    }

    if (!Array.isArray(streamIds) || streamIds.length === 0) {
      return res.status(400).json({ error: 'streamIds array is required' });
    }

    if (!(await transactionExists(txHash, resolveBchNetwork()))) {
      return res.status(409).json({
        error: 'Transaction hash not found on chipnet',
        message: 'Transaction is not indexed yet. Retry confirmation shortly.',
        state: 'pending',
        retryable: true,
        errorCode: 'TX_NOT_FOUND',
      });
    }

    const placeholders = streamIds.map(() => '?').join(', ');
    const rows = await db!
      .prepare(`SELECT * FROM streams WHERE id IN (${placeholders}) AND vault_id = ?`)
      .all(...streamIds, vaultId) as any[];

    if (rows.length !== streamIds.length) {
      return res.status(404).json({
        error: 'One or more streams were not found for this treasury batch',
      });
    }

    const uniqueBatchIds = Array.from(new Set(rows.map((row) => row.batch_id).filter(Boolean)));
    if (batchId && uniqueBatchIds.length > 0 && !uniqueBatchIds.includes(batchId)) {
      return res.status(400).json({
        error: 'Provided batchId does not match the selected streams',
      });
    }

    const missingOutputs: string[] = [];
    for (const row of rows) {
      if (row.status !== 'PENDING') {
        return res.status(400).json({
          error: `Stream ${row.stream_id} is not pending and cannot be batch-confirmed`,
        });
      }

      const isTokenStream = row.token_type === 'CASHTOKENS';
      const fundingAmountOnChain = displayAmountToOnChain(Number(row.total_amount), row.token_type, Number(row.token_decimals || 0));
      const minimumContractSatoshis = getStreamContractFundingSatoshis(
        isTokenStream ? 'FUNGIBLE_TOKEN' : 'BCH',
        BigInt(fundingAmountOnChain),
        getStreamMaxClaims(row),
      );

      const expectedContractOutput = await transactionHasExpectedOutput(
        txHash,
        {
          address: row.contract_address,
          minimumSatoshis: minimumContractSatoshis,
          ...(isTokenStream && row.token_category
            ? {
                tokenCategory: row.token_category,
                minimumTokenAmount: BigInt(Math.max(0, Math.trunc(fundingAmountOnChain))),
              }
            : {}),
          requireNft: true,
          requiredNftCapability: 'mutable',
          minimumNftCommitmentBytes: 32,
        },
        resolveBchNetwork(),
      );

      if (!expectedContractOutput) {
        missingOutputs.push(row.stream_id);
      }
    }

    if (missingOutputs.length > 0) {
      return res.status(400).json({
        error: 'Funding transaction does not include all expected stream outputs',
        streamIds: missingOutputs,
      });
    }

    const updatedAt = Math.floor(Date.now() / 1000);
    const contractService = new ContractService(resolveBchNetwork());
    const confirmedCommitments = new Map<string, string | null>();
    for (const row of rows) {
      const commitment = await contractService.getNFTCommitment(row.contract_address);
      const predictedCommitment = getPendingFundingCommitment(row, updatedAt);
      confirmedCommitments.set(row.id, commitment || predictedCommitment || row.nft_commitment || null);
    }

    const updateStmt = db!.prepare(`
      UPDATE streams
      SET status = 'ACTIVE', tx_hash = ?, nft_commitment = ?, activated_at = ?, updated_at = ?
      WHERE id = ?
    `);

    for (const row of rows) {
      await updateStmt.run(txHash, confirmedCommitments.get(row.id) ?? null, updatedAt, updatedAt, row.id);
      await recordActivityEvent({
        entityType: 'stream',
        entityId: row.id,
        eventType: 'funded',
        actor: row.sender,
        amount: Number(row.total_amount),
        status: 'ACTIVE',
        txHash,
        details: {
          contractAddress: row.contract_address,
          tokenType: row.token_type,
          tokenCategory: row.token_category || null,
          batchFunding: true,
        },
        createdAt: updatedAt,
      });
    }

    const resolvedBatchId = (batchId as string | undefined) || uniqueBatchIds[0];
    if (resolvedBatchId) {
      await db!.prepare(`
        UPDATE stream_batches
        SET status = 'ACTIVE', tx_hash = ?, updated_at = ?
        WHERE id = ?
      `).run(txHash, updatedAt, resolvedBatchId);
    }

    const updatedRows = await db!
      .prepare(`SELECT * FROM streams WHERE id IN (${placeholders})`)
      .all(...streamIds) as any[];

    res.json({
      success: true,
      message: `Funded ${updatedRows.length} streams successfully`,
      txHash,
      batchId: (batchId as string | undefined) || uniqueBatchIds[0] || null,
      streams: updatedRows.map((row) => streamService.enrichStream(rowToStream(row))),
      state: 'confirmed',
      retryable: false,
      status: 'ACTIVE',
    });
  } catch (error: any) {
    console.error(`POST /treasuries/${req.params.vaultId}/batch-create/confirm error:`, error);
    res.status(500).json({
      error: 'Failed to confirm batch funding',
      message: error.message,
      state: 'failed',
      retryable: false,
      errorCode: 'CONFIRM_FAILED',
    });
  }
});

/**
 * GET /api/explorer/streams
 * Public stream explorer
 */
router.get('/explorer/streams', async (req: Request, res: Response) => {
  try {
    const { token, status } = req.query;

    let query = 'SELECT * FROM streams WHERE 1=1';
    const params: any[] = [];

    if (token) {
      query += ' AND token_type = ?';
      params.push(token);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';
    const rows = await db!.prepare(query).all(...params) as any[];
    const streams = streamService.enrichStreams(rows.map(rowToStream));

    res.json({
      success: true,
      streams,
      total: streams.length,
    });
  } catch (error: any) {
    console.error('GET /explorer/streams error:', error);
    res.status(500).json({ error: 'Failed to fetch explorer streams', message: error.message });
  }
});

function rowToStream(row: any): Stream {
  const scheduleDetails = getStreamScheduleDetails(row);
  const vestingState = row.stream_type === 'RECURRING'
    ? null
    : parseVestingCommitmentState(row.nft_commitment);
  let recurringState: { totalPaid: bigint; nextPaymentTime: number; pauseStart: number } | null = null;
  if (row.stream_type === 'RECURRING' && row.nft_commitment) {
    try {
      recurringState = parseRecurringCommitment(row.nft_commitment);
    } catch {
      recurringState = null;
    }
  }
  return {
    id: row.id,
    stream_id: row.stream_id,
    vault_id: row.vault_id,
    batch_id: row.batch_id || undefined,
    sender: row.sender,
    recipient: row.recipient,
    token_type: row.token_type,
    token_category: row.token_category || undefined,
    token_decimals: Number(row.token_decimals || 0),
    total_amount: row.total_amount,
    withdrawn_amount: row.withdrawn_amount,
    stream_type: row.stream_type,
    start_time: row.start_time,
    end_time: row.end_time || undefined,
    interval_seconds: scheduleDetails.intervalSeconds,
    amount_per_interval: scheduleDetails.amountPerIntervalDisplay,
    step_amount: scheduleDetails.stepAmountDisplay,
    hybrid_unlock_time: scheduleDetails.hybridUnlockTime,
    hybrid_upfront_amount: scheduleDetails.hybridUpfrontAmountDisplay,
    schedule_count: scheduleDetails.scheduleCount,
    tranche_schedule: scheduleDetails.trancheScheduleDisplay,
    cliff_timestamp: row.cliff_timestamp || undefined,
    effective_start_time: vestingState?.cursor,
    pause_started_at: vestingState?.pauseStart || recurringState?.pauseStart,
    next_payment_time: recurringState?.nextPaymentTime,
    schedule_template: row.schedule_template || undefined,
    launch_source: row.launch_source || undefined,
    launch_title: row.launch_title || undefined,
    launch_description: row.launch_description || undefined,
    preferred_lane: row.preferred_lane || undefined,
    launch_context: row.launch_source
      ? {
          source: row.launch_source,
          title: row.launch_title || undefined,
          description: row.launch_description || undefined,
          preferredLane: row.preferred_lane || undefined,
        }
      : undefined,
    cancelable: Boolean(row.cancelable),
    transferable: Boolean(row.transferable),
    refillable: Boolean(row.refillable),
    status: row.status,
    activated_at: row.activated_at || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Vault ids (both the DB uuid and the logical vault_id, since rows store either)
 * of every vault the viewer created or signs for. Treasury-scoped lists are limited
 * to these so one user's vault streams never show up for another.
 */
async function getViewerVaultIds(viewer: unknown): Promise<string[]> {
  const viewerAddress = typeof viewer === 'string' ? viewer.trim() : '';
  if (!viewerAddress) return [];
  const vaults = await VaultService.getUserVaults(viewerAddress);
  const ids = new Set<string>();
  for (const vault of vaults) {
    if (vault.id) ids.add(vault.id);
    if (vault.vaultId) ids.add(vault.vaultId);
  }
  return Array.from(ids);
}

/**
 * Lists with no sender/recipient/address/vaultId filter would span every user's rows,
 * so they show only what the caller can see. A caller signed in with a bearer token
 * sees streams in their own vaults plus, outside the treasury scope, their own rows.
 * Anyone else sees only streams listed under public vaults. The `viewer` query param
 * and the x-user-address header are never trusted as identity here, since anyone can
 * set them. `ownRowsSql` takes the viewer address twice. Null when nothing is visible.
 */
async function buildViewerScope(
  req: Request,
  treasuryOnly: boolean,
  columns: { vaultIdColumn: string; ownRowsSql: string },
): Promise<{ sql: string; params: unknown[] } | null> {
  const viewerAddress = req.verifiedUser?.address ?? null;
  const vaultIds = viewerAddress ? await getViewerVaultIds(viewerAddress) : await getPublicVaultIds();
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (viewerAddress && !treasuryOnly) {
    clauses.push(columns.ownRowsSql);
    params.push(viewerAddress, viewerAddress);
  }
  if (vaultIds.length > 0) {
    clauses.push(`${columns.vaultIdColumn} IN (${vaultIds.map(() => '?').join(', ')})`);
    params.push(...vaultIds);
  }
  return clauses.length > 0 ? { sql: `(${clauses.join(' OR ')})`, params } : null;
}

async function getPublicVaultIds(): Promise<string[]> {
  const vaults = await VaultService.getPublicVaults();
  const ids = new Set<string>();
  for (const vault of vaults) {
    if (vault.id) ids.add(vault.id);
    if (vault.vaultId) ids.add(vault.vaultId);
  }
  return Array.from(ids);
}

function rowToStreamBatch(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    vault_id: row.vault_id ? String(row.vault_id) : null,
    sender: String(row.sender),
    token_type: String(row.token_type || 'BCH'),
    token_category: row.token_category ? String(row.token_category) : null,
    stream_count: Number(row.stream_count || 0),
    total_amount: Number(row.total_amount || 0),
    status: String(row.status || 'PENDING'),
    tx_hash: row.tx_hash ? String(row.tx_hash) : null,
    launch_context: row.launch_source
      ? {
          source: String(row.launch_source),
          title: row.launch_title ? String(row.launch_title) : undefined,
          description: row.launch_description ? String(row.launch_description) : undefined,
          preferredLane: row.preferred_lane ? String(row.preferred_lane) : undefined,
        }
      : null,
    active_streams: Number(row.active_streams || 0),
    pending_streams: Number(row.pending_streams || 0),
    cancelled_streams: Number(row.cancelled_streams || 0),
    completed_streams: Number(row.completed_streams || 0),
    created_at: Number(row.created_at || 0),
    updated_at: Number(row.updated_at || 0),
  };
}

async function listBatchActivityEvents(streamIds: string[], limit = 300) {
  const ids = streamIds.filter((id) => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db!.prepare(`
    SELECT id, entity_type, entity_id, event_type, actor, amount, status, tx_hash, details, created_at
    FROM activity_events
    WHERE entity_type = 'stream' AND entity_id IN (${placeholders})
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...ids, Math.max(1, Math.min(500, Math.trunc(limit)))) as Array<{
    id: string;
    entity_type: 'stream';
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
    details: row.details ? safeParseJson(row.details) : null,
  }));
}

function escapeCsvValue(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatBatchExportDate(timestamp?: number | null) {
  if (!timestamp || !Number.isFinite(timestamp)) return '';
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function buildBatchExportRow(row: any) {
  const constructorParams = row.constructor_params ? deserializeConstructorParams(row.constructor_params) : [];
  const intervalSeconds = row.interval_seconds
    ? Number(row.interval_seconds)
    : row.stream_type === 'RECURRING'
      ? Number(toBigIntParam(constructorParams[4], 'intervalSeconds'))
      : row.stream_type === 'STEP'
        ? Number(toBigIntParam(constructorParams[7], 'stepInterval'))
        : 0;
  const durationDays = row.end_time && row.start_time
    ? Math.max(0, Math.round((Number(row.end_time) - Number(row.start_time)) / DAY_SECONDS))
    : '';
  const cliffDays = row.cliff_timestamp && row.start_time
    ? Math.max(0, Math.round((Number(row.cliff_timestamp) - Number(row.start_time)) / DAY_SECONDS))
    : '';

  let unlockPercent = '';
  let unlockDay = '';
  let trancheOffsetsDays = '';
  let tranchePercentages = '';

  if (row.stream_type === 'TRANCHE' && constructorParams.length > 0) {
    const tranches = parseTrancheScheduleFromConstructorParams(constructorParams);
    trancheOffsetsDays = tranches
      .map((tranche) => Math.max(0, Math.round((tranche.unlockTime - Number(row.start_time)) / DAY_SECONDS)))
      .join('|');
    tranchePercentages = tranches
      .map((tranche) => row.total_amount > 0 ? ((tranche.amount / Number(row.total_amount)) * 100).toFixed(4).replace(/\.?0+$/, '') : '0')
      .join('|');
  }

  if (row.stream_type === 'HYBRID' && constructorParams.length > 0) {
    const unlockTimestamp = Number(toBigIntParam(constructorParams[4], 'unlockTimestamp'));
    const upfrontAmountOnChain = Number(toBigIntParam(constructorParams[6], 'upfrontAmount'));
    const upfrontAmountDisplay = onChainAmountToDisplay(upfrontAmountOnChain, row.token_type, Number(row.token_decimals || 0));
    unlockDay = Math.max(0, Math.round((unlockTimestamp - Number(row.start_time)) / DAY_SECONDS)).toString();
    unlockPercent = row.total_amount > 0
      ? ((upfrontAmountDisplay / Number(row.total_amount)) * 100).toFixed(2).replace(/\.?0+$/, '')
      : '';
  }

  return {
    streamId: String(row.stream_id || ''),
    recipient: String(row.recipient || ''),
    amount: String(row.total_amount ?? ''),
    description: String(row.description || ''),
    scheduleTemplate: String(row.schedule_template || ''),
    streamType: String(row.stream_type || ''),
    startDate: formatBatchExportDate(Number(row.start_time || 0)),
    durationDays: String(durationDays),
    intervalDays: intervalSeconds ? String(Math.round(intervalSeconds / DAY_SECONDS)) : '',
    cliffDays: String(cliffDays),
    unlockPercent,
    unlockDay,
    trancheOffsetsDays,
    tranchePercentages,
    status: String(row.status || ''),
    contractAddress: String(row.contract_address || ''),
    txHash: String(row.tx_hash || ''),
  };
}

function getRecurringPaymentCountError(paymentCount: number): string {
  return `This schedule has ${paymentCount} payments, and each one pays its own network fee from the stream. `
    + `The most is ${MAX_RECURRING_STREAM_PAYMENTS}. Pick a longer interval or a shorter end date.`;
}

/**
 * For an active vesting stream whose fee reserve only covers the final claim, when
 * that claim can be made. Null when a claim can go through now, for recurring
 * streams, or when the live state can't be read.
 */
async function getClaimDeferredUntil(row: any): Promise<number | null> {
  if (row.status !== 'ACTIVE' || !row.contract_address || !row.constructor_params || row.stream_type === 'RECURRING') {
    return null;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  try {
    const ftRow = parseFtVestingRow(row);
    if (ftRow) {
      if (!ftRow.stateCategory) return null;
      return await new FtVestingService(resolveBchNetwork()).getClaimDeferredUntil({
        args: ftRow.args,
        stateCategory: ftRow.stateCategory,
        ftCategory: ftRow.ftCategory,
        nowSeconds,
      });
    }
    const constructorParams = deserializeConstructorParams(row.constructor_params);
    const { startTime, endTime } = resolveOnChainStreamTimeBounds(row, constructorParams);
    return await new StreamClaimService(resolveBchNetwork()).getClaimDeferredUntil({
      contractAddress: row.contract_address,
      totalAmount: resolveOnChainStreamTotalAmount(row, constructorParams),
      startTime,
      endTime,
      currentTime: nowSeconds,
      tokenType: row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' : 'BCH',
    });
  } catch (error) {
    console.warn('[streams] Could not read the claim reserve', { streamId: row.id, error });
    return null;
  }
}

const ANCHOR_PREP_PROMPT = 'Step 1 of 2. Get your wallet ready to fund this stream. This sends a small amount back to yourself.';

/**
 * How many claims the contract's fee reserve covers. Recurring pays one interval per
 * claim, so it needs one per interval (capped at create). Every other schedule can
 * take any number of steps or tranches in one claim, so it gets the fixed budget.
 */
export function getStreamMaxClaims(row: any): number {
  const scheduleCount = getStreamScheduleDetails(row).scheduleCount;
  if (row.stream_type === 'RECURRING') return Math.min(scheduleCount ?? CONTINUOUS_STREAM_CLAIM_BUDGET, MAX_RECURRING_STREAM_PAYMENTS);
  if (row.stream_type === 'LINEAR' || row.stream_type === 'HYBRID') return CONTINUOUS_STREAM_CLAIM_BUDGET;
  return Math.min(scheduleCount ?? CONTINUOUS_STREAM_CLAIM_BUDGET, CONTINUOUS_STREAM_CLAIM_BUDGET);
}

// Only rebase when the last funding tx (or create, or the last rebase) was handed out
// at least this long ago, so a tx the wallet is still holding for the current address
// isn't replaced moments later. Also the smallest start delay worth a rebase.
const SCHEDULE_REBASE_MIN_SHIFT_SECONDS = 600;

/**
 * Schedule times are fixed into the contract at create, but nothing is on chain
 * until funding. When a single stream's start has passed by the time it is funded,
 * move every schedule time forward so it starts now, re-derive the address and
 * persist it. A future start is kept until it passes. updated_at marks the last time
 * a funding tx or address was handed out. Skipped for batch streams and starts set
 * before create (dates chosen by the sender), and whenever the stored address
 * already holds coins or a funding tx was recorded.
 */
export async function rebaseUnfundedStreamSchedule(row: any, nowSeconds: number): Promise<any> {
  const handedOutAt = Number(row.updated_at || row.created_at || 0);
  const startTime = Number(row.start_time || 0);
  const shift = nowSeconds - startTime;
  if (
    row.batch_id || row.tx_hash || !row.constructor_params || !handedOutAt
    || nowSeconds - handedOutAt < SCHEDULE_REBASE_MIN_SHIFT_SECONDS
    || shift < SCHEDULE_REBASE_MIN_SHIFT_SECONDS
    || startTime < Number(row.created_at || 0) - SCHEDULE_REBASE_MIN_SHIFT_SECONDS
  ) {
    return row;
  }

  const deploymentService = new StreamDeploymentService(resolveBchNetwork());
  if (row.contract_address && await deploymentService.addressHasUtxos(row.contract_address)) {
    return row;
  }

  // A CashToken stream's address is fixed when its funding tx is built. Once one has
  // been handed out, a rebase would leave that tx paying an address the row no longer
  // names, and confirm-funding can't restore it, so keep the dates the tx was built with.
  if (parseFtVestingRow(row) && row.contract_address) {
    return row;
  }

  const storedParams = JSON.parse(row.constructor_params) as ConstructorParam[];
  let contractAddress: string = row.contract_address;
  let constructorParams: ConstructorParam[];
  let nftCommitment: string | null = row.nft_commitment || null;
  if (parseFtVestingRow(row)) {
    // The FT address is derived again from these args when the funding tx is built.
    constructorParams = StreamDeploymentService.shiftScheduleParams(row.stream_type, storedParams, shift);
  } else {
    const rebased = deploymentService.rebaseScheduleParams(row.stream_type, storedParams, shift);
    contractAddress = rebased.contractAddress;
    constructorParams = rebased.constructorParams;
    if (nftCommitment) {
      const commitment = hexToBin(nftCommitment);
      const timeOffset = row.stream_type === 'RECURRING' ? 18 : 10;
      writeUint40LE(commitment, timeOffset, readUint40LE(commitment, timeOffset) + shift);
      nftCommitment = binToHex(commitment);
    }
  }

  const shiftTime = (value: unknown) => (value ? Number(value) + shift : null);
  const updated = {
    ...row,
    contract_address: contractAddress,
    constructor_params: JSON.stringify(constructorParams),
    nft_commitment: nftCommitment,
    start_time: Number(row.start_time) + shift,
    end_time: shiftTime(row.end_time),
    cliff_timestamp: shiftTime(row.cliff_timestamp),
    updated_at: nowSeconds,
  };
  const { changes } = await db!.prepare(`
    UPDATE streams
    SET contract_address = ?, constructor_params = ?, nft_commitment = ?,
      start_time = ?, end_time = ?, cliff_timestamp = ?, updated_at = ?
    WHERE id = ? AND status = 'PENDING' AND tx_hash IS NULL AND updated_at IS NOT DISTINCT FROM ?
  `).run(
    updated.contract_address,
    updated.constructor_params,
    updated.nft_commitment,
    updated.start_time,
    updated.end_time,
    updated.cliff_timestamp,
    nowSeconds,
    row.id,
    row.updated_at,
  );
  if (changes === 0) {
    // Another call moved or funded it first; hand out what is stored now.
    return await db!.prepare('SELECT * FROM streams WHERE id = ?').get(row.id) as any;
  }
  await recordActivityEvent({
    entityType: 'stream',
    entityId: row.id,
    eventType: 'rescheduled',
    actor: row.sender,
    amount: Number(row.total_amount),
    status: 'PENDING',
    details: {
      shiftSeconds: shift,
      startTime: updated.start_time,
      endTime: updated.end_time,
      previousContractAddress: row.contract_address || null,
      previousConstructorParams: storedParams,
    },
    createdAt: nowSeconds,
  });
  return updated;
}

/**
 * Walks back through a PENDING stream's rebases (newest first) to find the earlier
 * address a funding tx paid, then restores the constructor params, schedule times and
 * commitment that address was derived from. Null when no earlier address was paid.
 * Single-UTXO streams only: a CashToken stream's address is derived when its funding
 * tx is built.
 */
export async function restoreScheduleForEarlierAddress(
  row: any,
  paysContractAt: (address: string) => Promise<boolean>,
): Promise<any | null> {
  const events = (await listActivityEvents('stream', String(row.id), 200))
    .filter((event) => event.event_type === 'rescheduled');
  let shift = 0;
  for (const event of events) {
    const details = (event.details ?? {}) as {
      shiftSeconds?: unknown;
      previousContractAddress?: unknown;
      previousConstructorParams?: unknown;
    };
    shift += Number(details.shiftSeconds || 0);
    const previousAddress = typeof details.previousContractAddress === 'string' ? details.previousContractAddress : '';
    if (!previousAddress || !Array.isArray(details.previousConstructorParams)) continue;
    if (!(await paysContractAt(previousAddress))) continue;

    const unshift = (value: unknown) => (value ? Number(value) - shift : null);
    let nftCommitment: string | null = row.nft_commitment || null;
    if (nftCommitment) {
      const commitment = hexToBin(nftCommitment);
      const timeOffset = row.stream_type === 'RECURRING' ? 18 : 10;
      writeUint40LE(commitment, timeOffset, readUint40LE(commitment, timeOffset) - shift);
      nftCommitment = binToHex(commitment);
    }
    const restored = {
      ...row,
      contract_address: previousAddress,
      constructor_params: JSON.stringify(details.previousConstructorParams),
      nft_commitment: nftCommitment,
      start_time: Number(row.start_time) - shift,
      end_time: unshift(row.end_time),
      cliff_timestamp: unshift(row.cliff_timestamp),
    };
    const { changes } = await db!.prepare(`
      UPDATE streams
      SET contract_address = ?, constructor_params = ?, nft_commitment = ?,
        start_time = ?, end_time = ?, cliff_timestamp = ?
      WHERE id = ? AND status = 'PENDING' AND tx_hash IS NULL
    `).run(
      restored.contract_address,
      restored.constructor_params,
      restored.nft_commitment,
      restored.start_time,
      restored.end_time,
      restored.cliff_timestamp,
      row.id,
    );
    if (changes === 0) return null;
    await recordActivityEvent({
      entityType: 'stream',
      entityId: String(row.id),
      eventType: 'rescheduled',
      actor: row.sender,
      amount: Number(row.total_amount),
      status: 'PENDING',
      details: {
        shiftSeconds: -shift,
        startTime: restored.start_time,
        endTime: restored.end_time,
        previousContractAddress: row.contract_address || null,
        previousConstructorParams: JSON.parse(row.constructor_params),
        restoredForLateFunding: true,
      },
    });
    return restored;
  }
  return null;
}

function getStreamScheduleDetails(row: any): {
  intervalSeconds?: number;
  amountPerIntervalOnChain?: number;
  amountPerIntervalDisplay?: number;
  stepAmountOnChain?: number;
  stepAmountDisplay?: number;
  hybridUnlockTime?: number;
  hybridUpfrontAmountOnChain?: number;
  hybridUpfrontAmountDisplay?: number;
  scheduleCount?: number;
  trancheScheduleOnChain?: Array<{
    unlockTime: number;
    amount: number;
    cumulativeAmount: number;
  }>;
  trancheScheduleDisplay?: Array<{
    unlock_time: number;
    amount: number;
    cumulative_amount: number;
  }>;
} {
  let intervalSeconds = Number(row.interval_seconds || 0) || undefined;
  let amountPerIntervalOnChain: number | undefined;
  let stepAmountOnChain: number | undefined;
  let hybridUnlockTime: number | undefined;
  let hybridUpfrontAmountOnChain: number | undefined;
  let trancheScheduleOnChain: Array<{ unlockTime: number; amount: number; cumulativeAmount: number }> | undefined;

  if (row.constructor_params) {
    try {
      const constructorParams = deserializeConstructorParams(row.constructor_params);
      if (row.stream_type === 'RECURRING') {
        intervalSeconds = Number(toBigIntParam(constructorParams[4], 'intervalSeconds'));
        amountPerIntervalOnChain = Number(toBigIntParam(constructorParams[3], 'amountPerInterval'));
      } else if (row.stream_type === 'STEP') {
        intervalSeconds = Number(toBigIntParam(constructorParams[7], 'stepInterval'));
        stepAmountOnChain = Number(toBigIntParam(constructorParams[8], 'stepAmount'));
      } else if (row.stream_type === 'HYBRID') {
        hybridUnlockTime = Number(toBigIntParam(constructorParams[4], 'unlockTimestamp'));
        hybridUpfrontAmountOnChain = Number(toBigIntParam(constructorParams[6], 'upfrontAmount'));
      } else if (row.stream_type === 'TRANCHE') {
        trancheScheduleOnChain = parseTrancheScheduleFromConstructorParams(constructorParams);
      }
    } catch (error) {
      console.warn('[streams] Failed to parse constructor params for schedule details', {
        streamId: row.id,
        error,
      });
    }
  }

  const scheduleCount = intervalSeconds
    ? row.end_time
      ? Math.max(1, Math.floor((row.end_time - row.start_time) / intervalSeconds))
        : amountPerIntervalOnChain && amountPerIntervalOnChain > 0
        ? Math.max(
            1,
            Math.floor(
              displayAmountToOnChain(Number(row.total_amount), row.token_type, Number(row.token_decimals || 0)) / amountPerIntervalOnChain,
            ),
          )
        : undefined
    : row.stream_type === 'HYBRID'
      ? 2
      : trancheScheduleOnChain?.length || undefined;

  return {
    intervalSeconds,
    amountPerIntervalOnChain,
    amountPerIntervalDisplay: amountPerIntervalOnChain !== undefined
      ? onChainAmountToDisplay(amountPerIntervalOnChain, row.token_type, Number(row.token_decimals || 0))
      : undefined,
    stepAmountOnChain,
    stepAmountDisplay: stepAmountOnChain !== undefined
      ? onChainAmountToDisplay(stepAmountOnChain, row.token_type, Number(row.token_decimals || 0))
      : undefined,
    hybridUnlockTime,
    hybridUpfrontAmountOnChain,
    hybridUpfrontAmountDisplay: hybridUpfrontAmountOnChain !== undefined
      ? onChainAmountToDisplay(hybridUpfrontAmountOnChain, row.token_type, Number(row.token_decimals || 0))
      : undefined,
    scheduleCount,
    trancheScheduleOnChain,
    trancheScheduleDisplay: trancheScheduleOnChain?.map((tranche) => ({
      unlock_time: tranche.unlockTime,
      amount: onChainAmountToDisplay(tranche.amount, row.token_type, Number(row.token_decimals || 0)),
      cumulative_amount: onChainAmountToDisplay(tranche.cumulativeAmount, row.token_type, Number(row.token_decimals || 0)),
    })),
  };
}

async function preparePendingStreamRecord(params: {
  vaultId?: string | null;
  sender: string;
  recipient: string;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN' | 'CASHTOKENS';
  tokenCategory?: string | null;
  tokenDecimalsHint?: unknown;
  totalAmount: number;
  streamType: 'LINEAR' | 'RECURRING' | 'STEP' | 'TRANCHE' | 'HYBRID';
  startTime: number;
  endTime?: number;
  cliffTimestamp?: number | null;
  cancelable?: boolean;
  transferable?: boolean;
  description?: string | null;
  intervalSeconds?: number;
  scheduleTemplate?: string | null;
  refillable?: boolean;
  hybridUnlockTimestamp?: number;
  hybridUpfrontPercentage?: number;
  trancheSchedule?: unknown;
  launchContext?: StreamLaunchContext | null;
  sequenceNumber: number;
  createdAt: number;
}) {
  const {
    vaultId,
    sender,
    recipient,
    tokenType,
    tokenCategory,
    tokenDecimalsHint,
    totalAmount,
    streamType,
    startTime,
    endTime,
    cliffTimestamp,
    cancelable,
    transferable,
    description,
    intervalSeconds,
    scheduleTemplate,
    refillable,
    hybridUnlockTimestamp,
    hybridUpfrontPercentage,
    trancheSchedule,
    launchContext,
    sequenceNumber,
    createdAt,
  } = params;

  const id = randomUUID();
  const normalizedTokenType: 'BCH' | 'FUNGIBLE_TOKEN' =
    tokenType === 'FUNGIBLE_TOKEN' || tokenType === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' : 'BCH';
  const tokenDecimals = normalizedTokenType === 'FUNGIBLE_TOKEN'
    ? await resolveTokenDecimals(tokenCategory || '', resolveBchNetwork(), tokenDecimalsHint)
    : 0;
  const cancelableRequested = cancelable !== false;
  const transferableRequested = transferable !== false && streamType !== 'RECURRING';
  const refillableRequested = Boolean(refillable);
  const scheduleEndTime = endTime || startTime + 86400 * 365;
  const resolvedEndTime = refillableRequested && streamType === 'RECURRING' ? 0 : scheduleEndTime;
  const deploymentService = new StreamDeploymentService(resolveBchNetwork());

  let actualVaultId = deriveStandaloneVaultId(`${id}:${sender}:${recipient}:${createdAt}`);
  if (vaultId) {
    const vaultRow = await db!.prepare('SELECT * FROM vaults WHERE vault_id = ?').get(vaultId) as any;
    if (vaultRow?.constructor_params) {
      const vaultParams = JSON.parse(vaultRow.constructor_params);
      if (vaultParams[0]?.type === 'bytes') {
        actualVaultId = vaultParams[0].value;
      }
    }
  }

  const deploymentParams = {
    vaultId: actualVaultId,
    sender,
    recipient,
    totalAmount,
    startTime,
    endTime: resolvedEndTime,
    streamType,
    cliffTime: cliffTimestamp || undefined,
    cancelable: cancelableRequested,
    transferable: transferableRequested,
    tokenType: normalizedTokenType,
    tokenCategory: tokenCategory || undefined,
    tokenDecimals,
  } as const;

  let intervalSecondsForRow: number | null = null;
  let hybridUnlockTimestampForRow: number | null = null;
  let hybridUpfrontAmountDisplayForRow: number | null = null;
  let normalizedTrancheSchedule: Array<{ unlockTime: number; cumulativeAmountDisplay: number }> = [];
  let cliffTimestampForRow = cliffTimestamp || null;
  let deployment;

  if (streamType === 'RECURRING') {
    const durationSeconds = Math.max(1, scheduleEndTime - startTime);
    const explicitIntervalSeconds = Number(intervalSeconds);
    if (!Number.isFinite(explicitIntervalSeconds) || explicitIntervalSeconds <= 0) {
      throw new Error('Recurring streams require a valid intervalSeconds value');
    }
    if (explicitIntervalSeconds > durationSeconds) {
      throw new Error('Recurring interval must be shorter than or equal to the total schedule duration');
    }
    if (durationSeconds % explicitIntervalSeconds !== 0) {
      throw new Error('Recurring interval must divide the total schedule duration evenly');
    }

    const intervalCount = Math.max(1, Math.floor(durationSeconds / explicitIntervalSeconds));
    if (intervalCount > MAX_RECURRING_STREAM_PAYMENTS) {
      throw new Error(getRecurringPaymentCountError(intervalCount));
    }
    const totalOnChain = displayAmountToOnChain(Number(totalAmount), normalizedTokenType, tokenDecimals);
    if (totalOnChain <= 0) {
      throw new Error('Recurring stream total amount must be greater than zero');
    }
    if (totalOnChain % intervalCount !== 0) {
      throw new Error(
        'Recurring stream total amount must divide evenly across the selected cadence. ' +
          'Adjust the amount, duration, or interval.',
      );
    }

    intervalSecondsForRow = explicitIntervalSeconds;
    const amountPerIntervalOnChain = Math.floor(totalOnChain / intervalCount);
    const amountPerIntervalDisplay = onChainAmountToDisplay(amountPerIntervalOnChain, normalizedTokenType, tokenDecimals);
    deployment = await deploymentService.deployRecurringStream({
      ...deploymentParams,
      totalAmount: refillableRequested ? 0 : Number(totalAmount),
      endTime: resolvedEndTime,
      intervalSeconds: intervalSecondsForRow,
      amountPerInterval: amountPerIntervalDisplay,
    });
  } else if (streamType === 'STEP') {
    const durationSeconds = Math.max(1, resolvedEndTime - startTime);
    const explicitStepIntervalSeconds = Number(intervalSeconds);
    if (!Number.isFinite(explicitStepIntervalSeconds) || explicitStepIntervalSeconds <= 0) {
      throw new Error('Step vesting requires a valid intervalSeconds value');
    }
    if (explicitStepIntervalSeconds > durationSeconds) {
      throw new Error('Step interval must be shorter than or equal to the total vesting duration');
    }
    if (durationSeconds % explicitStepIntervalSeconds !== 0) {
      throw new Error('Step interval must divide the total vesting duration evenly');
    }

    const stepCount = Math.max(1, Math.floor(durationSeconds / explicitStepIntervalSeconds));
    const totalOnChain = displayAmountToOnChain(Number(totalAmount), normalizedTokenType, tokenDecimals);
    if (totalOnChain <= 0) {
      throw new Error('Step vesting total amount must be greater than zero');
    }

    const stepAmountOnChain = Math.floor((totalOnChain + stepCount - 1) / stepCount);
    const stepAmountDisplay = onChainAmountToDisplay(stepAmountOnChain, normalizedTokenType, tokenDecimals);
    intervalSecondsForRow = explicitStepIntervalSeconds;
    deployment = await deploymentService.deployVestingStream({
      ...deploymentParams,
      stepInterval: intervalSecondsForRow,
      stepAmount: stepAmountDisplay,
    });
  } else if (streamType === 'TRANCHE') {
    const normalized = normalizeTrancheSchedule({
      trancheSchedule,
      totalAmount: Number(totalAmount),
      tokenType: normalizedTokenType,
      decimals: tokenDecimals,
      startTime,
    });

    normalizedTrancheSchedule = normalized.schedule;
    cliffTimestampForRow =
      normalized.schedule[0].unlockTime > startTime ? normalized.schedule[0].unlockTime : null;
      deployment = await deploymentService.deployTrancheStream({
        ...deploymentParams,
        endTime: normalized.finalUnlockTime,
        trancheSchedule: normalized.schedule.map((tranche) => ({
          unlockTime: tranche.unlockTime,
          cumulativeAmount: tranche.cumulativeAmountDisplay,
        })),
      });
  } else if (streamType === 'HYBRID') {
    const hybridUnlockTimestampValue = Number(hybridUnlockTimestamp);
    const hybridUpfrontPercentageValue = Number(hybridUpfrontPercentage);
    if (!Number.isFinite(hybridUnlockTimestampValue) || hybridUnlockTimestampValue <= startTime) {
      throw new Error('Hybrid streams require a valid unlock timestamp after the stream start time');
    }
    if (!Number.isFinite(hybridUpfrontPercentageValue) || hybridUpfrontPercentageValue <= 0 || hybridUpfrontPercentageValue >= 100) {
      throw new Error('Hybrid streams require an upfront percentage between 0 and 100');
    }
    if (hybridUnlockTimestampValue >= resolvedEndTime) {
      throw new Error('Hybrid unlock timestamp must be before the stream end time');
    }

    const totalOnChain = displayAmountToOnChain(Number(totalAmount), normalizedTokenType, tokenDecimals);
    const hybridUpfrontAmountOnChain = Math.max(
      1,
      Math.floor((totalOnChain * hybridUpfrontPercentageValue) / 100),
    );
    hybridUnlockTimestampForRow = hybridUnlockTimestampValue;
    hybridUpfrontAmountDisplayForRow = onChainAmountToDisplay(hybridUpfrontAmountOnChain, normalizedTokenType, tokenDecimals);
    cliffTimestampForRow = hybridUnlockTimestampForRow;

    deployment = await deploymentService.deployHybridStream({
      ...deploymentParams,
      endTime: resolvedEndTime,
      hybridUnlockTime: hybridUnlockTimestampForRow,
      hybridUpfrontAmount: hybridUpfrontAmountDisplayForRow,
    });
  } else {
    deployment = await deploymentService.deployVestingStream(deploymentParams);
  }

  const streamId = streamService.generateStreamId(
    normalizedTokenType === 'BCH' ? 'BCH' : 'CASHTOKENS',
    sequenceNumber,
  );

  const effectiveEndTime =
    streamType === 'TRANCHE'
      ? normalizedTrancheSchedule[normalizedTrancheSchedule.length - 1]?.unlockTime || null
      : refillableRequested
        ? null
        : resolvedEndTime || null;

  return {
    id,
    streamId,
    vaultId: vaultId || null,
    sender,
    recipient,
    tokenType: normalizedTokenType === 'BCH' ? 'BCH' : 'CASHTOKENS',
    tokenCategory: tokenCategory || null,
    tokenDecimals,
    totalAmount,
    streamType,
    startTime,
    endTime: effectiveEndTime,
    intervalSeconds: intervalSecondsForRow,
    cliffTimestamp: streamType === 'TRANCHE' || streamType === 'HYBRID'
      ? cliffTimestampForRow
      : cliffTimestamp || null,
    cancelable: cancelableRequested,
    transferable: transferableRequested,
    refillable: refillableRequested,
    scheduleTemplate: scheduleTemplate || null,
    launchSource: launchContext?.source || null,
    launchTitle: launchContext?.title || null,
    launchDescription: launchContext?.description || null,
    preferredLane: launchContext?.preferredLane || null,
    description: description || null,
    contractAddress: deployment.contractAddress,
    constructorParams: deployment.constructorParams,
    nftCommitment: deployment.initialCommitment,
    createdAt,
    activityDetails: {
      streamId,
      streamType,
      scheduleTemplate: scheduleTemplate || null,
      startTime,
      endTime: effectiveEndTime,
      cliffTimestamp: streamType === 'TRANCHE' || streamType === 'HYBRID'
        ? cliffTimestampForRow
        : cliffTimestamp || null,
      refillable: refillableRequested,
      launchContext: launchContext || null,
      hybridUnlockTimestamp: hybridUnlockTimestampForRow,
      hybridUpfrontAmount: hybridUpfrontAmountDisplayForRow,
      trancheSchedule: streamType === 'TRANCHE' ? normalizedTrancheSchedule : undefined,
    },
  };
}

function parseVestingCommitmentState(commitmentHex: string | null | undefined): {
  status: number;
  totalReleased: number;
  cursor: number;
  pauseStart: number;
} | null {
  if (!commitmentHex) return null;
  try {
    const bytes = hexToBin(commitmentHex);
    if (bytes.length < 20) return null;
    return {
      status: bytes[0],
      totalReleased: Number(new DataView(bytes.buffer, bytes.byteOffset + 2, 8).getBigUint64(0, true)),
      cursor:
        bytes[10]
        + (bytes[11] << 8)
        + (bytes[12] << 16)
        + (bytes[13] << 24)
        + (bytes[14] * 0x100000000),
      pauseStart:
        bytes[15]
        + (bytes[16] << 8)
        + (bytes[17] << 16)
        + (bytes[18] << 24)
        + (bytes[19] * 0x100000000),
    };
  } catch {
    return null;
  }
}

function resolveOnChainStreamTotalAmount(row: any, constructorParams: any[]): number {
  if (row.stream_type === 'HYBRID' || row.stream_type === 'TRANCHE') {
    return Number(toBigIntParam(constructorParams[2], 'totalAmount'));
  }
  return Number(toBigIntParam(constructorParams[3], 'totalAmount'));
}

function resolveOnChainStreamTimeBounds(
  row: any,
  constructorParams: any[],
): { startTime: number; endTime: number } {
  if (row.stream_type === 'HYBRID') {
    return {
      startTime: Number(toBigIntParam(constructorParams[3], 'startTimestamp')),
      endTime: Number(toBigIntParam(constructorParams[5], 'endTimestamp')),
    };
  }

  if (row.stream_type === 'TRANCHE') {
    const startTime = Number(toBigIntParam(constructorParams[3], 'startTimestamp'));
    return {
      startTime,
      endTime: Number(row.end_time || startTime + 86400 * 365),
    };
  }

  return {
    startTime: Number(toBigIntParam(constructorParams[4], 'startTimestamp')),
    endTime: Number(toBigIntParam(constructorParams[5], 'endTimestamp')),
  };
}

function deserializeConstructorParams(rawParams: string): any[] {
  const parsed = JSON.parse(rawParams || '[]');
  return parsed.map((p: any) => {
    if (p?.type === 'bytes') return Buffer.from(p.value, 'hex');
    if (p?.type === 'bigint') return BigInt(p.value);
    return p?.value ?? p;
  });
}

function parseRecurringCommitment(commitmentHex: string): { totalPaid: bigint; nextPaymentTime: number; pauseStart: number } {
  const bytes = hexToBin(commitmentHex || '');
  if (bytes.length < 23) {
    throw new Error(`Invalid recurring stream commitment length: expected >=23, got ${bytes.length}`);
  }
  const totalPaid = new DataView(bytes.buffer, bytes.byteOffset + 2, 8).getBigUint64(0, true);
  const nextPaymentTime =
    bytes[18]
    + (bytes[19] << 8)
    + (bytes[20] << 16)
    + (bytes[21] << 24)
    + (bytes[22] * 0x100000000);
  const pauseStart =
    bytes.length >= 28
      ? bytes[23]
        + (bytes[24] << 8)
        + (bytes[25] << 16)
        + (bytes[26] << 24)
        + (bytes[27] * 0x100000000)
      : 0;
  return { totalPaid, nextPaymentTime, pauseStart };
}

function readUint40LE(bytes: Uint8Array, offset: number): number {
  if (bytes.length < offset + 5) return 0;
  return bytes[offset]
    + (bytes[offset + 1] << 8)
    + (bytes[offset + 2] << 16)
    + (bytes[offset + 3] << 24)
    + (bytes[offset + 4] * 0x100000000);
}

function writeUint40LE(bytes: Uint8Array, offset: number, value: number): void {
  const safeValue = Math.max(0, Math.floor(value));
  bytes[offset] = safeValue & 0xff;
  bytes[offset + 1] = (safeValue >>> 8) & 0xff;
  bytes[offset + 2] = (safeValue >>> 16) & 0xff;
  bytes[offset + 3] = (safeValue >>> 24) & 0xff;
  bytes[offset + 4] = Math.floor(safeValue / 0x100000000) & 0xff;
}

function shiftVestingCommitmentForFunding(
  commitmentHex: string,
  startTime: number,
  nowSeconds: number,
): string {
  try {
    const bytes = hexToBin(commitmentHex);
    if (bytes.length < 20) return commitmentHex;
    const currentCursor = readUint40LE(bytes, 10);
    const desiredCursor = Math.max(Math.trunc(Number(startTime) || 0), nowSeconds);
    const nextCursor = Math.max(currentCursor, desiredCursor);
    if (nextCursor === currentCursor) return commitmentHex;
    const updated = new Uint8Array(bytes);
    writeUint40LE(updated, 10, nextCursor);
    return binToHex(updated);
  } catch {
    return commitmentHex;
  }
}

function shiftRecurringCommitmentForFunding(
  commitmentHex: string,
  startTime: number,
  intervalSeconds: number,
  nowSeconds: number,
): string {
  try {
    const bytes = hexToBin(commitmentHex);
    if (bytes.length < 23) return commitmentHex;
    const safeInterval = Math.max(1, Math.trunc(Number(intervalSeconds) || 0));
    if (!Number.isFinite(safeInterval) || safeInterval <= 0) {
      return commitmentHex;
    }
    const desiredStart = Math.max(Math.trunc(Number(startTime) || 0), nowSeconds);
    const desiredNextPayment = desiredStart + safeInterval;
    const currentNextPayment = readUint40LE(bytes, 18);
    const nextPayment = Math.max(currentNextPayment, desiredNextPayment);
    if (nextPayment === currentNextPayment) return commitmentHex;
    const updated = new Uint8Array(bytes);
    writeUint40LE(updated, 18, nextPayment);
    return binToHex(updated);
  } catch {
    return commitmentHex;
  }
}

function getPendingFundingCommitment(row: any, nowSeconds: number): string | null {
  const currentCommitment = typeof row?.nft_commitment === 'string' ? row.nft_commitment : null;
  if (!currentCommitment) return null;

  if (row?.stream_type === 'RECURRING') {
    return shiftRecurringCommitmentForFunding(
      currentCommitment,
      Number(row?.start_time || 0),
      Number(row?.interval_seconds || 0),
      nowSeconds,
    );
  }

  return shiftVestingCommitmentForFunding(
    currentCommitment,
    Number(row?.start_time || 0),
    nowSeconds,
  );
}

function toBigIntParam(value: unknown, name: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value.length > 0) return BigInt(value);
  throw new Error(`Invalid ${name} in constructor parameters`);
}

function parseTrancheScheduleFromConstructorParams(constructorParams: any[]): Array<{
  unlockTime: number;
  amount: number;
  cumulativeAmount: number;
}> {
  const scheduleCount = Number(toBigIntParam(constructorParams[4], 'scheduleCount'));
  const tranches: Array<{ unlockTime: number; amount: number; cumulativeAmount: number }> = [];
  let previousCumulative = 0;

  for (let index = 0; index < Math.min(scheduleCount, 8); index += 1) {
    const timeParamIndex = 5 + index * 2;
    const cumulativeParamIndex = 6 + index * 2;
    const unlockTime = Number(toBigIntParam(constructorParams[timeParamIndex], `tranche${index + 1}Timestamp`));
    const cumulativeAmount = Number(toBigIntParam(constructorParams[cumulativeParamIndex], `tranche${index + 1}Cumulative`));
    tranches.push({
      unlockTime,
      amount: cumulativeAmount - previousCumulative,
      cumulativeAmount,
    });
    previousCumulative = cumulativeAmount;
  }

  return tranches;
}

function normalizeTrancheSchedule(params: {
  trancheSchedule: unknown;
  totalAmount: number;
  tokenType: 'BCH' | 'FUNGIBLE_TOKEN';
  decimals: number;
  startTime: number;
}): {
  schedule: Array<{ unlockTime: number; cumulativeAmountDisplay: number }>;
  finalUnlockTime: number;
} {
  const { trancheSchedule, totalAmount, tokenType, decimals, startTime } = params;
  if (!Array.isArray(trancheSchedule)) {
    throw new Error('Tranche streams require a trancheSchedule array');
  }
  if (trancheSchedule.length < 1 || trancheSchedule.length > 8) {
    throw new Error('Tranche streams support between 1 and 8 unlock points');
  }

  const normalized = trancheSchedule.map((raw, index) => {
    const unlockTime = Number((raw as any)?.unlockTime);
    const amount = Number((raw as any)?.amount);
    if (!Number.isFinite(unlockTime) || unlockTime <= startTime) {
      throw new Error(`Tranche ${index + 1} must unlock after the stream start time`);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Tranche ${index + 1} must have a positive amount`);
    }
    return { unlockTime: Math.floor(unlockTime), amount };
  });

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].unlockTime <= normalized[index - 1].unlockTime) {
      throw new Error('Tranche unlock times must be strictly increasing');
    }
  }

  const totalAmountOnChain = displayAmountToOnChain(totalAmount, tokenType, decimals);
  let runningTotalOnChain = 0;
  const schedule = normalized.map((tranche, index) => {
    const trancheAmountOnChain = displayAmountToOnChain(tranche.amount, tokenType, decimals);
    if (trancheAmountOnChain <= 0) {
      throw new Error(`Tranche ${index + 1} rounds to zero on-chain amount`);
    }
    runningTotalOnChain += trancheAmountOnChain;
    return {
      unlockTime: tranche.unlockTime,
      cumulativeAmountDisplay: onChainAmountToDisplay(runningTotalOnChain, tokenType === 'FUNGIBLE_TOKEN' ? 'CASHTOKENS' : 'BCH', decimals),
    };
  });

  if (runningTotalOnChain !== totalAmountOnChain) {
    throw new Error('Tranche amounts must add up exactly to the total stream amount');
  }

  return {
    schedule,
    finalUnlockTime: normalized[normalized.length - 1].unlockTime,
  };
}

// Streams created before the V2 covenants run on RecurringPaymentCovenant, whose
// refill() decides between its token and BCH checks with `tokenCategory != 0x`. The
// state NFT always satisfies that, so a BCH top-up of those streams always fails.
const REFILLABLE_UNAVAILABLE_ERROR = "This stream was created before adding funds was supported. Cancel it to get the rest back, then create a new one.";

function normalizeLaunchContext(raw: unknown): StreamLaunchContext | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const source = typeof candidate.source === 'string' ? candidate.source.trim() : '';
  if (!source) {
    return null;
  }

  const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
  const description = typeof candidate.description === 'string' ? candidate.description.trim() : '';
  const preferredLane = typeof candidate.preferredLane === 'string'
    ? candidate.preferredLane.trim()
    : '';

  return {
    source,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(preferredLane ? { preferredLane } : {}),
  };
}

function safeParseJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function parseOptionalDisplayAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Number(parsed.toFixed(8));
}

function parseOptionalAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isP2pkhAddress(address: string): boolean {
  const decoded = cashAddressToLockingBytecode(address);
  if (typeof decoded === 'string') return false;
  const b = decoded.bytecode;
  return (
    b.length === 25 &&
    b[0] === 0x76 &&
    b[1] === 0xa9 &&
    b[2] === 0x14 &&
    b[23] === 0x88 &&
    b[24] === 0xac
  );
}

function deriveStandaloneVaultId(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

export default router;
