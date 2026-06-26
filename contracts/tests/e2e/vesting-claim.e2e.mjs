// Chipnet end-to-end proof for the VestingCovenant claim path.
//
// Proves the locktime + sequence fix on a real node: deploy -> fund (mint state
// NFT) -> claim. A claim that broadcasts means the covenant accepted a timestamp
// nLockTime with a non-final input sequence (CLTV), which is exactly what the
// inverted guard + force-finalized sequence used to break.
//
// Run:
//   cd contracts && npm run build:streaming
//   CHIPNET_PRIVKEY_HEX=<64hex> node tests/e2e/vesting-claim.e2e.mjs
// If CHIPNET_PRIVKEY_HEX is unset, a key is generated and the funding address is
// printed; fund it from https://tbch.googol.cash then re-run with that key.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  secp256k1, hash160, encodeCashAddress, binToHex, hexToBin,
} from '@bitauth/libauth';
import { Contract, TransactionBuilder, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(join(__dirname, '../../artifacts/streaming/VestingCovenant.json'), 'utf8'));

const NETWORK = process.env.BCH_NETWORK || 'chipnet';
const PREFIX = NETWORK === 'mainnet' ? 'bitcoincash' : 'bchtest';
const FINAL = 0xffffffff;
const NON_FINAL = 0xfffffffe;

function log(...a) { console.log('[e2e]', ...a); }
function fail(msg) { console.error('[e2e] FAIL:', msg); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- keys / address -------------------------------------------------------
function loadOrGenKey() {
  const hex = process.env.CHIPNET_PRIVKEY_HEX;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) return hexToBin(hex);
  let k = new Uint8Array(32);
  // deterministic-ish gen without Math.random dependency
  for (let i = 0; i < 32; i++) k[i] = (Date.now() + i * 131) & 0xff;
  while (!secp256k1.validatePrivateKey(k)) k[0] = (k[0] + 1) & 0xff;
  log('GENERATED key (set CHIPNET_PRIVKEY_HEX to reuse):', binToHex(k));
  return k;
}

const priv = loadOrGenKey();
const pub = secp256k1.derivePublicKeyCompressed(priv);
const pkh = hash160(pub);
const addr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkh', payload: pkh }).address;
const sig = new SignatureTemplate(priv);

// ---- commitment (40 bytes) ------------------------------------------------
function u40le(buf, value, off) {
  let v = BigInt(value);
  for (let i = 0; i < 5; i++) { buf[off + i] = Number(v & 0xffn); v >>= 8n; }
}
function encodeCommitment({ status, flags, totalReleased, cursor, pauseStart, recipientHash }) {
  const buf = Buffer.alloc(40);
  buf.writeUInt8(status, 0);
  buf.writeUInt8(flags, 1);
  buf.writeBigUInt64LE(BigInt(totalReleased), 2);
  u40le(buf, cursor, 10);
  u40le(buf, pauseStart, 15);
  Buffer.from(recipientHash).copy(buf, 20);
  return buf;
}

async function utxosAt(provider, address) { return provider.getUtxos(address); }
async function waitForUtxo(provider, address, predicate, label, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const all = await utxosAt(provider, address);
    const u = all.find(predicate);
    if (u) return u;
    if (i % 3 === 0) log(`waiting for ${label}... (${all.length} utxos at address)`);
    await sleep(4000);
  }
  fail(`timed out waiting for ${label}`);
}

