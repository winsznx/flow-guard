import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BetaTag } from './BetaTag';
import { BUTTON_LINK_BASE, BUTTON_VARIANTS } from './Button';
import { Dialog } from './Dialog';
import { LinkCard } from './LinkCard';
import { Notice } from './Notice';
import { KeyRound, ShieldCheck, Smartphone, Wallet, type LucideIcon } from './Icon';
import { cx } from './cx';
import { WalletType } from '../../types/wallet';
import { isOptnEnabled, isWizardConnectEnabled } from '../../connectors';
import { ACTIONS, BUSY, MOMENTS, pickWalletFor } from '../../copy/common';
import { classifyWalletError, ERROR_CATALOG, toFlowError, type FlowError } from '../../copy/errors';
import { CONNECT_TITLE } from '../../copy/nav';
import { NETWORK_NAME } from '../../copy/network';
import { OTHER_PHONE_WALLETS, WALLETS, type WalletEntry } from '../../copy/wallets';

type WalletOption = {
  key: string;
  type: WalletType;
  name: string;
  description: string;
  icon: LucideIcon;
  beta?: boolean;
};

const AGREE_PREFIX = 'By connecting, you agree to the';
const TERMS_LABEL = 'Terms of use';
const HELP_PATH = '/help';
const TERMS_PATH = '/terms';
const INLINE_LINK = cx(BUTTON_LINK_BASE, BUTTON_VARIANTS.link);

function walletOption(key: string, type: WalletType, entry: WalletEntry, icon: LucideIcon, beta = false): WalletOption {
  return { key, type, name: entry.name, description: entry.line, icon, beta };
}

/** The Paytaca row and the other phone wallets row both start the WalletConnect connector. */
function buildWalletOptions(): WalletOption[] {
  const options: WalletOption[] = [
    walletOption('paytaca', WalletType.WALLETCONNECT, WALLETS[WalletType.PAYTACA], Wallet),
    walletOption('cashonize', WalletType.CASHONIZE, WALLETS[WalletType.CASHONIZE], Wallet),
    walletOption('other-phone-wallets', WalletType.WALLETCONNECT, OTHER_PHONE_WALLETS, Smartphone),
  ];
  if (isOptnEnabled()) {
    options.push(walletOption('optn', WalletType.OPTN, WALLETS[WalletType.OPTN], ShieldCheck, true));
  }
  if (isWizardConnectEnabled()) {
    options.push(walletOption('wizardconnect', WalletType.WIZARDCONNECT, WALLETS[WalletType.WIZARDCONNECT], KeyRound, true));
  }
  return options;
}

/**
 * A safety net past the connectors' own 120s pairing timeout. Every connector settles connect()
 * when its pairing dialog closes or times out, so this only fires if one of them stops doing that.
 */
const PAIRING_FALLBACK_MS = 150_000;

/**
 * Wallets that show their own QR code overlay. A modal <dialog> makes everything outside it
 * inert, so the picker has to close while that overlay is up, and comes back if pairing fails.
 */
const SELF_QR_WALLETS: ReadonlySet<WalletType> = new Set([
  WalletType.WALLETCONNECT,
  WalletType.CASHONIZE,
  WalletType.WIZARDCONNECT,
  WalletType.OPTN,
]);

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectWallet: (walletType: WalletType) => Promise<void>;
  isConnecting: boolean;
}

function ConnectError({ error }: { error: FlowError }) {
  const tone = ERROR_CATALOG[error.code].tone;
  if (!tone) return null;

  return (
    <Notice
      tone={tone}
      title={tone === 'danger' ? MOMENTS.connectFailed : MOMENTS.notConnected}
      live={tone === 'danger' ? 'assertive' : 'polite'}
    >
      <p>{error.message}</p>
      {error.details ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-ink-secondary">{ACTIONS.details}</summary>
          <p className="mt-1 whitespace-pre-line break-words text-ink-muted">{error.details}</p>
        </details>
      ) : null}
    </Notice>
  );
}

export function WalletModal({ isOpen, onClose, onSelectWallet, isConnecting }: WalletModalProps) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  const [attemptError, setAttemptError] = useState<FlowError | null>(null);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const attempt = useRef(0);
  const walletOptions = buildWalletOptions();

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setAttemptError(null);
  }

  useEffect(() => {
    if (!pairing) return;
    const timer = window.setTimeout(() => {
      attempt.current += 1;
      setPendingKey(null);
      setPairing(false);
      setAttemptError(toFlowError('PAIRING_TIMEOUT'));
    }, PAIRING_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [pairing]);

  const handleSelect = async (option: WalletOption) => {
    if (isConnecting || pendingKey) return;
    attempt.current += 1;
    const thisAttempt = attempt.current;
    const isCurrent = () => attempt.current === thisAttempt;
    setPendingKey(option.key);
    setAttemptError(null);
    setPairing(SELF_QR_WALLETS.has(option.type));

    try {
      await onSelectWallet(option.type);
      onClose();
    } catch (err) {
      if (isCurrent()) setAttemptError(toFlowError(classifyWalletError(err), { cause: err }));
    } finally {
      if (isCurrent()) {
        setPendingKey(null);
        setPairing(false);
      }
    }
  };

  return (
    <Dialog open={isOpen && !pairing} onClose={onClose} title={CONNECT_TITLE}>
      <div className="flex flex-col gap-4">
        {attemptError ? <ConnectError error={attemptError} /> : null}

        <p className="text-body text-ink-secondary">{pickWalletFor(NETWORK_NAME)}</p>

        <ul className="flex flex-col gap-3">
          {walletOptions.map((option) => (
            <li key={option.key}>
              <LinkCard
                onSelect={() => void handleSelect(option)}
                disabled={isConnecting || pendingKey !== null}
                icon={option.icon}
                title={option.name}
                description={option.description}
                meta={
                  pendingKey === option.key ? (
                    <span role="status">{BUSY.waitingForWallet}</span>
                  ) : option.beta ? (
                    <BetaTag />
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-1 text-small text-ink-secondary">
          <p>
            {MOMENTS.newToBch}{' '}
            <Link to={HELP_PATH} onClick={onClose} data-inline className={INLINE_LINK}>
              {ACTIONS.getWallet}
            </Link>
          </p>
          <p>
            {AGREE_PREFIX}{' '}
            <Link to={TERMS_PATH} onClick={onClose} data-inline className={INLINE_LINK}>
              {TERMS_LABEL}
            </Link>
            .
          </p>
        </div>
      </div>
    </Dialog>
  );
}
