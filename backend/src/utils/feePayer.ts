import {
  SignatureTemplate,
  placeholderP2PKHUnlocker,
  type ElectrumNetworkProvider,
  type Network,
  type P2PKHUnlocker,
} from 'cashscript';
import { publicKeyToP2pkhCashAddress } from '@bitauth/libauth';

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
    .filter((utxo: any) => !utxo.token)
    .sort((a: any, b: any) => {
      const aSats = BigInt(a.satoshis);
      const bSats = BigInt(b.satoshis);
      if (aSats < bSats) return 1;
      if (aSats > bSats) return -1;
      return 0;
    });

  const singleInput = spendable.find((utxo: any) => BigInt(utxo.satoshis) >= requiredFee);
  if (singleInput) {
    return { utxos: [singleInput], total: BigInt(singleInput.satoshis) };
  }

  const selected: any[] = [];
  let total = 0n;
  for (const utxo of spendable) {
    selected.push(utxo);
    total += BigInt(utxo.satoshis);
    if (total >= requiredFee) {
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

function getConfiguredSponsor(network: Network): {
  address: string;
  unlocker: P2PKHUnlocker;
} | null {
  const privateKeyHex = process.env.BACKEND_FEE_PAYER_KEY_HEX?.trim();
  if (!privateKeyHex) return null;

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
