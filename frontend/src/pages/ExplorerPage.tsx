/**
 * FlowGuard Explorer - single canonical surface for on-chain activity.
 *
 * One page, three personas:
 *   - Global    (default)            : public discovery, anonymous
 *   - Personal  (?scope=personal)    : wallet-scoped feed (replaces /streams/activity)
 *   - Treasury  (?scope=treasury)    : vault-scoped feed
 *
 * URL is the source of truth for scope / type / status / page / q, so every
 * filter combination is shareable and deep-linkable.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Box,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Gift,
  Globe2,
  Hash,
  Inbox,
  Layers,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Target,
  TriangleAlert,
  Trophy,
  Users,
  Wallet,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Footer } from '../components/layout/Footer';
import { PageMeta } from '../components/seo/PageMeta';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { StatsCard } from '../components/shared/StatsCard';
import { useWallet } from '../hooks/useWallet';
import { formatLogicalId } from '../utils/display';
import { isExplorerHost } from '../utils/publicUrls';
import { getExplorerTxUrl, getExplorerAddressUrl } from '../utils/blockchain';
import {
  detectQueryKind,
  ExplorerApiError,
  getExplorerAddress,
  getExplorerStats,
  getExplorerTransactions,
  searchExplorer,
  toUnixMs,
  type ExplorerAddressResponse,
  type ExplorerSearchResponse,
  type ExplorerStatsResponse,
  type ExplorerTransactionRow,
  type ExplorerTransactionsQuery,
  type ExplorerTxType,
} from '../utils/explorerQueries';

type Scope = 'global' | 'personal' | 'treasury';
type EntityTypeFilter = 'all' | 'stream' | 'vault' | 'payment' | 'airdrop' | 'proposal';
type StatusFilter = 'all' | 'ACTIVE' | 'PENDING' | 'COMPLETED' | 'EXECUTED' | 'DEPLOYED' | 'CREATED';

const PAGE_SIZE = 25;

interface TypeMeta {
  label: string;
  icon: LucideIcon;
  detailPath: (row: ExplorerTransactionRow) => string;
}

const TYPE_META: Record<ExplorerTxType, TypeMeta> = {
  VAULT: {
    label: 'Vault',
    icon: Shield,
    detailPath: (row) => `/vaults/${row.id}`,
  },
  STREAM: {
    label: 'Stream',
    icon: Waves,
    detailPath: (row) => `/streams/${row.id}`,
  },
  PAYMENT: {
    label: 'Payment',
    icon: Wallet,
    detailPath: (row) => `/payments/${row.id}`,
  },
  AIRDROP: {
    label: 'Airdrop',
    icon: Gift,
    detailPath: (row) => `/airdrops/${row.id}`,
  },
  PROPOSAL: {
    label: 'Proposal',
    icon: FileText,
    detailPath: (row) => `/proposals/${row.id}`,
  },
};

const TYPE_FILTER_TABS: Array<{ value: EntityTypeFilter; label: string; icon: LucideIcon }> = [
  { value: 'all', label: 'All', icon: Layers },
  { value: 'stream', label: 'Streams', icon: Waves },
  { value: 'vault', label: 'Vaults', icon: Shield },
  { value: 'payment', label: 'Payments', icon: Wallet },
  { value: 'airdrop', label: 'Airdrops', icon: Gift },
  { value: 'proposal', label: 'Proposals', icon: FileText },
];

const SECONDARY_TYPE_LINKS: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/bounties', label: 'Bounties', icon: Target },
  { to: '/rewards', label: 'Rewards', icon: Trophy },
  { to: '/grants', label: 'Grants', icon: Sparkles },
];

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'DEPLOYED', label: 'Deployed' },
  { value: 'EXECUTED', label: 'Executed' },
  { value: 'COMPLETED', label: 'Completed' },
];

function getStatusClasses(status: string): string {
  switch (status?.toUpperCase()) {
    case 'ACTIVE':
      return 'bg-accent/10 text-accent border-accent/30';
    case 'PENDING':
    case 'CREATED':
      return 'bg-secondary/15 text-textPrimary border-secondary';
    case 'EXECUTED':
      return 'bg-primary/10 text-primary border-primary/30';
    case 'COMPLETED':
      return 'bg-primarySoft text-primaryHover border-primary/20';
    case 'DEPLOYED':
      return 'bg-brand-100 text-primaryHover border-brand-300';
    case 'FAILED':
    case 'CANCELLED':
      return 'bg-error/10 text-error border-error/30';
    default:
      return 'bg-surfaceAlt text-textMuted border-border';
  }
}

function formatAddress(address: string | null | undefined, head = 8, tail = 6): string {
  if (!address) return '';
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

function formatRelativeTime(ms: number): string {
  if (!Number.isFinite(ms)) return '-';
  const diff = Date.now() - ms;
  if (diff < 0) return new Date(ms).toLocaleString();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

function formatBch(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
  if (value === 0) return '0';
  if (Math.abs(value) >= 1) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function formatEventLabel(eventType: string | undefined | null): string {
  if (!eventType) return '';
  return eventType
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

interface CopyButtonProps {
  value: string;
  label?: string;
}

function CopyButton({ value, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      navigator.clipboard.writeText(value).then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      });
    },
    [value],
  );

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label || 'Copy'}
      className="inline-flex items-center justify-center rounded-md border border-transparent p-1 text-textMuted hover:border-border hover:text-textPrimary transition-colors"
    >
      {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

interface AddressTagProps {
  address: string | null | undefined;
  onSelect?: (address: string) => void;
  network: 'mainnet' | 'chipnet';
  emptyLabel?: string;
}

function AddressTag({ address, onSelect, network, emptyLabel = ' - ' }: AddressTagProps) {
  if (!address) {
    return <span className="font-mono text-xs text-textMuted">{emptyLabel}</span>;
  }
  const initial = address.replace(/[^a-z0-9]/gi, '').slice(0, 1).toUpperCase() || '?';
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primarySoft font-mono text-[10px] font-semibold text-primaryHover">
        {initial}
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect?.(address);
        }}
        className="font-mono text-xs text-textPrimary hover:text-primary"
        title={address}
      >
        {formatAddress(address)}
      </button>
      <CopyButton value={address} label="Copy address" />
      <a
        href={getExplorerAddressUrl(address, network)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="text-textMuted hover:text-primary"
        title="Open on Chaingraph"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </span>
  );
}

interface FilterChipProps<T extends string> {
  value: T;
  active: T;
  label: string;
  icon?: LucideIcon;
  onSelect: (value: T) => void;
}

function FilterChip<T extends string>({ value, active, label, icon: Icon, onSelect }: FilterChipProps<T>) {
  const isActive = active === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-sans font-medium transition-colors whitespace-nowrap ${
        isActive
          ? 'bg-primary text-white border-primary shadow-sm'
          : 'bg-surface text-textSecondary border-border hover:border-primary/40 hover:text-textPrimary'
      }`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

interface ScopeTabsProps {
  scope: Scope;
  onChange: (scope: Scope) => void;
  walletAddress: string | null;
}

function ScopeTabs({ scope, onChange, walletAddress }: ScopeTabsProps) {
  const tabs: Array<{ value: Scope; label: string; icon: LucideIcon; description: string; disabled?: boolean }> = [
    {
      value: 'global',
      label: 'Global',
      icon: Globe2,
      description: 'All FlowGuard activity',
    },
    {
      value: 'personal',
      label: 'Personal',
      icon: Wallet,
      description: walletAddress ? formatAddress(walletAddress) : 'Connect a wallet',
      disabled: !walletAddress,
    },
    {
      value: 'treasury',
      label: 'Treasury',
      icon: Shield,
      description: 'Vault-scoped activity',
    },
  ];
  return (
    <div className="inline-flex rounded-2xl border border-border bg-surface p-1 shadow-sm">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = scope === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => !tab.disabled && onChange(tab.value)}
            disabled={tab.disabled}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary text-white shadow-sm'
                : tab.disabled
                ? 'cursor-not-allowed text-textMuted/60'
                : 'text-textSecondary hover:bg-surfaceAlt hover:text-textPrimary'
            }`}
            title={tab.disabled ? 'Connect a wallet to view personal activity' : tab.description}
          >
            <Icon className="h-4 w-4" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface InlineStatusBannerProps {
  variant: 'error' | 'info' | 'warning';
  title: string;
  description?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

function InlineStatusBanner({ variant, title, description, onRetry, onDismiss }: InlineStatusBannerProps) {
  const tones: Record<InlineStatusBannerProps['variant'], { bg: string; border: string; text: string; icon: LucideIcon }> = {
    error: { bg: 'bg-error/10', border: 'border-error/30', text: 'text-error', icon: TriangleAlert },
    info: { bg: 'bg-primary/5', border: 'border-primary/20', text: 'text-primary', icon: Activity },
    warning: { bg: 'bg-secondary/15', border: 'border-secondary', text: 'text-textPrimary', icon: TriangleAlert },
  };
  const tone = tones[variant];
  const Icon = tone.icon;
  return (
    <div className={`flex items-start justify-between gap-3 rounded-2xl border p-4 ${tone.bg} ${tone.border}`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.text}`} />
        <div>
          <p className={`font-sans text-sm font-semibold ${tone.text}`}>{title}</p>
          {description && <p className="mt-1 font-sans text-xs text-textMuted">{description}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Retry
          </Button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md p-1 text-textMuted hover:text-textPrimary"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function RowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="h-14 animate-pulse rounded-xl border border-border/40 bg-surfaceAlt"
        />
      ))}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="h-28 animate-pulse rounded-lg border border-border/40 bg-surfaceAlt" />
  );
}

interface TransactionRowProps {
  tx: ExplorerTransactionRow;
  network: 'mainnet' | 'chipnet';
  onSelectAddress: (address: string) => void;
}

function TransactionRow({ tx, network, onSelectAddress }: TransactionRowProps) {
  const meta = TYPE_META[tx.tx_type];
  const Icon = meta?.icon || Hash;
  const detailPath = meta ? meta.detailPath(tx) : `#`;
  const txHash = tx.latest_event?.tx_hash || tx.tx_hash || null;
  const createdMs = toUnixMs(tx.created_at);
  const eventMs = tx.latest_event ? toUnixMs(tx.latest_event.created_at) : NaN;

  return (
    <tr className="group border-b border-border/60 transition-colors hover:bg-surfaceAlt/60">
      <td className="px-4 py-3">
        <Link
          to={detailPath}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surfaceAlt px-2.5 py-1 text-xs font-medium text-textPrimary hover:border-primary/40 hover:bg-primarySoft"
        >
          <Icon className="h-3.5 w-3.5 text-primary" />
          {meta?.label || tx.tx_type}
        </Link>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <Link to={detailPath} className="font-sans text-sm font-medium text-textPrimary hover:text-primary">
            {tx.name || formatLogicalId(tx.id)}
          </Link>
          <span className="font-mono text-[11px] text-textMuted">{formatLogicalId(tx.id)}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <AddressTag address={tx.sender} onSelect={onSelectAddress} network={network} />
          {tx.recipient && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-textMuted" />
              <AddressTag address={tx.recipient} onSelect={onSelectAddress} network={network} />
            </>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end">
          <span className="font-display text-sm font-semibold text-textPrimary">{formatBch(tx.amount)}</span>
          <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">
            {tx.token_type || 'BCH'}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${getStatusClasses(tx.status)}`}>
          {tx.status}
        </span>
      </td>
      <td className="px-4 py-3">
        {tx.latest_event ? (
          <div className="flex flex-col">
            <span className="text-xs text-textPrimary">{formatEventLabel(tx.latest_event.event_type)}</span>
            <span className="font-mono text-[11px] text-textMuted">{formatRelativeTime(eventMs)}</span>
          </div>
        ) : (
          <span className="text-xs text-textMuted"> - </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end">
          <span className="text-xs text-textPrimary" title={new Date(createdMs).toLocaleString()}>
            {formatRelativeTime(createdMs)}
          </span>
          {txHash && (
            <a
              href={getExplorerTxUrl(txHash, network)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] text-textMuted hover:text-primary"
              title="View raw tx on Chaingraph"
            >
              {formatAddress(txHash, 6, 4)}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}

function TransactionCard({ tx, network, onSelectAddress }: TransactionRowProps) {
  const meta = TYPE_META[tx.tx_type];
  const Icon = meta?.icon || Hash;
  const detailPath = meta ? meta.detailPath(tx) : `#`;
  const txHash = tx.latest_event?.tx_hash || tx.tx_hash || null;
  const createdMs = toUnixMs(tx.created_at);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <Link to={detailPath} className="inline-flex items-center gap-2 rounded-full bg-primarySoft px-2.5 py-1 text-xs font-medium text-primaryHover">
          <Icon className="h-3.5 w-3.5" />
          {meta?.label || tx.tx_type}
        </Link>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${getStatusClasses(tx.status)}`}>
          {tx.status}
        </span>
      </div>
      <Link to={detailPath} className="mt-3 block">
        <p className="font-sans text-sm font-semibold text-textPrimary">{tx.name || formatLogicalId(tx.id)}</p>
        <p className="font-mono text-[11px] text-textMuted">{formatLogicalId(tx.id)}</p>
      </Link>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="font-display text-lg font-semibold text-textPrimary">{formatBch(tx.amount)}</span>
        <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">{tx.token_type || 'BCH'}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <AddressTag address={tx.sender} onSelect={onSelectAddress} network={network} />
        {tx.recipient && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-textMuted" />
            <AddressTag address={tx.recipient} onSelect={onSelectAddress} network={network} />
          </>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-textMuted">
        <span>{formatRelativeTime(createdMs)}</span>
        {txHash && (
          <a
            href={getExplorerTxUrl(txHash, network)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-textMuted hover:text-primary"
          >
            {formatAddress(txHash, 6, 4)}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

interface AddressPanelProps {
  address: string;
  data: ExplorerAddressResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  network: 'mainnet' | 'chipnet';
}

function AddressPanel({ address, data, loading, error, onClose, onRetry, network }: AddressPanelProps) {
  return (
    <Card className="sticky top-4 p-5">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Address</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-sm text-textPrimary" title={address}>
              {formatAddress(address, 12, 8)}
            </span>
            <CopyButton value={address} label="Copy address" />
            <a
              href={getExplorerAddressUrl(address, network)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-textMuted hover:text-primary"
              title="Open on Chaingraph"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-textMuted hover:bg-surfaceAlt hover:text-textPrimary"
          aria-label="Close address panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="mt-4">
          <InlineStatusBanner
            variant="error"
            title="Couldn't load address"
            description={error}
            onRetry={onRetry}
          />
        </div>
      )}

      {loading && (
        <div className="mt-4 space-y-3">
          <div className="h-16 animate-pulse rounded-lg border border-border/40 bg-surfaceAlt" />
          <div className="h-16 animate-pulse rounded-lg border border-border/40 bg-surfaceAlt" />
        </div>
      )}

      {data && !loading && (
        <div className="mt-4 space-y-5">
          <div className="rounded-xl border border-border bg-surfaceAlt p-4">
            <p className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Balance</p>
            <p className="font-display text-2xl text-textPrimary">{formatBch(data.balance)} BCH</p>
            <p className="font-mono text-[11px] text-textMuted">{data.balanceSat.toLocaleString()} sats</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-textMuted">Vaults created</p>
              <p className="font-display text-lg text-textPrimary">{data.activity.vaultsCreated}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-textMuted">As signer</p>
              <p className="font-display text-lg text-textPrimary">{data.activity.vaultsAsSigner}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-textMuted">Streams sent</p>
              <p className="font-display text-lg text-textPrimary">{data.activity.streamsSent}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-textMuted">Streams received</p>
              <p className="font-display text-lg text-textPrimary">{data.activity.streamsReceived}</p>
            </div>
          </div>

          {data.vaults.length > 0 && (
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-textMuted">Vaults</p>
              <ul className="space-y-1.5">
                {data.vaults.slice(0, 5).map((vault) => (
                  <li key={vault.vault_id}>
                    <Link
                      to={`/vaults/${vault.vault_id}`}
                      className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-xs hover:border-primary/40"
                    >
                      <span className="truncate font-sans text-textPrimary">{vault.name}</span>
                      <span className="font-mono text-[10px] text-textMuted">{formatBch(vault.total_deposit)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.streams.sent.length + data.streams.received.length > 0 && (
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-textMuted">Recent streams</p>
              <ul className="space-y-1.5">
                {[...data.streams.sent.slice(0, 3), ...data.streams.received.slice(0, 3)].map((stream) => (
                  <li key={stream.stream_id}>
                    <Link
                      to={`/streams/${stream.stream_id}`}
                      className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-xs hover:border-primary/40"
                    >
                      <span className="truncate font-mono text-textPrimary">{formatLogicalId(stream.stream_id)}</span>
                      <span className="font-mono text-[10px] text-textMuted">{formatBch(stream.total_amount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

interface SearchResultsPanelProps {
  results: ExplorerSearchResponse;
  network: 'mainnet' | 'chipnet';
  onSelectAddress: (address: string) => void;
  onClose: () => void;
}

function SearchResultsPanel({ results, network, onSelectAddress, onClose }: SearchResultsPanelProps) {
  const empty = results.totalResults === 0;
  return (
    <Card className="mb-6 p-5">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Search results</p>
          <h2 className="font-display text-xl text-textPrimary">
            "{results.query}" <span className="text-textMuted"> -  {results.totalResults}</span>
          </h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-textMuted hover:bg-surfaceAlt hover:text-textPrimary" aria-label="Close search">
          <X className="h-4 w-4" />
        </button>
      </div>

      {empty && (
        <div className="py-8 text-center">
          <Inbox className="mx-auto mb-3 h-10 w-10 text-textMuted" />
          <p className="font-sans text-sm text-textMuted">Nothing matches "{results.query}".</p>
          <p className="mt-1 font-sans text-xs text-textMuted">Try a vault name, stream id, address, or recipient.</p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {results.results.addresses.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 font-sans text-sm font-semibold text-textPrimary">
              <Wallet className="h-4 w-4 text-primary" />
              Address
            </h3>
            <ul className="space-y-2">
              {results.results.addresses.map((row) => (
                <li key={row.address}>
                  <button
                    type="button"
                    onClick={() => onSelectAddress(row.address)}
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-surfaceAlt px-3 py-2 text-left text-xs hover:border-primary/40"
                  >
                    <span className="font-mono text-textPrimary">{formatAddress(row.address, 12, 8)}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-textMuted" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {results.results.vaults.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 font-sans text-sm font-semibold text-textPrimary">
              <Shield className="h-4 w-4 text-primary" />
              Vaults · {results.results.vaults.length}
            </h3>
            <ul className="space-y-2">
              {results.results.vaults.map((vault) => (
                <li key={vault.vault_id}>
                  <Link to={`/vaults/${vault.vault_id}`} className="flex items-center justify-between rounded-lg border border-border bg-surfaceAlt px-3 py-2 text-xs hover:border-primary/40">
                    <div className="min-w-0">
                      <p className="truncate font-sans font-medium text-textPrimary">{vault.name}</p>
                      <p className="font-mono text-[11px] text-textMuted">{formatLogicalId(vault.vault_id)}</p>
                    </div>
                    <span className="font-mono text-[11px] text-primary">{formatBch(vault.total_deposit)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {results.results.streams.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 font-sans text-sm font-semibold text-textPrimary">
              <Waves className="h-4 w-4 text-primary" />
              Streams · {results.results.streams.length}
            </h3>
            <ul className="space-y-2">
              {results.results.streams.map((stream) => (
                <li key={stream.stream_id}>
                  <Link to={`/streams/${stream.stream_id}`} className="block rounded-lg border border-border bg-surfaceAlt px-3 py-2 text-xs hover:border-primary/40">
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-textPrimary">{formatLogicalId(stream.stream_id)}</p>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${getStatusClasses(stream.status)}`}>
                        {stream.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 font-mono text-[11px] text-textMuted">
                      <span>{formatAddress(stream.sender)}</span>
                      <ChevronRight className="h-3 w-3" />
                      <span>{formatAddress(stream.recipient)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {results.results.proposals.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 font-sans text-sm font-semibold text-textPrimary">
              <FileText className="h-4 w-4 text-primary" />
              Proposals · {results.results.proposals.length}
            </h3>
            <ul className="space-y-2">
              {results.results.proposals.map((proposal) => (
                <li key={proposal.id}>
                  <Link to={`/proposals/${proposal.id}`} className="block rounded-lg border border-border bg-surfaceAlt px-3 py-2 text-xs hover:border-primary/40">
                    <div className="flex items-center justify-between">
                      <p className="truncate font-sans text-textPrimary">{proposal.reason || formatLogicalId(proposal.id)}</p>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${getStatusClasses(proposal.status)}`}>
                        {proposal.status}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-textMuted">
                      {formatAddress(proposal.recipient)} · {formatBch(proposal.amount)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="mt-4 border-t border-border/60 pt-3 text-xs text-textMuted">
        <button type="button" onClick={onClose} className="text-primary hover:text-primaryHover">
          Clear search and return to feed
        </button>
      </div>
    </Card>
  );
}

interface UnifiedSearchBarProps {
  initial: string;
  onSearch: (query: string) => void;
  onClear: () => void;
}

function UnifiedSearchBar({ initial, onSearch, onClear }: UnifiedSearchBarProps) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    setValue(initial);
  }, [initial]);

  const detectedKind = useMemo(() => detectQueryKind(value), [value]);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const trimmed = value.trim();
      if (!trimmed) return;
      onSearch(trimmed);
    },
    [value, onSearch],
  );

  const hintMap: Record<typeof detectedKind, string> = {
    address: 'Looks like an address - will open the address panel',
    tx: 'Looks like a 32-byte hash - searched as a transaction',
    category: 'Looks like a token category - searched as cashtokens',
    text: 'Free text - searched across vaults, streams, proposals',
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-textMuted" />
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Search txid, address, contract, vault, stream, or token category…"
            className="pl-12 pr-10 py-3 text-base"
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                setValue('');
                onClear();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-textMuted hover:bg-surfaceAlt hover:text-textPrimary"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button type="submit" size="lg" className="px-5">
          <Search className="h-4 w-4 md:mr-2" />
          <span className="hidden md:inline">Search</span>
        </Button>
      </div>
      {value.trim() && (
        <p className="font-mono text-[11px] text-textMuted">{hintMap[detectedKind]}</p>
      )}
    </form>
  );
}

interface PaginationBarProps {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function PaginationBar({ page, total, pageSize, onPageChange }: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-border bg-surfaceAlt px-4 py-3 sm:flex-row sm:items-center">
      <p className="font-mono text-xs text-textMuted">
        {total === 0 ? 'No results' : `Showing ${start}–${end} of ${total.toLocaleString()}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Button>
        <span className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-xs text-textPrimary">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface NetworkBadgeProps {
  network: 'mainnet' | 'chipnet';
  blockHeight?: number;
  loading: boolean;
  onRefresh: () => void;
}

function NetworkBadge({ network, blockHeight, loading, onRefresh }: NetworkBadgeProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs">
      <span className={`h-2 w-2 rounded-full ${network === 'mainnet' ? 'bg-accent' : 'bg-secondary'} ${loading ? 'animate-pulse' : ''}`} />
      <span className="font-mono font-semibold uppercase tracking-wider text-textPrimary">{network}</span>
      {typeof blockHeight === 'number' && (
        <span className="font-mono text-textMuted">#{blockHeight.toLocaleString()}</span>
      )}
      <button
        type="button"
        onClick={onRefresh}
        className="ml-1 rounded-md p-1 text-textMuted hover:bg-surfaceAlt hover:text-textPrimary"
        aria-label="Refresh"
      >
        <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}

export default function ExplorerPage() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const network: 'mainnet' | 'chipnet' = import.meta.env.VITE_BCH_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet';
  const onExplorerHost = isExplorerHost();

  /* -------------------------- URL-driven state ----------------------- */

  const scope = (searchParams.get('scope') as Scope) || 'global';
  const entityType = (searchParams.get('type') as EntityTypeFilter) || 'all';
  const statusFilter = (searchParams.get('status') as StatusFilter) || 'all';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const queryParam = searchParams.get('q') || '';
  const activeAddress = searchParams.get('address');

  const updateParams = useCallback(
    (mutate: (current: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams);
      mutate(next);
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  /* ------------------------------- Stats ----------------------------- */

  const [stats, setStats] = useState<ExplorerStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setStatsError(null);
      const data = await getExplorerStats();
      setStats(data);
    } catch (error) {
      const message = error instanceof ExplorerApiError ? error.message : 'Failed to load network stats';
      setStatsError(message);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  /* --------------------------- Transactions -------------------------- */

  const [transactions, setTransactions] = useState<ExplorerTransactionRow[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState<string | null>(null);

  const effectiveAddress = useMemo(() => {
    if (scope === 'personal') return wallet.address || null;
    if (scope === 'treasury') return null;
    return null;
  }, [scope, wallet.address]);

  const loadTransactions = useCallback(async () => {
    try {
      setTxLoading(true);
      setTxError(null);
      const query: ExplorerTransactionsQuery = {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      };
      if (entityType !== 'all') query.type = entityType;
      if (statusFilter !== 'all') query.status = statusFilter;
      if (effectiveAddress) query.address = effectiveAddress;
      if (scope === 'treasury') query.type = query.type || 'vault';

      const data = await getExplorerTransactions(query);
      setTransactions(data.transactions);
      setTxTotal(data.total);
    } catch (error) {
      const message = error instanceof ExplorerApiError ? error.message : 'Failed to load activity';
      setTxError(message);
      setTransactions([]);
      setTxTotal(0);
    } finally {
      setTxLoading(false);
    }
  }, [entityType, statusFilter, effectiveAddress, scope, page]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  /* ------------------------------ Search ----------------------------- */

  const [searchResults, setSearchResults] = useState<ExplorerSearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const runSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      const kind = detectQueryKind(trimmed);
      if (kind === 'address') {
        updateParams((next) => {
          next.set('address', trimmed);
          next.delete('q');
        });
        setSearchResults(null);
        return;
      }
      updateParams((next) => {
        next.set('q', trimmed);
        next.delete('address');
      });
      try {
        setSearchLoading(true);
        setSearchError(null);
        const data = await searchExplorer(trimmed);
        setSearchResults(data);
      } catch (error) {
        const message = error instanceof ExplorerApiError ? error.message : 'Search failed';
        setSearchError(message);
        setSearchResults(null);
      } finally {
        setSearchLoading(false);
      }
    },
    [updateParams],
  );

  useEffect(() => {
    if (!queryParam) {
      setSearchResults(null);
      return;
    }
    void (async () => {
      try {
        setSearchLoading(true);
        setSearchError(null);
        const data = await searchExplorer(queryParam);
        setSearchResults(data);
      } catch (error) {
        const message = error instanceof ExplorerApiError ? error.message : 'Search failed';
        setSearchError(message);
        setSearchResults(null);
      } finally {
        setSearchLoading(false);
      }
    })();
  }, [queryParam]);

  const clearSearch = useCallback(() => {
    updateParams((next) => {
      next.delete('q');
    });
    setSearchResults(null);
    setSearchError(null);
  }, [updateParams]);

  /* ---------------------------- Address pane ------------------------- */

  const [addressData, setAddressData] = useState<ExplorerAddressResponse | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  const loadAddress = useCallback(async (address: string) => {
    try {
      setAddressLoading(true);
      setAddressError(null);
      const data = await getExplorerAddress(address);
      setAddressData(data);
    } catch (error) {
      const message = error instanceof ExplorerApiError ? error.message : 'Failed to load address';
      setAddressError(message);
      setAddressData(null);
    } finally {
      setAddressLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeAddress) {
      setAddressData(null);
      setAddressError(null);
      return;
    }
    void loadAddress(activeAddress);
  }, [activeAddress, loadAddress]);

  const selectAddress = useCallback(
    (address: string) => {
      updateParams((next) => {
        next.set('address', address);
        next.delete('q');
      });
      setSearchResults(null);
    },
    [updateParams],
  );

  const closeAddress = useCallback(() => {
    updateParams((next) => {
      next.delete('address');
    });
  }, [updateParams]);

  /* ----------------------- Auto-promote scope ------------------------ */

  // If user is on /streams/activity (back-compat), redirect to canonical URL.
  // App.tsx now points that route at this page, so the only thing we still
  // need to do is force a default scope=personal when none is in the URL.
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/streams/activity' && !searchParams.get('scope')) {
      updateParams((next) => {
        next.set('scope', 'personal');
        if (!next.get('type')) next.set('type', 'stream');
      });
    }
  }, [searchParams, updateParams]);

  /* ------------------------ Derived stats values --------------------- */

  const activeContracts = stats?.flowguard.vaults.total ?? 0;
  const totalStreams = stats?.flowguard.streams.total ?? 0;
  const totalFunded = stats?.flowguard.vaults.totalValue ?? 0;
  const proposalsCount = stats?.flowguard.proposals.total ?? 0;
  const tx24h =
    (stats?.flowguard.streams.recent24h ?? 0) +
    (stats?.flowguard.vaults.recent24h ?? 0) +
    (stats?.flowguard.proposals.recent24h ?? 0);

  const personalDisabled = scope === 'personal' && !wallet.address;

  /* ---------------------------- Handlers ----------------------------- */

  const handleScopeChange = useCallback(
    (next: Scope) => {
      updateParams((params) => {
        params.set('scope', next);
        params.delete('page');
        if (next !== 'personal') params.delete('address');
      });
    },
    [updateParams],
  );

  const handleTypeChange = useCallback(
    (next: EntityTypeFilter) => {
      updateParams((params) => {
        params.set('type', next);
        params.delete('page');
      });
    },
    [updateParams],
  );

  const handleStatusChange = useCallback(
    (next: StatusFilter) => {
      updateParams((params) => {
        params.set('status', next);
        params.delete('page');
      });
    },
    [updateParams],
  );

  const handlePageChange = useCallback(
    (next: number) => {
      updateParams((params) => {
        params.set('page', String(next));
      });
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [updateParams],
  );

  /* ------------------------------ Render ----------------------------- */

  return (
    <>
      <PageMeta
        title="Explorer"
        description="Search Bitcoin Cash addresses, transactions, vaults, streams, payments, airdrops, and proposals across FlowGuard."
        path={onExplorerHost ? '/' : '/explorer'}
      />
      <div className="flex min-h-screen flex-col bg-background">
        <main className="flex-1 pb-20">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-10">
            {/* Header */}
            <header className="mb-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-mono uppercase tracking-wider text-textMuted">
                    <Zap className="h-3 w-3 text-primary" />
                    FlowGuard Explorer
                  </div>
                  <h1 className="font-display text-4xl text-textPrimary md:text-5xl lg:text-6xl">
                    Explore Bitcoin Cash activity
                  </h1>
                  <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-textMuted md:text-base">
                    One canonical surface for vaults, streams, payments, airdrops, proposals, and lifecycle events - across global, personal, and treasury scopes.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <NetworkBadge
                    network={network}
                    blockHeight={stats?.network.blockHeight}
                    loading={statsLoading}
                    onRefresh={loadStats}
                  />
                </div>
              </div>

              {/* Unified search */}
              <div className="mt-6">
                <UnifiedSearchBar initial={queryParam} onSearch={runSearch} onClear={clearSearch} />
              </div>
            </header>

            {/* Stats row */}
            <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-5">
              {statsLoading && !stats ? (
                Array.from({ length: 5 }).map((_, idx) => <StatSkeleton key={idx} />)
              ) : statsError && !stats ? (
                <div className="col-span-full">
                  <InlineStatusBanner
                    variant="error"
                    title="Couldn't load network stats"
                    description={statsError}
                    onRetry={loadStats}
                  />
                </div>
              ) : (
                <>
                  <StatsCard
                    label="Active contracts"
                    value={activeContracts.toLocaleString()}
                    subtitle={`${stats?.flowguard.vaults.recent24h ?? 0} new today`}
                    icon={Shield}
                    color="primary"
                  />
                  <StatsCard
                    label="Total streams"
                    value={totalStreams.toLocaleString()}
                    subtitle={`${stats?.flowguard.streams.active ?? 0} active`}
                    icon={Waves}
                    color="accent"
                  />
                  <StatsCard
                    label="Funded BCH"
                    value={`${formatBch(totalFunded)}`}
                    subtitle={`${formatBch(stats?.flowguard.streams.totalVolume ?? 0)} streamed`}
                    icon={BarChart3}
                    color="primary"
                  />
                  <StatsCard
                    label="Proposals"
                    value={proposalsCount.toLocaleString()}
                    subtitle={`${stats?.flowguard.proposals.active ?? 0} pending`}
                    icon={FileText}
                    color="secondary"
                  />
                  <StatsCard
                    label="24h activity"
                    value={tx24h.toLocaleString()}
                    subtitle="new entities created"
                    icon={Activity}
                    color="muted"
                  />
                </>
              )}
            </section>

            {/* Search results */}
            {queryParam && (
              <div className="mb-6">
                {searchLoading && !searchResults ? (
                  <Card className="p-5">
                    <RowSkeleton count={4} />
                  </Card>
                ) : searchError ? (
                  <InlineStatusBanner
                    variant="error"
                    title="Search failed"
                    description={searchError}
                    onRetry={() => runSearch(queryParam)}
                  />
                ) : searchResults ? (
                  <SearchResultsPanel
                    results={searchResults}
                    network={network}
                    onSelectAddress={selectAddress}
                    onClose={clearSearch}
                  />
                ) : null}
              </div>
            )}

            {/* Scope + filter controls */}
            <section className="mb-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-textMuted">Scope</p>
                  <ScopeTabs scope={scope} onChange={handleScopeChange} walletAddress={wallet.address || null} />
                </div>
                <div className="flex items-center gap-2">
                  {scope === 'personal' && wallet.address && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surfaceAlt px-3 py-1.5 text-xs text-textPrimary">
                      <Wallet className="h-3.5 w-3.5 text-primary" />
                      <span className="font-mono">{formatAddress(wallet.address)}</span>
                    </span>
                  )}
                  <Button variant="outline" size="sm" onClick={loadTransactions}>
                    <RefreshCw className={`mr-2 h-3.5 w-3.5 ${txLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </div>
            </section>

            <section className="mb-4 space-y-3">
              <div>
                <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-textMuted">Entity type</p>
                <div className="flex flex-wrap gap-2">
                  {TYPE_FILTER_TABS.map((tab) => (
                    <FilterChip
                      key={tab.value}
                      value={tab.value}
                      active={entityType}
                      label={tab.label}
                      icon={tab.icon}
                      onSelect={handleTypeChange}
                    />
                  ))}
                  {SECONDARY_TYPE_LINKS.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      className="inline-flex items-center gap-2 rounded-full border border-dashed border-border bg-surface px-3 py-1.5 text-xs font-medium text-textMuted transition-colors hover:border-primary/40 hover:text-textPrimary"
                    >
                      <link.icon className="h-3.5 w-3.5" />
                      {link.label}
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-textMuted">Status</p>
                <div className="flex flex-wrap gap-2">
                  {STATUS_FILTERS.map((status) => (
                    <FilterChip
                      key={status.value}
                      value={status.value}
                      active={statusFilter}
                      label={status.label}
                      onSelect={handleStatusChange}
                    />
                  ))}
                </div>
              </div>
            </section>

            {/* Main grid: activity + optional address panel */}
            <section className={`grid gap-6 ${activeAddress ? 'lg:grid-cols-[1fr_360px]' : ''}`}>
              <div className="space-y-4">
                {personalDisabled && (
                  <InlineStatusBanner
                    variant="info"
                    title="Connect a wallet for personal activity"
                    description="Personal scope filters the feed to the addresses your wallet controls."
                  />
                )}

                {txError && (
                  <InlineStatusBanner
                    variant="error"
                    title="Couldn't load activity"
                    description={txError}
                    onRetry={loadTransactions}
                  />
                )}

                <Card padding="none" className="overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border/60 bg-surfaceAlt/60 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Box className="h-4 w-4 text-primary" />
                      <h2 className="font-display text-base text-textPrimary">Activity</h2>
                      {!txLoading && (
                        <span className="rounded-full bg-primarySoft px-2 py-0.5 font-mono text-[10px] text-primaryHover">
                          {txTotal.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-textMuted">
                      sorted newest → oldest
                    </span>
                  </div>

                  {txLoading ? (
                    <div className="p-4">
                      <RowSkeleton count={8} />
                    </div>
                  ) : transactions.length === 0 ? (
                    <div className="px-6 py-16 text-center">
                      <Inbox className="mx-auto mb-3 h-10 w-10 text-textMuted" />
                      <p className="font-sans text-sm font-semibold text-textPrimary">No activity</p>
                      <p className="mt-1 font-sans text-xs text-textMuted">
                        {scope === 'personal'
                          ? 'No on-chain activity for the connected wallet under these filters.'
                          : 'Try widening the entity type or status filters.'}
                      </p>
                      <div className="mt-4 flex justify-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleTypeChange('all')}>
                          Reset entity type
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleStatusChange('all')}>
                          Reset status
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Desktop table */}
                      <div className="hidden lg:block">
                        <table className="w-full">
                          <thead className="bg-surfaceAlt/30">
                            <tr>
                              <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-textMuted">Type</th>
                              <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-textMuted">Entity</th>
                              <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-textMuted">Parties</th>
                              <th className="px-4 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-textMuted">Amount</th>
                              <th className="px-4 py-3 text-center font-mono text-[11px] uppercase tracking-wider text-textMuted">Status</th>
                              <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-textMuted">Latest event</th>
                              <th className="px-4 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-textMuted">Time / Tx</th>
                            </tr>
                          </thead>
                          <tbody>
                            {transactions.map((tx) => (
                              <TransactionRow
                                key={`${tx.tx_type}-${tx.id}`}
                                tx={tx}
                                network={network}
                                onSelectAddress={selectAddress}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Mobile cards */}
                      <div className="space-y-3 p-3 lg:hidden">
                        {transactions.map((tx) => (
                          <TransactionCard
                            key={`m-${tx.tx_type}-${tx.id}`}
                            tx={tx}
                            network={network}
                            onSelectAddress={selectAddress}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </Card>

                <PaginationBar
                  page={page}
                  total={txTotal}
                  pageSize={PAGE_SIZE}
                  onPageChange={handlePageChange}
                />
              </div>

              {activeAddress && (
                <aside>
                  <AddressPanel
                    address={activeAddress}
                    data={addressData}
                    loading={addressLoading}
                    error={addressError}
                    onClose={closeAddress}
                    onRetry={() => loadAddress(activeAddress)}
                    network={network}
                  />
                </aside>
              )}
            </section>

            {/* Cross-links */}
            <section className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card padding="md" hover className="flex items-start gap-3">
                <div className="rounded-full bg-primarySoft p-2">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-display text-sm text-textPrimary">Browse vaults</p>
                  <p className="font-sans text-xs text-textMuted">Inspect treasury covenants and signer sets.</p>
                  <button
                    type="button"
                    onClick={() => navigate('/vaults')}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primaryHover"
                  >
                    Open vaults <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </Card>
              <Card padding="md" hover className="flex items-start gap-3">
                <div className="rounded-full bg-primarySoft p-2">
                  <Waves className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-display text-sm text-textPrimary">Stream workspace</p>
                  <p className="font-sans text-xs text-textMuted">Manage active schedules, payouts, and refills.</p>
                  <button
                    type="button"
                    onClick={() => navigate('/streams')}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primaryHover"
                  >
                    Open streams <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </Card>
              <Card padding="md" hover className="flex items-start gap-3">
                <div className="rounded-full bg-primarySoft p-2">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-display text-sm text-textPrimary">24h pulse</p>
                  <p className="font-sans text-xs text-textMuted">
                    {tx24h.toLocaleString()} new entities · {stats?.flowguard.streams.recent24h ?? 0} streams · {stats?.flowguard.vaults.recent24h ?? 0} vaults
                  </p>
                </div>
              </Card>
            </section>
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}
