// Shared pieces for the chipnet end-to-end suite: deterministic test wallets, sign-in,
// a signer that treats the API's WalletConnect payloads the way a phone wallet does,
// and helpers that wait for the chain.
//
// Every script expects a FlowGuard backend running with BCH_NETWORK=chipnet at
// E2E_API (default http://127.0.0.1:3102). Nothing here can reach mainnet: the
// signer refuses any address that isn't bchtest.

import { createHash } from 'node:crypto';
import {
  binToHex,
  decodeTransaction,
  encodeCashAddress,
  encodeTransaction,
  generateSigningSerializationBCH,
  hash160,
  hash256,
  hexToBin,
  secp256k1,
  type Output,
} from '@bitauth/libauth';
import { ElectrumNetworkProvider } from 'cashscript';
import { __test } from '../../src/middleware/auth.js';

export const API = process.env.E2E_API ?? 'http://127.0.0.1:3102';
export const provider = new ElectrumNetworkProvider('chipnet');

const SIGHASH_ALL_UTXOS_FORKID = 0x61;

export interface TestWallet {
  name: string;
  priv: Uint8Array;
  pub: Uint8Array;
  pkh: Uint8Array;
  address: string;
  tokenAddress: string;
  lockingBytecode: Uint8Array;
  bearer?: string;
}

export function wallet(name: string, seed: string): TestWallet {
  const priv = new Uint8Array(createHash('sha256').update(seed).digest());
  const pub = secp256k1.derivePublicKeyCompressed(priv);
  if (typeof pub === 'string') throw new Error(pub);
  const pkh = hash160(pub);
  const address = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: pkh }).address;
  const tokenAddress = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkhWithTokens', payload: pkh }).address;
  const lockingBytecode = Uint8Array.from([0x76, 0xa9, 0x14, ...pkh, 0x88, 0xac]);
  return { name, priv, pub, pkh, address, tokenAddress, lockingBytecode };
}

export const alice = wallet('alice', 'flowguard-chipnet-ft-e2e-v1');
export const bob = wallet('bob', 'flowguard-chipnet-e2e-recipient-v1');
export const carol = wallet('carol', 'flowguard-chipnet-e2e-signer3-v1');

// ---------------------------------------------------------------------------
// Reporting

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
export const txids: Array<{ step: string; txid: string }> = [];

export function log(...parts: unknown[]): void {
  console.log('[e2e]', ...parts);
}

export function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  PASS' : '  FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

export function record(step: string, txid: string): void {
  txids.push({ step, txid });
  log(`tx ${step}: ${txid}`);
}

export function summary(): number {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  for (const f of failed) console.log(`  FAIL ${f.name} ${f.detail}`);
  console.log('\ntransactions:');
  for (const t of txids) console.log(`  ${t.step}: ${t.txid}`);
  return failed.length;
}

// ---------------------------------------------------------------------------
// HTTP

export interface ApiResult<T = any> {
  status: number;
  body: T;
}

let requestCounter = 1;

export async function api<T = any>(
  method: string,
  path: string,
  options: { body?: unknown; as?: TestWallet } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // A local backend started with EDGE_PROXY_SECRET trusts the forwarded client IP,
  // so each call gets its own rate-limit bucket.
  if (process.env.E2E_EDGE_SECRET) {
    headers['x-flowguard-edge-secret'] = process.env.E2E_EDGE_SECRET;
    headers['x-flowguard-client-ip'] = `10.${(requestCounter >> 16) & 255}.${(requestCounter >> 8) & 255}.${requestCounter & 255}`;
    requestCounter += 1;
  }
  if (options.as) {
    headers['x-user-address'] = options.as.address;
    if (options.as.bearer) headers.Authorization = `Bearer ${options.as.bearer}`;
  }
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep the raw text for the report */ }
  return { status: response.status, body };
}

export async function expectOk<T = any>(label: string, result: Promise<ApiResult<T>>): Promise<T> {
  const r = await result;
  const ok = r.status >= 200 && r.status < 300;
  check(label, ok, ok ? '' : `${r.status} ${JSON.stringify(r.body).slice(0, 400)}`);
  if (!ok) throw new Error(`${label} failed with ${r.status}`);
  return r.body;
}

