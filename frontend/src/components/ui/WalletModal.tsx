/**
 * Wallet Selection Modal
 * Allows users to choose between Paytaca, WalletConnect v2, and mainnet.cash
 *
 * DESIGN RULES:
 * - Uses ONLY Sage palette colors (#F1F3E0, #D2DCB6, #A1BC98, #778873)
 * - All colors via Tailwind classes from globals.css tokens
 * - NO hardcoded hex values (#00E676, gray-*, red-*, etc.)
 * - NO bg-white (use bg-surface)
 */

import React, { useState } from 'react';
import { WalletType } from '../../types/wallet';
import { isWizardConnectEnabled } from '../../connectors';
import { Wallet, X, ExternalLink, Smartphone, Loader2, Sparkles, Check, AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface WalletOption {
  type: WalletType;
  name: string;
  description: string;
  Icon: LucideIcon;
  installUrl?: string;
  recommended?: boolean;
  beta?: boolean;
}

const PAYTACA_INSTALL_URL =
  'https://chrome.google.com/webstore/detail/paytaca/pakphhpnneopheifihmjcjnbdbhaaiaa';

function buildWalletOptions(): WalletOption[] {
  const options: WalletOption[] = [
    {
      type: WalletType.PAYTACA,
      name: 'Paytaca',
      description: 'Browser extension - best for desktop covenant flows',
      Icon: Wallet,
      installUrl: PAYTACA_INSTALL_URL,
    },
    {
      type: WalletType.CASHONIZE,
      name: 'Cashonize',
      description: 'CashScript-aware mobile wallet (covenant support)',
      Icon: Smartphone,
    },
    {
      type: WalletType.WALLETCONNECT,
      name: 'WalletConnect',
      description: 'Connect any WalletConnect v2 BCH wallet (Zapit, Selene)',
      Icon: Smartphone,
      recommended: true,
    },
  ];

  if (isWizardConnectEnabled()) {
    options.push({
      type: WalletType.WIZARDCONNECT,
      name: 'WizardConnect',
      description: 'BCH-native, end-to-end encrypted relay (covenant only)',
      Icon: Sparkles,
      beta: true,
    });
  }

  return options;
}

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectWallet: (walletType: WalletType) => Promise<void>;
  isConnecting: boolean;
  error: string | null;
}

