/**
 * GovernancePage - Professional Treasury Governance Management
 * Sablier-quality with DataTable, circular progress, CSV import/export
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Vote, CheckCircle, XCircle, Clock, Users, TrendingUp, Lock, Unlock, X as CloseIcon, AlertCircle, ExternalLink } from 'lucide-react';
import { fetchVaults, castVote } from '../utils/api';
import { useWallet } from '../hooks/useWallet';
import { useWalletModal } from '../hooks/useWalletModal';
import { lockTokensToVote, unlockVotingTokens, getExplorerTxUrl } from '../utils/blockchain';
import { useNetwork } from '../hooks/useNetwork';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { DataTable, Column } from '../components/shared/DataTable';
import { StatsCard } from '../components/shared/StatsCard';

type ProposalStatus = 'ACTIVE' | 'PASSED' | 'REJECTED' | 'EXPIRED';

interface Proposal {
  id: string;
  title: string;
  description: string;
  votingEndsAt: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  quorum: number;
  totalVotes: number;
  status: ProposalStatus;
  userHasVoted: boolean;
  passed: boolean;
}

type FeedbackTone = 'success' | 'warning' | 'error' | 'info';

interface FeedbackState {
  tone: FeedbackTone;
  title: string;
  description?: string;
  txHash?: string;
}

export default function GovernancePage() {
  const wallet = useWallet();
  const { openModal } = useWalletModal();
  const navigate = useNavigate();
  const network = useNetwork();
  const [activeTab, setActiveTab] = useState<'active' | 'past'>('active');
  const [selectedTreasury, setSelectedTreasury] = useState<string>('');
  const [treasuries, setTreasuries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | ProposalStatus>('all');

  // Voting modal state
  const [votingModal, setVotingModal] = useState<{ open: boolean; proposal: Proposal | null }>({ open: false, proposal: null });
  const [voteChoice, setVoteChoice] = useState<'FOR' | 'AGAINST' | 'ABSTAIN'>('FOR');
  const [stakeAmount, setStakeAmount] = useState('0.01');
  const [votingLoading, setVotingLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  useEffect(() => {
    const loadTreasuries = async () => {
      if (!wallet.address) {
        setLoading(false);
        return;
      }
      try {
        const vaultsData = await fetchVaults(wallet.address);
        setTreasuries(vaultsData.all || []);
        if (vaultsData.all?.length > 0) {
          setSelectedTreasury(vaultsData.all[0].id);
        }
      } catch (error) {
        console.error('Failed to load treasuries:', error);
      } finally {
        setLoading(false);
      }
    };
    loadTreasuries();
  }, [wallet.address]);

  useEffect(() => {
    if (!selectedTreasury) return;
    const loadProposals = async () => {
      setProposalsLoading(true);
      try {
        const res = await fetch(`/api/vaults/${selectedTreasury}/governance`);
        const data = await res.json();
        setProposals(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Failed to load proposals:', error);
        setProposals([]);
      } finally {
        setProposalsLoading(false);
      }
    };
    loadProposals();
  }, [selectedTreasury]);

  // Calculate stats
  const activeProposals = proposals.filter((p) => p.status === 'ACTIVE');
  const passedProposals = proposals.filter((p) => p.status === 'PASSED');
  const totalVotes = proposals.reduce((sum, p) => sum + p.totalVotes, 0);
  const avgQuorumReached = proposals.length > 0
    ? proposals.filter((p) => p.totalVotes >= p.quorum).length / proposals.length * 100
    : 0;

  // Filter proposals
  const filteredProposals = proposals.filter((proposal) => {
    if (activeTab === 'active' && proposal.status !== 'ACTIVE') return false;
    if (activeTab === 'past' && proposal.status === 'ACTIVE') return false;
    if (statusFilter !== 'all' && proposal.status !== statusFilter) return false;
    return true;
  });

  // Table columns
  const columns: Column<Proposal>[] = [
    {
      key: 'title',
      label: 'Proposal',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-sans font-medium text-textPrimary">{row.title}</p>
          <p className="text-xs text-textMuted font-mono line-clamp-1">{row.description}</p>
        </div>
      ),
    },
    {
      key: 'totalVotes',
      label: 'Total Votes',
      sortable: true,
      className: 'text-right',
      render: (row) => (
        <div className="text-right">
          <p className="font-display font-bold text-primary">{row.totalVotes}</p>
          <p className="text-xs text-textMuted font-mono">
            Quorum: {row.quorum}
          </p>
        </div>
      ),
    },
    {
      key: 'votesFor',
      label: 'For / Against',
      sortable: true,
      render: (row) => {
        const total = row.votesFor + row.votesAgainst + row.votesAbstain;
        const forPercent = total > 0 ? (row.votesFor / total) * 100 : 0;
        const againstPercent = total > 0 ? (row.votesAgainst / total) * 100 : 0;
        return (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 bg-surfaceAlt rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: `${forPercent}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-textMuted font-mono">
              {row.votesFor} FOR • {row.votesAgainst} AGAINST
            </p>
          </div>
        );
      },
    },
    {
      key: 'quorum',
      label: 'Quorum',
      sortable: true,
      className: 'text-center',
      render: (row) => {
        const progress = row.quorum > 0 ? (row.totalVotes / row.quorum) * 100 : 0;
        const reached = row.totalVotes >= row.quorum;
        return (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 w-full">
              <div className="flex-1 bg-surfaceAlt rounded-full h-2 overflow-hidden min-w-[80px]">
                <div
                  className={`h-full rounded-full transition-all ${
                    reached ? 'bg-accent' : 'bg-secondary'
                  }`}
                  style={{ width: `${Math.min(100, progress)}%` }}
                />
              </div>
            </div>
            <span className="text-xs font-mono text-textMuted">
              {progress.toFixed(0)}%
            </span>
          </div>
        );
      },
    },
    {
      key: 'votingEndsAt',
      label: 'Voting Ends',
      sortable: true,
      render: (row) => {
        const date = new Date(row.votingEndsAt);
        const daysLeft = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return (
          <div>
            <p className="text-sm font-sans text-textPrimary">
              {date.toLocaleDateString()}
            </p>
            <p className="text-xs text-textMuted font-mono">
              {daysLeft > 0 ? `${daysLeft}d left` : 'Ended'}
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
          PASSED: 'bg-primary/10 text-primary border-primary',
          REJECTED: 'bg-surfaceAlt text-textMuted border-border',
          EXPIRED: 'bg-secondary/10 text-secondary border-secondary',
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
  ];

  const handleImport = (data: any[]) => {
    console.log('Imported proposals:', data);
  };

  const handleVote = async () => {
    if (!wallet.isConnected || !votingModal.proposal) {
      setFeedback({
        tone: 'error',
        title: 'Wallet not connected',
        description: 'Connect your wallet before locking stake and voting.',
      });
      return;
    }

    const amountSatoshis = Math.round(parseFloat(stakeAmount) * 100000000);
    if (amountSatoshis <= 0) {
      setFeedback({
        tone: 'warning',
        title: 'Invalid stake amount',
        description: 'Stake amount must be greater than 0 BCH.',
      });
      return;
    }

    setVotingLoading(true);
    setFeedback({
      tone: 'info',
      title: 'Signing vote transaction',
      description: 'Approve the wallet request to lock stake and submit your vote on-chain.',
    });
    try {
      const txHash = await lockTokensToVote(
        wallet,
        votingModal.proposal.id,
        voteChoice,
        amountSatoshis
      );

      setFeedback({
        tone: 'success',
        title: 'Vote locked and recorded',
        description: `${stakeAmount} BCH was locked and your "${voteChoice}" vote was submitted.`,
        txHash,
      });

      // Refresh proposals
      const res = await fetch(`/api/vaults/${selectedTreasury}/governance`);
      const data = await res.json();
      setProposals(Array.isArray(data) ? data : []);

      setVotingModal({ open: false, proposal: null });
    } catch (error: any) {
      console.error('Failed to vote:', error);
      setFeedback({
        tone: 'error',
        title: 'Vote submission failed',
        description: error.message || 'Failed to lock and submit vote.',
      });
    } finally {
      setVotingLoading(false);
    }
  };

  const handleUnlock = async (proposal: Proposal) => {
    if (!wallet.isConnected) {
      setFeedback({
        tone: 'error',
        title: 'Wallet not connected',
        description: 'Connect your wallet before unlocking voting stake.',
      });
      return;
    }

    const votingEnded = new Date(proposal.votingEndsAt).getTime() < Date.now();
    if (!votingEnded) {
      setFeedback({
        tone: 'warning',
        title: 'Unlock unavailable',
        description: 'Voting period has not ended yet. Unlock is available after voting completes.',
      });
      return;
    }

    setVotingLoading(true);
    setFeedback({
      tone: 'info',
      title: 'Signing unlock transaction',
      description: 'Approve the wallet request to unlock your voting stake.',
    });
    try {
      const txHash = await unlockVotingTokens(
        wallet,
        proposal.id,
        '',
        0
      );

      setFeedback({
        tone: 'success',
        title: 'Voting stake unlocked',
        description: 'Your locked voting tokens have been unlocked on-chain.',
        txHash,
      });

      // Refresh proposals
      const res = await fetch(`/api/vaults/${selectedTreasury}/governance`);
      const data = await res.json();
      setProposals(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('Failed to unlock:', error);
      setFeedback({
        tone: 'error',
        title: 'Unlock failed',
        description: error.message || 'Failed to unlock voting stake.',
      });
    } finally {
      setVotingLoading(false);
    }
  };

  const openVotingModal = (proposal: Proposal) => {
    setVotingModal({ open: true, proposal });
    setVoteChoice('FOR');
    setStakeAmount('0.01');
  };

  const feedbackToneClasses: Record<FeedbackTone, string> = {
    success: 'border-success/40 bg-success/10 text-success',
    warning: 'border-warning/40 bg-warning/10 text-warning',
    error: 'border-error/40 bg-error/10 text-error',
    info: 'border-primary/30 bg-primary/10 text-primary',
  };

  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <Vote className="w-16 h-16 text-textMuted mx-auto mb-4" />
          <h2 className="text-2xl font-display font-bold text-textPrimary mb-2">
            Connect Your Wallet
          </h2>
          <p className="text-textMuted font-sans mb-6">
            Please connect your wallet to view treasury governance.
          </p>
          <Button onClick={openModal}>Connect Wallet</Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-textSecondary font-sans">Loading treasuries...</p>
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
                Treasury Governance
              </h1>
              <p className="font-sans text-textMuted max-w-2xl text-sm leading-relaxed">
                Vote on proposals and coordinate fund releases for your treasuries.
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => navigate('/governance/create')}
              disabled={!selectedTreasury}
              className="shadow-lg"
            >
              Create Proposal
            </Button>
          </div>

          {/* Treasury Selector */}
          {treasuries.length > 0 && (
            <div className="bg-surface rounded-lg border border-border p-4 mb-8">
              <div className="flex items-center gap-4">
                <label className="text-sm font-sans font-medium text-textPrimary whitespace-nowrap">
                  Treasury:
                </label>
                <Select
                  value={selectedTreasury}
                  onChange={(e) => setSelectedTreasury(e.target.value)}
                  options={treasuries.map((t) => ({
                    value: t.id,
                    label: t.vaultId || `Treasury ${t.id.slice(0, 8)}...`,
                  }))}
                  className="flex-1"
                />
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
            <StatsCard
              label="Total Proposals"
              value={proposals.length}
              subtitle={`${activeProposals.length} active`}
              icon={Vote}
              color="primary"
            />
            <StatsCard
              label="Passed"
              value={passedProposals.length}
              subtitle="Successful votes"
              icon={CheckCircle}
              color="accent"
              progress={{
                percentage: proposals.length > 0 ? (passedProposals.length / proposals.length) * 100 : 0,
                label: 'Passed',
              }}
            />
            <StatsCard
              label="Total Votes Cast"
              value={totalVotes}
              subtitle="All proposals"
              icon={Users}
              color="secondary"
            />
            <StatsCard
              label="Avg Quorum"
              value={`${avgQuorumReached.toFixed(0)}%`}
              subtitle="Reached threshold"
              icon={TrendingUp}
              color="muted"
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant={activeTab === 'active' ? 'primary' : 'outline'}
              onClick={() => setActiveTab('active')}
              className="flex items-center gap-2"
            >
              <Clock className="w-4 h-4" />
              Active ({activeProposals.length})
            </Button>
            <Button
              variant={activeTab === 'past' ? 'primary' : 'outline'}
              onClick={() => setActiveTab('past')}
              className="flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Past
            </Button>
          </div>

          {/* Status Filter */}
          {activeTab === 'past' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-textMuted font-sans">Status:</span>
              {(['all', 'PASSED', 'REJECTED', 'EXPIRED'] as const).map((status) => (
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
          )}
        </div>

        {feedback && (
          <div className={`mb-6 rounded-lg border p-4 ${feedbackToneClasses[feedback.tone]}`}>
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{feedback.title}</p>
                {feedback.description && (
                  <p className="mt-1 text-sm leading-6 text-textSecondary">{feedback.description}</p>
                )}
                {feedback.txHash && (
                  <a
                    href={getExplorerTxUrl(feedback.txHash, network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primaryHover"
                  >
                    View transaction
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Data Table */}
        {proposalsLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent mx-auto mb-4" />
            <p className="text-textSecondary font-sans">Loading proposals...</p>
          </div>
        ) : treasuries.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-lg border border-border">
            <Vote className="w-16 h-16 text-textMuted mx-auto mb-4" />
            <h2 className="text-2xl font-display font-bold text-textPrimary mb-2">
              No Treasuries Yet
            </h2>
            <p className="text-textMuted font-sans mb-6">
              Create a treasury to start governance voting.
            </p>
            <Button onClick={() => navigate('/vaults/create')}>Create Treasury</Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredProposals}
            onRowClick={(proposal) => openVotingModal(proposal)}
            enableSearch
            enableExport
            enableImport
            onImport={handleImport}
            emptyMessage={
              activeTab === 'active'
                ? 'No active proposals. Create your first proposal to get started.'
                : 'No past proposals found.'
            }
          />
        )}

        {/* Voting Modal */}
        {votingModal.open && votingModal.proposal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setVotingModal({ open: false, proposal: null })}>
            <div className="bg-surface rounded-lg border border-border max-w-2xl w-full p-6 md:p-8" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-2xl md:text-3xl font-display font-bold text-textPrimary mb-2">
                    Cast Your Vote
                  </h2>
                  <p className="text-sm font-sans text-textMuted">{votingModal.proposal.title}</p>
                </div>
                <button
                  onClick={() => setVotingModal({ open: false, proposal: null })}
                  className="text-textMuted hover:text-textPrimary transition-colors"
                >
                  <CloseIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Proposal Details */}
              <div className="bg-surfaceAlt rounded-lg p-4 mb-6">
                <p className="text-sm font-sans text-textPrimary mb-3">{votingModal.proposal.description}</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-textMuted font-sans">Voting Ends:</span>
                    <p className="font-mono text-textPrimary">{new Date(votingModal.proposal.votingEndsAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-textMuted font-sans">Quorum:</span>
                    <p className="font-mono text-textPrimary">{votingModal.proposal.quorum} votes</p>
                  </div>
                  <div>
                    <span className="text-textMuted font-sans">Current Votes:</span>
                    <p className="font-mono text-textPrimary">
                      {votingModal.proposal.votesFor} FOR • {votingModal.proposal.votesAgainst} AGAINST • {votingModal.proposal.votesAbstain} ABSTAIN
                    </p>
                  </div>
                </div>
              </div>

              {/* Vote Choice */}
              <div className="mb-6">
                <label className="block text-sm font-sans font-medium text-textPrimary mb-3">
                  Your Vote
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['FOR', 'AGAINST', 'ABSTAIN'] as const).map((choice) => (
                    <button
                      key={choice}
                      onClick={() => setVoteChoice(choice)}
                      className={`px-4 py-3 rounded-lg font-sans font-medium transition-all ${
                        voteChoice === choice
                          ? choice === 'FOR'
                            ? 'bg-accent text-white shadow-md'
                            : choice === 'AGAINST'
                              ? 'bg-error text-white shadow-md'
                              : 'bg-secondary text-white shadow-md'
                          : 'bg-surfaceAlt text-textSecondary hover:bg-surface border border-border'
                      }`}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stake Amount */}
              <div className="mb-6">
                <label className="block text-sm font-sans font-medium text-textPrimary mb-2">
                  Stake Amount (BCH)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  placeholder="0.01"
                  className="w-full"
                />
                <p className="text-xs text-textMuted font-mono mt-1">
                  Your tokens will be locked until voting ends. Vote weight = {parseFloat(stakeAmount || '0').toFixed(4)} BCH
                </p>
              </div>

              {/* Voting Period Status */}
              <div className="bg-primary/5 border border-primary rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="text-sm font-sans font-medium text-primary">Voting Period</span>
                </div>
                <p className="text-sm font-mono text-textPrimary">
                  {(() => {
                    const endsAt = new Date(votingModal.proposal.votingEndsAt);
                    const now = new Date();
                    const diff = endsAt.getTime() - now.getTime();
                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

                    if (diff <= 0) {
                      return 'Voting has ended';
                    }
                    return `${days}d ${hours}h remaining`;
                  })()}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  variant="primary"
                  onClick={handleVote}
                  disabled={votingLoading || parseFloat(stakeAmount) <= 0}
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  {votingLoading ? 'Locking & Voting...' : 'Lock & Vote'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setVotingModal({ open: false, proposal: null })}
                  disabled={votingLoading}
                >
                  Cancel
                </Button>
              </div>

              {/* Unlock Info */}
              {(() => {
                const endsAt = new Date(votingModal.proposal.votingEndsAt);
                const hasEnded = endsAt.getTime() < Date.now();
                return hasEnded ? (
                  <div className="mt-6 pt-6 border-t border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-sans font-medium text-textPrimary mb-1">Voting Period Ended</p>
                        <p className="text-xs font-mono text-textMuted">You can now unlock your staked tokens</p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => handleUnlock(votingModal.proposal!)}
                        disabled={votingLoading}
                        className="flex items-center gap-2"
                      >
                        <Unlock className="w-4 h-4" />
                        Unlock Tokens
                      </Button>
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
