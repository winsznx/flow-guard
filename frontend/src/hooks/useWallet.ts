import { useState, useEffect } from 'react';

interface WalletState {
  address: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Check if wallet is already connected
    const savedAddress = localStorage.getItem('walletAddress');
    if (savedAddress) {
      setAddress(savedAddress);
      setIsConnected(true);
    }
  }, []);

  const connect = async () => {
    try {
      // TODO: Implement actual wallet connection (Selene, mainnet.cash)
      // For now, mock connection
      const mockAddress = '0x' + Math.random().toString(16).substr(2, 40);
      setAddress(mockAddress);
      setIsConnected(true);
      localStorage.setItem('walletAddress', mockAddress);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  const disconnect = () => {
    setAddress(null);
    setIsConnected(false);
    localStorage.removeItem('walletAddress');
  };

  return {
    address,
    isConnected,
    connect,
    disconnect,
  };
}