export function WalletModal({
  isOpen,
  onClose,
  onSelectWallet,
  isConnecting,
  error,
}: WalletModalProps) {
  const [selectedWallet, setSelectedWallet] = useState<WalletType | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [hideForWC, setHideForWC] = useState(false);
  const [paytacaDetected, setPaytacaDetected] = useState<boolean | null>(null);

  const walletOptions = buildWalletOptions();

  // Probe for the Paytaca extension once when the modal opens so we can render
  // an explicit "install" affordance instead of routing the user through an
  // error-message URL when they click the Paytaca option.
  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const probe = async () => {
      if (typeof window === 'undefined') {
        if (!cancelled) setPaytacaDetected(false);
        return;
      }
      // Check immediate availability.
      const w = window as unknown as { paytaca?: { address?: () => Promise<unknown> } };
      if (w.paytaca && typeof w.paytaca.address === 'function') {
        if (!cancelled) setPaytacaDetected(true);
        return;
      }
      // Poll up to 1.5s for late injection. Real Paytaca injects within ~200ms;
      // this is the modal's responsiveness budget, not the full connect budget.
      const start = Date.now();
      while (Date.now() - start < 1500) {
        await new Promise((r) => setTimeout(r, 100));
        if (cancelled) return;
        const wNow = window as unknown as { paytaca?: { address?: () => Promise<unknown> } };
        if (wNow.paytaca && typeof wNow.paytaca.address === 'function') {
          setPaytacaDetected(true);
          return;
        }
      }
      if (!cancelled) setPaytacaDetected(false);
    };
    probe();
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  // Hide our modal during WalletConnect or WizardConnect to allow the QR modal to show.
  const usesExternalQrModal =
    selectedWallet === WalletType.WALLETCONNECT
    || selectedWallet === WalletType.WIZARDCONNECT;
  const shouldHide = hideForWC && usesExternalQrModal && isConnecting;

  const handleConnect = async (walletType: WalletType) => {
    setSelectedWallet(walletType);
    setLocalError(null);

    // Hide our modal if a wallet renders its own QR modal
    if (usesExternalQrModal || walletType === WalletType.WALLETCONNECT || walletType === WalletType.WIZARDCONNECT) {
      setHideForWC(true);
    }

    try {
      await onSelectWallet(walletType);
      setSelectedWallet(null);
      setHideForWC(false);
      onClose();
    } catch (err) {
      setHideForWC(false);
      setSelectedWallet(null);
      const message = err instanceof Error ? err.message : 'Connection failed. Please try again.';
      setLocalError(message);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-textPrimary/50 backdrop-blur-sm p-4 overflow-y-auto transition-opacity duration-200 ${shouldHide ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
    >
      <div className="bg-surface rounded-2xl shadow-lg max-w-md w-full my-auto border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primarySoft rounded-lg">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-textPrimary">
              Connect Wallet
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surfaceAlt rounded-lg transition-colors"
            disabled={isConnecting}
          >
            <X className="w-5 h-5 text-textSecondary" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {(error || localError) && (
            <div className="p-4 bg-primarySoft border border-primary rounded-lg">
              <p className="text-sm text-primary font-medium">{error || localError}</p>
            </div>
          )}

          <p className="text-sm text-textSecondary">
            Choose a wallet to connect to FlowGuard
          </p>

              {/* Wallet Options */}
              <div className="space-y-3">
                {walletOptions.map((wallet) => {
                  const WalletIcon = wallet.Icon;
                  const isPending = isConnecting && selectedWallet === wallet.type;
                  const isPaytaca = wallet.type === WalletType.PAYTACA;
                  // For Paytaca: when probe says not installed, the primary
                  // button becomes an explicit Install action instead of a
                  // Connect attempt that throws a noisy error.
                  const showInstallCta =
                    isPaytaca && paytacaDetected === false && !!wallet.installUrl;

                  const baseCardClass = `w-full p-4 border rounded-xl transition-all group bg-surface
                    ${isPending ? 'border-primary bg-accentDim' : 'border-border'}
                    ${!isConnecting && 'hover:border-primary hover:shadow-md'}
                    ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`;

                  const inner = (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-primarySoft rounded-lg">
                          <WalletIcon className="w-6 h-6 text-primary" />
                        </div>
                        <div className="text-left">
                          <div className="flex items-center flex-wrap gap-2">
                            <h3 className="font-semibold text-textPrimary group-hover:text-primary transition-colors">
                              {wallet.name}
                            </h3>
                            {wallet.recommended && (
                              <span className="px-2 py-0.5 text-xs bg-primarySoft text-primary rounded-full font-medium">
                                Recommended
                              </span>
                            )}
                            {wallet.beta && (
                              <span className="px-2 py-0.5 text-xs bg-accentDim text-primary rounded-full font-medium border border-accent">
                                Beta
                              </span>
                            )}
                            {isPaytaca && paytacaDetected === true && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-primarySoft text-primary rounded-full font-medium">
                                <Check className="w-3 h-3" /> Detected
                              </span>
                            )}
                            {isPaytaca && paytacaDetected === false && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-accentDim text-textSecondary rounded-full font-medium border border-border">
                                <AlertCircle className="w-3 h-3" /> Not installed
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-textSecondary">
                            {showInstallCta
                              ? 'Install the Paytaca browser extension to connect from this device.'
                              : wallet.description}
                          </p>
                        </div>
                      </div>

                      {isPending && (
                        <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                      )}
                      {!isPending && showInstallCta && (
                        <ExternalLink className="w-4 h-4 text-textMuted group-hover:text-primary transition-colors shrink-0" />
                      )}
                    </div>
                  );

                  if (showInstallCta) {
                    return (
                      <a
                        key={wallet.type}
                        href={wallet.installUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Install Paytaca browser extension (opens Chrome Web Store in a new tab)"
                        className={baseCardClass + ' block'}
                      >
                        {inner}
                      </a>
                    );
                  }

                  return (
                    <button
                      key={wallet.type}
                      onClick={() => handleConnect(wallet.type)}
                      disabled={isConnecting}
                      className={baseCardClass}
                    >
                      {inner}
                    </button>
                  );
                })}
              </div>

          {/* Info */}
          <div className="mt-6 p-4 bg-surfaceAlt rounded-lg border border-border">
            <p className="text-xs text-textSecondary">
              <strong className="text-textPrimary">Note:</strong> By connecting your wallet, you agree to FlowGuard's
              terms. Your wallet remains in your custody at all times.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
