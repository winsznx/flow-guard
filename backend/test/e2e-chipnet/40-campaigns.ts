// Bounties, rewards and grants on chipnet, BCH and CashTokens: create, fund, pay out,
// pause, resume where the product has it, cancel.
//   cd backend && pnpm exec tsx test/e2e-chipnet/40-campaigns.ts   (ONLY=bounty|reward|grant, ASSET=bch|token)

import { randomBytes } from 'node:crypto';
import {
  TEST_TOKEN, alice, api, bob, carol, check, expectOk, fundCampaign, lifecycle, log, nowSec, signIn, summary,
} from './lib.js';

const DAY = 86400;

interface Asset {
  name: 'BCH' | 'token';
  tokenType: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  unit: number;
}

const ASSETS: Asset[] = [
  { name: 'BCH', tokenType: 'BCH', unit: 0.0001 },
  { name: 'token', tokenType: 'FUNGIBLE_TOKEN', tokenCategory: TEST_TOKEN, unit: 100 },
];

function assetFields(asset: Asset): Record<string, unknown> {
  return { tokenType: asset.tokenType, tokenCategory: asset.tokenCategory, tokenDecimals: 0 };
}

async function status(kind: string, id: string): Promise<string> {
  const r = await api('GET', `/api/${kind}/${id}`, { as: alice });
  const row = r.body?.bounty ?? r.body?.campaign ?? r.body?.reward ?? r.body?.grant ?? r.body;
  return String(row?.status ?? '').toUpperCase();
}

function idOf(created: any): string {
  return created?.bounty?.id ?? created?.campaign?.id ?? created?.reward?.id ?? created?.grant?.id ?? created?.id;
}

async function control(kind: string, id: string, action: string, label: string): Promise<void> {
  await lifecycle({
    step: `${label}: ${action}`,
    as: alice,
    build: { path: `/api/${kind}/${id}/${action}` },
    confirm: (_b, txHash) => ({ path: `/api/${kind}/${id}/confirm-${action}`, body: { txHash } }),
  });
}

async function runBounty(asset: Asset): Promise<void> {
  const label = `bounty ${asset.name}`;
  const created = await expectOk(`${label}: create`, api('POST', '/api/bounties/create', {
    as: alice,
    body: {
      creator: alice.address, title: 'E2E bounty', ...assetFields(asset),
      rewardPerWinner: asset.unit, maxWinners: 3, startDate: nowSec() - DAY, endDate: nowSec() + 3 * DAY,
    },
  }));
  const id = idOf(created);
  await fundCampaign('bounties', id, alice);
  check(`${label}: active after funding`, (await status('bounties', id)) === 'ACTIVE');

  for (const winner of [bob, carol]) {
    const proofHash = randomBytes(32).toString('hex');
    await lifecycle({
      step: `${label}: pay ${winner.name}`,
      as: alice,
      build: { path: `/api/bounties/${id}/claim`, body: { winnerAddress: winner.address, proofHash, signerAddress: alice.address } },
      confirm: (built, txHash) => ({
        path: `/api/bounties/${id}/confirm-claim`,
        body: { winnerAddress: winner.address, amount: built.claimAmount, proofHash, txHash },
      }),
    });
  }
  const detail = await api('GET', `/api/bounties/${id}`, { as: alice });
  const winners: any[] = detail.body?.claims ?? detail.body?.winners ?? [];
  check(`${label}: both winners listed`, winners.length >= 2, `${winners.length}`);

  await control('bounties', id, 'pause', label);
  check(`${label}: paused`, (await status('bounties', id)) === 'PAUSED');
  await control('bounties', id, 'resume', label);
  check(`${label}: active again`, (await status('bounties', id)) === 'ACTIVE');
  await control('bounties', id, 'cancel', label);
  check(`${label}: cancelled`, (await status('bounties', id)) === 'CANCELLED');
}

