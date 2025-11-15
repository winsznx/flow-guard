import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { fetchVault } from '../utils/api';
import { AddSignerModal } from '../components/vaults/AddSignerModal';

// Mock proposals - will be replaced with API calls
const mockProposals = [
  {
    id: '1',
    recipient: '0xabc...',
    amount: 2,
    reason: 'Monthly contributor payment',
    status: 'pending',
    approvals: 1,
    needed: 2,
  },
  {
    id: '2',
    recipient: '0xdef...',
    amount: 1.5,
    reason: 'Infrastructure costs',
    status: 'approved',
    approvals: 2,
    needed: 2,
  },
];

export default function VaultDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [vault, setVault] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddSignerModal, setShowAddSignerModal] = useState(false);

  // Mock user address - will be replaced with wallet integration
  const userAddress = '0x1234567890123456789012345678901234567890';

  useEffect(() => {
    const loadVault = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const vaultData = await fetchVault(id, userAddress);
        setVault(vaultData);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load vault');
      } finally {
        setLoading(false);
      }
    };

    loadVault();
  }, [id]);

  const role = vault?.role || 'viewer';
  const isCreator = role === 'creator';
  const isSigner = role === 'signer' || isCreator;
  const canInteract = isSigner; // Can create proposals and approve

  if (loading) {
    return (
      <div className="section-spacious">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-16">Loading vault...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="section-spacious">
        <div className="max-w-7xl mx-auto">
          <Card padding="lg" className="text-center py-16 border-2 border-red-200 bg-red-50">
            <h2 className="text-2xl font-semibold mb-4 text-red-800">Error loading vault</h2>
            <p className="text-red-600 mb-4">{error}</p>
            <Link to="/vaults">
              <Button>Back to Vaults</Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="section-spacious">
        <div className="max-w-7xl mx-auto">
          <Card padding="lg" className="text-center py-16">
            <h2 className="text-2xl font-semibold mb-4">Vault not found</h2>
            <Link to="/vaults">
              <Button>Back to Vaults</Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  // Calculate unlocked/locked amounts (mock for now)
  const unlocked = vault.unlockAmount || 0;
  const locked = (vault.totalDeposit || 0) - unlocked;

  return (
    <div className="section-spacious">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link to="/vaults" className="text-green-600 hover:underline">
            ← Back to Vaults
          </Link>
        </div>

        <div className="flex justify-between items-start mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-4xl font-bold section-bold">
                {vault.vaultId || `Vault ${vault.id?.slice(0, 8)}`}
              </h1>
              <span
                className={`inline-flex items-center px-3 py-1 text-sm font-semibold rounded-full ${
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
                <span className="inline-flex items-center px-3 py-1 bg-yellow-100 text-yellow-800 text-sm font-semibold rounded-full">
                  Public
                </span>
              )}
            </div>
            {vault.description && <p className="text-gray-600">{vault.description}</p>}
          </div>
          <div className="flex gap-3">
            {isCreator && (
              <Button variant="outline" size="lg" onClick={() => setShowAddSignerModal(true)}>
                + Add Signer
              </Button>
            )}
            {canInteract && (
              <Link to={`/vaults/${id}/proposals/create`}>
                <Button size="lg">Create Proposal</Button>
              </Link>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card padding="lg">
            <h3 className="text-sm text-gray-600 mb-2">Total Deposit</h3>
            <p className="text-3xl font-bold">{vault.totalDeposit || 0} BCH</p>
          </Card>
          <Card padding="lg">
            <h3 className="text-sm text-gray-600 mb-2">Unlocked</h3>
            <p className="text-3xl font-bold text-green-600">{unlocked.toFixed(2)} BCH</p>
          </Card>
          <Card padding="lg">
            <h3 className="text-sm text-gray-600 mb-2">Locked</h3>
            <p className="text-3xl font-bold">{locked.toFixed(2)} BCH</p>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card padding="lg">
            <h2 className="text-xl font-semibold mb-4">Vault Details</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Spending Cap:</span>
                <span className="font-semibold">{vault.spendingCap || 'No cap'} BCH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Approval Threshold:</span>
                <span className="font-semibold">
                  {vault.approvalThreshold}-of-{vault.signers?.length || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Cycle Duration:</span>
                <span className="font-semibold">
                  {vault.cycleDuration === 604800
                    ? 'Weekly'
                    : vault.cycleDuration === 2592000
                    ? 'Monthly'
                    : vault.cycleDuration === 7776000
                    ? 'Quarterly'
                    : `${vault.cycleDuration}s`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Unlock Amount:</span>
                <span className="font-semibold">{vault.unlockAmount || 0} BCH</span>
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <h2 className="text-xl font-semibold mb-4">Signers</h2>
            <div className="space-y-2">
              {vault.signers && vault.signers.length > 0 ? (
                vault.signers.map((signer: string, index: number) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="font-mono text-sm">{signer}</span>
                    {signer.toLowerCase() === vault.creator?.toLowerCase() ? (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded font-semibold">
                        Creator
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                        Signer {index + 1}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-gray-600 text-sm">No signers</p>
              )}
            </div>
          </Card>
        </div>

        {canInteract ? (
          <Card padding="lg">
            <h2 className="text-xl font-semibold mb-4">Active Proposals</h2>
            {mockProposals.length === 0 ? (
              <p className="text-gray-600">No active proposals</p>
            ) : (
              <div className="space-y-4">
                {mockProposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    className="p-4 border border-gray-200 rounded-lg hover:border-green-500 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold">{proposal.amount} BCH</h3>
                        <p className="text-sm text-gray-600">{proposal.reason}</p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          proposal.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {proposal.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-4">
                      <div className="text-sm text-gray-600">
                        To: <span className="font-mono">{proposal.recipient}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-600">Approvals: </span>
                        <span className="font-semibold">
                          {proposal.approvals}/{proposal.needed}
                        </span>
                      </div>
                    </div>
                    {proposal.status === 'pending' && (
                      <div className="mt-4">
                        <Button size="sm" variant="outline">
                          Approve Proposal
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : (
          <Card padding="lg" className="bg-gray-50">
            <h2 className="text-xl font-semibold mb-4">Active Proposals</h2>
            <p className="text-gray-600">
              You don't have permission to view proposals. Only signers can view and interact with proposals.
            </p>
          </Card>
        )}

        {/* Add Signer Modal */}
        {showAddSignerModal && id && (
          <AddSignerModal
            vaultId={id}
            onClose={() => setShowAddSignerModal(false)}
            onSuccess={() => {
              setShowAddSignerModal(false);
              // Reload vault data
              fetchVault(id, userAddress).then(setVault).catch(console.error);
            }}
          />
        )}
      </div>
    </div>
  );
}
