/**
 * Blockchain transaction utilities
 * Handles wallet signing and transaction broadcasting
 */

import { binToHex, decodeTransaction, hexToBin } from '@bitauth/libauth';
import { broadcastTransaction, getDepositInfo } from './api';
import type { Transaction, SignedTransaction, CashScriptSignOptions, CashScriptSignResponse, SourceOutput } from '../types/wallet';
import { emitTransactionNotice, normalizeWalletNetwork } from './txNotice';

export interface SignTransactionRequest {
  txHex: string;
  requiresSignatures: string[]; // Public keys that need to sign
}

export interface SignTransactionResult {
  signedTxHex: string;
  txid: string;
}

export interface WalletInterface {
  signTransaction: (tx: Transaction) => Promise<SignedTransaction>;
  signRawTransaction?: (txHex: string) => Promise<string>;
  signCashScriptTransaction?: (options: CashScriptSignOptions) => Promise<CashScriptSignResponse>;
  getAddress?: () => Promise<string | null>;
  isConnected: boolean;
  address: string | null;
  walletType?: string | null;
  network?: 'mainnet' | 'testnet' | 'chipnet';
}

export interface SerializedSourceOutput {
  lockingBytecode: string;
  valueSatoshis: string;
  outpointTransactionHash?: string;
  outpointIndex?: number;
  unlockingBytecode?: string;
  sequenceNumber?: number;
  token?: {
    category: string;
    amount: string;
    nft?: { capability: 'none' | 'mutable' | 'minting'; commitment: string };
  };
  contract?: { abiFunction: object; redeemScript: string; artifact: object };
}

export interface SerializedWcTransaction {
  transaction: string;
  sourceOutputs: SerializedSourceOutput[];
  broadcast?: boolean;
  userPrompt?: string;
}

function requireSignedTransactionHex(signResult: CashScriptSignResponse, context: string): string {
  if (!signResult?.signedTransaction || typeof signResult.signedTransaction !== 'string') {
    throw new Error(`${context}: wallet did not return signed transaction hex`);
  }
  return signResult.signedTransaction;
}

function inspectUnsignedPlaceholderInputs(txHex: string): number[] {
  const decoded = decodeTransaction(hexToBin(txHex));
  if (typeof decoded === 'string') return [];
  const placeholderPubkeyPattern = `21${'00'.repeat(33)}`;
  const placeholderSigPattern = `41${'00'.repeat(65)}`;
  const failedInputs: number[] = [];

  decoded.inputs.forEach((input, index) => {
    const unlockingHex = binToHex(input.unlockingBytecode);
    if (
      unlockingHex.includes(placeholderPubkeyPattern) ||
      unlockingHex.includes(placeholderSigPattern)
    ) {
      failedInputs.push(index);
    }
  });

  return failedInputs;
}

async function resolveTxHashFromSignResult(
  signResult: CashScriptSignResponse,
  signOptions: CashScriptSignOptions,
  context: string,
  metadata?: {
    txType?: 'create' | 'unlock' | 'proposal' | 'approve' | 'payout';
    vaultId?: string;
    proposalId?: string;
    amount?: number;
    fromAddress?: string;
    toAddress?: string;
  }
): Promise<string> {
  const signedTxHex = requireSignedTransactionHex(signResult, context);
  const unsignedPlaceholderInputs = inspectUnsignedPlaceholderInputs(signedTxHex);
  if (unsignedPlaceholderInputs.length > 0) {
    const oneBasedInputs = unsignedPlaceholderInputs.map((index) => index + 1).join(', ');
    throw new Error(
      `${context}: wallet did not sign all required inputs (placeholder left in input(s): ${oneBasedInputs}).`
    );
  }
  const walletBroadcasts = signOptions.broadcast ?? true;

  if (walletBroadcasts) {
    if (!signResult.signedTransactionHash) {
      throw new Error(`${context}: wallet did not return transaction hash after broadcast`);
    }
    return signResult.signedTransactionHash;
  }

  const broadcastResult = await broadcastTransaction(signedTxHex, metadata);
  return signResult.signedTransactionHash || broadcastResult.txid;
}

function getApiErrorMessage(error: any, fallback: string): string {
  if (!error || typeof error !== 'object') {
    return fallback;
  }
  const generic = typeof error.error === 'string' ? error.error.trim() : '';
  const detail = typeof error.message === 'string' ? error.message.trim() : '';
  if (generic && detail && generic !== detail) {
    return `${generic}: ${detail}`;
  }
  return detail || generic || fallback;
}

function publishTransactionNotice(txHash: string, wallet: WalletInterface, label: string): string {
  emitTransactionNotice({
    txHash,
    network: normalizeWalletNetwork(wallet.network),
    label,
  });
  return txHash;
}

function getNoticeLabelFromTxType(
  txType?: 'create' | 'unlock' | 'proposal' | 'approve' | 'payout'
): string {
  switch (txType) {
    case 'create':
      return 'Transaction created';
    case 'unlock':
      return 'Cycle unlocked';
    case 'proposal':
      return 'Proposal transaction';
    case 'approve':
      return 'Proposal approval';
    case 'payout':
      return 'Payout executed';
    default:
      return 'Transaction broadcast';
  }
}

async function resolveWalletAddress(wallet: WalletInterface): Promise<string> {
  if (wallet.getAddress) {
    try {
      const refreshed = await wallet.getAddress();
      if (refreshed) return refreshed;
    } catch (error) {
      console.warn('[FlowGuard] Failed to refresh wallet address, using cached value:', error);
    }
  }

  if (wallet.address) {
    return wallet.address;
  }

  throw new Error('Wallet not connected');
}

/**
 * Deserialize a serialized WC transaction payload from backend into wallet-ready signing options.
 * Also ensures non-contract inputs keep empty unlocking bytecode so wallets can recognize owned inputs.
 */
export function deserializeWcSignOptions(serialized: SerializedWcTransaction): CashScriptSignOptions {
  const decoded = decodeTransaction(hexToBin(serialized.transaction));
  if (typeof decoded === 'string') {
    throw new Error(`Failed to decode serialized transaction: ${decoded}`);
  }

  const sourceOutputs: SourceOutput[] = serialized.sourceOutputs.map(so => {
    const out: SourceOutput & Record<string, unknown> = {
      lockingBytecode: hexToBin(so.lockingBytecode),
      valueSatoshis: BigInt(so.valueSatoshis),
    };
    // Extra outpoint fields needed by WalletConnect BCH signing spec
    if (so.outpointTransactionHash) out['outpointTransactionHash'] = hexToBin(so.outpointTransactionHash);
    if (so.outpointIndex !== undefined) out['outpointIndex'] = so.outpointIndex;
    if (so.unlockingBytecode !== undefined) out.unlockingBytecode = hexToBin(so.unlockingBytecode);
    if (so.sequenceNumber !== undefined) out['sequenceNumber'] = so.sequenceNumber;
    if (so.token) {
      out.token = {
        category: hexToBin(so.token.category),
        amount: BigInt(so.token.amount),
        ...(so.token.nft ? {
          nft: { capability: so.token.nft.capability, commitment: hexToBin(so.token.nft.commitment) },
        } : {}),
      };
    }
    if (so.contract) {
      out.contract = {
        abiFunction: so.contract.abiFunction as NonNullable<SourceOutput['contract']>['abiFunction'],
        redeemScript: hexToBin(so.contract.redeemScript),
        artifact: so.contract.artifact as NonNullable<SourceOutput['contract']>['artifact'],
      };
    }
    return out as SourceOutput;
  });

  for (let i = 0; i < sourceOutputs.length; i++) {
    const sourceOutput = sourceOutputs[i] as (SourceOutput & { contract?: unknown });
    const txInput = decoded.inputs[i];
    if (!txInput) continue;

    // For wallet-owned inputs, force empty unlocking bytecode so wallets actually sign.
    // Some builders include placeholder unlocking scripts in sourceOutputs; if those are
    // preserved on non-contract inputs, wallets may skip signing and the tx fails OP_EQUALVERIFY.
    if (!sourceOutput.contract) {
      txInput.unlockingBytecode = new Uint8Array(0);
      sourceOutput.unlockingBytecode = new Uint8Array(0);
      continue;
    }

    // Preserve explicit unlocking bytecode for contract inputs only.
    if (sourceOutput.unlockingBytecode !== undefined) {
      txInput.unlockingBytecode = sourceOutput.unlockingBytecode;
    }
  }

  return {
    transaction: decoded as Record<string, unknown>,
    sourceOutputs,
    broadcast: serialized.broadcast,
    userPrompt: serialized.userPrompt,
  };
}

