import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import {
  ArrowLeft,
  Check,
  Clock,
  AlertCircle,
  Users,
  FileText,
  TrendingUp,
  Calendar,
  ExternalLink
} from 'lucide-react';

/**
 * Request Detail Page - Single Spending Request View
 *
 * User-facing term: "Spending Request" (not "Proposal")
 * Backend term: ProposalUTXO
 *
 * Shows:
 * - Request details & payouts
 * - Approval timeline
 * - Guardrail validation status
 * - Execute CTA when ready
 */

interface Payout {
  recipient: string;
  amount: number;
  category?: string;
}

interface Approval {
  signer: string;
  timestamp: Date;
  txHash?: string;
}

interface SpendingRequest {
  id: string;
  treasuryId: string;
  treasuryName: string;
  status: 'DRAFT' | 'SUBMITTED' | 'VOTING' | 'APPROVED' | 'QUEUED' | 'EXECUTABLE' | 'EXECUTED' | 'CANCELLED';
  title: string;
  description: string;
  payouts: Payout[];
  totalAmount: number;
  requiredApprovals: number;
  currentApprovals: number;
  approvals: Approval[];
  submittedBy: string;
  submittedAt: Date;
  executionTimelock?: Date;
  votingEndTime?: Date;
  executedAt?: Date;
  executionTxHash?: string;
}

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [executing, setExecuting] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'warning' | 'error' | 'info';
    title: string;
    description?: string;
  } | null>(null);

  // MOCK DATA
  const request: SpendingRequest = {
    id: id || 'pr1',
    treasuryId: 'v1',
    treasuryName: 'Treasury Alpha',
    status: 'EXECUTABLE',
    title: 'Q1 Operations Budget',
    description: 'Monthly operational expenses for Q1 2026 including team salaries, infrastructure, and marketing.',
    payouts: [
      { recipient: 'bchtest:qp...abc123', amount: 2.5, category: 'Operations' },
      { recipient: 'bchtest:qq...def456', amount: 1.0, category: 'Marketing' },
      { recipient: 'bchtest:qr...ghi789', amount: 0.5, category: 'Infrastructure' }
    ],
    totalAmount: 4.0,
    requiredApprovals: 3,
    currentApprovals: 3,
    approvals: [
      {
        signer: 'Alice',
        timestamp: new Date(Date.now() - 86400000 * 5),
        txHash: 'abc123...'
      },
      {
        signer: 'Bob',
        timestamp: new Date(Date.now() - 86400000 * 3),
        txHash: 'def456...'
      },
      {
        signer: 'Charlie',
        timestamp: new Date(Date.now() - 86400000 * 1),
        txHash: 'ghi789...'
      }
    ],
    submittedBy: 'Alice',
    submittedAt: new Date(Date.now() - 86400000 * 7),
    executionTimelock: new Date(Date.now() - 86400000 * 2) // passed, ready to execute
  };

  const handleExecute = async () => {
    setFeedback({
      tone: 'info',
      title: 'Preparing execution lifecycle',
      description: 'Checking signer/session configuration for this request.',
    });
    setExecuting(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    setFeedback({
      tone: 'warning',
      title: 'Execution not configured for this route',
      description: 'Wallet-sign + backend confirmation wiring is required before this request can execute on-chain.',
    });
    setExecuting(false);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      DRAFT: 'bg-surfaceAlt text-textMuted',
      SUBMITTED: 'bg-surfaceAlt text-textSecondary',
      VOTING: 'bg-accent/20 text-primary',
      APPROVED: 'bg-accent/30 text-primary',
      QUEUED: 'bg-primarySoft text-primary',
      EXECUTABLE: 'bg-accent text-background',
      EXECUTED: 'bg-primary text-background',
      CANCELLED: 'bg-border text-textMuted'
    };

    return (
      <span className={`px-3 py-1 text-xs font-mono rounded-full ${styles[status] || styles.DRAFT}`}>
        {status}
      </span>
    );
  };

  const isExecutable = request.status === 'EXECUTABLE' &&
    request.currentApprovals >= request.requiredApprovals &&
    (!request.executionTimelock || request.executionTimelock.getTime() < Date.now());
  const feedbackToneClasses: Record<'success' | 'warning' | 'error' | 'info', string> = {
    success: 'border-success/40 bg-success/10 text-success',
    warning: 'border-warning/40 bg-warning/10 text-warning',
    error: 'border-error/40 bg-error/10 text-error',
    info: 'border-primary/30 bg-primary/10 text-primary',
  };

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Back Button */}
        <Link
          to="/proposals"
          className="inline-flex items-center gap-2 text-textSecondary hover:text-textPrimary font-mono text-sm mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Spending Requests
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-display font-bold text-textPrimary mb-3">
                {request.title}
              </h1>
              <p className="text-textSecondary font-mono text-sm">
                From <Link to={`/vaults/${request.treasuryId}`} className="text-accent hover:underline">{request.treasuryName}</Link>
              </p>
            </div>
            {getStatusBadge(request.status)}
          </div>

          {request.description && (
            <p className="text-textSecondary leading-relaxed max-w-3xl">
              {request.description}
            </p>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 md:mb-8">
          <Card padding="md">
            <div className="flex items-center gap-2 text-textMuted mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-mono uppercase">Total Amount</span>
            </div>
            <div className="text-lg md:text-xl lg:text-2xl font-display text-textPrimary">{request.totalAmount} BCH</div>
          </Card>

          <Card padding="md">
            <div className="flex items-center gap-2 text-textMuted mb-1">
              <Users className="w-4 h-4" />
              <span className="text-xs font-mono uppercase">Approvals</span>
            </div>
            <div className="text-lg md:text-xl lg:text-2xl font-display text-textPrimary">
              {request.currentApprovals}/{request.requiredApprovals}
            </div>
          </Card>

          <Card padding="md">
            <div className="flex items-center gap-2 text-textMuted mb-1">
              <FileText className="w-4 h-4" />
              <span className="text-xs font-mono uppercase">Payouts</span>
            </div>
            <div className="text-lg md:text-xl lg:text-2xl font-display text-textPrimary">{request.payouts.length}</div>
          </Card>

          <Card padding="md">
            <div className="flex items-center gap-2 text-textMuted mb-1">
              <Calendar className="w-4 h-4" />
              <span className="text-xs font-mono uppercase">Submitted</span>
            </div>
            <div className="text-sm font-mono text-textPrimary">
              {Math.round((Date.now() - request.submittedAt.getTime()) / 86400000)}d ago
            </div>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Payouts List */}
          <Card padding="lg">
            <h2 className="text-xl font-display font-semibold text-textPrimary mb-6 flex items-center gap-2">
              <FileText className="w-5 h-5 text-accent" />
              Payout Details
            </h2>
            <div className="space-y-3">
              {request.payouts.map((payout, idx) => (
                <div key={idx} className="flex justify-between items-start p-4 bg-surfaceAlt rounded-lg">
                  <div className="flex-1">
                    <div className="font-mono text-xs text-textMuted mb-1">
                      {payout.category && (
                        <span className="px-2 py-0.5 bg-border text-textSecondary rounded text-xs mr-2">
                          {payout.category}
                        </span>
                      )}
                      Recipient {idx + 1}
                    </div>
                    <div className="font-mono text-sm text-textPrimary truncate">{payout.recipient}</div>
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-lg font-display text-textPrimary">{payout.amount} BCH</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Approval Timeline */}
          <Card padding="lg">
            <h2 className="text-xl font-display font-semibold text-textPrimary mb-6 flex items-center gap-2">
              <Users className="w-5 h-5 text-accent" />
              Approval Timeline
            </h2>

            <div className="space-y-4">
              {request.approvals.map((approval, idx) => (
                <div key={idx} className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                      <Check className="w-4 h-4 text-accent" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-textPrimary">{approval.signer}</div>
                    <div className="text-sm text-textMuted font-mono">
                      {approval.timestamp.toLocaleDateString()} at {approval.timestamp.toLocaleTimeString()}
                    </div>
                    {approval.txHash && (
                      <a
                        href={`https://chipnet.imaginary.cash/tx/${approval.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent hover:underline font-mono inline-flex items-center gap-1 mt-1"
                      >
                        View TX <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}

              {/* Pending Approvals */}
              {request.currentApprovals < request.requiredApprovals && (
                <div className="flex items-start gap-4 opacity-50">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center">
                      <Clock className="w-4 h-4 text-textMuted" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-textSecondary">
                      Pending ({request.requiredApprovals - request.currentApprovals} more needed)
                    </div>
                    <div className="text-sm text-textMuted font-mono">Awaiting approval</div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {feedback && (
          <Card
            padding="lg"
            className={`mt-6 border ${feedbackToneClasses[feedback.tone]}`}
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{feedback.title}</p>
                {feedback.description && (
                  <p className="mt-1 text-sm leading-6 text-textSecondary">{feedback.description}</p>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Execution Panel */}
        {isExecutable && (
          <Card padding="lg" className="mt-6 border-2 border-accent">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-accent/20 rounded-lg">
                  <AlertCircle className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h3 className="text-lg font-display font-semibold text-textPrimary mb-1">
                    Ready for Execution
                  </h3>
                  <p className="text-sm text-textSecondary">
                    All approvals collected and timelock passed. Anyone can execute this request permissionlessly.
                  </p>
                </div>
              </div>
              <Button
                size="lg"
                onClick={handleExecute}
                disabled={executing}
                className="md:min-w-[200px]"
              >
                {executing ? 'Executing...' : 'Execute Request'}
              </Button>
            </div>
          </Card>
        )}

        {/* Metadata Footer */}
        <div className="mt-8 pt-6 border-t border-border">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-mono text-textMuted">
            <div>
              <div className="text-xs uppercase mb-1">Request ID</div>
              <div className="text-textSecondary">{request.id}</div>
            </div>
            <div>
              <div className="text-xs uppercase mb-1">Submitted By</div>
              <div className="text-textSecondary">{request.submittedBy}</div>
            </div>
            <div>
              <div className="text-xs uppercase mb-1">Timelock</div>
              <div className="text-textSecondary">
                {request.executionTimelock ? 'Passed' : 'None'}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase mb-1">Execution</div>
              <div className="text-textSecondary">
                {request.executedAt ? request.executedAt.toLocaleDateString() : 'Pending'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
