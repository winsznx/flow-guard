/**
 * Smoke test: backend follow-ups from the bug-fix sweep (internal/bugfix/requests.md).
 *
 * - proposal numbering and listing across both vault id forms, creator stored from
 *   the verified wallet, auth on create / approve-onchain / confirm-create
 * - confirm-create / confirm-approval accept a tx the broadcast route already
 *   recorded for the same proposal, and refuse one recorded for anything else
 * - DELETE /proposals/:id soft-deletes a request whose on-chain create never landed,
 *   and a later confirm-create brings it back
 * - creating a request needs a vault creator or signer
 * - treasury batch-create takes the sender from the verified wallet and needs a
 *   vault creator or signer
 * - stream, activity and batch-run lists without a party filter are viewer scoped
 * - budget plan controller addresses use the configured network prefix
 * - budget plan pause / confirm-pause / cancel / confirm-cancel need wallet auth and
 *   take the controller from the verified wallet, not x-user-address
 * - the genesis prep and recurring payment refill wallet prompts
 *
 * Mounts the real routers on a random local port against a THROWAWAY local Postgres
 * with postgres-schema.sql applied. Electrum calls are stubbed, so it makes no
 * network calls.
 *
 *   DATABASE_URL=postgres://postgres@127.0.0.1:55441/fg_followups PG_SSL_DISABLED=true \
 *     pnpm exec tsx test/bugfix-followups.smoke.ts
 *
 * Refuses to run unless DATABASE_URL points at localhost, because it deletes and
 * re-seeds the tables it touches.
 *
 * Exit code 0 on pass, non-zero on any assertion failure.
 */

import express from 'express';
import { readFileSync, readdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { ElectrumNetworkProvider, type Utxo } from 'cashscript';
import {
  binToHex,
  encodeCashAddress,
  encodeTransaction,
  hash160,
  hashTransaction,
  hexToBin,
  cashAddressToLockingBytecode,
} from '@bitauth/libauth';

const databaseUrl = process.env.DATABASE_URL ?? '';
if (!/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(databaseUrl)) {
  console.error('DATABASE_URL must point at a local throwaway Postgres (127.0.0.1 or localhost).');
  process.exit(2);
}
process.env.BCH_NETWORK = 'chipnet';

const utxosByAddress = new Map<string, Utxo[]>();
let utxoLookupFails = false;
ElectrumNetworkProvider.prototype.getUtxos = (async function getUtxos(address: string) {
  if (utxoLookupFails) throw new Error('electrum unavailable');
  return utxosByAddress.get(address) ?? [];
}) as typeof ElectrumNetworkProvider.prototype.getUtxos;
// Raw txs the stubbed chain knows about, keyed by txid.
const rawTxById = new Map<string, string>();
ElectrumNetworkProvider.prototype.getRawTransaction = (async function getRawTransaction(txid: string) {
  const hex = rawTxById.get(txid);
  if (!hex) throw new Error('No such mempool or blockchain transaction');
  return hex;
}) as typeof ElectrumNetworkProvider.prototype.getRawTransaction;
ElectrumNetworkProvider.prototype.sendRawTransaction = (async function sendRawTransaction(txHex: string) {
  const txid = hashTransaction(hexToBin(txHex));
  rawTxById.set(txid, txHex);
  return txid;
}) as typeof ElectrumNetworkProvider.prototype.sendRawTransaction;
ElectrumNetworkProvider.prototype.performRequest = (async () => []) as unknown as typeof ElectrumNetworkProvider.prototype.performRequest;
ElectrumNetworkProvider.prototype.disconnect = (async () => true) as unknown as typeof ElectrumNetworkProvider.prototype.disconnect;

const { pool } = await import('../src/database/pg.js');
const { issueBearer } = await import('../src/middleware/auth.js');
const { default: budgetPlansRouter } = await import('../src/api/budgetPlans.js');
const { default: streamsRouter } = await import('../src/api/streams.js');
const { default: proposalsRouter } = await import('../src/api/proposals.js');
const { default: transactionsRouter } = await import('../src/api/transactions.js');
const { checkAndPrepareGenesisUtxo } = await import('../src/utils/genesisPrep.js');

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail: unknown = ''): void {
  console.log(condition ? 'PASS' : 'FAIL', name, condition ? '' : JSON.stringify(detail));
  if (condition) pass++;
  else fail++;
}

const hashFor = (byte: number) => new Uint8Array(20).fill(byte);
const addressFor = (byte: number, prefix: 'bchtest' | 'bitcoincash' = 'bchtest') =>
  encodeCashAddress({ prefix, type: 'p2pkh', payload: hashFor(byte) }).address;

