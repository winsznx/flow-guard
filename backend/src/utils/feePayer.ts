import {
  SignatureTemplate,
  placeholderP2PKHUnlocker,
  type ElectrumNetworkProvider,
  type Network,
  type P2PKHUnlocker,
} from 'cashscript';
import { publicKeyToP2pkhCashAddress } from '@bitauth/libauth';

const RESERVATION_TTL_MS = 60_000;
const reservedUtxos = new Map<string, number>();

function utxoKey(utxo: { txid: string; vout: number }): string {
  return `${utxo.txid}:${utxo.vout}`;
}

function isReserved(utxo: { txid: string; vout: number }): boolean {
  const key = utxoKey(utxo);
  const expiry = reservedUtxos.get(key);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    reservedUtxos.delete(key);
    return false;
  }
  return true;
}

function reserveUtxos(utxos: Array<{ txid: string; vout: number }>): void {
  const expiry = Date.now() + RESERVATION_TTL_MS;
  for (const utxo of utxos) {
    reservedUtxos.set(utxoKey(utxo), expiry);
  }
}

export interface FeePayerSelection {
  utxos: any[];
  total: bigint;
}

export interface ResolvedFeePayer extends FeePayerSelection {
  address: string;
  unlocker: P2PKHUnlocker | ReturnType<typeof placeholderP2PKHUnlocker>;
  sponsored: boolean;
}

export async function selectFeePayerInputs(
  provider: ElectrumNetworkProvider,
  address: string,
  requiredFee: bigint,
): Promise<FeePayerSelection> {
  const utxos = await provider.getUtxos(address);
  const spendable = utxos
    .filter((utxo: any) => !utxo.token && !isReserved(utxo))
    .sort((a: any, b: any) => {
      const aSats = BigInt(a.satoshis);
      const bSats = BigInt(b.satoshis);
      if (aSats < bSats) return 1;
      if (aSats > bSats) return -1;
      return 0;
    });

  const singleInput = spendable.find((utxo: any) => BigInt(utxo.satoshis) >= requiredFee);
  if (singleInput) {
    reserveUtxos([singleInput]);
    return { utxos: [singleInput], total: BigInt(singleInput.satoshis) };
  }

  const selected: any[] = [];
  let total = 0n;
  for (const utxo of spendable) {
    selected.push(utxo);
    total += BigInt(utxo.satoshis);
    if (total >= requiredFee) {
      reserveUtxos(selected);
      return { utxos: selected, total };
    }
  }

  const availableBch = Number(total) / 1e8;
  const requiredBch = Number(requiredFee) / 1e8;
  throw new Error(
    `Fee payer wallet ${address} needs at least ${requiredBch.toFixed(8)} BCH ` +
      `in spendable BCH UTXOs to cover network fees. Available: ${availableBch.toFixed(8)} BCH`,
  );
}

export async function resolveFeePayer(
  provider: ElectrumNetworkProvider,
  network: Network,
  preferredAddress: string,
  requiredFee: bigint,
): Promise<ResolvedFeePayer> {
  try {
    const walletSelection = await selectFeePayerInputs(provider, preferredAddress, requiredFee);
    return {
      ...walletSelection,
      address: preferredAddress,
      unlocker: placeholderP2PKHUnlocker(preferredAddress),
      sponsored: false,
    };
  } catch (walletError: any) {
    const sponsor = getConfiguredSponsor(network);
    if (!sponsor || sponsor.address.toLowerCase() === preferredAddress.toLowerCase()) {
      throw walletError;
    }

    try {
      const sponsorSelection = await selectFeePayerInputs(provider, sponsor.address, requiredFee);
      return {
        ...sponsorSelection,
        address: sponsor.address,
        unlocker: sponsor.unlocker,
        sponsored: true,
      };
    } catch (sponsorError: any) {
      throw new Error(
        `${walletError.message}. Fee sponsorship is configured, but the sponsor wallet ` +
          `${sponsor.address} cannot currently cover the network fee (${sponsorError.message}).`,
      );
    }
  }
}

let feePayerWarningLogged = false;

function getConfiguredSponsor(network: Network): {
  address: string;
  unlocker: P2PKHUnlocker;
} | null {
  const privateKeyHex = process.env.BACKEND_FEE_PAYER_KEY_HEX?.trim();
  if (!privateKeyHex) {
    if (!feePayerWarningLogged) {
      console.warn('[feePayer] BACKEND_FEE_PAYER_KEY_HEX not set — fee sponsorship disabled. Users must pay their own fees.');
      feePayerWarningLogged = true;
    }
    return null;
  }

  const template = new SignatureTemplate(privateKeyHex);
  const publicKey = template.getPublicKey();
  const address = publicKeyToP2pkhCashAddress({
    publicKey,
    prefix: network === 'mainnet' ? 'bitcoincash' : 'bchtest',
  });

  if (typeof address === 'string') {
    throw new Error(`Failed to derive backend fee sponsor address: ${address}`);
  }

  return {
    address: address.address,
    unlocker: template.unlockP2PKH(),
  };
}
