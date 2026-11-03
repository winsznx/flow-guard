/**
 * Smoke test: POST /airdrops/:id/claim holds each co-signed claim until it is on chain,
 * so a wallet that skips confirm-claim can't get a second claim co-signed.
 *
 * The claim limit used to count only rows written by confirm-claim. A wallet could call
 * /claim, broadcast, skip confirm-claim and call /claim again, and the server co-signed a
 * fresh claim against the new state UTXO every time until the pool was empty.
 *
 * Mounts the real airdrops router on a random local port with:
 *   - `pool.query` backed by in-memory airdrop_claims / airdrop_claim_reservations tables
 *   - `AirdropClaimService.buildClaimTransaction` returning a real libauth transaction that
 *     spends the current state UTXO and pays the claimer (the covenant itself is covered by
 *     the contracts tests)
 *   - `ElectrumNetworkProvider.getUtxos / getRawTransaction` backed by a fake chain
 *
 * Covers:
 *   - two /claim calls with no confirm in between hand out the same transaction
 *   - after that transaction is on chain, /claim records it and refuses another claim
 *   - confirm-claim for a claim /claim already recorded succeeds without a second row
 *   - a held claim whose state UTXO was spent by someone else is replaced by a new one
 *   - two concurrent first claims from one wallet hand out at most one transaction
 *
 * NO network, NO database:
 *
 *   pnpm --filter @flowguard/backend exec tsx test/airdrop-claim-reservation.smoke.ts
 *
 * Exit code 0 on pass, non-zero on any assertion failure.
 */

import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  binToHex,
  cashAddressToLockingBytecode,
  encodeLockingBytecodeP2pkh,
  encodeTransaction,
  hashTransaction,
  hexToBin,
  lockingBytecodeToCashAddress,
  type TransactionCommon,
} from '@bitauth/libauth';
import { ElectrumNetworkProvider, type Utxo } from 'cashscript';

process.env.DATABASE_URL ??= 'postgres://stub:stub@127.0.0.1:1/stub';
process.env.APP_URL ??= 'https://app.example.test';
process.env.AIRDROP_CLAIM_KEY_ENCRYPTION_KEY ??= '42'.repeat(32);

const { pool } = await import('../src/database/pg.js');
const { issueBearer } = await import('../src/middleware/auth.js');
const { encryptPrivateKey } = await import('../src/utils/keyEncryption.js');
const { AirdropClaimService } = await import('../src/services/AirdropClaimService.js');
const { ContractService } = await import('../src/services/contract-service.js');
const { default: airdropsRouter } = await import('../src/api/airdrops.js');

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean): void {
  console.log(condition ? 'PASS' : 'FAIL', name);
  if (condition) pass++;
  else fail++;
}

function p2pkhAddress(byte: number): string {
  const encoded = lockingBytecodeToCashAddress({
    bytecode: encodeLockingBytecodeP2pkh(new Uint8Array(20).fill(byte)),
    prefix: 'bchtest',
  });
  if (typeof encoded === 'string') throw new Error(encoded);
  return encoded.address;
}

const CLAIMER = p2pkhAddress(0x11);
const RIVAL = p2pkhAddress(0x22);
const LATE = p2pkhAddress(0x33);
const RACER = p2pkhAddress(0x44);
const CONTRACT = 'bchtest:pcontract';
const CAMPAIGN_ID = '11111111-2222-4333-8444-555555555555';
const AMOUNT_PER_CLAIM = 10_000n;

const campaign = {
  id: CAMPAIGN_ID,
  campaign_id: '#FG-DROP-1',
  creator: p2pkhAddress(0x99),
  status: 'ACTIVE',
  token_type: 'BCH',
  token_decimals: 0,
  total_amount: 0.001,
  amount_per_claim: 0.0001,
  claimed_count: 0,
  require_kyc: 0,
  merkle_data: null,
  max_claims_per_address: 1,
  contract_address: CONTRACT,
  constructor_params: JSON.stringify([
    { type: 'bytes', value: '00'.repeat(32) },
    { type: 'bytes', value: '00'.repeat(20) },
    { type: 'bytes', value: '00'.repeat(20) },
    { type: 'bigint', value: AMOUNT_PER_CLAIM.toString() },
  ]),
  claim_authority_privkey: encryptPrivateKey('01'.repeat(32)),
};

interface Reservation {
  campaign_id: string;
  claimer: string;
  tx_hash: string;
  state_outpoint: string;
  wc_transaction: string;
  created_at: number;
}

const claims: Array<{ campaign_id: string; claimer: string; tx_hash: string }> = [];
const reservations = new Map<string, Reservation>();
const reservationKey = (campaignId: unknown, claimer: unknown) => `${campaignId}|${claimer}`;

