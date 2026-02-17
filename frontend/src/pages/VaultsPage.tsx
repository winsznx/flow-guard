import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { fetchVaults, VaultsResponse } from '../utils/api';
import { useWallet } from '../hooks/useWallet';
import { Plus, Shield, Users, Wallet } from 'lucide-react';

type ViewMode = 'created' | 'signer' | 'all';

export default function VaultsPage() {
  const wallet = useWallet();
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [vaultsData, setVaultsData] = useState<VaultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeProposalsCount, setActiveProposalsCount] = useState(0);

  useEffect(() => {
    const loadVaults = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch vaults from API (pass user address if connected)
        const data = await fetchVaults(wallet.address || undefined);
        setVaultsData(data);
      } catch (err) {
        console.error('Failed to load vaults:', err);
        setError(err instanceof Error ? err.message : 'Failed to load vaults');
      } finally {
        setLoading(false);
      }
    };

    loadVaults();
  }, [wallet.address]);

  // Fetch active proposals count
  useEffect(() => {
    const loadActiveProposals = async () => {
      try {
        const response = await fetch('/api/proposals?status=PENDING');
        const data = await response.json();
        setActiveProposalsCount(data.total || 0);
      } catch (err) {
        console.error('Failed to load active proposals:', err);
      }
    };

    loadActiveProposals();
  }, []);

  // Get vaults based on view mode
  const getDisplayedVaults = () => {
    if (!vaultsData) return [];

    switch (viewMode) {
      case 'created':
        return vaultsData.created;
      case 'signer':
        return vaultsData.signerIn;
      case 'all':
        return vaultsData.all;
      default:
        return vaultsData.all;
    }
  };

  const displayedVaults = getDisplayedVaults();
  const totalVaults = vaultsData ? vaultsData.all.length : 0;

  // Calculate total assets
  const totalAssets = displayedVaults.reduce((sum, v) => {
    if (v.contractAddress && v.balance !== undefined) {
      return sum + (v.balance / 100000000); // Convert satoshis to BCH
    }
    return sum + (v.totalDeposit || 0);
  }, 0);

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Header Section */}
        <div className="mb-8 md:mb-12">
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-12">
            <div>
              <h1 className="font-display font-medium text-3xl md:text-5xl lg:text-6xl text-textPrimary mb-4">
                Your Vaults
              </h1>
              <p className="font-mono text-textMuted max-w-2xl text-sm leading-relaxed">
                Manage your on-chain treasury with automated budget releases, role-based approvals, and spending guardrails.
              </p>
            </div>
            <Link to="/vaults/create">
              <Button size="lg" className="shadow-xl shadow-accent/10">
                <Plus className="w-4 h-4 mr-2" />
                Create Vault
              </Button>
            </Link>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            <Card padding="md" className="flex items-center gap-4 border-border/40 shadow-sm">
              <div className="p-3 bg-surfaceAlt rounded-full">
                <Shield className="w-6 h-6 text-textPrimary" />
              </div>
              <div>
                <div className="font-mono text-xs text-textMuted uppercase tracking-wider mb-1">Total Vaults</div>
                <div className="font-display text-3xl text-textPrimary">{totalVaults}</div>
              </div>
            </Card>
            <Card padding="md" className="flex items-center gap-4 border-border/40 shadow-sm">
              <div className="p-3 bg-accent/10 rounded-full">
                <Wallet className="w-6 h-6 text-textPrimary" />
              </div>
              <div>
                <div className="font-mono text-xs text-textMuted uppercase tracking-wider mb-1">Total Assets</div>
                <div className="font-display text-3xl text-textPrimary">{totalAssets.toFixed(2)} BCH</div>
              </div>
            </Card>
            <Card padding="md" className="flex items-center gap-4 border-border/40 shadow-sm">
              <div className="p-3 bg-surfaceAlt rounded-full">
                <Users className="w-6 h-6 text-textMuted" />
              </div>
              <div>
                <div className="font-mono text-xs text-textMuted uppercase tracking-wider mb-1">Active Proposals</div>
                <div className="font-display text-3xl text-textPrimary">{activeProposalsCount}</div>
              </div>
            </Card>
            <Card padding="md" className="flex items-center gap-4 border-border/40 shadow-sm bg-accent/5">
              <div className="p-3 bg-accent/20 rounded-full">
                <Wallet className="w-6 h-6 text-accent" />
              </div>
              <div>
                <div className="font-mono text-xs text-textMuted uppercase tracking-wider mb-1">
                  Wallet Balance
                  {wallet.isConnected && wallet.balance?.bch === 0 && (
                    <span className="ml-2 text-[10px] normal-case" title="Chipnet balance APIs are currently experiencing issues">
                      (may be unavailable)
                    </span>
                  )}
                </div>
                <div className="font-display text-3xl text-accent">
                  {wallet.isConnected && wallet.balance
                    ? wallet.balance.bch.toFixed(4)
                    : '0.0000'} BCH
                </div>
              </div>
            </Card>
          </div>

          {/* View Mode Toggle */}
          <div className="mb-8 border-b border-border pb-1">
            <div className="flex gap-4">
              <button
                onClick={() => setViewMode('all')}
                className={`pb-3 px-1 text-sm font-mono transition-all border-b-2 ${viewMode === 'all'
                  ? 'border-accent text-textPrimary font-bold'
                  : 'border-transparent text-textMuted hover:text-textPrimary'
                  }`}
              >
                All Vaults ({vaultsData?.all.length || 0})
              </button>
              <button
                onClick={() => setViewMode('created')}
                className={`pb-3 px-1 text-sm font-mono transition-all border-b-2 ${viewMode === 'created'
                  ? 'border-accent text-textPrimary font-bold'
                  : 'border-transparent text-textMuted hover:text-textPrimary'
                  }`}
              >
                Created ({vaultsData?.created.length || 0})
              </button>
              <button
                onClick={() => setViewMode('signer')}
                className={`pb-3 px-1 text-sm font-mono transition-all border-b-2 ${viewMode === 'signer'
                  ? 'border-accent text-textPrimary font-bold'
                  : 'border-transparent text-textMuted hover:text-textPrimary'
                  }`}
              >
                Signer ({vaultsData?.signerIn.length || 0})
              </button>
            </div>
          </div>
        </div>

        {/* Vaults Grid */}
        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 bg-whiteAlt rounded-xl animate-pulse border border-border/40" />
            ))}
          </div>
        ) : error ? (
          <Card padding="lg" className="text-center py-16 border-error/20">
            <h2 className="font-display text-2xl mb-4 text-error">Unable to load vaults</h2>
            <p className="font-mono text-textMuted mb-4 text-sm">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>Retry Connection</Button>
          </Card>
        ) : displayedVaults.length === 0 ? (
          <Card padding="lg" className="text-center py-20 border-dashed border-border/40">
            <div className="w-16 h-16 bg-surfaceAlt rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-border/40">
              <Shield className="w-8 h-8 text-textMuted" />
            </div>
            <h2 className="font-display text-2xl mb-3 text-textPrimary">No vaults found</h2>
            <p className="font-mono text-textMuted mb-8 max-w-md mx-auto text-sm">
              {viewMode === 'created'
                ? "You haven't created any vaults yet."
                : viewMode === 'signer'
                  ? "You're not a signer in any vaults yet."
                  : "Create a vault to start managing your on-chain treasury."}
            </p>
            {viewMode === 'created' || viewMode === 'all' ? (
              <Link to="/vaults/create">
                <Button>Create Your First Vault</Button>
              </Link>
            ) : null}
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedVaults.map((vault) => {
              const unlocked = vault.unlockAmount || 0;
              const role = vault.role || 'viewer';

              return (
                <Link key={vault.id} to={`/vaults/${vault.id}`} className="group">
                  <Card
                    padding="lg"
                    hover
                    className="h-full relative overflow-hidden transition-all duration-300 border-border/40 group-hover:border-accent/50 group-hover:shadow-xl group-hover:shadow-accent/5"
                  >
                    {/* Status Dot */}
                    <div className="absolute top-6 right-6 flex items-center gap-2">
                      <span className="flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-accent opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent"></span>
                      </span>
                    </div>

                    <div className="mb-6">
                      <h3 className="font-display text-2xl text-textPrimary mb-2 group-hover:text-accent transition-colors truncate pr-8">
                        {vault.name || vault.vaultId || `Vault ${vault.id.slice(0, 8)}`}
                      </h3>
                      {vault.description && (
                        <p className="font-mono text-xs text-textMuted line-clamp-2 min-h-[2.5em]">
                          {vault.description}
                        </p>
                      )}
                    </div>

                    {/* Key Metric */}
                    <div className="mb-6 p-4 bg-surfaceAlt rounded-lg border border-border/40 group-hover:bg-accent/5 transition-colors">
                      <div className="flex justify-between items-end">
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-wider text-textMuted mb-1">Balance</div>
                          <div className="font-display text-2xl text-textPrimary">
                            {vault.contractAddress && vault.balance !== undefined
                              ? (vault.balance / 100000000).toFixed(4)
                              : vault.totalDeposit || 0} <span className="text-sm text-textMuted">BCH</span>
                          </div>
                        </div>
                        {vault.contractAddress && (
                          <Wallet className="w-5 h-5 text-accent opacity-50" />
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {vault.totalDeposit > 0 && (
                      <div className="mb-6 space-y-2">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-textMuted">Unlocked</span>
                          <span className="text-textPrimary">{unlocked.toFixed(2)} BCH</span>
                        </div>
                        <div className="h-1.5 bg-surfaceAlt rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full"
                            style={{ width: `${(unlocked / vault.totalDeposit) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Footer Badges */}
                    <div className="flex items-center gap-2 mt-auto pt-4 border-t border-border/40">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${role === 'creator' ? 'bg-primary text-white border-primary' :
                        role === 'signer' ? 'bg-surfaceAlt text-textPrimary border-border' :
                          'bg-whiteAlt text-textMuted border-border'
                        }`}>
                        {role}
                      </span>

                      {vault.isPublic && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-whiteAlt text-textMuted border border-border">
                          Public
                        </span>
                      )}

                      <div className="ml-auto text-xs font-mono text-textMuted flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {vault.signers?.length || 0}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