/**
 * Sign a raw transaction hex using the connected wallet
 * For BCH covenant transactions, we need to sign raw transaction hex
 * @param wallet The wallet hook return value with signTransaction method
 * @param txHex The transaction hex to sign
 * @returns Signed transaction hex
 */
export async function signTransaction(
  wallet: WalletInterface,
  txHex: string
): Promise<string> {
  try {
    // Check if wallet has a method to sign raw hex directly
    if (wallet && wallet.signRawTransaction && typeof wallet.signRawTransaction === 'function') {
      try {
        const signedHex = await wallet.signRawTransaction(txHex);
        console.log('Successfully signed transaction with wallet signRawTransaction method');
        return signedHex;
      } catch (signError: any) {
        console.warn('Raw transaction signing failed, trying alternative method:', signError);
        // Fall through to alternative method
      }
    }


    // Alternative: Try using signTransaction with hex in data field
    // Some wallets might support this
    try {
      const dummyTx: Transaction = {
        to: wallet.address || '',
        amount: 0,
        data: txHex,
      };

      if (wallet && typeof wallet.signTransaction === 'function') {
        const signedTx = await wallet.signTransaction(dummyTx);
        if (signedTx.hex && signedTx.hex.length > 0) {
          return signedTx.hex;
        }
      }
    } catch (altError) {
      console.warn('Alternative signing method failed:', altError);
    }

    // If all signing methods fail, return the hex as-is
    // The transaction may be pre-signed by CashScript's SignatureTemplate
    // or may need to be signed on the backend
    console.warn(
      'Wallet does not support raw transaction hex signing. ' +
      'Transaction may need to be signed differently or is already signed.'
    );
    return txHex;
  } catch (error: any) {
    console.error('Failed to sign transaction:', error);
    throw new Error(`Signing failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Sign and broadcast a transaction
 * For BCH covenant transactions, the backend builds transactions with SignatureTemplate
 * which signs automatically if private keys are available. For browser wallets,
 * we need to handle signing differently.
 * @param wallet The wallet hook return value
 * @param txHex The transaction hex to sign
 * @param metadata Optional metadata for transaction tracking
 * @returns Transaction ID after successful broadcast
 */
export async function signAndBroadcast(
  wallet: WalletInterface,
  txHex: string,
  metadata?: {
    txType?: 'create' | 'unlock' | 'proposal' | 'approve' | 'payout';
    vaultId?: string;
    proposalId?: string;
    amount?: number;
    fromAddress?: string;
    toAddress?: string;
  }
): Promise<string> {
  try {
    // Try to sign the transaction first
    let signedTxHex = txHex;

    // Use signRawTransaction if available
    if (wallet.signRawTransaction && typeof wallet.signRawTransaction === 'function') {
      try {
        console.log('Using wallet signRawTransaction method...');
        signedTxHex = await wallet.signRawTransaction(txHex);
        console.log('Transaction signed successfully with signRawTransaction');
      } catch (signError: any) {
        console.warn('signRawTransaction failed, trying alternative:', signError);
        // Fall through to alternative method
      }
    }

    // Alternative: Try signTransaction with hex in data field
    if (signedTxHex === txHex) {
      try {
        signedTxHex = await signTransaction(wallet, txHex);
        console.log('Transaction signed successfully with signTransaction');
      } catch (signError) {
        console.warn('Could not sign transaction with wallet, using as-is:', signError);
        // Continue with unsigned hex - backend may handle it or transaction may be pre-signed
      }
    }

    // Broadcast the (potentially signed) transaction with metadata
    const result = await broadcastTransaction(signedTxHex, metadata);
    return publishTransactionNotice(result.txid, wallet, 'Transaction broadcast');
  } catch (error: any) {
    console.error('Failed to sign and broadcast transaction:', error);
    throw new Error(`Transaction failed: ${error.message || 'Unknown error'}`);
  }
}

async function signFromBackendPayload(
  wallet: WalletInterface,
  payload: any,
  metadata?: {
    txType?: 'create' | 'unlock' | 'proposal' | 'approve' | 'payout';
    vaultId?: string;
    proposalId?: string;
    amount?: number;
    fromAddress?: string;
    toAddress?: string;
  }
): Promise<string> {
  if (payload?.wcTransaction) {
    if (!wallet.signCashScriptTransaction) {
      throw new Error('Connected wallet does not support CashScript transactions');
    }
    const signOptions = deserializeWcSignOptions(payload.wcTransaction);
    const tx = signOptions.transaction as { inputs?: Array<{ unlockingBytecode?: Uint8Array }>; outputs?: unknown[] };
    const contractInputCount = signOptions.sourceOutputs.filter((so: any) => so.contract != null).length;

    console.log('[FlowGuard][WC] Prepared transaction before signing', {
      inputCount: tx.inputs?.length ?? 0,
      outputCount: tx.outputs?.length ?? 0,
      sourceOutputCount: signOptions.sourceOutputs.length,
      contractInputCount,
      userInputCount: signOptions.sourceOutputs.length - contractInputCount,
    });

    const signResult = await wallet.signCashScriptTransaction(
      signOptions
    );
    const txHash = await resolveTxHashFromSignResult(signResult, signOptions, 'WalletConnect signing failed', metadata);
    return publishTransactionNotice(txHash, wallet, getNoticeLabelFromTxType(metadata?.txType));
  }

  if (payload?.transaction?.txHex) {
    return signAndBroadcast(wallet, payload.transaction.txHex, metadata);
  }

  if (payload?.txHex) {
    return signAndBroadcast(wallet, payload.txHex, metadata);
  }

  if (payload?.transaction?.type && payload?.transaction?.contractType) {
    throw new Error(
      'Backend returned a descriptor-only transaction. ' +
      'This on-chain flow is not fully wired for wallet signing yet.'
    );
  }

  throw new Error('Backend did not return a signable transaction payload');
}

/**
 * Create, sign, and broadcast an on-chain proposal
 * @param wallet The wallet hook return value
 * @param proposalId The proposal ID
 * @param userPublicKey The user's public key (hex)
 * @returns Transaction ID
 */
export async function createProposalOnChain(
  wallet: WalletInterface,
  proposalId: string,
  _userPublicKey: string,
  metadata?: { vaultId?: string; proposalId?: string; amount?: number; toAddress?: string }
): Promise<string> {
  if (!wallet.signCashScriptTransaction) {
    throw new Error('Connected wallet does not support CashScript transaction signing');
  }
  if (!wallet.address) {
    throw new Error('Wallet not connected');
  }

  // Get the unsigned transaction from backend
  const apiUrl = '/api';
  const response = await fetch(`${apiUrl}/proposals/${proposalId}/create-onchain`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create proposal transaction');
  }

  const payload = await response.json();
  if (!payload?.wcTransaction) {
    throw new Error('Backend did not return proposal creation transaction');
  }

  const signResult = await wallet.signCashScriptTransaction(
    deserializeWcSignOptions(payload.wcTransaction as SerializedWcTransaction),
  );

  const confirmResponse = await fetch(`${apiUrl}/proposals/${proposalId}/confirm-create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
    body: JSON.stringify({
      txHash: signResult.signedTransactionHash,
      metadata,
    }),
  });

  if (!confirmResponse.ok) {
    const error = await confirmResponse.json().catch(() => ({ error: 'Failed to confirm proposal creation' }));
    throw new Error(error.error || 'Failed to confirm proposal creation');
  }

  return publishTransactionNotice(signResult.signedTransactionHash, wallet, 'Proposal created');
}

/**
 * Approve a proposal on-chain
 * @param wallet The wallet hook return value
 * @param proposalId The proposal ID
 * @param userPublicKey The user's public key (hex)
 * @returns Transaction ID
 */
export async function approveProposalOnChain(
  wallet: WalletInterface,
  proposalId: string,
  _userPublicKey: string,
  metadata?: { vaultId?: string; proposalId?: string }
): Promise<string> {
  if (!wallet.signCashScriptTransaction) {
    throw new Error('Connected wallet does not support CashScript transaction signing');
  }
  if (!wallet.address) {
    throw new Error('Wallet not connected');
  }

  // Get the unsigned transaction from backend
  const apiUrl = '/api';
  const response = await fetch(`${apiUrl}/proposals/${proposalId}/approve-onchain`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create approval transaction');
  }

  const payload = await response.json();
  if (!payload?.wcTransaction) {
    throw new Error('Backend did not return proposal approval transaction');
  }

  const signResult = await wallet.signCashScriptTransaction(
    deserializeWcSignOptions(payload.wcTransaction as SerializedWcTransaction),
  );

  const confirmResponse = await fetch(`${apiUrl}/proposals/${proposalId}/confirm-approval`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
    body: JSON.stringify({
      txHash: signResult.signedTransactionHash,
      metadata,
    }),
  });

  if (!confirmResponse.ok) {
    const error = await confirmResponse.json().catch(() => ({ error: 'Failed to confirm proposal approval' }));
    throw new Error(error.error || 'Failed to confirm proposal approval');
  }

  return publishTransactionNotice(signResult.signedTransactionHash, wallet, 'Proposal approved');
}

