/**
 * PaymentsPage - Professional Recurring Payments Management
 * Sablier-quality with DataTable, circular progress, CSV import/export
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Repeat, Plus, DollarSign, Clock, Zap, TrendingUp, Calendar, ExternalLink } from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { useWalletModal } from '../hooks/useWalletModal';
import { Button } from '../components/ui/Button';
import { SkeletonTable } from '../components/ui/Skeleton';
import { DataTable, Column } from '../components/shared/DataTable';
import { StatsCard } from '../components/shared/StatsCard';
import { getExplorerTxUrl } from '../utils/blockchain';
import { formatLogicalId } from '../utils/display';
import { formatTokenAmount, tokenSymbol } from '../utils/tokenFormat';

type PaymentStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
type PaymentInterval = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';

interface RecurringPayment {
  id: string;
  payment_id: string;
  sender: string;
  recipient: string;
  recipient_name?: string;
  token_type: 'BCH' | 'CASHTOKENS';
  token_category?: string | null;
  amount_per_period: number;
  interval: PaymentInterval;
  start_date: number;
  end_date?: number;
  next_payment_date: number;
  total_paid: number;
  payment_count: number;
  status: PaymentStatus;
  pausable: boolean;
  created_at: number;
  tx_hash?: string | null;
  latest_event?: {
    event_type: string;
    status?: string | null;
    tx_hash?: string | null;
    created_at: number;
  } | null;
}

export default function PaymentsPage() {
  const wallet = useWallet();
  const { openModal } = useWalletModal();
  const navigate = useNavigate();
  const [payments, setPayments] = useState<RecurringPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'sent' | 'received'>('sent');
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentStatus>('all');
  const network = import.meta.env.VITE_BCH_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet';

  const formatEventLabel = (eventType: string) => {
    switch (eventType) {
      case 'created':
        return 'Payment Created';
      case 'funded':
        return 'Payment Funded';
      case 'claim':
        return 'Payment Claimed';
      case 'paused':
        return 'Payment Paused';
      case 'resumed':
        return 'Payment Resumed';
      case 'cancelled':
        return 'Payment Cancelled';
      default:
        return eventType
          .split('_')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
    }
  };

  useEffect(() => {
    if (!wallet.address) {
      setLoading(false);
      return;
    }

    const fetchPayments = async () => {
      try {
        setLoading(true);
        const endpoint =
          viewMode === 'sent'
            ? `/api/payments?sender=${wallet.address}`
            : `/api/payments?recipient=${wallet.address}`;

        const response = await fetch(endpoint);
        const data = await response.json();
        setPayments(data.payments || []);
      } catch (error) {
        console.error('Failed to fetch payments:', error);
        setPayments([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPayments();
  }, [wallet.address, viewMode]);

  // Calculate stats
  const activePayments = payments.filter((p) => p.status === 'ACTIVE');

  type TokenKey = string;
  const tokenKey = (p: Pick<RecurringPayment, 'token_type' | 'token_category'>): TokenKey =>
    `${p.token_type}::${p.token_category ?? ''}`;

  const bucketsToString = (
    buckets: Map<TokenKey, { amount: number; tokenType: RecurringPayment['token_type']; tokenCategory?: string | null }>,
  ): string => {
    const entries = Array.from(buckets.values()).filter((b) => b.amount > 0);
    if (entries.length === 0) return '—';
    return entries
      .map((b) => `${formatTokenAmount(b.amount, b.tokenType, b.tokenCategory, { noSuffix: true })} ${tokenSymbol(b.tokenType, b.tokenCategory)}`)
      .join(' + ');
  };

  const totalPaidBuckets = new Map<TokenKey, { amount: number; tokenType: RecurringPayment['token_type']; tokenCategory?: string | null }>();
  for (const p of payments) {
    const key = tokenKey(p);
    const existing = totalPaidBuckets.get(key);
    if (existing) existing.amount += p.total_paid;
    else totalPaidBuckets.set(key, { amount: p.total_paid, tokenType: p.token_type, tokenCategory: p.token_category });
  }
  const totalPaidDisplay = bucketsToString(totalPaidBuckets);
  const totalPaidNumeric = payments.reduce((sum, p) => sum + p.total_paid, 0);

  const avgBuckets = new Map<TokenKey, { amount: number; tokenType: RecurringPayment['token_type']; tokenCategory?: string | null; count: number }>();
  for (const p of payments) {
    const key = tokenKey(p);
    const existing = avgBuckets.get(key);
    if (existing) {
      existing.amount += p.amount_per_period;
      existing.count += 1;
    } else {
      avgBuckets.set(key, { amount: p.amount_per_period, tokenType: p.token_type, tokenCategory: p.token_category, count: 1 });
    }
  }
  const avgPaymentDisplay = (() => {
    const entries = Array.from(avgBuckets.values()).filter((b) => b.count > 0);
    if (entries.length === 0) return '—';
    return entries
      .map((b) => {
        const avg = b.amount / b.count;
        return `${formatTokenAmount(avg, b.tokenType, b.tokenCategory, { noSuffix: true })} ${tokenSymbol(b.tokenType, b.tokenCategory)}`;
      })
      .join(' + ');
  })();

  // Calculate monthly equivalent outflow, bucketed per token
  const monthlyOutflowBuckets = new Map<TokenKey, { amount: number; tokenType: RecurringPayment['token_type']; tokenCategory?: string | null }>();
  for (const p of activePayments.filter((p) => viewMode === 'sent')) {
    const multiplier =
      p.interval === 'DAILY' ? 30 :
      p.interval === 'WEEKLY' ? 4.33 :
      p.interval === 'BIWEEKLY' ? 2.17 :
      p.interval === 'MONTHLY' ? 1 :
      p.interval === 'YEARLY' ? 0.083 : 1;
    const key = tokenKey(p);
    const existing = monthlyOutflowBuckets.get(key);
    const contribution = p.amount_per_period * multiplier;
    if (existing) existing.amount += contribution;
    else monthlyOutflowBuckets.set(key, { amount: contribution, tokenType: p.token_type, tokenCategory: p.token_category });
  }
  const totalMonthlyOutflowDisplay = bucketsToString(monthlyOutflowBuckets);

  // Filter payments
  const filteredPayments = payments.filter((payment) => {
    if (statusFilter !== 'all' && payment.status !== statusFilter) return false;
    return true;
  });

  // Table columns
  const columns: Column<RecurringPayment>[] = [
    {
      key: 'payment_id',
      label: 'Payment ID',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-sans font-medium text-textPrimary">
            {row.recipient_name || formatLogicalId(row.payment_id)}
          </p>
          <p className="text-xs text-textMuted font-mono">{formatLogicalId(row.payment_id)}</p>
        </div>
      ),
    },
    {
      key: viewMode === 'sent' ? 'recipient' : 'sender',
      label: viewMode === 'sent' ? 'Recipient' : 'Sender',
      sortable: true,
      render: (row) => {
        const address = viewMode === 'sent' ? row.recipient : row.sender;
        return (
          <p className="font-mono text-sm text-textMuted">
            {address.slice(0, 15)}...{address.slice(-10)}
          </p>
        );
      },
    },
    {
      key: 'amount_per_period',
      label: 'Amount per Period',
      sortable: true,
      className: 'text-right',
      render: (row) => (
        <div className="text-right">
          <p className="font-display font-bold text-primary">
            {formatTokenAmount(row.amount_per_period, row.token_type, row.token_category, { noSuffix: true })} {tokenSymbol(row.token_type, row.token_category)}
          </p>
          <p className="text-xs text-textMuted font-mono">{row.interval}</p>
        </div>
      ),
    },
    {
      key: 'total_paid',
      label: 'Total Paid',
      sortable: true,
      className: 'text-right',
      render: (row) => (
        <div className="text-right">
          <p className="font-display font-bold text-accent">
            {formatTokenAmount(row.total_paid, row.token_type, row.token_category, { noSuffix: true })} {tokenSymbol(row.token_type, row.token_category)}
          </p>
          <p className="text-xs text-textMuted font-mono">{row.payment_count} payments</p>
        </div>
      ),
    },
    {
      key: 'next_payment_date',
      label: 'Next Payment',
      sortable: true,
      render: (row) => {
        if (row.status !== 'ACTIVE') {
          return <span className="text-xs text-textMuted font-sans">-</span>;
        }
        const nextDate = new Date(row.next_payment_date * 1000);
        const isUpcoming = nextDate.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
        return (
          <div>
            <p className={`text-sm font-sans ${isUpcoming ? 'text-accent font-medium' : 'text-textPrimary'}`}>
              {nextDate.toLocaleDateString()}
            </p>
            <p className="text-xs text-textMuted font-mono">
              {nextDate.toLocaleTimeString()}
            </p>
          </div>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      className: 'text-center',
      render: (row) => {
        const statusColors = {
          ACTIVE: 'bg-accent/10 text-accent border-accent',
          PAUSED: 'bg-secondary/10 text-secondary border-secondary',
          CANCELLED: 'bg-surfaceAlt text-textMuted border-border',
          COMPLETED: 'bg-primary/10 text-primary border-primary',
        };
        return (
          <span
            className={`px-3 py-1 rounded-full text-xs font-sans font-medium border ${
              statusColors[row.status]
            }`}
          >
            {row.status}
          </span>
        );
      },
    },
    {
      key: 'latest_event',
      label: 'Latest Activity',
      render: (row) => {
        if (!row.latest_event) {
          return <span className="text-xs text-textMuted font-sans">No events</span>;
        }

        const latestTxHash = row.latest_event.tx_hash || row.tx_hash;
        return (
          <div className="space-y-1">
            <p className="text-sm font-sans text-textPrimary">
              {formatEventLabel(row.latest_event.event_type)}
            </p>
            <p className="text-xs text-textMuted font-mono">
              {new Date(row.latest_event.created_at * 1000).toLocaleString()}
            </p>
            {latestTxHash && (
              <a
                href={getExplorerTxUrl(latestTxHash, network)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs text-primary hover:text-primaryHover font-medium"
              >
                View Tx
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        );
      },
    },
  ];

  const handleImport = (data: any[]) => {
    console.log('Imported payments:', data);
    navigate('/payments/batch-create', { state: { importedData: data } });
  };

  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <Repeat className="w-16 h-16 text-textMuted mx-auto mb-4" />
          <h2 className="text-2xl font-display font-bold text-textPrimary mb-2">
            Connect Your Wallet
          </h2>
          <p className="text-textMuted font-sans mb-6">
            Please connect your wallet to view and manage recurring payments.
          </p>
          <Button onClick={openModal}>Connect Wallet</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 md:gap-6 mb-6 md:mb-8">
            <div>
              <h1 className="font-display font-medium text-3xl md:text-5xl lg:text-6xl text-textPrimary mb-3 md:mb-4">
                Recurring Payments
              </h1>
              <p className="font-sans text-textMuted max-w-2xl text-sm leading-relaxed">
                Automated recurring payments for salaries, subscriptions, allowances, and invoices.
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => navigate('/payments/create')}
              className="shadow-lg"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Payment
            </Button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
            <StatsCard
              label="Active Payments"
              value={activePayments.length}
              subtitle={`${payments.length} total`}
              icon={Repeat}
              color="primary"
            />
            <StatsCard
              label="Total Paid"
              value={totalPaidDisplay}
              subtitle="All time"
              icon={DollarSign}
              color="accent"
              progress={{
                percentage: Math.min(100, (totalPaidNumeric / 100) * 100),
                label: 'Paid',
              }}
            />
            <StatsCard
              label="Monthly Outflow"
              value={totalMonthlyOutflowDisplay}
              subtitle="Active payments"
              icon={TrendingUp}
              color="secondary"
            />
            <StatsCard
              label="Avg Payment"
              value={avgPaymentDisplay}
              subtitle="Per period"
              icon={Zap}
              color="muted"
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Button
              variant={viewMode === 'sent' ? 'primary' : 'outline'}
              onClick={() => setViewMode('sent')}
              className="flex items-center gap-2"
            >
              <DollarSign className="w-4 h-4" />
              Payments Sent
            </Button>
            <Button
              variant={viewMode === 'received' ? 'primary' : 'outline'}
              onClick={() => setViewMode('received')}
              className="flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              Payments Received
            </Button>
          </div>

          {/* Status Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-textMuted font-sans">Status:</span>
            {(['all', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-md text-xs font-sans font-medium transition-colors ${
                  statusFilter === status
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-surface text-textSecondary hover:bg-surfaceAlt border border-border'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Data Table */}
        {loading ? (
          <SkeletonTable rows={6} columns={5} />
        ) : (
          <DataTable
            columns={columns}
            data={filteredPayments}
            onRowClick={(payment) => navigate(`/payments/${payment.id}`)}
            enableSearch
            enableExport
            enableImport
            onImport={handleImport}
            emptyMessage="No recurring payments found. Create your first payment to get started."
          />
        )}
      </div>
    </div>
  );
}
