// Integration check: drive the REAL backend tx builders on chipnet and assert
// the transaction they emit has the structure the chipnet covenant e2e proved is
// broadcastable — exactly the properties that were the bugs:
//   - self-funded (no external fee-payer input/change), output count within cap
//   - covenant input sequence is non-final (0xfffffffe) so CLTV is enforced
//   - nLockTime is a timestamp <= median-time-past (immediately mineable)
//   - the self-funded fee lands in [min relay ~3500, 5000 covenant cap]
// Each check then broadcasts the service-computed tx (same locktime/amounts/
// commitment, real signature where the wallet would sign) to prove it is mineable.
//
// This closes the gap the original bug slipped through: tests asserted
// instantiation, never the built claim tx. Run:
//   CHIPNET_PRIVKEY_HEX=<64hex> pnpm tsx test/builders.integration.ts

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { secp256k1, hash160, encodeCashAddress, binToHex, hexToBin } from '@bitauth/libauth';
import { Contract, TransactionBuilder, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';
import { StreamClaimService } from '../src/services/StreamClaimService.js';
import { PaymentClaimService } from '../src/services/PaymentClaimService.js';
import { GrantMilestoneService } from '../src/services/GrantMilestoneService.js';
import { RewardDistributionService } from '../src/services/RewardDistributionService.js';
import { BountyClaimService } from '../src/services/BountyClaimService.js';
import { AirdropClaimService } from '../src/services/AirdropClaimService.js';
import { StreamCancelService } from '../src/services/StreamCancelService.js';
import { VoteUnlockService } from '../src/services/VoteUnlockService.js';
import { PaymentControlService } from '../src/services/PaymentControlService.js';
import { AirdropControlService } from '../src/services/AirdropControlService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artDir = join(__dirname, '../../contracts/artifacts');
const loadArtifact = (rel: string) => JSON.parse(readFileSync(join(artDir, rel), 'utf8'));
const PREFIX = 'bchtest';
const NON_FINAL = 0xfffffffe;
const log = (...a: unknown[]) => console.log('[builders-it]', ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { log(`  ✓ ${name}`); }
  else { failures++; console.error(`  ✗ ${name} ${detail}`); }
}

const baseHex = process.env.CHIPNET_PRIVKEY_HEX;
if (!baseHex) { console.error('set CHIPNET_PRIVKEY_HEX'); process.exit(1); }
const priv = hexToBin(baseHex);
const pub = secp256k1.derivePublicKeyCompressed(priv) as Uint8Array;
const pkh = hash160(pub) as Uint8Array;
const sig = new SignatureTemplate(priv);
const addr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkh', payload: pkh }).address;

function u40le(buf: Buffer, value: number, off: number) {
  let v = BigInt(value);
  for (let i = 0; i < 5; i++) { buf[off + i] = Number(v & 0xffn); v >>= 8n; }
}
function u64le(buf: Buffer, value: number, off: number) { buf.writeBigUInt64LE(BigInt(value), off); }
// Provider getUtxos returns nft.commitment as a hex string; wcTransaction outputs
// return it as a Uint8Array. Normalize to hex either way.
function hexOf(commitment: unknown): string {
  return typeof commitment === 'string' ? commitment : binToHex(commitment as Uint8Array);
}

async function waitUtxo(provider: ElectrumNetworkProvider, address: string, pred: (u: any) => boolean, label: string, tries = 60): Promise<any> {
  for (let i = 0; i < tries; i++) {
    const u = (await provider.getUtxos(address)).find(pred);
    if (u) return u;
    if (i % 3 === 0) log(`waiting for ${label}...`);
    await sleep(4000);
  }
  throw new Error(`timed out waiting for ${label}`);
}

// Each covenant genesis needs a unique vout-0 anchor (category = anchor txid), so
// consolidate the wallet into a fresh anchor + change before every deploy.
async function freshAnchor(provider: ElectrumNetworkProvider, label: string): Promise<any> {
  const utxos = (await provider.getUtxos(addr)).filter((u: any) => !u.token);
  const bal = utxos.reduce((s: bigint, u: any) => s + u.satoshis, 0n);
  if (bal < 40000n) throw new Error(`fund ${addr} from https://tbch.googol.cash (have ${bal})`);
  const t = await new TransactionBuilder({ provider })
    .addInputs(utxos, sig.unlockP2PKH())
    .addOutput({ to: addr, amount: 30000n })
    .addOutput({ to: addr, amount: bal - 32000n })
    .send();
  return waitUtxo(provider, addr, (u: any) => u.txid === t.txid && u.vout === 0, `${label} anchor`);
}

// Fund a covenant by minting its mutable state NFT from the anchor.
async function fundCovenant(provider: ElectrumNetworkProvider, anchor: any, tokenAddress: string, fundingSats: bigint, commitment: Buffer): Promise<{ utxo: any; category: string }> {
  const category = anchor.txid;
  const fresh = (await provider.getUtxos(addr)).filter((u: any) => !u.token);
  const a2 = fresh.find((u: any) => u.txid === anchor.txid && u.vout === anchor.vout) || anchor;
  const totalIn = fresh.reduce((s: bigint, u: any) => s + u.satoshis, 0n);
  const tb = new TransactionBuilder({ provider });
  tb.addInput(a2, sig.unlockP2PKH());
  const others = fresh.filter((u: any) => !(u.txid === a2.txid && u.vout === a2.vout));
  if (others.length) tb.addInputs(others, sig.unlockP2PKH());
  tb.addOutput({ to: tokenAddress, amount: fundingSats, token: { category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(commitment) } } });
  tb.addOutput({ to: addr, amount: totalIn - fundingSats - 2000n });
  await tb.send();
  const utxo = await waitUtxo(provider, tokenAddress, (u: any) => Boolean(u.token?.nft), 'state NFT');
  return { utxo, category };
}