const CREATOR = addressFor(0x11);
const SIGNER = addressFor(0x12);
const OUTSIDER = addressFor(0x13);
const OTHER_SENDER = addressFor(0x14);
const RECIPIENT = addressFor(0x15);
const VAULT_DB_ID = '11111111-2222-4333-8444-555555555555';
const VAULT_LOGICAL_ID = 'vault_1700000000000_abc123xyz';
const LEGACY_PROPOSAL = '20000000-0000-4000-8000-000000000001';
const DB_PROPOSAL = '20000000-0000-4000-8000-000000000002';
const ON_CHAIN_PROPOSAL = '20000000-0000-4000-8000-000000000003';
const RECORDED_TX = 'ab'.repeat(32);
const PROPOSAL_COVENANT = 'bchtest:pproposalcovenant';
const p2shFor = (byte: number) => encodeCashAddress({ prefix: 'bchtest', type: 'p2sh', payload: hashFor(byte) }).address;
const LIFECYCLE_COVENANT = p2shFor(0x31);
const REVIVED_COVENANT = p2shFor(0x32);
const OTHER_COVENANT = p2shFor(0x33);
// The approver's address is the hash of a real pubkey, so the approval tx can push it.
const APPROVER_PUBKEY = hexToBin('02' + 'ee'.repeat(32));
const APPROVER = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: hash160(APPROVER_PUBKEY) }).address;

/** A tx paying a covenant its mutable state NFT; `pushPubkey` adds the approve() pubkey push. */
function covenantTxHex(covenant: string, nonce: number, pushPubkey?: Uint8Array): string {
  const locking = cashAddressToLockingBytecode(covenant);
  if (typeof locking === 'string') throw new Error(locking);
  return binToHex(encodeTransaction({
    version: 2,
    locktime: 0,
    inputs: [{
      outpointTransactionHash: new Uint8Array(32).fill(nonce),
      outpointIndex: 0,
      sequenceNumber: 0xffffffff,
      unlockingBytecode: pushPubkey ? Uint8Array.from([0x21, ...pushPubkey]) : new Uint8Array(),
    }],
    outputs: [{
      lockingBytecode: locking.bytecode,
      valueSatoshis: 1000n,
      token: {
        category: new Uint8Array(32).fill(0x44),
        amount: 0n,
        nft: { capability: 'mutable', commitment: new Uint8Array(40).fill(nonce) },
      },
    }],
  }));
}
/** Puts a tx on the stubbed chain without going through /transactions/broadcast. */
function onChain(txHex: string): string {
  const txid = hashTransaction(hexToBin(txHex));
  rawTxById.set(txid, txHex);
  return txid;
}
const BUDGET_PLAN_ID = '30000000-0000-4000-8000-000000000001';
const now = Math.floor(Date.now() / 1000);

