/**
 * SIWX integration smoke test over REAL HTTP.
 *
 * Complements `auth-siwx.smoke.ts` (which exercises the cryptographic chain
 * directly against middleware) by booting the actual Express auth router on
 * a random local port and driving it via `fetch()`. This is what catches
 * shape regressions in the JSON wire contract (`/api/auth/nonce` ↔
 * `/api/auth/verify` ↔ `requireWalletAuth` body / status / header parsing).
 *
 * Re-enabled after pnpm.overrides was corrected so `path-to-regexp` no longer
 * jumps to a major-incompatible 8.x when Express 4 expects ~0.1.x.
 *
 * NO test framework dependency. Runs as a standalone Node script via tsx:
 *
 *   pnpm --filter @flowguard/backend exec tsx test/auth-siwx.http.smoke.ts
 *
 * Exit code 0 on pass, non-zero on any assertion failure.
 *
 * Coverage:
 *   1. POST /api/auth/nonce — 200 + nonceId/message/expiresAt
 *   2. Wallet-side BIP-322 sign returns base64 65-byte recoverable signature
 *   3. POST /api/auth/verify — 200 + bearer; legacySiwxFormat=false
 *   4. POST /api/_test/guarded with Authorization: Bearer → 200
 *   5. Same nonceId replay against /api/auth/verify → 401
 *   6. Bearer reuse — guarded route still 200
 *   7. Guarded route with no auth → 401
 *   8. Guarded route with tampered bearer → 401
 *   9. POST /api/auth/nonce with body.domain/uri/chainId honored in message
 */

import express from 'express';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import {
  encodeCashAddress,
  hash160,
  secp256k1,
} from '@bitauth/libauth';

import authRouter from '../src/api/auth.js';
import { requireWalletAuth, __test } from '../src/middleware/auth.js';

const { hashBchSignedMessage } = __test;

function generateKeypair(): { privKey: Uint8Array; pubKey: Uint8Array } {
  for (let i = 0; i < 8; i++) {
    const candidate = new Uint8Array(randomBytes(32));
    const pub = secp256k1.derivePublicKeyCompressed(candidate);
    if (pub instanceof Uint8Array) {
      return { privKey: candidate, pubKey: pub };
    }
  }
  throw new Error('Could not generate a valid secp256k1 keypair after 8 tries');
}

function cashAddressForPubkey(pubKey: Uint8Array): string {
  const hash = hash160(pubKey);
  if (typeof hash === 'string') throw new Error('hash160 failed');
  return encodeCashAddress({
    payload: hash,
    prefix: 'bchtest',
    type: 'p2pkh',
    throwErrors: true,
  }).address;
}

function bip322Sign(message: string, privKey: Uint8Array): string {
  const digest = hashBchSignedMessage(message);
  const r = secp256k1.signMessageHashRecoverableCompact(privKey, digest);
  if (typeof r === 'string') throw new Error(`sign failed: ${r}`);
  const out = new Uint8Array(65);
  out[0] = 31 + r.recoveryId; // compressed pubkey + recovery
  out.set(r.signature, 1);
  return Buffer.from(out).toString('base64');
}

async function bootApp(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use('/api', authRouter);
  app.post('/api/_test/guarded', requireWalletAuth, (req, res) => {
    res.json({ ok: true, address: req.verifiedUser?.address ?? null });
  });
  return new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve({
        baseUrl,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

interface Check { name: string; pass: boolean; detail?: string }
const checks: Check[] = [];
function check(name: string, condition: boolean, detail?: string): void {
  checks.push({ name, pass: condition, detail });
}

async function postJson<T = unknown>(url: string, body: unknown): Promise<{ status: number; data: T }> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data: T = null as unknown as T;
  try {
    data = (await resp.json()) as T;
  } catch {
    // non-JSON response
  }
  return { status: resp.status, data };
}

async function postBearer(url: string, bearer: string | null): Promise<{ status: number }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: '{}',
  });
  return { status: resp.status };
}

