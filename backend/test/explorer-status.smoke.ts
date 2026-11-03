/**
 * Smoke test: explorer and status data.
 *
 * Mounts the real explorer, explorer-advanced and status routers (behind the same
 * limiter chain index.ts uses) on a random local port against a THROWAWAY local
 * Postgres with postgres-schema.sql applied. Electrum and outbound fetch are
 * stubbed, so the test makes no network calls.
 *
 *   DATABASE_URL=postgres://postgres@127.0.0.1:55439/fg_test PG_SSL_DISABLED=true \
 *     pnpm exec tsx test/explorer-status.smoke.ts
 *
 * Refuses to run unless DATABASE_URL points at localhost, because it deletes and
 * re-seeds the tables it touches.
 *
 * Exit code 0 on pass, non-zero on any assertion failure.
 */

import express from 'express';
import type { AddressInfo } from 'node:net';
import { ElectrumNetworkProvider } from 'cashscript';

const databaseUrl = process.env.DATABASE_URL ?? '';
if (!/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(databaseUrl)) {
  console.error('DATABASE_URL must point at a local throwaway Postgres (127.0.0.1 or localhost).');
  process.exit(2);
}
process.env.BCH_NETWORK = 'chipnet';

const TIP_HEIGHT = 300_000;
const TIP_AGE_SECONDS = 120;

function fakeHeaderHex(timestampSeconds: number): string {
  const header = Buffer.alloc(80);
  header.writeUInt32LE(timestampSeconds, 68);
  return header.toString('hex');
}

ElectrumNetworkProvider.prototype.performRequest = (async (name: string) => {
  if (name === 'blockchain.headers.subscribe') {
    return { height: TIP_HEIGHT, hex: fakeHeaderHex(Math.floor(Date.now() / 1000) - TIP_AGE_SECONDS) };
  }
  return [];
}) as unknown as typeof ElectrumNetworkProvider.prototype.performRequest;
ElectrumNetworkProvider.prototype.disconnect = (async () => true) as unknown as typeof ElectrumNetworkProvider.prototype.disconnect;

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('http://127.0.0.1:')) return realFetch(input, init);
  return new Response(null, { status: 200 });
}) as typeof fetch;

const { pool } = await import('../src/database/pg.js');
const { default: explorerRouter } = await import('../src/api/explorer.js');
const { default: explorerAdvancedRouter } = await import('../src/api/explorer-advanced.js');
const { default: statusRouter } = await import('../src/api/status.js');
const { generalLimiter, statusLimiter } = await import('../src/middleware/rateLimiter.js');

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean): void {
  console.log(condition ? 'PASS' : 'FAIL', name);
  if (condition) pass++;
  else fail++;
}

const SIGNER = 'bchtest:qsigner0000000000000000000000000000000000';
const SIGNER_SUFFIX = SIGNER.slice(0, -4);
const CREATOR = 'bchtest:qcreator000000000000000000000000000000000';
const VAULT_CREATED_AT = '2025-03-04T05:06:07.000Z';
const PROPOSAL_CREATED_AT = '2025-04-05T06:07:08.000Z';
const STREAM_TX = 'a1'.repeat(32);
const STREAM_CLAIM_TX = 'b2'.repeat(32);
const PAYMENT_TX = 'c3'.repeat(32);
const VAULT_DEPLOY_TX = 'd4'.repeat(32);
const AIRDROP_FUND_TX = 'e5'.repeat(32);
const TOKEN_CATEGORY = 'ef'.repeat(32);