async function seed(): Promise<void> {
  await pool.query(`TRUNCATE vaults, proposals, transactions, streams, stream_batches, activity_events, budget_plans`);
  await pool.query(
    `INSERT INTO vaults (id, vault_id, creator, total_deposit, spending_cap, approval_threshold, signers,
       signer_pubkeys, state, cycle_duration, unlock_amount, is_public)
     VALUES ($1, $2, $3, 1, 0, 2, $4, $5, 0, 0, 0, 1)`,
    [
      VAULT_DB_ID,
      VAULT_LOGICAL_ID,
      CREATOR,
      JSON.stringify([CREATOR, SIGNER, addressFor(0x16)]),
      JSON.stringify(['02' + 'aa'.repeat(32), '02' + 'bb'.repeat(32), '02' + 'cc'.repeat(32)]),
    ],
  );
  // One legacy row under the logical id, one under vaults.id: the split history that
  // used to block new requests with PROPOSAL_VAULT_ID_SPLIT.
  await pool.query(
    `INSERT INTO proposals (id, vault_id, proposal_id, recipient, amount, reason, status, approval_count, approvals, created_at, tx_hash, contract_address)
     VALUES
       ($1, $2, 1, $5, 0.001, 'legacy', 'pending', 0, '[]', NOW() - INTERVAL '3 days', NULL, NULL),
       ($3, $4, 2, $5, 0.001, 'db id', 'pending', 0, '[]', NOW() - INTERVAL '2 days', NULL, NULL),
       ($6, $4, 0, $5, 0.001, 'on chain', 'pending', 0, '[]', NOW() - INTERVAL '1 day', $7, $8)`,
    [LEGACY_PROPOSAL, VAULT_LOGICAL_ID, DB_PROPOSAL, VAULT_DB_ID, RECIPIENT, ON_CHAIN_PROPOSAL, 'cd'.repeat(32), PROPOSAL_COVENANT],
  );
  await pool.query(`UPDATE proposals SET creator = $1 WHERE id = $2`, [CREATOR, ON_CHAIN_PROPOSAL]);
  await pool.query(
    `INSERT INTO transactions (id, tx_hash, tx_type, status) VALUES ('t1', $1, 'proposal', 'confirmed')`,
    [RECORDED_TX],
  );

  const streams: Array<[string, string, string | null, string, string | null]> = [
    // id, sender, vault_id, recipient, launch_source
    ['s-own', CREATOR, null, RECIPIENT, 'dao'],
    ['s-vault', OTHER_SENDER, VAULT_LOGICAL_ID, RECIPIENT, 'dao'],
    ['s-foreign', OTHER_SENDER, null, RECIPIENT, 'dao'],
    ['s-received', OTHER_SENDER, null, CREATOR, null],
  ];
  for (const [id, sender, vaultId, recipient, source] of streams) {
    await pool.query(
      `INSERT INTO streams (id, stream_id, vault_id, sender, recipient, token_type, total_amount, withdrawn_amount,
         stream_type, start_time, end_time, status, launch_source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'BCH', 1, 0, 'LINEAR', $6, $7, 'ACTIVE', $8, $6, $6)`,
      [id, `#FG-BCH-${id}`, vaultId, sender, recipient, now, now + 86_400, source],
    );
    await pool.query(
      `INSERT INTO activity_events (id, entity_type, entity_id, event_type, actor, created_at)
       VALUES ($1, 'stream', $2, 'created', $3, $4)`,
      [`e-${id}`, id, sender, now],
    );
  }
  const batches: Array<[string, string, string | null]> = [
    ['b-own', CREATOR, null],
    ['b-vault', OTHER_SENDER, VAULT_LOGICAL_ID],
    ['b-foreign', OTHER_SENDER, null],
  ];
  for (const [id, sender, vaultId] of batches) {
    await pool.query(
      `INSERT INTO stream_batches (id, vault_id, sender, stream_count, total_amount, status, launch_source, created_at, updated_at)
       VALUES ($1, $2, $3, 0, 0, 'ACTIVE', 'dao', $4, $4)`,
      [id, vaultId, sender, now],
    );
  }

  await pool.query(
    `INSERT INTO budget_plans (id, creator, recipient, total_amount, total_milestones, status, contract_address, constructor_params)
     VALUES ($1, $2, $3, 1, 1, 'ACTIVE', 'bchtest:pbudget', $4)`,
    [
      BUDGET_PLAN_ID,
      CREATOR,
      RECIPIENT,
      JSON.stringify([{ type: 'bytes', value: '00'.repeat(32) }, { type: 'bytes', value: binToHex(hashFor(0x11)) }]),
    ],
  );
}

const app = express();
app.use(express.json());
app.use('/api', budgetPlansRouter);
app.use('/api', streamsRouter);
app.use('/api', proposalsRouter);
app.use('/api', transactionsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', () => resolve()));
const { port } = server.address() as AddressInfo;
const base = `http://127.0.0.1:${port}/api`;

function bearerFor(address: string, keyByte: string): Record<string, string> {
  const { token } = issueBearer({
    address,
    pubkeyHex: '02' + keyByte.repeat(32),
    pubkeyHash: keyByte.repeat(20),
    authenticatedAt: Date.now(),
  });
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
const asCreator = bearerFor(CREATOR, 'aa');
const asSigner = bearerFor(SIGNER, 'bb');
const asOutsider = bearerFor(OUTSIDER, 'dd');

async function call(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
  // Responses come in several shapes and the checks read their fields directly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: { raw: text } };
  }
}

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await pool.query(sql, params)).rows[0] as T | undefined;
}

const proposalBody = { recipient: RECIPIENT, amount: 0.001, reason: 'follow-up', vaultId: 'vault_spoofed', creator: OUTSIDER };

