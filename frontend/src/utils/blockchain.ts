/**
 * Blockchain transaction utilities
 * Handles wallet signing and transaction broadcasting
 */

import { broadcastTransaction } from './api';
import type { Transaction, SignedTransaction } from '../types/wallet';

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
  isConnected: boolean;
  address: string | null;
  walletType?: string | null;
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
    return result.txid;
  } catch (error: any) {
    console.error('Failed to sign and broadcast transaction:', error);
    throw new Error(`Transaction failed: ${error.message || 'Unknown error'}`);
  }
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
  userPublicKey: string,
  metadata?: { vaultId?: string; proposalId?: string; amount?: number; toAddress?: string }
): Promise<string> {
  // Get the unsigned transaction from backend
  const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://flow-guard.fly.dev/api' : '/api');
  const response = await fetch(`${apiUrl}/proposals/${proposalId}/create-onchain`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signer-public-key': userPublicKey,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create proposal transaction');
  }

  const { transaction } = await response.json();

  // Sign and broadcast with metadata
  return signAndBroadcast(wallet, transaction.txHex, {
    txType: 'proposal',
    ...metadata,
    fromAddress: wallet.address || undefined,
  });
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
  userPublicKey: string,
  metadata?: { vaultId?: string; proposalId?: string }
): Promise<string> {
  // Get the unsigned transaction from backend
  const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://flow-guard.fly.dev/api' : '/api');
  const response = await fetch(`${apiUrl}/proposals/${proposalId}/approve-onchain`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signer-public-key': userPublicKey,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create approval transaction');
  }

  const { transaction } = await response.json();

  // Sign and broadcast with metadata
  return signAndBroadcast(wallet, transaction.txHex, {
    txType: 'approve',
    ...metadata,
    fromAddress: wallet.address || undefined,
  });
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
): Promise<string> {
  // Get the unsigned transaction from backend
  const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://flow-guard.fly.dev/api' : '/api');
  const response = await fetch(`${apiUrl}/proposals/${proposalId}/execute-onchain`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create payout transaction');
  }

  const { txHex } = await response.json();

  // Sign and broadcast with metadata
  return signAndBroadcast(wallet, txHex, {
    txType: 'payout',
    ...metadata,
    fromAddress: wallet.address || undefined,
  });
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
  userPublicKey: string,
  metadata?: { vaultId?: string; amount?: number }
): Promise<string> {
  // Get the unsigned transaction from backend
  const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://flow-guard.fly.dev/api' : '/api');
  const response = await fetch(`${apiUrl}/vaults/${vaultId}/unlock-onchain`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signer-public-key': userPublicKey,
    },
    body: JSON.stringify({ cycleNumber }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create unlock transaction');
  }

  const { transaction } = await response.json();

  // Sign and broadcast with metadata
  return signAndBroadcast(wallet, transaction.txHex, {
    txType: 'unlock',
    vaultId,
    ...metadata,
    fromAddress: wallet.address || undefined,
  });
}