async function runReward(asset: Asset): Promise<void> {
  const label = `reward ${asset.name}`;
  const created = await expectOk(`${label}: create`, api('POST', '/api/rewards/create', {
    as: alice,
    body: {
      title: 'E2E reward', rewardCategory: 'CONTRIBUTION', ...assetFields(asset),
      totalPool: asset.unit * 3, maxRewardAmount: asset.unit, startDate: nowSec() - DAY, endDate: nowSec() + 3 * DAY,
    },
  }));
  const id = idOf(created);
  await fundCampaign('rewards', id, alice);
  check(`${label}: active after funding`, (await status('rewards', id)) === 'ACTIVE');

  await lifecycle({
    step: `${label}: send to bob`,
    as: alice,
    build: { path: `/api/rewards/${id}/distribute`, body: { recipientAddress: bob.address, amount: asset.unit } },
    confirm: (built, txHash) => ({
      path: `/api/rewards/${id}/confirm-distribute`,
      body: { recipientAddress: bob.address, amount: Number(built.rewardAmount ?? asset.unit), txHash },
    }),
  });
  await control('rewards', id, 'pause', label);
  check(`${label}: paused`, (await status('rewards', id)) === 'PAUSED');
  await control('rewards', id, 'resume', label);
  check(`${label}: active again`, (await status('rewards', id)) === 'ACTIVE');
  await lifecycle({
    step: `${label}: send to carol after resume`,
    as: alice,
    build: { path: `/api/rewards/${id}/distribute`, body: { recipientAddress: carol.address, amount: asset.unit } },
    confirm: (built, txHash) => ({
      path: `/api/rewards/${id}/confirm-distribute`,
      body: { recipientAddress: carol.address, amount: Number(built.rewardAmount ?? asset.unit), txHash },
    }),
  });
  await control('rewards', id, 'cancel', label);
  check(`${label}: cancelled`, (await status('rewards', id)) === 'CANCELLED');
}

async function runGrant(asset: Asset): Promise<void> {
  const label = `grant ${asset.name}`;
  const created = await expectOk(`${label}: create`, api('POST', '/api/grants/create', {
    as: alice,
    body: {
      title: 'E2E grant', recipient: bob.address, ...assetFields(asset),
      milestonesTotal: 3, amountPerMilestone: asset.unit, totalAmount: asset.unit * 3, cancelable: true, transferable: false,
      milestones: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }],
    },
  }));
  const id = idOf(created);
  await fundCampaign('grants', id, alice);
  check(`${label}: active after funding`, (await status('grants', id)) === 'ACTIVE');

  await lifecycle({
    step: `${label}: release milestone`,
    as: alice,
    build: { path: `/api/grants/${id}/release`, body: {} },
    confirm: (built, txHash) => ({ path: `/api/grants/${id}/confirm-release`, body: { txHash, amount: built.releaseAmount, milestoneNumber: built.milestoneNumber } }),
  });
  await control('grants', id, 'pause', label);
  check(`${label}: paused`, (await status('grants', id)) === 'PAUSED');
  await control('grants', id, 'resume', label);
  check(`${label}: resumed`, (await status('grants', id)) === 'ACTIVE');
  await control('grants', id, 'cancel', label);
  check(`${label}: cancelled`, (await status('grants', id)) === 'CANCELLED');
}

async function main(): Promise<void> {
  for (const w of [alice, bob, carol]) await signIn(w);
  const only = process.env.ONLY;
  const onlyAsset = process.env.ASSET?.toLowerCase();
  for (const asset of ASSETS) {
    if (onlyAsset && onlyAsset !== asset.name.toLowerCase()) continue;
    for (const [name, run] of [['bounty', runBounty], ['reward', runReward], ['grant', runGrant]] as const) {
      if (only && only !== name) continue;
      log(`--- ${name} ${asset.name}`);
      try {
        await run(asset);
      } catch (error) {
        check(`${name} ${asset.name} finished`, false, error instanceof Error ? error.message : String(error));
      }
    }
  }
  process.exit(summary() ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