// Shared structural assertions on a self-funded covenant spend.
function assertSelfFundStructure(wcTransaction: any, now: number, expectInputs: number, expectOutputs: number) {
  const tx = wcTransaction.transaction;
  const sourceOutputs: any[] = wcTransaction.sourceOutputs;
  const inSats = sourceOutputs.reduce((s: bigint, o: any) => s + BigInt(o.valueSatoshis), 0n);
  const outSats = tx.outputs.reduce((s: bigint, o: any) => s + BigInt(o.valueSatoshis), 0n);
  const fee = inSats - outSats;
  const mtpBound = now - 3000;
  log(`  inputs: ${sourceOutputs.length} | outputs: ${tx.outputs.length} | locktime: ${tx.locktime} | fee: ${fee}`);
  check(`${expectInputs} input (self-funded, no fee payer)`, sourceOutputs.length === expectInputs, `got ${sourceOutputs.length}`);
  check(`${expectOutputs} outputs`, tx.outputs.length === expectOutputs, `got ${tx.outputs.length}`);
  check('covenant input sequence non-final', Number(tx.inputs[0].sequenceNumber) === NON_FINAL, `got ${tx.inputs[0].sequenceNumber}`);
  check('nLockTime timestamp <= MTP', tx.locktime >= 500000000 && tx.locktime <= mtpBound, `got ${tx.locktime}`);
  check('fee in [min relay 3500, cap 5000]', fee >= 3500n && fee <= 5000n, `got ${fee}`);
  check('state output preserves NFT', Boolean(tx.outputs[tx.outputs.length - 1]?.token?.nft), '');
  return { tx, fee };
}

// ---- StreamClaimService (Vesting claim, recipient-signed, self-fund) ----
async function checkVestingClaim(provider: ElectrumNetworkProvider) {
  log('\n=== StreamClaimService (Vesting.claim) ===');
  const artifact = loadArtifact('streaming/VestingCovenant.json');
  const now = Math.floor(Date.now() / 1000);
  const startTs = now - 100000, endTs = now - 90000, totalAmount = 10000;
  const ctorParams: any[] = ['0a'.repeat(32), binToHex(pkh), 1n, BigInt(totalAmount), BigInt(startTs), BigInt(endTs), 0n, 0n, 0n];
  const contract = new Contract(artifact, ctorParams, { provider });

  const c = Buffer.alloc(40);
  c.writeUInt8(0, 0); c.writeUInt8(0x01, 1); u64le(c, 0, 2); u40le(c, startTs, 10); u40le(c, 0, 15);
  Buffer.from(pkh).copy(c, 20);

  const anchor = await freshAnchor(provider, 'vesting');
  const { utxo, category } = await fundCovenant(provider, anchor, contract.tokenAddress, 15000n, c);
  log('funded:', utxo.satoshis.toString());

  const { claimableAmount, wcTransaction } = await new StreamClaimService('chipnet').buildClaimTransaction({
    streamId: 'it-vesting', contractAddress: contract.tokenAddress, recipient: addr,
    totalAmount, totalReleased: 0, startTime: startTs, endTime: endTs, currentTime: now,
    streamType: 'LINEAR', tokenType: 'BCH', constructorParams: ctorParams, currentCommitment: binToHex(c),
  });
  check('claimable == totalAmount', claimableAmount === totalAmount, `got ${claimableAmount}`);
  const { tx } = assertSelfFundStructure(wcTransaction, now, 1, 2);

  const o0: any = tx.outputs[0], o1: any = tx.outputs[1];
  const bc = await new TransactionBuilder({ provider })
    .setLocktime(Number(tx.locktime))
    .addInput(utxo, contract.unlock.claim(sig, pub), { sequence: NON_FINAL })
    .addOutput({ to: addr, amount: BigInt(o0.valueSatoshis) })
    .addOutput({ to: contract.tokenAddress, amount: BigInt(o1.valueSatoshis), token: { category: utxo.token.category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(o1.token.nft.commitment) } } })
    .send();
  log('  BROADCAST OK:', bc.txid);
}

