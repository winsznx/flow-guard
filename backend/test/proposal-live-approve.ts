// LIVE end-to-end test of the proposal approve flow through the REAL service +
// real Postgres + chipnet. Drives ProposalService.createApproveProposalWcTransaction
// twice (signer1 then signer2) to reach APPROVED, signing + broadcasting each.
// Verifies the approve fee fix (700 -> 4000) and the LE proposal commitment.
//
//   DATABASE_URL=… PG_SSL_DISABLED=true BCH_NETWORK=chipnet \
//   CHIPNET_PRIVKEY_HEX=<64hex> pnpm tsx test/proposal-live-approve.ts

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { secp256k1, hash160, encodeCashAddress, binToHex, hexToBin } from '@bitauth/libauth';
import { Contract, TransactionBuilder, SignatureTemplate, ElectrumNetworkProvider } from 'cashscript';
import { db } from '../src/database/pg.js';
import { ProposalService } from '../src/services/proposalService.js';

const PREFIX = 'bchtest';
const log = (...a: unknown[]) => console.log('[prop-live]', ...a);
const fail = (m: string) => { console.error('[prop-live] FAIL:', m); process.exit(1); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function keyFromHex(hex: string) {
  const k = hexToBin(hex);
  const pub = secp256k1.derivePublicKeyCompressed(k) as Uint8Array;
  const pkh = hash160(pub) as Uint8Array;
  return { priv: k, pub, pkh, sig: new SignatureTemplate(k), addr: encodeCashAddress({ prefix: PREFIX, type: 'p2pkh', payload: pkh }).address };
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

function leU40(buf: Buffer, value: number, off: number) { let v = BigInt(value); for (let i = 0; i < 5; i++) { buf[off + i] = Number(v & 0xffn); v >>= 8n; } }
async function waitUtxo(provider: ElectrumNetworkProvider, address: string, pred: (u: any) => boolean, label: string): Promise<any> {
  for (let i = 0; i < 60; i++) {
    const u = (await provider.getUtxos(address)).find(pred);
    if (u) return u;
    if (i % 3 === 0) log(`waiting for ${label}...`);
    await sleep(4000);
  }
  fail(`timed out waiting for ${label}`); throw 0;
}
const hexOf = (c: unknown) => (typeof c === 'string' ? c : binToHex(c as Uint8Array));

async function approveOnce(provider: ElectrumNetworkProvider, contract: any, proposalId: string, signer: { sig: SignatureTemplate; pub: Uint8Array; addr: string }, category: string, label: string) {
  const res: any = await (ProposalService as any).createApproveProposalWcTransaction(proposalId, signer.addr);
  const wc = res.wcTransaction ?? res;
  const tx: any = wc.transaction;
  const o0: any = tx.outputs[0];
  const newMask = (o0.token.nft.commitment as Uint8Array)[2];
  const newStatus = (o0.token.nft.commitment as Uint8Array)[1];
  log(`${label}: outputs=${tx.outputs.length} newMask=0x0${newMask} newStatus=${newStatus}`);
  if (tx.outputs.length !== 1) fail(`${label}: expected 1 output, got ${tx.outputs.length}`);
  const utxo = await waitUtxo(provider, contract.tokenAddress, (u: any) => Boolean(u.token?.nft), `${label} input NFT`);
  const bc = await new TransactionBuilder({ provider })
    .addInput(utxo, contract.unlock.approve(signer.sig, signer.pub))
    .addOutput({ to: contract.tokenAddress, amount: BigInt(o0.valueSatoshis), token: { category, amount: 0n, nft: { capability: utxo.token.nft.capability, commitment: hexOf(o0.token.nft.commitment) } } })
    .send();
  log(`  ${label} BROADCAST OK:`, bc.txid);
  await waitUtxo(provider, contract.tokenAddress, (u: any) => u.txid === bc.txid && u.vout === 0, `${label} new NFT`);
  return newStatus;
}

async function main() {
  const provider = new ElectrumNetworkProvider('chipnet');
  log('payer/signer1:', k1.addr);
  let utxos = (await provider.getUtxos(k1.addr)).filter((u: any) => !u.token);
  const bal = utxos.reduce((s: bigint, u: any) => s + u.satoshis, 0n);
  if (bal < 40000n) fail(`fund ${k1.addr}`);
  let anchor = utxos.find((u: any) => u.vout === 0);
  if (!anchor) {
    const t = await new TransactionBuilder({ provider }).addInputs(utxos, k1.sig.unlockP2PKH())
      .addOutput({ to: k1.addr, amount: 30000n }).addOutput({ to: k1.addr, amount: bal - 32000n }).send();
    anchor = await waitUtxo(provider, k1.addr, (u: any) => u.txid === t.txid && u.vout === 0, 'anchor');
  }

  const now = Math.floor(Date.now() / 1000);
  const vaultId = '2c'.repeat(32);
  const ctorArgs: any[] = [vaultId, binToHex(k1.pkh), binToHex(k2.pkh), binToHex(k3.pkh), 2n];
  const artifact = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../contracts/artifacts/treasury/ProposalCovenant.json'), 'utf8'));
  const contract = new Contract(artifact, ctorArgs, { provider });
  log('proposal token address:', contract.tokenAddress);

  // fund the proposal NFT — initial PENDING commitment (LE voting_end/timelock)
  const category = anchor.txid;
  const c = Buffer.alloc(40);
  c[0] = 1; c[1] = 0; c[2] = 0; c[3] = 2;
  leU40(c, now + 100000, 4); leU40(c, now - 100000, 9);
  Buffer.from(hexToBin('11'.repeat(20))).copy(c, 14);
  const fresh = (await provider.getUtxos(k1.addr)).filter((u: any) => !u.token);
  const a2 = fresh.find((u: any) => u.txid === anchor.txid && u.vout === anchor.vout) || anchor;
  const totalIn = fresh.reduce((s: bigint, u: any) => s + u.satoshis, 0n);
  const ftb = new TransactionBuilder({ provider });
  ftb.addInput(a2, k1.sig.unlockP2PKH());
  const others = fresh.filter((u: any) => !(u.txid === a2.txid && u.vout === a2.vout));
  if (others.length) ftb.addInputs(others, k1.sig.unlockP2PKH());
  ftb.addOutput({ to: contract.tokenAddress, amount: 25000n, token: { category, amount: 0n, nft: { capability: 'mutable', commitment: binToHex(c) } } });
  ftb.addOutput({ to: k1.addr, amount: totalIn - 25000n - 2000n });
  await ftb.send();
  await waitUtxo(provider, contract.tokenAddress, (u: any) => Boolean(u.token?.nft), 'proposal NFT');
  log('proposal funded: 25000 (PENDING, required 2)');

  // seed DB
  const proposalId = 'live-' + vaultId.slice(0, 12);
  const propCtor = JSON.stringify([
    { type: 'bytes', value: vaultId }, { type: 'bytes', value: binToHex(k1.pkh) },
    { type: 'bytes', value: binToHex(k2.pkh) }, { type: 'bytes', value: binToHex(k3.pkh) }, { type: 'bigint', value: '2' },
  ]);
  await db!.prepare('DELETE FROM proposals WHERE id = ?').run(proposalId);
  await db!.prepare('DELETE FROM vaults WHERE vault_id = ?').run(vaultId);
  await db!.prepare(`INSERT INTO vaults (id, vault_id, name, creator, total_deposit, spending_cap, approval_threshold, signers, signer_pubkeys, cycle_duration, unlock_amount)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    vaultId, vaultId, 'live-prop', k1.addr, 0.00025, 0, 2,
    JSON.stringify([k1.addr, k2.addr, k3.addr]), JSON.stringify([binToHex(k1.pub), binToHex(k2.pub), binToHex(k3.pub)]), 100, 0);
  await db!.prepare(`INSERT INTO proposals (id, vault_id, proposal_id, recipient, amount, status, approvals, contract_address, constructor_params)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(proposalId, vaultId, 1, k1.addr, 0.00005, 'pending', '[]', contract.tokenAddress, propCtor);
  log('seeded vault + PENDING proposal');

  log('--- approve #1 (signer1) ---');
  await approveOnce(provider, contract, proposalId, k1, category, 'approve#1');
  log('--- approve #2 (signer2) ---');
  const finalStatus = await approveOnce(provider, contract, proposalId, k2, category, 'approve#2');

  if (finalStatus !== 1) fail(`expected APPROVED (status 1) after 2/2, got ${finalStatus}`);
  log('\nPASS — real proposalService drove 2-of-3 approve to APPROVED, both broadcast on chipnet.');
  await db!.prepare('DELETE FROM proposals WHERE id = ?').run(proposalId);
  await db!.prepare('DELETE FROM vaults WHERE vault_id = ?').run(vaultId);
  process.exit(0);
}

main().catch((e) => fail(e?.message || String(e)));