pool.query = (async (sql: string, params: unknown[] = []) => {
  if (/FROM airdrops WHERE id = /i.test(sql)) {
    return { rows: [{ ...campaign }], rowCount: 1 };
  }
  if (/COUNT\(1\) as cnt FROM airdrop_claims/i.test(sql)) {
    const cnt = claims.filter((c) => c.campaign_id === params[0] && c.claimer === params[1]).length;
    return { rows: [{ cnt }], rowCount: 1 };
  }
  if (/SELECT 1 FROM airdrop_claims WHERE campaign_id = \$1 AND tx_hash = \$2/i.test(sql)) {
    const found = claims.filter((c) => c.campaign_id === params[0] && c.tx_hash === params[1]);
    return { rows: found.map(() => ({ '?column?': 1 })), rowCount: found.length };
  }
  if (/INSERT INTO airdrop_claims/i.test(sql)) {
    const [, campaignId, claimer, , , txHash] = params as string[];
    if (claims.some((c) => c.campaign_id === campaignId && c.claimer === claimer)) {
      throw new Error('duplicate key value violates unique constraint "idx_airdrop_claims_unique"');
    }
    claims.push({ campaign_id: campaignId, claimer, tx_hash: txHash });
    return { rows: [], rowCount: 1 };
  }
  if (/SELECT \* FROM airdrop_claim_reservations/i.test(sql)) {
    const found = reservations.get(reservationKey(params[0], params[1]));
    return { rows: found ? [{ ...found }] : [], rowCount: found ? 1 : 0 };
  }
  if (/INSERT INTO airdrop_claim_reservations/i.test(sql)) {
    const [campaignId, claimer, txHash, stateOutpoint, wcTransaction, createdAt] = params as [string, string, string, string, string, number];
    const key = reservationKey(campaignId, claimer);
    if (reservations.has(key)) return { rows: [], rowCount: 0 };
    reservations.set(key, {
      campaign_id: campaignId,
      claimer,
      tx_hash: txHash,
      state_outpoint: stateOutpoint,
      wc_transaction: wcTransaction,
      created_at: createdAt,
    });
    return { rows: [], rowCount: 1 };
  }
  if (/UPDATE airdrop_claim_reservations/i.test(sql)) {
    const [txHash, stateOutpoint, wcTransaction, createdAt, campaignId, claimer, heldTxHash] = params as [string, string, string, number, string, string, string];
    const existing = reservations.get(reservationKey(campaignId, claimer));
    if (!existing || existing.tx_hash !== heldTxHash) return { rows: [], rowCount: 0 };
    Object.assign(existing, { tx_hash: txHash, state_outpoint: stateOutpoint, wc_transaction: wcTransaction, created_at: createdAt });
    return { rows: [], rowCount: 1 };
  }
  if (/DELETE FROM airdrop_claim_reservations/i.test(sql)) {
    const key = reservationKey(params[0], params[1]);
    const existing = reservations.get(key);
    if (!existing || existing.tx_hash !== params[2]) return { rows: [], rowCount: 0 };
    reservations.delete(key);
    return { rows: [], rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
}) as unknown as typeof pool.query;

let stateTxid = 'a0'.repeat(32);
const chain = new Map<string, string>();
let builds = 0;

function moveState(txid: string, rawHex: string): void {
  chain.set(txid, rawHex);
  stateTxid = txid;
}

ElectrumNetworkProvider.prototype.getUtxos = async function getUtxos(): Promise<Utxo[]> {
  return [{
    txid: stateTxid,
    vout: 1,
    satoshis: 1_000_000n,
    token: { category: 'cd'.repeat(32), amount: 0n, nft: { capability: 'mutable', commitment: '00'.repeat(40) } },
  }];
};

ElectrumNetworkProvider.prototype.getRawTransaction = async function getRawTransaction(txid: string): Promise<string> {
  const raw = chain.get(txid);
  if (!raw) throw new Error('No such mempool or blockchain transaction');
  return raw;
};

ContractService.prototype.getNFTCommitment = async () => '00'.repeat(40);

AirdropClaimService.prototype.buildClaimTransaction = async function buildClaimTransaction(params) {
  builds++;
  const state = (await new ElectrumNetworkProvider('chipnet').getUtxos(params.contractAddress))[0];
  const claimerLocking = cashAddressToLockingBytecode(params.claimer);
  if (typeof claimerLocking === 'string') throw new Error(claimerLocking);
  const transaction: TransactionCommon = {
    version: 2,
    locktime: 0,
    inputs: [{
      outpointTransactionHash: hexToBin(state.txid),
      outpointIndex: state.vout,
      sequenceNumber: 0xfffffffe,
      // stands in for the authority signature, which differs on every signing
      unlockingBytecode: Uint8Array.of(0x04, builds, 0, 0, 0),
    }],
    outputs: [
      { lockingBytecode: claimerLocking.bytecode, valueSatoshis: AMOUNT_PER_CLAIM },
      { lockingBytecode: Uint8Array.of(0x51), valueSatoshis: state.satoshis - AMOUNT_PER_CLAIM - 4000n },
    ],
  };
  return {
    claimAmount: params.claimAmount,
    wcTransaction: {
      transaction,
      sourceOutputs: [{ ...transaction.inputs[0], lockingBytecode: Uint8Array.of(0x51), valueSatoshis: state.satoshis }],
      broadcast: true,
      userPrompt: 'Claim your airdrop share',
    },
  };
};

const app = express();
app.use(express.json());
app.use('/api', airdropsRouter);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', () => resolve()));
const { port } = server.address() as AddressInfo;
const base = `http://127.0.0.1:${port}/api/airdrops/${CAMPAIGN_ID}`;

function bearerFor(address: string): string {
  return issueBearer({
    address,
    pubkeyHex: '02'.padEnd(66, '0'),
    pubkeyHash: '00'.repeat(20),
    authenticatedAt: Date.now(),
  }).token;
}

interface ClaimResult {
  status: number;
  body: { error?: string; claimAmount?: number; wcTransaction?: { transaction: string } };
  txHash: string | null;
  rawHex: string | null;
}

async function claim(address: string): Promise<ClaimResult> {
  const response = await fetch(`${base}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearerFor(address)}` },
    body: JSON.stringify({ claimerAddress: address }),
  });
  const body = await response.json() as ClaimResult['body'];
  const rawHex = body.wcTransaction?.transaction ?? null;
  return { status: response.status, body, rawHex, txHash: rawHex ? hashTransaction(hexToBin(rawHex)) : null };
}

