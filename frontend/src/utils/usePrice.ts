/**
 * usePrice - React hook for the live BCH/USD ticker.
 *
 * Reads from the public backend endpoint `GET /api/price/bch-usd`, which is
 * fed by the General Protocols BCH-native price oracle (with a CoinGecko
 * fallback). Caches in-memory across the SPA so multiple consumers share one
 * poll, and refreshes every 90 seconds.
 *
 * Usage:
 *   const { price, source, isLoading, error } = useBchPrice();
 *   const usdLabel = price !== null ? `$${price.toFixed(2)}` : ' - ';
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

const REFRESH_INTERVAL_MS = 90_000;
const STALE_AFTER_MS = 5 * 60_000;

export interface BchPriceReading {
  usd: number;
  source: 'oracle' | 'coingecko';
  oraclePubkey?: string;
  messageTimestamp?: number;
  signedMessageHex?: string;
  signatureHex?: string;
  updatedAt: number;
}

interface PriceState {
  reading: BchPriceReading | null;
  isLoading: boolean;
  error: string | null;
}

// Module-scope singleton so every consumer shares the same poll + cached value.
const state: PriceState = {
  reading: null,
  isLoading: false,
  error: null,
};

const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;

function notify(): void {
  listeners.forEach((cb) => cb());
}

async function fetchOnce(): Promise<void> {
  if (inFlight) return inFlight;
  state.isLoading = true;
  state.error = null;
  notify();
  inFlight = (async () => {
    try {
      const resp = await fetch('/api/price/bch-usd', {
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) {
        throw new Error(`price feed responded ${resp.status}`);
      }
      const body = (await resp.json()) as BchPriceReading;
      if (typeof body?.usd !== 'number' || !Number.isFinite(body.usd)) {
        throw new Error('price feed returned a non-numeric value');
      }
      state.reading = body;
    } catch (err) {
      state.error = err instanceof Error ? err.message : 'failed to fetch price';
    } finally {
      state.isLoading = false;
      inFlight = null;
      notify();
    }
  })();
  return inFlight;
}

function ensurePolling(): void {
  if (pollTimer !== null) return;
  fetchOnce();
  pollTimer = setInterval(() => {
    fetchOnce();
  }, REFRESH_INTERVAL_MS);
}

function teardownIfIdle(): void {
  if (listeners.size === 0 && pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  ensurePolling();
  return () => {
    listeners.delete(cb);
    teardownIfIdle();
  };
}

function getSnapshot(): PriceState {
  return state;
}

/**
 * Hook that returns the latest BCH/USD reading, along with status flags. The
 * reading is freshness-checked: if the cached value is older than 5 minutes,
 * `isStale` becomes true so the UI can render a muted state.
 */
export function useBchPrice(): {
  price: number | null;
  source: 'oracle' | 'coingecko' | null;
  reading: BchPriceReading | null;
  isLoading: boolean;
  isStale: boolean;
  error: string | null;
  refresh: () => void;
} {
  // useSyncExternalStore keeps the consumer in sync without a stale-closure
  // window during fast re-renders (common in tickers).
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [now, setNow] = useState(() => Date.now());

  // Tick wall-clock once a minute so the `isStale` derivation stays current
  // even when the price hasn't changed.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const reading = state.reading;
  const isStale = !!reading && now - reading.updatedAt > STALE_AFTER_MS;
  return {
    price: reading?.usd ?? null,
    source: reading?.source ?? null,
    reading,
    isLoading: state.isLoading,
    isStale,
    error: state.error,
    refresh: () => {
      fetchOnce();
    },
  };
}