/**
 * Execute a payout on-chain
 * @param wallet The wallet hook return value
 * @param proposalId The proposal ID
 * @returns Transaction ID
 */
export async function executePayoutOnChain(
  wallet: WalletInterface,
  proposalId: string,
  metadata?: { vaultId?: string; proposalId?: string; amount?: number; toAddress?: string }
): Promise<{
  status: 'pending' | 'broadcasted';
  sessionId: string;
  signaturesCollected: number;
  requiredSignatures: number;
  txid?: string;
  remainingSigners?: string[];
}> {
  if (!wallet.signCashScriptTransaction) {
    throw new Error('Connected wallet does not support CashScript transaction signing');
  }
  if (!wallet.address) {
    throw new Error('Wallet not connected');
  }

  const apiUrl = '/api';
  const response = await fetch(`${apiUrl}/proposals/${proposalId}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
    body: JSON.stringify({ metadata }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create payout transaction');
  }

  const payload = await response.json();
  if (!payload?.wcTransaction || !payload?.sessionId) {
    throw new Error('Backend did not return execute signing session data');
  }

  const signOptions = deserializeWcSignOptions(payload.wcTransaction as SerializedWcTransaction);
  signOptions.broadcast = false;
  const signResult = await wallet.signCashScriptTransaction(signOptions);

  const submitResponse = await fetch(`${apiUrl}/proposals/${proposalId}/execute-signature`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
    body: JSON.stringify({
      sessionId: payload.sessionId,
      signedTransaction: signResult.signedTransaction,
    }),
  });

  if (!submitResponse.ok) {
    const error = await submitResponse.json();
    throw new Error(error.error || 'Failed to submit execute signature');
  }

  const submitResult = await submitResponse.json();
  if (submitResult.pending) {
    return {
      status: 'pending',
      sessionId: payload.sessionId,
      signaturesCollected: submitResult.signaturesCollected ?? 1,
      requiredSignatures: submitResult.requiredSignatures ?? 2,
      remainingSigners: submitResult.remainingSigners,
    };
  }

  return {
    status: 'broadcasted',
    sessionId: payload.sessionId,
    signaturesCollected: submitResult.signaturesCollected ?? 2,
    requiredSignatures: submitResult.requiredSignatures ?? 2,
    txid: publishTransactionNotice(
      submitResult.txid || signResult.signedTransactionHash,
      wallet,
      'Payout executed',
    ),
  };
}

/**
 * Unlock a cycle on-chain
 * @param wallet The wallet hook return value
 * @param vaultId The vault ID
 * @param cycleNumber The cycle number to unlock
 * @param userPublicKey The user's public key (hex)
 * @returns Transaction ID
 */
export async function unlockCycleOnChain(
  wallet: WalletInterface,
  vaultId: string,
  cycleNumber: number,
  _userPublicKey: string,
  metadata?: { vaultId?: string; amount?: number }
): Promise<string> {
  if (!wallet.address) {
    throw new Error('Wallet not connected');
  }

  // Get the unsigned transaction from backend
  const apiUrl = '/api';
  const response = await fetch(`${apiUrl}/vaults/${vaultId}/unlock-onchain`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
    body: JSON.stringify({ cycleNumber }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create unlock transaction');
  }

  const payload = await response.json();
  if (payload?.onChain === false || payload?.executionMode === 'policy') {
    // v2 vault cycle unlock updates policy state; no covenant tx exists to sign.
    return `policy-unlock:${vaultId}:${cycleNumber}:${Date.now()}`;
  }

  return signFromBackendPayload(wallet, payload, {
    txType: 'unlock',
    vaultId,
    ...metadata,
    fromAddress: wallet.address || undefined,
  });
}

/**
 * Deposit BCH to a vault contract
 * This is a simple P2PKH → P2SH send using the wallet's native send() method
 * @param wallet The wallet hook return value
 * @param contractAddress The vault contract address (P2SH)
 * @param amountBCH The amount to deposit in BCH
 * @param onConfirm Optional confirmation callback that returns a promise resolving to boolean
 * @returns Transaction ID
 */
export async function depositToVault(
  wallet: WalletInterface,
  contractAddress: string,
  amountBCH: number,
  onConfirm?: (details: { amount: number; recipient: string; network: 'mainnet' | 'testnet' | 'chipnet' }) => Promise<boolean>,
  vaultId?: string,
): Promise<string> {
  try {
    if (!wallet.address) {
      throw new Error('Wallet not connected');
    }

    if (amountBCH <= 0) {
      throw new Error('Deposit amount must be greater than 0');
    }

    // Convert BCH to satoshis
    const amountSatoshis = Math.round(amountBCH * 100000000);

    // Preferred path: backend-built WC transaction that initializes vault state NFT.
    if (vaultId) {
      try {
        const depositInfo = await getDepositInfo(vaultId, wallet.address);
        if (depositInfo?.wcTransaction && wallet.signCashScriptTransaction) {
          const signResult = await wallet.signCashScriptTransaction(
            deserializeWcSignOptions(depositInfo.wcTransaction as SerializedWcTransaction),
          );
          return publishTransactionNotice(signResult.signedTransactionHash, wallet, 'Vault funded');
        }

        const isInitialFunding = Number(depositInfo?.currentBalance || 0) <= 0 && Number(depositInfo?.amountToDeposit || 0) > 0;
        if (isInitialFunding) {
          if (!wallet.signCashScriptTransaction) {
            throw new Error(
              'This wallet cannot initialize a vault state NFT. ' +
              'Use a WalletConnect/CashScript-compatible wallet to fund new vaults.',
            );
          }
          throw new Error(
            depositInfo?.warning ||
            'Vault state-NFT bootstrap transaction could not be built for this wallet/address.',
          );
        }
      } catch (fundingError) {
        console.warn('[FlowGuard][VaultFunding] Failed to build state-NFT funding tx:', fundingError);
        throw fundingError;
      }
    }

    // For mainnet.cash wallets, show confirmation dialog if callback provided
    if (onConfirm && wallet.walletType === 'mainnet') {
      // Get network from wallet state (it's part of WalletState)
      const network = ((wallet as any).network || 'chipnet') as 'mainnet' | 'testnet' | 'chipnet';
      const confirmed = await onConfirm({
        amount: amountBCH,
        recipient: contractAddress,
        network,
      });

      if (!confirmed) {
        throw new Error('Transaction cancelled by user');
      }
    }

    // Use wallet's signTransaction method to send BCH
    // This will use the wallet's native send() method (mainnet.cash or extension)
    const transaction: Transaction = {
      to: contractAddress,
      amount: amountSatoshis,
    };

    const signedTx = await wallet.signTransaction(transaction);

    if (!signedTx.txId) {
      throw new Error('Transaction ID not returned from wallet');
    }

    return publishTransactionNotice(signedTx.txId, wallet, 'Vault funded');
  } catch (error: any) {
    console.error('Failed to deposit to vault:', error);

    // Provide more specific error messages
    if (error.message.includes('insufficient') || error.message.includes('balance')) {
      throw new Error('Insufficient balance in wallet. Please ensure you have enough BCH to cover the deposit and transaction fees.');
    }

    if (error.message.includes('user') || error.message.includes('cancel')) {
      throw new Error('Transaction cancelled by user');
    }

    throw new Error(`Deposit failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Get blockchain explorer URL for a transaction
 * @param txHash Transaction hash
 * @param network Network type (chipnet or mainnet)
 * @returns Explorer URL
 */
export function getExplorerTxUrl(txHash: string, network: 'chipnet' | 'mainnet' = 'chipnet'): string {
  if (network === 'mainnet') {
    return `https://blockchair.com/bitcoin-cash/transaction/${txHash}`;
  }
  return `https://chipnet.chaingraph.cash/tx/${txHash}`;
}

/**
 * Get blockchain explorer URL for an address
 * @param address BCH address (with or without prefix)
 * @param network Network type (chipnet or mainnet)
 * @returns Explorer URL
 */
export function getExplorerAddressUrl(address: string, network: 'chipnet' | 'mainnet' = 'chipnet'): string {
  // Keep the address as-is (with prefix if present)
  // chaingraph.cash expects full address with prefix
  if (network === 'mainnet') {
    return `https://blockchair.com/bitcoin-cash/address/${address}`;
  }
  return `https://chipnet.chaingraph.cash/address/${address}`;
}

/**
 * Fund a stream contract with initial deposit
 * @param wallet The wallet hook return value
 * @param streamId The stream ID to fund
 * @returns Transaction ID
 */
export async function fundStreamContract(
  wallet: WalletInterface,
  streamId: string
): Promise<string> {
  try {
    if (!wallet.address) {
      throw new Error('Wallet not connected');
    }

    // Get funding info from backend
    const apiUrl = '/api';
    const response = await fetch(`${apiUrl}/streams/${streamId}/funding-info`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get funding info');
    }

    const { wcTransaction } = await response.json();
    if (!wcTransaction || !wallet.signCashScriptTransaction) {
      throw new Error(
        'Stream funding requires a CashScript-compatible wallet transaction object from backend.'
      );
    }

    const signOptions = {
      ...deserializeWcSignOptions(wcTransaction),
      // Wallet-side broadcast can fail/hang on some BCH WC wallets.
      broadcast: false,
    };
    const signResult = await wallet.signCashScriptTransaction(signOptions);
    const txId = await resolveTxHashFromSignResult(signResult, signOptions, 'Stream funding signing failed');

    // Confirm funding with backend
    const confirmResponse = await fetch(`${apiUrl}/streams/${streamId}/confirm-funding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        txHash: txId,
      }),
    });

    if (!confirmResponse.ok) {
      const error = await confirmResponse.json();
      console.error('Failed to confirm funding, but transaction was broadcast:', error);
      // Still return txId even if confirmation fails
    }

    return publishTransactionNotice(txId, wallet, 'Stream funded');
  } catch (error: any) {
    console.error('Failed to fund stream:', error);

    if (error.message.includes('user') || error.message.includes('cancel')) {
      throw new Error('Transaction cancelled by user');
    }

    throw error;
  }
}

export async function fundBatchStreamContracts(
  wallet: WalletInterface,
  vaultId: string,
  payload: {
    senderAddress: string;
    tokenType: 'BCH' | 'FUNGIBLE_TOKEN';
    tokenCategory?: string;
    launchContext?: {
      source: string;
      title?: string;
      description?: string;
      preferredLane?: string;
    };
    entries: Array<{
      recipient: string;
      totalAmount: number;
      streamType: 'LINEAR' | 'RECURRING' | 'STEP' | 'TRANCHE' | 'HYBRID';
      startTime: number;
      endTime?: number;
      cliffTimestamp?: number | null;
      cancelable: boolean;
      refillable?: boolean;
      description?: string | null;
      intervalSeconds?: number;
      hybridUnlockTimestamp?: number;
      hybridUpfrontPercentage?: number;
      scheduleTemplate?: string | null;
      trancheSchedule?: Array<{
        unlockTime: number;
        amount: number;
        percentage?: number;
      }>;
    }>;
  },
): Promise<{ txId: string; streamIds: string[] }> {
  try {
    if (!wallet.address) {
      throw new Error('Wallet not connected');
    }

    const response = await fetch(`/api/treasuries/${vaultId}/batch-create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || 'Failed to build batch stream transaction');
    }

    if (!data.wcTransaction || !wallet.signCashScriptTransaction) {
      throw new Error('Batch stream funding requires a CashScript-compatible wallet');
    }

    const signOptions = {
      ...deserializeWcSignOptions(data.wcTransaction),
      broadcast: false,
    };
    const signResult = await wallet.signCashScriptTransaction(signOptions);
    const txId = await resolveTxHashFromSignResult(
      signResult,
      signOptions,
      'Batch stream funding signing failed',
    );

    const streamIds = Array.isArray(data.streams)
      ? data.streams.map((stream: { id: string }) => stream.id)
      : [];

    const confirmResponse = await fetch(`/api/treasuries/${vaultId}/batch-create/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        txHash: txId,
        streamIds,
      }),
    });

    if (!confirmResponse.ok) {
      const error = await confirmResponse.json();
      console.error('Failed to confirm batch stream funding, but transaction was broadcast:', error);
    }

    publishTransactionNotice(txId, wallet, 'Batch streams funded');
    return { txId, streamIds };
  } catch (error: any) {
    console.error('Failed to fund batch stream contracts:', error);

    if (error.message.includes('user') || error.message.includes('cancel')) {
      throw new Error('Transaction cancelled by user');
    }

    throw error;
  }
}

/**
 * Claim vested funds from a stream
 * @param wallet The wallet hook return value
 * @param streamId The stream ID to claim from
 * @returns Transaction ID
 */
export async function claimStreamFunds(
  wallet: WalletInterface,
  streamId: string
): Promise<string> {
  try {
    if (!wallet.address) {
      throw new Error('Wallet not connected');
    }

    // Get claim transaction from backend
    const apiUrl = '/api';
    const response = await fetch(`${apiUrl}/streams/${streamId}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipientAddress: wallet.address,
        signerAddress: wallet.address,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to build claim transaction');
    }

    const { claimableAmount, wcTransaction } = await response.json();

    if (claimableAmount <= 0) {
      throw new Error('No funds available to claim at this time');
    }

    if (!wcTransaction) throw new Error('No transaction returned from backend');
    if (!wallet.signCashScriptTransaction) {
      throw new Error('Connected wallet does not support CashScript transactions');
    }

    const signResult = await wallet.signCashScriptTransaction(deserializeWcSignOptions(wcTransaction));
    const txId = signResult.signedTransactionHash;

    // Confirm claim with backend
    const confirmResponse = await fetch(`${apiUrl}/streams/${streamId}/confirm-claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        claimedAmount: claimableAmount,
        txHash: txId,
      }),
    });

    if (!confirmResponse.ok) {
      const error = await confirmResponse.json();
      console.error('Failed to confirm claim, but transaction was broadcast:', error);
    }

    return publishTransactionNotice(txId, wallet, 'Stream claim');
  } catch (error: any) {
    console.error('Failed to claim stream:', error);

    if (error.message.includes('No funds available')) {
      throw new Error('No funds available to claim yet. Please wait for vesting schedule.');
    }

    if (error.message.includes('user') || error.message.includes('cancel')) {
      throw new Error('Transaction cancelled by user');
    }

    throw new Error(`Claim failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Pause a stream on-chain.
 */
export async function pauseStreamOnChain(
  wallet: WalletInterface,
  streamId: string
): Promise<string> {
  if (!wallet.address) {
    throw new Error('Wallet not connected');
  }
  if (!wallet.signCashScriptTransaction) {
    throw new Error('Connected wallet does not support CashScript transactions');
  }

  const apiUrl = '/api';
  const response = await fetch(`${apiUrl}/streams/${streamId}/pause`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to build pause transaction' }));
    throw new Error(getApiErrorMessage(error, 'Failed to build pause transaction'));
  }

  const { wcTransaction } = await response.json();
  if (!wcTransaction) {
    throw new Error('Backend did not return pause transaction');
  }

  const signOptions = deserializeWcSignOptions(wcTransaction);
  const signResult = await wallet.signCashScriptTransaction(signOptions);
  const txHash = await resolveTxHashFromSignResult(signResult, signOptions, 'Stream pause signing failed');

  const confirmResponse = await fetch(`${apiUrl}/streams/${streamId}/confirm-pause`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
    body: JSON.stringify({ txHash }),
  });
  if (!confirmResponse.ok) {
    const error = await confirmResponse.json().catch(() => ({ error: 'Failed to confirm pause transaction' }));
    throw new Error(getApiErrorMessage(error, 'Failed to confirm pause transaction'));
  }

  return publishTransactionNotice(txHash, wallet, 'Stream paused');
}

/**
 * Resume a paused stream on-chain.
 */
export async function resumeStreamOnChain(
  wallet: WalletInterface,
  streamId: string
): Promise<string> {
  if (!wallet.address) {
    throw new Error('Wallet not connected');
  }
  if (!wallet.signCashScriptTransaction) {
    throw new Error('Connected wallet does not support CashScript transactions');
  }

  const apiUrl = '/api';
  const response = await fetch(`${apiUrl}/streams/${streamId}/resume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to build resume transaction' }));
    throw new Error(getApiErrorMessage(error, 'Failed to build resume transaction'));
  }

  const { wcTransaction } = await response.json();
  if (!wcTransaction) {
    throw new Error('Backend did not return resume transaction');
  }

  const signOptions = deserializeWcSignOptions(wcTransaction);
  const signResult = await wallet.signCashScriptTransaction(signOptions);
  const txHash = await resolveTxHashFromSignResult(signResult, signOptions, 'Stream resume signing failed');

  const confirmResponse = await fetch(`${apiUrl}/streams/${streamId}/confirm-resume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
    body: JSON.stringify({ txHash }),
  });
  if (!confirmResponse.ok) {
    const error = await confirmResponse.json().catch(() => ({ error: 'Failed to confirm resume transaction' }));
    throw new Error(getApiErrorMessage(error, 'Failed to confirm resume transaction'));
  }

  return publishTransactionNotice(txHash, wallet, 'Stream resumed');
}

/**
 * Refill an open-ended recurring stream with additional BCH/token runway.
 */
export async function refillStreamOnChain(
  wallet: WalletInterface,
  streamId: string,
  refillAmount: number,
): Promise<string> {
  if (!wallet.address) {
    throw new Error('Wallet not connected');
  }
  if (!wallet.signCashScriptTransaction) {
    throw new Error('Connected wallet does not support CashScript transactions');
  }
  if (!Number.isFinite(refillAmount) || refillAmount <= 0) {
    throw new Error('Refill amount must be greater than zero');
  }

  const apiUrl = '/api';
  const response = await fetch(`${apiUrl}/streams/${streamId}/refill`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
    body: JSON.stringify({ refillAmount }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to build refill transaction' }));
    throw new Error(getApiErrorMessage(error, 'Failed to build refill transaction'));
  }

  const { wcTransaction } = await response.json();
  if (!wcTransaction) {
    throw new Error('Backend did not return refill transaction');
  }

  const signOptions = deserializeWcSignOptions(wcTransaction);
  const signResult = await wallet.signCashScriptTransaction(signOptions);
  const txHash = await resolveTxHashFromSignResult(signResult, signOptions, 'Stream refill signing failed');

  const confirmResponse = await fetch(`${apiUrl}/streams/${streamId}/confirm-refill`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
    body: JSON.stringify({ txHash, refillAmount }),
  });
  if (!confirmResponse.ok) {
    const error = await confirmResponse.json().catch(() => ({ error: 'Failed to confirm refill transaction' }));
    throw new Error(getApiErrorMessage(error, 'Failed to confirm refill transaction'));
  }

  return publishTransactionNotice(txHash, wallet, 'Stream refilled');
}

/**
 * Transfer a transferable vesting stream to a new recipient.
 */
export async function transferStreamOnChain(
  wallet: WalletInterface,
  streamId: string,
  newRecipientAddress: string
): Promise<string> {
  if (!wallet.address) {
    throw new Error('Wallet not connected');
  }
  if (!wallet.signCashScriptTransaction) {
    throw new Error('Connected wallet does not support CashScript transactions');
  }

  const apiUrl = '/api';
  const response = await fetch(`${apiUrl}/streams/${streamId}/transfer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
    body: JSON.stringify({ newRecipientAddress }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to build transfer transaction' }));
    throw new Error(getApiErrorMessage(error, 'Failed to build transfer transaction'));
  }

  const { wcTransaction } = await response.json();
  if (!wcTransaction) {
    throw new Error('Backend did not return transfer transaction');
  }

  const signOptions = deserializeWcSignOptions(wcTransaction);
  const signResult = await wallet.signCashScriptTransaction(signOptions);
  const txHash = await resolveTxHashFromSignResult(signResult, signOptions, 'Stream transfer signing failed');

  const confirmResponse = await fetch(`${apiUrl}/streams/${streamId}/confirm-transfer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
    body: JSON.stringify({ txHash, newRecipientAddress }),
  });
  if (!confirmResponse.ok) {
    const error = await confirmResponse.json().catch(() => ({ error: 'Failed to confirm transfer transaction' }));
    throw new Error(getApiErrorMessage(error, 'Failed to confirm transfer transaction'));
  }

  return publishTransactionNotice(txHash, wallet, 'Stream transferred');
}

/**
 * Fund a recurring payment contract with initial deposit
 * @param wallet The wallet hook return value
 * @param paymentId The payment ID to fund
 * @returns Transaction ID
 */
export async function fundPaymentContract(
  wallet: WalletInterface,
  paymentId: string
): Promise<string> {
  let preparationTxId: string | null = null;
  try {
    if (!wallet.address) {
      throw new Error('Wallet not connected');
    }

    const apiUrl = '/api';

    const fetchFundingInfo = async () => {
      const response = await fetch(`${apiUrl}/payments/${paymentId}/funding-info`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get funding info');
      }

      return response.json();
    };

    let data = await fetchFundingInfo();

    if (data.requiresPreparation && data.preparationTransaction) {
      console.log('[FlowGuard] Wallet needs consolidation for token creation, signing prep tx...');
      const prepOptions = {
        ...deserializeWcSignOptions(data.preparationTransaction),
        // Wallet-side broadcast can fail/hang on some BCH WC wallets.
        broadcast: false,
      };
      const prepResult = await wallet.signCashScriptTransaction!(prepOptions);
      preparationTxId = await resolveTxHashFromSignResult(prepResult, prepOptions, 'Preparation signing failed');
      console.log('[FlowGuard] Consolidation tx broadcast:', preparationTxId);
      publishTransactionNotice(preparationTxId, wallet, 'Token preparation');

      await new Promise(resolve => setTimeout(resolve, 8000));
      data = await fetchFundingInfo();
    }

    const { wcTransaction } = data;
    if (!wcTransaction || !wallet.signCashScriptTransaction) {
      throw new Error(
        'Payment funding requires a CashScript-compatible wallet transaction object from backend.'
      );
    }

    const signOptions = {
      ...deserializeWcSignOptions(wcTransaction),
      // Wallet-side broadcast can fail/hang on some BCH WC wallets.
      broadcast: false,
    };
    const signResult = await wallet.signCashScriptTransaction(signOptions);
    const txId = await resolveTxHashFromSignResult(signResult, signOptions, 'Payment funding signing failed');
    console.log('[FlowGuard] Payment signed successfully, tx hash:', txId);
    let confirmError: string | null = null;
    for (let attempt = 1; attempt <= 6; attempt++) {
      const confirmResponse = await fetch(`${apiUrl}/payments/${paymentId}/confirm-funding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: txId }),
      });

      if (confirmResponse.ok) {
        confirmError = null;
        break;
      }

      const error = await confirmResponse.json().catch(() => ({ error: 'Failed to confirm funding transaction' }));
      confirmError = getApiErrorMessage(error, 'Failed to confirm funding transaction');

      if (attempt < 6) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    if (confirmError) {
      publishTransactionNotice(txId, wallet, 'Payment funding broadcast');
      throw new Error(`Transaction broadcast (${txId}) but confirmation failed: ${confirmError}`);
    }

    return publishTransactionNotice(txId, wallet, 'Payment funded');
  } catch (error: any) {
    console.error('Failed to fund payment:', error);

    if (error.message.includes('user') || error.message.includes('cancel')) {
      throw new Error('Transaction cancelled by user');
    }

    const details = error?.message || 'Unknown error';
    if (preparationTxId && /transaction signing failed: internal error/i.test(details)) {
      throw new Error(
        `Preparation transaction broadcast (${preparationTxId}), but the wallet has not indexed the new UTXO yet. ` +
        'Wait 15-30 seconds, refresh, then click Fund again.'
      );
    }
    if (preparationTxId) {
      throw new Error(`${details}. Preparation tx broadcast: ${preparationTxId}`);
    }
    throw error;
  }
}

/**
 * Claim interval payment
 * @param wallet The wallet hook return value
 * @param paymentId The payment ID to claim from
 * @returns Transaction ID
 */
export async function claimPaymentFunds(
  wallet: WalletInterface,
  paymentId: string
): Promise<string> {
  try {
    if (!wallet.address) {
      throw new Error('Wallet not connected');
    }

    // Get claim transaction from backend
    const apiUrl = '/api';
    const response = await fetch(`${apiUrl}/payments/${paymentId}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipientAddress: wallet.address,
        signerAddress: wallet.address,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to build claim transaction');
    }

    const { claimableAmount, intervalsClaimable, wcTransaction } = await response.json();

    if (claimableAmount <= 0) {
      throw new Error('No payment intervals available to claim at this time');
    }

    if (!wallet.signCashScriptTransaction || !wcTransaction) {
      throw new Error('No WalletConnect-compatible claim transaction returned from backend');
    }

    const signResult = await wallet.signCashScriptTransaction(deserializeWcSignOptions(wcTransaction));
    const txId = signResult.signedTransactionHash;

    const confirmResponse = await fetch(`${apiUrl}/payments/${paymentId}/confirm-claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        claimedAmount: claimableAmount,
        intervalsClaimed: intervalsClaimable,
        txHash: txId,
      }),
    });

    if (!confirmResponse.ok) {
      const error = await confirmResponse.json();
      console.error('Failed to confirm payment claim, but transaction was broadcast:', error);
    }

    return publishTransactionNotice(txId, wallet, 'Payment claim');
  } catch (error: any) {
    console.error('Failed to claim payment:', error);

    if (error.message.includes('No payment intervals available')) {
      throw new Error('No payment intervals available to claim yet. Please wait for next payment date.');
    }

    if (error.message.includes('user') || error.message.includes('cancel')) {
      throw new Error('Transaction cancelled by user');
    }

    throw new Error(`Claim failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Pause a recurring payment on-chain.
 */
export async function pausePaymentOnChain(
  wallet: WalletInterface,
  paymentId: string
): Promise<string> {
  if (!wallet.address) {
    throw new Error('Wallet not connected');
  }
  if (!wallet.signCashScriptTransaction) {
    throw new Error('Connected wallet does not support CashScript transactions');
  }

  const apiUrl = '/api';
  const response = await fetch(`${apiUrl}/payments/${paymentId}/pause`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to build pause transaction' }));
    throw new Error(getApiErrorMessage(error, 'Failed to build pause transaction'));
  }

  const { wcTransaction } = await response.json();
  if (!wcTransaction) {
    throw new Error('Backend did not return pause transaction');
  }

  const signOptions = deserializeWcSignOptions(wcTransaction);
  const signResult = await wallet.signCashScriptTransaction(signOptions);
  const txHash = await resolveTxHashFromSignResult(signResult, signOptions, 'Payment pause signing failed');

  const confirmResponse = await fetch(`${apiUrl}/payments/${paymentId}/confirm-pause`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash }),
  });
  if (!confirmResponse.ok) {
    const error = await confirmResponse.json().catch(() => ({ error: 'Failed to confirm pause transaction' }));
    throw new Error(getApiErrorMessage(error, 'Failed to confirm pause transaction'));
  }

  return publishTransactionNotice(txHash, wallet, 'Payment paused');
}

/**
 * Resume a recurring payment on-chain.
 */
export async function resumePaymentOnChain(
  wallet: WalletInterface,
  paymentId: string
): Promise<string> {
  if (!wallet.address) {
    throw new Error('Wallet not connected');
  }
  if (!wallet.signCashScriptTransaction) {
    throw new Error('Connected wallet does not support CashScript transactions');
  }

  const apiUrl = '/api';
  const response = await fetch(`${apiUrl}/payments/${paymentId}/resume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to build resume transaction' }));
    throw new Error(error.error || error.message || 'Failed to build resume transaction');
  }

  const { wcTransaction } = await response.json();
  if (!wcTransaction) {
    throw new Error('Backend did not return resume transaction');
  }

  const signResult = await wallet.signCashScriptTransaction(deserializeWcSignOptions(wcTransaction));
  const txHash = signResult.signedTransactionHash;

  const confirmResponse = await fetch(`${apiUrl}/payments/${paymentId}/confirm-resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash }),
  });
  if (!confirmResponse.ok) {
    const error = await confirmResponse.json().catch(() => ({ error: 'Failed to confirm resume transaction' }));
    throw new Error(error.error || error.message || 'Failed to confirm resume transaction');
  }

  return publishTransactionNotice(txHash, wallet, 'Payment resumed');
}

