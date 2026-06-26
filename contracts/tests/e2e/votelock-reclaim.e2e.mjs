// Chipnet e2e for VoteLockCovenant: reclaim() governance tokens after unlock.
// Distinct family (governance + FUNGIBLE tokens): genesis mints amount + vote
// NFT in one output; reclaim returns the FT to the voter once locktime passes.
//   CHIPNET_PRIVKEY_HEX=<64hex> node tests/e2e/votelock-reclaim.e2e.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { secp256k1, hash160, encodeCashAddress, binToHex, hexToBin } from '@bitauth/libauth';
import { Contract, TransactionBuilder, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(join(__dirname, '../../artifacts/governance/VoteLockCovenant.json'), 'utf8'));
const PREFIX = 'bchtest';
const NON_FINAL = 0xfffffffe;
const log = (...a) => console.log('[votelock-e2e]', ...a);
const fail = (m) => { console.error('[votelock-e2e] FAIL:', m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const baseHex = process.env.CHIPNET_PRIVKEY_HEX;
if (!baseHex) fail('set CHIPNET_PRIVKEY_HEX');
const priv = hexToBin(baseHex);
const pub = secp256k1.derivePublicKeyCompressed(priv);
const pkh = hash160(pub);
const sig = new SignatureTemplate(priv);
const addr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkh', payload: pkh }).address;
const tokenAddr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkhWithTokens', payload: pkh }).address;

function voteCommitment({ version, propIdPrefix, voteChoice, lockTs, unlockTs }) {
  const b = Buffer.alloc(32);
  b.writeUInt8(version, 0);
  Buffer.from(propIdPrefix).copy(b, 1);
  b.writeUInt8(voteChoice, 5);
  let v = BigInt(lockTs); for (let i = 0; i < 5; i++) { b[8 + i] = Number(v & 0xffn); v >>= 8n; }
  let u = BigInt(unlockTs); for (let i = 0; i < 5; i++) { b[13 + i] = Number(u & 0xffn); u >>= 8n; }
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
  const proposalId = '06'.repeat(32);
  const voteChoice = 1n;
  const unlockTimestamp = BigInt(now - 100000);
  const contract = new Contract(artifact, [proposalId, voteChoice, binToHex(pkh), unlockTimestamp], { provider });
  log('votelock token address:', contract.tokenAddress);

  const category = anchor.txid;
  const govTokens = 1000n;
  const fundingSats = 8000n;
  const propIdPrefix = hexToBin(proposalId).slice(0, 4);
  const initC = voteCommitment({ version: 1, propIdPrefix, voteChoice: 1, lockTs: now - 100000, unlockTs: now - 100000 });

  const fresh = (await provider.getUtxos(addr)).filter((u) => !u.token);
  const a2 = fresh.find((u) => u.txid === anchor.txid && u.vout === anchor.vout) || anchor;
  const totalIn = fresh.reduce((s, u) => s + u.satoshis, 0n);
  const ftb = new TransactionBuilder({ provider });
  ftb.addInput(a2, sig.unlockP2PKH());
  const others = fresh.filter((u) => !(u.txid === a2.txid && u.vout === a2.vout));
  if (others.length) ftb.addInputs(others, sig.unlockP2PKH());
  ftb.addOutput({ to: contract.tokenAddress, amount: fundingSats, token: { category, amount: govTokens, nft: { capability: 'none', commitment: binToHex(initC) } } });
  ftb.addOutput({ to: addr, amount: totalIn - fundingSats - 2000n });
  const fund = await ftb.send();
  log('funding tx (mint FT + vote NFT):', fund.txid);

  const voteUtxo = await waitUtxo(provider, contract.tokenAddress, (u) => Boolean(u.token?.nft), 'vote token UTXO');
  log('vote utxo:', voteUtxo.txid, voteUtxo.satoshis.toString(), 'tokens', voteUtxo.token.amount.toString());

  const spendLocktime = now - 7200;         // >= unlockTimestamp, <= MTP
  const fee = 2000n;
  log('reclaim: locktime', spendLocktime, 'returning', voteUtxo.token.amount.toString(), 'gov tokens');
  const spend = await new TransactionBuilder({ provider })
    .setLocktime(spendLocktime)
    .addInput(voteUtxo, contract.unlock.reclaim(sig, pub), { sequence: NON_FINAL })
    .addOutput({ to: tokenAddr, amount: voteUtxo.satoshis - fee, token: { category, amount: voteUtxo.token.amount } })
    .send();

  log('RECLAIM BROADCAST OK:', spend.txid);
  log('PASS — governance FT reclaim accepted after unlock timestamp with non-final sequence.');
}

main().catch((e) => fail(e?.message || String(e)));
