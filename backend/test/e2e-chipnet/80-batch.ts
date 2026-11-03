// Batch streams on chipnet, BCH and CashTokens: several streams funded in one
// transaction under a vault. The stream ids are added to the streams state file so
// the claim phase of 10-streams.ts claims and cancels them too.
//   VAULT_ID=<vault uuid> E2E_STATE=<streams state file> pnpm exec tsx test/e2e-chipnet/80-batch.ts

import { readFileSync, writeFileSync } from 'node:fs';
import {
  TEST_TOKEN, alice, api, bob, check, expectOk, log, nowSec, signAndBroadcast, signIn, summary,
} from './lib.js';

const HOUR = 3600;

async function run(label: string, vaultId: string, asset: { tokenType: 'BCH' | 'FUNGIBLE_TOKEN'; tokenCategory?: string; amount: number }): Promise<string[]> {
  log(`--- ${label}`);
  const now = nowSec();
  const entries = [0, 1].map((index) => ({
    recipient: bob.address,
    totalAmount: asset.amount,
    streamType: index === 0 ? 'LINEAR' : 'STEP',
    startTime: now,
    endTime: now + 6 * HOUR,
    intervalSeconds: index === 0 ? undefined : HOUR,
    cancelable: true,
    description: `${label} ${index + 1}`,
  }));
  const built = await expectOk(`${label}: build`, api('POST', `/api/treasuries/${vaultId}/batch-create`, {
    as: alice,
    body: { senderAddress: alice.address, tokenType: asset.tokenType, tokenCategory: asset.tokenCategory, tokenDecimals: 0, entries },
  }));
  const streamIds: string[] = (built.streams ?? []).map((s: { id: string }) => s.id);
  check(`${label}: two streams built`, streamIds.length === 2, JSON.stringify(built).slice(0, 200));
  const txHash = await signAndBroadcast(`${label}: fund`, built.wcTransaction, alice);
  await expectOk(`${label}: confirm`, api('POST', `/api/treasuries/${vaultId}/batch-create/confirm`, {
    as: alice,
    body: { txHash, streamIds, batchId: built.batchId },
  }));
  for (const id of streamIds) {
    const s = await api('GET', `/api/streams/${id}`, { as: alice });
    check(`${label}: stream ${id.slice(0, 8)} active`, String(s.body?.stream?.status).toUpperCase() === 'ACTIVE', String(s.body?.stream?.status));
  }
  return streamIds;
}

async function main(): Promise<void> {
  for (const w of [alice, bob]) await signIn(w);
  const vaultId = process.env.VAULT_ID;
  const stateFile = process.env.E2E_STATE;
  if (!vaultId || !stateFile) throw new Error('set VAULT_ID and E2E_STATE');
  const state = JSON.parse(readFileSync(stateFile, 'utf8')) as Record<string, string>;
  for (const [label, asset] of [
    ['batch BCH', { tokenType: 'BCH' as const, amount: 0.0002 }],
    ['batch token', { tokenType: 'FUNGIBLE_TOKEN' as const, tokenCategory: TEST_TOKEN, amount: 600 }],
  ] as const) {
    try {
      const ids = await run(label, vaultId, asset);
      ids.forEach((id, index) => { state[`${label.replace(' ', '-')}-${index + 1}`] = id; });
      writeFileSync(stateFile, JSON.stringify(state, null, 2));
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
