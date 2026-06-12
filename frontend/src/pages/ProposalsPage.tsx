/**
 * ProposalsPage - Professional Proposal Management
 * Sablier-quality with DataTable, circular progress, CSV import/export
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, CheckCircle, Clock, XCircle, TrendingUp, Users } from 'lucide-react';
import { fetchVaults, fetchProposals } from '../utils/api';
import { useWallet } from '../hooks/useWallet';
import { useWalletModal } from '../hooks/useWalletModal';
import { Button } from '../components/ui/Button';
import { DataTable, Column } from '../components/shared/DataTable';
import { StatsCard } from '../components/shared/StatsCard';
import { SkeletonTable } from '../components/ui/Skeleton';

type ProposalStatus = 'pending' | 'approved' | 'executed' | 'rejected';

interface Proposal {
  id: string;
  amount: number;
  recipient: string;
  reason: string;
  status: ProposalStatus;
  approvalCount: number;
  approvalThreshold: number;
  vaultId: string;
  vaultName: string;
  createdAt: string;
}

export default function ProposalsPage() {
  const wallet = useWallet();
  const { openModal } = useWalletModal();
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | ProposalStatus>('all');

  useEffect(() => {
    const loadAllProposals = async () => {
      try {
        setLoading(true);

        // First get all vaults the user has access to
        const vaultsData = await fetchVaults(wallet.address || undefined);

        // Then fetch proposals from each vault
        const allProposals: any[] = [];
        for (const vault of vaultsData.all) {
          try {
            const vaultProposals = await fetchProposals(vault.id);
            // Add vault info to each proposal
            const proposalsWithVaultInfo = vaultProposals.map((p: any) => ({
              ...p,
              vaultId: vault.id,
              vaultName: vault.vaultId || `Vault ${vault.id.slice(0, 8)}`,
              approvalThreshold: vault.approvalThreshold,
            }));
            allProposals.push(...proposalsWithVaultInfo);
          } catch (err) {
            console.error(`Failed to load proposals for vault ${vault.id}:`, err);
          }
        }

        // Sort by creation date (most recent first)
        allProposals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setProposals(allProposals);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load proposals');
      } finally {
        setLoading(false);
      }
    };

    if (wallet.address) {
      loadAllProposals();
    } else {
      setLoading(false);
    }
  }, [wallet.address]);

  // Calculate stats
  const pendingProposals = proposals.filter((p) => p.status === 'pending');
  const approvedProposals = proposals.filter((p) => p.status === 'approved');
  const executedProposals = proposals.filter((p) => p.status === 'executed');
  const rejectedProposals = proposals.filter((p) => p.status === 'rejected');
  const totalAmount = proposals.reduce((sum, p) => sum + (p.amount || 0), 0);

  // Filter proposals
  const filteredProposals = proposals.filter((proposal) => {
    if (statusFilter !== 'all' && proposal.status !== statusFilter) return false;
    return true;
  });

  // Table columns
  const columns: Column<Proposal>[] = [
    {
      key: 'id',
      label: 'Proposal',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-sans font-medium text-textPrimary">{row.reason || 'Untitled'}</p>
          <p className="text-xs text-textMuted font-mono">{row.id}</p>
        </div>
      ),
    },
    {
      key: 'vaultName',
      label: 'Vault',
      sortable: true,
      render: (row) => (
        <p className="font-mono text-sm text-textPrimary">{row.vaultName}</p>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      className: 'text-right',
      render: (row) => (
        <p className="font-display font-bold text-primary text-right">
          {row.amount?.toFixed(4) || '0.0000'} BCH
        </p>
      ),
    },
    {
      key: 'recipient',
      label: 'Recipient',
      sortable: true,
      render: (row) => (
        <p className="font-mono text-sm text-textMuted">
          {row.recipient?.slice(0, 15)}...{row.recipient?.slice(-10)}
        </p>
      ),
    },
    {
      key: 'approvalCount',
      label: 'Approvals',
      sortable: true,
      className: 'text-center',
      render: (row) => {
        const progress = row.approvalThreshold > 0
          ? (row.approvalCount / row.approvalThreshold) * 100
          : 0;
        return (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 w-full">
              <div className="flex-1 bg-surfaceAlt rounded-full h-2 overflow-hidden min-w-[80px]">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <span className="text-xs font-mono text-textMuted">
              {row.approvalCount} / {row.approvalThreshold}
            </span>
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
          pending: 'bg-secondary/10 text-secondary border-secondary',
          approved: 'bg-accent/10 text-accent border-accent',
          executed: 'bg-primary/10 text-primary border-primary',
          rejected: 'bg-surfaceAlt text-textMuted border-border',
        };
        return (
          <span
            className={`px-3 py-1 rounded-full text-xs font-sans font-medium border ${
              statusColors[row.status]
            }`}
          >
            {row.status.toUpperCase()}
          </span>
        );
      },
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortable: true,
      render: (row) => {
        const date = new Date(row.createdAt);
        return (
          <div>
            <p className="text-sm font-sans text-textPrimary">
              {date.toLocaleDateString()}
            </p>
            <p className="text-xs text-textMuted font-mono">
              {date.toLocaleTimeString()}
            </p>
          </div>
        );
      },
    },
  ];

  const handleImport = (data: any[]) => {
    console.log('Imported proposals:', data);
    // Could navigate to batch create or handle import
  };

  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <FileText className="w-16 h-16 text-textMuted mx-auto mb-4" />
          <h2 className="text-2xl font-display font-bold text-textPrimary mb-2">
            Connect Your Wallet
          </h2>
          <p className="text-textMuted font-sans mb-6">
            Please connect your wallet to view and manage proposals.
          </p>
          <Button onClick={openModal}>Connect Wallet</Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen pb-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="mb-6 md:mb-8">
            <h1 className="font-display font-medium text-3xl md:text-5xl lg:text-6xl text-textPrimary mb-4">
              Proposals
            </h1>
          </div>
          <div className="text-center py-12 bg-surface rounded-lg border border-border">
            <XCircle className="w-16 h-16 text-textMuted mx-auto mb-4" />
            <h2 className="text-2xl font-display font-bold text-textPrimary mb-2">
              Unable to load proposals
            </h2>
            <p className="text-textMuted font-mono">{error}</p>
          </div>
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
              <h1 className="font-display font-medium text-3xl md:text-5xl lg:text-6xl text-textPrimary mb-4">
                Proposals
              </h1>
              <p className="font-sans text-textMuted max-w-2xl text-sm leading-relaxed">
                Multi-signature proposal management across all your vaults. Track approvals and execution status.
              </p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
            <StatsCard
              label="Total Proposals"
              value={proposals.length}
              subtitle={`${pendingProposals.length} pending`}
              icon={FileText}
              color="primary"
            />
            <StatsCard
              label="Pending Approval"
              value={pendingProposals.length}
              subtitle="Awaiting signatures"
              icon={Clock}
              color="secondary"
              progress={{
                percentage: proposals.length > 0 ? (pendingProposals.length / proposals.length) * 100 : 0,
                label: 'Pending',
              }}
            />
            <StatsCard
              label="Approved"
              value={approvedProposals.length + executedProposals.length}
              subtitle="Ready or executed"
              icon={CheckCircle}
              color="accent"
            />
            <StatsCard
              label="Total Value"
              value={`${totalAmount.toFixed(4)} BCH`}
              subtitle="All proposals"
              icon={TrendingUp}
              color="muted"
            />
          </div>

          {/* Status Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-textMuted font-sans">Status:</span>
            {(['all', 'pending', 'approved', 'executed', 'rejected'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-md text-xs font-sans font-medium transition-colors ${
                  statusFilter === status
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-surface text-textSecondary hover:bg-surfaceAlt border border-border'
                }`}
              >
                {status.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Data Table */}
        {loading ? (
          <SkeletonTable rows={6} columns={7} />
        ) : (
          <DataTable
            columns={columns}
            data={filteredProposals}
            onRowClick={(proposal) => navigate(`/vaults/${proposal.vaultId}`)}
            enableSearch
            enableExport
            enableImport
            onImport={handleImport}
            emptyMessage="No proposals found. Proposals will appear here when created in your vaults."
          />
        )}
      </div>
    </div>
  );
}
