/**
 * Smoke test: payments, airdrops, grants, bounties and rewards scale CashToken amounts
 * by the token's decimals, from create through funding-info.
 *
 * For a 2-decimal token, 12.5 whole tokens must become 1250 base units in the covenant
 * constructor and in the funding amount. Before migration 011 every conversion used
 * decimals = 0, so the contract was deployed for 12 (rounded) base units instead.
 *
 * The real routers run on a random local port. `pool.query` is stubbed as a tiny
 * in-memory table store (INSERT rows are kept and served back by `WHERE id = ?`), the
 * deployment services build their contracts offline from the artifacts, and each
 * funding service's `buildFundingTransaction` is stubbed to record the on-chain amount
 * the route asks for. Network is chipnet, so no BCMR lookup runs and the client's
 * `tokenDecimals` hint is what gets stored. Live funding needs a chipnet wallet.
 *
 * NO network, NO database:
 *
 *   pnpm --filter @flowguard/backend exec tsx test/distribution-decimals.smoke.ts
 */

import express from 'express';
import type { AddressInfo } from 'node:net';
import { encodeCashAddress } from '@bitauth/libauth';

process.env.DATABASE_URL ??= 'postgres://stub:stub@127.0.0.1:1/stub';
process.env.APP_URL ??= 'https://app.example.test';
process.env.BCH_NETWORK = 'chipnet';
process.env.AIRDROP_CLAIM_KEY_ENCRYPTION_KEY ??= '0f'.repeat(32);

const { pool } = await import('../src/database/pg.js');
const { issueBearer } = await import('../src/middleware/auth.js');
const { default: paymentsRouter } = await import('../src/api/payments.js');
const { default: airdropsRouter } = await import('../src/api/airdrops.js');
const { default: grantsRouter } = await import('../src/api/grants.js');
const { default: bountiesRouter } = await import('../src/api/bounties.js');
const { default: rewardsRouter } = await import('../src/api/rewards.js');
const { PaymentFundingService } = await import('../src/services/PaymentFundingService.js');
const { AirdropFundingService } = await import('../src/services/AirdropFundingService.js');
const { GrantFundingService } = await import('../src/services/GrantFundingService.js');
const { BountyFundingService } = await import('../src/services/BountyFundingService.js');
const { RewardFundingService } = await import('../src/services/RewardFundingService.js');

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean): void {
  console.log(condition ? 'PASS' : 'FAIL', name);
  if (condition) pass++;
  else fail++;
}

function p2pkh(byte: number): string {
  const encoded = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: new Uint8Array(20).fill(byte) });
  if (typeof encoded === 'string') throw new Error(encoded);
  return encoded.address;
}

const CREATOR = p2pkh(0x11);
const RECIPIENT = p2pkh(0x22);
const CATEGORY = 'cd'.repeat(32);

type Row = Record<string, unknown>;
const tables = new Map<string, Map<string, Row>>();

function parseInsert(sql: string, params: unknown[]): { table: string; row: Row } | null {
  const match = /INSERT INTO (\w+)\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/is.exec(sql);
  if (!match) return null;
  const columns = match[2].split(',').map((column) => column.trim());
  const values = match[3].split(',').map((value) => value.trim());
  const row: Row = {};
  columns.forEach((column, index) => {
    const value = values[index];
    const placeholder = /^\$(\d+)$/.exec(value);
    if (placeholder) row[column] = params[Number(placeholder[1]) - 1];
    else if (/^'.*'$/.test(value)) row[column] = value.slice(1, -1);
    else row[column] = Number(value);
  });
  return { table: match[1], row };
}

pool.query = (async (sql: string, params: unknown[] = []) => {
  const insert = parseInsert(sql, params);
  if (insert) {
    if (!tables.has(insert.table)) tables.set(insert.table, new Map());
    tables.get(insert.table)!.set(String(insert.row.id), insert.row);
    return { rows: [], rowCount: 1 };
  }
  const byId = /SELECT \* FROM (\w+) WHERE id = \$1/i.exec(sql);
  if (byId) {
    const row = tables.get(byId[1])?.get(String(params[0]));
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }
  if (/COUNT\(\*\) as cnt/i.test(sql)) return { rows: [{ cnt: 0 }], rowCount: 1 };
  return { rows: [], rowCount: 0 };
}) as unknown as typeof pool.query;

const fundingAmounts = new Map<string, unknown>();
function recordFunding<P>(product: string, amountOf: (params: P) => unknown) {
  return async function buildFundingTransaction(params: P): Promise<never> {
    fundingAmounts.set(product, amountOf(params));
    throw new Error('stub: funding transaction not built offline');
  };
}
PaymentFundingService.prototype.buildFundingTransaction = recordFunding('payment', (params) => params.amount);
AirdropFundingService.prototype.buildFundingTransaction = recordFunding('airdrop', (params) => params.totalAmount);
GrantFundingService.prototype.buildFundingTransaction = recordFunding('grant', (params) => params.totalAmount);
BountyFundingService.prototype.buildFundingTransaction = recordFunding('bounty', (params) => params.totalPool);
RewardFundingService.prototype.buildFundingTransaction = recordFunding('reward', (params) => params.totalPool);

