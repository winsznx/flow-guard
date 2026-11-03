/**
 * Smoke test: vault, proposal and transaction routes resolve to the handler the
 * frontend expects.
 *
 * proposalsRouter is mounted at /api, so its proposal-scoped paths must carry the
 * /proposals prefix themselves, /transactions/pending must win over
 * /transactions/:txHash, and vault routes must accept the logical vault_<ts>_<b36>
 * id that explorer and stream pages link to. The routers are mounted in the same
 * order as src/index.ts on a random local port, with `pool.query` stubbed to return
 * fixture rows.
 *
 * NO network, NO database. Runs as a standalone Node script via tsx:
 *
 *   pnpm --filter @flowguard/backend exec tsx test/treasury-routes.smoke.ts
 *
 * Exit code 0 on pass, non-zero on any assertion failure.
 */

import express from 'express';
import type { AddressInfo } from 'node:net';

process.env.DATABASE_URL ??= 'postgres://stub:stub@127.0.0.1:1/stub';

const { pool } = await import('../src/database/pg.js');
const { issueBearer } = await import('../src/middleware/auth.js');
const { default: vaultsRouter } = await import('../src/api/vaults.js');
const { default: budgetPlansRouter } = await import('../src/api/budgetPlans.js');
const { default: transactionsRouter } = await import('../src/api/transactions.js');
const { default: governanceRouter } = await import('../src/api/governance.js');
const { default: proposalsRouter, txPushesPubkeyForAddress } = await import('../src/api/proposals.js');
const { encodeTransaction, hash160, hexToBin, binToHex, lockingBytecodeToCashAddress } = await import('@bitauth/libauth');

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean): void {
  console.log(condition ? 'PASS' : 'FAIL', name);
  if (condition) pass++;
  else fail++;
}

const VAULT_DB_ID = '11111111-2222-4333-8444-555555555555';
const VAULT_LOGICAL_ID = 'vault_1700000000000_abc123xyz';
const MISSING_VAULT_ID = 'vault_0_missing';
const PROPOSAL_ID = '66666666-7777-4888-9999-000000000000';
const CREATOR = 'bchtest:qcreator';

function vaultRow(): Record<string, unknown> {
  return {
    id: VAULT_DB_ID,
    vault_id: VAULT_LOGICAL_ID,
    name: 'fixture',
    creator: CREATOR,
    total_deposit: 1,
    spending_cap: 1,
    approval_threshold: 2,
    signers: JSON.stringify([CREATOR, 'bchtest:qsigner2', 'bchtest:qsigner3']),
    signer_pubkeys: JSON.stringify(['02' + 'aa'.repeat(32), '02' + 'bb'.repeat(32), '02' + 'cc'.repeat(32)]),
    state: 0,
    cycle_duration: 0,
    unlock_amount: 0,
    is_public: true,
    contract_address: 'bchtest:pcontract',
    balance: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function proposalRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PROPOSAL_ID,
    vault_id: VAULT_DB_ID,
    proposal_id: 1,
    recipient: 'bchtest:qrecipient',
    amount: 0.001,
    reason: 'private reason',
    status: 'pending',
    approval_count: 1,
    approvals: JSON.stringify([CREATOR]),
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    executed_at: null,
    tx_hash: 'cd'.repeat(32),
    contract_address: 'bchtest:pproposal',
    ...overrides,
  };
}

const queries: Array<{ sql: string; params: unknown[] }> = [];
let fixtureRows: ((sql: string, params: unknown[]) => Record<string, unknown>[] | undefined) | null = null;

pool.query = (async (sql: string, params: unknown[] = []) => {
  queries.push({ sql, params });
  const fixture = fixtureRows?.(sql, params);
  if (fixture) return { rows: fixture, rowCount: fixture.length };
  const isVaultRead = /\bFROM\s+vaults\b/i.test(sql) && !/\bUPDATE\b/i.test(sql);
  const rows = isVaultRead && !params.includes(MISSING_VAULT_ID) ? [vaultRow()] : [];
  return { rows, rowCount: rows.length };
}) as unknown as typeof pool.query;

