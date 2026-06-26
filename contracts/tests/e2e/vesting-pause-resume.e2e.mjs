// Chipnet e2e for VestingCovenant control transitions: pause() -> resume().
// Distinct shape (single-output state transition, no payout). resume() advances
// the cursor by the pause duration, so paused time does not vest.
//   CHIPNET_PRIVKEY_HEX=<64hex> node tests/e2e/vesting-pause-resume.e2e.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { secp256k1, hash160, encodeCashAddress, binToHex, hexToBin } from '@bitauth/libauth';
import { Contract, TransactionBuilder, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(join(__dirname, '../../artifacts/streaming/VestingCovenant.json'), 'utf8'));
const NETWORK = process.env.BCH_NETWORK || 'chipnet';
const PREFIX = NETWORK === 'mainnet' ? 'bitcoincash' : 'bchtest';
const NON_FINAL = 0xfffffffe;
const log = (...a) => console.log('[pause-resume-e2e]', ...a);
const fail = (m) => { console.error('[pause-resume-e2e] FAIL:', m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const baseHex = process.env.CHIPNET_PRIVKEY_HEX;
if (!baseHex) fail('set CHIPNET_PRIVKEY_HEX');
const priv = hexToBin(baseHex);
const pub = secp256k1.derivePublicKeyCompressed(priv);
const pkh = hash160(pub);
const sig = new SignatureTemplate(priv);
const addr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkh', payload: pkh }).address;

function u40le(buf, value, off) { let v = BigInt(value); for (let i = 0; i < 5; i++) { buf[off + i] = Number(v & 0xffn); v >>= 8n; } }
function encodeCommitment({ status, flags, totalReleased, cursor, pauseStart, recipientHash }) {
  const b = Buffer.alloc(40);
  b.writeUInt8(status, 0); b.writeUInt8(flags, 1);
  b.writeBigUInt64LE(BigInt(totalReleased), 2);
  u40le(b, cursor, 10); u40le(b, pauseStart, 15);
  Buffer.from(recipientHash).copy(b, 20);
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
  const provider = new ElectrumNetworkProvider(NETWORK);
  log('wallet (sender+recipient):', addr);
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
  const vaultId = '09'.repeat(32);
  const startTs = now - 5000;
  const endTs = now + 100000;
  const contract = new Contract(artifact, [
    vaultId, binToHex(pkh), 1n, 50000n, BigInt(startTs), BigInt(endTs), 0n, 0n, 0n,
  ], { provider });
  log('vesting token address:', contract.tokenAddress);

  const category = anchor.txid;
  const fundingSats = 12000n;
  const initC = encodeCommitment({ status: 0, flags: 0x01, totalReleased: 0, cursor: startTs, pauseStart: 0, recipientHash: pkh });

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

  let nft = await waitUtxo(provider, contract.tokenAddress, (u) => Boolean(u.token?.nft), 'vesting state NFT');
  log('vesting utxo:', nft.txid, nft.satoshis.toString());

  const fee = 3500n; // Vesting redeem script is ~3KB; min relay ~3092 > old 2000
  const pauseLocktime = now - 10000;
  const resumeLocktime = now - 7200;          // > pauseStart, <= MTP

  // ---- pause(): ACTIVE -> PAUSED, record pause_start ----
  const pausedC = encodeCommitment({ status: 1, flags: 0x01, totalReleased: 0, cursor: startTs, pauseStart: pauseLocktime, recipientHash: pkh });
  const pauseTx = await new TransactionBuilder({ provider })
    .setLocktime(pauseLocktime)
    .addInput(nft, contract.unlock.pause(sig, pub), { sequence: NON_FINAL })
    .addOutput({ to: contract.tokenAddress, amount: nft.satoshis - fee, token: { category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(pausedC) } } })
    .send();
  log('pause ok (locktime', pauseLocktime + '):', pauseTx.txid);
  nft = await waitUtxo(provider, contract.tokenAddress, (u) => u.txid === pauseTx.txid && u.vout === 0, 'NFT after pause');

  // ---- resume(): PAUSED -> ACTIVE, advance cursor by pause duration ----
  const newCursor = startTs + (resumeLocktime - pauseLocktime);
  const resumedC = encodeCommitment({ status: 0, flags: 0x01, totalReleased: 0, cursor: newCursor, pauseStart: 0, recipientHash: pkh });
  const resumeTx = await new TransactionBuilder({ provider })
    .setLocktime(resumeLocktime)
    .addInput(nft, contract.unlock.resume(sig, pub), { sequence: NON_FINAL })
    .addOutput({ to: contract.tokenAddress, amount: nft.satoshis - fee, token: { category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(resumedC) } } })
    .send();

  log('RESUME BROADCAST OK (cursor advanced by', resumeLocktime - pauseLocktime, 's):', resumeTx.txid);
  log('PASS — pause/resume state transitions accepted with timestamp locktime + non-final sequence.');
}

main().catch((e) => fail(e?.message || String(e)));