async function seed(): Promise<void> {
  for (const table of ['activity_events', 'airdrops', 'payments', 'streams', 'proposals', 'vaults']) {
    await pool.query(`DELETE FROM ${table}`);
  }
  await pool.query(
    `INSERT INTO vaults (id, vault_id, creator, total_deposit, spending_cap, approval_threshold, signers,
       signer_pubkeys, cycle_duration, unlock_amount, contract_address, deployment_tx_hash, created_at, name)
     VALUES
       ('v1', 'vault-1', $1, 1, 1, 1, $2, $3, 1, 1, 'bchtest:pcontract1', $4, $5, 'Deployed vault'),
       ('v2', 'vault-2', $1, 1, 1, 1, '[]', '[]', 1, 1, NULL, NULL, $5, 'Draft vault')`,
    [CREATOR, JSON.stringify([SIGNER, CREATOR]), JSON.stringify(['02' + 'aa'.repeat(32)]), VAULT_DEPLOY_TX, VAULT_CREATED_AT],
  );
  await pool.query(
    `INSERT INTO proposals (id, vault_id, proposal_id, recipient, amount, reason, status, created_at)
     VALUES ('p1', 'vault-1', 1, $1, 0.5, 'executed proposal', 'executed', $2),
            ('p2', 'v1', 2, $1, 0.25, 'pending proposal', 'pending', $2)`,
    [SIGNER, PROPOSAL_CREATED_AT],
  );
  await pool.query(
    `INSERT INTO streams (id, stream_id, sender, recipient, total_amount, stream_type, start_time,
       token_type, token_category, status, tx_hash)
     VALUES ('s1', 'stream-1', $1, $2, 1000, 'LINEAR', 1, 'CASHTOKENS', $3, 'ACTIVE', $4)`,
    [CREATOR, SIGNER, TOKEN_CATEGORY, STREAM_TX],
  );
  await pool.query(
    `INSERT INTO activity_events (id, entity_type, entity_id, event_type, tx_hash)
     VALUES ('e1', 'stream', 's1', 'claim', $1)`,
    [STREAM_CLAIM_TX],
  );
  await pool.query(
    `INSERT INTO payments (id, payment_id, sender, recipient, amount_per_period, interval, interval_seconds,
       start_date, next_payment_date, token_type, token_category, tx_hash)
     VALUES ('pay1', 'payment-1', $1, $2, 5, 'MONTHLY', 2592000, 1, 1, 'CASHTOKENS', $3, $4)`,
    [CREATOR, SIGNER, TOKEN_CATEGORY, PAYMENT_TX],
  );
  await pool.query(
    `INSERT INTO airdrops (id, campaign_id, creator, title, total_amount, amount_per_claim, start_date,
       token_type, token_category, tx_hash)
     VALUES ('a1', 'airdrop-1', $1, 'drop', 100, 1, 1, 'CASHTOKENS', $2, $3)`,
    [CREATOR, TOKEN_CATEGORY, AIRDROP_FUND_TX],
  );
  await pool.query(
    `INSERT INTO activity_events (id, entity_type, entity_id, event_type, tx_hash)
     VALUES ('e2', 'airdrop', 'a1', 'funded', $1)`,
    [AIRDROP_FUND_TX],
  );
}

await seed();

const app = express();
app.use('/api', generalLimiter);
app.use('/api/status', statusLimiter);
app.get('/api/limiter-control', (_req, res) => res.json({ ok: true }));
app.use('/api', explorerRouter);
app.use('/api', explorerAdvancedRouter);
app.use('/api', statusRouter);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', () => resolve()));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

