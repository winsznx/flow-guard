/**
 * Indexer Status Dashboard
 * Internal/operator-facing monitoring dashboard for indexer health
 *
 * This is NOT user-facing - it's for operators to monitor system health
 */

import { useState, useEffect } from 'react';
import {
  Activity,
  Database,
  Wifi,
  Clock,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Server,
  Cpu,
  HardDrive,
  Zap,
  RefreshCw,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Footer } from '../components/layout/Footer';

interface IndexerStatus {
  success: boolean;
  timestamp: number;
  sync: {
    status: string;
    currentBlock: number;
    networkBlock: number;
    blocksBehind: number;
    syncSpeed: number;
    lastSyncTime: string;
    syncProgress: string | number;
  };
  processing: {
    totalTransactions: number;
    processingRate: number;
    processingRatePerSecond: string;
    decodeSuccessRate: number;
    decodeErrors: number;
    breakdown: {
      vaults: number;
      streams: number;
      proposals: number;
      airdrops: number;
    };
  };
  health: {
    status: string;
    uptime: {
      seconds: number;
      formatted: string;
      startTime: string;
    };
    errors: {
      total: number;
      lastHour: number;
      lastDay: number;
      recent: any[];
    };
    warnings: {
      total: number;
      lastHour: number;
      lastDay: number;
    };
    healthScore: number;
  };
  database: {
    sizeMB: string;
    tables: {
      vaults: number;
      streams: number;
      proposals: number;
      airdrops: number;
      total: number;
    };
    performance: {
      avgQueryTimeMs: string;
      slowQueries: number;
    };
    connections: {
      active: number;
      idle: number;
      max: number;
    };
  };
  network: {
    name: string;
    electrumStatus: string;
    latencyMs?: number;
    failedRequests: number;
    reconnectionAttempts: number;
    error?: string;
  };
  resources: {
    cpu?: {
      usage: any;
      loadAverage: number[];
    };
    memory: {
      usedMB: string;
      totalMB?: string;
      rss?: string;
    };
    platform?: string;
    nodeVersion?: string;
  };
}