export async function signIn(w: TestWallet): Promise<void> {
  const nonce = await api('POST', '/api/auth/nonce', { body: { address: w.address, chainId: 'bch:bchtest' } });
  if (nonce.status !== 200) throw new Error(`nonce for ${w.name}: ${nonce.status} ${JSON.stringify(nonce.body)}`);
  const digest = __test.hashBchSignedMessage(nonce.body.message);
  const signed = secp256k1.signMessageHashRecoverableCompact(w.priv, digest);
  if (typeof signed === 'string') throw new Error(signed);
  const signature = Buffer.from(Uint8Array.from([31 + signed.recoveryId, ...signed.signature])).toString('base64');
  const verify = await api('POST', '/api/auth/verify', {
    body: { address: w.address, nonceId: nonce.body.nonceId, signature },
  });
  if (verify.status !== 200) throw new Error(`verify for ${w.name}: ${verify.status} ${JSON.stringify(verify.body)}`);
  w.bearer = verify.body.bearer;
}

// ---------------------------------------------------------------------------
// Signing

export interface SerializedSourceOutput {
  lockingBytecode: string;
  valueSatoshis: string | number;
  unlockingBytecode?: string;
  token?: { category: string; amount: string | number; nft?: { capability: 'none' | 'mutable' | 'minting'; commitment: string } };
  contract?: { redeemScript: string };
}

export interface SerializedWc {
  transaction: string;
  sourceOutputs: SerializedSourceOutput[];
  broadcast?: boolean;
  userPrompt?: string;
}

function toOutput(so: SerializedSourceOutput): Output {
  return {
    lockingBytecode: hexToBin(so.lockingBytecode),
    valueSatoshis: BigInt(so.valueSatoshis),
    ...(so.token
      ? {
          token: {
            category: hexToBin(so.token.category),
            amount: BigInt(so.token.amount),
            ...(so.token.nft ? { nft: { capability: so.token.nft.capability, commitment: hexToBin(so.token.nft.commitment) } } : {}),
          },
        }
      : {}),
  };
}

function replaceAll(haystack: Uint8Array, needle: Uint8Array, replacement: Uint8Array): Uint8Array {
  const hay = binToHex(haystack);
  return hexToBin(hay.split(binToHex(needle)).join(binToHex(replacement)));
}

/**
 * Signs every input the wallet can: its own P2PKH inputs, and placeholder signature and
 * public key slots inside contract inputs, the same way the supported phone wallets do.
 * Returns the signed transaction hex.
 */
export function signWc(serialized: SerializedWc, w: TestWallet): string {
  const decoded = decodeTransaction(hexToBin(serialized.transaction));
  if (typeof decoded === 'string') throw new Error(`decode: ${decoded}`);
  const sourceOutputs = serialized.sourceOutputs.map(toOutput);
  const placeholderSig = new Uint8Array(65);
  const placeholderPub = new Uint8Array(33);

  decoded.inputs.forEach((input, inputIndex) => {
    const so = serialized.sourceOutputs[inputIndex];
    const isMine = binToHex(sourceOutputs[inputIndex].lockingBytecode) === binToHex(w.lockingBytecode);
    const coveredBytecode = so.contract ? hexToBin(so.contract.redeemScript) : sourceOutputs[inputIndex].lockingBytecode;
    const preimage = generateSigningSerializationBCH(
      { inputIndex, sourceOutputs, transaction: decoded },
      { coveredBytecode, signingSerializationType: Uint8Array.of(SIGHASH_ALL_UTXOS_FORKID) },
    );
    const sig = secp256k1.signMessageHashSchnorr(w.priv, hash256(preimage));
    if (typeof sig === 'string') throw new Error(sig);
    const fullSig = Uint8Array.from([...sig, SIGHASH_ALL_UTXOS_FORKID]);

    if (so.contract) {
      let unlocking = so.unlockingBytecode ? hexToBin(so.unlockingBytecode) : input.unlockingBytecode;
      unlocking = replaceAll(unlocking, placeholderSig, fullSig);
      unlocking = replaceAll(unlocking, placeholderPub, w.pub);
      input.unlockingBytecode = unlocking;
    } else if (isMine) {
      input.unlockingBytecode = Uint8Array.from([0x41, ...fullSig, 0x21, ...w.pub]);
    }
  });

  return binToHex(encodeTransaction(decoded));
}

export function txidOf(hex: string): string {
  return binToHex(hash256(hexToBin(hex)).reverse());
}

/** Signs, then broadcasts through the API the way the app does. Returns the txid. */
export async function signAndBroadcast(step: string, serialized: SerializedWc, w: TestWallet, metadata: Record<string, unknown> = {}): Promise<string> {
  const signedHex = signWc(serialized, w);
  const r = await api('POST', '/api/transactions/broadcast', { as: w, body: { txHex: signedHex, ...metadata } });
  const ok = r.status >= 200 && r.status < 300 && typeof r.body?.txid === 'string';
  check(`${step}: broadcast`, ok, ok ? '' : `${r.status} ${JSON.stringify(r.body).slice(0, 600)}`);
  if (!ok) throw new Error(`${step} broadcast failed`);
  record(step, r.body.txid);
  return r.body.txid;
}

