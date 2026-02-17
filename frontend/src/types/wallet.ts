/**
 * Wallet Types and Interfaces for FlowGuard
 * Supports Paytaca browser extension, WalletConnect v2, and mainnet.cash
 * 
 * Based on the BCH WalletConnect v2 specification:
 * https://github.com/mainnet-pat/wc2-bch-bcr
 */

export enum WalletType {
  PAYTACA = 'paytaca',           // Paytaca browser extension
  CASHONIZE = 'cashonize',       // Cashonize mobile wallet (CashScript-aware)
  WALLETCONNECT = 'walletconnect', // WalletConnect v2 (Zapit, etc.)
  MAINNET = 'mainnet',           // mainnet.cash (seed phrase wallet)
}

export interface WalletBalance {
  bch: number;
  sat: number;
}

/**
 * Simple transaction for basic sends
 */
export interface Transaction {
  to: string;
  amount: number; // in satoshis
  data?: string;
}

/**
 * CashScript transaction signing options
 * Compatible with Paytaca/WC2 signTransaction API
 */
export interface CashScriptSignOptions {
  transaction: string; // hex-encoded transaction or libauth TransactionBCH
  sourceOutputs: SourceOutput[];
  broadcast?: boolean; // default true
  userPrompt?: string;
}

/**
 * Source output info for signing (includes contract metadata)
 */
export interface SourceOutput {
  valueSatoshis?: bigint;
  lockingBytecode?: Uint8Array;
  unlockingBytecode?: Uint8Array;
  token?: {
    category: Uint8Array;
    amount: bigint;
    nft?: {
      capability: 'none' | 'mutable' | 'minting';
      commitment: Uint8Array;
    };
  };
  contract?: {
    abiFunction: {
      name: string;
      inputs: Array<{ name: string; type: string }>;
    };
    redeemScript: Uint8Array;
    artifact: {
      contractName: string;
      constructorInputs: Array<{ name: string; type: string }>;
      abi: Array<{ name: string; inputs: Array<{ name: string; type: string }> }>;
    };
  };
}

export interface SignedTransaction {
  txId: string;
  hex: string;
}

/**
 * CashScript transaction signing response
 */
export interface CashScriptSignResponse {
  signedTransaction: string;      // hex-encoded signed tx
  signedTransactionHash: string;  // txid
}

export interface WalletInfo {
  address: string;
  publicKey?: string;
  balance?: WalletBalance;
  network: 'mainnet' | 'testnet' | 'chipnet';
}

/**
 * Modern BCH wallet connector interface
 * Compatible with Paytaca and WalletConnect v2
 */
export interface IWalletConnector {
  type: WalletType;

  /** Check if wallet is available */
  isAvailable(): Promise<boolean>;

  /** Connect to wallet */
  connect(): Promise<WalletInfo>;

  /** Check if currently connected */
  isConnected(): Promise<boolean>;

  /** Disconnect wallet */
  disconnect(): Promise<void>;

  /** Get connected address */
  getAddress(): Promise<string>;

  /** Get public key (hex format) - required for contract deployment */
  getPublicKey(): Promise<string>;

  /** Get wallet balance */
  getBalance(): Promise<WalletBalance>;

  /** 
   * Sign a simple send transaction
   * For basic BCH transfers
   */
  signTransaction(tx: Transaction): Promise<SignedTransaction>;

  /**
   * Sign a CashScript contract transaction
   * This is the proper API for covenant interactions
   */
  signCashScriptTransaction?(options: CashScriptSignOptions): Promise<CashScriptSignResponse>;

  /** Sign a message */
  signMessage(message: string, userPrompt?: string): Promise<string>;

  /** Event listener registration */
  on?(event: 'addressChanged' | 'disconnect', callback: (data?: any) => void): void;

  /** Remove event listener */
  off?(event: string, callback: (data?: any) => void): void;
}

export interface WalletState {
  walletType: WalletType | null;
  address: string | null;
  publicKey: string | null;
  balance: WalletBalance | null;
  isConnected: boolean;
  isConnecting: boolean;
  network: 'mainnet' | 'testnet' | 'chipnet';
  error: string | null;
}

export interface WalletActions {
  connect: (walletType: WalletType, seedPhrase?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  getPublicKey: () => Promise<string | null>;
  signTransaction: (tx: Transaction) => Promise<SignedTransaction>;
  signCashScriptTransaction?: (options: CashScriptSignOptions) => Promise<CashScriptSignResponse>;
  signMessage: (message: string) => Promise<string>;
  refreshBalance: () => Promise<void>;
}

/**
 * Global window interface extension for Paytaca
 */
declare global {
  interface Window {
    paytaca?: PaytacaWalletAPI;
  }
}

/**
 * Paytaca Wallet API interface
 * Based on the official Paytaca connector specification
 */
export interface PaytacaWalletAPI {
  /** Get connected address */
  address(): Promise<string | undefined>;

  /** Sign a CashScript transaction */
  signTransaction(options: {
    transaction: string;
    sourceOutputs: SourceOutput[];
    broadcast?: boolean;
    userPrompt?: string;
  }): Promise<{ signedTransaction: string; signedTransactionHash: string } | undefined>;

  /** Sign a message */
  signMessage(options: { message: string; userPrompt?: string }): Promise<string | undefined>;

  /** Connect to site */
  connect(): Promise<void>;

  /** Check if connected */
  connected(): Promise<boolean>;

  /** Disconnect */
  disconnect(): Promise<void>;

  /** Event listener */
  on(event: 'addressChanged' | 'disconnect', callback: (data?: any) => void): void;
}
