import { ElectrumClient as RawElectrumClient } from 'electrum-cash';
import {
  binToHex,
  cashAddressToLockingBytecode,
  hexToBin,
  sha256,
} from '@bitauth/libauth';

export interface ElectrumServerSpec {
  host: string;
  port: number;
  scheme: 'tcp' | 'tcp_tls' | 'ws' | 'wss';
  application?: string;
  protocolVersion?: string;
}

export interface ElectrumUnspent {
  tx_hash: string;
  tx_pos: number;
  height: number;
  value: number;
  token_data?: ElectrumTokenData;
}

export interface ElectrumTokenData {
  amount: string;
  category: string;
  nft?: {
    capability: 'none' | 'mutable' | 'minting';
    commitment: string;
  };
}

export interface ElectrumHistoryEntry {
  tx_hash: string;
  height: number;
  fee?: number;
}

export interface ElectrumTxVerboseVin {
  txid?: string;
  vout?: number;
  coinbase?: string;
  scriptSig?: { asm: string; hex: string };
  sequence: number;
}

export interface ElectrumTxVerboseVout {
  value: number;
  n: number;
  scriptPubKey: {
    asm: string;
    hex: string;
    type?: string;
    addresses?: string[];
  };
  tokenData?: ElectrumTokenData;
}

export interface ElectrumTxVerbose {
  txid: string;
  hash: string;
  version: number;
  size: number;
  locktime: number;
  vin: ElectrumTxVerboseVin[];
  vout: ElectrumTxVerboseVout[];
  hex: string;
  blockhash?: string;
  confirmations?: number;
  time?: number;
  blocktime?: number;
  height?: number;
}

export interface ElectrumHeaderNotification {
  height: number;
  hex: string;
}

type ScripthashHandler = (status: string | null) => void;
type HeaderHandler = (header: ElectrumHeaderNotification) => void;

interface ParsedServerSpec extends Required<Omit<ElectrumServerSpec, 'application' | 'protocolVersion'>> {
  application: string;
  protocolVersion: string;
}

export class ElectrumClientError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ElectrumClientError';
  }
}

const DEFAULT_APPLICATION = 'flow-guard-indexer';
const DEFAULT_PROTOCOL_VERSION = '1.4.3';
const HEADERS_METHOD = 'blockchain.headers.subscribe';
const SCRIPTHASH_METHOD = 'blockchain.scripthash.subscribe';

function parseServer(spec: ElectrumServerSpec | string): ParsedServerSpec {
  if (typeof spec === 'string') {
    const url = new URL(spec);
    const scheme = ((): ParsedServerSpec['scheme'] => {
      switch (url.protocol) {
        case 'wss:': return 'wss';
        case 'ws:': return 'ws';
        case 'ssl:':
        case 'tls:':
        case 'tcp_tls:': return 'tcp_tls';
        case 'tcp:': return 'tcp';
        default: throw new ElectrumClientError(`unsupported scheme: ${url.protocol}`);
      }
    })();
    const port = url.port ? Number.parseInt(url.port, 10) : (scheme === 'wss' || scheme === 'tcp_tls' ? 50004 : 50001);
    return {
      host: url.hostname,
      port,
      scheme,
      application: DEFAULT_APPLICATION,
      protocolVersion: DEFAULT_PROTOCOL_VERSION,
    };
  }
  return {
    host: spec.host,
    port: spec.port,
    scheme: spec.scheme,
    application: spec.application ?? DEFAULT_APPLICATION,
    protocolVersion: spec.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
  };
}

export class ElectrumClient {
  private client: RawElectrumClient | null = null;
  private server: ParsedServerSpec | null = null;
  private headerHandler: HeaderHandler | null = null;
  private scripthashHandlers: Map<string, ScripthashHandler> = new Map();
  private headerSubscribed = false;

