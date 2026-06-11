/**
 * Wallet-ownership authentication middleware (Sign-In With BCH).
 *
 * Purpose
 * -------
 * The pre-audit design trusted the `x-user-address` request header as identity,
 * which was completely spoofable (audit C-01). This middleware closes that gap
 * by requiring a cryptographic proof that the client controls the private key
 * for the declared BCH address.
 *
 * Wire scheme
 * -----------
 * The wallet receives a multi-line CAIP-122 message and signs it via the
 * Bitcoin signed-message scheme (also called BIP-322 legacy):
 *
 *   tagged   = 0x18 || "Bitcoin Signed Message:\n" || varint(msg.length) || msg
 *   digest   = SHA256(SHA256(tagged))
 *   sig (65) = recovery_byte || r (32) || s (32)         // base64-encoded
 *
 * Cashonize, Paytaca-mobile, and Zapit all return this 65-byte base64
 * signature for `bch_signMessage` per the wc2-bch-bcr spec. The verifier
 * decodes base64, splits off the recovery byte, recovers the pubkey via
 * libauth's `secp256k1.recoverPublicKeyCompressed`, compares its hash160 to
 * the pubkey-hash embedded in the declared P2PKH cash address, and only then
 * consumes the nonce.
 *
 * For backward-compat during the migration period the verifier ALSO accepts
 * an `x-signer-public-key` header + hex DER/64-byte compact signature. This
 * mirrors the pre-fix shape one final time so we can flip the frontend over
 * one route at a time; the legacy branch logs a `legacy_siwx_format` field
 * on every accept, which lets us monitor cutover progress and disable the
 * branch once usage drops to zero.
 *
 * Headers
 * -------
 *   x-user-address       declared BCH address (P2PKH cashaddr)
 *   x-signed-nonce       base64 65-byte recoverable signature (preferred)
 *                        OR hex DER / 64-byte compact (legacy)
 *   x-nonce-id           the nonce id returned by /api/auth/nonce
 *   x-signer-public-key  compressed secp256k1 pubkey (legacy path only)
 *
 * Storage
 * -------
 * Nonces live in-memory with a 5-minute TTL and periodic sweep. Sufficient
 * for a single backend replica; swap for a Redis-backed store on horizontal
 * scale-out.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  cashAddressToLockingBytecode,
  hash160,
  hexToBin,
  secp256k1,
  utf8ToBin,
} from '@bitauth/libauth';

const NONCE_TTL_MS = 5 * 60 * 1000;
const NONCE_BYTES = 24;
const SWEEP_INTERVAL_MS = 60 * 1000;
const BEARER_TTL_MS = 30 * 60 * 1000;

const BITCOIN_MESSAGE_MAGIC = 'Bitcoin Signed Message:\n';

const DEFAULT_DOMAIN = process.env.SIWX_DOMAIN || 'flowguard.cash';
const DEFAULT_URI = process.env.SIWX_URI || 'https://flowguard.cash';
const DEFAULT_CHAIN_ID =
  process.env.SIWX_CHAIN_ID ||
  (process.env.BCH_NETWORK === 'mainnet' ? 'bch:bitcoincash' : 'bch:bchtest');

/**
 * HMAC key for short-lived bearer tokens. Configurable via env so multi-replica
 * deployments can share verification; falls back to a per-process random key
 * (tokens then don't survive restart, which is fine for a 30-minute TTL).
 */
const BEARER_SECRET: Buffer = (() => {
  const fromEnv = process.env.SIWX_BEARER_SECRET;
  if (fromEnv && /^[0-9a-fA-F]+$/.test(fromEnv) && fromEnv.length >= 32) {
    return Buffer.from(fromEnv, 'hex');
  }
  return randomBytes(32);
})();

export interface AuthenticatedUser {
  address: string;
  pubkeyHex: string;
  pubkeyHash: string;
  authenticatedAt: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      verifiedUser?: AuthenticatedUser;
    }
  }
}

export interface NonceContext {
  domain?: string;
  uri?: string;
  chainId?: string;
}

interface NonceRecord {
  id: string;
  address: string;
  message: string;
  issuedAt: number;
  expiresAt: number;
}

class NonceStore {
  private readonly nonces = new Map<string, NonceRecord>();
  private sweepTimer?: NodeJS.Timeout;

  constructor() {
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    // Don't keep the event loop alive solely for the sweeper.
    this.sweepTimer.unref?.();
  }