// ---- PaymentClaimService (RecurringPayment.pay, permissionless, self-fund) ----
async function checkRecurringPay(provider: ElectrumNetworkProvider) {
  log('\n=== PaymentClaimService (RecurringPayment.pay) ===');
  const artifact = loadArtifact('streaming/RecurringPaymentCovenant.json');
  const now = Math.floor(Date.now() / 1000);
  const amountPerInterval = 3000, intervalSeconds = 100, totalAmount = 30000;
  const startTs = now - 100000, endTs = now + 100000, nextPayment = now - 50000;
  const ctorParams: any[] = ['0b'.repeat(32), binToHex(pkh), binToHex(pkh), BigInt(amountPerInterval), BigInt(intervalSeconds), BigInt(totalAmount), BigInt(startTs), BigInt(endTs)];
  const contract = new Contract(artifact, ctorParams, { provider });

  const c = Buffer.alloc(40);
  c.writeUInt8(0, 0); c.writeUInt8(0x01, 1); u64le(c, 0, 2); u64le(c, 0, 10); u40le(c, nextPayment, 18);
  const anchor = await freshAnchor(provider, 'recurring');
  const { utxo, category } = await fundCovenant(provider, anchor, contract.tokenAddress, 15000n, c);
  log('funded:', utxo.satoshis.toString());

  const { claimableAmount, wcTransaction } = await new PaymentClaimService('chipnet').buildClaimTransaction({
    paymentId: 'it-recurring', contractAddress: contract.tokenAddress, recipient: addr,
    amountPerInterval, intervalSeconds, totalPaid: 0, nextPaymentTime: nextPayment, currentTime: now,
    endTime: endTs, tokenType: 'BCH', constructorParams: ctorParams, currentCommitment: binToHex(c),
  });
  check('claimable == amountPerInterval', claimableAmount === amountPerInterval, `got ${claimableAmount}`);
  const { tx } = assertSelfFundStructure(wcTransaction, now, 1, 2);

  const o0: any = tx.outputs[0], o1: any = tx.outputs[1];
  const bc = await new TransactionBuilder({ provider })
    .setLocktime(Number(tx.locktime))
    .addInput(utxo, contract.unlock.pay(), { sequence: NON_FINAL })
    .addOutput({ to: addr, amount: BigInt(o0.valueSatoshis) })
    .addOutput({ to: contract.tokenAddress, amount: BigInt(o1.valueSatoshis), token: { category: utxo.token.category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(o1.token.nft.commitment) } } })
    .send();
  log('  BROADCAST OK:', bc.txid);
}

// ---- GrantMilestoneService (Grant.releaseMilestone, authority-signed, self-fund) ----
// The worst pre-fix case: it used setLocktime(0), which fails the covenant's
// tx.locktime >= 500000000 outright. Proves that fix.
async function checkGrantMilestone(provider: ElectrumNetworkProvider) {
  log('\n=== GrantMilestoneService (Grant.releaseMilestone) ===');
  const artifact = loadArtifact('distribution/GrantCovenant.json');
  const now = Math.floor(Date.now() / 1000);
  const amountPerMilestone = 3000, milestonesTotal = 5, totalAmount = 15000;
  const ctorParams: any[] = ['0c'.repeat(32), binToHex(pkh), binToHex(pkh), BigInt(milestonesTotal), BigInt(amountPerMilestone), BigInt(totalAmount)];
  const contract = new Contract(artifact, ctorParams, { provider });

  const c = Buffer.alloc(40);
  c.writeUInt8(0, 0); c.writeUInt8(0x01, 1); c.writeUInt8(0, 2); u64le(c, 0, 3); u40le(c, 0, 11);
  Buffer.from(pkh).copy(c, 16);
  const anchor = await freshAnchor(provider, 'grant');
  const { utxo, category } = await fundCovenant(provider, anchor, contract.tokenAddress, 15000n, c);
  log('funded:', utxo.satoshis.toString());

  const { releaseAmount, wcTransaction } = await new GrantMilestoneService('chipnet').buildReleaseTransaction({
    grantId: 'it-grant', contractAddress: contract.tokenAddress, recipientAddress: addr,
    tokenType: 'BCH', constructorParams: ctorParams, currentCommitment: binToHex(c),
    currentTime: now, authorityPrivKey: baseHex!,
  });
  check('releaseAmount == amountPerMilestone', releaseAmount === amountPerMilestone, `got ${releaseAmount}`);
  const { tx } = assertSelfFundStructure(wcTransaction, now, 1, 2);

  const o0: any = tx.outputs[0], o1: any = tx.outputs[1];
  const bc = await new TransactionBuilder({ provider })
    .setLocktime(Number(tx.locktime))
    .addInput(utxo, contract.unlock.releaseMilestone(new SignatureTemplate(priv), pub), { sequence: NON_FINAL })
    .addOutput({ to: addr, amount: BigInt(o0.valueSatoshis) })
    .addOutput({ to: contract.tokenAddress, amount: BigInt(o1.valueSatoshis), token: { category: utxo.token.category, amount: 0n, nft: { capability: utxo.token.nft.capability, commitment: binToHex(o1.token.nft.commitment) } } })
    .send();
  log('  BROADCAST OK:', bc.txid);
}