  async connect(servers: (ElectrumServerSpec | string)[]): Promise<void> {
    if (servers.length === 0) {
      throw new ElectrumClientError('connect requires at least one server');
    }
    let lastError: unknown = null;
    for (const raw of servers) {
      const parsed = parseServer(raw);
      try {
        const client = new RawElectrumClient(
          parsed.application,
          parsed.protocolVersion,
          parsed.host,
          parsed.port,
          parsed.scheme,
        );
        await client.connect();
        this.client = client;
        this.server = parsed;
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw new ElectrumClientError('failed to connect to any electrum server', lastError);
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.disconnect(true, false);
    } finally {
      this.client = null;
      this.server = null;
      this.headerHandler = null;
      this.headerSubscribed = false;
      this.scripthashHandlers.clear();
    }
  }

  async subscribeHeaders(onHeader: HeaderHandler): Promise<void> {
    const client = this.requireClient();
    this.headerHandler = onHeader;
    const callback = (payload: Error | unknown): void => {
      if (payload instanceof Error) return;
      const header = extractHeaderNotification(payload);
      if (header && this.headerHandler) {
        this.headerHandler(header);
      }
    };
    await client.subscribe(callback, HEADERS_METHOD);
    this.headerSubscribed = true;
  }

  async subscribeScripthash(scripthash: string, onUpdate: ScripthashHandler): Promise<void> {
    const client = this.requireClient();
    this.scripthashHandlers.set(scripthash, onUpdate);
    const callback = (payload: Error | unknown): void => {
      if (payload instanceof Error) return;
      const status = extractScripthashStatus(payload, scripthash);
      const handler = this.scripthashHandlers.get(scripthash);
      if (handler) handler(status);
    };
    await client.subscribe(callback, SCRIPTHASH_METHOD, scripthash);
  }

  async unsubscribeScripthash(scripthash: string): Promise<void> {
    this.scripthashHandlers.delete(scripthash);
  }

  async listUnspent(scripthash: string): Promise<ElectrumUnspent[]> {
    const result = await this.withRetry(() =>
      this.requireClient().request('blockchain.scripthash.listunspent', scripthash),
    );
    if (!Array.isArray(result)) {
      throw new ElectrumClientError('listunspent: expected array result');
    }
    return result as ElectrumUnspent[];
  }

  async getHistory(scripthash: string): Promise<ElectrumHistoryEntry[]> {
    const result = await this.withRetry(() =>
      this.requireClient().request('blockchain.scripthash.get_history', scripthash),
    );
    if (!Array.isArray(result)) {
      throw new ElectrumClientError('get_history: expected array result');
    }
    return result as ElectrumHistoryEntry[];
  }

  async getTransaction(txid: string, verbose = false): Promise<string | ElectrumTxVerbose> {
    const result = await this.withRetry(() =>
      this.requireClient().request('blockchain.transaction.get', txid, verbose),
    );
    if (verbose) {
      if (!result || typeof result !== 'object') {
        throw new ElectrumClientError('transaction.get verbose: expected object');
      }
      return result as ElectrumTxVerbose;
    }
    if (typeof result !== 'string') {
      throw new ElectrumClientError('transaction.get: expected hex string');
    }
    return result;
  }

  async getHeader(height: number): Promise<string> {
    const result = await this.withRetry(() =>
      this.requireClient().request('blockchain.block.header', height),
    );
    if (typeof result !== 'string') {
      throw new ElectrumClientError('block.header: expected hex string');
    }
    return result;
  }

  blockHash(headerHex: string): string {
    const headerBin = hexToBin(headerHex);
    const firstHash = sha256.hash(headerBin);
    const secondHash = sha256.hash(firstHash);
    const reversed = new Uint8Array(secondHash.length);
    for (let i = 0; i < secondHash.length; i += 1) {
      reversed[i] = secondHash[secondHash.length - 1 - i];
    }
    return binToHex(reversed);
  }

  addressToScripthash(addr: string): string {
    const decoded = cashAddressToLockingBytecode(addr);
    if (typeof decoded === 'string') {
      throw new ElectrumClientError(`invalid cashaddr: ${decoded}`);
    }
    const hash = sha256.hash(decoded.bytecode);
    const reversed = new Uint8Array(hash.length);
    for (let i = 0; i < hash.length; i += 1) {
      reversed[i] = hash[hash.length - 1 - i];
    }
    return binToHex(reversed);
  }

  get isConnected(): boolean {
    return this.client !== null;
  }

  get currentServer(): ParsedServerSpec | null {
    return this.server;
  }

  private requireClient(): RawElectrumClient {
    if (!this.client) throw new ElectrumClientError('not connected');
    return this.client;
  }

  private async withRetry<T>(fn: () => Promise<T | Error>): Promise<T> {
    try {
      const result = await fn();
      if (result instanceof Error) throw result;
      return result;
    } catch (err) {
      if (!this.server) throw err;
      try {
        await this.reconnect();
      } catch (reconnectErr) {
        throw new ElectrumClientError('reconnect failed after request error', reconnectErr);
      }
      const retry = await fn();
      if (retry instanceof Error) throw retry;
      return retry;
    }
  }

  private async reconnect(): Promise<void> {
    if (!this.server) throw new ElectrumClientError('no server recorded for reconnect');
    const spec = this.server;
    try {
      await this.client?.disconnect(true, false);
    } catch {
      // ignore
    }
    const client = new RawElectrumClient(
      spec.application,
      spec.protocolVersion,
      spec.host,
      spec.port,
      spec.scheme,
    );
    await client.connect();
    this.client = client;
    if (this.headerSubscribed && this.headerHandler) {
      const handler = this.headerHandler;
      await client.subscribe(
        (payload: Error | unknown) => {
          if (payload instanceof Error) return;
          const header = extractHeaderNotification(payload);
          if (header) handler(header);
        },
        HEADERS_METHOD,
      );
    }
    for (const [scripthash, handler] of this.scripthashHandlers) {
      await client.subscribe(
        (payload: Error | unknown) => {
          if (payload instanceof Error) return;
          const status = extractScripthashStatus(payload, scripthash);
          handler(status);
        },
        SCRIPTHASH_METHOD,
        scripthash,
      );
    }
  }
}

function extractHeaderNotification(payload: unknown): ElectrumHeaderNotification | null {
  if (payload && typeof payload === 'object' && 'height' in payload && 'hex' in payload) {
    const obj = payload as { height: unknown; hex: unknown };
    if (typeof obj.height === 'number' && typeof obj.hex === 'string') {
      return { height: obj.height, hex: obj.hex };
    }
  }
  if (Array.isArray(payload) && payload.length > 0) {
    const first = payload[0];
    if (first && typeof first === 'object' && 'height' in first && 'hex' in first) {
      const obj = first as { height: unknown; hex: unknown };
      if (typeof obj.height === 'number' && typeof obj.hex === 'string') {
        return { height: obj.height, hex: obj.hex };
      }
    }
  }
  return null;
}

function extractScripthashStatus(payload: unknown, scripthash: string): string | null {
  if (Array.isArray(payload)) {
    if (payload.length >= 2 && payload[0] === scripthash) {
      return typeof payload[1] === 'string' ? payload[1] : null;
    }
    if (payload.length === 1 && typeof payload[0] === 'string') {
      return payload[0];
    }
  }
  if (typeof payload === 'string') return payload;
  return null;
}