/**
 * Cancel a recurring payment on-chain.
 */
export async function cancelPaymentOnChain(
  wallet: WalletInterface,
  paymentId: string
): Promise<string> {
  if (!wallet.address) {
    throw new Error('Wallet not connected');
  }
  if (!wallet.signCashScriptTransaction) {
    throw new Error('Connected wallet does not support CashScript transactions');
  }

  const apiUrl = '/api';
  const response = await fetch(`${apiUrl}/payments/${paymentId}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to build cancel transaction' }));
    throw new Error(getApiErrorMessage(error, 'Failed to build cancel transaction'));
  }

  const { wcTransaction } = await response.json();
  if (!wcTransaction) {
    throw new Error('Backend did not return cancel transaction');
  }

  const signOptions = deserializeWcSignOptions(wcTransaction);
  const signResult = await wallet.signCashScriptTransaction(signOptions);
  const txHash = await resolveTxHashFromSignResult(signResult, signOptions, 'Payment cancel signing failed');

  const confirmResponse = await fetch(`${apiUrl}/payments/${paymentId}/confirm-cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash }),
  });
  if (!confirmResponse.ok) {
    const error = await confirmResponse.json().catch(() => ({ error: 'Failed to confirm cancel transaction' }));
    throw new Error(getApiErrorMessage(error, 'Failed to confirm cancel transaction'));
  }

  return publishTransactionNotice(txHash, wallet, 'Payment cancelled');
}

