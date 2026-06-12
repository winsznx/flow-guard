/**
 * SIWX integration smoke test — runs the full Sign-In With BCH cryptographic
 * chain end-to-end against the real middleware using a libauth-generated
 * keypair as the "wallet".
 *
 * Express is intentionally NOT booted because the hoisted node_modules
 * currently resolve `path-to-regexp` to a major-incompatible version (8.x
 * instead of ~0.1.x that Express 4 needs) — a real bug surfaced by this same
 * test pass, now fixed in root package.json by tightening the override range.
 * The cryptographic + bearer logic is what we need to cover here; the HTTP
 * surface gets covered by the contract test once `pnpm install` lands the
 * corrected lockfile.
 *
 * NO test framework dependency. Runs as a standalone Node script via tsx:
 *
 *   pnpm --filter @flowguard/backend exec tsx test/auth-siwx.smoke.ts
 *
 * Exit code 0 on pass, non-zero on any assertion failure.
 *
 * Coverage:
 *   1. `issueAuthNonce` returns a CAIP-122 multi-line message + id
 *   2. The message can be signed via BIP-322 (`Bitcoin Signed Message:\n` +
 *      varint + payload, double-SHA-256, secp256k1 recoverable signature,
 *      base64) producing a 65-byte recoverable signature blob
 *   3. `verifyWalletOwnership` accepts the proof; returns legacySiwxFormat=false
 *   4. Same nonce id replays as failure (one-shot consumption)
 *   5. `issueBearer` issues a token; `verifyBearer` round-trips
 *   6. Tampered bearer is rejected
 *   7. Mock `requireWalletAuth` middleware accepts `Authorization: Bearer ...`
 *   8. Mock `requireWalletAuth` accepts the SIWX 4-header path
 *   9. Mock `requireWalletAuth` rejects bad/missing headers
 */

import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import {
  encodeCashAddress,
  hash160,
  secp256k1,
} from '@bitauth/libauth';

import {
  issueAuthNonce,
  verifyWalletOwnership,
  issueBearer,
  verifyBearer,
  requireWalletAuth,
  __test,
} from '../src/middleware/auth.js';

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
  if (typeof hash === 'string') {
    throw new Error('hash160 failed for pubkey');
  }
  const encoded = encodeCashAddress({
    payload: hash,
    prefix: 'bchtest',
    type: 'p2pkh',
    throwErrors: true,
  });
  return encoded.address;
}

/**
 * Sign a CAIP-122 message exactly the way Cashonize / Paytaca-mobile do via
 * `bch_signMessage`: BIP-322 / Bitcoin Signed Message scheme, returning a
 * 65-byte recoverable signature base64-encoded.
 */
function bip322Sign(message: string, privKey: Uint8Array): string {
  const digest = hashBchSignedMessage(message);
  const result = secp256k1.signMessageHashRecoverableCompact(privKey, digest);
  if (typeof result === 'string') {
    throw new Error(`signMessageHashRecoverableCompact failed: ${result}`);
  }
  const { recoveryId, signature } = result;
  const out = new Uint8Array(65);
  // Standard Bitcoin signed-message header byte for compressed pubkey + recovery id.
  out[0] = 31 + recoveryId;
  out.set(signature, 1);
  return Buffer.from(out).toString('base64');
}

interface MockReq {
  headers: Record<string, string | undefined>;
  verifiedUser?: { address: string };
}
interface MockRes {
  statusCode: number;
  payload: unknown;
  status: (code: number) => MockRes;
  json: (body: unknown) => MockRes;
}

function mockReq(headers: Record<string, string>): MockReq {
  return { headers: { ...headers } };
}
function mockRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    payload: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.payload = body;
      return res;
    },
  };
  return res;
}

async function runMiddleware(headers: Record<string, string>): Promise<{ req: MockReq; res: MockRes; nextCalled: boolean }> {
  const req = mockReq(headers);
  const res = mockRes();
  let nextCalled = false;
  await (requireWalletAuth as unknown as (r: MockReq, s: MockRes, n: () => void) => Promise<void>)(
    req,
    res,
    () => {
      nextCalled = true;
    },
  );
  return { req, res, nextCalled };
}

interface Check { name: string; pass: boolean; detail?: string }
const checks: Check[] = [];
function check(name: string, condition: boolean, detail?: string): void {
  checks.push({ name, pass: condition, detail });
}

