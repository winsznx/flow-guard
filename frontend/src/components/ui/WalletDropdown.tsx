import React, { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Address } from './Address';
import { Amount } from './Amount';
import { BUTTON_BASE, BUTTON_VARIANTS } from './Button';
import { ArrowUpRight, ChevronDown, Copy, Icon, LogOut, Settings, Wallet, type LucideIcon } from './Icon';
import { cx } from './cx';
import { useWallet } from '../../hooks/useWallet';
import { getWalletDisplayName } from '../../connectors';
import { ACTIONS, BUSY, LABELS, MOMENTS, TOASTS } from '../../copy/common';
import { formatAmount } from '../../copy/format';
import { NETWORK_LABEL, viewOnExplorer } from '../../copy/network';
import { getExplorerAddressUrl } from '../../utils/blockchain';
import { normalizeWalletNetwork } from '../../utils/txNotice';

const BCH = { kind: 'bch' } as const;
const COPIED_RESET_MS = 2000;

const FALLBACK_WALLET_NAME = 'Wallet';
const SETTINGS = 'Settings';
const NEW_TAB = ', opens in a new tab';

const TRIGGER = cx(BUTTON_BASE, BUTTON_VARIANTS.secondary, 'h-control-md min-w-0 max-w-full gap-2 px-3 text-label');

const TRIGGER_FIT = {
  regular: {
    root: 'max-sm:w-control-md max-sm:px-0 pointer-coarse:min-w-touch',
    address: 'max-sm:sr-only',
    balance: 'max-md:sr-only',
    chevron: 'max-sm:hidden',
  },
  compact: {
    root: 'max-lg:w-control-md max-lg:px-0 pointer-coarse:min-w-touch',
    address: 'max-lg:sr-only',
    balance: 'max-lg:sr-only',
    chevron: 'max-lg:hidden',
  },
} as const;
const ITEM =
  'flex w-full min-h-control-md pointer-coarse:min-h-touch items-center gap-3 rounded-control px-3 text-left text-label transition-colors duration-(--duration-fast) ease-standard';
const ITEM_TONE = {
  plain: 'text-ink hover:bg-sunken focus-visible:bg-sunken',
  danger: 'text-danger-ink hover:bg-danger-tint focus-visible:bg-danger-tint',
} as const;

function ItemIcon({ icon }: { icon: LucideIcon }) {
  return (
    <span aria-hidden="true" className="inline-flex text-ink-muted">
      <Icon icon={icon} size={16} />
    </span>
  );
}

export type WalletChipProps = {
  /** Icon only below 1024px, for the app top bar on phones and tablets. */
  compact?: boolean;
};

