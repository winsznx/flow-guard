// Vaults on chipnet: a 2-of-3 vault, deposit, spending request, two approvals on
// chain, then the payout signed by two signers and merged by the server.
//   cd backend && pnpm exec tsx test/e2e-chipnet/50-vaults.ts

import { binToHex } from '@bitauth/libauth';
import {
  alice, api, balance, bob, carol, check, expectOk, lifecycle, log, record, signAndBroadcast, signIn, signWc, sleep, summary, wallet,
  type TestWallet,
} from './lib.js';

const payee = wallet('payee', 'flowguard-chipnet-e2e-payee-v1');

async function main(): Promise<void> {
  for (const w of [alice, bob, carol]) await signIn(w);

  log('--- create vault');
  const created = await expectOk('vault: create', api('POST', '/api/vaults', {
    as: alice,
    body: {
      name: 'E2E vault',
      description: 'Chipnet end-to-end',
      totalDeposit: 0.0005,
      spendingCap: 0,
      approvalThreshold: 2,
      signers: [alice.address, bob.address, carol.address],
      signerPubkeys: [alice, bob, carol].map((w) => binToHex(w.pub)),
      cycleDuration: 0,
      unlockAmount: 0,
      isPublic: false,
    },
  }));
  const vault = created?.vault ?? created;
  const vaultId: string = vault?.id;
  check('vault: create returns an id and address', typeof vaultId === 'string' && Boolean(vault?.contractAddress), JSON.stringify(created).slice(0, 200));

  log('--- deposit');
  let deposit = await expectOk('vault: deposit info', api('GET', `/api/vaults/${vaultId}/deposit`, { as: alice }));
  if (deposit.requiresPreparation && deposit.preparationTransaction) {
    await signAndBroadcast('vault: preparation', deposit.preparationTransaction, alice);
    for (let attempt = 0; attempt < 15 && !deposit.wcTransaction; attempt += 1) {
      await sleep(3000);
      deposit = (await api('GET', `/api/vaults/${vaultId}/deposit`, { as: alice })).body;
    }
  }
  check('vault: deposit transaction ready', Boolean(deposit.wcTransaction), String(deposit.warning ?? ''));
  const signedDeposit = signWc(deposit.wcTransaction, alice);
  const sent = await expectOk('vault: deposit broadcast', api('POST', '/api/transactions/broadcast', { as: alice, body: { txHex: signedDeposit, txType: 'create', vaultId } }));
  record('vault: deposit', sent.txid);
  await sleep(3000);
  await expectOk('vault: deposit confirm', api('POST', `/api/vaults/${vaultId}/confirm-funding`, { as: alice, body: { txHash: sent.txid, amount: 0.0005 } }));

  log('--- spending request');
  const request = await expectOk('request: create', api('POST', `/api/vaults/${vaultId}/proposals`, {
    as: alice,
    body: { recipient: payee.address, amount: 0.0001, reason: 'E2E payout' },
  }));
  const proposalId: string = request?.proposal?.id ?? request?.id;
  check('request: has an id', typeof proposalId === 'string', JSON.stringify(request).slice(0, 200));

  await lifecycle({
    step: 'request: create on chain',
    as: alice,
    build: { path: `/api/proposals/${proposalId}/create-onchain` },
    confirm: (_b, txHash) => ({ path: `/api/proposals/${proposalId}/confirm-create`, body: { txHash } }),
  });

  for (const approver of [bob, carol]) {
    await lifecycle({
      step: `request: ${approver.name} approves`,
      as: approver,
      build: { path: `/api/proposals/${proposalId}/approve-onchain` },
      confirm: (_b, txHash) => ({ path: `/api/proposals/${proposalId}/confirm-approval`, body: { txHash } }),
    });
  }
  const afterApprovals = await api('GET', `/api/proposals/${proposalId}`, { as: alice });
  const status = String(afterApprovals.body?.proposal?.status ?? afterApprovals.body?.status ?? '');
  check('request: approved', status.toLowerCase() === 'approved', status);

  log('--- payout');
  const before = (await balance(payee.address)).sats;
  const first = await expectOk('payout: start session', api('POST', `/api/proposals/${proposalId}/execute`, { as: bob, body: {} }));
  const signers: string[] = first.requiredSignerAddresses ?? [];
  check('payout: session names two signers', signers.length === 2, JSON.stringify(signers));
  const byAddress = new Map<string, TestWallet>([alice, bob, carol].map((w) => [w.address.toLowerCase(), w]));

  let last: any = null;
  for (const address of signers) {
    const signer = byAddress.get(address.toLowerCase());
    if (!signer) {
      check(`payout: signer ${address} is a test wallet`, false);
      continue;
    }
    const session = await expectOk(`payout: ${signer.name} gets the session`, api('POST', `/api/proposals/${proposalId}/execute`, { as: signer, body: {} }));
    const signedTransaction = signWc(session.wcTransaction, signer);
    last = await expectOk(`payout: ${signer.name} signs`, api('POST', `/api/proposals/${proposalId}/execute-signature`, {
      as: signer,
      body: { sessionId: session.sessionId, signedTransaction },
    }));
  }
  const txid = last?.txid ?? last?.txHash;
  check('payout: broadcast after the second signature', typeof txid === 'string', JSON.stringify(last).slice(0, 300));
  if (txid) record('payout: merged multisig spend', txid);

  await sleep(5000);
  const after = (await balance(payee.address)).sats;
  check('payout: recipient received 10000 sats', after - before === 10_000n, `${before} -> ${after}`);
  const executed = await api('GET', `/api/proposals/${proposalId}`, { as: alice });
  const finalStatus = String(executed.body?.proposal?.status ?? executed.body?.status ?? '');
  check('request: marked executed', finalStatus.toLowerCase() === 'executed', finalStatus);

  process.exit(summary() ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
