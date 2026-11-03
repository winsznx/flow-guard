/**
 * Smoke test for the streams, batches and claims fixes
 * (internal/bugfix/triage/streams.md items 1, 2, 4, 5, 6, 10, 11a, 11b, 11b-2, 11c, 11d, 12).
 *
 * Routes are mounted on a random local port with `pool.query` stubbed to return
 * fixture rows, and the tx builders get a stubbed UTXO provider.
 *
 * NO network, NO database. Runs as a standalone Node script via tsx:
 *
 *   pnpm --filter @flowguard/backend exec tsx test/streams-fixes.smoke.ts
 *
 * Exit code 0 on pass, non-zero on any assertion failure.
 */

import express from 'express';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { cashAddressToLockingBytecode, encodeCashAddress } from '@bitauth/libauth';

process.env.DATABASE_URL ??= 'postgres://stub:stub@127.0.0.1:1/stub';

const { pool } = await import('../src/database/pg.js');
const { default: streamsRouter, getStreamMaxClaims, rebaseUnfundedStreamSchedule, restoreScheduleForEarlierAddress } = await import('../src/api/streams.js');
const { issueBearer } = await import('../src/middleware/auth.js');
const { StreamDeploymentService } = await import('../src/services/StreamDeploymentService.js');
const { getStreamContractFundingSatoshis, CONTINUOUS_STREAM_CLAIM_BUDGET, MAX_RECURRING_STREAM_PAYMENTS } = await import('../src/services/StreamFundingService.js');
const { getFtStateReserveSatoshis } = await import('../src/services/FtVestingService.js');
const { StreamClaimService, StreamClaimReserveError } = await import('../src/services/StreamClaimService.js');
const { StreamCancelService } = await import('../src/services/StreamCancelService.js');
const { PaymentClaimService, getRecurringClaimLocktime } = await import('../src/services/PaymentClaimService.js');
const { streamService } = await import('../src/services/streamService.js');

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail = ''): void {
  console.log(condition ? 'PASS' : 'FAIL', name, condition ? '' : detail);
  if (condition) pass++;
  else fail++;
}

const addressFor = (byte: number) =>
  encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: new Uint8Array(20).fill(byte) }).address;
const VIEWER = addressFor(0x11);
const OTHER = addressFor(0x22);
const RECIPIENT = addressFor(0x33);
const VAULT_ID = 'vault_1700000000000_abc123xyz';
const VAULT_DB_ID = '11111111-2222-4333-8444-555555555555';
const STREAM_ID = '66666666-7777-4888-9999-000000000000';
const DAY = 86_400;
const now = Math.floor(Date.now() / 1000);

function streamRow(): Record<string, unknown> {
  return {
    id: STREAM_ID,
    stream_id: '#FG-BCH-007',
    vault_id: VAULT_ID,
    sender: VIEWER,
    recipient: RECIPIENT,
    token_type: 'BCH',
    token_decimals: 0,
    total_amount: 1,
    withdrawn_amount: 0,
    stream_type: 'LINEAR',
    start_time: now - DAY,
    end_time: now + DAY,
    cancelable: 1,
    transferable: 0,
    refillable: 0,
    status: 'ACTIVE',
    created_at: now - DAY,
    updated_at: now - DAY,
  };
}

const queries: Array<{ sql: string; params: unknown[] }> = [];
let streamFixture: () => Record<string, unknown> = streamRow;
let streamUpdateRowCount = 1;
let activityFixture: unknown[] = [];
pool.query = (async (sql: string, params: unknown[] = []) => {
  queries.push({ sql, params });
  let rows: unknown[] = [];
  if (/^\s*UPDATE streams/i.test(sql)) {
    return { rows: [], rowCount: streamUpdateRowCount };
  }
  if (/FROM vaults WHERE creator/i.test(sql) && params[0] === VIEWER) {
    rows = [{ id: VAULT_DB_ID, vault_id: VAULT_ID, creator: VIEWER, signers: JSON.stringify([VIEWER]) }];
  } else if (/FROM streams WHERE id = \$1/i.test(sql)) {
    rows = [streamFixture()];
  } else if (/FROM activity_events\s+WHERE entity_type = \$1 AND entity_id = \$2/i.test(sql)) {
    rows = activityFixture;
  } else if (/FROM stream_claims/i.test(sql)) {
    rows = [{ id: 'c1', stream_id: '#FG-BCH-007', recipient: RECIPIENT, amount: 0.1, claimed_at: now, tx_hash: 'ab'.repeat(32) }];
  } else if (/COUNT\(\*\)/i.test(sql)) {
    rows = [{ count: 0 }];
  }
  return { rows, rowCount: rows.length };
}) as unknown as typeof pool.query;

