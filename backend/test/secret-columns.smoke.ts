/**
 * Smoke test: campaign rows never carry their secret columns out of the API.
 *
 * airdrops/grants/bounties/rewards are read with `SELECT *`, so every row holds the
 * encrypted authority key (and airdrops the full merkle_data blob). This mounts the
 * four real routers on a random local port with `pool.query` stubbed to return
 * fixture rows, hits every public read route, and asserts that neither the secret
 * keys nor their values appear anywhere in the response body.
 *
 * NO network, NO database. Runs as a standalone Node script via tsx:
 *
 *   pnpm --filter @flowguard/backend exec tsx test/secret-columns.smoke.ts
 *
 * Exit code 0 on pass, non-zero on any assertion failure.
 */

import express from 'express';
import type { AddressInfo } from 'node:net';

process.env.DATABASE_URL ??= 'postgres://stub:stub@127.0.0.1:1/stub';
process.env.APP_URL ??= 'https://app.example.test';

const { pool } = await import('../src/database/pg.js');
const { omitSecretColumns } = await import('../src/utils/responseSanitizers.js');
const { default: airdropsRouter } = await import('../src/api/airdrops.js');
const { default: grantsRouter } = await import('../src/api/grants.js');
const { default: bountiesRouter } = await import('../src/api/bounties.js');
const { default: rewardsRouter } = await import('../src/api/rewards.js');

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean): void {
  console.log(condition ? 'PASS' : 'FAIL', name);
  if (condition) pass++;
  else fail++;
}

const PRIVKEY_CIPHERTEXT = 'enc:v1:SECRET-PRIVKEY-CIPHERTEXT';
const CLAIM_PRIVKEY_CIPHERTEXT = 'enc:v1:SECRET-CLAIM-PRIVKEY-CIPHERTEXT';
const MERKLE_MARKER = 'SECRET-MERKLE-RECIPIENT';
const SECRET_KEYS = ['authority_privkey', 'claim_authority_privkey', 'merkle_data'];
const SECRET_VALUES = [PRIVKEY_CIPHERTEXT, CLAIM_PRIVKEY_CIPHERTEXT, MERKLE_MARKER];

const ID = '11111111-2222-4333-8444-555555555555';
const CLAIM_TOKEN = 'claimtoken-abc123';
const CLAIMER = 'bchtest:qclaimer';

function fixtureRow(): Record<string, unknown> {
  return {
    id: ID,
    creator: 'bchtest:qcreator',
    status: 'ACTIVE',
    title: 'fixture',
    claim_link: `https://app.example.test/claim/${CLAIM_TOKEN}`,
    merkle_root: 'ab'.repeat(32),
    authority_privkey: PRIVKEY_CIPHERTEXT,
    claim_authority_privkey: CLAIM_PRIVKEY_CIPHERTEXT,
    token_type: 'BCH',
    amount_per_claim: 1,
    total_amount: 10,
    claimed_count: 0,
    merkle_data: JSON.stringify({
      proofs: [[CLAIMER, []], [MERKLE_MARKER, []]],
      recipients: [{ address: CLAIMER, amount: 1 }, { address: MERKLE_MARKER, amount: 1 }],
    }),
    created_at: 1_700_000_000,
  };
}

const CAMPAIGN_TABLE = /\bFROM\s+(airdrops|grants|bounties|rewards)\b/i;

pool.query = (async (sql: string) => {
  const rows = CAMPAIGN_TABLE.test(sql) ? [fixtureRow()] : [];
  return { rows, rowCount: rows.length };
}) as unknown as typeof pool.query;

// --- helper -------------------------------------------------------------------
{
  const stripped = omitSecretColumns(fixtureRow());
  check('helper drops every secret column', SECRET_KEYS.every((key) => !(key in stripped)));
  check('helper keeps public columns', stripped.id === ID && stripped.merkle_root === 'ab'.repeat(32));
  const original = fixtureRow();
  omitSecretColumns(original);
  check('helper does not mutate its input', original.authority_privkey === PRIVKEY_CIPHERTEXT);
  check('helper passes null through', omitSecretColumns(null) === null);
  check('helper passes undefined through', omitSecretColumns(undefined) === undefined);
  check('helper passes strings through', omitSecretColumns('row') === 'row');
}

// --- routes -------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use('/api', airdropsRouter);
app.use('/api', grantsRouter);
app.use('/api', bountiesRouter);
app.use('/api', rewardsRouter);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', () => resolve()));
const { port } = server.address() as AddressInfo;
const base = `http://127.0.0.1:${port}/api`;

const routes: Array<{ path: string; campaignField: string }> = [
  { path: '/airdrops?creator=bchtest:qcreator', campaignField: 'campaigns' },
  { path: `/airdrops/claimable?address=${CLAIMER}`, campaignField: 'campaigns' },
  { path: `/airdrops/claim/${CLAIM_TOKEN}`, campaignField: 'campaign' },
  { path: `/airdrops/${ID}`, campaignField: 'campaign' },
  { path: '/grants?creator=bchtest:qcreator', campaignField: 'grants' },
  { path: `/grants/${ID}`, campaignField: 'grant' },
  { path: '/bounties?creator=bchtest:qcreator', campaignField: 'campaigns' },
  { path: `/bounties/${ID}`, campaignField: 'campaign' },
  { path: '/rewards?creator=bchtest:qcreator', campaignField: 'campaigns' },
  { path: `/rewards/${ID}`, campaignField: 'campaign' },
];

try {
  for (const { path, campaignField } of routes) {
    const response = await fetch(`${base}${path}`);
    const text = await response.text();
    const body = JSON.parse(text) as Record<string, unknown>;
    const payload = body[campaignField];
    const first = Array.isArray(payload) ? payload[0] : payload;

    check(`${path} → 200`, response.status === 200);
    check(`${path} → still returns the campaign row`, (first as { id?: string } | undefined)?.id === ID);
    check(`${path} → no secret keys`, SECRET_KEYS.every((key) => !text.includes(`"${key}"`)));
    check(`${path} → no secret values`, SECRET_VALUES.every((value) => !text.includes(value)));
  }
} finally {
  server.close();
  await pool.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