export function WalletChip({ compact = false }: WalletChipProps) {
  const fit = TRIGGER_FIT[compact ? 'compact' : 'regular'];
  const wallet = useWallet();
  const menuId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectFailed, setDisconnectFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const copiedTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  useEffect(() => {
    if (!isOpen) return undefined;
    menuItems(panelRef.current)[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  if (!wallet.isConnected || !wallet.address) return null;

  const address = wallet.address;
  const network = normalizeWalletNetwork(wallet.network);
  const walletName = wallet.walletType ? getWalletDisplayName(wallet.walletType) : FALLBACK_WALLET_NAME;
  const chipBalance = wallet.balance
    ? formatAmount(wallet.balance.bch, BCH, { precision: 'list' }) ?? LABELS.balanceUnavailable
    : LABELS.balanceUnavailable;

  const closeMenu = (returnFocus: boolean) => {
    setIsOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const toggleMenu = () => {
    setDisconnectFailed(false);
    setIsOpen((open) => !open);
  };

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch (error) {
      console.warn('[WalletDropdown] Clipboard write failed:', error);
    }
  };

  const handleDisconnect = async () => {
    if (isDisconnecting) return;
    setIsDisconnecting(true);
    setDisconnectFailed(false);
    try {
      await wallet.disconnect();
      setIsOpen(false);
    } catch (error) {
      console.error('[WalletDropdown] Disconnect failed:', error);
      setDisconnectFailed(true);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = menuItems(panelRef.current);
    const index = items.findIndex((node) => node === document.activeElement);
    const focusAt = (next: number) => items[(next + items.length) % items.length]?.focus();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusAt(items.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        closeMenu(true);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (isOpen || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    event.preventDefault();
    setIsOpen(true);
  };

  return (
    <div ref={rootRef} className="relative inline-flex min-w-0">
      <button
        ref={triggerRef}
        type="button"
        data-wallet-trigger
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={toggleMenu}
        onKeyDown={onTriggerKeyDown}
        className={cx(TRIGGER, fit.root)}
      >
        <span className="inline-flex shrink-0 text-ink-secondary">
          <Icon icon={Wallet} size={20} />
        </span>
        <span className="sr-only">{`${LABELS.walletMenu}, `}</span>
        <span className={cx('min-w-0 truncate', fit.address)}>
          <Address value={address} copy={false} />
        </span>
        <span className={cx('whitespace-nowrap text-caption text-ink-muted', fit.balance)}>{chipBalance}</span>
        <span aria-hidden="true" className={cx('inline-flex shrink-0 text-ink-muted', fit.chevron)}>
          <Icon icon={ChevronDown} size={16} />
        </span>
      </button>

      {isOpen ? (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label={LABELS.walletMenu}
          onKeyDown={onMenuKeyDown}
          className="on-surface absolute right-0 top-full z-(--z-menu) mt-2 flex w-popover flex-col rounded-card bg-surface p-1.5 shadow-overlay"
        >
          <div role="presentation" className="flex flex-col gap-3 px-3 pb-3 pt-2">
            <div className="flex flex-col gap-1">
              <span className="text-small text-ink-muted">{LABELS.walletBalance}</span>
              {wallet.balance ? (
                <Amount value={wallet.balance.bch} asset={BCH} size="lg" />
              ) : (
                <span className="text-body text-ink-secondary">{LABELS.balanceUnavailable}</span>
              )}
            </div>
            <dl className="flex flex-col gap-1 text-small">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{LABELS.connectedWith}</dt>
                <dd className="text-ink">{walletName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{LABELS.network}</dt>
                <dd className="text-ink">{NETWORK_LABEL[network]}</dd>
              </div>
            </dl>
          </div>

          <div role="separator" className="mx-1.5 mb-1.5 border-t border-line" />

          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => void handleCopyAddress()}
            className={cx(ITEM, ITEM_TONE.plain)}
          >
            <ItemIcon icon={Copy} />
            {copied ? TOASTS.addressCopied : ACTIONS.copyAddress}
          </button>
          <span role="status" className="sr-only">
            {copied ? TOASTS.addressCopied : ''}
          </span>

          <a
            href={getExplorerAddressUrl(address, network)}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            tabIndex={-1}
            onClick={() => setIsOpen(false)}
            className={cx(ITEM, ITEM_TONE.plain, 'justify-between')}
          >
            {viewOnExplorer(network)}
            <span className="sr-only">{NEW_TAB}</span>
            <ItemIcon icon={ArrowUpRight} />
          </a>

          <Link
            to="/settings"
            role="menuitem"
            tabIndex={-1}
            onClick={() => setIsOpen(false)}
            className={cx(ITEM, ITEM_TONE.plain)}
          >
            <ItemIcon icon={Settings} />
            {SETTINGS}
          </Link>

          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-disabled={isDisconnecting || undefined}
            onClick={() => void handleDisconnect()}
            className={cx(ITEM, ITEM_TONE.danger, isDisconnecting && 'cursor-not-allowed text-ink-muted')}
          >
            <span aria-hidden="true" className="inline-flex">
              <Icon icon={LogOut} size={16} />
            </span>
            {isDisconnecting ? BUSY.disconnecting : ACTIONS.disconnect}
          </button>

          {disconnectFailed ? (
            <p role="alert" className="px-3 py-2 text-small text-danger-ink">
              {MOMENTS.disconnectFailed}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const WalletDropdown = WalletChip;

function menuItems(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]'));
}
