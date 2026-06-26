// Chipnet e2e for RecurringPaymentCovenant: permissionless pay().
// Distinct family (streaming, keeperless): no signature — anyone can trigger one
// interval once tx.locktime >= next_payment; covenant self-funds its fee.
//   CHIPNET_PRIVKEY_HEX=<64hex> node tests/e2e/recurring-pay.e2e.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { secp256k1, hash160, encodeCashAddress, binToHex, hexToBin } from '@bitauth/libauth';
import { Contract, TransactionBuilder, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(join(__dirname, '../../artifacts/streaming/RecurringPaymentCovenant.json'), 'utf8'));
const PREFIX = 'bchtest';
const NON_FINAL = 0xfffffffe;
const log = (...a) => console.log('[recurring-e2e]', ...a);
const fail = (m) => { console.error('[recurring-e2e] FAIL:', m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const baseHex = process.env.CHIPNET_PRIVKEY_HEX;
if (!baseHex) fail('set CHIPNET_PRIVKEY_HEX');
const priv = hexToBin(baseHex);
const pub = secp256k1.derivePublicKeyCompressed(priv);
const pkh = hash160(pub);
const sig = new SignatureTemplate(priv);
const addr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkh', payload: pkh }).address;

function recurringCommitment({ status, flags, totalPaid, paymentCount, nextPayment }) {
  const b = Buffer.alloc(40);
  b.writeUInt8(status, 0); b.writeUInt8(flags, 1);
  b.writeBigUInt64LE(BigInt(totalPaid), 2);
  b.writeBigUInt64LE(BigInt(paymentCount), 10);
  let v = BigInt(nextPayment); for (let i = 0; i < 5; i++) { b[18 + i] = Number(v & 0xffn); v >>= 8n; }
  return b;
}
async function waitUtxo(provider, address, pred, label, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const u = (await provider.getUtxos(address)).find(pred);
    if (u) return u;
    if (i % 3 === 0) log(`waiting for ${label}...`);
    await sleep(4000);
  }
  fail(`timed out waiting for ${label}`);
}

async function main() {
  const provider = new ElectrumNetworkProvider('chipnet');
  log('wallet:', addr);
  let utxos = (await provider.getUtxos(addr)).filter((u) => !u.token);
  const bal = utxos.reduce((s, u) => s + u.satoshis, 0n);
  log('balance:', bal.toString());
  if (bal < 40000n) fail(`fund ${addr} from https://tbch.googol.cash`);

  let anchor = utxos.find((u) => u.vout === 0);
  if (!anchor) {
    const t = await new TransactionBuilder({ provider })
      .addInputs(utxos, sig.unlockP2PKH())
      .addOutput({ to: addr, amount: 30000n })
      .addOutput({ to: addr, amount: bal - 32000n })
      .send();
    anchor = await waitUtxo(provider, addr, (u) => u.txid === t.txid && u.vout === 0, 'anchor');
  }
  log('anchor:', anchor.txid, anchor.satoshis.toString());

  const now = Math.floor(Date.now() / 1000);
  const vaultId = '08'.repeat(32);
  const amountPerInterval = 3000n;
  const intervalSeconds = 100n;
  const totalAmount = 30000n;
  const startTimestamp = BigInt(now - 100000);
  const endTimestamp = BigInt(now + 100000);
  const contract = new Contract(artifact, [
    vaultId, binToHex(pkh), binToHex(pkh), amountPerInterval, intervalSeconds, totalAmount, startTimestamp, endTimestamp,
  ], { provider });
  log('recurring token address:', contract.tokenAddress);

  const category = anchor.txid;
  const fundingSats = 25000n;
  const nextPayment = now - 50000;
  const initC = recurringCommitment({ status: 0, flags: 0x01, totalPaid: 0, paymentCount: 0, nextPayment });

  const fresh = (await provider.getUtxos(addr)).filter((u) => !u.token);
  const a2 = fresh.find((u) => u.txid === anchor.txid && u.vout === anchor.vout) || anchor;
  const totalIn = fresh.reduce((s, u) => s + u.satoshis, 0n);
  const ftb = new TransactionBuilder({ provider });
  ftb.addInput(a2, sig.unlockP2PKH());
  const others = fresh.filter((u) => !(u.txid === a2.txid && u.vout === a2.vout));
  if (others.length) ftb.addInputs(others, sig.unlockP2PKH());
  ftb.addOutput({ to: contract.tokenAddress, amount: fundingSats, token: { category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(initC) } } });
  ftb.addOutput({ to: addr, amount: totalIn - fundingSats - 2000n });
  const fund = await ftb.send();
  log('funding tx:', fund.txid);

  const payUtxo = await waitUtxo(provider, contract.tokenAddress, (u) => Boolean(u.token?.nft), 'recurring state NFT');
  log('recurring utxo:', payUtxo.txid, payUtxo.satoshis.toString());

  const spendLocktime = now - 7200;         // >= nextPayment, in [start,end], <= MTP
  const fee = 2500n;
  const stateOut = payUtxo.satoshis - amountPerInterval - fee;
  const newC = recurringCommitment({ status: 0, flags: 0x01, totalPaid: 3000, paymentCount: 1, nextPayment: nextPayment + 100 });

  log('pay (permissionless): interval', amountPerInterval.toString(), 'locktime', spendLocktime, 'stateOut', stateOut.toString());
  const spend = await new TransactionBuilder({ provider })
    .setLocktime(spendLocktime)
    .addInput(payUtxo, contract.unlock.pay(), { sequence: NON_FINAL })
    .addOutput({ to: addr, amount: amountPerInterval })
    .addOutput({ to: contract.tokenAddress, amount: stateOut, token: { category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(newC) } } })
    .send();

  log('RECURRING PAY BROADCAST OK:', spend.txid);
  log('PASS — permissionless interval payment accepted with timestamp locktime + non-final sequence.');
}

main().catch((e) => fail(e?.message || String(e)));
