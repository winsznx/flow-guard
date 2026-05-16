import { ElectrumNetworkProvider } from 'cashscript';
import {
  cashAddressToLockingBytecode,
  decodeTransaction,
  hexToBin,
  binToHex,
} from '@bitauth/libauth';

const providers: Partial<Record<string, ElectrumNetworkProvider>> = {};

function getProvider(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
  if (!providers[network]) {
    providers[network] = new ElectrumNetworkProvider(network);
  }
  return providers[network]!;
}

export async function transactionExists(
  txHash: string,
  network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet',
): Promise<boolean> {
  try {
    const tx = await getProvider(network).getRawTransaction(txHash);
    return Boolean(tx);
  } catch {
    return false;
  }
}

function asTransactionHex(rawTx: unknown): string | null {
  if (typeof rawTx === 'string') {
    return rawTx;
  }

  if (rawTx && typeof rawTx === 'object') {
    const candidate = rawTx as Record<string, unknown>;
    const keys = ['hex', 'raw', 'rawTx', 'txHex', 'transaction'];
    for (const key of keys) {
      if (typeof candidate[key] === 'string') {
        return candidate[key] as string;
      }
    }
  }

  return null;
}

function bytecodeEqual(a?: Uint8Array, b?: Uint8Array): boolean {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function tokenCategoryMatches(actual: Uint8Array, expectedHex: string): boolean {
  const expected = hexToBin(expectedHex);
  if (bytecodeEqual(actual, expected)) {
    return true;
  }
  return bytecodeEqual(actual, expected.slice().reverse());
}

export interface ExpectedOutput {
  address: string;
  minimumSatoshis?: bigint;
  tokenCategory?: string;
  minimumTokenAmount?: bigint;
  requireNft?: boolean;
  requiredNftCapability?: 'none' | 'mutable' | 'minting';
  minimumNftCommitmentBytes?: number;
}

/**
 * Verify a transaction includes an output paying a specific address.
 * Optionally verifies minimum satoshis and token category/amount.
 */
export async function transactionHasExpectedOutput(
  txHash: string,
  expected: ExpectedOutput,
  network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet',
): Promise<boolean> {
  try {
    const rawTx = await getProvider(network).getRawTransaction(txHash);
    const txHex = asTransactionHex(rawTx);
    if (!txHex) return false;

    const decoded = decodeTransaction(hexToBin(txHex)) as any;
    const outputs = Array.isArray(decoded?.outputs) ? decoded.outputs : [];
    if (!outputs.length) return false;

    const locking = cashAddressToLockingBytecode(expected.address);
    if (typeof locking === 'string') return false;
    const expectedLocking = locking.bytecode;
    const minSats = expected.minimumSatoshis ?? 0n;

    for (const output of outputs) {
      if (!bytecodeEqual(output.lockingBytecode, expectedLocking)) {
        continue;
      }

      const valueSats = BigInt(output.valueSatoshis ?? 0);
      if (valueSats < minSats) {
        continue;
      }

      if (expected.tokenCategory) {
        if (!output.token?.category) {
          continue;
        }
        if (!tokenCategoryMatches(output.token.category, expected.tokenCategory)) {
          continue;
        }
      }

      if (expected.minimumTokenAmount !== undefined) {
        const tokenAmount = BigInt(output.token?.amount ?? 0);
        if (tokenAmount < expected.minimumTokenAmount) {
          continue;
        }
      }

      if (expected.requireNft) {
        const nft = output.token?.nft;
        if (!nft) {
          continue;
        }
        if (expected.requiredNftCapability && nft.capability !== expected.requiredNftCapability) {
          continue;
        }
        if (expected.minimumNftCommitmentBytes !== undefined) {
          const commitmentLength = nft.commitment?.length ?? 0;
          if (commitmentLength < expected.minimumNftCommitmentBytes) {
            continue;
          }
        }
      }

      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Audit H-07. Verify that the transaction's inputs spend at least one UTXO
 * that locks to the declared funder's P2PKH address. Without this check,
 * `confirm-funding` would accept any tx whose *output* matches the contract,
 * letting a third party "confirm" funding for a campaign they didn't fund.
 *
 * Implementation note: the funder address could in principle spend non-P2PKH
 * inputs (e.g., from a SmartBCH-style contract), but the platform only
 * supports P2PKH wallets today, so we don't need to reach beyond that.
 *
 * Returns false on any decode/network error so callers fail closed.
 */
export async function transactionHasInputFromAddress(
  txHash: string,
  funderAddress: string,
  network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet',
): Promise<boolean> {
  try {
    const provider = getProvider(network);
    const rawTx = await provider.getRawTransaction(txHash);
    const txHex = asTransactionHex(rawTx);
    if (!txHex) return false;

    const decoded = decodeTransaction(hexToBin(txHex)) as any;
    const inputs = Array.isArray(decoded?.inputs) ? decoded.inputs : [];
    if (!inputs.length) return false;

    const expectedLockingResult = cashAddressToLockingBytecode(funderAddress);
    if (typeof expectedLockingResult === 'string') return false;
    const expectedLocking = expectedLockingResult.bytecode;
    const expectedHex = binToHex(expectedLocking);

    // Each input is identified by (outpointTransactionHash, outpointIndex).
    // Resolve each input's prevout to inspect its locking bytecode.
    for (const input of inputs) {
      const prevTxHash: Uint8Array | undefined = input.outpointTransactionHash;
      const prevTxIndex: number | undefined = input.outpointIndex;
      if (!prevTxHash || prevTxIndex === undefined) continue;

      // libauth stores outpointTransactionHash in big-endian wire order;
      // reverse for the human/RPC txid representation.
      const txidLittleEndian = binToHex(prevTxHash.slice().reverse());
      try {
        const prevRaw = await provider.getRawTransaction(txidLittleEndian);
        const prevHex = asTransactionHex(prevRaw);
        if (!prevHex) continue;
        const prevDecoded = decodeTransaction(hexToBin(prevHex)) as any;
        const prevOutput = Array.isArray(prevDecoded?.outputs) ? prevDecoded.outputs[prevTxIndex] : undefined;
        if (!prevOutput) continue;
        const prevHexLocking = binToHex(prevOutput.lockingBytecode);
        if (prevHexLocking === expectedHex) return true;
      } catch {
        continue;
      }
    }

    return false;
  } catch {
    return false;
  }
}