const app = express();
app.use(express.json());
app.use('/api', streamsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', () => resolve()));
const { port } = server.address() as AddressInfo;

async function get(path: string, bearer?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  queries.length = 0;
  const headers: Record<string, string> = bearer ? { Authorization: `Bearer ${bearer}` } : {};
  const response = await fetch(`http://127.0.0.1:${port}/api${path}`, { headers });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const sqlMatching = (pattern: RegExp) => queries.filter((q) => pattern.test(q.sql));

const bearerFor = (address: string) =>
  issueBearer({ address, pubkeyHex: '02' + 'aa'.repeat(32), pubkeyHash: 'ab'.repeat(20), authenticatedAt: Date.now() }).token;

try {
  // 1. Claim history reads both the UUID and the legacy logical id.
  {
    const res = await get(`/streams/${STREAM_ID}`);
    const claimQuery = sqlMatching(/FROM stream_claims/i)[0];
    check('1: GET /streams/:id → 200', res.status === 200);
    check('1: claims read by UUID and logical id', JSON.stringify(claimQuery?.params) === JSON.stringify([STREAM_ID, '#FG-BCH-007']));
    check('1: legacy claim row is returned', Array.isArray(res.body.claims) && (res.body.claims as unknown[]).length === 1);
    const source = readFileSync(new URL('../src/api/streams.ts', import.meta.url), 'utf8');
    check('1: confirm-claim inserts the UUID', /INSERT INTO stream_claims[\s\S]{0,200}randomUUID\(\),\s*id,/.test(source));
  }

  // 4. Treasury scope never lists other users' vault streams.
  {
    const res = await get('/streams?treasury=true');
    check('4: treasury without viewer → empty page', res.status === 200 && res.body.total === 0 && (res.body.streams as unknown[]).length === 0);
    check('4: treasury without viewer never queries streams', sqlMatching(/FROM streams/i).length === 0);
  }
  {
    await get('/streams?treasury=true', bearerFor(OTHER));
    check('4: viewer with no vaults never queries streams', sqlMatching(/FROM streams/i).length === 0);
  }
  {
    const res = await get(`/streams?treasury=true&viewer=${encodeURIComponent(VIEWER)}`);
    check('4: an unsigned viewer param is not trusted as identity', res.body.total === 0
      && sqlMatching(/FROM vaults WHERE creator/i).length === 0 && sqlMatching(/FROM streams/i).length === 0);
    check('4: an unsigned caller is scoped to public vaults', sqlMatching(/FROM vaults WHERE is_public = 1/i).length > 0);
  }
  {
    queries.length = 0;
    await fetch(`http://127.0.0.1:${port}/api/streams?treasury=true`, { headers: { 'x-user-address': VIEWER } });
    check('4: x-user-address alone is not trusted as identity', !queries.some((q) => /FROM vaults WHERE creator/i.test(q.sql)));
  }
  {
    await get('/streams?treasury=true', bearerFor(VIEWER));
    const listQuery = sqlMatching(/FROM streams\s+WHERE/i).at(-1);
    check('4: list filtered to the viewer vault ids', Boolean(listQuery?.sql.includes('vault_id IN'))
      && listQuery!.params.includes(VAULT_ID) && listQuery!.params.includes(VAULT_DB_ID));
  }
  {
    await get(`/streams?treasury=true&recipient=${encodeURIComponent(OTHER)}`);
    const listQuery = sqlMatching(/FROM streams\s+WHERE/i).at(-1);
    check('4: recipient + treasury keeps the recipient list (no viewer scope)', Boolean(listQuery?.sql.includes('vault_id IS NOT NULL'))
      && !listQuery!.sql.includes('vault_id IN') && listQuery!.params.includes(OTHER));
  }
  {
    await get(`/streams/activity?treasury=true&vaultId=${VAULT_ID}`);
    check('4: activity with vaultId + treasury runs without a viewer', sqlMatching(/FROM activity_events/i).length > 0);
  }
  {
    await get(`/streams/activity?treasury=true&address=${encodeURIComponent(OTHER)}`);
    check('4: activity address is not used as the treasury viewer', sqlMatching(/FROM vaults WHERE creator/i).length === 0);
  }
  {
    const res = await get('/streams/activity?treasury=true');
    check('4: activity treasury without viewer → empty', res.status === 200 && (res.body.events as unknown[]).length === 0
      && sqlMatching(/FROM activity_events/i).length === 0);
  }

  // 5 + 6. Batch runs: viewer scope and derived status.
  {
    const res = await get('/streams/batch-runs?treasury=true');
    check('5: batch treasury without viewer → empty', res.status === 200 && (res.body.batches as unknown[]).length === 0
      && sqlMatching(/stream_batches/i).length === 0);
  }
  {
    await get('/streams/batch-runs?treasury=true&status=COMPLETED', bearerFor(VIEWER));
    const listQuery = sqlMatching(/FROM stream_batches b/i).at(-1);
    check('5: batch list filtered to viewer vaults', Boolean(listQuery?.sql.includes('sb.vault_id IN')));
    check('6: status filter runs on the derived status', Boolean(listQuery?.sql.includes("THEN 'COMPLETED'"))
      && Boolean(listQuery?.sql.includes('sb.status = $')) && listQuery!.params.includes('COMPLETED'));
  }

  // 2. Token decimals reach every constructor amount.
  {
    const deployer = new StreamDeploymentService('chipnet');
    const base = {
      vaultId: 'aa'.repeat(32),
      sender: VIEWER,
      recipient: RECIPIENT,
      startTime: now,
      endTime: now + 30 * DAY,
      tokenType: 'FUNGIBLE_TOKEN' as const,
      tokenCategory: 'bb'.repeat(32),
      tokenDecimals: 2,
    };
    const recurring = await deployer.deployRecurringStream({
      ...base, streamType: 'RECURRING', totalAmount: 30, intervalSeconds: 10 * DAY, amountPerInterval: 10,
    });
    check('2: recurring amountPerInterval x 10^2', recurring.constructorParams[3].value === '1000');
    check('2: recurring totalAmount x 10^2', recurring.constructorParams[5].value === '3000');
    const hybrid = await deployer.deployHybridStream({
      ...base, streamType: 'HYBRID', totalAmount: 1.5, hybridUnlockTime: now + DAY, hybridUpfrontAmount: 0.25,
    });
    check('2: hybrid totalAmount x 10^2', hybrid.constructorParams[2].value === '150');
    check('2: hybrid upfront x 10^2', hybrid.constructorParams[6].value === '25');
    const tranche = await deployer.deployTrancheStream({
      ...base, streamType: 'TRANCHE', totalAmount: 1.5,
      trancheSchedule: [{ unlockTime: now + DAY, cumulativeAmount: 0.5 }, { unlockTime: now + 2 * DAY, cumulativeAmount: 1.5 }],
    });
    check('2: tranche cumulative x 10^2', tranche.constructorParams[6].value === '50' && tranche.constructorParams[8].value === '150');
    const vesting = await deployer.deployVestingStream({ ...base, streamType: 'STEP', totalAmount: 3, stepInterval: 10 * DAY, stepAmount: 1 });
    check('2: batch token vesting x 10^2', vesting.constructorParams[3].value === '300' && vesting.constructorParams[8].value === '100');
  }

  // 10. Rebasing moves every schedule time and keeps durations.
  {
    const deployer = new StreamDeploymentService('chipnet');
    const shift = 7 * DAY;
    const cases = [
      { type: 'LINEAR' as const, deploy: () => deployer.deployVestingStream({ vaultId: 'aa'.repeat(32), sender: VIEWER, recipient: RECIPIENT, totalAmount: 1, startTime: now, endTime: now + 30 * DAY, cliffTime: now + DAY, streamType: 'LINEAR' }), times: [4, 5, 6] },
      { type: 'HYBRID' as const, deploy: () => deployer.deployHybridStream({ vaultId: 'aa'.repeat(32), sender: VIEWER, recipient: RECIPIENT, totalAmount: 1, startTime: now, endTime: now + 30 * DAY, streamType: 'HYBRID', hybridUnlockTime: now + DAY, hybridUpfrontAmount: 0.25 }), times: [3, 4, 5] },
      { type: 'TRANCHE' as const, deploy: () => deployer.deployTrancheStream({ vaultId: 'aa'.repeat(32), sender: VIEWER, recipient: RECIPIENT, totalAmount: 1, startTime: now, endTime: now + 2 * DAY, streamType: 'TRANCHE', trancheSchedule: [{ unlockTime: now + DAY, cumulativeAmount: 0.5 }, { unlockTime: now + 2 * DAY, cumulativeAmount: 1 }] }), times: [3, 5, 7, 9, 11, 13, 15, 17, 19] },
      { type: 'RECURRING' as const, deploy: () => deployer.deployRecurringStream({ vaultId: 'aa'.repeat(32), sender: VIEWER, recipient: RECIPIENT, totalAmount: 1, startTime: now, endTime: now + 30 * DAY, streamType: 'RECURRING', intervalSeconds: 10 * DAY, amountPerInterval: 1 / 3 }), times: [6, 7] },
    ];
    for (const testCase of cases) {
      const deployed = await testCase.deploy();
      const rebased = deployer.rebaseScheduleParams(testCase.type, deployed.constructorParams, shift);
      const moved = testCase.times.every((index) =>
        BigInt(rebased.constructorParams[index].value) === BigInt(deployed.constructorParams[index].value) + BigInt(shift));
      const untouched = deployed.constructorParams.every((param, index) =>
        testCase.times.includes(index) || param.value === rebased.constructorParams[index].value);
      check(`10: ${testCase.type} times shifted, amounts untouched`, moved && untouched);
      check(`10: ${testCase.type} address re-derived`, rebased.contractAddress !== deployed.contractAddress);
    }
    const unset = StreamDeploymentService.shiftScheduleParams('RECURRING', [
      { type: 'bigint', value: '0' }, { type: 'bigint', value: '0' }, { type: 'bigint', value: '0' },
      { type: 'bigint', value: '0' }, { type: 'bigint', value: '0' }, { type: 'bigint', value: '0' },
      { type: 'bigint', value: String(now) }, { type: 'bigint', value: '0' },
    ], shift);
    check('10: open-ended end stays 0', unset[7].value === '0' && unset[6].value === String(now + shift));
  }

  // 10. Rebase rules: only the sender, only past starts, wait for the last hand-out.
  {
    const deployer = new StreamDeploymentService('chipnet');
    const created = now - 2 * DAY;
    const deployed = await deployer.deployVestingStream({
      vaultId: 'aa'.repeat(32), sender: VIEWER, recipient: RECIPIENT, totalAmount: 1,
      startTime: created, endTime: created + 30 * DAY, streamType: 'LINEAR',
    });
    const pending = (overrides: Record<string, unknown> = {}) => ({
      ...streamRow(), status: 'PENDING', tx_hash: null, batch_id: null, contract_address: '',
      constructor_params: JSON.stringify(deployed.constructorParams), nft_commitment: deployed.initialCommitment,
      start_time: created, end_time: created + 30 * DAY, cliff_timestamp: null,
      created_at: created, updated_at: created, ...overrides,
    });

    const future = pending({ start_time: now + 30 * DAY, end_time: now + 60 * DAY });
    check('10: future start is not moved', (await rebaseUnfundedStreamSchedule(future, now)).start_time === future.start_time);

    const passedFuture = pending({ start_time: now - DAY, end_time: now + 29 * DAY });
    const movedFuture = await rebaseUnfundedStreamSchedule(passedFuture, now);
    check('10: start that has passed moves to now, not by the create delay',
      movedFuture.start_time === now && movedFuture.end_time === now + 30 * DAY, JSON.stringify([movedFuture.start_time, now]));

    const recent = pending({ updated_at: now - 300 });
    check('10: no rebase within 10 minutes of the last hand-out', (await rebaseUnfundedStreamSchedule(recent, now)).start_time === created);

    const backdated = pending({ start_time: created - 30 * DAY, end_time: created });
    check('10: start set before create is kept', (await rebaseUnfundedStreamSchedule(backdated, now)).start_time === created - 30 * DAY);

    streamUpdateRowCount = 0;
    streamFixture = () => pending({ contract_address: 'stored-by-the-other-call' });
    queries.length = 0;
    const raced = await rebaseUnfundedStreamSchedule(pending(), now);
    check('10: lost race returns the stored row', raced.contract_address === 'stored-by-the-other-call');
    check('10: lost race records no event', sqlMatching(/INSERT INTO activity_events/i).length === 0);
    const guarded = sqlMatching(/^\s*UPDATE streams/i)[0];
    check('10: rebase update is guarded on the read updated_at', Boolean(guarded?.sql.includes('updated_at IS NOT DISTINCT FROM')));
    streamUpdateRowCount = 1;
    streamFixture = streamRow;

    const unauthenticated = await fetch(`http://127.0.0.1:${port}/api/streams/${STREAM_ID}/funding-info`);
    check('10: funding-info needs wallet auth', unauthenticated.status === 401);
    const { token } = issueBearer({ address: OTHER, pubkeyHex: '02' + 'aa'.repeat(32), pubkeyHash: 'ab'.repeat(20), authenticatedAt: Date.now() });
    streamFixture = () => pending({ contract_address: '' });
    queries.length = 0;
    await fetch(`http://127.0.0.1:${port}/api/streams/${STREAM_ID}/funding-info`, { headers: { Authorization: `Bearer ${token}` } });
    check('10: a non-sender never moves the schedule', sqlMatching(/^\s*UPDATE streams\s+SET contract_address/i).length === 0);
    streamFixture = streamRow;

    // A funding tx built before two rebases lands at the first address.
    const moved = pending({ contract_address: 'addr-3', start_time: created + 2 * DAY, end_time: created + 32 * DAY, constructor_params: '[]' });
    activityFixture = [
      { id: 'e2', entity_type: 'stream', entity_id: STREAM_ID, event_type: 'rescheduled', created_at: now,
        details: JSON.stringify({ shiftSeconds: DAY, previousContractAddress: 'addr-2', previousConstructorParams: [{ type: 'bigint', value: '2' }] }) },
      { id: 'e1', entity_type: 'stream', entity_id: STREAM_ID, event_type: 'rescheduled', created_at: now - 1,
        details: JSON.stringify({ shiftSeconds: DAY, previousContractAddress: 'addr-1', previousConstructorParams: [{ type: 'bigint', value: '1' }] }) },
    ];
    queries.length = 0;
    const restored = await restoreScheduleForEarlierAddress(moved, async (address: string) => address === 'addr-1');
    check('late funding at an earlier address restores that address', restored?.contract_address === 'addr-1');
    check('late funding restores the schedule that address was built from',
      restored?.start_time === created && restored?.end_time === created + 30 * DAY
      && restored?.constructor_params === JSON.stringify([{ type: 'bigint', value: '1' }]));
    check('late funding restore is guarded on PENDING with no tx',
      Boolean(sqlMatching(/^\s*UPDATE streams/i)[0]?.sql.includes("status = 'PENDING' AND tx_hash IS NULL")));
    const none = await restoreScheduleForEarlierAddress(moved, async () => false);
    check('no earlier address paid → nothing restored', none === null);
    activityFixture = [];
  }

  // 11a / 11b. Reserves sized by the schedule's claim count.
  {
    check('11a: BCH reserve covers the 12-claim budget + pause/resume', getStreamContractFundingSatoshis('BCH', 1_000_000n, CONTINUOUS_STREAM_CLAIM_BUDGET) === 1_000_000n + 14n * 4000n + 546n);
    check('11a: reserve has a hard ceiling', getStreamContractFundingSatoshis('BCH', 0n, 2_000_000) === BigInt(MAX_RECURRING_STREAM_PAYMENTS + 2) * 4000n + 546n);
    const stepRow = (stepInterval: number, days: number) => ({
      stream_type: 'STEP', start_time: now, end_time: now + days * DAY, interval_seconds: stepInterval,
    });
    check('11a: 4-year daily STEP capped at the budget', getStreamMaxClaims(stepRow(DAY, 4 * 365)) === CONTINUOUS_STREAM_CLAIM_BUDGET);
    check('11a: 1-minute STEP capped at the budget', getStreamMaxClaims(stepRow(60, 4 * 365)) === CONTINUOUS_STREAM_CLAIM_BUDGET);
    check('11a: 1-minute STEP reserve stays under 0.001 BCH',
      getStreamContractFundingSatoshis('BCH', 0n, getStreamMaxClaims(stepRow(60, 4 * 365))) < 100_000n);
    check('11a: short STEP sized by its steps', getStreamMaxClaims(stepRow(DAY, 4)) === 4);
    check('11a: LINEAR uses the budget', getStreamMaxClaims({ stream_type: 'LINEAR', start_time: now, end_time: now + 30 * DAY }) === CONTINUOUS_STREAM_CLAIM_BUDGET);
    check('11a: RECURRING sized by payments, capped',
      getStreamMaxClaims({ stream_type: 'RECURRING', start_time: now, end_time: now + 52 * 7 * DAY, interval_seconds: 7 * DAY }) === 52
      && getStreamMaxClaims({ stream_type: 'RECURRING', start_time: now, end_time: now + 1000 * DAY, interval_seconds: DAY }) === MAX_RECURRING_STREAM_PAYMENTS);
    const createSource = readFileSync(new URL('../src/api/streams.ts', import.meta.url), 'utf8');
    check('11a: single and batch create refuse more than the recurring cap',
      (createSource.match(/intervalCount > MAX_RECURRING_STREAM_PAYMENTS/g) || []).length === 2);
    check('11a: BCH reserve never below default', getStreamContractFundingSatoshis('BCH', 1n, 0.0001) >= 5_001n);
    check('11b: token reserve at 5000 per spend', getStreamContractFundingSatoshis('FUNGIBLE_TOKEN', 0n, 10) === 12n * 5000n + 546n);
    check('11b: token reserve never below 20000', getStreamContractFundingSatoshis('FUNGIBLE_TOKEN', 0n, 1) === 20_000n);
    check('11b: FT state reserve sized by claims', getFtStateReserveSatoshis(8) === 8n * 5000n + 4000n + 546n);
    check('11b: FT state reserve capped at the budget', getFtStateReserveSatoshis(1_000_000) === 12n * 5000n + 4000n + 546n);
  }

  // 11a. Claim guard and split cancel stay inside the covenant limits.
  {
    const deployer = new StreamDeploymentService('chipnet');
    const startTime = now - 10 * DAY;
    const deployed = await deployer.deployVestingStream({
      vaultId: 'aa'.repeat(32), sender: VIEWER, recipient: RECIPIENT, totalAmount: 0.01,
      startTime, endTime: startTime + 20 * DAY, streamType: 'LINEAR',
    });
    const constructorParams = deployed.constructorParams.map((param) =>
      (param.type === 'bytes' ? Buffer.from(param.value, 'hex') : BigInt(param.value)));
    const principal = 1_000_000n;
    const utxoWith = (satoshis: bigint) => [{
      txid: 'cd'.repeat(32), vout: 0, satoshis,
      token: { category: 'ef'.repeat(32), amount: 0n, nft: { capability: 'mutable', commitment: deployed.initialCommitment } },
    }];
    const claimParams = {
      streamId: '#FG-BCH-008', contractAddress: deployed.contractAddress, recipient: RECIPIENT,
      totalAmount: Number(principal), totalReleased: 0, startTime, endTime: startTime + 20 * DAY,
      currentTime: now, streamType: 'LINEAR' as const, tokenType: 'BCH' as const,
      constructorParams, currentCommitment: deployed.initialCommitment,
    };

    const legacy = new StreamClaimService('chipnet');
    (legacy['provider'] as { getUtxos: unknown }).getUtxos = async () => utxoWith(principal + 5_000n);
    let guardError: unknown = null;
    try {
      await legacy.buildClaimTransaction(claimParams);
    } catch (error) {
      guardError = error;
    }
    check('11a: partial claim refused when it strands the last claim', guardError instanceof StreamClaimReserveError);
    check('11a: guard message has no banned words', guardError instanceof Error && !/vest|unlock|units|contract/i.test(guardError.message));
    check('11a: guard carries the one-go claim time, not a UTC date string',
      guardError instanceof StreamClaimReserveError && guardError.claimableFrom === startTime + 20 * DAY + 7200
      && !/\d{4}-\d{2}-\d{2}/.test(guardError.message));
    const deferredLegacy = await legacy.getClaimDeferredUntil({
      contractAddress: deployed.contractAddress, totalAmount: Number(principal), startTime, endTime: startTime + 20 * DAY,
      currentTime: now, tokenType: 'BCH',
    });
    check('11a: detail flag set for a legacy-reserve stream', deferredLegacy === startTime + 20 * DAY + 7200);

    const sized = new StreamClaimService('chipnet');
    const fundedSatoshis = getStreamContractFundingSatoshis('BCH', principal, CONTINUOUS_STREAM_CLAIM_BUDGET);
    (sized['provider'] as { getUtxos: unknown }).getUtxos = async () => utxoWith(fundedSatoshis);
    const claim = await sized.buildClaimTransaction(claimParams);
    check('11a: claim with sized reserve builds', claim.claimableAmount > 0);
    const deferredSized = await sized.getClaimDeferredUntil({
      contractAddress: deployed.contractAddress, totalAmount: Number(principal), startTime, endTime: startTime + 20 * DAY,
      currentTime: now, tokenType: 'BCH',
    });
    check('11a: detail flag clear for a sized-reserve stream', deferredSized === null);
    const ended = await legacy.getClaimDeferredUntil({
      contractAddress: deployed.contractAddress, totalAmount: Number(principal), startTime, endTime: startTime + 20 * DAY,
      currentTime: startTime + 21 * DAY, tokenType: 'BCH',
    });
    check('11a: detail flag clear once it can all be claimed', ended === null);

    // A STEP stream with far more steps than the budget: claims run until one fee is left.
    const stepDeployed = await deployer.deployVestingStream({
      vaultId: 'aa'.repeat(32), sender: VIEWER, recipient: RECIPIENT, totalAmount: 0.01,
      startTime, endTime: startTime + 100 * DAY, streamType: 'STEP', stepInterval: DAY, stepAmount: 0.0001,
    });
    const stepParams = stepDeployed.constructorParams.map((param) =>
      (param.type === 'bytes' ? Buffer.from(param.value, 'hex') : BigInt(param.value)));
    const stepClaimParams = {
      ...claimParams, contractAddress: stepDeployed.contractAddress, endTime: startTime + 100 * DAY,
      streamType: 'STEP' as const, stepInterval: DAY, stepAmount: 10_000, constructorParams: stepParams,
      currentCommitment: stepDeployed.initialCommitment,
    };
    const stepUtxo = (satoshis: bigint) => [{
      txid: 'cd'.repeat(32), vout: 0, satoshis,
      token: { category: 'ef'.repeat(32), amount: 0n, nft: { capability: 'mutable', commitment: stepDeployed.initialCommitment } },
    }];
    const stepService = new StreamClaimService('chipnet');
    (stepService['provider'] as { getUtxos: unknown }).getUtxos = async () => stepUtxo(principal + 8_546n);
    const lastPartial = await stepService.buildClaimTransaction(stepClaimParams);
    check('11a: STEP partial claim allowed while two fees are left', lastPartial.claimableAmount > 0);
    (stepService['provider'] as { getUtxos: unknown }).getUtxos = async () => stepUtxo(principal + 8_545n);
    let stepGuard: unknown = null;
    try {
      await stepService.buildClaimTransaction(stepClaimParams);
    } catch (error) {
      stepGuard = error;
    }
    check('11a: STEP partial claim refused when it strands the rest', stepGuard instanceof StreamClaimReserveError);

    const cancel = new StreamCancelService('chipnet');
    (cancel['provider'] as { getUtxos: unknown }).getUtxos = async () => utxoWith(fundedSatoshis);
    const cancelTx = await cancel.buildCancelTransaction({
      streamType: 'LINEAR', contractAddress: deployed.contractAddress, sender: VIEWER, recipient: RECIPIENT,
      currentTime: now, constructorParams, currentCommitment: deployed.initialCommitment,
    });
    const outputs = (cancelTx.wcTransaction.transaction as { outputs: unknown[] }).outputs;
    // New streams deploy VestingCovenantV2, whose cancel allows a third output, so the
    // unused reserve goes back to the sender instead of being burned.
    check('11a: V2 split cancel returns the leftover reserve on a third output', cancelTx.vestedAmount > 0 && cancelTx.unvestedAmount > 0 && outputs.length === 3);
    const paidOut = (outputs as Array<{ valueSatoshis: bigint }>).reduce((sum, output) => sum + BigInt(output.valueSatoshis), 0n);
    check('11a: V2 split cancel only spends the network fee', fundedSatoshis - paidOut <= 4000n,
      String(fundedSatoshis - paidOut));
    // Cancel before the first step: VestingCovenant.cancel() checks output[0] as the
    // sender's unvested part (VM-checked in contracts/tests/current/streaming/VestingCancelOutputs.test.mjs).
    const earlyStart = now - DAY / 2;
    const early = await deployer.deployVestingStream({
      vaultId: 'aa'.repeat(32), sender: VIEWER, recipient: RECIPIENT, totalAmount: 0.01,
      startTime: earlyStart, endTime: earlyStart + 10 * DAY, streamType: 'STEP', stepInterval: DAY, stepAmount: 0.001,
    });
    const earlyParams = early.constructorParams.map((param) =>
      (param.type === 'bytes' ? Buffer.from(param.value, 'hex') : BigInt(param.value)));
    const earlyService = new StreamCancelService('chipnet');
    const earlyFunded = getStreamContractFundingSatoshis('BCH', principal, CONTINUOUS_STREAM_CLAIM_BUDGET);
    (earlyService['provider'] as { getUtxos: unknown }).getUtxos = async () => [{
      txid: 'cd'.repeat(32), vout: 0, satoshis: earlyFunded,
      token: { category: 'ef'.repeat(32), amount: 0n, nft: { capability: 'mutable', commitment: early.initialCommitment } },
    }];
    const earlyCancel = await earlyService.buildCancelTransaction({
      streamType: 'STEP', contractAddress: early.contractAddress, sender: VIEWER, recipient: RECIPIENT,
      currentTime: now, constructorParams: earlyParams, currentCommitment: early.initialCommitment,
    });
    const earlyOutputs = (earlyCancel.wcTransaction.transaction as {
      outputs: Array<{ lockingBytecode: Uint8Array; valueSatoshis: bigint }>;
    }).outputs;
    const senderLock = cashAddressToLockingBytecode(VIEWER);
    const senderHex = typeof senderLock === 'string' ? '' : Buffer.from(senderLock.bytecode).toString('hex');
    const lockHex = (output: { lockingBytecode: Uint8Array } | undefined) =>
      output ? Buffer.from(output.lockingBytecode).toString('hex') : '';
    check('cancel before the first step: nothing vested', earlyCancel.vestedAmount === 0 && earlyCancel.unvestedAmount === Number(principal));
    check('cancel before the first step: output[0] is the sender with the unvested part',
      lockHex(earlyOutputs[0]) === senderHex && BigInt(earlyOutputs[0].valueSatoshis) === principal);
    check('cancel before the first step: no dust output to the recipient',
      !earlyOutputs.some((output) => lockHex(output) !== senderHex));
    check('cancel before the first step: the leftover reserve comes back as change at output[1]',
      earlyOutputs.length === 2 && BigInt(earlyOutputs[1].valueSatoshis) > 546n);
  }

  // 11c / 11d. Recurring claim timing.
  {
    const end = now - 3 * 3600;
    check('11c: locktime capped at the end', getRecurringClaimLocktime(now, end) === end);
    check('11c: no end → lagged clock', getRecurringClaimLocktime(now) === now - 7200);
    const service = new PaymentClaimService('chipnet');
    const base = {
      paymentId: 'p', contractAddress: '', recipient: RECIPIENT, amountPerInterval: 10, intervalSeconds: DAY,
      totalPaid: 0, currentTime: now, constructorParams: [], currentCommitment: '',
    };
    check('11c: last payment due at the end is claimable', service.calculateClaimable({ ...base, nextPaymentTime: end, endTime: end }).amount === 10);
    check('11d: payment due 1h ago is not offered yet', service.calculateClaimable({ ...base, nextPaymentTime: now - 3600 }).amount === 0);
    check('11d: payment due 3h ago is claimable', service.calculateClaimable({ ...base, nextPaymentTime: now - 3 * 3600 }).amount === 10);

    const step = {
      ...streamRow(), stream_type: 'STEP', status: 'ACTIVE', total_amount: 3, withdrawn_amount: 0,
      interval_seconds: DAY, step_amount: 1, end_time: now + 3 * DAY,
    } as unknown as Parameters<typeof streamService.getClaimableAmount>[0];
    check('11d: 1h past a step → nothing claimable yet', streamService.getClaimableAmount({ ...step, start_time: now - DAY - 3600 }) === 0);
    check('11d: 3h past a step → one step claimable', streamService.getClaimableAmount({ ...step, start_time: now - DAY - 3 * 3600 }) === 1);
    check('11d: vested amount still uses now', streamService.computeVestedAmount({ ...step, start_time: now - DAY - 3600 }) === 1);
  }

  // 11b-2. New streams deploy the V2 covenants, which pay token claims, so token
  // streams on every schedule and in batches are no longer refused at create.
  {
    const source = readFileSync(new URL('../src/api/streams.ts', import.meta.url), 'utf8');
    check('11b-2: single create takes token recurring', !/getTokenRecurringPaymentError\(/.test(source));
    check('11b-2: single create takes token tranche and hybrid', !/getSingleUtxoTokenStreamError\(/.test(source));
    check('11b-2: batch create takes token lanes', !/normalizedBatchTokenType === 'FUNGIBLE_TOKEN'\) \{\s*return res\.status\(400\)/.test(source));
  }

  // 12. Server-written wallet prompts use plain words.
  {
    const files = [
      'StreamClaimService.ts', 'StreamCancelService.ts', 'StreamFundingService.ts',
      'StreamControlService.ts', 'FtVestingService.ts',
    ].map((name) => readFileSync(new URL(`../src/services/${name}`, import.meta.url), 'utf8'));
    files.push(readFileSync(new URL('../src/api/streams.ts', import.meta.url), 'utf8'));
    const prompts = files.flatMap((source) =>
      [...source.matchAll(/(?:userPrompt|ANCHOR_PREP_PROMPT)\s*[:=?]+\s*(?:params\.userPrompt \?\? )?([`'"])(.*?)\1/g)].map((m) => m[2]));
    check('12: prompts found', prompts.length >= 12, String(prompts.length));
    const banned = prompts.filter((prompt) => /vest|unlock|units|contract|transfer|CashToken|\$\{(?!items\.length\})/i.test(prompt));
    check('12: no banned words, amounts or addresses in prompts', banned.length === 0, JSON.stringify(banned));
  }

} finally {
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