const app = express();
app.use(express.json());
for (const router of [paymentsRouter, airdropsRouter, grantsRouter, bountiesRouter, rewardsRouter]) {
  app.use('/api', router);
}
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', () => resolve()));
const { port } = server.address() as AddressInfo;
const base = `http://127.0.0.1:${port}/api`;

const { token } = issueBearer({
  address: CREATOR,
  pubkeyHex: '02'.padEnd(66, '0'),
  pubkeyHash: '11'.repeat(20),
  authenticatedAt: Date.now(),
});

const now = Math.floor(Date.now() / 1000);
const MONTH = 2_592_000;
const tokenFields = { tokenType: 'FUNGIBLE_TOKEN', tokenCategory: CATEGORY, tokenDecimals: 2 };

const cases: Array<{
  product: string;
  path: string;
  table: string;
  responseKey: string;
  body: Record<string, unknown>;
  constructorIndexes: Record<number, string>;
  fundingOnChain: number;
}> = [
  {
    product: 'payment',
    path: 'payments',
    table: 'payments',
    responseKey: 'payment',
    body: { ...tokenFields, recipient: RECIPIENT, amountPerPeriod: 12.5, interval: 'MONTHLY', startDate: now, endDate: now + 3 * MONTH },
    constructorIndexes: { 3: '1250', 5: '3750' },
    fundingOnChain: 3750,
  },
  {
    product: 'airdrop',
    path: 'airdrops',
    table: 'airdrops',
    responseKey: 'campaign',
    body: { ...tokenFields, title: 'drop', totalAmount: 25, amountPerClaim: 12.5, startDate: now, endDate: now + MONTH },
    constructorIndexes: { 3: '1250', 4: '2500' },
    fundingOnChain: 2500,
  },
  {
    product: 'grant',
    path: 'grants',
    table: 'grants',
    responseKey: 'grant',
    body: {
      ...tokenFields,
      title: 'grant',
      recipient: RECIPIENT,
      milestonesTotal: 3,
      amountPerMilestone: 12.5,
      totalAmount: 37.5,
      milestones: [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
    },
    constructorIndexes: { 4: '1250', 5: '3750' },
    fundingOnChain: 3750,
  },
  {
    product: 'bounty',
    path: 'bounties',
    table: 'bounties',
    responseKey: 'campaign',
    body: { ...tokenFields, title: 'bounty', rewardPerWinner: 12.5, maxWinners: 2, startDate: now, endDate: now + MONTH },
    constructorIndexes: { 3: '1250' },
    fundingOnChain: 2500,
  },
  {
    product: 'reward',
    path: 'rewards',
    table: 'rewards',
    responseKey: 'campaign',
    body: { ...tokenFields, title: 'reward', totalPool: 25, maxRewardAmount: 12.5, startDate: now, endDate: now + MONTH },
    constructorIndexes: { 3: '1250', 4: '2500' },
    fundingOnChain: 2500,
  },
];

try {
  for (const testCase of cases) {
    const createResponse = await fetch(`${base}/${testCase.path}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(testCase.body),
    });
    const createBody = await createResponse.json() as Record<string, Record<string, unknown> | undefined> & { message?: string };
    check(`${testCase.product}: create → 200${createResponse.ok ? '' : ` (${createBody.message})`}`, createResponse.ok);

    const id = String(createBody[testCase.responseKey]?.id ?? '');
    if (testCase.product === 'bounty') {
      check('bounty: create response derives cancelable from the commitment flags', createBody.campaign?.cancelable === true);
    }
    const stored = tables.get(testCase.table)?.get(id);
    check(`${testCase.product}: token_decimals stored as 2`, Number(stored?.token_decimals) === 2);

    const constructorParams = JSON.parse(String(stored?.constructor_params ?? '[]')) as Array<{ value: string }>;
    for (const [index, expected] of Object.entries(testCase.constructorIndexes)) {
      const actual = constructorParams[Number(index)]?.value;
      check(`${testCase.product}: constructor param ${index} is ${expected} base units (got ${actual})`, actual === expected);
    }

    await fetch(`${base}/${testCase.path}/${id}/funding-info`);
    const funded = Number(fundingAmounts.get(testCase.product));
    check(`${testCase.product}: funding-info asks for ${testCase.fundingOnChain} base units (got ${funded})`, funded === testCase.fundingOnChain);
  }
} finally {
  server.close();
  await pool.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
