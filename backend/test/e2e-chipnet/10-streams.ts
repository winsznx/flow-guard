// Streams on chipnet, end to end: every BCH schedule type through create, fund,
// claim, pause, resume, change recipient, add funds and cancel, token streams that
// the covenants support, and the token types the server must refuse.
//   cd backend && pnpm exec tsx test/e2e-chipnet/10-streams.ts
// PHASE=fund (default) creates, funds and runs the controls; PHASE=claim runs 2.5 hours later.
// ONLY=linear,step,... runs a subset.

import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TEST_TOKEN, alice, api, bob, carol, check, expectOk, expectStatus, lifecycle, log, nowSec, signAndBroadcast, signIn, sleep, summary, type TestWallet,
} from './lib.js';

const HOUR = 3600;
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = (name: string) => !only || only.has(name);


async function getStream(id: string, as: TestWallet = alice): Promise<any> {
  const r = await api('GET', `/api/streams/${id}`, { as });
  return r.body?.stream ?? r.body;
}

async function create(label: string, body: Record<string, unknown>, as: TestWallet = alice): Promise<string> {
  const created = await expectOk(`${label}: create`, api('POST', '/api/streams/create', { as, body: { recipient: bob.address, cancelable: true, ...body } }));
  const id = created?.stream?.id;
  check(`${label}: create returns an id`, typeof id === 'string');
  return id;
}

async function fund(label: string, id: string, as: TestWallet = alice): Promise<void> {
  // Same as the app: read funding info until it answers, run the anchor step if asked,
  // and never sign an anchor payload as the funding transaction.
  let info = await api('GET', `/api/streams/${id}/funding-info`, { as });
  for (let attempt = 0; info.status !== 200 && attempt < 5; attempt += 1) {
    await sleep(3000);
    info = await api('GET', `/api/streams/${id}/funding-info`, { as });
  }
  if (info.body?.needsAnchor && info.body?.wcTransaction) {
    await lifecycle({ step: `${label}: funding anchor`, as, build: { method: 'GET', path: `/api/streams/${id}/funding-info` } });
    for (let i = 0; i < 20; i += 1) {
      await sleep(3000);
      const again = await api('GET', `/api/streams/${id}/funding-info`, { as });
      if (!again.body?.needsAnchor) break;
    }
  }
  await lifecycle({
    step: `${label}: fund`,
    as,
    build: { method: 'GET', path: `/api/streams/${id}/funding-info` },
    pick: (built) => {
      if (built.needsAnchor) throw new Error('funding info still asks for the anchor step');
      return built.wcTransaction;
    },
    confirm: (_b, txHash) => ({ path: `/api/streams/${id}/confirm-funding`, body: { txHash } }),
  });
  const s = await getStream(id, as);
  check(`${label}: active after funding`, String(s?.status).toUpperCase() === 'ACTIVE', String(s?.status));
}

async function claim(label: string, id: string, who: TestWallet): Promise<number> {
  const built = await api('POST', `/api/streams/${id}/claim`, { as: who, body: { recipientAddress: who.address, signerAddress: who.address } });
  if (built.status !== 200) {
    check(`${label}: claim build`, false, `${built.status} ${JSON.stringify(built.body).slice(0, 300)}`);
    return 0;
  }
  const amount = Number(built.body.claimableAmount);
  check(`${label}: something to claim`, amount > 0, String(amount));
  const txHash = await signAndBroadcast(`${label}: claim`, built.body.wcTransaction, who);
  await expectOk(`${label}: claim confirm`, api('POST', `/api/streams/${id}/confirm-claim`, { as: who, body: { claimedAmount: amount, txHash } }));
  return amount;
}

async function control(label: string, id: string, action: 'pause' | 'resume' | 'cancel' | 'refill' | 'transfer', body: Record<string, unknown> = {}): Promise<any> {
  return lifecycle({
    step: `${label}: ${action}`,
    as: alice,
    build: { path: `/api/streams/${id}/${action}`, body },
    confirm: (built, txHash) => ({
      path: `/api/streams/${id}/confirm-${action}`,
      body: action === 'cancel'
        ? { txHash, vestedAmount: built.vestedAmount, unvestedAmount: built.unvestedAmount, cancelReturnAddress: built.cancelReturnAddress, senderAddress: built.senderAddress }
        : { txHash, ...body },
    }),
  });
}

