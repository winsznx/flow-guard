/**
 * Protected Route Component
 * Shows connection prompt if user is not connected to a wallet
 */

import { useWallet } from '../../hooks/useWallet';
import { useWalletModal } from '../../hooks/useWalletModal';
import { AlertCircle, Wallet } from 'lucide-react';
import { Button } from '../ui/Button';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const wallet = useWallet();
  const { openModal } = useWalletModal();

  if (wallet.isConnecting || !wallet.initAttempted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#00E676] border-t-transparent mx-auto mb-4" />
          <p className="text-textSecondary">Connecting wallet...</p>
        </div>
      </div>
    );
  }

  // If wallet is not connected after init, show connection prompt
  // This prevents redirect loops and gives better UX
  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50 p-4">
        <div className="max-w-md w-full bg-surface rounded-2xl shadow-2xl p-8 border border-border">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-[#00E676]/10 rounded-full">
              <AlertCircle className="w-12 h-12 text-[#00E676]" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-textPrimary text-center mb-3">
            Wallet Connection Required
          </h2>

          <p className="text-textSecondary text-center mb-6">
            You need to connect your wallet to access this page. Please connect your Selene or mainnet.cash wallet to continue.
          </p>

          <div className="space-y-3">
            <Button
              variant="primary"
              size="lg"
              className="w-full flex items-center justify-center gap-2"
              onClick={openModal}
            >
              <Wallet className="w-5 h-5" />
              Connect Wallet
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => window.location.href = '/'}
            >
              Go to Home
            </Button>
          </div>

          <div className="mt-6 p-4 bg-whiteAlt rounded-lg">
            <p className="text-xs text-textSecondary">
              <strong>Note:</strong> FlowGuard is a non-custodial treasury management system. Your wallet remains in your control at all times.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Wallet is connected, render protected content
  return <>{children}</>;
}