async function confirmClaim(address: string, txHash: string): Promise<{ status: number; body: { success?: boolean } }> {
  const response = await fetch(`${base}/confirm-claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearerFor(address)}` },
    body: JSON.stringify({ claimerAddress: address, claimedAmount: 0.0001, txHash }),
  });
  return { status: response.status, body: await response.json() as { success?: boolean } };
}

try {
  const first = await claim(CLAIMER);
  check('first claim → 200', first.status === 200 && first.txHash !== null);
  check('first claim amount is the per-claim amount', first.body.claimAmount === 0.0001);
  check('first claim is held', reservations.get(reservationKey(CAMPAIGN_ID, CLAIMER))?.tx_hash === first.txHash);
  check('held claim records the state UTXO it spends',
    reservations.get(reservationKey(CAMPAIGN_ID, CLAIMER))?.state_outpoint === `${'a0'.repeat(32)}:1`);

  const again = await claim(CLAIMER);
  check('second claim with no confirm in between → 200', again.status === 200);
  check('second claim hands back the same transaction', again.txHash === first.txHash && again.rawHex === first.rawHex);
  check('second claim was not co-signed again', builds === 1);

  moveState(first.txHash!, first.rawHex!);
  const afterBroadcast = await claim(CLAIMER);
  check('claim after broadcasting without confirm-claim → 409', afterBroadcast.status === 409);
  check('it says the limit was reached', afterBroadcast.body.error === 'Claim limit reached for this address');
  check('the broadcast claim is recorded', claims.length === 1 && claims[0].tx_hash === first.txHash && claims[0].claimer === CLAIMER);
  check('the held claim is released', !reservations.has(reservationKey(CAMPAIGN_ID, CLAIMER)));
  check('no new claim was co-signed', builds === 1);

  const lateConfirm = await confirmClaim(CLAIMER, first.txHash!);
  check('confirm-claim for an already recorded claim → 200', lateConfirm.status === 200 && lateConfirm.body.success === true);
  check('confirm-claim did not record it twice', claims.length === 1);

  const once = await claim(CLAIMER);
  check('later claims stay refused', once.status === 409 && builds === 1);

  const rivalFirst = await claim(RIVAL);
  check('rival claim → 200', rivalFirst.status === 200);
  const late = await claim(LATE);
  moveState(late.txHash!, late.rawHex!);
  const rivalRetry = await claim(RIVAL);
  check('held claim whose state UTXO was spent by another claim is replaced → 200', rivalRetry.status === 200);
  check('the replacement is a new transaction', rivalRetry.txHash !== null && rivalRetry.txHash !== rivalFirst.txHash);
  check('the replacement spends the live state UTXO',
    reservations.get(reservationKey(CAMPAIGN_ID, RIVAL))?.state_outpoint === `${late.txHash}:1`
      && reservations.get(reservationKey(CAMPAIGN_ID, RIVAL))?.tx_hash === rivalRetry.txHash);

  const racers = await Promise.all([claim(RACER), claim(RACER)]);
  const handedOut = new Set(racers.filter((r) => r.status === 200).map((r) => r.txHash));
  check('concurrent first claims hand out one transaction', handedOut.size === 1);
  check('a concurrent loser is told to retry',
    racers.every((r) => r.status === 200) || racers.some((r) => r.status === 409 && r.body.error === 'Another claim for this address is in progress'));
} finally {
  server.close();
  await pool.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