async function main(): Promise<void> {
  const { privKey, pubKey } = generateKeypair();
  const address = cashAddressForPubkey(pubKey);

  // ===== 1. Nonce issuance + CAIP-122 message shape =====
  const nonce = await issueAuthNonce(address, { domain: 'flowguard.test', uri: 'https://flowguard.test' });
  check('nonce/has-id', typeof nonce.id === 'string' && nonce.id.length >= 16);
  check('nonce/has-message', typeof nonce.message === 'string' && nonce.message.length > 50);
  check('nonce/has-expiry', typeof nonce.expiresAt === 'number' && nonce.expiresAt > Date.now());
  check('nonce/caip122-domain', nonce.message.includes('flowguard.test'));
  check('nonce/caip122-chainid', nonce.message.includes('Chain ID:'));
  check('nonce/caip122-issuedat', nonce.message.includes('Issued At:'));
  check('nonce/caip122-expiration', nonce.message.includes('Expiration Time:'));
  check('nonce/caip122-nonce-line', nonce.message.includes(`Nonce: ${nonce.id}`));

  // ===== 2. Sign with BIP-322 =====
  const signature = bip322Sign(nonce.message, privKey);
  check('sign/base64-shape', /^[A-Za-z0-9+/]+=*$/.test(signature) && Buffer.from(signature, 'base64').length === 65);

  // ===== 3. Verify accepts the proof =====
  const verified = await verifyWalletOwnership({ address, nonceId: nonce.id, signature });
  check('verify/address-match', verified.address === address);
  check('verify/bip322-path', verified.legacySiwxFormat === false);
  check('verify/pubkey-recovered', verified.pubkeyHex.length === 66);

  // ===== 4. Replay rejected (one-shot) =====
  let replayThrew = false;
  try {
    await verifyWalletOwnership({ address, nonceId: nonce.id, signature });
  } catch {
    replayThrew = true;
  }
  check('verify/replay-rejected', replayThrew, 'second use of same nonce must throw');

  // ===== 5. Bearer issue + verify round-trip =====
  const bearer = issueBearer(verified);
  check('bearer/has-token', typeof bearer.token === 'string' && bearer.token.includes('.'));
  check('bearer/has-expiry', bearer.expiresAt > Date.now());

  const decoded = verifyBearer(bearer.token);
  check('bearer/verify-ok', decoded !== null);
  check('bearer/address-match', decoded?.address === address);
  check('bearer/pubkey-match', decoded?.pubkeyHex === verified.pubkeyHex);

  // ===== 6. Tampered bearer rejected =====
  const dotIdx = bearer.token.lastIndexOf('.');
  const tampered =
    bearer.token.slice(0, dotIdx) +
    '.' +
    bearer.token.slice(dotIdx + 1, -1) +
    (bearer.token.slice(-1) === 'A' ? 'B' : 'A');
  check('bearer/tamper-rejected', verifyBearer(tampered) === null);

  // Garbage shape rejected
  check('bearer/garbage-rejected', verifyBearer('not-a-real-token.AAAA') === null);
  check('bearer/empty-rejected', verifyBearer('') === null);
  check('bearer/no-dot-rejected', verifyBearer('eyJhYmMiOjF9') === null);

  // ===== 7. Middleware: Authorization: Bearer accepted =====
  {
    const result = await runMiddleware({ authorization: `Bearer ${bearer.token}` });
    check('middleware/bearer-accepted', result.nextCalled);
    check('middleware/bearer-verified-user', result.req.verifiedUser?.address === address);
  }

  // ===== 8. Middleware: SIWX 4-header path (fresh nonce) =====
  {
    const nonce2 = await issueAuthNonce(address);
    const sig2 = bip322Sign(nonce2.message, privKey);
    const result = await runMiddleware({
      'x-user-address': address,
      'x-signed-nonce': sig2,
      'x-nonce-id': nonce2.id,
    });
    check('middleware/siwx-accepted', result.nextCalled);
    check('middleware/siwx-verified-user', result.req.verifiedUser?.address === address);
  }

  // ===== 9. Middleware: no auth rejected =====
  {
    const result = await runMiddleware({});
    check('middleware/no-auth-rejected', !result.nextCalled && result.res.statusCode === 401);
  }

  // ===== 10. Middleware: bad bearer fallthrough rejected =====
  {
    const result = await runMiddleware({ authorization: 'Bearer garbage.AAAA' });
    check('middleware/bad-bearer-rejected', !result.nextCalled && result.res.statusCode === 401);
  }

  // ===== Report =====
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
  console.error('SIWX smoke test crashed:', err);
  process.exit(1);
});
