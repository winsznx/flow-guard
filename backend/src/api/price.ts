/**
 * Public BCH price endpoint.
 *
 *   GET /api/price/bch-usd
 *
 * Returns the most recent BCH/USD reading with a 60-second in-memory cache.
 * Source priority:
 *   1. oracles.generalprotocols.com — BCH-native, signed price-oracle messages.
 *      USD/BCH oracle pubkey 02d09db08af1ff4e8453919cc866a4be427d7bfe18f2c05e5444c196fcf6fd2818.
 *      The General Protocols relay exposes signed messages via HTTPS; we read
 *      the latest `priceValue` (price in cents) along with the message timestamp,
 *      sequence, and signature so downstream surfaces can choose to verify
 *      on-chain via @generalprotocols/price-oracle later.
 *   2. CoinGecko (`https://api.coingecko.com/api/v3/simple/price`). Free, no
 *      auth, used only if the oracle path fails or times out.
 *
 * Output JSON shape:
 *   {
 *     "usd": 423.18,
 *     "source": "oracle" | "coingecko",
 *     "oraclePubkey"?: "02d09db08af1...",
 *     "blockHeight"?: 901234,
 *     "messageTimestamp"?: 1717900800,
 *     "signedMessageHex"?: "...",
 *     "signatureHex"?: "...",
 *     "updatedAt": 1717900800123,    // server unix ms
 *     "cachedFor": 59000              // ms until cache expires
 *   }
 */

import { Router, type Request, type Response } from 'express';

const router = Router();

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 6_000;

// USD/BCH oracle pubkey, published by General Protocols. Hex-encoded compressed
// secp256k1 key. The "USD" naming convention encodes "given 1 BCH, get N USD".
const ORACLE_USD_BCH_PUBKEY =
  '02d09db08af1ff4e8453919cc866a4be427d7bfe18f2c05e5444c196fcf6fd2818';

const ORACLE_RELAY_BASE = 'https://oracles.generalprotocols.com/api/v1';
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

export interface PriceReading {
  usd: number;
  source: 'oracle' | 'coingecko';
  oraclePubkey?: string;
  blockHeight?: number;
  messageTimestamp?: number;
  signedMessageHex?: string;
  signatureHex?: string;
  updatedAt: number;
}

let cached: PriceReading | null = null;

function isFresh(reading: PriceReading | null): reading is PriceReading {
  return !!reading && Date.now() - reading.updatedAt < CACHE_TTL_MS;
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse a 16-byte (or longer) hex-encoded price-oracle message into its parts.
 *
 * General Protocols price-message layout (32-bit fields, little-endian):
 *   [0..4]   messageTimestamp (unix seconds)
 *   [4..8]   messageSequence  (monotonic per oracle)
 *   [8..12]  priceSequence    (price-update counter)
 *   [12..16] priceValue       (price in cents — USD cents per BCH)
 *
 * Returns null if the hex doesn't decode into a valid message.
 */
function parsePriceMessageHex(hex: string): {
  messageTimestamp: number;
  messageSequence: number;
  priceSequence: number;
  priceValueCents: number;
} | null {
  if (typeof hex !== 'string' || hex.length < 32) return null;
  const buf = Buffer.from(hex, 'hex');
  if (buf.length < 16) return null;
  return {
    messageTimestamp: buf.readUInt32LE(0),
    messageSequence: buf.readUInt32LE(4),
    priceSequence: buf.readUInt32LE(8),
    priceValueCents: buf.readUInt32LE(12),
  };
}

/**
 * Hit the General Protocols relay for the latest USD/BCH signed message.
 * Returns `null` on any failure so the caller can fall through.
 */
async function fetchOraclePrice(): Promise<PriceReading | null> {
  const url = `${ORACLE_RELAY_BASE}/oracleMessages?publicKey=${ORACLE_USD_BCH_PUBKEY}&count=1`;
  try {
    const resp = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    if (!resp.ok) return null;
    const body = (await resp.json()) as
      | { oracleMessages?: Array<{ message?: string; signature?: string; publicKey?: string }> }
      | Array<{ message?: string; signature?: string; publicKey?: string }>;

    const messages = Array.isArray(body) ? body : body.oracleMessages || [];
    const latest = messages[0];
    if (!latest?.message || !latest?.signature) return null;

    const parsed = parsePriceMessageHex(latest.message);
    if (!parsed) return null;

    return {
      usd: parsed.priceValueCents / 100,
      source: 'oracle',
      oraclePubkey: ORACLE_USD_BCH_PUBKEY,
      messageTimestamp: parsed.messageTimestamp,
      signedMessageHex: latest.message,
      signatureHex: latest.signature,
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

async function fetchCoinGeckoPrice(): Promise<PriceReading | null> {
  const url = `${COINGECKO_BASE}/simple/price?ids=bitcoin-cash&vs_currencies=usd`;
  try {
    const resp = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    if (!resp.ok) return null;
    const body = (await resp.json()) as { 'bitcoin-cash'?: { usd?: number } };
    const usd = body['bitcoin-cash']?.usd;
    if (typeof usd !== 'number' || !Number.isFinite(usd)) return null;
    return {
      usd,
      source: 'coingecko',
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

async function getLatestPrice(): Promise<PriceReading | null> {
  if (isFresh(cached)) return cached;
  const oracle = await fetchOraclePrice();
  if (oracle) {
    cached = oracle;
    return oracle;
  }
  const gecko = await fetchCoinGeckoPrice();
  if (gecko) {
    cached = gecko;
    return gecko;
  }
  // Don't poison the cache when both sources fail — let the next request retry.
  return null;
}

router.get('/price/bch-usd', async (_req: Request, res: Response) => {
  const reading = await getLatestPrice();
  if (!reading) {
    return res.status(502).json({
      error: 'price_unavailable',
      message: 'Could not retrieve a BCH/USD reading from any source. Please retry shortly.',
    });
  }
  const cachedFor = Math.max(0, CACHE_TTL_MS - (Date.now() - reading.updatedAt));
  // Hint the browser to cache the response for the remaining lifetime — keeps
  // sustained traffic off the upstream oracle.
  const maxAgeSec = Math.max(1, Math.floor(cachedFor / 1000));
  res.setHeader('Cache-Control', `public, max-age=${maxAgeSec}`);
  return res.json({ ...reading, cachedFor });
});

export default router;