async function main(): Promise<void> {
  const { baseUrl, close } = await bootApp();

  try {
    const { privKey, pubKey } = generateKeypair();
    const address = cashAddressForPubkey(pubKey);

    // 1. Nonce — with CAIP-122 context
    const nonceResp = await postJson<{
      success: boolean;
      nonceId: string;
      message: string;
      expiresAt: number;
    }>(`${baseUrl}/api/auth/nonce`, {
      address,
      domain: 'flowguard.test',
      uri: 'https://flowguard.test/app',
      chainId: 'bch:bchtest',
    });
    check('nonce/200', nonceResp.status === 200, `status=${nonceResp.status}`);
    check('nonce/has-id', typeof nonceResp.data?.nonceId === 'string');
    check('nonce/has-message', typeof nonceResp.data?.message === 'string');
    check('nonce/honors-domain', nonceResp.data?.message?.includes('flowguard.test') === true);
    check('nonce/honors-uri', nonceResp.data?.message?.includes('https://flowguard.test/app') === true);
    check('nonce/honors-chainid', nonceResp.data?.message?.includes('bch:bchtest') === true);

    const { nonceId, message } = nonceResp.data;

    // 2. Sign
    const signature = bip322Sign(message, privKey);

    // 3. Verify
    const verifyResp = await postJson<{
      success: boolean;
      bearer: string;
      expiresAt: number;
      verifiedUser: { legacySiwxFormat: boolean };
    }>(`${baseUrl}/api/auth/verify`, { address, nonceId, signature });
    check(
      'verify/200',
      verifyResp.status === 200,
      `status=${verifyResp.status} ${JSON.stringify(verifyResp.data).slice(0, 200)}`,
    );
    check('verify/has-bearer', typeof verifyResp.data?.bearer === 'string');
    check('verify/bip322-path', verifyResp.data?.verifiedUser?.legacySiwxFormat === false);

    const bearer = verifyResp.data.bearer;

    // 4. Guarded route accepts the bearer
    const guarded1 = await postBearer(`${baseUrl}/api/_test/guarded`, bearer);
    check('guarded/bearer-200', guarded1.status === 200);

    // 5. Same-nonce replay rejected
    const replay = await postJson(`${baseUrl}/api/auth/verify`, { address, nonceId, signature });
    check('verify/replay-401', replay.status === 401);

    // 6. Bearer reuse
    const guarded2 = await postBearer(`${baseUrl}/api/_test/guarded`, bearer);
    check('guarded/bearer-reuse-200', guarded2.status === 200);

    // 7. No auth
    const noAuth = await postBearer(`${baseUrl}/api/_test/guarded`, null);
    check('guarded/no-auth-401', noAuth.status === 401);

    // 8. Tampered bearer
    const dotIdx = bearer.lastIndexOf('.');
    const tampered =
      bearer.slice(0, dotIdx) +
      '.' +
      bearer.slice(dotIdx + 1, -1) +
      (bearer.slice(-1) === 'A' ? 'B' : 'A');
    const tamperedResp = await postBearer(`${baseUrl}/api/_test/guarded`, tampered);
    check('guarded/tampered-401', tamperedResp.status === 401);

    // 9. SIWX 4-header path on a fresh nonce
    const n2 = await postJson<{ nonceId: string; message: string }>(
      `${baseUrl}/api/auth/nonce`,
      { address },
    );
    const sig2 = bip322Sign(n2.data.message, privKey);
    const siwxHeadersResp = await fetch(`${baseUrl}/api/_test/guarded`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': address,
        'x-signed-nonce': sig2,
        'x-nonce-id': n2.data.nonceId,
      },
      body: '{}',
    });
    check('guarded/siwx-headers-200', siwxHeadersResp.status === 200);
  } finally {
    await close();
  }

  for (const c of checks) {
    const mark = c.pass ? 'PASS' : 'FAIL';
    const detail = c.detail ? ` — ${c.detail}` : '';
    console.log(`  [${mark}] ${c.name}${detail}`);
  }
  const passed = checks.filter((c) => c.pass).length;
  console.log(`\n${passed}/${checks.length} passed`);
  if (passed !== checks.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('SIWX HTTP smoke test crashed:', err);
  process.exit(1);
});