// ---- RewardDistributionService (Reward.reward, authority-signed, FEE-PAYER cap 3) ----
// The other fix category: the covenant cap (3) allows the external fee-payer's
// change output, so the fee value (4000) + non-final sequence + locktime are what
// matter. Broadcast signs both the (server-signed) covenant input and the wallet's
// P2PKH fee inputs.
async function checkRewardDistribution(provider: ElectrumNetworkProvider) {
  log('\n=== RewardDistributionService (Reward.reward, fee-payer) ===');
  const artifact = loadArtifact('distribution/RewardCovenant.json');
  const now = Math.floor(Date.now() / 1000);
  const rewardAmount = 5000, maxReward = 10000, totalPool = 10000;
  const startTs = now - 100000, endTs = now + 100000;
  const ctorParams: any[] = ['0d'.repeat(32), binToHex(pkh), binToHex(pkh), BigInt(maxReward), BigInt(totalPool), BigInt(startTs), BigInt(endTs)];
  const contract = new Contract(artifact, ctorParams, { provider });

  const c = Buffer.alloc(40);
  c.writeUInt8(0, 0); c.writeUInt8(0x01, 1); c.writeUInt8(0x04, 2); u64le(c, 0, 3); u64le(c, 0, 11); u40le(c, 0, 19);
  const anchor = await freshAnchor(provider, 'reward');
  const { utxo } = await fundCovenant(provider, anchor, contract.tokenAddress, 15000n, c);
  log('funded:', utxo.satoshis.toString());

  const { rewardAmount: built, wcTransaction } = await new RewardDistributionService('chipnet').buildDistributionTransaction({
    rewardId: 'it-reward', contractAddress: contract.tokenAddress, recipientAddress: addr, signer: addr,
    rewardAmount, tokenType: 'BCH', constructorParams: ctorParams, currentCommitment: binToHex(c),
    currentTime: now, authorityPrivKey: baseHex!,
  });
  check('built == rewardAmount', built === rewardAmount, `got ${built}`);

  const tx: any = wcTransaction.transaction;
  const so: any[] = wcTransaction.sourceOutputs;
  const fee = so.reduce((s: bigint, o: any) => s + BigInt(o.valueSatoshis), 0n) - tx.outputs.reduce((s: bigint, o: any) => s + BigInt(o.valueSatoshis), 0n);
  log(`  inputs: ${so.length} | outputs: ${tx.outputs.length} | locktime: ${tx.locktime} | fee: ${fee}`);
  check('outputs <= 3 (covenant cap)', tx.outputs.length <= 3, `got ${tx.outputs.length}`);
  check('covenant input sequence non-final', Number(tx.inputs[0].sequenceNumber) === NON_FINAL, `got ${tx.inputs[0].sequenceNumber}`);
  check('nLockTime timestamp <= MTP', tx.locktime >= 500000000 && tx.locktime <= now - 3000, `got ${tx.locktime}`);
  check('miner fee == 4000', fee === 4000n, `got ${fee}`);

  // Broadcast: covenant input is server-signed; the wallet supplies its P2PKH fee inputs.
  const o0: any = tx.outputs[0], o1: any = tx.outputs[1];
  const feeUtxos = (await provider.getUtxos(addr)).filter((u: any) => !u.token);
  const feeTotal = feeUtxos.reduce((s: bigint, u: any) => s + u.satoshis, 0n);
  const change = feeTotal - 4000n;
  const tb = new TransactionBuilder({ provider })
    .setLocktime(Number(tx.locktime))
    .addInput(utxo, contract.unlock.reward(new SignatureTemplate(priv), pub, pkh, BigInt(rewardAmount)), { sequence: NON_FINAL })
    .addInputs(feeUtxos, sig.unlockP2PKH())
    .addOutput({ to: addr, amount: BigInt(o0.valueSatoshis) })
    .addOutput({ to: contract.tokenAddress, amount: BigInt(o1.valueSatoshis), token: { category: utxo.token.category, amount: 0n, nft: { capability: utxo.token.nft.capability, commitment: binToHex(o1.token.nft.commitment) } } });
  if (change > 546n) tb.addOutput({ to: addr, amount: change });
  const bc = await tb.send();
  log('  BROADCAST OK:', bc.txid);
}

