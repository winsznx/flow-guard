// Tops up the recipient and third-signer test wallets from the main chipnet test
// wallet and checks that all three can sign in.
//   cd backend && pnpm exec tsx test/e2e-chipnet/00-setup.ts

import { SignatureTemplate, TransactionBuilder } from 'cashscript';
import { alice, api, balance, bob, carol, check, log, provider, record, signIn, summary } from './lib.js';

const TARGET: Array<[typeof bob, bigint]> = [
  [bob, 150_000n],
  [carol, 60_000n],
];

async function main(): Promise<void> {
  const health = await api('GET', '/api');
  check('backend is on chipnet', health.body?.network === 'chipnet', JSON.stringify(health.body));
  if (health.body?.network !== 'chipnet') process.exit(1);

  for (const w of [alice, bob, carol]) {
    const b = await balance(w.address);
    log(`${w.name} ${w.address} ${b.sats} sats`, b.tokens);
  }

  const outputs = [];
  for (const [w, target] of TARGET) {
    const have = (await balance(w.address)).sats;
    if (have < target) outputs.push({ to: w.address, amount: target - have });
  }
  if (outputs.length) {
    const utxos = (await provider.getUtxos(alice.address)).filter((u) => !u.token);
    const total = utxos.reduce((s, u) => s + u.satoshis, 0n);
    const send = outputs.reduce((s, o) => s + o.amount, 0n);
    const fee = 1000n;
    const sig = new SignatureTemplate(alice.priv);
    const builder = new TransactionBuilder({ provider })
      .addInputs(utxos, sig.unlockP2PKH())
      .addOutputs(outputs)
      .addOutput({ to: alice.address, amount: total - send - fee });
    const tx = await builder.send();
    record('setup: top up bob and carol', tx.txid);
  }

  for (const w of [alice, bob, carol]) {
    try {
      await signIn(w);
      check(`${w.name} signs in`, Boolean(w.bearer));
    } catch (error) {
      check(`${w.name} signs in`, false, String(error));
    }
  }
  process.exit(summary() ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
