// Budget plans on chipnet, BCH and CashTokens: create under a vault, fund, the
// recipient releases what's due, pause, resume, cancel.
//   cd backend && pnpm exec tsx test/e2e-chipnet/60-budgets.ts   (VAULT_ID=<vault uuid>, ASSET=bch|token)

import {
  TEST_TOKEN, alice, api, bob, check, expectOk, fundCampaign, lifecycle, log, nowSec, signAndBroadcast, signIn, summary,
} from './lib.js';

const DAY = 86400;

async function status(id: string): Promise<string> {
  const r = await api('GET', `/api/budget-plans/${id}`, { as: alice });
  return String((r.body?.plan ?? r.body?.budgetPlan ?? r.body)?.status ?? '').toUpperCase();
}

async function run(label: string, vaultId: string, asset: { tokenType: 'BCH' | 'FUNGIBLE_TOKEN'; tokenCategory?: string; total: number; per: number }): Promise<void> {
  log(`--- ${label}`);
  const created = await expectOk(`${label}: create`, api('POST', `/api/vaults/${vaultId}/budget-plans`, {
    as: alice,
    body: {
      recipient: bob.address,
      recipientName: 'Bob',
      tokenType: asset.tokenType,
      tokenCategory: asset.tokenCategory,
      tokenDecimals: 0,
      totalAmount: asset.total,
      amountPerInterval: asset.per,
      intervalSeconds: DAY,
      startDate: nowSec() - 3 * DAY,
      cancelable: true,
    },
  }));
  const id: string = created?.plan?.id ?? created?.id;
  check(`${label}: create returns an id`, typeof id === 'string', JSON.stringify(created).slice(0, 200));

  await fundCampaign('budget-plans', id, alice);
  check(`${label}: active after funding`, (await status(id)) === 'ACTIVE', await status(id));

  const release = await api('POST', `/api/budget-plans/${id}/release`, { as: bob, body: { recipientAddress: bob.address, signerAddress: bob.address } });
  if (release.status === 200) {
    check(`${label}: something to release`, Number(release.body.releasableAmount) > 0, String(release.body.releasableAmount));
    const txHash = await signAndBroadcast(`${label}: release`, release.body.wcTransaction, bob);
    await expectOk(`${label}: release confirm`, api('POST', `/api/budget-plans/${id}/confirm-release`, {
      as: bob,
      body: { releasedAmount: release.body.releasableAmount, txHash },
    }));
  } else {
    check(`${label}: release build`, false, `${release.status} ${JSON.stringify(release.body).slice(0, 300)}`);
  }

  for (const action of ['pause', 'resume', 'cancel'] as const) {
    await lifecycle({
      step: `${label}: ${action}`,
      as: alice,
      build: { path: `/api/budget-plans/${id}/${action}` },
      confirm: (_b, txHash) => ({ path: `/api/budget-plans/${id}/confirm-${action}`, body: { txHash } }),
    });
  }
  check(`${label}: cancelled`, (await status(id)) === 'CANCELLED', await status(id));
}

async function main(): Promise<void> {
  for (const w of [alice, bob]) await signIn(w);
  const vaultId = process.env.VAULT_ID;
  if (!vaultId) throw new Error('set VAULT_ID to a vault the main test wallet created');
  const only = process.env.ASSET?.toLowerCase();
  for (const [label, asset] of [
    ['budget BCH', { tokenType: 'BCH' as const, total: 0.0004, per: 0.0001 }],
    ['budget token', { tokenType: 'FUNGIBLE_TOKEN' as const, tokenCategory: TEST_TOKEN, total: 400, per: 100 }],
  ] as const) {
    if (only && !label.toLowerCase().includes(only)) continue;
    try {
      await run(label, vaultId, asset);
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
