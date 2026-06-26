// Chipnet e2e for VaultCovenant: 2-of-3 multisig period-gated spend().
// Exercises the same locktime/sequence fix on the treasury path + multisig.
//   CHIPNET_PRIVKEY_HEX=<64hex> node tests/e2e/vault-spend.e2e.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { secp256k1, hash160, encodeCashAddress, binToHex, hexToBin } from '@bitauth/libauth';
import { Contract, TransactionBuilder, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(join(__dirname, '../../artifacts/treasury/VaultCovenant.json'), 'utf8'));
const NETWORK = process.env.BCH_NETWORK || 'chipnet';
const PREFIX = NETWORK === 'mainnet' ? 'bitcoincash' : 'bchtest';
const NON_FINAL = 0xfffffffe;
const log = (...a) => console.log('[vault-e2e]', ...a);
const fail = (m) => { console.error('[vault-e2e] FAIL:', m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function keyFromHex(hex) {
  const k = hexToBin(hex);
  return { priv: k, pub: secp256k1.derivePublicKeyCompressed(k), pkh: hash160(secp256k1.derivePublicKeyCompressed(k)), sig: new SignatureTemplate(k) };
}
function deriveKey(base, salt) {
  let k = new Uint8Array(base); k[31] = (k[31] ^ salt) & 0xff;
  while (!secp256k1.validatePrivateKey(k)) k[0] = (k[0] + 1) & 0xff;
  return keyFromHex(binToHex(k));
}

const baseHex = process.env.CHIPNET_PRIVKEY_HEX;
if (!baseHex) fail('set CHIPNET_PRIVKEY_HEX');
const k1 = keyFromHex(baseHex);            // funded payer + signer 1
const k2 = deriveKey(k1.priv, 0x11);       // signer 2
const k3 = deriveKey(k1.priv, 0x22);       // signer 3
const addr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkh', payload: k1.pkh }).address;

function leBytes(value, n) {
  const b = Buffer.alloc(n);
  let v = BigInt(value);
  for (let i = 0; i < n; i++) { b[i] = Number(v & 0xffn); v >>= 8n; }
  return b;
}
function vaultCommitment({ version, status, periodId, spent, lastUpdate }) {
  const b = Buffer.alloc(32);
  b.writeUInt8(version, 0); b.writeUInt8(status, 1);
  b.writeUInt32LE(periodId, 5);
  b.writeBigUInt64LE(BigInt(spent), 9);
  b.writeBigUInt64LE(BigInt(lastUpdate), 17);
  return b;
}
async function waitUtxo(provider, address, pred, label, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const all = await provider.getUtxos(address);
    const u = all.find(pred);
    if (u) return u;
    if (i % 3 === 0) log(`waiting for ${label}... (${all.length} utxos)`);
    await sleep(4000);
  }
  fail(`timed out waiting for ${label}`);
}

async function main() {
  const provider = new ElectrumNetworkProvider(NETWORK);
  log('payer/signer1:', addr);
  let utxos = (await provider.getUtxos(addr)).filter((u) => !u.token);
  const bal = utxos.reduce((s, u) => s + u.satoshis, 0n);
  log('balance:', bal.toString());
  if (bal < 40000n) fail(`fund ${addr} from https://tbch.googol.cash`);

  let anchor = utxos.find((u) => u.vout === 0);
  if (!anchor) {
    const t = await new TransactionBuilder({ provider })
      .addInputs(utxos, k1.sig.unlockP2PKH())
      .addOutput({ to: addr, amount: 30000n })
      .addOutput({ to: addr, amount: bal - 32000n })
      .send();
    anchor = await waitUtxo(provider, addr, (u) => u.txid === t.txid && u.vout === 0, 'anchor');
  }
  log('anchor:', anchor.txid, anchor.satoshis.toString());

  const now = Math.floor(Date.now() / 1000);
  const periodDuration = 100;
  const vaultId = '02'.repeat(32);
  const contract = new Contract(artifact, [
    vaultId, 2n, binToHex(k1.pkh), binToHex(k2.pkh), binToHex(k3.pkh),
    BigInt(periodDuration), 0n, 0n, 0n, '00'.repeat(20), '00'.repeat(20), '00'.repeat(20),
  ], { provider });
  log('vault token address:', contract.tokenAddress);

  const category = anchor.txid;
  const fundingSats = 25000n;
  const lastUpdate = now - 100000;
  const initC = vaultCommitment({ version: 1, status: 0, periodId: 0, spent: 0, lastUpdate });

  const fresh = (await provider.getUtxos(addr)).filter((u) => !u.token);
  const a2 = fresh.find((u) => u.txid === anchor.txid && u.vout === anchor.vout) || anchor;
  const totalIn = fresh.reduce((s, u) => s + u.satoshis, 0n);
  const ftb = new TransactionBuilder({ provider });
  ftb.addInput(a2, k1.sig.unlockP2PKH());
  const others = fresh.filter((u) => !(u.txid === a2.txid && u.vout === a2.vout));
  if (others.length) ftb.addInputs(others, k1.sig.unlockP2PKH());
  ftb.addOutput({ to: contract.tokenAddress, amount: fundingSats, token: { category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(initC) } } });
  ftb.addOutput({ to: addr, amount: totalIn - fundingSats - 2000n });
  const fund = await ftb.send();
  log('funding tx:', fund.txid);

  const vaultUtxo = await waitUtxo(provider, contract.tokenAddress, (u) => Boolean(u.token?.nft), 'vault state NFT');
  log('vault utxo:', vaultUtxo.txid, vaultUtxo.satoshis.toString());

  // ---- 2-of-3 period-gated spend (new period => hits the locktime guards) ----
  const spendLocktime = now - 7200;          // >= 500M, <= MTP
  const payout = 5000n;
  const newPeriodId = 1n;                     // currentPeriodId(0)+1 => new-period branch
  const newSpent = payout;
  const recipientHash = k3.pkh;               // pay signer3 as the recipient
  const fee = 3500n; // >= multisig-spend min relay (~3196), <= covenant cap (5000)
  const stateOut = vaultUtxo.satoshis - payout - fee;
  // Mirror the covenant's exact newCommitment construction (32 bytes, LE: keeps
  // version[0] + rolesMask[2:5] from the original, 7-byte reserved tail).
  const newC = Buffer.concat([
    initC.subarray(0, 1),          // version
    Buffer.from([0x00]),           // status = ACTIVE
    initC.subarray(2, 5),          // rolesMask
    leBytes(newPeriodId, 4),       // new period id
    leBytes(newSpent, 8),          // spent this period
    leBytes(spendLocktime, 8),     // last_update = tx.locktime
    Buffer.alloc(7),               // reserved
  ]);

  log('spend: 2-of-3, payout', payout.toString(), 'locktime', spendLocktime, 'stateOut', stateOut.toString());
  const spend = await new TransactionBuilder({ provider })
    .setLocktime(spendLocktime)
    .addInput(vaultUtxo, contract.unlock.spend(
      k1.sig, k1.pub, k2.sig, k2.pub,
      '03'.repeat(32),                 // proposalId (non-zero)
      binToHex(recipientHash), payout, newPeriodId, newSpent,
    ), { sequence: NON_FINAL })
    .addOutput({ to: encodeCashAddress({ prefix: PREFIX, type: 'p2pkh', payload: recipientHash }).address, amount: payout })
    .addOutput({ to: contract.tokenAddress, amount: stateOut, token: { category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(newC) } } })
    .send();

  log('VAULT SPEND BROADCAST OK:', spend.txid);
  log('PASS — 2-of-3 multisig period-gated spend accepted with timestamp locktime + non-final sequence.');
}

main().catch((e) => fail(e?.message || String(e)));
