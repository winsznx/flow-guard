// Chipnet e2e for ProposalCovenant: 2-of-3 approve -> approve -> execute.
// Distinct family (treasury governance): per-signer approval bitmask accrues to
// APPROVED, then execute() releases to the payout hash under a timelock CLTV.
//   CHIPNET_PRIVKEY_HEX=<64hex> node tests/e2e/proposal-execute.e2e.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { secp256k1, hash160, encodeCashAddress, binToHex, hexToBin } from '@bitauth/libauth';
import { Contract, TransactionBuilder, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(join(__dirname, '../../artifacts/treasury/ProposalCovenant.json'), 'utf8'));
const NETWORK = process.env.BCH_NETWORK || 'chipnet';
const PREFIX = NETWORK === 'mainnet' ? 'bitcoincash' : 'bchtest';
const NON_FINAL = 0xfffffffe;
const log = (...a) => console.log('[proposal-e2e]', ...a);
const fail = (m) => { console.error('[proposal-e2e] FAIL:', m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function keyFromHex(hex) {
  const k = hexToBin(hex);
  const pub = secp256k1.derivePublicKeyCompressed(k);
  return { priv: k, pub, pkh: hash160(pub), sig: new SignatureTemplate(k) };
}
function deriveKey(base, salt) {
  let k = new Uint8Array(base); k[31] = (k[31] ^ salt) & 0xff;
  while (!secp256k1.validatePrivateKey(k)) k[0] = (k[0] + 1) & 0xff;
  return keyFromHex(binToHex(k));
}
const baseHex = process.env.CHIPNET_PRIVKEY_HEX;
if (!baseHex) fail('set CHIPNET_PRIVKEY_HEX');
const k1 = keyFromHex(baseHex);
const k2 = deriveKey(k1.priv, 0x11);
const k3 = deriveKey(k1.priv, 0x22);
const addr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkh', payload: k1.pkh }).address;

function le5(b, value, off) { let v = BigInt(value); for (let i = 0; i < 5; i++) { b[off + i] = Number(v & 0xffn); v >>= 8n; } }
function proposalCommitment({ version, status, mask, required, votingEnd, execTimelock, payoutHash }) {
  const b = Buffer.alloc(40);
  b.writeUInt8(version, 0); b.writeUInt8(status, 1); b.writeUInt8(mask, 2); b.writeUInt8(required, 3);
  le5(b, votingEnd, 4); le5(b, execTimelock, 9);
  Buffer.from(payoutHash).copy(b, 14);
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
  const vaultId = '07'.repeat(32);
  const required = 2n;
  const contract = new Contract(artifact, [vaultId, binToHex(k1.pkh), binToHex(k2.pkh), binToHex(k3.pkh), required], { provider });
  log('proposal token address:', contract.tokenAddress);

  const category = anchor.txid;
  const fundingSats = 25000n;
  const votingEnd = now + 100000;
  const execTimelock = now - 100000;          // already elapsed
  const payoutHash = k1.pkh;
  const initC = proposalCommitment({ version: 1, status: 0, mask: 0, required: 2, votingEnd, execTimelock, payoutHash });

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

  let nft = await waitUtxo(provider, contract.tokenAddress, (u) => Boolean(u.token?.nft), 'proposal state NFT');
  log('proposal utxo:', nft.txid, nft.satoshis.toString());

  // ---- approve #1 (signer1): mask 0x00 -> 0x01, status stays PENDING ----
  const fee = 2000n;
  const c1 = proposalCommitment({ version: 1, status: 0, mask: 0x01, required: 2, votingEnd, execTimelock, payoutHash });
  const ap1 = await new TransactionBuilder({ provider })
    .addInput(nft, contract.unlock.approve(k1.sig, k1.pub))
    .addOutput({ to: contract.tokenAddress, amount: nft.satoshis - fee, token: { category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(c1) } } })
    .send();
  log('approve#1 (signer1) ok:', ap1.txid);
  nft = await waitUtxo(provider, contract.tokenAddress, (u) => u.txid === ap1.txid && u.vout === 0, 'NFT after approve#1');

  // ---- approve #2 (signer2): mask 0x01 -> 0x03, status -> APPROVED ----
  const c2 = proposalCommitment({ version: 1, status: 1, mask: 0x03, required: 2, votingEnd, execTimelock, payoutHash });
  const ap2 = await new TransactionBuilder({ provider })
    .addInput(nft, contract.unlock.approve(k2.sig, k2.pub))
    .addOutput({ to: contract.tokenAddress, amount: nft.satoshis - fee, token: { category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(c2) } } })
    .send();
  log('approve#2 (signer2) ok -> APPROVED:', ap2.txid);
  nft = await waitUtxo(provider, contract.tokenAddress, (u) => u.txid === ap2.txid && u.vout === 0, 'NFT after approve#2');

  // ---- execute (signer1): timelock CLTV, payout to payoutHash, burn NFT ----
  const spendLocktime = now - 7200;           // >= execTimelock, >= 500M, <= MTP
  const exec = await new TransactionBuilder({ provider })
    .setLocktime(spendLocktime)
    .addInput(nft, contract.unlock.execute(k1.sig, k1.pub), { sequence: NON_FINAL })
    .addOutput({ to: addr, amount: nft.satoshis - fee })
    .send();

  log('PROPOSAL EXECUTE BROADCAST OK:', exec.txid);
  log('PASS — 2-of-3 approval accrual + timelocked execute accepted with non-final sequence.');
}

main().catch((e) => fail(e?.message || String(e)));
