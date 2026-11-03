/**
 * Smoke test: GET /airdrops/claimable only lists airdrops a claim can be built for,
 * and POST /airdrops/:id/claim enforces the per-wallet claim limit before co-signing.
 *
 * Mounts the real airdrops router on a random local port with `pool.query` stubbed
 * to return fixture rows. Covers:
 *   - the SQL gates on start_date <= now as well as end_date (params checked)
 *   - pools that can't cover one more claim are dropped (2-decimal token, base units)
 *   - KYC airdrops with no recipient list are dropped
 *   - airdrops with a recipient list are only listed for addresses on it
 *   - the claim route awaits the claim-count query (it used to read a Promise, so the
 *     count was always 0 and one wallet could claim until the pool was empty)
 *
 * NO network, NO database. Runs as a standalone Node script via tsx:
 *
 *   pnpm --filter @flowguard/backend exec tsx test/airdrop-claimable.smoke.ts
 *
 * Exit code 0 on pass, non-zero on any assertion failure.
 */

import express from 'express';
import type { AddressInfo } from 'node:net';

process.env.DATABASE_URL ??= 'postgres://stub:stub@127.0.0.1:1/stub';
process.env.APP_URL ??= 'https://app.example.test';

const { pool } = await import('../src/database/pg.js');
const { issueBearer } = await import('../src/middleware/auth.js');
const { default: airdropsRouter } = await import('../src/api/airdrops.js');

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean): void {
  console.log(condition ? 'PASS' : 'FAIL', name);
  if (condition) pass++;
  else fail++;
}

const CLAIMER = 'bchtest:qclaimer';
const OTHER = 'bchtest:qother';

function row(id: string, overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id,
    campaign_id: `#FG-DROP-${id}`,
    creator: 'bchtest:qcreator',
    status: 'ACTIVE',
    title: id,
    token_type: 'BCH',
    token_decimals: 0,
    total_amount: 1,
    amount_per_claim: 0.1,
    claimed_count: 0,
    require_kyc: 0,
    merkle_data: null,
    max_claims_per_address: 1,
    start_date: 1_700_000_000,
    end_date: null,
    claim_link: `https://app.example.test/claim/token-${id}`,
    created_at: 1_700_000_000,
    ...overrides,
  };
}

const merkleFor = (address: string) => JSON.stringify({
  recipients: [{ address, amount: 0.1 }],
  proofs: [[address, ['ab'.repeat(32)]]],
});

const FIXTURES = [
  row('open', {}),
  row('last-claim', { claimed_count: 9 }),
  row('used-up', { claimed_count: 10 }),
  // 2-decimal token: 12.50 per claim, 25.00 pool, 1 claimed -> exactly one claim left
  row('ft-one-left', { token_type: 'FUNGIBLE_TOKEN', token_decimals: 2, total_amount: 25, amount_per_claim: 12.5, claimed_count: 1 }),
  row('ft-used-up', { token_type: 'FUNGIBLE_TOKEN', token_decimals: 2, total_amount: 25, amount_per_claim: 12.5, claimed_count: 2 }),
  row('kyc-no-list', { require_kyc: 1 }),
  row('listed-claimer', { require_kyc: 1, merkle_data: merkleFor(CLAIMER) }),
  row('listed-other', { merkle_data: merkleFor(OTHER) }),
  row('bad-merkle', { merkle_data: '{not json' }),
];

let claimableSql = '';
let claimableParams: unknown[] = [];
let claimCount = 0;

pool.query = (async (sql: string, params: unknown[] = []) => {
  if (/FROM airdrops a\b/i.test(sql)) {
    claimableSql = sql;
    claimableParams = params;
    return { rows: FIXTURES, rowCount: FIXTURES.length };
  }
  if (/COUNT\(1\) as cnt FROM airdrop_claims/i.test(sql)) {
    return { rows: [{ cnt: claimCount }], rowCount: 1 };
  }
  if (/FROM airdrops WHERE id = /i.test(sql)) {
    const fixture = row('11111111-2222-4333-8444-555555555555', {
      contract_address: 'bchtest:pcontract',
      constructor_params: '[]',
    });
    return { rows: [fixture], rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
}) as unknown as typeof pool.query;

const app = express();
app.use(express.json());
app.use('/api', airdropsRouter);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', () => resolve()));
const { port } = server.address() as AddressInfo;
const base = `http://127.0.0.1:${port}/api`;

async function claimableIds(address: string): Promise<string[]> {
  const response = await fetch(`${base}/airdrops/claimable?address=${encodeURIComponent(address)}`);
  const body = await response.json() as { campaigns?: Array<{ id: string }>; total?: number };
  check(`claimable(${address}) → 200`, response.status === 200);
  check(`claimable(${address}) → total matches list`, body.total === body.campaigns?.length);
  return (body.campaigns ?? []).map((campaign) => campaign.id);
}

try {
  const before = Math.floor(Date.now() / 1000);
  const forClaimer = await claimableIds(CLAIMER);

  check('SQL gates on start_date', /a\.start_date\s*<=\s*\?/.test(claimableSql) || /a\.start_date\s*<=\s*\$\d/.test(claimableSql));
  check('SQL binds now for start and end, then the address',
    claimableParams.length === 3
      && Number(claimableParams[0]) >= before
      && claimableParams[0] === claimableParams[1]
      && claimableParams[2] === CLAIMER);

  check('open pool is listed', forClaimer.includes('open'));
  check('pool with exactly one claim left is listed', forClaimer.includes('last-claim'));
  check('used-up BCH pool is hidden', !forClaimer.includes('used-up'));
  check('2-decimal token pool with one claim left is listed', forClaimer.includes('ft-one-left'));
  check('used-up 2-decimal token pool is hidden', !forClaimer.includes('ft-used-up'));
  check('KYC airdrop without a recipient list is hidden', !forClaimer.includes('kyc-no-list'));
  check('recipient list containing the address is listed', forClaimer.includes('listed-claimer'));
  check('recipient list without the address is hidden', !forClaimer.includes('listed-other'));
  check('unreadable recipient list is hidden', !forClaimer.includes('bad-merkle'));

  const forOther = await claimableIds(OTHER);
  check('other address sees its own listed airdrop', forOther.includes('listed-other'));
  check('other address does not see the claimer-only airdrop', !forOther.includes('listed-claimer'));

  const { token } = issueBearer({
    address: CLAIMER,
    pubkeyHex: '02'.padEnd(66, '0'),
    pubkeyHash: '00'.repeat(20),
    authenticatedAt: Date.now(),
  });
  claimCount = 1;
  const claimResponse = await fetch(`${base}/airdrops/11111111-2222-4333-8444-555555555555/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ claimerAddress: CLAIMER }),
  });
  const claimBody = await claimResponse.json() as { error?: string };
  check('claim route refuses a wallet that already used its claim (409)', claimResponse.status === 409);
  check('claim route says the limit was reached', claimBody.error === 'Claim limit reached for this address');
} finally {
  server.close();
  await pool.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