const app = express();
app.use(express.json());
app.use('/api/vaults', vaultsRouter);
app.use('/api', budgetPlansRouter);
app.use('/api', transactionsRouter);
app.use('/api', governanceRouter);
app.use('/api', proposalsRouter);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', () => resolve()));
const { port } = server.address() as AddressInfo;
const base = `http://127.0.0.1:${port}/api`;

const { token } = issueBearer({
  address: CREATOR,
  pubkeyHex: '02' + 'aa'.repeat(32),
  pubkeyHash: 'ab'.repeat(20),
  authenticatedAt: Date.now(),
});
const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function call(
  method: 'GET' | 'POST',
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  queries.length = 0;
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}

try {
  // --- proposals ---------------------------------------------------------------
  {
    const res = await call('GET', '/proposals?status=PENDING');
    check('GET /proposals → 200', res.status === 200);
    check('GET /proposals → {proposals,total}', Array.isArray(res.body.proposals) && res.body.total === 0);
  }
  {
    const res = await call('GET', `/proposals/${PROPOSAL_ID}`);
    check('GET /proposals/:id → reaches handler (404 not found)', res.status === 404 && res.body.error === 'Proposal not found');
  }
  {
    const res = await call('GET', '/proposals/not-a-uuid');
    check('GET /proposals/:id with bad id → 400', res.status === 400);
  }
  {
    const res = await call('POST', `/proposals/${PROPOSAL_ID}/approve`, { 'x-user-address': CREATOR });
    check('POST /proposals/:id/approve with only spoofable header → 401', res.status === 401);
  }
  {
    const res = await call('POST', `/proposals/${PROPOSAL_ID}/approve`, authHeaders);
    check('POST /proposals/:id/approve with bearer → reaches handler', res.status !== 401 && res.status !== 400);
  }
  for (const suffix of ['create-onchain', 'confirm-approval', 'approve-onchain', 'confirm-create']) {
    const res = await call('POST', `/proposals/${PROPOSAL_ID}/${suffix}`);
    check(`POST /proposals/:id/${suffix} → mounted (401, not 404)`, res.status === 401);
  }
  // Payout execution is on: the server merges each signer's signature before it broadcasts
  // (chipnet e2e: backend/test/e2e-chipnet/50-vaults.ts). The routes still need wallet auth.
  for (const suffix of ['execute', 'execute-onchain', 'execute-signature']) {
    const unauthenticated = await call('POST', `/proposals/${PROPOSAL_ID}/${suffix}`, {}, { sessionId: 's', signedTransaction: '00' });
    check(`POST /proposals/:id/${suffix} without auth → 401`, unauthenticated.status === 401);
    const res = await call('POST', `/proposals/${PROPOSAL_ID}/${suffix}`, authHeaders, { sessionId: 's', signedTransaction: '00' });
    check(`POST /proposals/:id/${suffix} with auth → reaches handler`, res.status !== 401 && res.status !== 501);
  }
  {
    const res = await call('POST', `/proposals/${PROPOSAL_ID}/approve-onchain`, { 'x-user-address': CREATOR });
    check('POST /proposals/:id/approve-onchain with only spoofable header → 401', res.status === 401);
  }
  for (const id of [VAULT_DB_ID, VAULT_LOGICAL_ID]) {
    const res = await call('GET', `/vaults/${id}/proposals`);
    const listQuery = queries.find((q) => /FROM proposals WHERE vault_id IN/.test(q.sql));
    check(`GET /vaults/${id}/proposals → 200`, res.status === 200 && Array.isArray(res.body));
    check(
      `GET /vaults/${id}/proposals → lists by both id forms`,
      listQuery?.params[0] === VAULT_DB_ID && listQuery?.params[1] === VAULT_LOGICAL_ID,
    );
  }
  {
    await call('POST', `/vaults/${VAULT_LOGICAL_ID}/proposals`, authHeaders, {
      vaultId: 'vault_spoofed_override',
      recipient: 'bchtest:qrecipient',
      amount: 0.001,
      reason: 'fixture',
    });
    const numberQuery = queries.find((q) => /MAX\(proposal_id\).*FROM proposals WHERE vault_id IN/.test(q.sql));
    const insert = queries.find((q) => /INSERT INTO proposals/.test(q.sql));
    const stateWrite = queries.find((q) => /UPDATE vaults/.test(q.sql) && /state/.test(q.sql));
    check(
      'POST /vaults/:logicalId/proposals → numbers across both id forms',
      numberQuery?.params[0] === VAULT_DB_ID && numberQuery?.params[1] === VAULT_LOGICAL_ID,
    );
    check('POST /vaults/:logicalId/proposals → stores DB id', insert?.params[1] === VAULT_DB_ID);
    check('POST /vaults/:logicalId/proposals → leaves vault.state alone', stateWrite === undefined);
  }
  {
    fixtureRows = (sql) => (/FROM proposals/.test(sql) ? [proposalRow()] : undefined);
    const res = await call('GET', '/proposals?status=PENDING');
    fixtureRows = null;
    const [row] = (res.body.proposals ?? []) as Array<Record<string, unknown>>;
    check('GET /proposals → still returns rows and total', res.body.total === 1 && row?.id === PROPOSAL_ID);
    check(
      'GET /proposals → omits reason, approvals, txHash, contractAddress',
      Boolean(row) && !['reason', 'approvals', 'txHash', 'contractAddress'].some((key) => key in row),
    );
  }
  {
    fixtureRows = (sql) =>
      /FROM proposals WHERE vault_id IN/.test(sql)
        ? [proposalRow({ id: 'legacy', vault_id: VAULT_LOGICAL_ID, created_at: '2026-01-03T00:00:00Z' }), proposalRow()]
        : undefined;
    const res = await call('GET', `/vaults/${VAULT_DB_ID}/proposals`);
    fixtureRows = null;
    const ids = (res.body as unknown as Array<{ id: string }>).map((p) => p.id);
    check('GET /vaults/:id/proposals → includes rows under both id forms', ids.join(',') === `legacy,${PROPOSAL_ID}`);
  }
  {
    // A vault with rows under both id forms (max proposal 3 between them) used to 409.
    fixtureRows = (sql) => (/MAX\(proposal_id\)/.test(sql) ? [{ max_id: 3 }] : undefined);
    const res = await call('POST', `/vaults/${VAULT_DB_ID}/proposals`, authHeaders, {
      recipient: 'bchtest:qrecipient',
      amount: 0.001,
      reason: 'fixture',
    });
    fixtureRows = null;
    const insert = queries.find((q) => /INSERT INTO proposals/.test(q.sql));
    check('POST /vaults/:id/proposals with split history → no PROPOSAL_VAULT_ID_SPLIT', res.body.errorCode !== 'PROPOSAL_VAULT_ID_SPLIT');
    check('POST /vaults/:id/proposals with split history → numbers past both forms under the DB id', insert?.params[1] === VAULT_DB_ID && insert?.params[2] === 4);
  }
  {
    const reusedTx = 'ef'.repeat(32);
    fixtureRows = (sql) => {
      if (/FROM proposals WHERE id/.test(sql)) return [proposalRow()];
      if (/FROM transactions WHERE tx_hash/.test(sql)) {
        // Recorded for a different request. A row for this request and step is the
        // normal broadcast-then-confirm flow and must go through.
        return [{ id: 't', tx_hash: reusedTx, tx_type: 'approve', proposal_id: 'another-proposal', status: 'pending' }];
      }
      return undefined;
    };
    const res = await call('POST', `/proposals/${PROPOSAL_ID}/confirm-approval`, authHeaders, { txHash: reusedTx });
    fixtureRows = null;
    check('POST /proposals/:id/confirm-approval with a txHash recorded for another request → 409 TX_ALREADY_RECORDED', res.status === 409 && res.body.errorCode === 'TX_ALREADY_RECORDED');
    check('POST /proposals/:id/confirm-approval with a txHash recorded for another request → no approval write', !queries.some((q) => /UPDATE proposals/.test(q.sql)));
  }
  {
    const approverPubkey = hexToBin('02' + '11'.repeat(32));
    const otherPubkey = hexToBin('03' + '22'.repeat(32));
    const addressFor = (pubkey: Uint8Array): string => {
      const result = lockingBytecodeToCashAddress({
        bytecode: Uint8Array.from([0x76, 0xa9, 0x14, ...hash160(pubkey), 0x88, 0xac]),
        prefix: 'bchtest',
      });
      if (typeof result === 'string') throw new Error(result);
      return result.address;
    };
    const covenantRedeem = Uint8Array.from([0x14, ...hash160(otherPubkey), 0x14, ...hash160(otherPubkey), 0x87]);
    const approvalTxHex = binToHex(encodeTransaction({
      version: 2,
      locktime: 0,
      inputs: [{
        outpointTransactionHash: new Uint8Array(32),
        outpointIndex: 0,
        sequenceNumber: 0xffffffff,
        unlockingBytecode: Uint8Array.from([0x41, ...new Uint8Array(65), 0x21, ...approverPubkey, 0x4c, covenantRedeem.length, ...covenantRedeem]),
      }],
      outputs: [{ lockingBytecode: Uint8Array.from([0x6a]), valueSatoshis: 0n }],
    }));
    check('txPushesPubkeyForAddress → true for the approving signer', txPushesPubkeyForAddress(approvalTxHex, addressFor(approverPubkey)));
    check('txPushesPubkeyForAddress → false for another signer', !txPushesPubkeyForAddress(approvalTxHex, addressFor(otherPubkey)));
    check('txPushesPubkeyForAddress → false for a P2SH address', !txPushesPubkeyForAddress(approvalTxHex, 'bchtest:pproposal'));
  }
  {
    const res = await call('GET', `/vaults/${MISSING_VAULT_ID}/proposals`);
    check('GET /vaults/:unknown/proposals → 404', res.status === 404);
  }
  {
    const res = await call('GET', '/not-a-route');
    check('unknown /api path is no longer swallowed by proposal /:id', res.status === 404);
  }

  // --- transactions --------------------------------------------------------------
  {
    const res = await call('GET', '/transactions/pending');
    check('GET /transactions/pending → 200 {transactions}', res.status === 200 && Array.isArray(res.body.transactions));
    check('GET /transactions/pending → runs the pending query', queries.some((q) => /status = 'pending'/.test(q.sql)));
    check('GET /transactions/pending → not looked up as a hash', !queries.some((q) => q.params.includes('pending')));
  }
  {
    const res = await call('GET', `/transactions/${'ab'.repeat(32)}`);
    check('GET /transactions/:txHash still served', res.status === 404 && res.body.error === 'Transaction not found');
  }

  // --- vaults --------------------------------------------------------------------
  for (const id of [VAULT_DB_ID, VAULT_LOGICAL_ID]) {
    const res = await call('GET', `/vaults/${id}`);
    check(`GET /vaults/${id} → 200`, res.status === 200 && res.body.id === VAULT_DB_ID && res.body.vaultId === VAULT_LOGICAL_ID);
    const state = await call('GET', `/vaults/${id}/state`);
    check(`GET /vaults/${id}/state → 200`, state.status === 200 && state.body.vaultId === VAULT_LOGICAL_ID);
  }
  {
    const res = await call('GET', '/vaults/not-a-vault');
    check('GET /vaults/:id with malformed id → 400', res.status === 400);
  }
  {
    const res = await call('GET', `/vaults/${VAULT_LOGICAL_ID}/deposit`, { 'x-user-address': CREATOR });
    const constructorQuery = queries.find((q) => /SELECT constructor_params FROM vaults/.test(q.sql));
    check('GET /vaults/:logicalId/deposit → 200', res.status === 200);
    check('deposit reads constructor_params by DB id', constructorQuery?.params[0] === VAULT_DB_ID);
  }
  {
    const res = await call('POST', `/vaults/${VAULT_LOGICAL_ID}/signers`, authHeaders, { signerAddress: 'bchtest:qnew' });
    check('POST /vaults/:id/signers → 409 SIGNERS_FIXED', res.status === 409 && res.body.errorCode === 'SIGNERS_FIXED');
    check('POST /vaults/:id/signers → no write', !queries.some((q) => /UPDATE\s+vaults/i.test(q.sql)));
  }
} finally {
  server.close();
  await pool.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
