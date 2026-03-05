import {
  Contract,
  ElectrumNetworkProvider,
  TransactionBuilder,
  placeholderPublicKey,
  placeholderP2PKHUnlocker,
  placeholderSignature,
  type WcTransactionObject,
} from 'cashscript';
import { binToHex, cashAddressToLockingBytecode, hexToBin, lockingBytecodeToCashAddress } from '@bitauth/libauth';
import { ContractFactory } from './ContractFactory.js';
import { finalizeWcTransactionSequences } from './txFinality.js';

export interface PaymentControlBuildParams {
  contractAddress: string;
  constructorParams: any[];
  currentCommitment: string;
  currentTime: number;
  tokenType: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
}

export interface PaymentRefillBuildParams extends PaymentControlBuildParams {
  senderAddress: string;
  refillAmount: bigint;
}

export interface PaymentControlBuildResult {
  wcTransaction: WcTransactionObject;
  nextStatus: 'PAUSED' | 'ACTIVE' | 'CANCELLED';
  senderReturnAddress?: string;
  remainingPool?: bigint;
}

export class PaymentControlService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  async buildPauseTransaction(params: PaymentControlBuildParams): Promise<PaymentControlBuildResult> {
    const artifact = ContractFactory.getArtifact('RecurringPaymentCovenant');
    const contract = new Contract(artifact, params.constructorParams, { provider: this.provider });
    const { contractUtxo, commitment } = await this.getContractState(params.contractAddress, params.currentCommitment);

    const status = commitment[0] ?? 0;
    const flags = commitment[1] ?? 0;
    if (status !== 0) {
      throw new Error('Payment must be ACTIVE to pause');
    }
    if ((flags & 0x01) !== 0x01) {
      throw new Error('Payment is not configured as cancelable/pausable');
    }

    // Matches RecurringPaymentCovenant.pause() serialization exactly.
    const newCommitment = new Uint8Array(35);
    newCommitment[0] = 1;
    newCommitment[1] = flags;
    newCommitment.set(commitment.slice(2, 18), 2);
    this.setUint40LE(newCommitment, 18, params.currentTime);
    newCommitment.fill(0, 23);

