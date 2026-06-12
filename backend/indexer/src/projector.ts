import type { Pool, PoolClient } from 'pg';

import {
  decodeAirdropState,
  decodeProposalState,
  decodeScheduleState,
  decodeTallyState,
  decodeVaultState,
  decodeVoteState,
} from './state-decoders.js';

import { ElectrumClient, type ElectrumHistoryEntry, type ElectrumUnspent } from './electrum-client.js';
import { loadRegistry, type Family, type RegistryEntry } from './registry.js';
import {
  advanceSafe,
  findReorgPoint,
  getSyncState,
  pushRecentBlock,
  trimRecentBlocks,
  updateCursor,
  type RecentBlock,
} from './sync-state.js';

export interface ProjectorOpts {
  pool: Pool;
  electrum: ElectrumClient;
  registry: RegistryEntry[];
  confirmations: number;
  network: 'mainnet' | 'chipnet';
  registryRefreshMs?: number;
}

const DEFAULT_REGISTRY_REFRESH_MS = 60_000;

interface Tip {
  height: number;
  hash: string;
  headerHex: string;
}

interface FamilyHandler {
  table: string;
  decode: (commitment: Buffer) => Record<string, unknown>;
}

const FAMILY_HANDLERS: Record<Family, FamilyHandler> = {
  VAULT: { table: 'vaults', decode: (b) => serializeBigInts(decodeVaultState(b)) },
  PROPOSAL: { table: 'proposals', decode: (b) => serializeBigInts(decodeProposalState(b)) },
  STREAM: { table: 'streams', decode: (b) => serializeBigInts(decodeScheduleState(b)) },
  PAYMENT: { table: 'payments', decode: (b) => serializeBigInts(decodeScheduleState(b)) },
  BUDGET: { table: 'budget_plans', decode: (b) => serializeBigInts(decodeScheduleState(b)) },
  AIRDROP: { table: 'airdrops', decode: (b) => serializeBigInts(decodeAirdropState(b)) },
  REWARD: { table: 'rewards', decode: (b) => serializeBigInts(decodeScheduleState(b)) },
  BOUNTY: { table: 'bounties', decode: (b) => serializeBigInts(decodeScheduleState(b)) },
  GRANT: { table: 'grants', decode: (b) => serializeBigInts(decodeScheduleState(b)) },
  GOVERNANCE_PROPOSAL: { table: 'governance_proposals', decode: (b) => serializeBigInts(decodeTallyState(b)) },
  VOTE_LOCK: { table: 'governance_votes', decode: (b) => serializeBigInts(decodeVoteState(b)) },
};

const REORG_KEEP = 100;
const RETRY_BACKOFF_MS = 500;

function serializeBigInts(state: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) {
    if (typeof v === 'bigint') out[k] = v.toString();
    else if (Buffer.isBuffer(v)) out[k] = v.toString('hex');
    else out[k] = v;
  }
  return out;
}

function commitmentBuffer(unspent: ElectrumUnspent): Buffer | null {
  const hex = unspent.token_data?.nft?.commitment;
  if (!hex) return null;
  return Buffer.from(hex, 'hex');
}

function parseHeader(hex: string): { prevHash: string; timestamp: number } {
  const bin = Buffer.from(hex, 'hex');
  if (bin.length < 80) {
    throw new Error(`invalid block header length ${bin.length}`);
  }
  const prevLE = bin.subarray(4, 36);
  const prevBE = Buffer.from(prevLE).reverse();
  const timestamp = bin.readUInt32LE(68);
  return { prevHash: prevBE.toString('hex'), timestamp };
}