  issue(address: string, message: string): NonceRecord {
    const id = randomBytes(NONCE_BYTES).toString('base64url');
    const now = Date.now();
    const record: NonceRecord = {
      id,
      address,
      message,
      issuedAt: now,
      expiresAt: now + NONCE_TTL_MS,
    };
    this.nonces.set(id, record);
    return record;
  }

  consume(id: string, address: string): NonceRecord | null {
    const record = this.nonces.get(id);
    if (!record) return null;
    if (record.expiresAt < Date.now()) {
      this.nonces.delete(id);
      return null;
    }
    if (record.address.toLowerCase() !== address.toLowerCase()) return null;
    this.nonces.delete(id);
    return record;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, record] of this.nonces) {
      if (record.expiresAt < now) this.nonces.delete(key);
    }
  }
}

const nonceStore = new NonceStore();

/**
 * Build a CAIP-122 multi-line login message. Wallets render this directly so
 * each field MUST be human-meaningful — domain binding prevents cross-app
 * replay, chain-id binding prevents cross-chain replay, issued-at and
 * expiration-time prevent replay across nonce TTLs.
 */
export function buildCaip122Message(opts: {
  domain: string;
  address: string;
  uri: string;
  chainId: string;
  nonceId: string;
  issuedAt: Date;
  expiresAt: Date;
}): string {
  const { domain, address, uri, chainId, nonceId, issuedAt, expiresAt } = opts;
  return [
    `${domain} wants you to sign in with your Bitcoin Cash account:`,
    address,
    '',
    'I accept the FlowGuard Terms of Service: https://flowguard.cash/terms',
    '',
    `URI: ${uri}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${nonceId}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expiration Time: ${expiresAt.toISOString()}`,
  ].join('\n');
}

export function issueAuthNonce(
  address: string,
  context?: NonceContext,
): { id: string; message: string; expiresAt: number } {
  if (!isProbablyP2pkhAddress(address)) {
    throw new Error('Address must be a P2PKH cash address (bitcoincash: / bchtest: / bchreg:)');
  }
  const id = randomBytes(NONCE_BYTES).toString('base64url');
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);
  const message = buildCaip122Message({
    domain: context?.domain || DEFAULT_DOMAIN,
    address,
    uri: context?.uri || DEFAULT_URI,
    chainId: context?.chainId || DEFAULT_CHAIN_ID,
    nonceId: id,
    issuedAt,
    expiresAt,
  });
  const record: NonceRecord = {
    id,
    address,
    message,
    issuedAt: issuedAt.getTime(),
    expiresAt: expiresAt.getTime(),
  };
  // Manually seed the in-memory store with the pre-built id so the message
  // matches what we just signed below the line.
  (nonceStore as unknown as { nonces: Map<string, NonceRecord> }).nonces.set(id, record);
  return { id, message, expiresAt: expiresAt.getTime() };
}

function isProbablyP2pkhAddress(address: string): boolean {
  return /^(bitcoincash|bchtest|bchreg):[a-z0-9]{30,}$/.test(address);
}

function pubkeyHashFromAddress(address: string): Uint8Array | null {
  const decoded = cashAddressToLockingBytecode(address);
  if (typeof decoded === 'string') return null;
  const b = decoded.bytecode;
  const isP2pkh =
    b.length === 25 &&
    b[0] === 0x76 &&
    b[1] === 0xa9 &&
    b[2] === 0x14 &&
    b[23] === 0x88 &&
    b[24] === 0xac;
  if (!isP2pkh) return null;
  return b.slice(3, 23);
}

/**
 * Bitcoin Cash uses CompactSize varints, identical to Bitcoin Core's
 * WriteCompactSize encoding. We only ever encode lengths up to a few hundred
 * bytes for CAIP-122 messages, but the full encoding is shipped for safety.
 */
function encodeVarint(n: number): Uint8Array {
  if (n < 0) throw new Error('varint cannot be negative');
  if (n < 0xfd) {
    return new Uint8Array([n]);
  }
  if (n <= 0xffff) {
    const out = new Uint8Array(3);
    out[0] = 0xfd;
    out[1] = n & 0xff;
    out[2] = (n >> 8) & 0xff;
    return out;
  }
  if (n <= 0xffffffff) {
    const out = new Uint8Array(5);
    out[0] = 0xfe;
    out[1] = n & 0xff;
    out[2] = (n >> 8) & 0xff;
    out[3] = (n >> 16) & 0xff;
    out[4] = (n >> 24) & 0xff;
    return out;
  }
  // 64-bit lengths are not reachable for a SIWX message — refuse rather than
  // accept ambiguous output.
  throw new Error('varint exceeds 32 bits');
}

