import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { fetchVaults, VaultsResponse } from '../utils/api';

// Vault icon component
const VaultIcon = () => (
  <svg
    width="48"
    height="48"
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="opacity-20"
  >
    <rect x="8" y="12" width="32" height="28" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M16 12V8C16 6.89543 16.8954 6 18 6H30C31.1046 6 32 6.89543 32 8V12" stroke="currentColor" strokeWidth="2" />
    <circle cx="24" cy="26" r="4" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M24 30V34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

type ViewMode = 'created' | 'signer' | 'all';

export default function VaultsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [vaultsData, setVaultsData] = useState<VaultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mock user address - will be replaced with wallet integration
  const userAddress = '0x1234567890123456789012345678901234567890';

  useEffect(() => {
    const loadVaults = async () => {
      try {
        setLoading(true);
        const data = await fetchVaults(userAddress);
        setVaultsData(data);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load vaults');
      } finally {
        setLoading(false);
      }
    };

    loadVaults();
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
  const totalAssets = displayedVaults.reduce((sum, v) => sum + (v.totalDeposit || 0), 0);
  // Mock proposals count - will be replaced with real data
  const activeProposals = displayedVaults.length * 2; // Placeholder

  return (
    <div className="section-spacious bg-gradient-to-b from-white to-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Enhanced Header Section */}
        <div className="mb-12">
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-8">
            <div>
              <h1 className="text-5xl md:text-6xl font-bold section-bold mb-3 text-gray-900">
                Your Vaults
              </h1>
              <p className="text-lg text-gray-600 max-w-2xl">
                Manage your on-chain treasury with automated budget releases, role-based approvals, and spending guardrails.
              </p>
            </div>
            <Link to="/vaults/create">
              <Button size="lg" className="shadow-lg hover:shadow-xl transition-all">
                + Create Vault
              </Button>
            </Link>
          </div>

          {/* View Mode Toggle */}
          <div className="mb-8">
            <div className="inline-flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
              <button
                onClick={() => setViewMode('created')}
                className={`px-6 py-2 rounded-md text-sm font-semibold transition-all ${
                  viewMode === 'created'
                    ? 'bg-green-500 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Vaults I Created ({vaultsData?.created.length || 0})
              </button>
              <button
                onClick={() => setViewMode('signer')}
                className={`px-6 py-2 rounded-md text-sm font-semibold transition-all ${
                  viewMode === 'signer'
                    ? 'bg-green-500 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Vaults I'm a Signer In ({vaultsData?.signerIn.length || 0})
              </button>
              <button
                onClick={() => setViewMode('all')}
                className={`px-6 py-2 rounded-md text-sm font-semibold transition-all ${
                  viewMode === 'all'
                    ? 'bg-green-500 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All ({vaultsData?.all.length || 0})
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Total Vaults</div>
              <div className="text-3xl font-bold text-gray-900">{totalVaults}</div>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Total Assets</div>
              <div className="text-3xl font-bold text-gray-900">{totalAssets} BCH</div>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Active Proposals</div>
              <div className="text-3xl font-bold text-green-600">{activeProposals}</div>
            </div>
          </div>
        </div>

        {/* Vaults Grid */}
        {loading ? (
          <Card padding="lg" className="text-center py-16">
            <div className="text-gray-600">Loading vaults...</div>
          </Card>
        ) : error ? (
          <Card padding="lg" className="text-center py-16 border-2 border-red-200 bg-red-50">
            <h2 className="text-2xl font-semibold mb-4 text-red-800">Error loading vaults</h2>
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </Card>
        ) : displayedVaults.length === 0 ? (
          <Card padding="lg" className="text-center py-16 border-2 border-dashed border-gray-200">
            <VaultIcon />
            <h2 className="text-2xl font-semibold mb-4 mt-6">No vaults yet</h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              {viewMode === 'created'
                ? "You haven't created any vaults yet. Create your first vault to start managing your treasury."
                : viewMode === 'signer'
                ? "You're not a signer in any vaults yet."
                : "Create your first vault to start managing your treasury on-chain with automated budget releases and spending controls."}
            </p>
            {viewMode === 'created' || viewMode === 'all' ? (
              <Link to="/vaults/create">
                <Button size="lg">Create Your First Vault</Button>
              </Link>
            ) : null}
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedVaults.map((vault) => {
              // Calculate unlocked/locked amounts (mock data for now)
              const unlocked = vault.unlockAmount || 0;
              const locked = (vault.totalDeposit || 0) - unlocked;
              const unlockPercentage = vault.totalDeposit ? (unlocked / vault.totalDeposit) * 100 : 0;
              const lockPercentage = vault.totalDeposit ? (locked / vault.totalDeposit) * 100 : 0;
              const role = vault.role || 'viewer';

              return (
                <Link key={vault.id} to={`/vaults/${vault.id}`}>
                  <Card
                    padding="lg"
                    className="group relative overflow-hidden hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 border-2 border-transparent hover:border-green-200"
                  >
                    {/* Gradient accent bar */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#a7f3d0] via-[#d1fae5] to-[#fef3c7]" />

                    {/* Background decoration */}
                    <div className="absolute top-0 right-0 opacity-5 group-hover:opacity-10 transition-opacity">
                      <VaultIcon />
                    </div>

                    <div className="relative z-10">
                      {/* Header */}
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex-1">
                          <h3 className="text-2xl font-bold mb-2 text-gray-900 group-hover:text-green-600 transition-colors">
                            {vault.vaultId || `Vault ${vault.id.slice(0, 8)}`}
                          </h3>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center px-3 py-1 bg-gradient-to-r from-[#a7f3d0] to-[#d1fae5] text-green-800 text-xs font-semibold rounded-full">
                              <span className="w-2 h-2 bg-green-600 rounded-full mr-2 animate-pulse" />
                              active
                            </span>
                            <span
                              className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${
                                role === 'creator'
                                  ? 'bg-blue-100 text-blue-800'
                                  : role === 'signer'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {role === 'creator' ? 'Creator' : role === 'signer' ? 'Signer' : 'Viewer'}
                            </span>
                            {vault.isPublic && (
                              <span className="inline-flex items-center px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded-full">
                                Public
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Total Amount - Large Display */}
                      <div className="mb-6">
                        <div className="text-sm text-gray-500 mb-1">Total Balance</div>
                        <div className="text-4xl font-bold text-gray-900">{vault.totalDeposit || 0} BCH</div>
                      </div>

                      {/* Progress Visualization */}
                      {vault.totalDeposit > 0 && (
                        <div className="mb-6">
                          <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-600">Unlocked</span>
                            <span className="font-semibold text-green-600">{unlocked.toFixed(2)} BCH</span>
                          </div>
                          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-500"
                              style={{ width: `${unlockPercentage}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-sm mt-2">
                            <span className="text-gray-600">Locked</span>
                            <span className="font-semibold text-gray-700">{locked.toFixed(2)} BCH</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-1">
                            <div
                              className="h-full bg-gradient-to-r from-gray-300 to-gray-400 rounded-full transition-all duration-500"
                              style={{ width: `${lockPercentage}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            className="text-green-600"
                          >
                            <path
                              d="M8 2L3 5V8C3 10.5 5.5 12.5 8 14C10.5 12.5 13 10.5 13 8V5L8 2Z"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              fill="none"
                            />
                          </svg>
                          <span className="text-sm font-semibold text-gray-700">
                            {vault.signers?.length || 0} signer{(vault.signers?.length || 0) !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="text-gray-400 group-hover:text-green-600 transition-colors">
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 20 20"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M7.5 15L12.5 10L7.5 5"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
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