export default function IndexerStatusPage() {
  const [status, setStatus] = useState<IndexerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    fetchStatus();
    const interval = autoRefresh ? setInterval(fetchStatus, 5000) : undefined;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/admin/indexer/status');
      const data = await response.json();
      setStatus(data);
      setLastUpdate(new Date());
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch indexer status:', error);
      setLoading(false);
    }
  };

  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case 'SYNCED': return 'text-green-500';
      case 'SYNCING': return 'text-blue-500';
      case 'BEHIND': return 'text-yellow-500';
      case 'STALLED': return 'text-orange-500';
      case 'NETWORK_ERROR': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getSyncStatusIcon = (status: string) => {
    switch (status) {
      case 'SYNCED': return <CheckCircle className="w-5 h-5" />;
      case 'SYNCING': return <RefreshCw className="w-5 h-5 animate-spin" />;
      case 'BEHIND': return <Clock className="w-5 h-5" />;
      case 'STALLED': return <AlertTriangle className="w-5 h-5" />;
      case 'NETWORK_ERROR': return <XCircle className="w-5 h-5" />;
      default: return <Activity className="w-5 h-5" />;
    }
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 70) return 'text-yellow-500';
    if (score >= 50) return 'text-orange-500';
    return 'text-red-500';
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-grow p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {loading && !status ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="w-6 h-6 md:w-8 md:h-8 animate-spin text-accent" />
            </div>
          ) : !status ? (
            <div className="text-center px-4">
              <AlertCircle className="w-12 h-12 md:w-16 md:h-16 text-error mx-auto mb-4" />
              <h2 className="text-xl md:text-2xl font-bold text-textPrimary mb-2">Failed to Load Indexer Status</h2>
              <p className="text-sm md:text-base text-textMuted mb-4">Could not connect to indexer monitoring service</p>
              <Button onClick={fetchStatus}>Retry</Button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="mb-6 md:mb-8">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-textPrimary mb-2">
                      Indexer Status
                    </h1>
                    <p className="text-sm md:text-base text-textMuted font-mono">
                      Operational monitoring dashboard
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:gap-4">
                    <div className="text-left md:text-right">
                      <div className="text-xs md:text-sm text-textMuted font-mono">Last Update</div>
                      <div className="text-xs md:text-sm font-mono text-textPrimary">
                        {lastUpdate.toLocaleTimeString()}
                      </div>
                    </div>
                    <Button
                      onClick={fetchStatus}
                      variant="secondary"
                      className="flex items-center gap-2 text-sm"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span className="hidden sm:inline">Refresh</span>
                    </Button>
                    <button
                      onClick={() => setAutoRefresh(!autoRefresh)}
                      className={`px-3 md:px-4 py-2 rounded-lg font-mono text-xs md:text-sm transition-colors whitespace-nowrap ${autoRefresh
                        ? 'bg-accent text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                      {autoRefresh ? 'Auto: ON' : 'Auto: OFF'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Sync Status Banner */}
              <Card className="mb-6 p-4 md:p-6 border-2 border-accent/20">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className={`${getSyncStatusColor(status.sync.status)}`}>
                      {getSyncStatusIcon(status.sync.status)}
                    </div>
                    <div>
                      <div className="text-xl md:text-2xl font-bold text-textPrimary">
                        {status.sync.status.replace('_', ' ')}
                      </div>
                      <div className="text-xs md:text-sm text-textMuted font-mono">
                        Block {status.sync.currentBlock.toLocaleString()} / {status.sync.networkBlock.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 md:gap-6 lg:gap-8">
                    <div>
                      <div className="text-xs md:text-sm text-textMuted font-mono">Blocks Behind</div>
                      <div className="text-lg md:text-2xl font-bold text-textPrimary">
                        {status.sync.blocksBehind.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs md:text-sm text-textMuted font-mono">Sync Speed</div>
                      <div className="text-lg md:text-2xl font-bold text-textPrimary">
                        {status.sync.syncSpeed.toFixed(1)} <span className="hidden sm:inline">blk/min</span><span className="sm:hidden">b/m</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs md:text-sm text-textMuted font-mono">Progress</div>
                      <div className="text-lg md:text-2xl font-bold text-textPrimary">
                        {status.sync.syncProgress}%
                      </div>
                    </div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-4 bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-accent h-full transition-all duration-300"
                    style={{ width: `${status.sync.syncProgress}%` }}
                  />
                </div>
              </Card>

              {/* Main Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-6">
                {/* Processing Metrics */}
                <Card className="p-4 md:p-6">
                  <div className="flex items-start justify-between mb-3 md:mb-4">
                    <div>
                      <div className="text-xs md:text-sm text-textMuted font-mono mb-1">Processing Rate</div>
                      <div className="text-2xl md:text-3xl font-bold text-textPrimary">
                        {status.processing.processingRate}
                      </div>
                      <div className="text-xs md:text-sm text-textMuted font-mono">tx/hour</div>
                    </div>
                    <TrendingUp className="w-6 h-6 md:w-8 md:h-8 text-accent flex-shrink-0" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-textMuted font-mono">Total Indexed</span>
                      <span className="font-bold text-textPrimary">
                        {status.processing.totalTransactions.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-textMuted font-mono">Decode Success</span>
                      <span className="font-bold text-green-500">
                        {status.processing.decodeSuccessRate}%
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-textMuted font-mono">Decode Errors</span>
                      <span className="font-bold text-textPrimary">
                        {status.processing.decodeErrors}
                      </span>
                    </div>
                  </div>
                </Card>

                {/* Service Health */}
                <Card className="p-4 md:p-6">
                  <div className="flex items-start justify-between mb-3 md:mb-4">
                    <div>
                      <div className="text-xs md:text-sm text-textMuted font-mono mb-1">Health Score</div>
                      <div className={`text-2xl md:text-3xl font-bold ${getHealthScoreColor(status.health.healthScore)}`}>
                        {status.health.healthScore}
                      </div>
                      <div className="text-xs md:text-sm text-textMuted font-mono">/ 100</div>
                    </div>
                    <Activity className="w-6 h-6 md:w-8 md:h-8 text-accent flex-shrink-0" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-textMuted font-mono">Uptime</span>
                      <span className="font-bold text-textPrimary font-mono">
                        {status.health.uptime.formatted}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-textMuted font-mono">Errors (24h)</span>
                      <span className={`font-bold ${status.health.errors.lastDay > 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {status.health.errors.lastDay}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-textMuted font-mono">Warnings (24h)</span>
                      <span className={`font-bold ${status.health.warnings.lastDay > 0 ? 'text-yellow-500' : 'text-green-500'}`}>
                        {status.health.warnings.lastDay}
                      </span>
                    </div>
                  </div>
                </Card>

                {/* Network Connectivity */}
                <Card className="p-4 md:p-6">
                  <div className="flex items-start justify-between mb-3 md:mb-4">
                    <div>
                      <div className="text-xs md:text-sm text-textMuted font-mono mb-1">Network</div>
                      <div className="text-2xl md:text-3xl font-bold text-textPrimary capitalize">
                        {status.network.name}
                      </div>
                      <div className={`text-xs md:text-sm font-mono ${status.network.electrumStatus === 'CONNECTED' ? 'text-green-500' : 'text-red-500'}`}>
                        {status.network.electrumStatus}
                      </div>
                    </div>
                    <Wifi className="w-6 h-6 md:w-8 md:h-8 text-accent flex-shrink-0" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-textMuted font-mono">Latency</span>
                      <span className="font-bold text-textPrimary">
                        {status.network.latencyMs ? `${status.network.latencyMs}ms` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-textMuted font-mono">Failed Requests</span>
                      <span className="font-bold text-textPrimary">
                        {status.network.failedRequests}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-textMuted font-mono">Reconnects</span>
                      <span className="font-bold text-textPrimary">
                        {status.network.reconnectionAttempts}
                      </span>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Contract Type Breakdown */}
              <Card className="mb-6 p-4 md:p-6">
                <h3 className="text-lg md:text-xl font-bold text-textPrimary mb-3 md:mb-4 flex items-center gap-2">
                  <Database className="w-4 h-4 md:w-5 md:h-5 text-accent" />
                  Contract Type Breakdown
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                  <div className="text-center p-3 md:p-4 bg-brand-100 rounded-lg">
                    <div className="text-2xl md:text-3xl font-bold text-textPrimary">
                      {status.processing.breakdown.vaults.toLocaleString()}
                    </div>
                    <div className="text-xs md:text-sm text-textMuted font-mono mt-1">Vaults</div>
                  </div>
                  <div className="text-center p-3 md:p-4 bg-brand-100 rounded-lg">
                    <div className="text-2xl md:text-3xl font-bold text-textPrimary">
                      {status.processing.breakdown.streams.toLocaleString()}
                    </div>
                    <div className="text-xs md:text-sm text-textMuted font-mono mt-1">Streams</div>
                  </div>
                  <div className="text-center p-3 md:p-4 bg-brand-100 rounded-lg">
                    <div className="text-2xl md:text-3xl font-bold text-textPrimary">
                      {status.processing.breakdown.proposals.toLocaleString()}
                    </div>
                    <div className="text-xs md:text-sm text-textMuted font-mono mt-1">Proposals</div>
                  </div>
                  <div className="text-center p-3 md:p-4 bg-brand-100 rounded-lg">
                    <div className="text-2xl md:text-3xl font-bold text-textPrimary">
                      {status.processing.breakdown.airdrops.toLocaleString()}
                    </div>
                    <div className="text-xs md:text-sm text-textMuted font-mono mt-1">Airdrops</div>
                  </div>
                </div>
              </Card>

              {/* Database & Resources */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {/* Database Metrics */}
                <Card className="p-4 md:p-6">
                  <h3 className="text-lg md:text-xl font-bold text-textPrimary mb-3 md:mb-4 flex items-center gap-2">
                    <HardDrive className="w-4 h-4 md:w-5 md:h-5 text-accent" />
                    Database Metrics
                  </h3>
                  <div className="space-y-3 md:space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs md:text-sm text-textMuted font-mono">Database Size</span>
                      <span className="text-lg md:text-xl font-bold text-textPrimary">
                        {status.database.sizeMB} MB
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs md:text-sm text-textMuted font-mono">Total Rows</span>
                      <span className="text-lg md:text-xl font-bold text-textPrimary">
                        {status.database.tables.total.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs md:text-sm text-textMuted font-mono">Avg Query Time</span>
                      <span className="text-lg md:text-xl font-bold text-textPrimary">
                        {status.database.performance.avgQueryTimeMs}ms
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs md:text-sm text-textMuted font-mono">Active Connections</span>
                      <span className="text-lg md:text-xl font-bold text-textPrimary">
                        {status.database.connections.active} / {status.database.connections.max}
                      </span>
                    </div>
                  </div>
                </Card>

                {/* Resource Usage */}
                <Card className="p-4 md:p-6">
                  <h3 className="text-lg md:text-xl font-bold text-textPrimary mb-3 md:mb-4 flex items-center gap-2">
                    <Cpu className="w-4 h-4 md:w-5 md:h-5 text-accent" />
                    Resource Usage
                  </h3>
                  <div className="space-y-3 md:space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs md:text-sm text-textMuted font-mono">Memory (Heap)</span>
                      <span className="text-lg md:text-xl font-bold text-textPrimary">
                        {status.resources.memory.usedMB} MB
                        {status.resources.memory.totalMB && ` / ${status.resources.memory.totalMB} MB`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs md:text-sm text-textMuted font-mono">Memory (RSS)</span>
                      <span className="text-lg md:text-xl font-bold text-textPrimary">
                        {status.resources.memory.rss} MB
                      </span>
                    </div>
                    {status.resources.cpu && status.resources.cpu.loadAverage && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs md:text-sm text-textMuted font-mono">Load Average</span>
                        <span className="text-lg md:text-xl font-bold text-textPrimary font-mono">
                          {status.resources.cpu.loadAverage[0].toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-xs md:text-sm text-textMuted font-mono">Platform</span>
                      <span className="text-xs md:text-sm font-bold text-textPrimary font-mono">
                        {status.resources.platform} / {status.resources.nodeVersion}
                      </span>
                    </div>
                  </div>
                </Card>
              </div>

            </>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