    const feeReserve = 900n;
    const stateOutputSatoshis = contractUtxo.satoshis - feeReserve;
    if (stateOutputSatoshis < 546n) {
      throw new Error('Insufficient contract balance to pause payment');
    }

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(params.currentTime);
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.pause(
        placeholderSignature(),
        placeholderPublicKey(),
      ),
    );
    txBuilder.addOutput({
      to: contract.tokenAddress,
      amount: stateOutputSatoshis,
      token: {
        category: contractUtxo.token.category,
        amount: contractUtxo.token.amount ?? 0n,
        nft: {
          capability: contractUtxo.token.nft.capability as 'none' | 'mutable' | 'minting',
          commitment: binToHex(newCommitment),
        },
      },
    });

    return {
      wcTransaction: finalizeWcTransactionSequences(txBuilder.generateWcTransactionObject({
        broadcast: true,
        userPrompt: 'Pause recurring payment',
      })),
      nextStatus: 'PAUSED',
    };
  }

  async buildResumeTransaction(params: PaymentControlBuildParams): Promise<PaymentControlBuildResult> {
    const artifact = ContractFactory.getArtifact('RecurringPaymentCovenant');
    const contract = new Contract(artifact, params.constructorParams, { provider: this.provider });
    const { contractUtxo, commitment } = await this.getContractState(params.contractAddress, params.currentCommitment);

    const status = commitment[0] ?? 0;
    if (status !== 1) {
      throw new Error('Payment must be PAUSED to resume');
    }

    const flags = commitment[1] ?? 0;
    const intervalSeconds = this.toBigIntParam(params.constructorParams[4], 'intervalSeconds');
    const newNextPayment = BigInt(params.currentTime) + intervalSeconds;

    // Matches RecurringPaymentCovenant.resume() serialization exactly.
    const newCommitment = new Uint8Array(40);
    newCommitment[0] = 0;
    newCommitment[1] = flags;
    newCommitment.set(commitment.slice(2, 10), 2);
    newCommitment.set(commitment.slice(10, 18), 10);
    this.setUint40LE(newCommitment, 18, Number(newNextPayment));
    this.setUint40LE(newCommitment, 23, 0);
    newCommitment.fill(0, 28);

    const feeReserve = 900n;
    const stateOutputSatoshis = contractUtxo.satoshis - feeReserve;
    if (stateOutputSatoshis < 546n) {
      throw new Error('Insufficient contract balance to resume payment');
    }

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(params.currentTime);
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.resume(
        placeholderSignature(),
        placeholderPublicKey(),
      ),
    );
    txBuilder.addOutput({
      to: contract.tokenAddress,
      amount: stateOutputSatoshis,
      token: {
        category: contractUtxo.token.category,
        amount: contractUtxo.token.amount ?? 0n,
        nft: {
          capability: contractUtxo.token.nft.capability as 'none' | 'mutable' | 'minting',
          commitment: binToHex(newCommitment),
        },
      },
    });

    return {
      wcTransaction: finalizeWcTransactionSequences(txBuilder.generateWcTransactionObject({
        broadcast: true,
        userPrompt: 'Resume recurring payment',
      })),
      nextStatus: 'ACTIVE',
    };
  }

  async buildCancelTransaction(params: PaymentControlBuildParams): Promise<PaymentControlBuildResult> {
    const artifact = ContractFactory.getArtifact('RecurringPaymentCovenant');
    const contract = new Contract(artifact, params.constructorParams, { provider: this.provider });
    const { contractUtxo, commitment } = await this.getContractState(params.contractAddress, params.currentCommitment);

    const status = commitment[0] ?? 0;
    const flags = commitment[1] ?? 0;
    if (status !== 0 && status !== 1) {
      throw new Error('Payment must be ACTIVE or PAUSED to cancel');
    }
    if ((flags & 0x01) !== 0x01) {
      throw new Error('Payment is not cancelable');
    }

    const totalPaid = this.readUint64LE(commitment, 2);
    const totalAmount = this.toBigIntParam(params.constructorParams[5], 'totalAmount');
    const remainingPool = totalAmount > 0n ? this.clampToZero(totalAmount - totalPaid) : 0n;

    const senderHash = this.readBytes20(params.constructorParams[1], 'senderHash');
    const senderReturnAddress = this.p2pkhFromHash(senderHash);

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(params.currentTime);
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.cancel(
        placeholderSignature(),
        placeholderPublicKey(),
      ),
    );

    const feeReserve = 1200n;
    let spentSatoshis = 0n;
    if (remainingPool > 0n) {
      if (params.tokenType === 'FUNGIBLE_TOKEN') {
        const tokenCategory = contractUtxo.token.category;
        txBuilder.addOutput({
          to: senderReturnAddress,
          amount: 1000n,
          token: {
            category: tokenCategory,
            amount: remainingPool,
          },
        });
        spentSatoshis += 1000n;
      } else {
        if (remainingPool < 546n) {
          throw new Error('Remaining BCH pool is below dust and cannot be cancelled');
        }
        txBuilder.addOutput({
          to: senderReturnAddress,
          amount: remainingPool,
        });
        spentSatoshis += remainingPool;
      }
    }

    const change = contractUtxo.satoshis - spentSatoshis - feeReserve;
    if (change < 0n) {
      throw new Error('Insufficient contract balance to cover cancel transaction fee');
    }
    if (change > 546n) {
      txBuilder.addOutput({ to: senderReturnAddress, amount: change });
    }

    return {
      wcTransaction: finalizeWcTransactionSequences(txBuilder.generateWcTransactionObject({
        broadcast: true,
        userPrompt: 'Cancel recurring payment and recover remaining funds',
      })),
      nextStatus: 'CANCELLED',
      senderReturnAddress,
      remainingPool,
    };
  }

  async buildRefillTransaction(params: PaymentRefillBuildParams): Promise<PaymentControlBuildResult> {
    if (params.refillAmount <= 0n) {
      throw new Error('Refill amount must be greater than zero');
    }

    const artifact = ContractFactory.getArtifact('RecurringPaymentCovenant');
    const contract = new Contract(artifact, params.constructorParams, { provider: this.provider });
    const { contractUtxo, commitment } = await this.getContractState(params.contractAddress, params.currentCommitment);

    const status = commitment[0] ?? 0;
    if (status !== 0 && status !== 1) {
      throw new Error('Only ACTIVE or PAUSED recurring streams can be refilled');
    }

    const totalAmount = this.toBigIntParam(params.constructorParams[5], 'totalAmount');
    if (totalAmount !== 0n) {
      throw new Error('Only open-ended recurring streams can be refilled');
    }

    const senderHash = this.readBytes20(params.constructorParams[1], 'senderHash');
    const expectedSenderHash = this.addressToHash160(params.senderAddress);
    if (!this.bytesEqual(senderHash, expectedSenderHash)) {
      throw new Error('Only the recurring stream sender can refill this stream');
    }

    const senderUtxos = await this.provider.getUtxos(params.senderAddress);
    if (!senderUtxos || senderUtxos.length === 0) {
      throw new Error(`No UTXOs found for sender ${params.senderAddress}`);
    }

    const feeReserve = 2000n;
    const senderUnlocker = placeholderP2PKHUnlocker(params.senderAddress);
    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(params.currentTime);
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.refill(
        placeholderSignature(),
        placeholderPublicKey(),
      ),
    );

    let totalSenderInputSatoshis = 0n;

    if (params.tokenType === 'FUNGIBLE_TOKEN') {
      const tokenCategory = params.tokenCategory || contractUtxo.token?.category;
      if (!tokenCategory) {
        throw new Error('Token category is required to refill token recurring streams');
      }

      const existingTokenAmount = contractUtxo.token?.amount ?? 0n;
      const tokenUtxos = senderUtxos.filter(
        (utxo: any) =>
          utxo.token?.category === tokenCategory &&
          utxo.token?.amount &&
          !utxo.token?.nft,
      );
      if (tokenUtxos.length === 0) {
        throw new Error(`No refillable token UTXOs found for category ${tokenCategory}`);
      }

      const selectedTokenUtxos: any[] = [];
      let totalTokenInput = 0n;
      for (const utxo of tokenUtxos) {
        selectedTokenUtxos.push(utxo);
        totalTokenInput += this.toBigIntParam(utxo.token?.amount ?? 0n, 'token refill amount');
        totalSenderInputSatoshis += this.toBigIntParam(utxo.satoshis, 'token refill satoshis');
        txBuilder.addInput(utxo, senderUnlocker);
        if (totalTokenInput >= params.refillAmount) {
          break;
        }
      }

      if (totalTokenInput < params.refillAmount) {
        throw new Error('Insufficient token balance to refill recurring stream');
      }

      const tokenChange = totalTokenInput - params.refillAmount;
      const tokenChangeDust = tokenChange > 0n ? 1000n : 0n;
      if (totalSenderInputSatoshis < feeReserve + tokenChangeDust) {
        const bchUtxos = senderUtxos.filter((utxo: any) => !utxo.token);
        for (const utxo of bchUtxos) {
          txBuilder.addInput(utxo, senderUnlocker);
          totalSenderInputSatoshis += this.toBigIntParam(utxo.satoshis, 'refill fee satoshis');
          if (totalSenderInputSatoshis >= feeReserve + tokenChangeDust) {
            break;
          }
        }
      }

      if (totalSenderInputSatoshis < feeReserve + tokenChangeDust) {
        throw new Error('Insufficient BCH balance to pay refill transaction fee');
      }

      txBuilder.addOutput({
        to: contract.tokenAddress,
        amount: contractUtxo.satoshis,
        token: {
          category: tokenCategory,
          amount: existingTokenAmount + params.refillAmount,
          nft: {
            capability: contractUtxo.token.nft.capability as 'none' | 'mutable' | 'minting',
            commitment: binToHex(commitment),
          },
        },
      });

      if (tokenChange > 0n) {
        txBuilder.addOutput({
          to: params.senderAddress,
          amount: tokenChangeDust,
          token: {
            category: tokenCategory,
            amount: tokenChange,
          },
        });
      }

      const bchChange = totalSenderInputSatoshis - feeReserve - tokenChangeDust;
      if (bchChange > 546n) {
        txBuilder.addOutput({
          to: params.senderAddress,
          amount: bchChange,
        });
      }
    } else {
      const nonTokenUtxos = senderUtxos.filter((utxo: any) => !utxo.token);
      const requiredExternalSatoshis = params.refillAmount + feeReserve;
      for (const utxo of nonTokenUtxos) {
        txBuilder.addInput(utxo, senderUnlocker);
        totalSenderInputSatoshis += this.toBigIntParam(utxo.satoshis, 'refill input satoshis');
        if (totalSenderInputSatoshis >= requiredExternalSatoshis) {
          break;
        }
      }

      if (totalSenderInputSatoshis < requiredExternalSatoshis) {
        throw new Error('Insufficient BCH balance to refill recurring stream');
      }

      txBuilder.addOutput({
        to: contract.tokenAddress,
        amount: contractUtxo.satoshis + params.refillAmount,
        token: {
          category: contractUtxo.token.category,
          amount: contractUtxo.token.amount ?? 0n,
          nft: {
            capability: contractUtxo.token.nft.capability as 'none' | 'mutable' | 'minting',
            commitment: binToHex(commitment),
          },
        },
      });

      const change = totalSenderInputSatoshis - params.refillAmount - feeReserve;
      if (change > 546n) {
        txBuilder.addOutput({
          to: params.senderAddress,
          amount: change,
        });
      }
    }

    return {
      wcTransaction: finalizeWcTransactionSequences(txBuilder.generateWcTransactionObject({
        broadcast: true,
        userPrompt: 'Refill recurring stream runway',
      })),
      nextStatus: status === 1 ? 'PAUSED' : 'ACTIVE',
    };
  }

  private async getContractState(contractAddress: string, fallbackCommitment: string): Promise<{
    contractUtxo: any;
    commitment: Uint8Array;
  }> {
    const contractUtxos = await this.provider.getUtxos(contractAddress);
    if (!contractUtxos || contractUtxos.length === 0) {
      throw new Error(`No UTXOs found for payment contract ${contractAddress}`);
    }

    const contractUtxo = contractUtxos.find((u) => u.token?.nft != null) ?? contractUtxos[0];
    if (!contractUtxo.token?.nft) {
      throw new Error('Payment contract UTXO is missing required state NFT');
    }

    const onChainCommitment: unknown = contractUtxo.token.nft.commitment;
    const commitment =
      onChainCommitment instanceof Uint8Array
        ? onChainCommitment
        : typeof onChainCommitment === 'string'
        ? hexToBin(onChainCommitment)
        : hexToBin(fallbackCommitment || '');

    if (commitment.length < 18) {
      throw new Error('Invalid payment state commitment');
    }

    return { contractUtxo, commitment };
  }

  private setUint40LE(target: Uint8Array, offset: number, value: number): void {
    const safe = Math.max(0, Math.floor(value));
    target[offset] = safe & 0xff;
    target[offset + 1] = (safe >>> 8) & 0xff;
    target[offset + 2] = (safe >>> 16) & 0xff;
    target[offset + 3] = (safe >>> 24) & 0xff;
    target[offset + 4] = Math.floor(safe / 0x100000000) & 0xff;
  }

  private readUint64LE(source: Uint8Array, offset: number): bigint {
    const view = new DataView(source.buffer, source.byteOffset + offset, 8);
    return view.getBigUint64(0, true);
  }

  private toBigIntParam(value: unknown, name: string): bigint {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(Math.trunc(value));
    if (typeof value === 'string' && value.length > 0) return BigInt(value);
    if (value instanceof Uint8Array) {
      if (value.length > 8) {
        throw new Error(`Unsupported byte length for ${name}`);
      }
      let result = 0n;
      for (let i = value.length - 1; i >= 0; i--) {
        result = (result << 8n) + BigInt(value[i]);
      }
      return result;
    }
    throw new Error(`Invalid constructor parameter for ${name}`);
  }

  private readBytes20(value: unknown, name: string): Uint8Array {
    let bytes: Uint8Array;
    if (value instanceof Uint8Array) {
      bytes = value;
    } else if (typeof value === 'string') {
      bytes = hexToBin(value);
    } else {
      throw new Error(`Invalid constructor parameter for ${name}`);
    }
    if (bytes.length !== 20) {
      throw new Error(`${name} must be 20 bytes`);
    }
    return bytes;
  }

  private p2pkhFromHash(hash20: Uint8Array): string {
    const lockingBytecode = new Uint8Array(25);
    lockingBytecode[0] = 0x76;
    lockingBytecode[1] = 0xa9;
    lockingBytecode[2] = 0x14;
    lockingBytecode.set(hash20, 3);
    lockingBytecode[23] = 0x88;
    lockingBytecode[24] = 0xac;
    const encoded = lockingBytecodeToCashAddress({
      bytecode: lockingBytecode,
      prefix: this.networkPrefix(),
    });
    if (typeof encoded === 'string') {
      throw new Error(`Failed to encode sender P2PKH address: ${encoded}`);
    }
    return encoded.address;
  }

  private addressToHash160(address: string): Uint8Array {
    const decoded = cashAddressToLockingBytecode(address);
    if (typeof decoded === 'string') {
      throw new Error(`Invalid sender address: ${decoded}`);
    }
    const b = decoded.bytecode;
    const isP2pkh =
      b.length === 25 &&
      b[0] === 0x76 &&
      b[1] === 0xa9 &&
      b[2] === 0x14 &&
      b[23] === 0x88 &&
      b[24] === 0xac;
    if (!isP2pkh) {
      throw new Error('Recurring refill sender must be a P2PKH address');
    }
    return b.slice(3, 23);
  }

  private bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return false;
    }
    return true;
  }

  private clampToZero(value: bigint): bigint {
    return value > 0n ? value : 0n;
  }

  private networkPrefix(): 'bitcoincash' | 'bchtest' {
    return this.network === 'mainnet' ? 'bitcoincash' : 'bchtest';
  }
}
