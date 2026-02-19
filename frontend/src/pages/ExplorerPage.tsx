/**
 * Professional Bitcoin Cash Explorer
 * Sablier-quality blockchain explorer with comprehensive transaction filtering
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  TrendingUp,
  Activity,
  Zap,
  Users,
  DollarSign,
  Clock,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  BarChart3,
  Globe2,
  Download,
  ArrowUpRight,
  Filter,
} from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { CircularProgress } from '../components/streams/CircularProgress';
import { getExplorerTxUrl, getExplorerAddressUrl } from '../utils/blockchain';

interface ExplorerStats {
  network: {
    blockHeight: number;
    network: string;
  };
  flowguard: {
    vaults: { total: number; totalValue: number; recent24h: number };
    streams: { total: number; active: number; totalVolume: number; recent24h: number };
    proposals: { total: number; active: number; totalAmount: number; recent24h: number };
  };
}

interface Transaction {
  id: string;
  name?: string;
  sender?: string;
  recipient?: string;
  amount: number;
  tx_type: string;
  status: string;
  created_at: string;
  contract_address?: string;
  vault_id?: string;
  tx_hash?: string;
}

type ViewMode = 'overview' | 'transactions' | 'timeline';
type TxTypeFilter = 'ALL' | 'VESTING' | 'STREAMING' | 'AIRDROP' | 'VAULT' | 'PAYMENT' | 'PROPOSAL';
type TokenFilter = 'ALL' | 'BCH' | 'CASHTOKENS';
type StatusFilter = 'ALL' | 'ACTIVE' | 'PENDING' | 'COMPLETED' | 'EXECUTED';

export default function ExplorerPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [stats, setStats] = useState<ExplorerStats | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<TxTypeFilter>('ALL');
  const [tokenFilter, setTokenFilter] = useState<TokenFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch stats
  useEffect(() => {
    fetchStats();
    const interval = autoRefresh ? setInterval(fetchStats, 30000) : undefined;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  // Fetch data based on view mode
  useEffect(() => {
    switch (viewMode) {
      case 'transactions':
        fetchTransactions();
        break;
      case 'timeline':
        fetchTimeline();
        break;
      default:
        break;
    }
  }, [viewMode, txTypeFilter, tokenFilter, statusFilter]);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/explorer/stats');
      const data = await response.json();
      setStats(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (txTypeFilter !== 'ALL') {
        // Map UI filter to backend type
        const typeMap: Record<string, string> = {
          VESTING: 'stream',
          STREAMING: 'stream',
          AIRDROP: 'airdrop',
          VAULT: 'vault',
          PAYMENT: 'payment',
          PROPOSAL: 'proposal',
        };
        params.append('type', typeMap[txTypeFilter]);
      }
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const response = await fetch(`/api/explorer/transactions?${params}`);
      const data = await response.json();

      // Client-side token filtering
      let filtered = data.transactions || [];
      if (tokenFilter !== 'ALL') {
        filtered = filtered.filter((tx: any) => {
          if (tokenFilter === 'BCH') return tx.token_type === 'BCH' || !tx.token_type;
          if (tokenFilter === 'CASHTOKENS') return tx.token_type === 'CASHTOKENS';
          return true;
        });
      }

      setTransactions(filtered);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeline = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/explorer/timeline?limit=100');
      const data = await response.json();
      setTimeline(data.timeline || []);
    } catch (error) {
      console.error('Failed to fetch timeline:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/explorer/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      setSearchResults(data);
      setViewMode('overview');
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (transactions.length === 0) return;

    const headers = ['Type', 'ID', 'Sender', 'Recipient', 'Amount (BCH)', 'Status', 'Date'];
    const rows = transactions.map(tx => [
      tx.tx_type,
      tx.id,
      tx.sender || '-',
      tx.recipient || '-',
      tx.amount.toFixed(8),
      tx.status,
      formatDate(tx.created_at),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `flowguard-explorer-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatAmount = (amount: number) => amount.toFixed(4) + ' BCH';
  const formatDate = (date: string) => new Date(date).toLocaleString();
  const formatAddress = (address: string) =>
    address ? `${address.slice(0, 15)}...${address.slice(-10)}` : '';

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'ACTIVE':
        return 'text-accent bg-accentDim border-accent';
      case 'PENDING':
        return 'text-secondary bg-secondary/10 border-secondary';
      case 'COMPLETED':
      case 'EXECUTED':
      case 'DEPLOYED':
        return 'text-primary bg-primarySoft border-primary';
      default:
        return 'text-textMuted bg-surfaceAlt border-border';
    }
  };

  if (loading && !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-textSecondary font-sans">Loading Explorer...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-grow pb-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          {/* Header */}
          <div className="mb-6 md:mb-8">
            <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-6 md:mb-8">
              <div>
                <h1 className="font-display font-medium text-3xl md:text-5xl lg:text-6xl text-textPrimary mb-4">
                  Explorer
                </h1>
                <p className="font-sans text-textMuted max-w-2xl text-sm leading-relaxed">
                  Professional Bitcoin Cash Treasury & Streaming Explorer. Search and monitor all FlowGuard activity.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">{autoRefresh ? 'Auto-refresh: ' : 'Auto-refresh: '}</span>{autoRefresh ? 'ON' : 'OFF'}
                </Button>
                {viewMode === 'transactions' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportToCSV}
                    className="flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">Export</span> CSV
                  </Button>
                )}
              </div>
            </div>

            {/* Search Bar */}
            <div className="mb-6 md:mb-8">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-textMuted" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search addresses, contracts, vaults, streams, proposals..."
                    className="pl-12 py-3 border-border"
                  />
                </div>
                <Button
                  onClick={handleSearch}
                  size="lg"
                  className="px-4 md:px-8"
                >
                  <Search className="w-4 h-4 md:mr-2" />
                  <span className="hidden md:inline">Search</span>
                </Button>
              </div>
            </div>

            {/* Stats Cards */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
                <Card padding="md" className="flex items-center gap-4 border-border/40 shadow-sm">
                  <div className="p-3 bg-surfaceAlt rounded-full">
                    <BarChart3 className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <div className="font-mono text-xs text-textMuted uppercase tracking-wider mb-1">Block Height</div>
                    <div className="font-display text-2xl md:text-3xl text-textPrimary">{stats.network.blockHeight.toLocaleString()}</div>
                  </div>
                </Card>

                <Card padding="md" className="flex items-center gap-4 border-border/40 shadow-sm">
                  <div className="p-3 bg-accent/10 rounded-full">
                    <Users className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <div className="font-mono text-xs text-textMuted uppercase tracking-wider mb-1">Total Vaults</div>
                    <div className="font-display text-2xl md:text-3xl text-textPrimary">{stats.flowguard.vaults.total}</div>
                  </div>
                </Card>

                <Card padding="md" className="flex items-center gap-4 border-border/40 shadow-sm">
                  <div className="p-3 bg-surfaceAlt rounded-full">
                    <TrendingUp className="w-6 h-6 text-secondary" />
                  </div>
                  <div>
                    <div className="font-mono text-xs text-textMuted uppercase tracking-wider mb-1">Active Streams</div>
                    <div className="font-display text-2xl md:text-3xl text-textPrimary">{stats.flowguard.streams.active}</div>
                  </div>
                </Card>

                <Card padding="md" className="flex items-center gap-4 border-border/40 shadow-sm">
                  <div className="p-3 bg-surfaceAlt rounded-full">
                    <Activity className="w-6 h-6 text-textMuted" />
                  </div>
                  <div>
                    <div className="font-mono text-xs text-textMuted uppercase tracking-wider mb-1">Proposals</div>
                    <div className="font-display text-2xl md:text-3xl text-textPrimary">{stats.flowguard.proposals.active}</div>
                  </div>
                </Card>
              </div>
            )}

            {/* View Mode Tabs */}
            <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
              {[
                { mode: 'overview', label: 'Overview', icon: Globe2 },
                { mode: 'transactions', label: 'Transactions', icon: Activity },
                { mode: 'timeline', label: 'Timeline', icon: Clock },
              ].map(({ mode, label, icon: Icon }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode as ViewMode)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg font-sans font-medium transition-all whitespace-nowrap ${viewMode === mode
                      ? 'bg-primary text-white shadow-lg'
                      : 'bg-surface text-textSecondary hover:bg-surfaceAlt border border-border'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Comprehensive Filters - Transaction View Only */}
            {viewMode === 'transactions' && (
              <Card className="p-4 bg-surfaceAlt border-border">
                <div className="flex flex-col md:flex-row gap-4">
                  {/* Transaction Type Filter */}
                  <div className="flex-1">
                    <label className="text-xs text-textMuted font-sans mb-2 block">Transaction Type</label>
                    <div className="flex flex-wrap gap-1">
                      {(['ALL', 'VESTING', 'STREAMING', 'AIRDROP', 'VAULT', 'PAYMENT', 'PROPOSAL'] as TxTypeFilter[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => setTxTypeFilter(type)}
                          className={`px-3 py-1.5 rounded-md text-xs font-sans font-medium transition-colors ${txTypeFilter === type
                              ? 'bg-primary text-white shadow-sm'
                              : 'bg-surface text-textSecondary hover:bg-primarySoft border border-border'
                            }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Token Filter */}
                  <div>
                    <label className="text-xs text-textMuted font-sans mb-2 block">Token Type</label>
                    <div className="flex gap-1">
                      {(['ALL', 'BCH', 'CASHTOKENS'] as TokenFilter[]).map((token) => (
                        <button
                          key={token}
                          onClick={() => setTokenFilter(token)}
                          className={`px-3 py-1.5 rounded-md text-xs font-sans font-medium transition-colors ${tokenFilter === token
                              ? 'bg-accent text-white shadow-sm'
                              : 'bg-surface text-textSecondary hover:bg-accentDim border border-border'
                            }`}
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Status Filter */}
                  <div>
                    <label className="text-xs text-textMuted font-sans mb-2 block">Status</label>
                    <div className="flex gap-1">
                      {(['ALL', 'ACTIVE', 'PENDING', 'COMPLETED', 'EXECUTED'] as StatusFilter[]).map((status) => (
                        <button
                          key={status}
                          onClick={() => setStatusFilter(status)}
                          className={`px-3 py-1.5 rounded-md text-xs font-sans font-medium transition-colors ${statusFilter === status
                              ? 'bg-secondary text-textPrimary shadow-sm'
                              : 'bg-surface text-textSecondary hover:bg-secondary/10 border border-border'
                            }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Export Button */}
                  {transactions.length > 0 && (
                    <div className="flex items-end">
                      <Button
                        variant="outline"
                        onClick={exportToCSV}
                        className="flex items-center gap-2 whitespace-nowrap"
                      >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Export</span> CSV
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* Search Results */}
          {searchResults && (
            <Card className="mb-6 p-6">
              <h2 className="text-xl font-display font-bold text-textPrimary mb-4">
                Search Results for "{searchQuery}" ({searchResults.totalResults})
              </h2>

              {searchResults.results.vaults.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-sans font-semibold text-textPrimary mb-3 flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Vaults ({searchResults.results.vaults.length})
                  </h3>
                  <div className="space-y-2">
                    {searchResults.results.vaults.map((vault: any) => (
                      <Link
                        key={vault.vault_id}
                        to={`/vaults/${vault.vault_id}`}
                        className="block p-4 bg-surfaceAlt rounded-lg hover:bg-surface transition-colors border border-border"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-sans font-medium text-textPrimary">{vault.name}</p>
                            <p className="text-sm text-textMuted font-mono">{vault.vault_id}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-display font-bold text-primary">{vault.total_deposit} BCH</p>
                            <p className="text-xs text-textMuted font-sans">{formatDate(vault.created_at)}</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {searchResults.results.streams.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-sans font-semibold text-textPrimary mb-3 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Streams ({searchResults.results.streams.length})
                  </h3>
                  <div className="space-y-2">
                    {searchResults.results.streams.map((stream: any) => (
                      <Link
                        key={stream.stream_id}
                        to={`/streams/${stream.stream_id}`}
                        className="block p-4 bg-surfaceAlt rounded-lg hover:bg-surface transition-colors border border-border"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-sans font-medium text-textPrimary">{stream.stream_id}</p>
                            <p className="text-sm text-textMuted font-mono">
                              {formatAddress(stream.sender)} → {formatAddress(stream.recipient)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-display font-bold text-primary">{stream.total_amount} BCH</p>
                            <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(stream.status)}`}>
                              {stream.status}
                            </span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {searchResults.totalResults === 0 && (
                <p className="text-center text-textMuted font-sans py-8">No results found for "{searchQuery}"</p>
              )}
            </Card>
          )}

          {/* Overview Mode */}
          {viewMode === 'overview' && stats && !searchResults && (
            <div className="space-y-6">
              {/* Main Stats with Circular Progress */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 shadow-sm">
                  <div className="flex flex-col items-center">
                    <CircularProgress
                      percentage={Math.min(100, (stats.flowguard.vaults.totalValue / 1000) * 100)}
                      size={180}
                      strokeWidth={12}
                      label="TVL"
                    />
                    <div className="mt-4 text-center">
                      <p className="text-sm text-textMuted font-sans">Total Value Locked</p>
                      <p className="text-lg md:text-xl lg:text-2xl font-display font-bold text-primary mt-1">
                        {stats.flowguard.vaults.totalValue.toFixed(4)} BCH
                      </p>
                    </div>
                  </div>
                </Card>

                <Card className="p-6 shadow-sm">
                  <div className="flex flex-col items-center">
                    <CircularProgress
                      percentage={Math.min(100, (stats.flowguard.streams.totalVolume / 500) * 100)}
                      size={180}
                      strokeWidth={12}
                      label="Volume"
                    />
                    <div className="mt-4 text-center">
                      <p className="text-sm text-textMuted font-sans">Streaming Volume</p>
                      <p className="text-lg md:text-xl lg:text-2xl font-display font-bold text-accent mt-1">
                        {stats.flowguard.streams.totalVolume.toFixed(4)} BCH
                      </p>
                    </div>
                  </div>
                </Card>

                <Card className="p-6 shadow-sm">
                  <div className="flex flex-col items-center">
                    <CircularProgress
                      percentage={Math.min(100, (stats.flowguard.proposals.totalAmount / 200) * 100)}
                      size={180}
                      strokeWidth={12}
                      label="Proposals"
                    />
                    <div className="mt-4 text-center">
                      <p className="text-sm text-textMuted font-sans">Proposed Amount</p>
                      <p className="text-lg md:text-xl lg:text-2xl font-display font-bold text-secondary mt-1">
                        {stats.flowguard.proposals.totalAmount.toFixed(4)} BCH
                      </p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Activity Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 24h Activity */}
                <Card className="p-6 shadow-sm">
                  <h3 className="text-xl font-display font-bold text-textPrimary mb-4 flex items-center gap-2">
                    <Activity className="w-6 h-6 text-primary" />
                    24h Activity
                  </h3>
                  <div className="space-y-4">
                    <div className="p-4 bg-surfaceAlt rounded-lg border border-border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-primary font-display font-bold text-2xl">+{stats.flowguard.vaults.recent24h}</p>
                          <p className="text-textMuted text-sm font-sans mt-1">New Vaults Created</p>
                        </div>
                        <ArrowUpRight className="w-6 h-6 text-primary" />
                      </div>
                    </div>

                    <div className="p-4 bg-surfaceAlt rounded-lg border border-border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-accent font-display font-bold text-2xl">+{stats.flowguard.streams.recent24h}</p>
                          <p className="text-textMuted text-sm font-sans mt-1">New Streams Started</p>
                        </div>
                        <ArrowUpRight className="w-6 h-6 text-accent" />
                      </div>
                    </div>

                    <div className="p-4 bg-surfaceAlt rounded-lg border border-border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-secondary font-display font-bold text-2xl">+{stats.flowguard.proposals.recent24h}</p>
                          <p className="text-textMuted text-sm font-sans mt-1">New Proposals Created</p>
                        </div>
                        <ArrowUpRight className="w-6 h-6 text-secondary" />
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Network Stats */}
                <Card className="p-6 shadow-sm">
                  <h3 className="text-xl font-display font-bold text-textPrimary mb-4 flex items-center gap-2">
                    <BarChart3 className="w-6 h-6 text-primary" />
                    Network Stats
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-surfaceAlt rounded-lg border border-border">
                      <div>
                        <p className="text-sm text-textMuted font-sans">Total Vaults</p>
                        <p className="text-lg md:text-xl lg:text-2xl font-display font-bold text-primary">{stats.flowguard.vaults.total}</p>
                      </div>
                      <Users className="w-8 h-8 text-primary opacity-50" />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-surfaceAlt rounded-lg border border-border">
                      <div>
                        <p className="text-sm text-textMuted font-sans">Active Streams</p>
                        <p className="text-lg md:text-xl lg:text-2xl font-display font-bold text-accent">{stats.flowguard.streams.active}</p>
                      </div>
                      <TrendingUp className="w-8 h-8 text-accent opacity-50" />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-surfaceAlt rounded-lg border border-border">
                      <div>
                        <p className="text-sm text-textMuted font-sans">Active Proposals</p>
                        <p className="text-lg md:text-xl lg:text-2xl font-display font-bold text-secondary">{stats.flowguard.proposals.active}</p>
                      </div>
                      <Activity className="w-8 h-8 text-secondary opacity-50" />
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* Transactions Mode */}
          {viewMode === 'transactions' && (
            <Card className="p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg md:text-xl lg:text-2xl font-display font-bold text-textPrimary">All Transactions</h2>
                <p className="text-sm text-textMuted font-sans">
                  {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                </p>
              </div>

              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent mx-auto" />
                </div>
              ) : (
                <>
                  {/* Mobile & Tablet Card View */}
                  <div className="lg:hidden space-y-3">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="bg-surfaceAlt border border-border rounded-lg p-4 space-y-2">
                        <div className="flex justify-between items-start gap-3">
                          <span className="text-xs font-mono text-textMuted uppercase">Type</span>
                          <span className="px-2 py-1 rounded-full text-xs font-sans font-medium bg-primary/10 text-primary border border-primary/20">
                            {tx.tx_type}
                          </span>
                        </div>
                        <div className="flex justify-between items-start gap-3">
                          <span className="text-xs font-mono text-textMuted uppercase">Name</span>
                          <span className="text-sm text-textPrimary text-right font-mono truncate">{tx.name || tx.id.slice(0, 16)}</span>
                        </div>
                        <div className="flex justify-between items-start gap-3">
                          <span className="text-xs font-mono text-textMuted uppercase">Amount</span>
                          <span className="text-sm font-display font-bold text-primary">{formatAmount(tx.amount)}</span>
                        </div>
                        <div className="flex justify-between items-start gap-3">
                          <span className="text-xs font-mono text-textMuted uppercase">Status</span>
                          <span className={`px-2 py-1 rounded-full text-xs font-sans font-medium border ${getStatusColor(tx.status)}`}>
                            {tx.status}
                          </span>
                        </div>
                        <div className="flex justify-between items-start gap-3">
                          <span className="text-xs font-mono text-textMuted uppercase">Time</span>
                          <span className="text-xs text-textMuted text-right">{formatDate(tx.created_at)}</span>
                        </div>
                        {tx.tx_hash && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <a
                              href={getExplorerTxUrl(tx.tx_hash, 'chipnet')}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-2 text-sm text-primary hover:text-primaryHover font-mono"
                            >
                              View on Explorer
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View (1024px+) */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b-2 border-border bg-surfaceAlt">
                          <th className="text-left py-4 px-4 font-display font-bold text-textPrimary">Type</th>
                          <th className="text-left py-4 px-4 font-display font-bold text-textPrimary">ID / Name</th>
                          <th className="text-left py-4 px-4 font-display font-bold text-textPrimary">From / To</th>
                          <th className="text-right py-4 px-4 font-display font-bold text-textPrimary">Amount</th>
                          <th className="text-center py-4 px-4 font-display font-bold text-textPrimary">Status</th>
                          <th className="text-right py-4 px-4 font-display font-bold text-textPrimary">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((tx) => (
                          <tr key={tx.id} className="border-b border-border hover:bg-surfaceAlt transition-colors">
                            <td className="py-4 px-4">
                              <span className="px-3 py-1 rounded-full text-xs font-sans font-medium bg-primary/10 text-primary border border-primary/20">
                                {tx.tx_type}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <p className="font-sans font-medium text-textPrimary">{tx.name || tx.id.slice(0, 16)}</p>
                              {tx.tx_hash ? (
                                <a
                                  href={getExplorerTxUrl(tx.tx_hash, 'chipnet')}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-accent hover:text-accentHover font-mono flex items-center gap-1"
                                >
                                  {tx.tx_hash.slice(0, 16)}...{tx.tx_hash.slice(-8)}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <p className="text-xs text-textMuted font-mono">{tx.id}</p>
                              )}
                            </td>
                            <td className="py-4 px-4 text-sm font-mono">
                              {tx.sender && (
                                <a
                                  href={getExplorerAddressUrl(tx.sender, 'chipnet')}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-textMuted hover:text-primary"
                                >
                                  {formatAddress(tx.sender)}
                                </a>
                              )}
                              {tx.recipient && (
                                <p className="flex items-center gap-1 text-textPrimary">
                                  <ChevronRight className="w-3 h-3" />
                                  <a
                                    href={getExplorerAddressUrl(tx.recipient, 'chipnet')}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-accent"
                                  >
                                    {formatAddress(tx.recipient)}
                                  </a>
                                </p>
                              )}
                            </td>
                            <td className="py-4 px-4 text-right font-display font-bold text-primary">
                              {formatAmount(tx.amount)}
                            </td>
                            <td className="py-4 px-4 text-center">
                              <span className={`px-3 py-1 rounded-full text-xs font-sans font-medium border ${getStatusColor(tx.status)}`}>
                                {tx.status}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-right text-sm text-textMuted font-sans">
                              {formatDate(tx.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {transactions.length === 0 && (
                    <div className="text-center py-12">
                      <Filter className="w-12 h-12 text-textMuted mx-auto mb-3" />
                      <p className="text-textMuted font-sans">No transactions found with current filters</p>
                    </div>
                  )}
                </>
              )}
            </Card>
          )}

          {/* Timeline Mode */}
          {viewMode === 'timeline' && (
            <Card className="p-6 shadow-sm">
              <h2 className="text-lg md:text-xl lg:text-2xl font-display font-bold text-textPrimary mb-6">Activity Timeline</h2>

              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent mx-auto" />
                </div>
              ) : (
                <div className="space-y-4">
                  {timeline.map((event, idx) => (
                    <div key={idx} className="flex gap-4 p-4 bg-surfaceAlt rounded-lg hover:bg-surface transition-colors border border-border">
                      <div className="flex-shrink-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${event.type === 'VAULT_CREATED' ? 'bg-primary/10 border border-primary' :
                            event.type === 'STREAM_CREATED' ? 'bg-accent/10 border border-accent' :
                              'bg-secondary/10 border border-secondary'
                          }`}>
                          {event.type === 'VAULT_CREATED' && <Users className="w-5 h-5 text-primary" />}
                          {event.type === 'STREAM_CREATED' && <TrendingUp className="w-5 h-5 text-accent" />}
                          {event.type === 'PROPOSAL_CREATED' && <Activity className="w-5 h-5 text-secondary" />}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-sans font-semibold text-textPrimary">{event.type.replace('_', ' ')}</p>
                          <p className="text-sm text-textMuted font-sans">{formatDate(event.timestamp)}</p>
                        </div>
                        <p className="text-sm text-textMuted font-sans mb-2">{event.name || event.reason || event.id}</p>
                        {event.amount && <p className="text-sm font-display font-bold text-primary">{formatAmount(event.amount)}</p>}
                      </div>
                    </div>
                  ))}

                  {timeline.length === 0 && (
                    <div className="text-center py-12">
                      <Clock className="w-12 h-12 text-textMuted mx-auto mb-3" />
                      <p className="text-textMuted font-sans">No activity found</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