// ---------------------------------------------------------------------------
// Chain helpers

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function balance(address: string): Promise<{ sats: bigint; tokens: Record<string, bigint> }> {
  const utxos = await provider.getUtxos(address);
  const tokens: Record<string, bigint> = {};
  let sats = 0n;
  for (const u of utxos) {
    if (u.token) tokens[u.token.category] = (tokens[u.token.category] ?? 0n) + (u.token.amount ?? 0n);
    else sats += u.satoshis;
  }
  return { sats, tokens };
}

/** Waits until a condition on the API holds, polling every few seconds. */
export async function waitFor<T>(label: string, read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 120_000): Promise<T> {
  const start = Date.now();
  let last: T = await read();
  while (!done(last)) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await sleep(4000);
    last = await read();
  }
  return last;
}

export async function waitForTx(txid: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      await provider.getRawTransaction(txid);
      return;
    } catch {
      if (Date.now() - start > timeoutMs) throw new Error(`tx ${txid} not seen`);
      await sleep(2000);
    }
  }
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// Lifecycle: build on the server, sign as the wallet, broadcast, confirm on the server.

export interface LifecycleStep {
  step: string;
  as: TestWallet;
  build: { method?: string; path: string; body?: unknown };
  confirm?: (built: any, txid: string) => { path: string; body: unknown };
  /** Where the serialized transaction sits in the build response. */
  pick?: (built: any) => SerializedWc;
}

export async function lifecycle(s: LifecycleStep): Promise<{ built: any; txid: string; confirmed: any }> {
  const method = s.build.method ?? 'POST';
  const built = await expectOk(`${s.step}: build`, api(method, s.build.path, { as: s.as, body: method === 'GET' ? undefined : s.build.body ?? {} }));
  const wc = s.pick ? s.pick(built) : built.wcTransaction;
  if (!wc) {
    check(`${s.step}: has a transaction to sign`, false, JSON.stringify(built).slice(0, 300));
    throw new Error(`${s.step}: nothing to sign`);
  }
  const txid = await signAndBroadcast(s.step, wc, s.as);
  let confirmed: any = null;
  if (s.confirm) {
    const c = s.confirm(built, txid);
    confirmed = await expectOk(`${s.step}: confirm`, api('POST', c.path, { as: s.as, body: c.body }));
  }
  return { built, txid, confirmed };
}

export async function expectStatus(label: string, result: Promise<ApiResult>, allowed: number[]): Promise<ApiResult> {
  const r = await result;
  check(label, allowed.includes(r.status), `${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  return r;
}

/**
 * Funding for airdrops, bounties, rewards and grants: an optional preparation
 * transaction (wallet consolidation for the genesis input), then the funding itself.
 */
export async function fundCampaign(kind: string, id: string, w: TestWallet): Promise<void> {
  const path = `/api/${kind}/${id}/funding-info`;
  let info = await api('GET', path, { as: w });
  for (let attempt = 0; info.status !== 200 && attempt < 5; attempt += 1) {
    await sleep(3000);
    info = await api('GET', path, { as: w });
  }
  if (info.status !== 200) {
    check(`${kind}: funding info`, false, `${info.status} ${JSON.stringify(info.body).slice(0, 300)}`);
    throw new Error(`${kind} funding info failed`);
  }
  if (info.body.requiresPreparation && info.body.preparationTransaction) {
    await signAndBroadcast(`${kind}: preparation`, info.body.preparationTransaction, w);
    await sleep(8000);
    info = await api('GET', path, { as: w });
    for (let attempt = 0; (info.status !== 200 || info.body.requiresPreparation) && attempt < 10; attempt += 1) {
      await sleep(4000);
      info = await api('GET', path, { as: w });
    }
  }
  const wc = info.body.wcTransaction;
  if (!wc) {
    check(`${kind}: funding transaction`, false, JSON.stringify(info.body).slice(0, 300));
    throw new Error(`${kind}: nothing to sign`);
  }
  const txHash = await signAndBroadcast(`${kind}: fund`, wc, w);
  await expectOk(`${kind}: fund confirm`, api('POST', `/api/${kind}/${id}/confirm-funding`, { as: w, body: { txHash } }));
}

export const TEST_TOKEN = process.env.E2E_TOKEN ?? 'f20eb7f99b72fb6779dbac396f18e3a6a67d7d55858f2447f2da37b8295e2556';