// ---- BountyClaimService (Bounty.claim, authority-signed, FEE-PAYER cap 3) ----
// Verifies the fix to the unlock call: claim(sig, pubkey, winnerHash, proofHash)
// (was claim(winnerHash, proofHash, reward, sig, pub) — wrong count + order).
async function checkBountyClaim(provider: ElectrumNetworkProvider) {
  log('\n=== BountyClaimService (Bounty.claim, fee-payer) ===');
  const artifact = loadArtifact('distribution/BountyCovenant.json');
  const now = Math.floor(Date.now() / 1000);
  const rewardPerWinner = 5000, maxWinners = 2;
  const startTs = now - 100000, endTs = now + 100000;
  const proofHash = '01'.repeat(32);
  const ctorParams: any[] = ['0e'.repeat(32), binToHex(pkh), binToHex(pkh), BigInt(rewardPerWinner), BigInt(maxWinners), BigInt(startTs), BigInt(endTs)];
  const contract = new Contract(artifact, ctorParams, { provider });

  const c = Buffer.alloc(40);
  c.writeUInt8(0, 0); c.writeUInt8(0x01, 1); u64le(c, 0, 2); c.writeUInt32LE(0, 10); u40le(c, 0, 14);
  const anchor = await freshAnchor(provider, 'bounty');
  const { utxo } = await fundCovenant(provider, anchor, contract.tokenAddress, 15000n, c);
  log('funded:', utxo.satoshis.toString());

  const { claimAmount, wcTransaction } = await new BountyClaimService('chipnet').buildClaimTransaction({
    bountyId: 'it-bounty', contractAddress: contract.tokenAddress, winnerAddress: addr, signer: addr,
    proofHash, tokenType: 'BCH', constructorParams: ctorParams, currentCommitment: binToHex(c),
    currentTime: now, authorityPrivKey: baseHex!,
  });
  check('claimAmount == rewardPerWinner', claimAmount === rewardPerWinner, `got ${claimAmount}`);

  const tx: any = wcTransaction.transaction;
  const so: any[] = wcTransaction.sourceOutputs;
  const fee = so.reduce((s: bigint, o: any) => s + BigInt(o.valueSatoshis), 0n) - tx.outputs.reduce((s: bigint, o: any) => s + BigInt(o.valueSatoshis), 0n);
  log(`  inputs: ${so.length} | outputs: ${tx.outputs.length} | locktime: ${tx.locktime} | fee: ${fee}`);
  check('outputs <= 3 (covenant cap)', tx.outputs.length <= 3, `got ${tx.outputs.length}`);
  check('covenant input sequence non-final', Number(tx.inputs[0].sequenceNumber) === NON_FINAL, `got ${tx.inputs[0].sequenceNumber}`);
  check('nLockTime timestamp <= MTP', tx.locktime >= 500000000 && tx.locktime <= now - 3000, `got ${tx.locktime}`);
  check('miner fee == 4000', fee === 4000n, `got ${fee}`);

  const o0: any = tx.outputs[0], o1: any = tx.outputs[1];
  const feeUtxos = (await provider.getUtxos(addr)).filter((u: any) => !u.token);
  const change = feeUtxos.reduce((s: bigint, u: any) => s + u.satoshis, 0n) - 4000n;
  const tb = new TransactionBuilder({ provider })
    .setLocktime(Number(tx.locktime))
    .addInput(utxo, contract.unlock.claim(new SignatureTemplate(priv), pub, pkh, hexToBin(proofHash)), { sequence: NON_FINAL })
    .addInputs(feeUtxos, sig.unlockP2PKH())
    .addOutput({ to: addr, amount: BigInt(o0.valueSatoshis) })
    .addOutput({ to: contract.tokenAddress, amount: BigInt(o1.valueSatoshis), token: { category: utxo.token.category, amount: 0n, nft: { capability: utxo.token.nft.capability, commitment: binToHex(o1.token.nft.commitment) } } });
  if (change > 546n) tb.addOutput({ to: addr, amount: change });
  const bc = await tb.send();
  log('  BROADCAST OK:', bc.txid);
}

// ---- AirdropClaimService (Airdrop.claim, authority-signed, self-fund cap 2) ----
async function checkAirdropClaim(provider: ElectrumNetworkProvider) {
  log('\n=== AirdropClaimService (Airdrop.claim) ===');
  const artifact = loadArtifact('distribution/AirdropCovenant.json');
  const now = Math.floor(Date.now() / 1000);
  const amountPerClaim = 5000, totalPool = 10000;
  const startTs = now - 100000, endTs = now + 100000;
  const ctorParams: any[] = ['0f'.repeat(32), binToHex(pkh), binToHex(pkh), BigInt(amountPerClaim), BigInt(totalPool), BigInt(startTs), BigInt(endTs)];
  const contract = new Contract(artifact, ctorParams, { provider });

  const c = Buffer.alloc(40);
  c.writeUInt8(0, 0); c.writeUInt8(0x01, 1); u64le(c, 0, 2); u64le(c, 0, 10); u40le(c, 0, 18);
  const anchor = await freshAnchor(provider, 'airdrop');
  const { utxo } = await fundCovenant(provider, anchor, contract.tokenAddress, 15000n, c);
  log('funded:', utxo.satoshis.toString());

  const { claimAmount, wcTransaction } = await new AirdropClaimService('chipnet').buildClaimTransaction({
    airdropId: 'it-airdrop', contractAddress: contract.tokenAddress, claimer: addr, signer: addr,
    claimAmount: amountPerClaim, tokenType: 'BCH', constructorParams: ctorParams,
    currentCommitment: binToHex(c), currentTime: now, claimAuthorityPrivKey: baseHex!,
  });
  check('claimAmount == amountPerClaim', claimAmount === amountPerClaim, `got ${claimAmount}`);
  const { tx } = assertSelfFundStructure(wcTransaction, now, 1, 2);

  const o0: any = tx.outputs[0], o1: any = tx.outputs[1];
  const bc = await new TransactionBuilder({ provider })
    .setLocktime(Number(tx.locktime))
    .addInput(utxo, contract.unlock.claim(pkh, new SignatureTemplate(priv), pub), { sequence: NON_FINAL })
    .addOutput({ to: addr, amount: BigInt(o0.valueSatoshis) })
    .addOutput({ to: contract.tokenAddress, amount: BigInt(o1.valueSatoshis), token: { category: utxo.token.category, amount: 0n, nft: { capability: utxo.token.nft.capability, commitment: binToHex(o1.token.nft.commitment) } } })
    .send();
  log('  BROADCAST OK:', bc.txid);
}