try {
  await seed();

  // --- proposals: auth, numbering, listing --------------------------------------
  {
    const res = await call('POST', `/vaults/${VAULT_LOGICAL_ID}/proposals`, { 'x-user-address': CREATOR }, proposalBody);
    check('POST /vaults/:id/proposals with only the spoofable header → 401', res.status === 401, res);
  }
  let createdId = '';
  {
    const res = await call('POST', `/vaults/${VAULT_LOGICAL_ID}/proposals`, { ...asCreator, 'x-user-address': OUTSIDER }, proposalBody);
    createdId = res.body.id;
    const row = await one<{ vault_id: string; proposal_id: number; creator: string }>(
      'SELECT vault_id, proposal_id, creator FROM proposals WHERE id = $1', [createdId],
    );
    check('POST /vaults/:id/proposals on a split vault → 201', res.status === 201, res);
    check('split vault numbers past both id forms (3)', row?.proposal_id === 3, row);
    check('new proposal stored under vaults.id', row?.vault_id === VAULT_DB_ID, row);
    check('creator comes from the verified wallet, not the header or body', row?.creator === CREATOR, row);
    const vault = await one<{ state: number }>('SELECT state FROM vaults WHERE id = $1', [VAULT_DB_ID]);
    check('creating a request leaves the vault spending-period flags alone', vault?.state === 0, vault);
  }
  for (const id of [VAULT_DB_ID, VAULT_LOGICAL_ID]) {
    const res = await call('GET', `/vaults/${id}/proposals`);
    const ids = Array.isArray(res.body) ? res.body.map((p: { id: string }) => p.id) : [];
    check(
      `GET /vaults/${id === VAULT_DB_ID ? ':dbId' : ':logicalId'}/proposals → both id forms, newest first`,
      ids.join(',') === [createdId, ON_CHAIN_PROPOSAL, DB_PROPOSAL, LEGACY_PROPOSAL].join(','),
      ids,
    );
  }

  // --- approve-onchain / confirm-create ----------------------------------------
  {
    const res = await call('POST', `/proposals/${DB_PROPOSAL}/approve-onchain`, { 'x-user-address': SIGNER });
    check('POST /proposals/:id/approve-onchain with only the header → 401', res.status === 401, res);
  }
  {
    const res = await call('POST', `/proposals/${ON_CHAIN_PROPOSAL}/confirm-create`, { 'x-user-address': CREATOR }, { txHash: RECORDED_TX });
    check('POST /proposals/:id/confirm-create with only the header → 401', res.status === 401, res);
  }
  {
    const res = await call('POST', `/proposals/${ON_CHAIN_PROPOSAL}/confirm-create`, asCreator, { txHash: RECORDED_TX });
    const row = await one<{ tx_hash: string }>('SELECT tx_hash FROM proposals WHERE id = $1', [ON_CHAIN_PROPOSAL]);
    check('confirm-create with a different hash on a confirmed request → 409 PROPOSAL_ALREADY_CONFIRMED', res.status === 409 && res.body.errorCode === 'PROPOSAL_ALREADY_CONFIRMED', res);
    check('confirm-create with a different hash → proposal tx_hash unchanged', row?.tx_hash === 'cd'.repeat(32), row);
  }

  // --- DELETE /proposals/:id ---------------------------------------------------------
  {
    const res = await call('DELETE', `/proposals/${createdId}`, { 'x-user-address': CREATOR });
    check('DELETE /proposals/:id without auth → 401', res.status === 401, res);
  }
  {
    const res = await call('DELETE', `/proposals/${createdId}`, asSigner);
    check('DELETE /proposals/:id by another signer → 403 NOT_PROPOSAL_CREATOR', res.status === 403 && res.body.errorCode === 'NOT_PROPOSAL_CREATOR', res);
  }
  {
    const res = await call('DELETE', `/proposals/${LEGACY_PROPOSAL}`, asCreator);
    check('DELETE /proposals/:id on a row with no stored creator → 403', res.status === 403, res);
  }
  {
    const res = await call('DELETE', `/proposals/${ON_CHAIN_PROPOSAL}`, asCreator);
    check('DELETE /proposals/:id after confirm-create → 409 PROPOSAL_ON_CHAIN', res.status === 409 && res.body.errorCode === 'PROPOSAL_ON_CHAIN', res);
  }
  {
    await pool.query(
      'UPDATE proposals SET contract_address = $1, constructor_params = $2 WHERE id = $3',
      [PROPOSAL_COVENANT, '[{"type":"bytes","value":"00"}]', createdId],
    );
    utxosByAddress.set(PROPOSAL_COVENANT, [{ txid: 'ef'.repeat(32), vout: 0, satoshis: 2000n }]);
    const funded = await call('DELETE', `/proposals/${createdId}`, asCreator);
    check('DELETE /proposals/:id with coins at the covenant → 409', funded.status === 409 && funded.body.errorCode === 'PROPOSAL_ON_CHAIN', funded);
    utxosByAddress.delete(PROPOSAL_COVENANT);

    utxoLookupFails = true;
    const offline = await call('DELETE', `/proposals/${createdId}`, asCreator);
    utxoLookupFails = false;
    check('DELETE /proposals/:id when the chain read fails → 503 retryable', offline.status === 503 && offline.body.retryable === true, offline);
    const stillThere = await one('SELECT id FROM proposals WHERE id = $1', [createdId]);
    check('DELETE /proposals/:id refusals leave the row', Boolean(stillThere));

    const res = await call('DELETE', `/proposals/${createdId}`, asCreator);
    const kept = await one<{ status: string; contract_address: string; constructor_params: string }>(
      'SELECT status, contract_address, constructor_params FROM proposals WHERE id = $1', [createdId],
    );
    const vault = await one<{ state: number }>('SELECT state FROM vaults WHERE id = $1', [VAULT_DB_ID]);
    check('DELETE /proposals/:id by the creator, unfunded covenant → 200', res.status === 200 && res.body.success === true, res);
    check(
      'abandoned row is kept as abandoned with its covenant params',
      kept?.status === 'abandoned' && kept.contract_address === PROPOSAL_COVENANT && Boolean(kept.constructor_params),
      kept,
    );
    check('abandoning a request leaves the vault spending-period flags alone', vault?.state === 0, vault);

    const again = await call('DELETE', `/proposals/${createdId}`, asCreator);
    check('DELETE /proposals/:id on an abandoned row → 200, no-op', again.status === 200 && again.body.success === true, again);

    const listed = await call('GET', `/vaults/${VAULT_DB_ID}/proposals`);
    const listedIds = Array.isArray(listed.body) ? listed.body.map((p: { id: string }) => p.id) : [];
    check('abandoned row is left out of the vault listing', !listedIds.includes(createdId), listedIds);
    const all = await call('GET', '/proposals');
    const allIds = Array.isArray(all.body?.proposals) ? all.body.proposals.map((p: { id: string }) => p.id) : [];
    check('abandoned row is left out of GET /proposals', allIds.length > 0 && !allIds.includes(createdId), allIds);
  }
  let lifecycleId = '';
  {
    const res = await call('POST', `/vaults/${VAULT_DB_ID}/proposals`, asCreator, proposalBody);
    lifecycleId = res.body.id;
    check('after abandoning, the next request gets a fresh number (4)', res.status === 201 && res.body.proposalId === 4, res.body);
  }
  {
    const before = await one<{ count: number }>('SELECT COUNT(*)::int AS count FROM proposals');
    const res = await call('POST', `/vaults/${VAULT_DB_ID}/proposals`, asOutsider, proposalBody);
    const after = await one<{ count: number }>('SELECT COUNT(*)::int AS count FROM proposals');
    check('POST /vaults/:id/proposals by a non-member → 403 NOT_VAULT_MEMBER', res.status === 403 && res.body.errorCode === 'NOT_VAULT_MEMBER', res);
    check('POST /vaults/:id/proposals by a non-member → no row written', before?.count === after?.count, { before, after });
  }

  // --- the real frontend flow: broadcast records the tx, then confirm ---------------
  {
    await pool.query('UPDATE proposals SET contract_address = $1 WHERE id = $2', [LIFECYCLE_COVENANT, lifecycleId]);
    await pool.query(
      `UPDATE vaults SET signers = $1 WHERE id = $2`,
      [JSON.stringify([CREATOR, SIGNER, APPROVER]), VAULT_DB_ID],
    );

    const createHex = covenantTxHex(LIFECYCLE_COVENANT, 0x51);
    const broadcast = await call('POST', '/transactions/broadcast', {}, {
      txHex: createHex, txType: 'proposal', vaultId: VAULT_DB_ID, proposalId: lifecycleId, fromAddress: CREATOR,
    });
    const createTxid = broadcast.body.txid as string;
    check('broadcast with txType proposal records the tx', broadcast.status === 200 && Boolean(
      await one('SELECT id FROM transactions WHERE tx_hash = $1 AND proposal_id = $2', [createTxid, lifecycleId]),
    ), broadcast);

    const confirmed = await call('POST', `/proposals/${lifecycleId}/confirm-create`, asCreator, { txHash: createTxid });
    const row = await one<{ tx_hash: string; status: string }>('SELECT tx_hash, status FROM proposals WHERE id = $1', [lifecycleId]);
    const txRows = await one<{ count: number }>('SELECT COUNT(*)::int AS count FROM transactions WHERE tx_hash = $1', [createTxid]);
    check('confirm-create after broadcast recorded it → 200', confirmed.status === 200 && confirmed.body.success === true, confirmed);
    check('confirm-create after broadcast → proposal tx_hash set', row?.tx_hash === createTxid && row.status === 'pending', row);
    check('confirm-create after broadcast → one transactions row', txRows?.count === 1, txRows);

    const retried = await call('POST', `/proposals/${lifecycleId}/confirm-create`, asCreator, { txHash: createTxid });
    check('confirm-create retried with the same hash → 200', retried.status === 200, retried);

    await pool.query('UPDATE proposals SET contract_address = $1 WHERE id = $2', [OTHER_COVENANT, DB_PROPOSAL]);
    const crossed = await call('POST', `/proposals/${DB_PROPOSAL}/confirm-create`, asCreator, { txHash: createTxid });
    const other = await one<{ tx_hash: string | null }>('SELECT tx_hash FROM proposals WHERE id = $1', [DB_PROPOSAL]);
    check('confirm-create with a tx recorded for another proposal → 409 TX_ALREADY_RECORDED', crossed.status === 409 && crossed.body.errorCode === 'TX_ALREADY_RECORDED', crossed);
    check('confirm-create with a tx recorded for another proposal → tx_hash untouched', other?.tx_hash === null, other);

    const asApprover = bearerFor(APPROVER, 'ee');
    const createAsApproval = await call('POST', `/proposals/${lifecycleId}/confirm-approval`, asApprover, { txHash: createTxid });
    check('confirm-approval with the create tx → 409 TX_ALREADY_RECORDED', createAsApproval.status === 409 && createAsApproval.body.errorCode === 'TX_ALREADY_RECORDED', createAsApproval);

    const approveHex = covenantTxHex(LIFECYCLE_COVENANT, 0x52, APPROVER_PUBKEY);
    const approveBroadcast = await call('POST', '/transactions/broadcast', {}, {
      txHex: approveHex, txType: 'approve', vaultId: VAULT_DB_ID, proposalId: lifecycleId, fromAddress: APPROVER,
    });
    const approveTxid = approveBroadcast.body.txid as string;
    const approved = await call('POST', `/proposals/${lifecycleId}/confirm-approval`, asApprover, { txHash: approveTxid });
    const approvedRow = await one<{ approval_count: number; approvals: string }>(
      'SELECT approval_count, approvals FROM proposals WHERE id = $1', [lifecycleId],
    );
    const approveTxRows = await one<{ count: number }>('SELECT COUNT(*)::int AS count FROM transactions WHERE tx_hash = $1', [approveTxid]);
    check('confirm-approval after broadcast recorded it → 200', approved.status === 200 && approved.body.success === true, approved);
    check('confirm-approval after broadcast → approval recorded', approvedRow?.approval_count === 1 && JSON.parse(approvedRow.approvals)[0] === APPROVER, approvedRow);
    check('confirm-approval after broadcast → one transactions row', approveTxRows?.count === 1, approveTxRows);
  }
  {
    // The create tx of an abandoned request lands after all: confirm brings it back.
    await pool.query('UPDATE proposals SET contract_address = $1 WHERE id = $2', [REVIVED_COVENANT, createdId]);
    const lateTxid = onChain(covenantTxHex(REVIVED_COVENANT, 0x53));
    const res = await call('POST', `/proposals/${createdId}/confirm-create`, asCreator, { txHash: lateTxid });
    const row = await one<{ status: string; tx_hash: string }>('SELECT status, tx_hash FROM proposals WHERE id = $1', [createdId]);
    const vault = await one<{ state: number }>('SELECT state FROM vaults WHERE id = $1', [VAULT_DB_ID]);
    check('confirm-create on an abandoned request whose tx landed → 200', res.status === 200, res);
    check('revived request is pending with its tx_hash', row?.status === 'pending' && row.tx_hash === lateTxid, row);
    check('reviving a request leaves the vault spending-period flags alone', vault?.state === 0, vault);
    check('revived request tx is recorded', Boolean(await one('SELECT id FROM transactions WHERE tx_hash = $1', [lateTxid])));
  }
  {
    const source = readFileSync(new URL('../src/api/proposals.ts', import.meta.url), 'utf8');
    check('proposal routes read the network through resolveBchNetwork only', !source.includes('process.env.BCH_NETWORK'));
  }

  // --- treasury batch-create ------------------------------------------------------------
  const batchBody = {
    senderAddress: OUTSIDER,
    tokenType: 'BCH',
    entries: [{ recipient: RECIPIENT, totalAmount: 0.01, streamType: 'LINEAR', startTime: now + 3600, endTime: now + 86_400 * 30 }],
  };
  {
    const res = await call('POST', `/treasuries/${VAULT_LOGICAL_ID}/batch-create`, {}, batchBody);
    check('batch-create without auth → 401', res.status === 401, res);
  }
  {
    const before = await one<{ count: number }>('SELECT COUNT(*)::int AS count FROM stream_batches');
    const res = await call('POST', `/treasuries/${VAULT_LOGICAL_ID}/batch-create`, asOutsider, batchBody);
    const after = await one<{ count: number }>('SELECT COUNT(*)::int AS count FROM stream_batches');
    check('batch-create by a non-member → 403', res.status === 403, res);
    check('batch-create by a non-member → no batch written', before?.count === after?.count, { before, after });
  }
  {
    const res = await call('POST', `/treasuries/vault_0_missing/batch-create`, asSigner, batchBody);
    check('batch-create for an unknown vault → 404', res.status === 404, res);
  }
  {
    // Funding can't be built with no sender UTXOs, so the route fails after writing
    // the pending batch. What matters here is whose name the batch went in under.
    const res = await call('POST', `/treasuries/${VAULT_LOGICAL_ID}/batch-create`, asSigner, batchBody);
    const batch = await one<{ sender: string }>(
      `SELECT sender FROM stream_batches WHERE id NOT IN ('b-own', 'b-vault', 'b-foreign') ORDER BY created_at DESC LIMIT 1`,
    );
    check('batch-create by a signer → passes the membership check', res.status !== 403 && res.status !== 401, res);
    check('batch-create sender is the verified wallet, not body senderAddress', batch?.sender === SIGNER, batch);
    await pool.query(`DELETE FROM streams WHERE batch_id NOT IN ('b-own', 'b-vault', 'b-foreign') AND batch_id IS NOT NULL`);
    await pool.query(`DELETE FROM activity_events WHERE entity_id NOT LIKE 's-%'`);
    await pool.query(`DELETE FROM stream_batches WHERE id NOT IN ('b-own', 'b-vault', 'b-foreign')`);
  }

  // --- viewer-scoped lists ---------------------------------------------------------------
  const ids = (rows: Array<{ id: string }> | undefined) => (rows ?? []).map((row) => row.id).sort().join(',');
  {
    const res = await call('GET', '/streams?contextSource=dao');
    check('GET /streams?contextSource signed out → public vault streams only', res.status === 200 && ids(res.body.streams) === 's-vault', ids(res.body.streams));
  }
  {
    const res = await call('GET', `/streams?contextSource=dao&viewer=${CREATOR}`);
    check('GET /streams?contextSource&viewer signed out → the viewer param is not trusted', ids(res.body.streams) === 's-vault', ids(res.body.streams));
  }
  {
    const res = await call('GET', '/streams?contextSource=dao', asCreator);
    check('GET /streams?contextSource signed in → own and vault streams only', ids(res.body.streams) === 's-own,s-vault', ids(res.body.streams));
  }
  {
    const res = await call('GET', '/streams?contextSource=dao', { 'x-user-address': SIGNER });
    check('GET /streams?contextSource with x-user-address alone → public vault streams only', ids(res.body.streams) === 's-vault', ids(res.body.streams));
  }
  {
    const res = await call('GET', '/streams?treasury=true', asCreator);
    check('GET /streams?treasury signed in → vault streams only', ids(res.body.streams) === 's-vault', ids(res.body.streams));
  }
  {
    const res = await call('GET', `/streams?address=${OTHER_SENDER}`);
    check('GET /streams?address → public party filter unchanged', ids(res.body.streams) === 's-foreign,s-received,s-vault', ids(res.body.streams));
  }
  {
    const res = await call('GET', '/streams/activity');
    const streams = (res.body.events ?? []).map((event: { entity_id: string }) => event.entity_id).sort().join(',');
    check('GET /streams/activity signed out → public vault streams only', res.status === 200 && streams === 's-vault', streams);
  }
  {
    const res = await call('GET', `/streams/activity?viewer=${CREATOR}`);
    const streams = (res.body.events ?? []).map((event: { entity_id: string }) => event.entity_id).sort().join(',');
    check('GET /streams/activity?viewer signed out → the viewer param is not trusted', streams === 's-vault', streams);
  }
  {
    const res = await call('GET', '/streams/activity', asCreator);
    const streams = (res.body.events ?? []).map((event: { entity_id: string }) => event.entity_id).sort().join(',');
    check('GET /streams/activity signed in → own, received and vault streams', streams === 's-own,s-received,s-vault', streams);
  }
  {
    const res = await call('GET', `/streams/activity?vaultId=${VAULT_LOGICAL_ID}`);
    check('GET /streams/activity?vaultId → unchanged', res.body.total === 1, res.body);
  }
  {
    const res = await call('GET', '/streams/batch-runs');
    check('GET /streams/batch-runs signed out → public vault batches only', res.status === 200 && ids(res.body.batches) === 'b-vault', ids(res.body.batches));
  }
  {
    const res = await call('GET', '/streams/batch-runs?status=ACTIVE&contextSource=dao', asCreator);
    check('GET /streams/batch-runs signed in → own and vault batches', ids(res.body.batches) === 'b-own,b-vault', ids(res.body.batches));
  }
  {
    const res = await call('GET', '/streams/batch-runs?treasury=true', asOutsider);
    check('GET /streams/batch-runs?treasury for a non-member → empty', res.body.total === 0, res.body);
  }
  {
    const res = await call('GET', `/streams/batch-runs?sender=${OTHER_SENDER}`);
    check('GET /streams/batch-runs?sender → public party filter unchanged', ids(res.body.batches) === 'b-foreign,b-vault', ids(res.body.batches));
  }

  // --- network prefix -------------------------------------------------------------------
  {
    const chipnet = await call('GET', `/budget-plans/${BUDGET_PLAN_ID}`);
    check('budget plan controller on chipnet → bchtest:', chipnet.body.plan?.controllerAddress === CREATOR, chipnet.body.plan?.controllerAddress);
    process.env.BCH_NETWORK = 'mainnet';
    const mainnet = await call('GET', `/budget-plans/${BUDGET_PLAN_ID}`);
    const pause = await call('POST', `/budget-plans/${BUDGET_PLAN_ID}/pause`, bearerFor(addressFor(0x11, 'bitcoincash'), '11'));
    process.env.BCH_NETWORK = 'chipnet';
    check('budget plan controller on mainnet → bitcoincash:', mainnet.body.plan?.controllerAddress === addressFor(0x11, 'bitcoincash'), mainnet.body.plan?.controllerAddress);
    check('budget plan pause by the mainnet controller → not 403', pause.status !== 403, pause);
  }
  // --- budget plan control auth ------------------------------------------------------------
  const budgetControlTx = onChain(covenantTxHex(OTHER_COVENANT, 0x51));
  for (const action of ['pause', 'confirm-pause', 'cancel', 'confirm-cancel']) {
    const path = `/budget-plans/${BUDGET_PLAN_ID}/${action}`;
    const spoofed = await call('POST', path, { 'x-user-address': CREATOR }, { txHash: budgetControlTx });
    check(`POST ${action} with only the spoofable header → 401`, spoofed.status === 401, spoofed);
    const outsider = await call('POST', path, { ...asOutsider, 'x-user-address': CREATOR }, { txHash: budgetControlTx });
    check(`POST ${action} by a verified non-controller sending the controller header → 403`, outsider.status === 403, outsider);
  }
  {
    const controllerPause = await call('POST', `/budget-plans/${BUDGET_PLAN_ID}/pause`, { ...asCreator, 'x-user-address': OUTSIDER });
    check('POST pause by the verified controller ignores the header → not 401/403',
      controllerPause.status !== 401 && controllerPause.status !== 403, controllerPause);
  }
  {
    const apiDir = new URL('../src/api/', import.meta.url);
    const hardcoded = readdirSync(apiDir)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => /prefix:\s*'bchtest'/.test(readFileSync(new URL(file, apiDir), 'utf8')));
    check('no route file hardcodes the bchtest prefix', hardcoded.length === 0, hardcoded);
  }

  // --- wallet prompts ---------------------------------------------------------------------
  {
    const provider = {
      getUtxos: async () => [{ txid: '12'.repeat(32), vout: 1, satoshis: 10_000n }],
    } as unknown as ElectrumNetworkProvider;
    const prep = await checkAndPrepareGenesisUtxo(provider, CREATOR);
    check(
      'genesis prep prompt',
      prep.wcTransaction?.userPrompt === 'Get your wallet ready to fund. This sends BCH back to your own wallet.',
      prep.wcTransaction?.userPrompt,
    );
    const paymentControl = readFileSync(new URL('../src/services/PaymentControlService.ts', import.meta.url), 'utf8');
    check(
      'recurring payment refill prompt',
      paymentControl.includes("userPrompt: 'Add funds to this recurring payment'")
        && !paymentControl.includes("'Add funds to this stream'")
        && !paymentControl.includes('Refill recurring stream runway'),
    );
  }
} finally {
  server.close();
  await pool.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
