import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, Copy, LogOut, ChevronDown, Check, ExternalLink, Settings } from 'lucide-react';
import { useWallet } from '../../hooks/useWallet';
import { getExplorerAddressUrl } from '../../utils/blockchain';

/**
 * Wallet Dropdown Component
 * Shows wallet details in a dropdown menu in the top-right corner
 */
export const WalletDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const wallet = useWallet();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleCopyAddress = async () => {
    if (wallet.address) {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnect = async () => {
    if (isDisconnecting) return;
    setIsDisconnecting(true);
    try {
      await wallet.disconnect();
      setIsOpen(false);
    } catch (error) {
      console.error('[WalletDropdown] Disconnect failed:', error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const formatAddress = (address: string | null) => {
    if (!address) return '';
    return `${address.slice(0, 10)}...${address.slice(-8)}`;
  };

  const getWalletTypeLabel = () => {
    switch (wallet.walletType) {
      case 'paytaca':
        return 'Paytaca';
      case 'walletconnect':
        return 'WalletConnect';
      case 'cashonize':
        return 'Cashonize';
      case 'wizardconnect':
        return 'WizardConnect';
      default:
        return 'Unknown';
    }
  };

  const getExplorerUrl = () => {
    if (!wallet.address) return null;
    // Map testnet to chipnet for explorer
    const network = wallet.network === 'testnet' ? 'chipnet' : wallet.network;
    return getExplorerAddressUrl(wallet.address, network);
  };

  if (!wallet.isConnected) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex max-w-[min(17rem,calc(100vw-5rem))] items-center gap-2 rounded-lg border border-border bg-white px-2.5 py-2 transition-colors hover:bg-surfaceAlt sm:max-w-[min(20rem,calc(100vw-6rem))] md:gap-3 md:px-4"
      >
        {/* Balance */}
        {wallet.balance !== null && (
          <div className="hidden min-w-0 flex-col items-end sm:flex">
            <span className="text-xs text-textMuted">Balance</span>
            <span className="text-sm font-mono font-medium text-textPrimary">
              {wallet.balance.bch.toFixed(4)} BCH
            </span>
          </div>
        )}

        {/* Wallet Icon & Address */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-full">
            <Wallet className="w-4 h-4 text-primary" />
          </div>
          <span className="hidden truncate font-mono text-sm text-textPrimary md:inline">
            {formatAddress(wallet.address)}
          </span>
        </div>

        {/* Chevron */}
        <ChevronDown
          className={`w-4 h-4 text-textMuted transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-white shadow-xl md:w-80">
          {/* Header */}
          <div className="px-4 py-3 bg-surfaceAlt border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-primary/10 rounded-full">
                  <Wallet className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-textMuted">Connected with</p>
                  <p className="text-sm font-medium text-textPrimary">{getWalletTypeLabel()}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-textMuted">Active</span>
              </div>
            </div>
          </div>

          {/* Balance */}
          <div className="px-4 py-4 border-b border-border">
            <p className="text-xs text-textMuted mb-1">Total Balance</p>
            <p className="text-2xl font-bold text-textPrimary mb-1">
              {wallet.balance ? wallet.balance.bch.toFixed(4) : '0.0000'} <span className="text-lg text-textSecondary">BCH</span>
            </p>
            {wallet.balance && (
              <p className="text-xs text-textMuted">
                {wallet.balance.sat.toLocaleString()} satoshis
              </p>
            )}
          </div>

          {/* Address */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-textMuted">Address</p>
              <button
                onClick={handleCopyAddress}
                className="flex items-center gap-1 text-xs text-primary hover:text-primaryHover transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <p className="text-sm font-mono text-textPrimary bg-surfaceAlt px-3 py-2 rounded break-all">
              {wallet.address}
            </p>
          </div>

          {/* Network */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between">
              <p className="text-xs text-textMuted">Network</p>
              <span className="text-xs font-medium text-textPrimary capitalize px-2 py-1 bg-surfaceAlt rounded">
                {wallet.network}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="px-2 py-2">
            {getExplorerUrl() && (
              <a
                href={getExplorerUrl()!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-textSecondary hover:bg-surfaceAlt rounded-md transition-colors mb-1"
              >
                <ExternalLink className="w-4 h-4" />
                View on Explorer
              </a>
            )}
            <Link
              to="/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-textSecondary hover:bg-surfaceAlt rounded-md transition-colors mb-1"
            >
              <Settings className="w-4 h-4" />
              Settings
            </Link>
            <button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <LogOut className="w-4 h-4" />
              {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