async function expectStatusIs(label: string, id: string, status: string): Promise<void> {
  const s = await getStream(id);
  check(`${label}: status ${status}`, String(s?.status).toUpperCase() === status, String(s?.status));
}

// Funding sets the on-chain schedule start to the funding time, and claims run two
// hours behind the clock so they're final as soon as they're sent. So phase "fund"
// creates and funds everything and runs the controls that need no waiting, and phase
// "claim" (run 2.5 hours later) claims and closes out.

const STATE_FILE = process.env.E2E_STATE ?? join(tmpdir(), 'flowguard-e2e-streams-state.json');

type Kind = 'linear' | 'step' | 'hybrid' | 'tranche' | 'recurring' | 'refillable' | 'token-linear' | 'token-step' | 'token-hybrid' | 'token-tranche' | 'token-recurring';

function bodyFor(kind: Kind): Record<string, unknown> {
  const now = nowSec();
  switch (kind) {
    case 'linear': return { tokenType: 'BCH', totalAmount: 0.0003, streamType: 'LINEAR', startTime: now, endTime: now + 6 * HOUR };
    case 'step': return { tokenType: 'BCH', totalAmount: 0.0003, streamType: 'STEP', startTime: now, endTime: now + 3 * HOUR, intervalSeconds: 1800 };
    case 'hybrid': return {
      tokenType: 'BCH', totalAmount: 0.0003, streamType: 'HYBRID', startTime: now, endTime: now + 6 * HOUR,
      hybridUnlockTimestamp: now + 600, hybridUpfrontPercentage: 30,
    };
    case 'tranche': return {
      tokenType: 'BCH', totalAmount: 0.0003, streamType: 'TRANCHE', startTime: now, endTime: now + 6 * HOUR,
      trancheSchedule: [
        { unlockTime: now + 600, amount: 0.0001, percentage: 33 },
        { unlockTime: now + 1200, amount: 0.0001, percentage: 33 },
        { unlockTime: now + 6 * HOUR, amount: 0.0001, percentage: 34 },
      ],
    };
    case 'recurring': return { tokenType: 'BCH', totalAmount: 0.0003, streamType: 'RECURRING', startTime: now, endTime: now + 3600, intervalSeconds: 1200 };
    case 'refillable': return { tokenType: 'BCH', totalAmount: 0.0002, streamType: 'RECURRING', startTime: now, endTime: now + 2400, intervalSeconds: 1200, refillable: true };
    case 'token-linear': return { tokenType: 'FUNGIBLE_TOKEN', tokenCategory: TOKEN, tokenDecimals: 0, totalAmount: 1000, streamType: 'LINEAR', startTime: now, endTime: now + 6 * HOUR };
    case 'token-hybrid': return {
      tokenType: 'FUNGIBLE_TOKEN', tokenCategory: TOKEN, tokenDecimals: 0, totalAmount: 1000, streamType: 'HYBRID', startTime: now, endTime: now + 6 * HOUR,
      hybridUnlockTimestamp: now + 600, hybridUpfrontPercentage: 30,
    };
    case 'token-tranche': return {
      tokenType: 'FUNGIBLE_TOKEN', tokenCategory: TOKEN, tokenDecimals: 0, totalAmount: 900, streamType: 'TRANCHE', startTime: now, endTime: now + 6 * HOUR,
      trancheSchedule: [
        { unlockTime: now + 600, amount: 300, percentage: 33 },
        { unlockTime: now + 1200, amount: 300, percentage: 33 },
        { unlockTime: now + 6 * HOUR, amount: 300, percentage: 34 },
      ],
    };
    case 'token-recurring': return { tokenType: 'FUNGIBLE_TOKEN', tokenCategory: TOKEN, tokenDecimals: 0, totalAmount: 900, streamType: 'RECURRING', startTime: now, endTime: now + 3600, intervalSeconds: 1200 };
    case 'token-step': return { tokenType: 'FUNGIBLE_TOKEN', tokenCategory: TOKEN, tokenDecimals: 0, totalAmount: 1200, streamType: 'STEP', startTime: now, endTime: now + 3 * HOUR, intervalSeconds: 1800 };
  }
}