async function getJson(path: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${base}${path}`);
  return { status: response.status, body: await response.json() };
}

try {
  // 1. timestamps
  {
    const { body } = await getJson('/explorer/transactions?limit=100');
    const rows: any[] = body.transactions ?? [];
    const vault = rows.find((r) => r.id === 'vault-1');
    const proposal = rows.find((r) => r.id === 'p1');
    check('vault created_at is the stored time, not now', vault?.created_at === Date.parse(VAULT_CREATED_AT));
    check('proposal created_at is the stored time, not now', proposal?.created_at === Date.parse(PROPOSAL_CREATED_AT));

    // 3. token_category
    check('stream row carries token_category', rows.find((r) => r.id === 'stream-1')?.token_category === TOKEN_CATEGORY);
    check('payment row carries token_category', rows.find((r) => r.id === 'payment-1')?.token_category === TOKEN_CATEGORY);
    check('airdrop row carries token_category', rows.find((r) => r.id === 'airdrop-1')?.token_category === TOKEN_CATEGORY);
    check('proposal status is emitted uppercase', proposal?.status === 'EXECUTED');
  }

  {
    const { body } = await getJson('/explorer/timeline');
    const timestamps = (body.timeline as any[]).map((t) => t.timestamp);
    check('timeline puts the 2025-04 proposal before the 2025-03 vault',
      timestamps.indexOf(PROPOSAL_CREATED_AT) !== -1
      && timestamps.indexOf(PROPOSAL_CREATED_AT) < timestamps.indexOf(VAULT_CREATED_AT));
  }

  // 2. proposal status case
  {
    const executed = await getJson('/explorer/transactions?type=proposal&status=EXECUTED');
    check('status=EXECUTED matches lowercase executed proposal',
      executed.body.transactions.length === 1 && executed.body.transactions[0].id === 'p1');
    const pending = await getJson('/explorer/transactions?type=proposal&status=PENDING');
    check('status=PENDING matches lowercase pending proposal',
      pending.body.transactions.length === 1 && pending.body.transactions[0].id === 'p2');

    const stats = await getJson('/explorer/stats');
    check('stats counts the pending proposal', stats.body.flowguard?.proposals?.active === 1);

    const contract = await getJson('/explorer/contract/bchtest:pcontract1');
    check('contract stats count the pending proposal', contract.body.stats?.pendingProposals === 1);
    check('contract stats sum the executed proposal', contract.body.stats?.totalExecuted === 0.5);
    check('contract endpoint keeps raw proposal rows', contract.body.proposals?.some((p: any) => p.status === 'executed'));
    check('contract lists proposals keyed by vaults.id and by legacy vault_id', contract.body.proposals?.length === 2);

    const activity = await getJson('/explorer/activity?type=treasuries&status=EXECUTED');
    const executedRow = activity.body.streams?.[0];
    check('activity status=EXECUTED matches and reports 100%',
      activity.body.streams?.length === 1 && executedRow.status === 'EXECUTED' && executedRow.progress_percentage === 100);
  }

  // 4. vault status filter
  {
    const active = await getJson('/explorer/transactions?type=vault&status=ACTIVE');
    check('vault status=ACTIVE returns no vaults', active.body.transactions.length === 0);
    const deployed = await getJson('/explorer/transactions?type=vault&status=DEPLOYED');
    check('vault status=DEPLOYED returns only the deployed vault',
      deployed.body.transactions.length === 1 && deployed.body.transactions[0].id === 'vault-1');
    const created = await getJson('/explorer/transactions?type=vault&status=created');
    check('vault status filter is case-insensitive',
      created.body.transactions.length === 1 && created.body.transactions[0].id === 'vault-2');
  }

  // 5. vaults as signer
  {
    const signer = await getJson(`/explorer/address/${SIGNER}`);
    check('vaultsAsSigner counts the signer', signer.body.activity?.vaultsAsSigner === 1);
    const signerUpper = await getJson(`/explorer/address/${SIGNER.toUpperCase()}`);
    check('vaultsAsSigner is case-insensitive', signerUpper.body.activity?.vaultsAsSigner === 1);
    const suffix = await getJson(`/explorer/address/${SIGNER_SUFFIX}`);
    check('vaultsAsSigner ignores a substring of a signer', suffix.body.activity?.vaultsAsSigner === 0);
  }

  // 6. hash search
  {
    const byStreamTx = await getJson(`/explorer/search?q=${STREAM_TX.toUpperCase()}`);
    check('stream found by its creation tx hash', byStreamTx.body.results?.streams?.[0]?.stream_id === 'stream-1');
    const byClaimTx = await getJson(`/explorer/search?q=${STREAM_CLAIM_TX}`);
    check('stream found by a lifecycle tx hash', byClaimTx.body.results?.streams?.[0]?.stream_id === 'stream-1');
    const searchedStream = byClaimTx.body.results?.streams?.[0];
    check('search stream row carries id, token_type and token_category',
      searchedStream?.id === 's1'
      && searchedStream.token_type === 'CASHTOKENS'
      && searchedStream.token_category === TOKEN_CATEGORY);
    check('lifecycle tx listed in transactions bucket',
      byClaimTx.body.results?.transactions?.[0]?.entity_type === 'stream'
      && byClaimTx.body.results.transactions[0].entity_id === 's1');
    const byPaymentTx = await getJson(`/explorer/search?q=${PAYMENT_TX}`);
    check('payment tx without an event listed once as funded and counted',
      byPaymentTx.body.results?.transactions?.length === 1
      && byPaymentTx.body.results.transactions[0].entity_type === 'payment'
      && byPaymentTx.body.results.transactions[0].event_type === 'funded'
      && byPaymentTx.body.totalResults === 1);
    const byAirdropTx = await getJson(`/explorer/search?q=${AIRDROP_FUND_TX}`);
    check('funding tx stored on the airdrop and in an event is listed once',
      byAirdropTx.body.results?.transactions?.length === 1
      && byAirdropTx.body.results.transactions[0].entity_type === 'airdrop'
      && byAirdropTx.body.results.transactions[0].event_type === 'funded'
      && byAirdropTx.body.totalResults === 1);
    const byVaultTx = await getJson(`/explorer/search?q=${VAULT_DEPLOY_TX}`);
    check('vault found by deployment tx hash', byVaultTx.body.results?.vaults?.[0]?.vault_id === 'vault-1');
    const byName = await getJson('/explorer/search?q=deployed');
    check('non-hash search still matches names with an empty transactions bucket',
      byName.body.results?.vaults?.length === 1 && byName.body.results.transactions.length === 0);
  }

  // 7. status
  {
    const { status, body } = await getJson('/status');
    check('status responds 200', status === 200);
    check('chain height from headers.subscribe', body.chain?.height === TIP_HEIGHT);
    check('chain ageSeconds from header timestamp',
      typeof body.chain?.ageSeconds === 'number' && Math.abs(body.chain.ageSeconds - TIP_AGE_SECONDS) <= 5);
    check('status payload says incidents are not tracked', body.incidentsTracked === false);
    check('API row follows database health', body.components?.find((c: any) => c.id === 'api')?.status === 'operational');
    check('uptime90d stays null', body.components?.every((c: any) => c.uptime90d === null));

    const incidents = await getJson('/status/incidents');
    check('incidents endpoint reports tracked: false', incidents.body.tracked === false && incidents.body.incidents.length === 0);
  }

  // 7e. limiter: status skips the general limiter, others still hit it
  {
    let throttled = 0;
    for (let i = 0; i < 150; i++) {
      const response = await fetch(`${base}/status`);
      await response.arrayBuffer();
      if (response.status === 429) throttled++;
    }
    check('150 status requests are never throttled', throttled === 0);

    let controlThrottled = false;
    for (let i = 0; i < 101 && !controlThrottled; i++) {
      const response = await fetch(`${base}/limiter-control`);
      await response.arrayBuffer();
      if (response.status === 429) controlThrottled = true;
    }
    check('general limiter still throttles other /api routes', controlThrottled);
  }
} finally {
  server.close();
  await pool.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
