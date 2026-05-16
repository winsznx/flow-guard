/**
 * Wallet-ownership authentication middleware (Sign-In With BCH).
 *
 * Purpose
 * -------
 * The pre-audit design trusted the `x-user-address` request header as identity,
 * which was completely spoofable (see audit C-01). This middleware closes that
 * gap by requiring a cryptographic proof that the client controls the private
 * key for the declared BCH address.
 *
 * Flow
 * ----
 * 1. Client calls `POST /api/auth/nonce` with the BCH address they want to
 *    authenticate as. Server issues a short-lived (5 min) single-use nonce.
 * 2. Client signs the message `"FlowGuard login: <nonce>"` with the private
 *    key of the declared BCH address via their wallet (BIP-322 / secp256k1
 *    detached).
 * 3. Client attaches three headers to any mutating request:
 *      - `x-user-address`     — declared BCH address (existing)
 *      - `x-signer-public-key`— compressed secp256k1 pubkey matching the address
 *      - `x-signed-nonce`     — hex-encoded signature over the nonce message
 *      - `x-nonce-id`         — the nonce token issued in step 1
 * 4. The middleware verifies:
 *      a) `x-signer-public-key` hashes (hash160) to the pubkey-hash embedded
 *         in `x-user-address`.
 *      b) The nonce is still live and has not been consumed.
 *      c) The signature verifies against the nonce message under the pubkey.
 *    On success the nonce is consumed (one-shot) and `req.verifiedUser` is set.
 *
 * Backwards compatibility
 * -----------------------
 * Route handlers read identity through `getAuthenticatedUser(req)`. Until
 * every handler is migrated, `requireWalletAuth` is opt-in per route. Legacy
 * handlers that still read `x-user-address` directly will continue to work,
 * but will NOT satisfy a handler that calls `requireAuthenticatedUser(req)`.
 *
 * Storage
 * -------
 * Nonces live in-memory (`NonceStore`) with a 5-minute TTL and periodic
 * sweep. This is sufficient for a single backend replica. For horizontally
 * scaled deployments, swap `NonceStore` for a Redis-backed implementation
 * (same interface). The store never persists signed messages or pubkeys.
 */

import { randomBytes, createHash } from 'node:crypto';
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
const LOGIN_MESSAGE_PREFIX = 'FlowGuard login: ';

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

  issue(address: string): NonceRecord {
    const id = randomBytes(NONCE_BYTES).toString('base64url');
    const record: NonceRecord = {
      id,
      address,
      message: `${LOGIN_MESSAGE_PREFIX}${id}`,
      issuedAt: Date.now(),
      expiresAt: Date.now() + NONCE_TTL_MS,
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

export function issueAuthNonce(address: string): { id: string; message: string; expiresAt: number } {
  if (!isProbablyP2pkhAddress(address)) {
    throw new Error('Address must be a P2PKH cash address (bitcoincash: / bchtest: / bchreg:)');
  }
  const record = nonceStore.issue(address);
  return { id: record.id, message: record.message, expiresAt: record.expiresAt };
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

function hashMessageForSignature(message: string): Uint8Array {
  // Double SHA-256 of the raw UTF-8 bytes. Keep it implementation-neutral; clients
  // signing via BIP-322 or a plain detached secp256k1 signature both hash the
  // message and we verify the resulting digest.
  const once = createHash('sha256').update(utf8ToBin(message)).digest();
  return new Uint8Array(createHash('sha256').update(once).digest());
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Verify a wallet-ownership proof. Returns the authenticated user on success,
 * otherwise throws with a client-safe message.
 */
export function verifyWalletOwnership(params: {
  address: string;
  pubkeyHex: string;
  signatureHex: string;
  nonceId: string;
}): AuthenticatedUser {
  const { address, pubkeyHex, signatureHex, nonceId } = params;

  if (!address || !pubkeyHex || !signatureHex || !nonceId) {
    throw new Error('Missing wallet-ownership proof fields');
  }

  const expectedHash = pubkeyHashFromAddress(address);
  if (!expectedHash) throw new Error('Address is not a supported P2PKH cash address');

  const pubkeyBin = hexToBin(pubkeyHex);
  if (pubkeyBin.length !== 33) throw new Error('Public key must be 33-byte compressed secp256k1');

  const derivedHash = hash160(pubkeyBin);
  if (typeof derivedHash === 'string') throw new Error('Failed to derive pubkey hash');
  if (!bytesEqual(derivedHash, expectedHash)) {
    throw new Error('Public key does not match the declared address');
  }

  const record = nonceStore.consume(nonceId, address);
  if (!record) throw new Error('Nonce expired or already consumed');

  const digest = hashMessageForSignature(record.message);
  const signatureBin = hexToBin(signatureHex);

  // Accept either DER or compact 64-byte signatures. libauth returns boolean | string.
  const verifiedCompact = signatureBin.length === 64
    ? secp256k1.verifySignatureCompact(signatureBin, pubkeyBin, digest)
    : false;
  const verifiedDer = !verifiedCompact
    ? secp256k1.verifySignatureDER(signatureBin, pubkeyBin, digest)
    : true;

  if (verifiedCompact !== true && verifiedDer !== true) {
    throw new Error('Signature verification failed');
  }

  return {
    address,
    pubkeyHex,
    pubkeyHash: Buffer.from(expectedHash).toString('hex'),
    authenticatedAt: Date.now(),
  };
}

/**
 * Express middleware: require a valid wallet-ownership proof.
 * Attaches `req.verifiedUser` on success, returns 401 on failure.
 *
 * Usage:
 *   router.post('/streams/:id/cancel', requireWalletAuth, handler);
 */
export function requireWalletAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const address = String(req.headers['x-user-address'] || '').trim();
    const pubkeyHex = String(req.headers['x-signer-public-key'] || '').trim();
    const signatureHex = String(req.headers['x-signed-nonce'] || '').trim();
    const nonceId = String(req.headers['x-nonce-id'] || '').trim();

    const user = verifyWalletOwnership({ address, pubkeyHex, signatureHex, nonceId });
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
    (err as any).statusCode = 401;
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

export const LOGIN_MESSAGE_PREFIX_EXPORT = LOGIN_MESSAGE_PREFIX;
