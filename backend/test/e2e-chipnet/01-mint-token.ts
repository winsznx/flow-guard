// Mints a chipnet test token whose minting NFT stays with the main test wallet, so
// airdrops, bounties, rewards and grants (which mint their state NFT in the token's
// own category) can be tested with CashTokens. Prints the new category.
//   cd backend && pnpm exec tsx test/e2e-chipnet/01-mint-token.ts

import { SignatureTemplate, TransactionBuilder } from 'cashscript';
import { alice, provider, record, sleep } from './lib.js';

async function main(): Promise<void> {
  const sig = new SignatureTemplate(alice.priv);
  let utxos = (await provider.getUtxos(alice.address)).filter((u) => !u.token);
  let anchor = utxos.find((u) => u.vout === 0 && u.satoshis > 20_000n);
  if (!anchor) {
    const total = utxos.reduce((s, u) => s + u.satoshis, 0n);
    const tx = await new TransactionBuilder({ provider })
      .addInputs(utxos, sig.unlockP2PKH())
      .addOutput({ to: alice.address, amount: 100_000n })
      .addOutput({ to: alice.address, amount: total - 100_000n - 1500n })
      .send();
    record('mint: fresh anchor', tx.txid);
    await sleep(4000);
    utxos = (await provider.getUtxos(alice.address)).filter((u) => !u.token);
    anchor = utxos.find((u) => u.txid === tx.txid && u.vout === 0);
  }
  if (!anchor) throw new Error('no vout-0 anchor');

  const category = anchor.txid;
  const tx = await new TransactionBuilder({ provider })
    .addInput(anchor, sig.unlockP2PKH())
    .addOutput({ to: alice.tokenAddress, amount: 1000n, token: { category, amount: 1_000_000n } })
    .addOutput({ to: alice.tokenAddress, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'minting', commitment: '' } } })
    .addOutput({ to: alice.address, amount: anchor.satoshis - 2000n - 1500n })
    .send();
  record('mint: token genesis', tx.txid);
  console.log(`E2E_MINT_TOKEN=${category}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