// ---- StreamCancelService (Vesting.cancel, sender-signed, vested/unvested split) ----
// Distinct: 2 P2PKH outputs (vested->recipient, unvested->sender), NFT burned. The
// split is computed from tx.locktime — verifies the cancelLocktime fix.
async function checkStreamCancel(provider: ElectrumNetworkProvider) {
  log('\n=== StreamCancelService (Vesting.cancel) ===');
  const artifact = loadArtifact('streaming/VestingCovenant.json');
  const now = Math.floor(Date.now() / 1000);
  const totalAmount = 10000, startTs = now - 10000, endTs = now + 10000; // partially vested
  // senderHash as Uint8Array, matching production's deserializeConstructorParams
  // (StreamCancelService.readBytes20 accepts only Uint8Array, unlike the others).
  const ctorParams: any[] = ['1a'.repeat(32), pkh, 1n, BigInt(totalAmount), BigInt(startTs), BigInt(endTs), 0n, 0n, 0n];
  const contract = new Contract(artifact, ctorParams, { provider });

  const c = Buffer.alloc(40);
  c.writeUInt8(0, 0); c.writeUInt8(0x01, 1); u64le(c, 0, 2); u40le(c, startTs, 10); u40le(c, 0, 15);
  Buffer.from(pkh).copy(c, 20);
  const anchor = await freshAnchor(provider, 'cancel');
  const { utxo } = await fundCovenant(provider, anchor, contract.tokenAddress, 14000n, c);
  log('funded:', utxo.satoshis.toString());

  const { vestedAmount, unvestedAmount, wcTransaction } = await new StreamCancelService('chipnet').buildCancelTransaction({
    streamType: 'LINEAR', contractAddress: contract.tokenAddress, sender: addr, recipient: addr,
    currentTime: now, tokenType: 'BCH', constructorParams: ctorParams, currentCommitment: binToHex(c),
  });

  const tx: any = wcTransaction.transaction;
  const so: any[] = wcTransaction.sourceOutputs;
  const fee = so.reduce((s: bigint, o: any) => s + BigInt(o.valueSatoshis), 0n) - tx.outputs.reduce((s: bigint, o: any) => s + BigInt(o.valueSatoshis), 0n);
  log(`  vested: ${vestedAmount} | unvested: ${unvestedAmount} | inputs: ${so.length} | outputs: ${tx.outputs.length} | locktime: ${tx.locktime} | fee: ${fee}`);
  check('vested + unvested == total', vestedAmount + unvestedAmount === totalAmount, `got ${vestedAmount}+${unvestedAmount}`);
  check('outputs <= 2 (vested + unvested, NFT burned)', tx.outputs.length <= 2, `got ${tx.outputs.length}`);
  check('covenant input sequence non-final', Number(tx.inputs[0].sequenceNumber) === NON_FINAL, `got ${tx.inputs[0].sequenceNumber}`);
  check('nLockTime timestamp <= MTP', tx.locktime >= 500000000 && tx.locktime <= now - 3000, `got ${tx.locktime}`);
  check('fee in [min relay 3500, cap 5000]', fee >= 3500n && fee <= 5000n, `got ${fee}`);

  const tb = new TransactionBuilder({ provider })
    .setLocktime(Number(tx.locktime))
    .addInput(utxo, contract.unlock.cancel(new SignatureTemplate(priv), pub), { sequence: NON_FINAL });
  for (const o of tx.outputs) tb.addOutput({ to: addr, amount: BigInt(o.valueSatoshis) });
  const bc = await tb.send();
  log('  BROADCAST OK:', bc.txid);
}

// ---- VoteUnlockService (VoteLock.reclaim, voter-signed, FT, self-fund) ----
// Verifies the governance reclaim + the SECURITY fix: non-final sequence + buffered
// locktime so the lock can't be bypassed by setting a future nLockTime.
async function checkVoteUnlock(provider: ElectrumNetworkProvider) {
  log('\n=== VoteUnlockService (VoteLock.reclaim, FT) ===');
  const artifact = loadArtifact('governance/VoteLockCovenant.json');
  const now = Math.floor(Date.now() / 1000);
  const proposalId = '06'.repeat(32);
  const unlockTs = now - 100000; // lock elapsed
  const govTokens = 1000n;
  const tokenAddr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkhWithTokens', payload: pkh }).address;
  const ctorSerialized = [
    { type: 'bytes', value: proposalId },
    { type: 'bigint', value: '1' },
    { type: 'bytes', value: binToHex(pkh) },
    { type: 'bigint', value: String(unlockTs) },
  ];
  const contract = new Contract(artifact, [proposalId, 1n, binToHex(pkh), BigInt(unlockTs)], { provider });

  // vote commitment: [1-4] = proposalId prefix (the only thing reclaim checks)
  const c = Buffer.alloc(32);
  c.writeUInt8(1, 0); hexToBin(proposalId).slice(0, 4).forEach((b, i) => { c[1 + i] = b; });
  c.writeUInt8(1, 5); u40le(c, unlockTs, 8); u40le(c, unlockTs, 13);

  // fund: mint FT amount + vote NFT in one genesis output
  const anchor = await freshAnchor(provider, 'votelock');
  const category = anchor.txid;
  const fresh = (await provider.getUtxos(addr)).filter((u: any) => !u.token);
  const a2 = fresh.find((u: any) => u.txid === anchor.txid && u.vout === anchor.vout) || anchor;
  const totalIn = fresh.reduce((s: bigint, u: any) => s + u.satoshis, 0n);
  const ftb = new TransactionBuilder({ provider });
  ftb.addInput(a2, sig.unlockP2PKH());
  const others = fresh.filter((u: any) => !(u.txid === a2.txid && u.vout === a2.vout));
  if (others.length) ftb.addInputs(others, sig.unlockP2PKH());
  ftb.addOutput({ to: contract.tokenAddress, amount: 8000n, token: { category, amount: govTokens, nft: { capability: 'none', commitment: binToHex(c) } } });
  ftb.addOutput({ to: addr, amount: totalIn - 8000n - 2000n });
  await ftb.send();
  const utxo = await waitUtxo(provider, contract.tokenAddress, (u: any) => Boolean(u.token?.nft), 'vote NFT');
  log('funded:', utxo.satoshis.toString(), 'tokens', utxo.token.amount.toString());

  const { unlockedAmount, wcTransaction } = await new VoteUnlockService('chipnet').buildUnlockTransaction({
    voteId: 'it-vote', contractAddress: contract.tokenAddress, voter: addr, stakeAmount: Number(govTokens),
    votingPeriodEnd: unlockTs, currentTime: now, tokenCategory: category,
    constructorParams: ctorSerialized, currentCommitment: binToHex(c),
  });
  check('unlockedAmount == govTokens', unlockedAmount === Number(govTokens), `got ${unlockedAmount}`);

  const tx: any = wcTransaction.transaction;
  const so: any[] = wcTransaction.sourceOutputs;
  const fee = so.reduce((s: bigint, o: any) => s + BigInt(o.valueSatoshis), 0n) - tx.outputs.reduce((s: bigint, o: any) => s + BigInt(o.valueSatoshis), 0n);
  log(`  inputs: ${so.length} | outputs: ${tx.outputs.length} | locktime: ${tx.locktime} | fee: ${fee}`);
  check('covenant input sequence non-final (security fix)', Number(tx.inputs[0].sequenceNumber) === NON_FINAL, `got ${tx.inputs[0].sequenceNumber}`);
  check('nLockTime <= MTP (not future — lock enforced)', tx.locktime <= now - 3000, `got ${tx.locktime}`);
  check('FT returned to voter', Boolean(tx.outputs[0]?.token), '');
  check('fee <= 5000', fee <= 5000n && fee > 0n, `got ${fee}`);

  const o0: any = tx.outputs[0];
  const bc = await new TransactionBuilder({ provider })
    .setLocktime(Number(tx.locktime))
    .addInput(utxo, contract.unlock.reclaim(new SignatureTemplate(priv), pub), { sequence: NON_FINAL })
    .addOutput({ to: tokenAddr, amount: BigInt(o0.valueSatoshis), token: { category, amount: utxo.token.amount } })
    .send();
  log('  BROADCAST OK:', bc.txid);
}

