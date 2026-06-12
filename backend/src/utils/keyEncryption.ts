import crypto from 'crypto';
import { pool } from '../database/pg.js';

/**
 * Per-record AES-256-GCM encryption for campaign authority keys.
 *
 * The master key is used as HKDF input keying material. Each ciphertext is
 * encrypted under a derived key bound to a per-record salt that is sealed
 * inside the ciphertext envelope. An attacker who recovers ONE ciphertext
 * + the master cannot reuse any precomputed work to decrypt the rest.
 *
 * Wire format:
 *   v2:  base64( "v2" || salt(16) || iv(12) || authTag(16) || ciphertext )
 *   v1:  base64(            iv(12) || authTag(16) || ciphertext )   ← legacy
 *
 * Decryption auto-detects the version by looking at the first two bytes
 * of the decoded blob. Existing v1 ciphertexts continue to decrypt; all
 * NEW ciphertexts are emitted as v2. A future migration can re-wrap v1
 * rows into v2 by reading and re-encrypting.
 *
 * The "info" field of HKDF binds the derived key to a string label
 * (`scope`), so the same record salt encrypted under a different scope
 * does not yield the same key. Callers can use this to prevent confused
 * deputy issues across feature areas.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const VERSION_TAG_V2 = Buffer.from('v2', 'utf8'); // 2 bytes
const DEFAULT_SCOPE = 'flowguard.authority-key.v2';
const VAULT_SECRET_NAME = 'airdrop_master_key';

let cachedMasterKey: Buffer | null = null;
let cachedKeySource: 'vault' | 'env' | null = null;

export async function initializeMasterKey(): Promise<void> {
  if (cachedMasterKey) return;

  let keyHex: string | null = null;

  try {
    const result = await pool.query<{ decrypted_secret: string }>(
      "SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1",
      [VAULT_SECRET_NAME],
    );
    const candidate = result.rows[0]?.decrypted_secret?.trim();
    if (candidate && candidate.length === 64 && /^[0-9a-f]{64}$/i.test(candidate)) {
      keyHex = candidate;
      cachedKeySource = 'vault';
      console.log('[crypto] master key loaded from Supabase Vault');
    } else if (candidate) {
      console.warn('[crypto] vault secret present but not a 64-char hex; falling through');
    }
  } catch (err) {
    console.warn('[crypto] vault read failed, will try env fallback:', (err as Error).message);
  }

  if (!keyHex) {
    const envKey = process.env.AIRDROP_CLAIM_KEY_ENCRYPTION_KEY?.trim();
    if (envKey && envKey.length === 64 && /^[0-9a-f]{64}$/i.test(envKey)) {
      keyHex = envKey;
      cachedKeySource = 'env';
      console.log('[crypto] master key loaded from env (fallback)');
    }
  }

  if (!keyHex) {
    throw new Error(
      '[crypto] master key not available. Expected either:\n'
      + "  1. A secret named 'airdrop_master_key' in Supabase Vault, or\n"
      + '  2. AIRDROP_CLAIM_KEY_ENCRYPTION_KEY env var (64-char hex)\n'
      + 'Generate one with: openssl rand -hex 32',
    );
  }

  cachedMasterKey = Buffer.from(keyHex, 'hex');
}

function getMasterKey(): Buffer {
  if (cachedMasterKey) return cachedMasterKey;

  const keyHex = process.env.AIRDROP_CLAIM_KEY_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      'master key not initialised. Call initializeMasterKey() at boot, or set '
      + 'AIRDROP_CLAIM_KEY_ENCRYPTION_KEY env var (64-char hex). '
      + 'Generate one with: openssl rand -hex 32',
    );
  }
  cachedMasterKey = Buffer.from(keyHex, 'hex');
  cachedKeySource = 'env';
  return cachedMasterKey;
}

/** Internal: read which source the cached key came from. For diagnostics only. */
export function getMasterKeySource(): 'vault' | 'env' | null {
  return cachedKeySource;
}

function deriveRecordKey(masterKey: Buffer, salt: Buffer, scope: string): Buffer {
  // Node's crypto.hkdfSync was added in 15.0; the project requires Node 18+.
  return Buffer.from(crypto.hkdfSync('sha256', masterKey, salt, scope, 32));
}

export function encryptPrivateKey(plaintextHex: string, scope: string = DEFAULT_SCOPE): string {
  const masterKey = getMasterKey();
  const salt = crypto.randomBytes(SALT_LENGTH);
  const recordKey = deriveRecordKey(masterKey, salt, scope);

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, recordKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintextHex, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([VERSION_TAG_V2, salt, iv, authTag, encrypted]).toString('base64');
}

export function decryptPrivateKey(ciphertext: string, scope: string = DEFAULT_SCOPE): string {
  const buf = Buffer.from(ciphertext, 'base64');
  const masterKey = getMasterKey();

  // v2: starts with the literal "v2" tag.
  if (buf.length >= 2 && buf[0] === VERSION_TAG_V2[0] && buf[1] === VERSION_TAG_V2[1]) {
    let cursor = 2;
    const salt = buf.subarray(cursor, cursor + SALT_LENGTH);
    cursor += SALT_LENGTH;
    const iv = buf.subarray(cursor, cursor + IV_LENGTH);
    cursor += IV_LENGTH;
    const authTag = buf.subarray(cursor, cursor + AUTH_TAG_LENGTH);
    cursor += AUTH_TAG_LENGTH;
    const encrypted = buf.subarray(cursor);

    const recordKey = deriveRecordKey(masterKey, salt, scope);
    const decipher = crypto.createDecipheriv(ALGORITHM, recordKey, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
  }

  // v1: legacy single-key envelope. Still supported for rows written before
  // the per-record-KEK migration. NOT used for new writes.
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
}

/**
 * Re-wrap a v1 ciphertext as v2. Used by the one-shot migration script that
 * upgrades existing rows. Callers should not need this in steady-state code.
 */
export function rewrapToV2(ciphertext: string, scope: string = DEFAULT_SCOPE): string {
  const plaintext = decryptPrivateKey(ciphertext, scope);
  return encryptPrivateKey(plaintext, scope);
}
