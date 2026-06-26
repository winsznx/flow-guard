// LIVE end-to-end test of the vault spend bug fix (#6, the BE/LE treasury lock),
// driving the REAL proposalService through a real (ephemeral) Postgres + chipnet:
//   1. deploy + fund a 2-of-3 VaultCovenant on chipnet
//   2. seed a vaults row + an APPROVED proposals row in Postgres
//   3. call ProposalService.createExecutePayoutTransaction(proposalId, [pub1, pub2])
//   4. sign the service's tx with the two real keys and broadcast it
// A broadcast proves the service now emits a 32-byte LE commitment the covenant
// accepts — the exact thing that was impossible before the endianness fix.
//
//   DATABASE_URL=… PG_SSL_DISABLED=true BCH_NETWORK=chipnet \
//   CHIPNET_PRIVKEY_HEX=<64hex> pnpm tsx test/vault-live-spend.ts

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { secp256k1, hash160, encodeCashAddress, binToHex, hexToBin } from '@bitauth/libauth';
import { Contract, TransactionBuilder, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';
import { db } from '../src/database/pg.js';
import { ProposalService } from '../src/services/proposalService.js';

const PREFIX = 'bchtest';
const NON_FINAL = 0xfffffffe;
const log = (...a: unknown[]) => console.log('[vault-live]', ...a);
const fail = (m: string) => { console.error('[vault-live] FAIL:', m); process.exit(1); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function keyFromHex(hex: string) {
  const k = hexToBin(hex);
  const pub = secp256k1.derivePublicKeyCompressed(k) as Uint8Array;
  return { priv: k, pub, pkh: hash160(pub) as Uint8Array, sig: new SignatureTemplate(k) };
}
function deriveKey(base: Uint8Array, salt: number) {
  const k = new Uint8Array(base); k[31] = (k[31] ^ salt) & 0xff;
  while (!secp256k1.validatePrivateKey(k)) k[0] = (k[0] + 1) & 0xff;
  return keyFromHex(binToHex(k));
}
const baseHex = process.env.CHIPNET_PRIVKEY_HEX;
if (!baseHex) fail('set CHIPNET_PRIVKEY_HEX');
const k1 = keyFromHex(baseHex!);
const k2 = deriveKey(k1.priv, 0x11);
const k3 = deriveKey(k1.priv, 0x22);
const addr = encodeCashAddress({ prefix: PREFIX, type: 'p2pkh', payload: k1.pkh }).address;

function leU32(buf: Buffer, v: number, off: number) { buf.writeUInt32LE(v, off); }
function leU64(buf: Buffer, v: number, off: number) { buf.writeBigUInt64LE(BigInt(v), off); }
function readLeU32(b: Uint8Array, off: number) { return new DataView(b.buffer, b.byteOffset + off, 4).getUint32(0, true); }
function readLeU64(b: Uint8Array, off: number) { return new DataView(b.buffer, b.byteOffset + off, 8).getBigUint64(0, true); }

async function waitUtxo(provider: ElectrumNetworkProvider, address: string, pred: (u: any) => boolean, label: string): Promise<any> {
  for (let i = 0; i < 60; i++) {
    const u = (await provider.getUtxos(address)).find(pred);
    if (u) return u;
    if (i % 3 === 0) log(`waiting for ${label}...`);
    await sleep(4000);
  }
  fail(`timed out waiting for ${label}`); throw 0;
}

async function main() {
  const provider = new ElectrumNetworkProvider('chipnet');
  log('payer/signer1:', addr);
  let utxos = (await provider.getUtxos(addr)).filter((u: any) => !u.token);
  const bal = utxos.reduce((s: bigint, u: any) => s + u.satoshis, 0n);
  if (bal < 40000n) fail(`fund ${addr}`);

  let anchor = utxos.find((u: any) => u.vout === 0);
  if (!anchor) {
    const t = await new TransactionBuilder({ provider })
      .addInputs(utxos, k1.sig.unlockP2PKH())
      .addOutput({ to: addr, amount: 30000n }).addOutput({ to: addr, amount: bal - 32000n }).send();
    anchor = await waitUtxo(provider, addr, (u: any) => u.txid === t.txid && u.vout === 0, 'anchor');
  }

  const now = Math.floor(Date.now() / 1000);
  const vaultId = '2b'.repeat(32);
  const ctorArgs: any[] = [vaultId, 2n, binToHex(k1.pkh), binToHex(k2.pkh), binToHex(k3.pkh), 100n, 0n, 0n, 0n, '00'.repeat(20), '00'.repeat(20), '00'.repeat(20)];
  const artifact = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../contracts/artifacts/treasury/VaultCovenant.json'), 'utf8'));
  const contract = new Contract(artifact, ctorArgs, { provider });
  log('vault token address:', contract.tokenAddress);

  // fund the vault state NFT — LE commitment (period 0, spent 0, last_update = now)
  const category = anchor.txid;
  const c = Buffer.alloc(32);
  c.writeUInt8(1, 0); c.writeUInt8(0, 1); leU32(c, 0, 5); leU64(c, 0, 9); leU64(c, now, 17);
  const fresh = (await provider.getUtxos(addr)).filter((u: any) => !u.token);
  const a2 = fresh.find((u: any) => u.txid === anchor.txid && u.vout === anchor.vout) || anchor;
  const totalIn = fresh.reduce((s: bigint, u: any) => s + u.satoshis, 0n);
  const ftb = new TransactionBuilder({ provider });
  ftb.addInput(a2, k1.sig.unlockP2PKH());
  const others = fresh.filter((u: any) => !(u.txid === a2.txid && u.vout === a2.vout));
  if (others.length) ftb.addInputs(others, k1.sig.unlockP2PKH());
  ftb.addOutput({ to: contract.tokenAddress, amount: 25000n, token: { category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(c) } } });
  ftb.addOutput({ to: addr, amount: totalIn - 25000n - 2000n });
  await ftb.send();
  await waitUtxo(provider, contract.tokenAddress, (u: any) => Boolean(u.token?.nft), 'vault NFT');
  log('vault funded: 25000');

  // seed DB
  const proposalId = 'live-' + vaultId.slice(0, 12);
  const ctorSerialized = JSON.stringify([
    { type: 'bytes', value: vaultId }, { type: 'bigint', value: '2' },
    { type: 'bytes', value: binToHex(k1.pkh) }, { type: 'bytes', value: binToHex(k2.pkh) }, { type: 'bytes', value: binToHex(k3.pkh) },
    { type: 'bigint', value: '100' }, { type: 'bigint', value: '0' }, { type: 'bigint', value: '0' }, { type: 'bigint', value: '0' },
    { type: 'bytes', value: '00'.repeat(20) }, { type: 'bytes', value: '00'.repeat(20) }, { type: 'bytes', value: '00'.repeat(20) },
  ]);
  await db!.prepare('DELETE FROM proposals WHERE id = ?').run(proposalId);
  await db!.prepare('DELETE FROM vaults WHERE vault_id = ?').run(vaultId);
  await db!.prepare(`INSERT INTO vaults (id, vault_id, name, creator, total_deposit, spending_cap, approval_threshold, signers, signer_pubkeys, cycle_duration, unlock_amount, contract_address, constructor_params)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    vaultId, vaultId, 'live-test', addr, 0.00025, 0, 2,
    JSON.stringify([addr]), JSON.stringify([binToHex(k1.pub), binToHex(k2.pub), binToHex(k3.pub)]),
    100, 0, contract.tokenAddress, ctorSerialized);
  await db!.prepare(`INSERT INTO proposals (id, vault_id, proposal_id, recipient, amount, status, approvals)
    VALUES (?,?,?,?,?,?,?)`).run(proposalId, vaultId, 1, addr, 0.00005, 'approved', '[]');
  log('seeded vault + APPROVED proposal (payout 5000 sats to', addr + ')');

  // drive the REAL service
  log('calling ProposalService.createExecutePayoutTransaction...');
  const result: any = await (ProposalService as any).createExecutePayoutTransaction(proposalId, [binToHex(k1.pub), binToHex(k2.pub)]);
  const wc = result.wcTransaction ?? result.wcTransactionObject ?? result;
  const tx: any = wc.transaction;
  const o0: any = tx.outputs[0], o1: any = tx.outputs[1];
  const stateCommit = o1.token.nft.commitment as Uint8Array;
  const newPeriodId = readLeU32(stateCommit, 5);
  const newSpent = readLeU64(stateCommit, 9);
  log(`service tx: outputs=${tx.outputs.length} locktime=${tx.locktime} payout=${o0.valueSatoshis} newPeriodId=${newPeriodId} newSpent=${newSpent} commitLen=${stateCommit.length}`);
  if (stateCommit.length !== 32) fail(`expected 32-byte commitment, got ${stateCommit.length}`);

  // payoutHash the service persisted
  const prow = await db!.prepare('SELECT payout_hash FROM proposals WHERE id = ?').get(proposalId) as any;
  const payoutHash = hexToBin(prow.payout_hash);

  // sign with the two real keys and broadcast the service-computed spend
  const vaultUtxo = await waitUtxo(provider, contract.tokenAddress, (u: any) => Boolean(u.token?.nft), 'vault NFT (spend)');
  const bc = await new TransactionBuilder({ provider })
    .setLocktime(Number(tx.locktime))
    .addInput(vaultUtxo, contract.unlock.spend(k1.sig, k1.pub, k2.sig, k2.pub, binToHex(payoutHash), binToHex(k1.pkh), BigInt(o0.valueSatoshis), BigInt(newPeriodId), newSpent), { sequence: NON_FINAL })
    .addOutput({ to: addr, amount: BigInt(o0.valueSatoshis) })
    .addOutput({ to: contract.tokenAddress, amount: BigInt(o1.valueSatoshis), token: { category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(stateCommit) } } })
    .send();

  log('VAULT SPEND BROADCAST OK:', bc.txid);
  log('PASS — real proposalService produced a covenant-valid 32-byte LE vault spend, accepted on chipnet.');
  await db!.prepare('DELETE FROM proposals WHERE id = ?').run(proposalId);
  await db!.prepare('DELETE FROM vaults WHERE vault_id = ?').run(vaultId);
  process.exit(0);
}

main().catch((e) => fail(e?.message || String(e)));