/**
 * Pause an airdrop campaign on-chain.
 */
export async function pauseAirdropOnChain(
  wallet: WalletInterface,
  airdropId: string
): Promise<string> {
  const signerAddress = await resolveWalletAddress(wallet);
  if (!wallet.signCashScriptTransaction) {
    throw new Error('Connected wallet does not support CashScript transactions');
  }

  const apiUrl = '/api';
  const response = await fetch(`${apiUrl}/airdrops/${airdropId}/pause`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': signerAddress,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to build pause transaction' }));
    throw new Error(getApiErrorMessage(error, 'Failed to build pause transaction'));
  }

  const { wcTransaction } = await response.json();
  if (!wcTransaction) {
    throw new Error('Backend did not return pause transaction');
  }

  const signOptions = {
    ...deserializeWcSignOptions(wcTransaction),
    // Wallet-side broadcast can hang on some BCH WC wallets; broadcast from backend instead.
    broadcast: false,
  };
  const signResult = await wallet.signCashScriptTransaction(signOptions);
  const txHash = await resolveTxHashFromSignResult(signResult, signOptions, 'Airdrop pause signing failed');

  const confirmResponse = await fetch(`${apiUrl}/airdrops/${airdropId}/confirm-pause`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': signerAddress,
    },
    body: JSON.stringify({ txHash }),
  });
  if (!confirmResponse.ok) {
    const error = await confirmResponse.json().catch(() => ({ error: 'Failed to confirm pause transaction' }));
    throw new Error(getApiErrorMessage(error, 'Failed to confirm pause transaction'));
  }

  return publishTransactionNotice(txHash, wallet, 'Airdrop paused');
}