// ---- PaymentControlService pause -> resume (RecurringPayment, CLTV, sender-signed) ----
// Both embed tx.locktime in the commitment (pause_start; next_payment = locktime +
// interval), so this verifies the cancelLocktime-class fix on a chained 2-step flow.
async function checkPaymentControl(provider: ElectrumNetworkProvider) {
  log('\n=== PaymentControlService (pause -> resume) ===');
  const artifact = loadArtifact('streaming/RecurringPaymentCovenant.json');
  const now = Math.floor(Date.now() / 1000);
  const amountPerInterval = 3000, intervalSeconds = 100, totalAmount = 30000;
  const startTs = now - 100000, endTs = now + 100000, nextPayment = now - 50000;
  const ctorParams: any[] = ['1b'.repeat(32), pkh, pkh, BigInt(amountPerInterval), BigInt(intervalSeconds), BigInt(totalAmount), BigInt(startTs), BigInt(endTs)];
  const contract = new Contract(artifact, ctorParams, { provider });

  const c = Buffer.alloc(40);
  c.writeUInt8(0, 0); c.writeUInt8(0x01, 1); u64le(c, 0, 2); u64le(c, 0, 10); u40le(c, nextPayment, 18);
  const anchor = await freshAnchor(provider, 'paycontrol');
  let { utxo } = await fundCovenant(provider, anchor, contract.tokenAddress, 15000n, c);
  const category = utxo.token.category;
  log('funded:', utxo.satoshis.toString());

  // --- pause (ACTIVE -> PAUSED) ---
  const pauseRes = await new PaymentControlService('chipnet').buildPauseTransaction({
    contractAddress: contract.tokenAddress, constructorParams: ctorParams,
    currentCommitment: binToHex(c), currentTime: now, tokenType: 'BCH',
  });
  let tx: any = pauseRes.wcTransaction.transaction;
  check('pause: 1 output (self-fund)', tx.outputs.length === 1, `got ${tx.outputs.length}`);
  check('pause: input non-final', Number(tx.inputs[0].sequenceNumber) === NON_FINAL, `got ${tx.inputs[0].sequenceNumber}`);
  check('pause: nLockTime <= MTP', tx.locktime >= 500000000 && tx.locktime <= now - 3000, `got ${tx.locktime}`);
  let o0: any = tx.outputs[0];
  const pauseTx = await new TransactionBuilder({ provider })
    .setLocktime(Number(tx.locktime))
    .addInput(utxo, contract.unlock.pause(new SignatureTemplate(priv), pub), { sequence: NON_FINAL })
    .addOutput({ to: contract.tokenAddress, amount: BigInt(o0.valueSatoshis), token: { category, amount: 0n, nft: { capability: utxo.token.nft.capability, commitment: binToHex(o0.token.nft.commitment) } } })
    .send();
  log('  PAUSE BROADCAST OK:', pauseTx.txid);
  utxo = await waitUtxo(provider, contract.tokenAddress, (u: any) => u.txid === pauseTx.txid && u.vout === 0, 'paused NFT');

  // --- resume (PAUSED -> ACTIVE) ---
  const resumeRes = await new PaymentControlService('chipnet').buildResumeTransaction({
    contractAddress: contract.tokenAddress, constructorParams: ctorParams,
    currentCommitment: hexOf(utxo.token.nft.commitment), currentTime: now, tokenType: 'BCH',
  });
  tx = resumeRes.wcTransaction.transaction;
  check('resume: 1 output (self-fund)', tx.outputs.length === 1, `got ${tx.outputs.length}`);
  check('resume: input non-final', Number(tx.inputs[0].sequenceNumber) === NON_FINAL, `got ${tx.inputs[0].sequenceNumber}`);
  check('resume: nLockTime <= MTP', tx.locktime >= 500000000 && tx.locktime <= now - 3000, `got ${tx.locktime}`);
  o0 = tx.outputs[0];
  const resumeTx = await new TransactionBuilder({ provider })
    .setLocktime(Number(tx.locktime))
    .addInput(utxo, contract.unlock.resume(new SignatureTemplate(priv), pub), { sequence: NON_FINAL })
    .addOutput({ to: contract.tokenAddress, amount: BigInt(o0.valueSatoshis), token: { category, amount: 0n, nft: { capability: utxo.token.nft.capability, commitment: binToHex(o0.token.nft.commitment) } } })
    .send();
  log('  RESUME BROADCAST OK:', resumeTx.txid);
}

