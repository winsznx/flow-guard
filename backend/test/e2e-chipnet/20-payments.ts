// Recurring payments on chipnet, BCH and CashTokens: create, fund, claim twice, pause,
// resume, cancel.
//   cd backend && pnpm exec tsx test/e2e-chipnet/20-payments.ts

import {
  TEST_TOKEN, alice, api, bob, check, expectOk, lifecycle, log, nowSec, signAndBroadcast, signIn, summary,
} from './lib.js';

const DAY = 86400;

async function getPayment(id: string): Promise<any> {
  const r = await api('GET', `/api/payments/${id}`, { as: alice });
  return r.body?.payment ?? r.body;
}

async function control(id: string, action: 'pause' | 'resume' | 'cancel'): Promise<void> {
  await lifecycle({
    step: `payment ${id.slice(0, 8)}: ${action}`,
    as: alice,
    build: { path: `/api/payments/${id}/${action}` },
    confirm: (_b, txHash) => ({ path: `/api/payments/${id}/confirm-${action}`, body: { txHash } }),
  });
}

async function run(label: string, asset: { tokenType: 'BCH' | 'FUNGIBLE_TOKEN'; tokenCategory?: string; perPeriod: number }): Promise<void> {
  log(`--- ${label}`);
  const created = await expectOk(`${label}: create`, api('POST', '/api/payments/create', {
    as: alice,
    body: {
      recipient: bob.address,
      recipientName: 'Bob',
      tokenType: asset.tokenType,
      tokenCategory: asset.tokenCategory,
      tokenDecimals: 0,
      amountPerPeriod: asset.perPeriod,
      interval: 'DAILY',
      startDate: nowSec() - 3 * DAY,
      endDate: nowSec() + 2 * DAY,
      pausable: true,
    },
  }));
  const id = created?.payment?.id ?? created?.id;
  check(`${label}: create returns an id`, typeof id === 'string', JSON.stringify(created).slice(0, 200));

  await lifecycle({
    step: `${label}: fund`,
    as: alice,
    build: { method: 'GET', path: `/api/payments/${id}/funding-info` },
    pick: (built) => {
      if (built.needsAnchor) throw new Error('funding info asks for an anchor step');
      return built.wcTransaction;
    },
    confirm: (_b, txHash) => ({ path: `/api/payments/${id}/confirm-funding`, body: { txHash } }),
  });
  check(`${label}: active after funding`, String((await getPayment(id))?.status).toUpperCase() === 'ACTIVE');

  for (const round of [1, 2]) {
    const claim = await api('POST', `/api/payments/${id}/claim`, { as: bob, body: { recipientAddress: bob.address, signerAddress: bob.address } });
    if (claim.status !== 200) {
      check(`${label}: claim ${round} build`, false, `${claim.status} ${JSON.stringify(claim.body).slice(0, 300)}`);
      break;
    }
    check(`${label}: claim ${round} amount`, Number(claim.body.claimableAmount) > 0, String(claim.body.claimableAmount));
    const txHash = await signAndBroadcast(`${label}: claim ${round}`, claim.body.wcTransaction, bob);
    await expectOk(`${label}: claim ${round} confirm`, api('POST', `/api/payments/${id}/confirm-claim`, {
      as: bob,
      body: { claimedAmount: claim.body.claimableAmount, intervalsClaimed: claim.body.intervalsClaimable, txHash },
    }));
  }

  await control(id, 'pause');
  check(`${label}: paused`, String((await getPayment(id))?.status).toUpperCase() === 'PAUSED');
  await control(id, 'resume');
  check(`${label}: resumed`, String((await getPayment(id))?.status).toUpperCase() === 'ACTIVE');
  await control(id, 'cancel');
  check(`${label}: cancelled`, String((await getPayment(id))?.status).toUpperCase() === 'CANCELLED');
}

async function main(): Promise<void> {
  for (const w of [alice, bob]) await signIn(w);
  const only = process.env.ASSET?.toLowerCase();
  for (const [label, asset] of [
    ['payment BCH', { tokenType: 'BCH' as const, perPeriod: 0.00005 }],
    ['payment token', { tokenType: 'FUNGIBLE_TOKEN' as const, tokenCategory: TEST_TOKEN, perPeriod: 10 }],
  ] as const) {
    if (only && !label.toLowerCase().includes(only)) continue;
    try {
      await run(label, asset);
    } catch (error) {
      check(`${label} finished`, false, error instanceof Error ? error.message : String(error));
    }
  }
  process.exit(summary() ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