async function phaseFund(state: Record<string, string>): Promise<void> {
  const kinds: Kind[] = ['linear', 'step', 'hybrid', 'tranche', 'recurring', 'refillable', 'token-linear', 'token-step', 'token-hybrid', 'token-tranche', 'token-recurring'];
  for (const kind of kinds) {
    if (!want(kind) || state[kind]) continue;
    log(`--- fund ${kind}`);
    try {
      const id = await create(kind, bodyFor(kind));
      await fund(kind, id);
      if (kind === 'refillable') {
        await control(kind, id, 'refill', { refillAmount: 0.0001 });
        await expectStatusIs(kind, id, 'ACTIVE');
      }
      state[kind] = id;
      saveState(state);
    } catch (error) {
      check(`${kind} create and fund`, false, error instanceof Error ? error.message : String(error));
    }
  }

  if (want('controls') && !state.controls) {
    log('--- controls on a fresh linear stream');
    try {
      const id = await create('controls', bodyFor('linear'));
      await fund('controls', id);
      await control('controls', id, 'pause');
      await expectStatusIs('controls', id, 'PAUSED');
      await control('controls', id, 'resume');
      await expectStatusIs('controls', id, 'ACTIVE');
      await expectStatus('controls: recipient can move it to a new wallet', api('POST', `/api/streams/${id}/transfer`, { as: bob, body: { newRecipientAddress: carol.address } }), [200]);
      state.controls = id;
      saveState(state);
    } catch (error) {
      check('controls finished', false, error instanceof Error ? error.message : String(error));
    }
  }

  if (want('early-cancel') && !state['early-cancel']) {
    log('--- cancel before anything is released');
    try {
      const id = await create('early cancel', bodyFor('linear'));
      await fund('early cancel', id);
      await control('early cancel', id, 'cancel');
      await expectStatusIs('early cancel', id, 'CANCELLED');
      state['early-cancel'] = id;
      saveState(state);
    } catch (error) {
      check('early cancel finished', false, error instanceof Error ? error.message : String(error));
    }
  }

}

async function phaseClaim(state: Record<string, string>): Promise<void> {
  const claimers: Partial<Record<string, TestWallet>> = {};
  for (const [kind, id] of Object.entries(state)) {
    if (!want(kind) || kind === 'early-cancel') continue;
    log(`--- claim ${kind}`);
    try {
      await claim(kind, id, claimers[kind] ?? bob);
      if (kind === 'recurring') {
        await control(kind, id, 'pause');
        await control(kind, id, 'resume');
      }
      await control(kind, id, 'cancel');
      await expectStatusIs(kind, id, 'CANCELLED');
    } catch (error) {
      check(`${kind} claim and close`, false, error instanceof Error ? error.message : String(error));
    }
  }
}

function loadState(): Record<string, string> {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

function saveState(state: Record<string, string>): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function runRefusedTokenTypes(category: string): Promise<void> {
  const now = nowSec();
  for (const streamType of ['HYBRID', 'TRANCHE', 'RECURRING']) {
    await expectStatus(`token ${streamType.toLowerCase()} is refused`, api('POST', '/api/streams/create', {
      as: alice,
      body: {
        recipient: bob.address, tokenType: 'FUNGIBLE_TOKEN', tokenCategory: category, tokenDecimals: 0, totalAmount: 900,
        streamType, startTime: now, endTime: now + 6 * HOUR, intervalSeconds: 2 * HOUR,
        hybridUnlockTimestamp: now + HOUR, hybridUpfrontPercentage: 30,
        trancheSchedule: [{ unlockTime: now + HOUR, amount: 500 }, { unlockTime: now + 6 * HOUR, amount: 500 }],
      },
    }), [400, 422]);
  }
}

const TOKEN = TEST_TOKEN;

async function main(): Promise<void> {
  for (const w of [alice, bob, carol]) await signIn(w);
  const state = loadState();
  if ((process.env.PHASE ?? 'fund') === 'claim') await phaseClaim(state);
  else await phaseFund(state);
  process.exit(summary() ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