// ---- AirdropControlService.pause (cap-1, force self-fund, no CLTV) ----
// Verifies the force-self-fund fix on a tight (cap-1) distribution control path.
async function checkAirdropControl(provider: ElectrumNetworkProvider) {
  log('\n=== AirdropControlService (pause, cap-1 self-fund) ===');
  const artifact = loadArtifact('distribution/AirdropCovenant.json');
  const now = Math.floor(Date.now() / 1000);
  const ctorParams: any[] = ['2a'.repeat(32), binToHex(pkh), binToHex(pkh), 5000n, 10000n, BigInt(now - 100000), BigInt(now + 100000)];
  const contract = new Contract(artifact, ctorParams, { provider });

  const c = Buffer.alloc(40);
  c.writeUInt8(0, 0); c.writeUInt8(0x01, 1); u64le(c, 0, 2); u64le(c, 0, 10); u40le(c, 0, 18);
  const anchor = await freshAnchor(provider, 'airdropctl');
  const { utxo } = await fundCovenant(provider, anchor, contract.tokenAddress, 15000n, c);
  log('funded:', utxo.satoshis.toString());

  const res = await new AirdropControlService('chipnet').buildPauseTransaction({
    contractAddress: contract.tokenAddress, constructorParams: ctorParams,
    currentCommitment: binToHex(c), currentTime: now, tokenType: 'BCH',
  });
  const tx: any = res.wcTransaction.transaction;
  const so: any[] = res.wcTransaction.sourceOutputs;
  const fee = so.reduce((s: bigint, o: any) => s + BigInt(o.valueSatoshis), 0n) - tx.outputs.reduce((s: bigint, o: any) => s + BigInt(o.valueSatoshis), 0n);
  log(`  inputs: ${so.length} | outputs: ${tx.outputs.length} | fee: ${fee}`);
  check('pause: 1 input (self-fund, no fee payer)', so.length === 1, `got ${so.length}`);
  check('pause: 1 output (cap-1)', tx.outputs.length === 1, `got ${tx.outputs.length}`);
  check('pause: fee in [3500, 5000]', fee >= 3500n && fee <= 5000n, `got ${fee}`);

  const o0: any = tx.outputs[0];
  const bc = await new TransactionBuilder({ provider })
    .addInput(utxo, contract.unlock.pause(new SignatureTemplate(priv), pub))
    .addOutput({ to: contract.tokenAddress, amount: BigInt(o0.valueSatoshis), token: { category: utxo.token.category, amount: 0n, nft: { capability: utxo.token.nft.capability, commitment: hexOf(o0.token.nft.commitment) } } })
    .send();
  log('  PAUSE BROADCAST OK:', bc.txid);
}

async function main() {
  const provider = new ElectrumNetworkProvider('chipnet');
  log('wallet:', addr);
  // Set ONLY=airdrop,cancel to run a subset (fast iteration); default runs all.
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const checks: Array<[string, (p: ElectrumNetworkProvider) => Promise<void>]> = [
    ['vesting', checkVestingClaim],
    ['recurring', checkRecurringPay],
    ['grant', checkGrantMilestone],
    ['reward', checkRewardDistribution],
    ['bounty', checkBountyClaim],
    ['airdrop', checkAirdropClaim],
    ['cancel', checkStreamCancel],
    ['votelock', checkVoteUnlock],
    ['paycontrol', checkPaymentControl],
    ['airdropctl', checkAirdropControl],
  ];
  for (const [name, fn] of checks) {
    if (!only || only.includes(name)) await fn(provider);
  }

  if (failures) { console.error(`\n[builders-it] FAIL: ${failures} assertion(s) failed`); process.exit(1); }
  log('\nPASS — real services emit proven-broadcastable structures, verified on chipnet.');
}

main().catch((e) => { console.error('[builders-it] ERROR:', e?.message || e); process.exit(1); });
