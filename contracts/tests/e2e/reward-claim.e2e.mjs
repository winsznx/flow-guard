// Chipnet e2e for RewardCovenant: authority-gated reward() payout.
// Distinct family (distribution): start/end window CLTV guards + single-sig
// claim authority, 40-byte commitment.
//   CHIPNET_PRIVKEY_HEX=<64hex> node tests/e2e/reward-claim.e2e.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { secp256k1, hash160, encodeCashAddress, binToHex, hexToBin } from '@bitauth/libauth';
import { Contract, TransactionBuilder, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(join(__dirname, '../../artifacts/distribution/RewardCovenant.json'), 'utf8'));
const NETWORK = process.env.BCH_NETWORK || 'chipnet';
const PREFIX = NETWORK === 'mainnet' ? 'bitcoincash' : 'bchtest';
const NON_FINAL = 0xfffffffe;
const log = (...a) => console.log('[reward-e2e]', ...a);
const fail = (m) => { console.error('[reward-e2e] FAIL:', m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const baseHex = process.env.CHIPNET_PRIVKEY_HEX;
if (!baseHex) fail('set CHIPNET_PRIVKEY_HEX');
const priv = hexToBin(baseHex);
const pub = secp256k1.derivePublicKeyCompressed(priv);
const pkh = hash160(pub);
const sig = new SignatureTemplate(priv);
const addr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkh', payload: pkh }).address;

function rewardCommitment({ status, flags, category, totalDistributed, rewardsCount, lastTs }) {
  const b = Buffer.alloc(40);
  b.writeUInt8(status, 0); b.writeUInt8(flags, 1); b.writeUInt8(category, 2);
  b.writeBigUInt64LE(BigInt(totalDistributed), 3);
  b.writeBigUInt64LE(BigInt(rewardsCount), 11);
  let v = BigInt(lastTs); for (let i = 0; i < 5; i++) { b[19 + i] = Number(v & 0xffn); v >>= 8n; }
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
  const vaultId = '05'.repeat(32);
  const maxRewardAmount = 10000n;
  const totalPool = 10000n;
  const startTimestamp = BigInt(now - 100000);
  const endTimestamp = BigInt(now + 100000);
  const contract = new Contract(artifact, [
    vaultId, binToHex(pkh), binToHex(pkh), maxRewardAmount, totalPool, startTimestamp, endTimestamp,
  ], { provider });
  log('reward token address:', contract.tokenAddress);

  const category = anchor.txid;
  const fundingSats = 25000n;
  const initC = rewardCommitment({ status: 0, flags: 0x01, category: 0x04, totalDistributed: 0, rewardsCount: 0, lastTs: 0 });

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

  const rewardUtxo = await waitUtxo(provider, contract.tokenAddress, (u) => Boolean(u.token?.nft), 'reward state NFT');
  log('reward utxo:', rewardUtxo.txid, rewardUtxo.satoshis.toString());

  const spendLocktime = now - 7200;        // in [start,end], >= 500M, <= MTP
  const rewardAmount = 5000n;
  const fee = 2500n;                        // single-sig tx, < 5000 cap
  const stateOut = rewardUtxo.satoshis - rewardAmount - fee;
  const newC = rewardCommitment({
    status: 0, flags: 0x01, category: 0x04,
    totalDistributed: 5000, rewardsCount: 1, lastTs: spendLocktime,
  });

  log('reward: amount', rewardAmount.toString(), 'locktime', spendLocktime, 'stateOut', stateOut.toString());
  const spend = await new TransactionBuilder({ provider })
    .setLocktime(spendLocktime)
    .addInput(rewardUtxo, contract.unlock.reward(sig, pub, binToHex(pkh), rewardAmount), { sequence: NON_FINAL })
    .addOutput({ to: addr, amount: rewardAmount })
    .addOutput({ to: contract.tokenAddress, amount: stateOut, token: { category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(newC) } } })
    .send();

  log('REWARD BROADCAST OK:', spend.txid);
  log('PASS — distribution authority payout accepted with windowed timestamp locktime + non-final sequence.');
}

main().catch((e) => fail(e?.message || String(e)));
