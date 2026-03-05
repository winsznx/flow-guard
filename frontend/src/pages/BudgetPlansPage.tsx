/**
 * BudgetPlansPage - Professional Budget Plan Management
 * Sablier-quality with DataTable, circular progress, CSV import/export
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, TrendingUp, Plus, Zap, Wallet, Download, Pause, X as CloseIcon, AlertCircle, ExternalLink } from 'lucide-react';
import { fetchBudgetPlans } from '../utils/api';
import { useWallet } from '../hooks/useWallet';
import {
  fundBudgetPlan,
  releaseMilestone,
  pauseBudgetPlanOnChain,
  cancelBudgetPlanOnChain,
  getExplorerTxUrl,
} from '../utils/blockchain';
import { useNetwork } from '../hooks/useNetwork';
import { Button } from '../components/ui/Button';
import { DataTable, Column } from '../components/shared/DataTable';
import { StatsCard } from '../components/shared/StatsCard';

type PlanStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
type PlanType = 'RECURRING' | 'LINEAR_VESTING' | 'STEP_VESTING';

interface BudgetPlan {
  id: string;
  creator: string;
  controllerAddress?: string | null;
  treasuryId: string;
  treasuryName: string;
  type: PlanType;
  recipient: string;
  recipientLabel?: string;
  intervalSeconds: number;
  amountPerInterval: number;
  totalReleased: number;
  totalAmount: number;
  nextUnlock?: Date;
  cliffDate?: Date;
  status: PlanStatus;
}

type FeedbackTone = 'success' | 'warning' | 'error' | 'info';

interface FeedbackState {
  tone: FeedbackTone;
  title: string;
  description?: string;
  txHash?: string;
}

export default function BudgetPlansPage() {
  const navigate = useNavigate();
  const wallet = useWallet();
  const network = useNetwork();
  const [budgetPlans, setBudgetPlans] = useState<BudgetPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | PlanStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | PlanType>('all');

  // Action modal state
  const [actionModal, setActionModal] = useState<{ open: boolean; plan: BudgetPlan | null }>({ open: false, plan: null });
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const transformPlan = (plan: any): BudgetPlan => ({
    id: plan.id,
    creator: plan.creator,
    controllerAddress: plan.controllerAddress || null,
    treasuryId: plan.vaultId,
    treasuryName: plan.vaultName || plan.vaultId,
    type: plan.planType as PlanType,
    recipient: plan.recipient,
    recipientLabel: plan.recipientLabel,
    intervalSeconds: plan.intervalSeconds,
    amountPerInterval: plan.amountPerInterval,
    totalReleased: plan.totalReleased,
    totalAmount: plan.totalAmount,
    nextUnlock: plan.nextUnlock ? new Date(plan.nextUnlock) : undefined,
    cliffDate: plan.cliffDate ? new Date(plan.cliffDate) : undefined,
    status: plan.status as PlanStatus,
  });

  const reloadPlans = async () => {
    const plans = await fetchBudgetPlans();
    setBudgetPlans(plans.map(transformPlan));
  };

  useEffect(() => {
    const loadBudgetPlans = async () => {
      try {
        setLoading(true);
        await reloadPlans();
      } catch (err: any) {
        console.error('Failed to load budget plans:', err);
      } finally {
        setLoading(false);
      }
    };

    loadBudgetPlans();
  }, []);

  // Calculate stats
  const activePlans = budgetPlans.filter((p) => p.status === 'ACTIVE');
  const totalScheduled = budgetPlans.reduce(
    (sum, p) => sum + (p.totalAmount - p.totalReleased),
    0
  );
  const totalReleased = budgetPlans.reduce((sum, p) => sum + p.totalReleased, 0);
  const nextUnlockingSoon = budgetPlans.filter(
    (p) => p.nextUnlock && p.nextUnlock.getTime() - Date.now() < 7 * 86400000
  ).length;

  // Filter plans
  const filteredPlans = budgetPlans.filter((plan) => {
    if (statusFilter !== 'all' && plan.status !== statusFilter) return false;
    if (typeFilter !== 'all' && plan.type !== typeFilter) return false;
    return true;
  });

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'RECURRING':
        return 'Recurring Release';
      case 'LINEAR_VESTING':
        return 'Linear Vesting';
      case 'STEP_VESTING':
        return 'Step Vesting';
      default:
        return type;
    }
  };

  const getIntervalLabel = (seconds: number) => {
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    if (seconds < 2592000) return `${Math.round(seconds / 86400)}d`;
    if (seconds < 31536000) return `${Math.round(seconds / 2592000)}mo`;
    return `${Math.round(seconds / 31536000)}y`;
  };

  const formatDate = (date?: Date) => {
    if (!date) return 'Not scheduled';
    const now = Date.now();
    const diff = date.getTime() - now;
    const days = Math.round(diff / 86400000);

    if (days < 0) return 'Overdue';
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days < 7) return `in ${days}d`;
    if (days < 30) return `in ${Math.round(days / 7)}w`;
    return `in ${Math.round(days / 30)}mo`;
  };

  // Table columns
  const columns: Column<BudgetPlan>[] = [
    {
      key: 'recipientLabel',
      label: 'Plan Name',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-sans font-medium text-textPrimary">
            {row.recipientLabel || 'Unnamed Plan'}
          </p>
          <p className="text-xs text-textMuted font-mono">{row.id}</p>
        </div>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      render: (row) => {
        const typeColors = {
          RECURRING: 'bg-primary/10 text-primary border-primary',
          LINEAR_VESTING: 'bg-accent/10 text-accent border-accent',
          STEP_VESTING: 'bg-secondary/10 text-secondary border-secondary',
        };
        return (
          <span
            className={`px-3 py-1 rounded-full text-xs font-sans font-medium border ${
              typeColors[row.type]
            }`}
          >
            {getTypeLabel(row.type)}
          </span>
        );
      },
    },
    {
      key: 'treasuryName',
      label: 'Treasury',
      sortable: true,
      render: (row) => (
        <p className="font-mono text-sm text-textPrimary">{row.treasuryName}</p>
      ),
    },
    {
      key: 'amountPerInterval',
      label: 'Per Release',
      sortable: true,
      className: 'text-right',
      render: (row) => (
        <div className="text-right">
          <p className="font-display font-bold text-primary">
            {row.amountPerInterval.toFixed(4)} BCH
          </p>
          <p className="text-xs text-textMuted font-mono">
            every {getIntervalLabel(row.intervalSeconds)}
          </p>
        </div>
      ),
    },
    {
      key: 'totalReleased',
      label: 'Released',
      sortable: true,
      className: 'text-right',
      render: (row) => {
        const progress = (row.totalReleased / row.totalAmount) * 100;
        return (
          <div className="text-right">
            <p className="font-display font-bold text-accent">
              {row.totalReleased.toFixed(4)} BCH
            </p>
            <div className="flex items-center justify-end gap-2 mt-1">
              <div className="w-20 bg-surfaceAlt rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs font-mono text-textMuted">
                {progress.toFixed(0)}%
              </span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'nextUnlock',
      label: 'Next Unlock',
      sortable: true,
      render: (row) => (
        <div>
          <p className="text-sm font-sans text-textPrimary">
            {formatDate(row.nextUnlock)}
          </p>
          {row.nextUnlock && (
            <p className="text-xs text-textMuted font-mono">
              {row.nextUnlock.toLocaleDateString()}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      className: 'text-center',
      render: (row) => {
        const statusColors: Record<PlanStatus, string> = {
          PENDING: 'bg-yellow-500/10 text-yellow-600 border-yellow-500',
          ACTIVE: 'bg-accent/10 text-accent border-accent',
          PAUSED: 'bg-secondary/10 text-secondary border-secondary',
          COMPLETED: 'bg-primary/10 text-primary border-primary',
          CANCELLED: 'bg-red-500/10 text-red-600 border-red-500',
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
    console.log('Imported budget plans:', data);
    navigate('/budgets/batch-create', { state: { importedData: data } });
  };

  const handleFund = async () => {
    if (!wallet.isConnected || !actionModal.plan) {
      setFeedback({
        tone: 'error',
        title: 'Wallet not connected',
        description: 'Connect your wallet before funding this budget plan.',
      });
      return;
    }

    setActionLoading(true);
    setFeedback({
      tone: 'info',
      title: 'Signing funding transaction',
      description: 'Approve the wallet request to fund this budget plan.',
    });
    try {
      const txHash = await fundBudgetPlan(wallet, actionModal.plan.id);
      setFeedback({
        tone: 'success',
        title: 'Budget plan funded',
        description: 'Funding transaction was confirmed by backend processing.',
        txHash,
      });
      await reloadPlans();
    } catch (error: any) {
      console.error('Failed to fund budget plan:', error);
      setFeedback({
        tone: 'error',
        title: 'Funding failed',
        description: error.message || 'Failed to fund budget plan.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRelease = async () => {
    if (!wallet.isConnected || !actionModal.plan) {
      setFeedback({
        tone: 'error',
        title: 'Wallet not connected',
        description: 'Connect your wallet before releasing this milestone.',
      });
      return;
    }

    setActionLoading(true);
    setFeedback({
      tone: 'info',
      title: 'Signing release transaction',
      description: 'Approve the wallet request to release this milestone.',
    });
    try {
      const txHash = await releaseMilestone(wallet, actionModal.plan.id);
      setFeedback({
        tone: 'success',
        title: 'Milestone released',
        description: 'Release transaction was submitted on-chain.',
        txHash,
      });
      await reloadPlans();
    } catch (error: any) {
      console.error('Failed to release milestone:', error);
      setFeedback({
        tone: 'error',
        title: 'Milestone release failed',
        description: error.message || 'Failed to release milestone.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    if (!wallet.isConnected || !actionModal.plan) {
      setFeedback({
        tone: 'error',
        title: 'Wallet not connected',
        description: 'Connect your wallet before pausing this budget plan.',
      });
      return;
    }

    setActionLoading(true);
    setFeedback({
      tone: 'info',
      title: 'Signing pause transaction',
      description: 'Approve the wallet request to pause this budget plan.',
    });
    try {
      const txHash = await pauseBudgetPlanOnChain(wallet, actionModal.plan.id);
      setFeedback({
        tone: 'success',
        title: 'Budget plan paused',
        description: 'Pause transaction was submitted on-chain.',
        txHash,
      });
      await reloadPlans();
    } catch (error: any) {
      console.error('Failed to pause budget plan:', error);
      setFeedback({
        tone: 'error',
        title: 'Pause failed',
        description: error.message || 'Failed to pause budget plan.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!actionModal.plan) return;
    if (!window.confirm('Are you sure you want to cancel this budget plan?')) {
      return;
    }
    if (!wallet.isConnected) {
      setFeedback({
        tone: 'error',
        title: 'Wallet not connected',
        description: 'Connect your wallet before cancelling this budget plan.',
      });
      return;
    }

    setActionLoading(true);
    setFeedback({
      tone: 'info',
      title: 'Signing cancel transaction',
      description: 'Approve the wallet request to cancel this budget plan.',
    });
    try {
      const txHash = await cancelBudgetPlanOnChain(wallet, actionModal.plan.id);
      setFeedback({
        tone: 'success',
        title: 'Budget plan cancelled',
        description: 'Cancel transaction was submitted on-chain.',
        txHash,
      });
      await reloadPlans();
    } catch (error: any) {
      console.error('Failed to cancel budget plan:', error);
      setFeedback({
        tone: 'error',
        title: 'Cancel failed',
        description: error.message || 'Failed to cancel budget plan.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const openActionModal = (plan: BudgetPlan) => {
    setFeedback(null);
    setActionModal({ open: true, plan });
  };

  const feedbackToneClasses: Record<FeedbackTone, string> = {
    success: 'border-success/40 bg-success/10 text-success',
    warning: 'border-warning/40 bg-warning/10 text-warning',
    error: 'border-error/40 bg-error/10 text-error',
    info: 'border-primary/30 bg-primary/10 text-primary',
  };

  return (
    <div className="min-h-screen pb-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-8">
            <div>
              <h1 className="font-display font-medium text-3xl md:text-5xl lg:text-6xl text-textPrimary mb-4">
                Budget Plans
              </h1>
              <p className="font-sans text-textMuted max-w-2xl text-sm leading-relaxed">
                Automated recurring releases and vesting schedules. Funds unlock on schedule,
                enforced by covenants.
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => navigate('/budgets/create')}
              className="shadow-lg"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Budget Plan
            </Button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatsCard
              label="Active Plans"
              value={activePlans.length}
              subtitle={`${budgetPlans.length} total`}
              icon={Calendar}
              color="primary"
            />
            <StatsCard
              label="Total Released"
              value={`${totalReleased.toFixed(4)} BCH`}
              subtitle="All time"
              icon={TrendingUp}
              color="accent"
              progress={{
                percentage:
                  totalReleased + totalScheduled > 0
                    ? (totalReleased / (totalReleased + totalScheduled)) * 100
                    : 0,
                label: 'Released',
              }}
            />
            <StatsCard
              label="Scheduled"
              value={`${totalScheduled.toFixed(4)} BCH`}
              subtitle="Remaining to unlock"
              icon={Clock}
              color="secondary"
            />
            <StatsCard
              label="Unlocking Soon"
              value={nextUnlockingSoon}
              subtitle="Within 7 days"
              icon={Zap}
              color="muted"
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-textMuted font-sans">Type:</span>
            {(['all', 'RECURRING', 'LINEAR_VESTING', 'STEP_VESTING'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-3 py-1.5 rounded-md text-xs font-sans font-medium transition-colors ${
                  typeFilter === type
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-surface text-textSecondary hover:bg-surfaceAlt border border-border'
                }`}
              >
                {type === 'all' ? 'ALL' : getTypeLabel(type)}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-textMuted font-sans">Status:</span>
            {(['all', 'ACTIVE', 'PAUSED', 'COMPLETED'] as const).map((status) => (
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
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent mx-auto mb-4" />
            <p className="text-textSecondary font-sans">Loading budget plans...</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredPlans}
            onRowClick={(plan) => openActionModal(plan)}
            enableSearch
            enableExport
            enableImport
            onImport={handleImport}
            emptyMessage="No budget plans found. Create your first budget plan to get started."
          />
        )}

        {/* Action Modal */}
        {actionModal.open && actionModal.plan && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setActionModal({ open: false, plan: null })}>
            <div className="bg-surface rounded-lg border border-border max-w-2xl w-full p-6 md:p-8" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-2xl md:text-3xl font-display font-bold text-textPrimary mb-2">
                    Budget Plan Actions
                  </h2>
                  <p className="text-sm font-sans text-textMuted">
                    {actionModal.plan.recipientLabel || 'Unnamed Plan'}
                  </p>
                </div>
                <button
                  onClick={() => setActionModal({ open: false, plan: null })}
                  className="text-textMuted hover:text-textPrimary transition-colors"
                >
                  <CloseIcon className="w-6 h-6" />
                </button>
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

              {/* Plan Details */}
              <div className="bg-surfaceAlt rounded-lg p-4 mb-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-textMuted font-sans">Recipient:</span>
                    <p className="font-mono text-textPrimary break-all">
                      {actionModal.plan.recipient.slice(0, 20)}...{actionModal.plan.recipient.slice(-10)}
                    </p>
                  </div>
                  <div>
                    <span className="text-textMuted font-sans">Status:</span>
                    <p className="font-mono text-textPrimary">{actionModal.plan.status}</p>
                  </div>
                  <div>
                    <span className="text-textMuted font-sans">Total Amount:</span>
                    <p className="font-mono text-textPrimary">{actionModal.plan.totalAmount.toFixed(4)} BCH</p>
                  </div>
                  <div>
                    <span className="text-textMuted font-sans">Released:</span>
                    <p className="font-mono text-textPrimary">{actionModal.plan.totalReleased.toFixed(4)} BCH</p>
                  </div>
                  <div>
                    <span className="text-textMuted font-sans">Per Release:</span>
                    <p className="font-mono text-textPrimary">{actionModal.plan.amountPerInterval.toFixed(4)} BCH</p>
                  </div>
                  <div>
                    <span className="text-textMuted font-sans">Next Unlock:</span>
                    <p className="font-mono text-textPrimary">{formatDate(actionModal.plan.nextUnlock)}</p>
                  </div>
                </div>
              </div>

              {/* Progress */}
              <div className="bg-primary/5 border border-primary rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-sans font-medium text-primary">Release Progress</span>
                  <span className="text-sm font-mono text-textPrimary">
                    {((actionModal.plan.totalReleased / actionModal.plan.totalAmount) * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-surfaceAlt rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(actionModal.plan.totalReleased / actionModal.plan.totalAmount) * 100}%` }}
                  />
                </div>
                <p className="text-xs font-mono text-textMuted mt-2">
                  {(actionModal.plan.totalAmount - actionModal.plan.totalReleased).toFixed(4)} BCH remaining
                </p>
              </div>

              {/* Action Buttons */}
              {(() => {
                const controllerAddress = actionModal.plan?.controllerAddress || actionModal.plan?.creator;
                const canControl = Boolean(
                  wallet.isConnected &&
                  wallet.address &&
                  controllerAddress &&
                  wallet.address.toLowerCase() === controllerAddress.toLowerCase(),
                );

                return (
                  <div className="flex gap-3">
                    {actionModal.plan.status === 'PENDING' && wallet.isConnected && (
                      <Button
                        variant="primary"
                        onClick={handleFund}
                        disabled={actionLoading}
                        className="flex-1 flex items-center justify-center gap-2"
                      >
                        <Wallet className="w-4 h-4" />
                        {actionLoading ? 'Funding...' : 'Fund Budget Plan'}
                      </Button>
                    )}

                    {actionModal.plan.status === 'ACTIVE' && canControl && (
                      <Button
                        variant="outline"
                        onClick={handlePause}
                        disabled={actionLoading}
                        className="flex-1 flex items-center justify-center gap-2"
                      >
                        <Pause className="w-4 h-4" />
                        {actionLoading ? 'Pausing...' : 'Pause'}
                      </Button>
                    )}

                    {(actionModal.plan.status === 'ACTIVE' || actionModal.plan.status === 'PAUSED') && canControl && (
                      <Button
                        variant="outline"
                        onClick={handleCancel}
                        disabled={actionLoading}
                        className="flex-1 flex items-center justify-center gap-2 text-error border-error hover:bg-error/5"
                      >
                        {actionLoading ? 'Cancelling...' : 'Cancel'}
                      </Button>
                    )}

                    {actionModal.plan.status === 'ACTIVE' &&
                     wallet.isConnected &&
                     wallet.address === actionModal.plan.recipient &&
                     actionModal.plan.nextUnlock &&
                     actionModal.plan.nextUnlock.getTime() <= Date.now() && (
                      <Button
                        variant="primary"
                        onClick={handleRelease}
                        disabled={actionLoading}
                        className="flex-1 flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        {actionLoading ? 'Releasing...' : 'Release Milestone'}
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      onClick={() => setActionModal({ open: false, plan: null })}
                      disabled={actionLoading}
                    >
                      Close
                    </Button>
                  </div>
                );
              })()}

              {/* Info Messages */}
              {actionModal.plan.status === 'PENDING' && (
                <div className="mt-4 p-3 bg-primary/5 border border-primary rounded-lg">
                  <p className="text-sm font-sans text-textPrimary">
                    This budget plan needs to be funded before milestones can be released.
                  </p>
                </div>
              )}

              {actionModal.plan.status === 'ACTIVE' &&
               actionModal.plan.nextUnlock &&
               actionModal.plan.nextUnlock.getTime() > Date.now() && (
                <div className="mt-4 p-3 bg-surfaceAlt rounded-lg">
                  <p className="text-sm font-sans text-textMuted">
                    Next milestone unlocks {formatDate(actionModal.plan.nextUnlock)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