function concatBytes(parts: ReadonlyArray<Uint8Array>): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * Double-SHA256 of the Bitcoin-Signed-Message-tagged byte sequence.
 *
 * tagged = varint(magic.length) || magic || varint(msg.length) || msg
 * digest = SHA256(SHA256(tagged))
 *
 * The 24-byte magic ("Bitcoin Signed Message:\n") encodes its varint length
 * as a single 0x18 byte, which is why most reference implementations open with
 * the literal `\x18Bitcoin Signed Message:\n` constant.
 */
function hashBchSignedMessage(message: string): Uint8Array {
  const magicBytes = utf8ToBin(BITCOIN_MESSAGE_MAGIC);
  const messageBytes = utf8ToBin(message);
  const tagged = concatBytes([
    encodeVarint(magicBytes.length),
    magicBytes,
    encodeVarint(messageBytes.length),
    messageBytes,
  ]);
  const first = createHash('sha256').update(tagged).digest();
  return new Uint8Array(createHash('sha256').update(first).digest());
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Decode a base64 (standard or url-safe) signature. Returns `null` if the
 * string is not valid base64.
 */
function decodeBase64Signature(input: string): Uint8Array | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Quick reject for hex (signatures we want here are always >50 chars and not
  // a pure hex alphabet when base64).
  const looksHex = /^[0-9a-fA-F]+$/.test(trimmed);
  if (looksHex) return null;
  try {
    const buf = Buffer.from(trimmed, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } catch {
    return null;
  }
}

/**
 * Split a 65-byte Bitcoin-style recoverable signature into (recoveryId, rs).
 * The first byte encodes both the recovery id (0..3) and whether the recovered
 * pubkey should be considered compressed or uncompressed — we always recover
 * the compressed form and validate against the declared compressed pubkey.
 *
 * Returns `null` if the bytes are not a valid recoverable-signature shape.
 */
function splitRecoverableSignature(bytes: Uint8Array): { recoveryId: 0 | 1 | 2 | 3; rs: Uint8Array } | null {
  if (bytes.length !== 65) return null;
  const header = bytes[0];
  // Bitcoin convention:
  //   27..30  → uncompressed, recovery 0..3
  //   31..34  → compressed,   recovery 0..3
  //   35..38  → segwit-p2sh,  recovery 0..3   (not used on BCH)
  //   39..42  → segwit-p2wpkh recovery 0..3   (not used on BCH)
  if (header < 27 || header > 42) return null;
  const recoveryId = ((header - 27) & 0x03) as 0 | 1 | 2 | 3;
  return { recoveryId, rs: bytes.slice(1) };
}

/**
 * Recover the compressed secp256k1 pubkey from a 64-byte (r||s) signature plus
 * recovery id and the double-SHA256 of the BIP-322-tagged message. Returns
 * `null` on any libauth-side failure (invalid sig, point at infinity, etc.).
 */
function recoverPubkey(rs: Uint8Array, recoveryId: 0 | 1 | 2 | 3, digest: Uint8Array): Uint8Array | null {
  const result = secp256k1.recoverPublicKeyCompressed(rs, recoveryId, digest);
  if (typeof result === 'string') return null;
  if (result.length !== 33) return null;
  return result;
}

/**
 * Verify a wallet-ownership proof. Returns the authenticated user on success,
 * otherwise throws with a client-safe message.
 *
 * Two acceptance paths:
 *   1. BIP-322 base64 65-byte recoverable signature (preferred, what real
 *      BCH wallets emit). `signerPubkeyHex` is OPTIONAL — when omitted the
 *      pubkey is recovered from the signature and the recovered hash160 is
 *      compared to the address.
 *   2. Legacy hex DER or 64-byte compact signature + explicit signer pubkey.
 *      Retained so we can flip the frontend off this path one route at a time;
 *      the returned user object includes `legacySiwxFormat: true` so the audit
 *      pipeline can track residual usage.
 */
export function verifyWalletOwnership(params: {
  address: string;
  signature: string;
  nonceId: string;
  signerPubkeyHex?: string;
}): AuthenticatedUser & { legacySiwxFormat: boolean } {
  const { address, signature, nonceId, signerPubkeyHex } = params;

  if (!address || !signature || !nonceId) {
    throw new Error('Missing wallet-ownership proof fields');
  }

  const expectedHash = pubkeyHashFromAddress(address);
  if (!expectedHash) throw new Error('Address is not a supported P2PKH cash address');

  const record = nonceStore.consume(nonceId, address);
  if (!record) throw new Error('Nonce expired or already consumed');

  // -- Path 1: BIP-322 base64 65-byte recoverable signature ------------------
  const sigBytes = decodeBase64Signature(signature);
  if (sigBytes) {
    const split = splitRecoverableSignature(sigBytes);
    if (split) {
      const digest = hashBchSignedMessage(record.message);
      const recovered = recoverPubkey(split.rs, split.recoveryId, digest);
      if (recovered) {
        const recoveredHash = hash160(recovered);
        if (typeof recoveredHash !== 'string' && bytesEqual(recoveredHash, expectedHash)) {
          return {
            address,
            pubkeyHex: Buffer.from(recovered).toString('hex'),
            pubkeyHash: Buffer.from(expectedHash).toString('hex'),
            authenticatedAt: Date.now(),
            legacySiwxFormat: false,
          };
        }
      }
    }
  }

  // -- Path 2: legacy hex DER / 64-byte compact + explicit pubkey ------------
  if (signerPubkeyHex) {
    const pubkeyBin = hexToBin(signerPubkeyHex);
    if (pubkeyBin.length === 33) {
      const derivedHash = hash160(pubkeyBin);
      if (typeof derivedHash !== 'string' && bytesEqual(derivedHash, expectedHash)) {
        const digest = hashBchSignedMessage(record.message);
        const legacyBytes = hexToBin(signature);
        const verifiedCompact =
          legacyBytes.length === 64
            ? secp256k1.verifySignatureCompact(legacyBytes, pubkeyBin, digest)
            : false;
        const verifiedDer =
          verifiedCompact !== true
            ? secp256k1.verifySignatureDER(legacyBytes, pubkeyBin, digest)
            : true;
        if (verifiedCompact === true || verifiedDer === true) {
          return {
            address,
            pubkeyHex: signerPubkeyHex,
            pubkeyHash: Buffer.from(expectedHash).toString('hex'),
            authenticatedAt: Date.now(),
            legacySiwxFormat: true,
          };
        }
      }
    }
  }

  throw new Error('Signature verification failed');
}

// ---------------------------------------------------------------------------
// Bearer tokens — short-lived (30 min) post-SIWX session credentials so the
// wallet only prompts the user on the first mutating call per session.
// ---------------------------------------------------------------------------

interface BearerPayload {
  /** BCH address the bearer authenticates as. */
  address: string;
  /** Compressed secp256k1 pubkey hex (recovered during the original SIWX verify). */
  pubkeyHex: string;
  /** Lowercase hex hash160 of the pubkey. */
  pubkeyHash: string;
  /** Unix milliseconds when the bearer was issued. */
  iat: number;
  /** Unix milliseconds when the bearer expires. */
  exp: number;
  /** Random nonce so two bearers issued in the same millisecond differ. */
  jti: string;
}

function b64urlEncode(input: Buffer | Uint8Array | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  return buf.toString('base64url');
}

function b64urlDecode(input: string): Buffer | null {
  try {
    return Buffer.from(input, 'base64url');
  } catch {
    return null;
  }
}

/**
 * Issue a 30-minute bearer token for the given verified user. Format is a
 * compact JWS-lookalike: `<base64url(payload)>.<base64url(hmac)>`. We don't
 * use the JOSE header because we never accept user-chosen algorithms — HMAC
 * SHA-256 is the only verifier.
 */
export function issueBearer(user: AuthenticatedUser): { token: string; expiresAt: number } {
  const now = Date.now();
  const payload: BearerPayload = {
    address: user.address,
    pubkeyHex: user.pubkeyHex,
    pubkeyHash: user.pubkeyHash,
    iat: now,
    exp: now + BEARER_TTL_MS,
    jti: randomBytes(8).toString('base64url'),
  };
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const sig = createHmac('sha256', BEARER_SECRET).update(payloadB64).digest();
  const token = `${payloadB64}.${b64urlEncode(sig)}`;
  return { token, expiresAt: payload.exp };
}

/**
 * Verify a bearer token. Returns the embedded user on success, otherwise null.
 * Uses constant-time HMAC comparison and refuses expired tokens.
 */
export function verifyBearer(token: string): AuthenticatedUser | null {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot >= token.length - 1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  const providedSig = b64urlDecode(sigB64);
  if (!providedSig) return null;
  const expectedSig = createHmac('sha256', BEARER_SECRET).update(payloadB64).digest();
  if (providedSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(providedSig, expectedSig)) return null;

  const payloadBuf = b64urlDecode(payloadB64);
  if (!payloadBuf) return null;
  let payload: BearerPayload;
  try {
    payload = JSON.parse(payloadBuf.toString('utf8')) as BearerPayload;
  } catch {
    return null;
  }
  if (
    typeof payload.address !== 'string' ||
    typeof payload.pubkeyHex !== 'string' ||
    typeof payload.pubkeyHash !== 'string' ||
    typeof payload.exp !== 'number'
  ) {
    return null;
  }
  if (payload.exp < Date.now()) return null;

  return {
    address: payload.address,
    pubkeyHex: payload.pubkeyHex,
    pubkeyHash: payload.pubkeyHash,
    authenticatedAt: payload.iat,
  };
}

function extractBearerToken(req: Request): string | null {
  const auth = req.headers['authorization'] || req.headers['Authorization' as keyof typeof req.headers];
  if (typeof auth !== 'string') return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : null;
}

/**
 * Express middleware: require a valid wallet-ownership proof.
 * Attaches `req.verifiedUser` on success, returns 401 on failure.
 *
 * Acceptance order:
 *   1. `Authorization: Bearer <token>` — preferred. Issued by /api/auth/verify
 *      after a successful one-shot SIWX proof. 30-minute TTL.
 *   2. `x-signed-nonce` + `x-nonce-id` headers — first-call path. Single-use
 *      proof. Server-side this consumes the nonce and burns it.
 *
 * Either path on success sets `req.verifiedUser` and calls `next()`. Failures
 * return 401 with a client-safe error message.
 *
 * Usage:
 *   router.post('/streams/:id/cancel', requireWalletAuth, handler);
 */
export function requireWalletAuth(req: Request, res: Response, next: NextFunction): void {
  // Path 1: Bearer token.
  const bearer = extractBearerToken(req);
  if (bearer) {
    const user = verifyBearer(bearer);
    if (user) {
      req.verifiedUser = user;
      next();
      return;
    }
    // Invalid/expired bearer: fall through to SIWX so a stale token automatically
    // refreshes when the client retries with a fresh proof on 401.
  }

  // Path 2: SIWX nonce + signature.
  try {
    const address = String(req.headers['x-user-address'] || '').trim();
    const signature = String(req.headers['x-signed-nonce'] || '').trim();
    const nonceId = String(req.headers['x-nonce-id'] || '').trim();
    const signerPubkeyHex = String(req.headers['x-signer-public-key'] || '').trim() || undefined;

    const user = verifyWalletOwnership({ address, signature, nonceId, signerPubkeyHex });
    req.verifiedUser = user;
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    res.status(401).json({ error: 'Unauthorized', message });
  }
}

/**
 * Returns the verified user when wallet-auth middleware has run, otherwise
 * falls back to the legacy header identity (unverified). Handlers that must
 * enforce ownership should call `requireAuthenticatedUser(req)` instead.
 */
export function getAuthenticatedUser(req: Request): { address: string; verified: boolean } | null {
  if (req.verifiedUser) {
    return { address: req.verifiedUser.address, verified: true };
  }
  const raw = String(req.headers['x-user-address'] || '').trim();
  if (!raw) return null;
  return { address: raw, verified: false };
}

export function requireAuthenticatedUser(req: Request): AuthenticatedUser {
  if (!req.verifiedUser) {
    const err = new Error('Wallet-ownership proof required');
    (err as Error & { statusCode?: number }).statusCode = 401;
    throw err;
  }
  return req.verifiedUser;
}

/**
 * Resolve the caller's BCH address.
 *
 * On routes guarded by `requireWalletAuth` the verified address is always
 * present and authoritative. On unauth read-only routes (e.g. activity feeds
 * personalised by a query param) we fall back to the trimmed header — those
 * surfaces never trust the result for authorisation, only for filtering.
 *
 * Returns the empty string when no identity is available so callers can guard
 * with `if (!callerAddress(req)) return 401;` without juggling undefined.
 */
export function callerAddress(req: Request): string {
  if (req.verifiedUser?.address) return req.verifiedUser.address;
  const header = req.headers['x-user-address'];
  if (typeof header === 'string') return header.trim();
  if (Array.isArray(header) && typeof header[0] === 'string') return header[0].trim();
  return '';
}

// Exported test helpers — internal cryptographic primitives. Kept named for
// integration tests that exercise the BIP-322 path without going through HTTP.
export const __test = {
  buildCaip122Message,
  hashBchSignedMessage,
  encodeVarint,
  splitRecoverableSignature,
  decodeBase64Signature,
};