async function main() {
  const provider = new ElectrumNetworkProvider(NETWORK);
  log('wallet address:', addr);

  const walletUtxos = (await utxosAt(provider, addr)).filter((u) => !u.token);
  const balance = walletUtxos.reduce((s, u) => s + u.satoshis, 0n);
  log('wallet balance (sats):', balance.toString());
  if (balance < 20000n) {
    log(`Insufficient balance. Fund ${addr} from https://tbch.googol.cash (>= 0.0002 tBCH) and re-run with CHIPNET_PRIVKEY_HEX=${binToHex(priv)}`);
    process.exit(2);
  }

  // ---- step 1: ensure a vout-0 anchor for the token genesis ----------------
  let anchor = walletUtxos.find((u) => u.vout === 0 && !u.token);
  if (!anchor) {
    log('creating a vout-0 genesis anchor...');
    const anchorTx = await new TransactionBuilder({ provider })
      .addInputs(walletUtxos.filter((u) => !u.token), sig.unlockP2PKH())
      .addOutput({ to: addr, amount: 10000n })           // vout 0 = anchor
      .addOutput({ to: addr, amount: balance - 12000n }) // vout 1 = change (rough fee)
      .send();
    log('anchor tx:', anchorTx.txid);
    anchor = await waitForUtxo(provider, addr, (u) => u.txid === anchorTx.txid && u.vout === 0, 'anchor utxo');
  }
  log('anchor:', anchor.txid, 'vout', anchor.vout, 'sats', anchor.satoshis.toString());

  // ---- step 2: instantiate + fund the covenant (mint mutable state NFT) -----
  const now = Math.floor(Date.now() / 1000);
  const startTs = now - 100000;   // far past
  const endTs = now - 90000;      // fully vested long ago (duration 10000s)
  const totalAmount = 10000;      // sats to vest
  const vaultId = '01'.repeat(32);

  const contract = new Contract(
    artifact,
    [vaultId, binToHex(pkh), 1n, BigInt(totalAmount), BigInt(startTs), BigInt(endTs), 0n, 0n, 0n],
    { provider },
  );
  log('contract token address:', contract.tokenAddress);

  const category = anchor.txid; // genesis: category = txid spent at vout 0
  const fundingSats = 16000n;   // out0(claim)=10000 + out1(state)=2500 + fee 3500 (Vesting redeem ~3.1KB)
  const initCommitment = encodeCommitment({
    status: 0, flags: 0x01, totalReleased: 0, cursor: startTs, pauseStart: 0, recipientHash: pkh,
  });

  // Re-fetch: the anchor tx (if any) spent the original utxo set.
  const freshUtxos = (await utxosAt(provider, addr)).filter((u) => !u.token);
  const freshAnchor = freshUtxos.find((u) => u.txid === anchor.txid && u.vout === anchor.vout) || anchor;
  const others = freshUtxos.filter((u) => !(u.txid === freshAnchor.txid && u.vout === freshAnchor.vout));
  const totalIn = freshUtxos.reduce((s, u) => s + u.satoshis, 0n);

  const fundTb = new TransactionBuilder({ provider });
  fundTb.addInput(freshAnchor, sig.unlockP2PKH());
  if (others.length) fundTb.addInputs(others, sig.unlockP2PKH());
  fundTb.addOutput({
    to: contract.tokenAddress,
    amount: fundingSats,
    token: { category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(initCommitment) } },
  });
  fundTb.addOutput({ to: addr, amount: totalIn - fundingSats - 2000n });
  const fundTx = await fundTb.send();
  log('funding tx:', fundTx.txid);

  const contractUtxo = await waitForUtxo(
    provider, contract.tokenAddress,
    (u) => Boolean(u.token?.nft), 'funded contract state NFT',
  );
  log('contract utxo:', contractUtxo.txid, 'sats', contractUtxo.satoshis.toString(), 'commitment', contractUtxo.token.nft.commitment);

  // ---- step 3: CLAIM (the path that was broken) ----------------------------
  const claimLocktime = now - 7200; // timestamp (>=500M), <= MTP for immediate mineability
  const claimable = totalAmount;    // fully vested
  const stateOut = fundingSats - BigInt(claimable) - 3500n; // fee = 3500, in [minRelay~3092, 5000 cap]
  const newCommitment = encodeCommitment({
    status: 3, flags: 0x01, totalReleased: totalAmount, cursor: startTs, pauseStart: 0, recipientHash: pkh,
  });

  log('building claim: locktime', claimLocktime, 'seq', '0xfffffffe', 'claimable', claimable, 'stateOut', stateOut.toString());

  const claimTx = await new TransactionBuilder({ provider })
    .setLocktime(claimLocktime)
    .addInput(contractUtxo, contract.unlock.claim(sig, pub), { sequence: NON_FINAL })
    .addOutput({ to: addr, amount: BigInt(claimable) })
    .addOutput({
      to: contract.tokenAddress,
      amount: stateOut,
      token: { category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(newCommitment) } },
    })
    .send();

  log('CLAIM BROADCAST OK:', claimTx.txid);
  log('PASS — covenant accepted timestamp locktime + non-final sequence. Fix confirmed end-to-end.');
}

main().catch((e) => fail(e?.message || String(e)));