/**
 * Cancel an airdrop campaign on-chain.
 */
export async function cancelAirdropOnChain(
  wallet: WalletInterface,
  airdropId: string,
  options?: { allowUnsafeRecovery?: boolean }
): Promise<string> {
  const signerAddress = await resolveWalletAddress(wallet);
  if (!wallet.signCashScriptTransaction) {
    throw new Error('Connected wallet does not support CashScript transactions');
  }

  const apiUrl = '/api';
  const response = await fetch(`${apiUrl}/airdrops/${airdropId}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': signerAddress,
    },
    body: JSON.stringify({
      allowUnsafeRecovery: options?.allowUnsafeRecovery === true,
    }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to build cancel transaction' }));
    throw new Error(getApiErrorMessage(error, 'Failed to build cancel transaction'));
  }

  const { wcTransaction } = await response.json();
  if (!wcTransaction) {
    throw new Error('Backend did not return cancel transaction');
  }

  const signOptions = {
    ...deserializeWcSignOptions(wcTransaction),
    // Wallet-side broadcast can hang on some BCH WC wallets; broadcast from backend instead.
    broadcast: false,
  };
  const signResult = await wallet.signCashScriptTransaction(signOptions);
  const txHash = await resolveTxHashFromSignResult(signResult, signOptions, 'Airdrop cancel signing failed');

  const confirmResponse = await fetch(`${apiUrl}/airdrops/${airdropId}/confirm-cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': signerAddress,
    },
    body: JSON.stringify({ txHash }),
  });
  if (!confirmResponse.ok) {
    const error = await confirmResponse.json().catch(() => ({ error: 'Failed to confirm cancel transaction' }));
    throw new Error(getApiErrorMessage(error, 'Failed to confirm cancel transaction'));
  }

  return publishTransactionNotice(txHash, wallet, 'Airdrop cancelled');
}

/**
 * Fund an airdrop contract with tokens
 * @param wallet The wallet hook return value
 * @param airdropId The airdrop campaign ID to fund
 * @returns Transaction ID
 */
