/**
 * Advanced Explorer API
 * Professional-grade blockchain explorer endpoints
 */

import { resolveBchNetwork } from '../utils/network.js';
import { Router } from 'express';
import { ElectrumNetworkProvider } from 'cashscript';
import db from '../database/schema.js';
import { getLatestActivityEvents } from '../utils/activityEvents.js';

const router = Router();
const provider = new ElectrumNetworkProvider(resolveBchNetwork());

/**
 * GET /api/explorer/stats
 * Network and FlowGuard statistics
 */
router.get('/explorer/stats', async (req, res) => {
  try {
    // Blockchain stats
    const blockHeight = await provider.getBlockHeight();

    // FlowGuard stats
    const vaultCount = (await db!.prepare('SELECT COUNT(*) as n FROM vaults').get() as any).n;
    const streamCount = (await db!.prepare('SELECT COUNT(*) as n FROM streams').get() as any).n;
    const proposalCount = (await db!.prepare("SELECT COUNT(*) as n FROM proposals WHERE status <> 'abandoned'").get() as any).n;

    // Activity counts
    const activeStreams = (await db!.prepare('SELECT COUNT(*) as n FROM streams WHERE status = ?').get('ACTIVE') as any).n;
    const activeProposals = (await db!.prepare('SELECT COUNT(*) as n FROM proposals WHERE UPPER(status) = ?').get('PENDING') as any).n;

    // Volume calculations
    const totalVaultValue = (await db!.prepare('SELECT SUM(total_deposit) as s FROM vaults').get() as any)?.s || 0;
    // BCH-denominated volume must exclude CashToken streams: their total_amount is
    // in token units, not BCH, and summing them mixes incomparable units.
    const totalStreamVolume = (await db!.prepare("SELECT SUM(total_amount) as s FROM streams WHERE COALESCE(token_type, 'BCH') = 'BCH'").get() as any)?.s || 0;
    const tokenStreamCount = (await db!.prepare("SELECT COUNT(*) as n FROM streams WHERE COALESCE(token_type, 'BCH') <> 'BCH'").get() as any)?.n || 0;
    const totalProposalAmount = (await db!.prepare("SELECT SUM(amount) as s FROM proposals WHERE status <> 'abandoned'").get() as any)?.s || 0;

    // Recent activity (24h) — vaults/proposals use TIMESTAMPTZ, streams uses BIGINT epoch seconds
    const oneDayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgoEpoch = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const recentVaults = (await db!.prepare('SELECT COUNT(*) as n FROM vaults WHERE created_at >= ?').get(oneDayAgoIso) as any).n;
    const recentStreams = (await db!.prepare('SELECT COUNT(*) as n FROM streams WHERE created_at >= ?').get(oneDayAgoEpoch) as any).n;
    const recentProposals = (await db!.prepare("SELECT COUNT(*) as n FROM proposals WHERE created_at >= ? AND status <> 'abandoned'").get(oneDayAgoIso) as any).n;

    res.json({
      network: {
        blockHeight,
        // blockHeight comes from the configured network; reporting a fixed
        // 'chipnet' beside it contradicted the number on any mainnet deploy.
        network: resolveBchNetwork(),
      },
      flowguard: {
        vaults: {
          total: vaultCount,
          totalValue: totalVaultValue,
          recent24h: recentVaults,
        },
        streams: {
          total: streamCount,
          active: activeStreams,
          totalVolume: totalStreamVolume,
          tokenStreams: tokenStreamCount,
          recent24h: recentStreams,
        },
        proposals: {
          total: proposalCount,
          active: activeProposals,
          totalAmount: totalProposalAmount,
          recent24h: recentProposals,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/explorer/transactions
 * Get all transactions with advanced filtering
 */
router.get('/explorer/transactions', async (req, res) => {
  try {
    const {
      type,        // vault, stream, proposal, payment, airdrop
      status,      // ACTIVE, PENDING, COMPLETED, EXECUTED
      address,     // filter by sender or recipient
      minAmount,   // minimum BCH amount
      maxAmount,   // maximum BCH amount
      startDate,   // ISO date string
      endDate,     // ISO date string
      sort = 'time',   // time | amount | type | status
      order = 'desc',  // asc | desc
      limit = 50,
      offset = 0,
    } = req.query;

    const results: any[] = [];
    const params: any[] = [];
    const startIso = typeof startDate === 'string' ? startDate : '';
    const endIso = typeof endDate === 'string' ? endDate : '';
    const parsedStartEpoch = startIso ? Math.floor(Date.parse(startIso) / 1000) : null;
    const parsedEndEpoch = endIso ? Math.floor(Date.parse(endIso) / 1000) : null;
    const startEpoch = typeof parsedStartEpoch === 'number' && Number.isFinite(parsedStartEpoch)
      ? parsedStartEpoch
      : null;
    const endEpoch = typeof parsedEndEpoch === 'number' && Number.isFinite(parsedEndEpoch)
      ? parsedEndEpoch
      : null;

    // Build dynamic query based on type
    if (!type || type === 'vault') {
      let sql = `SELECT
        v.vault_id as id,
        v.id as entity_id,
        NULL as entity_type,
        v.name,
        v.contract_address,
        v.total_deposit as amount,
        v.creator as sender,
        NULL as recipient,
        'BCH' as token_type, NULL as token_category,
        'VAULT' as tx_type,
        CASE WHEN v.contract_address IS NOT NULL THEN 'DEPLOYED' ELSE 'CREATED' END as status,
        v.created_at,
        v.tx_hash
      FROM vaults v WHERE 1=1`;

      if (address) {
        sql += ' AND v.creator = ?';
        params.push(address);
      }
      if (status) {
        sql += " AND (CASE WHEN v.contract_address IS NOT NULL THEN 'DEPLOYED' ELSE 'CREATED' END) = UPPER(?)";
        params.push(status);
      }
      if (minAmount) {
        sql += ' AND v.total_deposit >= ?';
        params.push(Number(minAmount));
      }
      if (maxAmount) {
        sql += ' AND v.total_deposit <= ?';
        params.push(Number(maxAmount));
      }
      if (startDate) {
        sql += ' AND v.created_at >= ?';
        params.push(startIso);
      }
      if (endDate) {
        sql += ' AND v.created_at <= ?';
        params.push(endIso);
      }

      const rows = await db!.prepare(sql).all(...params) as any[];
      results.push(...rows);
      params.length = 0;
    }

    if (!type || type === 'stream') {
      let sql = `SELECT
        s.stream_id as id,
        s.id as entity_id,
        'stream' as entity_type,
        s.sender,
        s.recipient,
        s.total_amount as amount,
        s.stream_type as name,
        s.token_type,
        s.token_category,
        'STREAM' as tx_type,
        s.status,
        s.created_at,
        s.tx_hash
      FROM streams s WHERE 1=1`;

      if (address) {
        sql += ' AND (s.sender = ? OR s.recipient = ?)';
        params.push(address, address);
      }
      if (status) {
        sql += ' AND s.status = ?';
        params.push(status);
      }
      if (minAmount) {
        sql += ' AND s.total_amount >= ?';
        params.push(Number(minAmount));
      }
      if (maxAmount) {
        sql += ' AND s.total_amount <= ?';
        params.push(Number(maxAmount));
      }
      if (startDate) {
        sql += ' AND s.created_at >= ?';
        params.push(startEpoch ?? 0);
      }
      if (endDate) {
        sql += ' AND s.created_at <= ?';
        params.push(endEpoch ?? Number.MAX_SAFE_INTEGER);
      }

      const rows = await db!.prepare(sql).all(...params) as any[];
      results.push(...rows);
      params.length = 0;
    }

    if (!type || type === 'payment') {
      let sql = `SELECT
        p.payment_id as id,
        p.id as entity_id,
        'payment' as entity_type,
        p.sender,
        p.recipient,
        p.amount_per_period as amount,
        p.interval as name,
        p.token_type,
        p.token_category,
        'PAYMENT' as tx_type,
        p.status,
        p.created_at,
        p.tx_hash
      FROM payments p WHERE 1=1`;

      if (address) {
        sql += ' AND (p.sender = ? OR p.recipient = ?)';
        params.push(address, address);
      }
      if (status) {
        sql += ' AND p.status = ?';
        params.push(status);
      }
      if (minAmount) {
        sql += ' AND p.amount_per_period >= ?';
        params.push(Number(minAmount));
      }
      if (maxAmount) {
        sql += ' AND p.amount_per_period <= ?';
        params.push(Number(maxAmount));
      }
      if (startDate) {
        sql += ' AND p.created_at >= ?';
        params.push(startEpoch ?? 0);
      }
      if (endDate) {
        sql += ' AND p.created_at <= ?';
        params.push(endEpoch ?? Number.MAX_SAFE_INTEGER);
      }

      const rows = await db!.prepare(sql).all(...params) as any[];
      results.push(...rows);
      params.length = 0;
    }

    if (!type || type === 'airdrop') {
      let sql = `SELECT
        a.campaign_id as id,
        a.id as entity_id,
        'airdrop' as entity_type,
        a.creator as sender,
        NULL as recipient,
        a.total_amount as amount,
        a.title as name,
        a.token_type,
        a.token_category,
        'AIRDROP' as tx_type,
        a.status,
        a.created_at,
        a.tx_hash
      FROM airdrops a WHERE 1=1`;

      if (address) {
        sql += ' AND a.creator = ?';
        params.push(address);
      }
      if (status) {
        sql += ' AND a.status = ?';
        params.push(status);
      }
      if (minAmount) {
        sql += ' AND a.total_amount >= ?';
        params.push(Number(minAmount));
      }
      if (maxAmount) {
        sql += ' AND a.total_amount <= ?';
        params.push(Number(maxAmount));
      }
      if (startDate) {
        sql += ' AND a.created_at >= ?';
        params.push(startEpoch ?? 0);
      }
      if (endDate) {
        sql += ' AND a.created_at <= ?';
        params.push(endEpoch ?? Number.MAX_SAFE_INTEGER);
      }

      const rows = await db!.prepare(sql).all(...params) as any[];
      results.push(...rows);
      params.length = 0;
    }

    if (!type || type === 'proposal') {
      let sql = `SELECT
        p.id,
        p.id as entity_id,
        NULL as entity_type,
        p.vault_id,
        p.recipient,
        p.amount,
        p.reason as name,
        'BCH' as token_type, NULL as token_category,
        'PROPOSAL' as tx_type,
        UPPER(p.status) as status,
        p.created_at,
        p.tx_hash
      FROM proposals p WHERE p.status <> 'abandoned'`;

      if (address) {
        sql += ' AND p.recipient = ?';
        params.push(address);
      }
      if (status) {
        sql += ' AND UPPER(p.status) = UPPER(?)';
        params.push(status);
      }
      if (minAmount) {
        sql += ' AND p.amount >= ?';
        params.push(Number(minAmount));
      }
      if (maxAmount) {
        sql += ' AND p.amount <= ?';
        params.push(Number(maxAmount));
      }
      if (startDate) {
        sql += ' AND p.created_at >= ?';
        params.push(startIso);
      }
      if (endDate) {
        sql += ' AND p.created_at <= ?';
        params.push(endIso);
      }

      const rows = await db!.prepare(sql).all(...params) as any[];
      results.push(...rows);
    }

    // Attach latest lifecycle event data for entities backed by activity_events.
    const latestStreamEvents = await getLatestActivityEvents(
      'stream',
      results
        .filter((row) => row.entity_type === 'stream')
        .map((row) => String(row.entity_id)),
    );
    const latestPaymentEvents = await getLatestActivityEvents(
      'payment',
      results
        .filter((row) => row.entity_type === 'payment')
        .map((row) => String(row.entity_id)),
    );
    const latestAirdropEvents = await getLatestActivityEvents(
      'airdrop',
      results
        .filter((row) => row.entity_type === 'airdrop')
        .map((row) => String(row.entity_id)),
    );

    for (const row of results) {
      const latestEvent = row.entity_type === 'stream'
        ? latestStreamEvents.get(String(row.entity_id))
        : row.entity_type === 'payment'
        ? latestPaymentEvents.get(String(row.entity_id))
        : row.entity_type === 'airdrop'
        ? latestAirdropEvents.get(String(row.entity_id))
        : null;

      row.latest_event = latestEvent || null;
      if (!row.tx_hash && latestEvent?.tx_hash) {
        row.tx_hash = latestEvent.tx_hash;
      }
      if (latestEvent?.status) {
        row.status = latestEvent.status;
      }
      row.created_at = toUnixMs(row.created_at);
      delete row.entity_type;
      delete row.entity_id;
    }

    // Server-side sort across ALL matched rows (results are already fully
    // materialized here), so ordering is global, not just within a page.
    const sortFieldMap: Record<string, string> = {
      time: 'created_at',
      amount: 'amount',
      type: 'tx_type',
      status: 'status',
    };
    const sortField = sortFieldMap[String(sort)] || 'created_at';
    const dir = String(order).toLowerCase() === 'asc' ? 1 : -1;
    results.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
    });

    // Apply pagination
    const paginated = results.slice(Number(offset), Number(offset) + Number(limit));

    res.json({
      transactions: paginated,
      total: results.length,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/explorer/address/:address
 * Get all activity for a specific address
 */
router.get('/explorer/address/:address', async (req, res) => {
  try {
    const { address } = req.params;

    // Get balance from blockchain
    let balance = 0;
    try {
      const utxos = await provider.getUtxos(address);
      balance = utxos.reduce((sum, utxo) => sum + Number(utxo.satoshis), 0);
    } catch {
      // Address might not exist on chain
    }

    // Get vaults created
    const vaults = await db!.prepare('SELECT * FROM vaults WHERE creator = ? ORDER BY created_at DESC').all(address) as any[];

    // signer_pubkeys holds pubkey hex; addresses live in the signers JSON array.
    // LIKE is only a prefilter, exact membership is checked on the parsed array.
    const signerCandidates = await db!.prepare(`
      SELECT * FROM vaults
      WHERE LOWER(signers) LIKE ?
      ORDER BY created_at DESC
    `).all(`%${JSON.stringify(address.toLowerCase()).slice(1, -1)}%`) as any[];
    const signerVaults = signerCandidates.filter((row) => {
      try {
        const parsed = JSON.parse(row.signers);
        if (!Array.isArray(parsed)) return false;
        return parsed.some((s) => typeof s === 'string' && s.toLowerCase() === address.toLowerCase());
      } catch {
        return false;
      }
    });

    // Get streams (sent + received)
    const streamsSent = await db!.prepare('SELECT * FROM streams WHERE sender = ? ORDER BY created_at DESC').all(address) as any[];
    const streamsReceived = await db!.prepare('SELECT * FROM streams WHERE recipient = ? ORDER BY created_at DESC').all(address) as any[];

    // Get proposals (created + received)
    const proposalsReceived = await db!.prepare("SELECT * FROM proposals WHERE recipient = ? AND status <> 'abandoned' ORDER BY created_at DESC").all(address) as any[];

    // Calculate totals — BCH only; CashToken total_amount is in token units and
    // cannot be summed into a BCH figure.
    const isBchStream = (s: any) => (s.token_type ?? 'BCH') === 'BCH';
    const totalSent = streamsSent.filter(isBchStream).reduce((sum, s) => sum + s.total_amount, 0);
    const totalReceived = streamsReceived.filter(isBchStream).reduce((sum, s) => sum + s.total_amount, 0);
    const totalProposed = proposalsReceived.reduce((sum, p) => sum + p.amount, 0);

    res.json({
      address,
      balance: balance / 100000000, // Convert to BCH
      balanceSat: balance,
      activity: {
        vaultsCreated: vaults.length,
        vaultsAsSigner: signerVaults.length,
        streamsSent: streamsSent.length,
        streamsReceived: streamsReceived.length,
        proposalsReceived: proposalsReceived.length,
      },
      totals: {
        sent: totalSent,
        received: totalReceived,
        proposed: totalProposed,
      },
      vaults: vaults.slice(0, 10),
      streams: {
        sent: streamsSent.slice(0, 10),
        received: streamsReceived.slice(0, 10),
      },
      proposals: proposalsReceived.slice(0, 10),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/explorer/contract/:address
 * Get contract details and interaction history
 */
router.get('/explorer/contract/:address', async (req, res) => {
  try {
    const { address: contractAddress } = req.params;

    // Find vault by contract address
    const vault = await db!.prepare('SELECT * FROM vaults WHERE contract_address = ?').get(contractAddress) as any;

    if (!vault) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Get balance from blockchain
    let balance = 0;
    let utxos: any[] = [];
    try {
      utxos = await provider.getUtxos(contractAddress);
      balance = utxos.reduce((sum, utxo) => sum + Number(utxo.satoshis), 0);
    } catch {
      // Contract might not have UTXOs
    }

    // Get proposals for this vault
    // Proposals are keyed by vaults.id; legacy rows may hold the logical vault_id.
    const proposals = await db!.prepare("SELECT * FROM proposals WHERE (vault_id = ? OR vault_id = ?) AND status <> 'abandoned' ORDER BY created_at DESC").all(vault.id, vault.vault_id) as any[];

    // Get cycles
    const cycles = await db!.prepare('SELECT * FROM cycles WHERE vault_id = ? ORDER BY cycle_number DESC').all(vault.vault_id) as any[];

    // Get transactions (from general transactions table)
    const transactions = await db!.prepare('SELECT * FROM transactions WHERE vault_id = ? ORDER BY created_at DESC LIMIT 50').all(vault.vault_id) as any[];

    // Calculate contract stats
    const totalProposed = proposals.reduce((sum, p) => sum + p.amount, 0);
    const totalExecuted = proposals.filter(p => String(p.status).toUpperCase() === 'EXECUTED').reduce((sum, p) => sum + p.amount, 0);
    const pendingProposals = proposals.filter(p => String(p.status).toUpperCase() === 'PENDING').length;

    res.json({
      contract: {
        address: contractAddress,
        type: 'VaultCovenant',
        balance: balance / 100000000,
        balanceSat: balance,
        utxoCount: utxos.length,
      },
      vault: {
        id: vault.vault_id,
        name: vault.name,
        creator: vault.creator,
        signerCount: JSON.parse(vault.signer_pubkeys || '[]').length,
        approvalThreshold: vault.approval_threshold,
        totalDeposit: vault.total_deposit,
        createdAt: vault.created_at,
      },
      stats: {
        proposalCount: proposals.length,
        pendingProposals,
        totalProposed,
        totalExecuted,
        cycleCount: cycles.length,
        transactionCount: transactions.length,
      },
      proposals: proposals.slice(0, 20),
      cycles: cycles.slice(0, 10),
      transactions: transactions.slice(0, 20),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/explorer/search
 * Universal search: addresses, contracts, transactions, vaults
 */
router.get('/explorer/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Search query required' });
    }

    const query = q.toLowerCase();
    const results: any = {
      vaults: [],
      streams: [],
      proposals: [],
      addresses: [],
      transactions: [],
    };

    const isTxHash = /^[0-9a-f]{64}$/.test(query);

    // Search vaults by name, ID, or address
    results.vaults = await db!.prepare(`
      SELECT vault_id, name, contract_address, creator, total_deposit, created_at
      FROM vaults
      WHERE LOWER(name) LIKE ? OR LOWER(vault_id) LIKE ? OR LOWER(contract_address) LIKE ?
      ${isTxHash ? 'OR LOWER(tx_hash) = ? OR LOWER(deployment_tx_hash) = ?' : ''}
      LIMIT 10
    `).all(`%${query}%`, `%${query}%`, `%${query}%`, ...(isTxHash ? [query, query] : []));

    // Search streams by ID or addresses
    results.streams = await db!.prepare(`
      SELECT id, stream_id, sender, recipient, total_amount, token_type, token_category, status, created_at
      FROM streams
      WHERE LOWER(stream_id) LIKE ? OR LOWER(sender) LIKE ? OR LOWER(recipient) LIKE ?
      ${isTxHash ? "OR LOWER(tx_hash) = ? OR id IN (SELECT entity_id FROM activity_events WHERE entity_type = 'stream' AND LOWER(tx_hash) = ?)" : ''}
      LIMIT 10
    `).all(`%${query}%`, `%${query}%`, `%${query}%`, ...(isTxHash ? [query, query] : []));

    // Search proposals by reason
    results.proposals = await db!.prepare(`
      SELECT id, vault_id, recipient, amount, reason, status, created_at
      FROM proposals
      WHERE status <> 'abandoned'
        AND (LOWER(reason) LIKE ? OR LOWER(recipient) LIKE ?
        ${isTxHash ? 'OR LOWER(tx_hash) = ?' : ''})
      LIMIT 10
    `).all(`%${query}%`, `%${query}%`, ...(isTxHash ? [query] : []));

    // If query looks like an address, add it to results
    if (query.startsWith('bchtest:') || query.startsWith('bitcoincash:')) {
      results.addresses.push({ address: q });
    }

    if (isTxHash) {
      results.transactions = await db!.prepare(`
        SELECT tx_hash, entity_type, entity_id, event_type, created_at
        FROM activity_events WHERE LOWER(tx_hash) = ?
        UNION ALL
        SELECT tx_hash, 'payment' as entity_type, id as entity_id, 'funded' as event_type, created_at
        FROM payments WHERE LOWER(tx_hash) = ?
          AND NOT EXISTS (SELECT 1 FROM activity_events e WHERE e.entity_type = 'payment' AND e.entity_id = payments.id AND LOWER(e.tx_hash) = LOWER(payments.tx_hash))
        UNION ALL
        SELECT tx_hash, 'airdrop' as entity_type, id as entity_id, 'funded' as event_type, created_at
        FROM airdrops WHERE LOWER(tx_hash) = ?
          AND NOT EXISTS (SELECT 1 FROM activity_events e WHERE e.entity_type = 'airdrop' AND e.entity_id = airdrops.id AND LOWER(e.tx_hash) = LOWER(airdrops.tx_hash))
        LIMIT 10
      `).all(query, query, query);
    }

    const totalResults = results.vaults.length + results.streams.length +
                        results.proposals.length + results.addresses.length +
                        results.transactions.length;

    res.json({
      query: q,
      results,
      totalResults,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/explorer/timeline
 * Get chronological activity timeline
 */
router.get('/explorer/timeline', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;

    const timeline: any[] = [];

    // Get recent vaults
    const vaults = await db!.prepare('SELECT * FROM vaults ORDER BY created_at DESC LIMIT ?').all(Number(limit)) as any[];
    vaults.forEach(v => timeline.push({
      type: 'VAULT_CREATED',
      id: v.vault_id,
      name: v.name,
      creator: v.creator,
      amount: v.total_deposit,
      timestamp: v.created_at,
    }));

    // Get recent streams
    const streams = await db!.prepare('SELECT * FROM streams ORDER BY created_at DESC LIMIT ?').all(Number(limit)) as any[];
    streams.forEach(s => timeline.push({
      type: 'STREAM_CREATED',
      id: s.stream_id,
      sender: s.sender,
      recipient: s.recipient,
      amount: s.total_amount,
      timestamp: s.created_at,
    }));

    // Get recent proposals
    const proposals = await db!.prepare("SELECT * FROM proposals WHERE status <> 'abandoned' ORDER BY created_at DESC LIMIT ?").all(Number(limit)) as any[];
    proposals.forEach(p => timeline.push({
      type: 'PROPOSAL_CREATED',
      id: p.id,
      vaultId: p.vault_id,
      recipient: p.recipient,
      amount: p.amount,
      reason: p.reason,
      timestamp: p.created_at,
    }));

    // Sort by timestamp desc
    timeline.sort((a, b) => (toUnixMs(b.timestamp) ?? 0) - (toUnixMs(a.timestamp) ?? 0));

    // Apply pagination
    const paginated = timeline.slice(Number(offset), Number(offset) + Number(limit));

    res.json({
      timeline: paginated,
      total: timeline.length,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

function toUnixMs(value: unknown): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export default router;