export async function startProjector(opts: ProjectorOpts): Promise<() => Promise<void>> {
  const { pool, electrum, registry, confirmations } = opts;
  const log = (msg: string, ctx?: unknown): void => {
    if (ctx === undefined) console.log(`[projector] ${msg}`);
    else console.log(`[projector] ${msg}`, ctx);
  };

  const initialState = await getSyncState(pool);
  let tip: Tip = {
    height: initialState.lastHeight,
    hash: initialState.lastBlockHash,
    headerHex: '',
  };

  const addressBySh = new Map<string, RegistryEntry>();
  for (const entry of registry) {
    try {
      const sh = electrum.addressToScripthash(entry.address);
      addressBySh.set(sh, entry);
    } catch (err) {
      log('failed to derive scripthash, skipping', { address: entry.address, err: String(err) });
    }
  }

  const pending = new Map<string, Promise<void>>();
  let stopping = false;

  await electrum.subscribeHeaders((header) => {
    if (stopping) return;
    void onHeader(header.height, header.hex).catch((err) => {
      log('header handler error', { err: String(err) });
    });
  });

  async function subscribeOne(sh: string, entry: RegistryEntry): Promise<void> {
    await electrum.subscribeScripthash(sh, (_status) => {
      if (stopping) return;
      schedule(sh, entry);
    });
    schedule(sh, entry);
  }

  for (const [sh, entry] of addressBySh) {
    await subscribeOne(sh, entry);
  }

  async function refreshRegistry(): Promise<void> {
    if (stopping) return;
    let fresh: RegistryEntry[];
    try {
      fresh = await loadRegistry(pool);
    } catch (err) {
      log('registry refresh failed', { err: String(err) });
      return;
    }

    const freshBySh = new Map<string, RegistryEntry>();
    for (const entry of fresh) {
      try {
        freshBySh.set(electrum.addressToScripthash(entry.address), entry);
      } catch (err) {
        log('failed to derive scripthash on refresh, skipping', { address: entry.address, err: String(err) });
      }
    }

    const added: Array<[string, RegistryEntry]> = [];
    for (const [sh, entry] of freshBySh) {
      if (!addressBySh.has(sh)) added.push([sh, entry]);
    }
    const removed: string[] = [];
    for (const sh of addressBySh.keys()) {
      if (!freshBySh.has(sh)) removed.push(sh);
    }

    for (const sh of removed) {
      try {
        await electrum.unsubscribeScripthash(sh);
      } catch (err) {
        log('unsubscribe failed on refresh', { sh, err: String(err) });
      }
      addressBySh.delete(sh);
    }

    for (const [sh, entry] of added) {
      addressBySh.set(sh, entry);
      await subscribeOne(sh, entry);
    }

    if (added.length > 0 || removed.length > 0) {
      log('registry refreshed', { added: added.length, removed: removed.length, total: addressBySh.size });
    }
  }

  const refreshMs = opts.registryRefreshMs ?? DEFAULT_REGISTRY_REFRESH_MS;
  const refreshTimer: NodeJS.Timeout | null = refreshMs > 0
    ? setInterval(() => { void refreshRegistry(); }, refreshMs)
    : null;
  refreshTimer?.unref?.();

  function schedule(sh: string, entry: RegistryEntry): void {
    const prev = pending.get(sh) ?? Promise.resolve();
    const next = prev.then(() => projectAddress(sh, entry)).catch((err) => {
      log('projection failed', { address: entry.address, family: entry.family, err: String(err) });
    });
    pending.set(sh, next);
  }

  async function onHeader(height: number, headerHex: string): Promise<void> {
    const { prevHash } = parseHeader(headerHex);
    const hash = electrum.blockHash(headerHex);
    log('new tip', { height, hash });

    const recent = await collectRecentChain(height, headerHex, hash);
    const forkPoint = await findReorgPoint(pool, recent);
    if (forkPoint !== null) {
      log('reorg detected', { forkPoint });
      await handleReorg(forkPoint);
    }

    await pushRecentBlock(pool, height, hash, prevHash);
    await trimRecentBlocks(pool, REORG_KEEP);
    await updateCursor(pool, height, hash);
    await advanceSafe(pool, Math.max(0, height - confirmations));

    tip = { height, hash, headerHex };
  }

  async function collectRecentChain(
    tipHeight: number,
    tipHex: string,
    tipHash: string,
  ): Promise<RecentBlock[]> {
    const chain: RecentBlock[] = [];
    const tipHeader = parseHeader(tipHex);
    chain.push({ height: tipHeight, hash: tipHash, previousHash: tipHeader.prevHash });
    let walkHash = tipHeader.prevHash;
    for (let h = tipHeight - 1; h > tipHeight - 6 && h > 0; h -= 1) {
      try {
        const hex = await electrum.getHeader(h);
        const parsed = parseHeader(hex);
        chain.push({ height: h, hash: walkHash, previousHash: parsed.prevHash });
        walkHash = parsed.prevHash;
      } catch (err) {
        log('failed to fetch ancestor header', { height: h, err: String(err) });
        break;
      }
    }
    return chain;
  }

  async function handleReorg(forkPoint: number): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const handler of new Set(Object.values(FAMILY_HANDLERS).map((h) => h.table))) {
        await client.query(
          `UPDATE ${handler}
              SET is_spent = FALSE,
                  spent_txid = NULL,
                  spent_at_height = NULL
            WHERE spent_at_height >= $1`,
          [forkPoint],
        );
        await client.query(
          `UPDATE ${handler}
              SET utxo_txid = NULL,
                  utxo_vout = NULL,
                  block_height = NULL,
                  block_timestamp = NULL
            WHERE block_height >= $1`,
          [forkPoint],
        );
      }
      await client.query('DELETE FROM recent_blocks WHERE height >= $1', [forkPoint]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    for (const [sh, entry] of addressBySh) schedule(sh, entry);
  }

  async function projectAddress(sh: string, entry: RegistryEntry): Promise<void> {
    const handler = FAMILY_HANDLERS[entry.family];
    if (!handler) {
      log('no handler for family', { family: entry.family });
      return;
    }

    let unspent: ElectrumUnspent[];
    let history: ElectrumHistoryEntry[];
    try {
      unspent = await electrum.listUnspent(sh);
      history = await electrum.getHistory(sh);
    } catch (err) {
      log('fetch failed, will retry on next event', { address: entry.address, err: String(err) });
      await sleep(RETRY_BACKOFF_MS);
      return;
    }

    const live = unspent.find((u) => commitmentBuffer(u) !== null) ?? null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (live) {
        await upsertLiveUtxo(client, handler, entry, live);
      }
      await markSpentRows(client, handler, entry, unspent, history);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function upsertLiveUtxo(
    client: PoolClient,
    handler: FamilyHandler,
    entry: RegistryEntry,
    unspent: ElectrumUnspent,
  ): Promise<void> {
    const commitment = commitmentBuffer(unspent);
    if (!commitment) return;

    let decoded: Record<string, unknown> | { decode_pending: string };
    try {
      decoded = handler.decode(commitment);
    } catch (err) {
      decoded = { decode_pending: String(err) };
      log('decode pending, will store raw commitment', {
        address: entry.address,
        family: entry.family,
        err: String(err),
      });
    }

    const confirmationsForUtxo = unspent.height > 0 ? Math.max(0, tip.height - unspent.height + 1) : 0;
    if (confirmationsForUtxo < confirmations) {
      log('utxo below confirmation threshold, skipping', {
        address: entry.address,
        confirmations: confirmationsForUtxo,
      });
      return;
    }

    let blockTimestamp: number | null = null;
    if (unspent.height > 0) {
      try {
        const headerHex = await electrum.getHeader(unspent.height);
        blockTimestamp = parseHeader(headerHex).timestamp;
      } catch (err) {
        log('failed to fetch block header for utxo', { height: unspent.height, err: String(err) });
      }
    }

    await client.query(
      `UPDATE ${handler.table}
          SET utxo_txid = $1,
              utxo_vout = $2,
              nft_commitment = $3,
              block_height = $4,
              block_timestamp = $5,
              is_spent = FALSE,
              spent_txid = NULL,
              spent_at_height = NULL
        WHERE contract_address = $6`,
      [
        unspent.tx_hash,
        unspent.tx_pos,
        commitment.toString('hex'),
        unspent.height > 0 ? unspent.height : null,
        blockTimestamp,
        entry.address,
      ],
    );

    log('utxo upserted', {
      table: handler.table,
      address: entry.address.slice(0, 24),
      utxo: `${unspent.tx_hash}:${unspent.tx_pos}`,
      state: decoded,
    });
  }

  async function markSpentRows(
    client: PoolClient,
    handler: FamilyHandler,
    entry: RegistryEntry,
    unspent: ElectrumUnspent[],
    history: ElectrumHistoryEntry[],
  ): Promise<void> {
    const liveSet = new Set(unspent.map((u) => `${u.tx_hash}:${u.tx_pos}`));
    const existing = await client.query<{ utxo_txid: string; utxo_vout: number }>(
      `SELECT utxo_txid, utxo_vout
         FROM ${handler.table}
        WHERE contract_address = $1
          AND utxo_txid IS NOT NULL
          AND is_spent = FALSE`,
      [entry.address],
    );

    for (const row of existing.rows) {
      const key = `${row.utxo_txid}:${row.utxo_vout}`;
      if (liveSet.has(key)) continue;

      const spend = await findSpendingTx(row.utxo_txid, row.utxo_vout, history);
      if (!spend) continue;

      await client.query(
        `UPDATE ${handler.table}
            SET is_spent = TRUE,
                spent_txid = $1,
                spent_at_height = $2
          WHERE contract_address = $3
            AND utxo_txid = $4
            AND utxo_vout = $5`,
        [spend.tx_hash, spend.height > 0 ? spend.height : null, entry.address, row.utxo_txid, row.utxo_vout],
      );

      log('utxo spent', { table: handler.table, prev: key, spentBy: spend.tx_hash });
    }
  }

  async function findSpendingTx(
    prevTxid: string,
    prevVout: number,
    history: ElectrumHistoryEntry[],
  ): Promise<ElectrumHistoryEntry | null> {
    const ordered = [...history].sort((a, b) => (b.height || 0) - (a.height || 0));
    for (const entry of ordered) {
      try {
        const verbose = (await electrum.getTransaction(entry.tx_hash, true)) as {
          vin: { txid?: string; vout?: number }[];
        };
        const matches = verbose.vin.some((vin) => vin.txid === prevTxid && vin.vout === prevVout);
        if (matches) return entry;
      } catch (err) {
        log('failed to fetch tx during spend search', { txid: entry.tx_hash, err: String(err) });
      }
    }
    return null;
  }

  async function sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  log('projector started', { addresses: addressBySh.size, tipHeight: tip.height });

  return async function stop(): Promise<void> {
    stopping = true;
    if (refreshTimer) clearInterval(refreshTimer);
    for (const sh of addressBySh.keys()) {
      try {
        await electrum.unsubscribeScripthash(sh);
      } catch {
        // ignore
      }
    }
    await Promise.allSettled([...pending.values()]);
    log('projector stopped');
  };
}