export async function fundAirdropContract(
  wallet: WalletInterface,
  airdropId: string
): Promise<string> {
  let preparationTxId: string | null = null;
  try {
    if (!wallet.address) {
      throw new Error('Wallet not connected');
    }

    const apiUrl = '/api';

    const fetchFundingInfo = async () => {
      const response = await fetch(`${apiUrl}/airdrops/${airdropId}/funding-info`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get funding info');
      }

      return response.json();
    };

    let data = await fetchFundingInfo();

    if (data.requiresPreparation && data.preparationTransaction) {
      console.log('[FlowGuard] Wallet needs consolidation for token creation, signing prep tx...');
      const prepOptions = {
        ...deserializeWcSignOptions(data.preparationTransaction),
        // Wallet-side broadcast can fail/hang on some BCH WC wallets.
        broadcast: false,
      };
      const prepResult = await wallet.signCashScriptTransaction!(prepOptions);
      preparationTxId = await resolveTxHashFromSignResult(prepResult, prepOptions, 'Preparation signing failed');
      console.log('[FlowGuard] Consolidation tx broadcast:', preparationTxId);
      publishTransactionNotice(preparationTxId, wallet, 'Token preparation');

      await new Promise(resolve => setTimeout(resolve, 8000));
      data = await fetchFundingInfo();
    }

    const { wcTransaction } = data;
    if (!wcTransaction || !wallet.signCashScriptTransaction) {
      throw new Error(
        'Airdrop funding requires a CashScript-compatible wallet transaction object from backend.'
      );
    }

    const signOptions = {
      ...deserializeWcSignOptions(wcTransaction),
      // Wallet-side broadcast can fail/hang on some BCH WC wallets.
      broadcast: false,
    };
    const signResult = await wallet.signCashScriptTransaction(signOptions);
    const txId = await resolveTxHashFromSignResult(signResult, signOptions, 'Airdrop funding signing failed');
    console.log('[FlowGuard] Airdrop funding tx hash:', txId);
    let confirmError: string | null = null;
    for (let attempt = 1; attempt <= 6; attempt++) {
      const confirmResponse = await fetch(`${apiUrl}/airdrops/${airdropId}/confirm-funding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: txId }),
      });

      if (confirmResponse.ok) {
        confirmError = null;
        break;
      }

      const error = await confirmResponse.json().catch(() => ({ error: 'Failed to confirm funding transaction' }));
      confirmError = getApiErrorMessage(error, 'Failed to confirm funding transaction');

      if (attempt < 6) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    if (confirmError) {
      publishTransactionNotice(txId, wallet, 'Airdrop funding broadcast');
      throw new Error(`Transaction broadcast (${txId}) but confirmation failed: ${confirmError}`);
    }

    return publishTransactionNotice(txId, wallet, 'Airdrop funded');
  } catch (error: any) {
    console.error('Failed to fund airdrop:', error);

    if (error.message.includes('insufficient') || error.message.includes('balance')) {
      throw new Error('Insufficient balance in wallet');
    }

    if (error.message.includes('user') || error.message.includes('cancel')) {
      throw new Error('Transaction cancelled by user');
    }

    const details = error.message || 'Unknown error';
    if (preparationTxId && /transaction signing failed: internal error/i.test(details)) {
      throw new Error(
        `Preparation transaction broadcast (${preparationTxId}), but the wallet has not indexed the new UTXO yet. ` +
        'Wait 15-30 seconds, refresh, then click Fund again.'
      );
    }
    if (preparationTxId) {
      throw new Error(`Funding failed: ${details}. Preparation tx broadcast: ${preparationTxId}`);
    }
    throw new Error(`Funding failed: ${details}`);
  }
}

/**
 * Claim from an airdrop with merkle proof
 * @param wallet The wallet hook return value
 * @param airdropId The airdrop campaign ID to claim from
 * @returns Transaction ID
 */
export async function claimAirdropFunds(
  wallet: WalletInterface,
  airdropId: string,
  claimerAddressOverride?: string
): Promise<string> {
  try {
    const signerAddress = await resolveWalletAddress(wallet);
    const claimerAddress = claimerAddressOverride || signerAddress;

    // Get claim transaction from backend
    const apiUrl = '/api';
    const response = await fetch(`${apiUrl}/airdrops/${airdropId}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': signerAddress,
      },
      body: JSON.stringify({
        claimerAddress,
        signerAddress,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to build claim transaction' }));
      throw new Error(getApiErrorMessage(error, 'Failed to build claim transaction'));
    }

    const { claimAmount, wcTransaction } = await response.json();

    if (claimAmount <= 0) {
      throw new Error('No airdrop allocation available for this address');
    }

    if (!wallet.signCashScriptTransaction || !wcTransaction) {
      throw new Error('No WalletConnect-compatible claim transaction returned from backend');
    }

    const signOptions = {
      ...deserializeWcSignOptions(wcTransaction),
      // Wallet-side broadcast can hang on some BCH WC wallets; broadcast from backend instead.
      broadcast: false,
    };
    const signResult = await wallet.signCashScriptTransaction(signOptions);
    const txId = await resolveTxHashFromSignResult(signResult, signOptions, 'Airdrop claim signing failed');

    const confirmResponse = await fetch(`${apiUrl}/airdrops/${airdropId}/confirm-claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        claimerAddress,
        claimedAmount: claimAmount,
        txHash: txId,
      }),
    });

    if (!confirmResponse.ok) {
      const error = await confirmResponse.json();
      console.error('Failed to confirm airdrop claim, but transaction was broadcast:', error);
    }

    return publishTransactionNotice(txId, wallet, 'Airdrop claim');
  } catch (error: any) {
    console.error('Failed to claim airdrop:', error);

    if (error.message.includes('No airdrop allocation')) {
      throw new Error('This address is not eligible for this airdrop');
    }

    if (error.message.includes('user') || error.message.includes('cancel')) {
      throw new Error('Transaction cancelled by user');
    }

    throw new Error(`Claim failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Lock tokens to vote on a governance proposal
 * @param wallet The wallet hook return value
 * @param proposalId The proposal ID to vote on
 * @param voteChoice Vote choice: 'FOR', 'AGAINST', or 'ABSTAIN'
 * @param stakeAmount Amount of tokens to stake (in satoshis for BCH)
 * @param tokenCategory Optional token category for governance tokens
 * @returns Transaction ID
 */
export async function lockTokensToVote(
  wallet: WalletInterface,
  proposalId: string,
  voteChoice: 'FOR' | 'AGAINST' | 'ABSTAIN',
  stakeAmount: number,
  tokenCategory?: string
): Promise<string> {
  try {
    if (!wallet.address) {
      throw new Error('Wallet not connected');
    }

    if (stakeAmount <= 0) {
      throw new Error('Stake amount must be greater than 0');
    }

    // Get lock transaction from backend
    const apiUrl = '/api';
    const response = await fetch(`${apiUrl}/governance/${proposalId}/lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        voterAddress: wallet.address,
        voteChoice,
        stakeAmount,
        tokenCategory,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to build lock transaction');
    }

    const { deployment, wcTransaction } = await response.json();

    if (!wcTransaction) throw new Error('No lock transaction returned from backend');
    if (!wallet.signCashScriptTransaction) {
      throw new Error('Connected wallet does not support CashScript transactions');
    }

    const signResult = await wallet.signCashScriptTransaction(deserializeWcSignOptions(wcTransaction));
    const txId = signResult.signedTransactionHash;

    // Confirm lock with backend — store contract data so unlock can reconstruct it
    const confirmResponse = await fetch(`${apiUrl}/governance/${proposalId}/confirm-lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        voterAddress: wallet.address,
        voteChoice,
        weight: stakeAmount,
        txHash: txId,
        contractAddress: deployment.contractAddress,
        voteId: deployment.voteId,
        constructorParams: deployment.constructorParams,
        nftCommitment: deployment.initialCommitment,
      }),
    });

    if (!confirmResponse.ok) {
      const error = await confirmResponse.json();
      console.error('Failed to confirm lock, but transaction was broadcast:', error);
    }

    return publishTransactionNotice(txId, wallet, 'Vote locked');
  } catch (error: any) {
    console.error('Failed to lock tokens:', error);

    if (error.message.includes('insufficient') || error.message.includes('balance')) {
      throw new Error('Insufficient balance to lock tokens');
    }

    if (error.message.includes('user') || error.message.includes('cancel')) {
      throw new Error('Transaction cancelled by user');
    }

    throw new Error(`Lock failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Unlock staked tokens after voting period ends
 * @param wallet The wallet hook return value
 * @param proposalId The proposal ID to unlock from
 * @param contractAddress The vote lock contract address
 * @param stakeAmount Amount that was staked
 * @param tokenCategory Optional token category
 * @returns Transaction ID
 */
export async function unlockVotingTokens(
  wallet: WalletInterface,
  proposalId: string,
  contractAddress: string,
  stakeAmount: number,
  tokenCategory?: string
): Promise<string> {
  try {
    if (!wallet.address) {
      throw new Error('Wallet not connected');
    }

    // Get unlock transaction from backend
    const apiUrl = '/api';
    const response = await fetch(`${apiUrl}/governance/${proposalId}/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        voterAddress: wallet.address,
        contractAddress,
        stakeAmount,
        tokenCategory,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to build unlock transaction');
    }

    const { unlockTransaction } = await response.json();

    if (!unlockTransaction?.wcTransaction) throw new Error('No unlock transaction returned from backend');
    if (!wallet.signCashScriptTransaction) {
      throw new Error('Connected wallet does not support CashScript transactions');
    }

    const signResult = await wallet.signCashScriptTransaction(
      deserializeWcSignOptions(unlockTransaction.wcTransaction),
    );
    const txId = signResult.signedTransactionHash;

    // Confirm unlock with backend
    const confirmResponse = await fetch(`${apiUrl}/governance/${proposalId}/confirm-unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        voterAddress: wallet.address,
        txHash: txId,
      }),
    });

    if (!confirmResponse.ok) {
      const error = await confirmResponse.json();
      console.error('Failed to confirm unlock, but transaction was broadcast:', error);
    }

    return publishTransactionNotice(txId, wallet, 'Vote unlocked');
  } catch (error: any) {
    console.error('Failed to unlock tokens:', error);

    if (error.message.includes('Voting period') || error.message.includes('not ended')) {
      throw new Error('Voting period has not ended yet. Please wait until voting completes.');
    }

    if (error.message.includes('user') || error.message.includes('cancel')) {
      throw new Error('Transaction cancelled by user');
    }

    throw new Error(`Unlock failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Fund a budget plan contract
 * @param wallet The wallet hook return value
 * @param budgetId The budget plan ID to fund
 * @returns Transaction ID
 */
export async function fundBudgetPlan(
  wallet: WalletInterface,
  budgetId: string
): Promise<string> {
  try {
    if (!wallet.address) {
      throw new Error('Wallet not connected');
    }

    // Get funding info from backend
    const apiUrl = '/api';
    const response = await fetch(`${apiUrl}/budget-plans/${budgetId}/funding-info`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': wallet.address,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get funding info');
    }

    const { wcTransaction } = await response.json();
    if (!wcTransaction || !wallet.signCashScriptTransaction) {
      throw new Error(
        'Budget funding requires a CashScript-compatible wallet transaction object from backend.'
      );
    }

    const signOptions = {
      ...deserializeWcSignOptions(wcTransaction),
      // Wallet-side broadcast can fail/hang on some BCH WC wallets.
      broadcast: false,
    };
    const signResult = await wallet.signCashScriptTransaction(signOptions);
    const txId = await resolveTxHashFromSignResult(signResult, signOptions, 'Budget funding signing failed');

    // Confirm funding with backend
    const confirmResponse = await fetch(`${apiUrl}/budget-plans/${budgetId}/confirm-funding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        txHash: txId,
      }),
    });

    if (!confirmResponse.ok) {
      const error = await confirmResponse.json();
      console.error('Failed to confirm funding, but transaction was broadcast:', error);
    }

    return publishTransactionNotice(txId, wallet, 'Budget funded');
  } catch (error: any) {
    console.error('Failed to fund budget plan:', error);

    if (error.message.includes('insufficient') || error.message.includes('balance')) {
      throw new Error('Insufficient balance in wallet');
    }

    if (error.message.includes('user') || error.message.includes('cancel')) {
      throw new Error('Transaction cancelled by user');
    }

    throw new Error(`Funding failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Release milestone from budget plan
 * @param wallet The wallet hook return value
 * @param budgetId The budget plan ID to release from
 * @returns Transaction ID
 */
export async function releaseMilestone(
  wallet: WalletInterface,
  budgetId: string
): Promise<string> {
  try {
    if (!wallet.address) {
      throw new Error('Wallet not connected');
    }

    // Get release transaction from backend
    const apiUrl = '/api';
    const response = await fetch(`${apiUrl}/budget-plans/${budgetId}/release`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipientAddress: wallet.address,
        signerAddress: wallet.address,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to build release transaction');
    }

    const { releasableAmount, milestonesReleasable, wcTransaction } = await response.json();

    if (releasableAmount <= 0) {
      throw new Error('No milestones available to release yet');
    }

    if (!wallet.signCashScriptTransaction || !wcTransaction) {
      throw new Error(
        'Milestone release signing is not wired for this wallet yet. ' +
        'Backend must return a WalletConnect-compatible transaction object.'
      );
    }

    console.log('Milestone release transaction ready:', { releasableAmount, milestonesReleasable });
    const signResult = await wallet.signCashScriptTransaction(deserializeWcSignOptions(wcTransaction));
    const txId = signResult.signedTransactionHash;

    // Confirm release with backend
    const confirmResponse = await fetch(`${apiUrl}/budget-plans/${budgetId}/confirm-release`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        releasedAmount: releasableAmount,
        txHash: txId,
      }),
    });

    if (!confirmResponse.ok) {
      const error = await confirmResponse.json();
      console.error('Failed to confirm release, but transaction was broadcast:', error);
    }

    return publishTransactionNotice(txId, wallet, 'Milestone released');
  } catch (error: any) {
    console.error('Failed to release milestone:', error);

    if (error.message.includes('No milestones available')) {
      throw new Error('No milestones available to release yet. Please wait for milestone unlock time.');
    }

    if (error.message.includes('user') || error.message.includes('cancel')) {
      throw new Error('Transaction cancelled by user');
    }

    throw new Error(`Release failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Pause a budget plan on-chain.
 */
export async function pauseBudgetPlanOnChain(
  wallet: WalletInterface,
  budgetId: string
): Promise<string> {
  if (!wallet.address) {
    throw new Error('Wallet not connected');
  }
  if (!wallet.signCashScriptTransaction) {
    throw new Error('Connected wallet does not support CashScript transactions');
  }

  const apiUrl = '/api';
  const response = await fetch(`${apiUrl}/budget-plans/${budgetId}/pause`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to build pause transaction' }));
    throw new Error(error.error || error.message || 'Failed to build pause transaction');
  }

  const { wcTransaction } = await response.json();
  if (!wcTransaction) {
    throw new Error('Backend did not return pause transaction');
  }

  const signResult = await wallet.signCashScriptTransaction(deserializeWcSignOptions(wcTransaction));
  const txHash = signResult.signedTransactionHash;

  const confirmResponse = await fetch(`${apiUrl}/budget-plans/${budgetId}/confirm-pause`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
    body: JSON.stringify({ txHash }),
  });
  if (!confirmResponse.ok) {
    const error = await confirmResponse.json().catch(() => ({ error: 'Failed to confirm pause transaction' }));
    throw new Error(error.error || error.message || 'Failed to confirm pause transaction');
  }

  return publishTransactionNotice(txHash, wallet, 'Budget paused');
}

/**
 * Cancel a budget plan on-chain.
 */
export async function cancelBudgetPlanOnChain(
  wallet: WalletInterface,
  budgetId: string,
  options?: { allowUnsafeRecovery?: boolean }
): Promise<string> {
  if (!wallet.address) {
    throw new Error('Wallet not connected');
  }
  if (!wallet.signCashScriptTransaction) {
    throw new Error('Connected wallet does not support CashScript transactions');
  }

  const apiUrl = '/api';
  const response = await fetch(`${apiUrl}/budget-plans/${budgetId}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
    body: JSON.stringify({
      allowUnsafeRecovery: options?.allowUnsafeRecovery === true,
    }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to build cancel transaction' }));
    throw new Error(error.error || error.message || 'Failed to build cancel transaction');
  }

  const { wcTransaction } = await response.json();
  if (!wcTransaction) {
    throw new Error('Backend did not return cancel transaction');
  }

  const signResult = await wallet.signCashScriptTransaction(deserializeWcSignOptions(wcTransaction));
  const txHash = signResult.signedTransactionHash;

  const confirmResponse = await fetch(`${apiUrl}/budget-plans/${budgetId}/confirm-cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
    body: JSON.stringify({ txHash }),
  });
  if (!confirmResponse.ok) {
    const error = await confirmResponse.json().catch(() => ({ error: 'Failed to confirm cancel transaction' }));
    throw new Error(error.error || error.message || 'Failed to confirm cancel transaction');
  }

  return publishTransactionNotice(txHash, wallet, 'Budget cancelled');
}
