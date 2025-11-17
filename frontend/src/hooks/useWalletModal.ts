/**
 * Global Wallet Modal State Hook
 * Manages the wallet modal open/close state across the app
 */

import { create } from 'zustand';

interface WalletModalState {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

export const useWalletModal = create<WalletModalState>((set) => ({
  isOpen: false,
  openModal: () => set({ isOpen: true }),
  closeModal: () => set({ isOpen: false }),
}));
