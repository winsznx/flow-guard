/**
 * Wallet Types and Interfaces for FlowGuard
 * Supports BCH browser extension wallets (Paytaca) and mainnet.cash
 */

export enum WalletType {
  BCH_EXTENSION = 'bch_extension', // Paytaca, etc.
  MAINNET = 'mainnet',
}

export interface WalletBalance {
  bch: number;
  sat: number;
}

export interface Transaction {
  to: string;
  amount: number; // in satoshis
  data?: string;
}

export interface SignedTransaction {
  txId: string;
  hex: string;
}

export interface WalletInfo {
  address: string;
  publicKey?: string;
  balance?: WalletBalance;
  network: 'mainnet' | 'testnet' | 'chipnet';
}

export interface IWalletConnector {
  type: WalletType;
  isAvailable(): Promise<boolean>;
  connect(): Promise<WalletInfo>;
  disconnect(): Promise<void>;
  getAddress(): Promise<string>;
  getPublicKey(): Promise<string>; // NEW: Get public key in hex format
  getBalance(): Promise<WalletBalance>;
  signTransaction(tx: Transaction): Promise<SignedTransaction>;
  signMessage(message: string): Promise<string>;
}

export interface WalletState {
  walletType: WalletType | null;
  address: string | null;
  publicKey: string | null; // NEW: Store public key
  balance: WalletBalance | null;
  isConnected: boolean;
  isConnecting: boolean;
  network: 'mainnet' | 'testnet' | 'chipnet';
  error: string | null;
}

export interface WalletActions {
  connect: (walletType: WalletType, seedPhrase?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  getPublicKey: () => Promise<string | null>; // NEW: Expose public key getter
  signTransaction: (tx: Transaction) => Promise<SignedTransaction>;
  signRawTransaction?: (txHex: string) => Promise<string>; // For wallets that support raw transaction signing
  signMessage: (message: string) => Promise<string>;
  refreshBalance: () => Promise<void>;
}
