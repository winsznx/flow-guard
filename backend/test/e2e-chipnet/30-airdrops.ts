// Airdrops on chipnet, BCH and CashTokens: create, fund, find in the claimable list,
// claim from two wallets, refuse a second claim, pause, resume, cancel.
//   cd backend && pnpm exec tsx test/e2e-chipnet/30-airdrops.ts

import {
  TEST_TOKEN, alice, api, bob, carol, check, expectOk, fundCampaign, lifecycle, log, nowSec, signAndBroadcast, signIn, summary,
  type TestWallet,
} from './lib.js';

const DAY = 86400;

async function getAirdrop(id: string): Promise<any> {
  const r = await api('GET', `/api/airdrops/${id}`, { as: alice });
  return r.body?.airdrop ?? r.body?.campaign ?? r.body;
}

async function claim(label: string, id: string, who: TestWallet): Promise<void> {
  const built = await api('POST', `/api/airdrops/${id}/claim`, { as: who, body: { claimerAddress: who.address, signerAddress: who.address } });
  if (built.status !== 200) {
    check(`${label}: claim build`, false, `${built.status} ${JSON.stringify(built.body).slice(0, 300)}`);
    return;
  }
  check(`${label}: claim amount`, Number(built.body.claimAmount) > 0, String(built.body.claimAmount));
  const txHash = await signAndBroadcast(`${label}: claim`, built.body.wcTransaction, who);
  await expectOk(`${label}: claim confirm`, api('POST', `/api/airdrops/${id}/confirm-claim`, {
    as: who,
    body: { claimerAddress: who.address, claimedAmount: built.body.claimAmount, txHash },
  }));
}

async function run(label: string, asset: { tokenType: 'BCH' | 'FUNGIBLE_TOKEN'; totalAmount: number; amountPerClaim: number }): Promise<void> {
  log(`--- ${label}`);
  const created = await expectOk(`${label}: create`, api('POST', '/api/airdrops/create', {
    as: alice,
    body: {
      creator: alice.address,
      title: `E2E ${label}`,
      campaignType: 'AIRDROP',
      tokenType: asset.tokenType,
      tokenCategory: asset.tokenType === 'FUNGIBLE_TOKEN' ? TEST_TOKEN : undefined,
      tokenDecimals: 0,
      totalAmount: asset.totalAmount,
      amountPerClaim: asset.amountPerClaim,
      startDate: nowSec() - DAY,
      endDate: nowSec() + 3 * DAY,
      requireKyc: false,
      maxClaimsPerAddress: 1,
    },
  }));
  const id = created?.campaign?.id ?? created?.airdrop?.id ?? created?.id;
  check(`${label}: create returns an id`, typeof id === 'string', JSON.stringify(created).slice(0, 200));

  await fundCampaign('airdrops', id, alice);
  check(`${label}: active after funding`, String((await getAirdrop(id))?.status).toUpperCase() === 'ACTIVE');

  const claimable = await api('GET', `/api/airdrops/claimable?address=${bob.address}`, { as: bob });
  const rows: any[] = claimable.body?.airdrops ?? claimable.body?.campaigns ?? [];
  check(`${label}: listed as claimable for bob`, rows.some((row) => row.id === id), `${claimable.status} ${rows.length} rows`);

  await claim(`${label} bob`, id, bob);
  await claim(`${label} carol`, id, carol);

  const again = await api('POST', `/api/airdrops/${id}/claim`, { as: bob, body: { claimerAddress: bob.address, signerAddress: bob.address } });
  check(`${label}: second claim by bob is refused`, again.status >= 400 && again.status < 500, `${again.status} ${JSON.stringify(again.body).slice(0, 200)}`);

  await lifecycle({
    step: `${label}: pause`,
    as: alice,
    build: { path: `/api/airdrops/${id}/pause` },
    confirm: (_b, txHash) => ({ path: `/api/airdrops/${id}/confirm-pause`, body: { txHash } }),
  });
  check(`${label}: paused`, String((await getAirdrop(id))?.status).toUpperCase() === 'PAUSED');

  await lifecycle({
    step: `${label}: resume`,
    as: alice,
    build: { path: `/api/airdrops/${id}/resume` },
    confirm: (_b, txHash) => ({ path: `/api/airdrops/${id}/confirm-resume`, body: { txHash } }),
  });
  check(`${label}: active again`, String((await getAirdrop(id))?.status).toUpperCase() === 'ACTIVE');

  await lifecycle({
    step: `${label}: cancel`,
    as: alice,
    build: { path: `/api/airdrops/${id}/cancel` },
    confirm: (_b, txHash) => ({ path: `/api/airdrops/${id}/confirm-cancel`, body: { txHash } }),
  });
  check(`${label}: cancelled`, String((await getAirdrop(id))?.status).toUpperCase() === 'CANCELLED');
}

async function main(): Promise<void> {
  for (const w of [alice, bob, carol]) await signIn(w);
  const only = process.env.ONLY;
  for (const [label, asset] of [
    ['airdrop BCH', { tokenType: 'BCH' as const, totalAmount: 0.0003, amountPerClaim: 0.0001 }],
    ['airdrop token', { tokenType: 'FUNGIBLE_TOKEN' as const, totalAmount: 300, amountPerClaim: 100 }],
  ] as const) {
    if (only && !label.includes(only)) continue;
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
