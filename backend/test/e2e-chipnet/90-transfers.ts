// Recipient transfers on chipnet: streams are transferable unless the sender turns it
// off, the recipient moves the stream to a new wallet, and a stream created with
// transfers off refuses. BCH and both token covenant layouts.
//   cd backend && pnpm exec tsx test/e2e-chipnet/90-transfers.ts

import {
  TEST_TOKEN, alice, api, bob, carol, check, expectOk, expectStatus, lifecycle, log, nowSec, signIn, sleep, summary,
} from './lib.js';

const HOUR = 3600;

async function createAndFund(label: string, body: Record<string, unknown>): Promise<string> {
  const created = await expectOk(`${label}: create`, api('POST', '/api/streams/create', { as: alice, body: { recipient: bob.address, cancelable: true, ...body } }));
  const id: string = created.stream.id;
  check(`${label}: transferable flag stored`, created.stream.transferable === (body.transferable !== false), String(created.stream.transferable));
  let info = await api('GET', `/api/streams/${id}/funding-info`, { as: alice });
  if (info.body?.needsAnchor && info.body?.wcTransaction) {
    await lifecycle({ step: `${label}: funding anchor`, as: alice, build: { method: 'GET', path: `/api/streams/${id}/funding-info` } });
    for (let i = 0; i < 20 && info.body?.needsAnchor; i += 1) {
      await sleep(3000);
      info = await api('GET', `/api/streams/${id}/funding-info`, { as: alice });
    }
  }
  await lifecycle({
    step: `${label}: fund`,
    as: alice,
    build: { method: 'GET', path: `/api/streams/${id}/funding-info` },
    pick: (built) => {
      if (built.needsAnchor) throw new Error('funding info still asks for the anchor step');
      return built.wcTransaction;
    },
    confirm: (_b, txHash) => ({ path: `/api/streams/${id}/confirm-funding`, body: { txHash } }),
  });
  return id;
}

async function run(label: string, body: Record<string, unknown>): Promise<void> {
  log(`--- ${label}`);
  const id = await createAndFund(label, body);
  await lifecycle({
    step: `${label}: bob moves it to carol`,
    as: bob,
    build: { path: `/api/streams/${id}/transfer`, body: { newRecipientAddress: carol.address } },
    confirm: (_b, txHash) => ({ path: `/api/streams/${id}/confirm-transfer`, body: { txHash, newRecipientAddress: carol.address } }),
  });
  const after = await api('GET', `/api/streams/${id}`, { as: alice });
  check(`${label}: recipient is now carol`, after.body?.stream?.recipient === carol.address, after.body?.stream?.recipient);
  await expectStatus(`${label}: bob can no longer move it`, api('POST', `/api/streams/${id}/transfer`, { as: bob, body: { newRecipientAddress: bob.address } }), [403]);
}

async function main(): Promise<void> {
  for (const w of [alice, bob, carol]) await signIn(w);
  const now = nowSec();
  const linear = { tokenType: 'BCH', totalAmount: 0.0002, streamType: 'LINEAR', startTime: now, endTime: now + 6 * HOUR };
  for (const [label, body] of [
    ['transfer BCH linear', linear],
    ['transfer BCH hybrid', { tokenType: 'BCH', totalAmount: 0.0002, streamType: 'HYBRID', startTime: now, endTime: now + 6 * HOUR, hybridUnlockTimestamp: now + 600, hybridUpfrontPercentage: 30 }],
    ['transfer token linear', { tokenType: 'FUNGIBLE_TOKEN', tokenCategory: TEST_TOKEN, tokenDecimals: 0, totalAmount: 600, streamType: 'LINEAR', startTime: now, endTime: now + 6 * HOUR }],
    ['transfer token tranche', {
      tokenType: 'FUNGIBLE_TOKEN', tokenCategory: TEST_TOKEN, tokenDecimals: 0, totalAmount: 600, streamType: 'TRANCHE', startTime: now, endTime: now + 6 * HOUR,
      trancheSchedule: [{ unlockTime: now + 600, amount: 300, percentage: 50 }, { unlockTime: now + 6 * HOUR, amount: 300, percentage: 50 }],
    }],
  ] as const) {
    try {
      await run(label, body);
    } catch (error) {
      check(`${label} finished`, false, error instanceof Error ? error.message : String(error));
    }
  }

  log('--- transfers turned off');
  try {
    const id = await createAndFund('locked stream', { ...linear, transferable: false });
    await expectStatus('locked stream: transfer is refused', api('POST', `/api/streams/${id}/transfer`, { as: bob, body: { newRecipientAddress: carol.address } }), [400]);
  } catch (error) {
    check('locked stream finished', false, error instanceof Error ? error.message : String(error));
  }
  process.exit(summary() ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
