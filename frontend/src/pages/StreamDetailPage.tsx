import { useState, useEffect } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  Calendar,
  TrendingUp,
  Download,
  Repeat,
  XCircle,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { useNetwork } from '../hooks/useNetwork';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { CircularProgress } from '../components/streams/CircularProgress';
import { StreamScheduleChart } from '../components/streams/StreamScheduleChart';
import { formatLogicalId } from '../utils/display';
import { readDaoLaunchContext, type DaoLaunchContext } from '../utils/daoStreamLaunch';
import { getStreamScheduleTemplateLabel } from '../utils/streamShapes';
import {
  deserializeWcSignOptions,
  fundStreamContract,
  getExplorerTxUrl,
  pauseStreamOnChain,
  refillStreamOnChain,
  resolveTxHashFromSignResult,
  resumeStreamOnChain,
  transferStreamOnChain,
  type SerializedWcTransaction,
} from '../utils/blockchain';
import { emitTransactionNotice, normalizeWalletNetwork } from '../utils/txNotice';

interface StreamLaunchContext {
  source: string;
  title?: string;
  description?: string;
  preferredLane?: string;
}

interface Stream {
  id: string;
  stream_id: string;
  vault_id: string;
  sender: string;
  recipient: string;
  token_type: 'BCH' | 'CASHTOKENS';
  token_category?: string;
  total_amount: number;
  withdrawn_amount: number;
  vested_amount: number;
  claimable_amount: number;
  progress_percentage: number;
  stream_type: 'LINEAR' | 'RECURRING' | 'STEP' | 'TRANCHE' | 'HYBRID';
  start_time: number;
  end_time?: number;
  interval_seconds?: number;
  amount_per_interval?: number;
  step_amount?: number;
  schedule_count?: number;
  tranche_schedule?: Array<{
    unlock_time: number;
    amount: number;
    cumulative_amount: number;
  }>;
  hybrid_unlock_time?: number;
  hybrid_upfront_amount?: number;
  cliff_timestamp?: number;
  next_payment_time?: number;
  schedule_template?: string;
  launch_source?: string;
  launch_title?: string;
  launch_description?: string;
  preferred_lane?: string;
  launch_context?: StreamLaunchContext;
  cancelable: boolean;
  transferable: boolean;
  refillable: boolean;
  status: 'PENDING' | 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
  created_at: number;
  description?: string;
}

interface Claim {
  id: string;
  amount: number;
  claimed_at: number;
  tx_hash?: string;
}

interface ActivityEvent {
  id: string;
  event_type: string;
  actor: string | null;
  amount: number | null;
  status: string | null;
  tx_hash: string | null;
  created_at: number;
}

interface RelatedActivityEvent {
  id: string;
  event_type: string;
  actor: string | null;
  amount: number | null;
  status: string | null;
  tx_hash: string | null;
  created_at: number;
  stream: {
    stream_id: string;
    vault_id?: string | null;
    stream_type: string;
    schedule_template?: string | null;
    launch_context?: StreamLaunchContext | null;
  };
}

type FeedbackTone = 'success' | 'warning' | 'error' | 'info';

interface FeedbackState {
  tone: FeedbackTone;
  title: string;
  description?: string;
  txHash?: string;
}

function getApiErrorMessage(error: any, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const generic = typeof error.error === 'string' ? error.error.trim() : '';
  const detail = typeof error.message === 'string' ? error.message.trim() : '';
  if (generic && detail && generic !== detail) return `${generic}: ${detail}`;
  return detail || generic || fallback;
}

function formatAssetAmount(amount: number, tokenType: 'BCH' | 'CASHTOKENS') {
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: tokenType === 'BCH' ? 8 : 0,
  })} ${tokenType === 'BCH' ? 'BCH' : 'tokens'}`;
}

function formatIntervalLabel(intervalSeconds?: number) {
  if (!intervalSeconds) return 'N/A';
  const days = Math.round(intervalSeconds / 86400);
  if (days % 365 === 0) {
    const years = days / 365;
    return `${years} year${years === 1 ? '' : 's'}`;
  }
  if (days % 30 === 0) {
    const months = days / 30;
    return `${months} month${months === 1 ? '' : 's'}`;
  }
  if (days % 7 === 0) {
    const weeks = days / 7;
    return `${weeks} week${weeks === 1 ? '' : 's'}`;
  }
  return `${days} day${days === 1 ? '' : 's'}`;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeChartPoints(points: Array<{ x: number; y: number }>) {
  const normalized: Array<{ x: number; y: number }> = [];

  for (const point of points) {
    const x = clamp01(point.x);
    const y = clamp01(point.y);
    const previous = normalized[normalized.length - 1];

    if (previous && Math.abs(previous.x - x) < 0.0001 && Math.abs(previous.y - y) < 0.0001) {
      continue;
    }

    normalized.push({ x, y });
  }

  return normalized.length > 0 ? normalized : [{ x: 0, y: 0 }, { x: 1, y: 0 }];
}

function buildStreamDetailChartPoints(stream: Stream) {
  const derivedDurationSeconds = stream.end_time && stream.end_time > stream.start_time
    ? stream.end_time - stream.start_time
    : stream.stream_type === 'RECURRING' && stream.interval_seconds && stream.schedule_count
      ? stream.interval_seconds * stream.schedule_count
      : 0;
  if (derivedDurationSeconds <= 0) {
    return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  }

  const durationSeconds = derivedDurationSeconds;

  if (stream.stream_type === 'LINEAR') {
    if (stream.cliff_timestamp && stream.cliff_timestamp > stream.start_time) {
      const cliffElapsed = stream.cliff_timestamp - stream.start_time;
      const cliffX = cliffElapsed / durationSeconds;
      const cliffY = stream.total_amount > 0
        ? Math.min((stream.total_amount * cliffElapsed) / durationSeconds, stream.total_amount) / stream.total_amount
        : cliffX;

      return normalizeChartPoints([
        { x: 0, y: 0 },
        { x: cliffX, y: 0 },
        { x: cliffX, y: cliffY },
        { x: 1, y: 1 },
      ]);
    }

    return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  }

  if (stream.stream_type === 'HYBRID') {
    if (
      !stream.end_time ||
      !stream.hybrid_unlock_time ||
      stream.hybrid_unlock_time <= stream.start_time ||
      stream.hybrid_unlock_time >= stream.end_time
    ) {
      return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    }

    const unlockX = (stream.hybrid_unlock_time - stream.start_time) / durationSeconds;
    const unlockY = stream.total_amount > 0 && stream.hybrid_upfront_amount !== undefined
      ? Math.max(0, Math.min(stream.hybrid_upfront_amount, stream.total_amount)) / stream.total_amount
      : 0;

    return normalizeChartPoints([
      { x: 0, y: 0 },
      { x: unlockX, y: 0 },
      { x: unlockX, y: unlockY },
      { x: 1, y: 1 },
    ]);
  }

  if (!stream.interval_seconds || stream.interval_seconds <= 0) {
    return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  }

  const scheduleCount = stream.schedule_count || Math.floor(durationSeconds / stream.interval_seconds);
  if (scheduleCount < 1) {
    return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  }

  if (stream.stream_type === 'RECURRING') {
    const points = [{ x: 0, y: 0 }];
    for (let index = 1; index <= scheduleCount; index += 1) {
      points.push({
        x: (index * stream.interval_seconds) / durationSeconds,
        y: index / scheduleCount,
      });
    }
    return normalizeChartPoints(points);
  }

  if (stream.stream_type === 'TRANCHE') {
    const schedule = stream.tranche_schedule || [];
    if (schedule.length === 0) {
      return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    }

    const points = [{ x: 0, y: 0 }];
    for (const tranche of schedule) {
      const x = (tranche.unlock_time - stream.start_time) / durationSeconds;
      const y = stream.total_amount > 0 ? tranche.cumulative_amount / stream.total_amount : 0;
      points.push({ x, y: points[points.length - 1].y });
      points.push({ x, y });
    }
    return normalizeChartPoints(points);
  }

  const stepAmount = stream.step_amount ?? Math.ceil(stream.total_amount / scheduleCount);
  const cliffElapsed = stream.cliff_timestamp && stream.cliff_timestamp > stream.start_time
    ? stream.cliff_timestamp - stream.start_time
    : 0;
  const cliffCompletedSteps = cliffElapsed > 0
    ? Math.min(scheduleCount, Math.floor(cliffElapsed / stream.interval_seconds))
    : 0;
  const points = [{ x: 0, y: 0 }];

  if (cliffElapsed > 0) {
    const cliffY = stream.total_amount > 0
      ? Math.min(cliffCompletedSteps * stepAmount, stream.total_amount) / stream.total_amount
      : cliffCompletedSteps / scheduleCount;
    points.push({ x: cliffElapsed / durationSeconds, y: 0 });
    if (cliffY > 0) {
      points.push({ x: cliffElapsed / durationSeconds, y: cliffY });
    }
  }

  for (let index = Math.max(1, cliffCompletedSteps + 1); index <= scheduleCount; index += 1) {
    points.push({
      x: (index * stream.interval_seconds) / durationSeconds,
      y: stream.total_amount > 0
        ? Math.min(index * stepAmount, stream.total_amount) / stream.total_amount
        : index / scheduleCount,
    });
  }

  return normalizeChartPoints(points);
}

function buildScheduleRows(stream: Stream) {
  if (stream.stream_type === 'LINEAR') {
    const rows: Array<{ label: string; date: string; note: string }> = [];

    if (stream.cliff_timestamp && stream.end_time && stream.cliff_timestamp > stream.start_time) {
      const cliffElapsed = stream.cliff_timestamp - stream.start_time;
      const duration = stream.end_time - stream.start_time;
      const cliffUnlock = duration > 0
        ? Math.min((stream.total_amount * cliffElapsed) / duration, stream.total_amount)
        : stream.total_amount;

      rows.push({
        label: 'Cliff release',
        date: new Date(stream.cliff_timestamp * 1000).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        note: `${formatAssetAmount(cliffUnlock, stream.token_type)} becomes claimable when the cliff lifts.`,
      });
    }

    if (stream.end_time) {
      rows.push({
        label: 'Full unlock',
        date: new Date(stream.end_time * 1000).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        note: formatAssetAmount(stream.total_amount, stream.token_type),
      });
    }

    return rows;
  }

  if (stream.stream_type === 'HYBRID') {
    const rows: Array<{ label: string; date: string; note: string }> = [];

    if (stream.hybrid_unlock_time) {
      rows.push({
        label: 'Upfront unlock',
        date: new Date(stream.hybrid_unlock_time * 1000).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        note: stream.hybrid_upfront_amount !== undefined
          ? formatAssetAmount(stream.hybrid_upfront_amount, stream.token_type)
          : 'Configured upfront release',
      });
    }

    if (stream.end_time) {
      const remainder = stream.hybrid_upfront_amount !== undefined
        ? Math.max(0, stream.total_amount - stream.hybrid_upfront_amount)
        : stream.total_amount;
      rows.push({
        label: 'Linear remainder completes',
        date: new Date(stream.end_time * 1000).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        note: `${formatAssetAmount(remainder, stream.token_type)} finishes vesting by schedule end.`,
      });
    }

    return rows;
  }

  const scheduleCount = stream.schedule_count || 0;
  const intervalSeconds = stream.interval_seconds || 0;
  if (scheduleCount < 1 || intervalSeconds <= 0) return [];

  if (stream.stream_type === 'RECURRING') {
    const rows: Array<{ label: string; date: string; note: string }> = [];
    const visible = Math.min(scheduleCount, 4);
    const fundedRunwayEnd = stream.start_time + intervalSeconds * scheduleCount;

    for (let index = 1; index <= visible; index += 1) {
      rows.push({
        label: `Release ${index}`,
        date: new Date((stream.start_time + intervalSeconds * index) * 1000).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        note: stream.amount_per_interval !== undefined
          ? formatAssetAmount(stream.amount_per_interval, stream.token_type)
          : 'Pending',
      });
    }

    if (scheduleCount > visible) {
      rows.push({
        label: `Final release (${scheduleCount})`,
        date: new Date(fundedRunwayEnd * 1000).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        note: stream.amount_per_interval !== undefined
          ? formatAssetAmount(stream.amount_per_interval, stream.token_type)
          : 'Pending',
      });
    }

    return rows;
  }

  if (stream.stream_type === 'TRANCHE') {
    return (stream.tranche_schedule || []).map((tranche, index) => ({
      label: `Tranche ${index + 1}`,
      date: new Date(tranche.unlock_time * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      note: `${formatAssetAmount(tranche.amount, stream.token_type)} • cumulative ${formatAssetAmount(tranche.cumulative_amount, stream.token_type)}`,
    }));
  }

  const stepAmount = stream.step_amount ?? Math.ceil(stream.total_amount / scheduleCount);
  const finalAmount = stream.total_amount - (stepAmount * Math.max(0, scheduleCount - 1));
  const cliffElapsed = stream.cliff_timestamp && stream.cliff_timestamp > stream.start_time
    ? stream.cliff_timestamp - stream.start_time
    : 0;
  const cliffCompletedSteps = cliffElapsed > 0
    ? Math.min(scheduleCount, Math.floor(cliffElapsed / intervalSeconds))
    : 0;
  const rows: Array<{ label: string; date: string; note: string }> = [];

  if (cliffElapsed > 0 && cliffCompletedSteps > 0 && stream.cliff_timestamp) {
    rows.push({
      label: 'Cliff unlock',
      date: new Date(stream.cliff_timestamp * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      note: `${formatAssetAmount(Math.min(cliffCompletedSteps * stepAmount, stream.total_amount), stream.token_type)} across ${cliffCompletedSteps} milestone${cliffCompletedSteps === 1 ? '' : 's'}.`,
    });
  }

  const visibleMilestones = Math.min(scheduleCount - cliffCompletedSteps, 3);
  for (let offset = 0; offset < visibleMilestones; offset += 1) {
    const milestoneIndex = cliffCompletedSteps + offset + 1;
    if (milestoneIndex > scheduleCount) break;
    rows.push({
      label: `Milestone ${milestoneIndex}`,
      date: new Date((stream.start_time + intervalSeconds * milestoneIndex) * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      note: formatAssetAmount(milestoneIndex === scheduleCount ? finalAmount : stepAmount, stream.token_type),
    });
  }

  if (scheduleCount > cliffCompletedSteps + visibleMilestones && stream.end_time) {
    rows.push({
      label: `Final milestone (${scheduleCount})`,
      date: new Date(stream.end_time * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      note: formatAssetAmount(finalAmount, stream.token_type),
    });
  }

  return rows;
}

/**
 * StreamDetailPage - Single Stream View
 * Like Sablier's stream detail page with circular progress ring
 */
export default function StreamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const wallet = useWallet();
  const network = useNetwork();
  const navigate = useNavigate();
  const location = useLocation();
  const launchState = location.state as { daoContext?: DaoLaunchContext } | null;
  const daoContext = launchState?.daoContext || readDaoLaunchContext();
  const [stream, setStream] = useState<Stream | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [funding, setFunding] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [refilling, setRefilling] = useState(false);
  const [nextRecipientAddress, setNextRecipientAddress] = useState('');
  const [refillAmountInput, setRefillAmountInput] = useState('');
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [relatedActivity, setRelatedActivity] = useState<RelatedActivityEvent[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const refreshStream = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/streams/${id}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to fetch stream' }));
        throw new Error(error.error || 'Failed to fetch stream');
      }
      const data = await response.json();
      setStream(data.stream);
      setClaims(data.claims || []);
      setEvents(data.events || []);
      const persistedContext = data.stream?.launch_context;
      if (persistedContext?.source || data.stream?.vault_id) {
        const relatedParams = new URLSearchParams();
        relatedParams.set('limit', '6');
        if (persistedContext?.source) {
          relatedParams.set('contextSource', persistedContext.source);
          relatedParams.set('treasury', 'true');
        }
        if (data.stream?.vault_id) {
          relatedParams.set('vaultId', data.stream.vault_id);
        }

        const relatedResponse = await fetch(`/api/streams/activity?${relatedParams.toString()}`);
        const relatedData = await relatedResponse.json().catch(() => ({ events: [] }));
        setRelatedActivity(
          (relatedData.events || []).filter((event: RelatedActivityEvent) => event.stream.stream_id !== data.stream.stream_id),
        );
      } else {
        setRelatedActivity([]);
      }
      setLoadError(null);
    } catch (error) {
      console.error('Failed to fetch stream:', error);
      setLoadError(error instanceof Error ? error.message : 'Failed to load stream');
      setStream(null);
      setClaims([]);
      setEvents([]);
      setRelatedActivity([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      void refreshStream();
    }
  }, [id, wallet.address]);

  const handleClaim = async () => {
    if (!stream || stream.claimable_amount <= 0) return;
    if (!wallet.isConnected) {
      setFeedback({
        tone: 'info',
        title: 'Connect your wallet first.',
        description: 'Wallet access is required before you can claim from this stream.',
      });
      return;
    }

    try {
      setClaiming(true);

      const claimResponse = await fetch(`/api/streams/${stream.id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientAddress: wallet.address,
          signerAddress: wallet.address,
        }),
      });

      if (!claimResponse.ok) {
        const errorData = await claimResponse.json().catch(() => ({ error: 'Failed to create claim transaction' }));
        throw new Error(getApiErrorMessage(errorData, 'Failed to create claim transaction'));
      }

      const { claimableAmount, wcTransaction } = await claimResponse.json() as {
        success: boolean;
        claimableAmount: number;
        wcTransaction: SerializedWcTransaction;
      };

      const signOptions = {
        ...deserializeWcSignOptions(wcTransaction),
        broadcast: wcTransaction.broadcast ?? true,
        userPrompt: `Claim ${formatAssetAmount(claimableAmount, stream.token_type)} from stream ${stream.stream_id}`,
      };
      const signResult = await wallet.signCashScriptTransaction(signOptions);
      const txHash = await resolveTxHashFromSignResult(
        signResult,
        signOptions,
        'Stream claim signing failed'
      );

      // Confirm claim with backend to record the txid and update withdrawn amount
      const confirmResponse = await fetch(`/api/streams/${stream.id}/confirm-claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
              txHash,
              claimedAmount: claimableAmount,
            }),
          });

      if (!confirmResponse.ok) {
        console.error('Failed to confirm claim, but transaction was broadcast');
      }

      // Refresh stream data
      await refreshStream();

      emitTransactionNotice({
        txHash,
        network: normalizeWalletNetwork(wallet.network),
        label: 'Stream claim',
      });

      setFeedback({
        tone: 'success',
        title: `Successfully claimed ${formatAssetAmount(claimableAmount, stream.token_type)}.`,
        description: 'The stream balance and claim history have been refreshed.',
        txHash,
      });
    } catch (error) {
      console.error('Claim failed:', error);
      setFeedback({
        tone: 'error',
        title: 'Claim failed.',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setClaiming(false);
    }
  };

  const handleCancel = async () => {
    if (!stream || !stream.cancelable) return;
    if (!wallet.isConnected) {
      setFeedback({
        tone: 'info',
        title: 'Connect your wallet first.',
        description: 'Wallet access is required before you can cancel this stream.',
      });
      return;
    }
    const signerAddress = wallet.address ?? '';

    const confirmed = window.confirm(
      `Are you sure you want to cancel this stream?\n\n` +
      `Recipient will keep all vested funds (${formatAssetAmount(stream.vested_amount, stream.token_type)}).\n` +
      `Remaining funds (${formatAssetAmount(stream.total_amount - stream.vested_amount, stream.token_type)}) will be returned to the sender.`
    );

    if (!confirmed) return;

    try {
      setCancelling(true);

      // Get transaction descriptor from backend
      const cancelResponse = await fetch(`/api/streams/${stream.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
        body: JSON.stringify({}),
      });

      if (!cancelResponse.ok) {
        const errorData = await cancelResponse.json().catch(() => ({ error: 'Failed to create cancel transaction' }));
        throw new Error(getApiErrorMessage(errorData, 'Failed to create cancel transaction'));
      }

      const payload = await cancelResponse.json() as { wcTransaction?: SerializedWcTransaction };
      if (!payload.wcTransaction) {
        throw new Error(
          'Cancel transaction signing is not wired yet for this stream type. ' +
          'Backend must return a WalletConnect-compatible transaction object.',
        );
      }

      const signOptions = {
        ...deserializeWcSignOptions(payload.wcTransaction),
        broadcast: payload.wcTransaction.broadcast ?? true,
        userPrompt: payload.wcTransaction.userPrompt ?? `Cancel stream ${stream.stream_id}`,
      };
      const signResult = await wallet.signCashScriptTransaction(signOptions);
      const txHash = await resolveTxHashFromSignResult(
        signResult,
        signOptions,
        'Stream cancel signing failed',
      );

      const confirmResponse = await fetch(`/api/streams/${stream.id}/confirm-cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
        body: JSON.stringify({
          txHash,
        }),
      });

      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json().catch(() => ({ error: 'Failed to confirm cancel' }));
        throw new Error(errorData.message || errorData.error || 'Cancel transaction broadcast but confirmation failed');
      }

      console.log('Cancel transaction signed and broadcast:', txHash);
      emitTransactionNotice({
        txHash,
        network: normalizeWalletNetwork(wallet.network),
        label: 'Stream cancelled',
      });

      setFeedback({
        tone: 'success',
        title: 'Stream cancelled successfully.',
        description: 'The stream has been closed on-chain and treasury state was updated.',
        txHash,
      });
      navigate(stream.vault_id ? `/vaults/${stream.vault_id}?tab=streams` : effectiveDaoContext ? '/app/dao' : '/streams');
    } catch (error) {
      console.error('Cancel failed:', error);
      await refreshStream();
      setFeedback({
        tone: 'error',
        title: 'Cancel failed.',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setCancelling(false);
    }
  };

  const handleFund = async () => {
    if (!stream || stream.status !== 'PENDING') return;
    if (!wallet.isConnected) {
      setFeedback({
        tone: 'info',
        title: 'Connect your wallet first.',
        description: 'Wallet access is required before you can fund this stream.',
      });
      return;
    }

    try {
      setFunding(true);

      const txId = await fundStreamContract(wallet, stream.id);
      console.log('Stream funded successfully. TxID:', txId);

      // Refresh stream data
      await refreshStream();

      setFeedback({
        tone: 'success',
        title: 'Stream funded successfully.',
        description: 'The funding transaction is recorded and stream status was refreshed.',
        txHash: txId,
      });
    } catch (error) {
      console.error('Funding failed:', error);
      setFeedback({
        tone: 'error',
        title: 'Funding failed.',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setFunding(false);
    }
  };

  const copyToClipboard = async (text: string, type: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedAddress(type);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 10)}...${addr.slice(-8)}`;
  const formatDate = (timestamp: number) =>
    new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const formatDuration = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      ACTIVE: 'bg-green-100 text-green-800',
      PAUSED: 'bg-yellow-100 text-yellow-800',
      CANCELLED: 'bg-red-100 text-red-800',
      COMPLETED: 'bg-gray-100 text-gray-800',
    };

    const icons: Record<string, any> = {
      ACTIVE: CheckCircle2,
      PAUSED: Clock,
      CANCELLED: XCircle,
      COMPLETED: CheckCircle2,
    };

    const Icon = icons[status] || AlertCircle;

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${styles[status]}`}>
        <Icon className="w-4 h-4" />
        {status}
      </span>
    );
  };

  const getExplorerUrl = (txHash: string) => {
    return getExplorerTxUrl(txHash, network);
  };

  const handlePause = async () => {
    if (!stream) return;
    if (!wallet.isConnected) {
      setFeedback({
        tone: 'info',
        title: 'Connect your wallet first.',
        description: 'Wallet access is required before you can pause this stream.',
      });
      return;
    }

    try {
      setPausing(true);
      const txHash = await pauseStreamOnChain(wallet, stream.id);
      await refreshStream();
      setFeedback({
        tone: 'success',
        title: 'Stream paused successfully.',
        description: 'Claims are paused until the stream is resumed.',
        txHash,
      });
    } catch (error) {
      console.error('Pause failed:', error);
      await refreshStream();
      setFeedback({
        tone: 'error',
        title: 'Pause failed.',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setPausing(false);
    }
  };

  const handleResume = async () => {
    if (!stream) return;
    if (!wallet.isConnected) {
      setFeedback({
        tone: 'info',
        title: 'Connect your wallet first.',
        description: 'Wallet access is required before you can resume this stream.',
      });
      return;
    }

    try {
      setResuming(true);
      const txHash = await resumeStreamOnChain(wallet, stream.id);
      await refreshStream();
      setFeedback({
        tone: 'success',
        title: 'Stream resumed successfully.',
        description: 'The vesting schedule is active again.',
        txHash,
      });
    } catch (error) {
      console.error('Resume failed:', error);
      setFeedback({
        tone: 'error',
        title: 'Resume failed.',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setResuming(false);
    }
  };

  const handleTransfer = async () => {
    if (!stream) return;
    if (!wallet.isConnected) {
      setFeedback({
        tone: 'info',
        title: 'Connect your wallet first.',
        description: 'Wallet access is required before you can transfer recipient ownership.',
      });
      return;
    }
    if (!nextRecipientAddress.trim()) {
      setFeedback({
        tone: 'warning',
        title: 'Recipient address is required.',
        description: 'Enter a new recipient address before submitting transfer.',
      });
      return;
    }

    try {
      setTransferring(true);
      const txHash = await transferStreamOnChain(wallet, stream.id, nextRecipientAddress.trim());
      setNextRecipientAddress('');
      await refreshStream();
      setFeedback({
        tone: 'success',
        title: 'Stream recipient updated successfully.',
        description: 'Ownership was transferred on-chain and details have been refreshed.',
        txHash,
      });
    } catch (error) {
      console.error('Transfer failed:', error);
      setFeedback({
        tone: 'error',
        title: 'Transfer failed.',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setTransferring(false);
    }
  };

  const handleRefill = async () => {
    if (!stream) return;
    if (!wallet.isConnected) {
      setFeedback({
        tone: 'info',
        title: 'Connect your wallet first.',
        description: 'Wallet access is required before you can refill runway.',
      });
      return;
    }
    const refillAmount = Number(refillAmountInput);
    if (!Number.isFinite(refillAmount) || refillAmount <= 0) {
      setFeedback({
        tone: 'warning',
        title: 'Refill amount is invalid.',
        description: 'Enter an amount greater than zero.',
      });
      return;
    }

    try {
      setRefilling(true);
      const txHash = await refillStreamOnChain(wallet, stream.id, refillAmount);
      setRefillAmountInput('');
      await refreshStream();
      setFeedback({
        tone: 'success',
        title: 'Recurring stream refilled successfully.',
        description: 'Runway was extended and stream totals were refreshed.',
        txHash,
      });
    } catch (error) {
      console.error('Refill failed:', error);
      setFeedback({
        tone: 'error',
        title: 'Refill failed.',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setRefilling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-textSecondary">Loading stream details...</p>
        </div>
      </div>
    );
  }

  if (loadError || !stream) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Card padding="lg" className="border-red-200 bg-red-50/50">
          <p className="font-mono text-sm text-red-700">
            {loadError || 'Stream not found'}
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => navigate(daoContext ? '/app/dao' : '/streams')}>
              Back to Streams
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const isSender = wallet.address?.toLowerCase() === stream.sender.toLowerCase();
  const isRecipient = wallet.address?.toLowerCase() === stream.recipient.toLowerCase();
  const effectiveDaoContext: DaoLaunchContext | null = stream.launch_context
    ? {
        source: stream.launch_context.source,
        title: stream.launch_context.title || daoContext?.title || 'Organization stream workflow',
        description: stream.launch_context.description || daoContext?.description || 'This stream was launched from an organization workspace and is tracked as part of the treasury workflow.',
        preferredLane: stream.launch_context.preferredLane || daoContext?.preferredLane,
      }
    : daoContext || null;
  const displayStreamId = formatLogicalId(stream.stream_id);
  const templateLabel = getStreamScheduleTemplateLabel(stream.schedule_template);
  const cadenceLabel = stream.stream_type === 'LINEAR'
    ? stream.cliff_timestamp && stream.end_time && stream.cliff_timestamp > stream.start_time
      ? 'Continuous vesting with cliff release'
      : 'Continuous unlock'
    : stream.stream_type === 'HYBRID'
      ? 'Upfront unlock + linear tail'
    : stream.stream_type === 'TRANCHE'
      ? 'Custom unlock checkpoints'
    : `${stream.stream_type === 'RECURRING' ? 'Release cadence' : 'Milestone cadence'}: ${formatIntervalLabel(stream.interval_seconds)}`;
  const fundedRunwayLabel = stream.stream_type === 'RECURRING' && stream.refillable
    ? `${stream.schedule_count || 0} funded release${stream.schedule_count === 1 ? '' : 's'} in runway`
    : null;
  const trancheLabel = stream.stream_type === 'RECURRING'
    ? stream.amount_per_interval !== undefined
      ? formatAssetAmount(stream.amount_per_interval, stream.token_type)
      : 'Pending'
    : stream.stream_type === 'TRANCHE'
      ? stream.tranche_schedule?.length
        ? `${stream.tranche_schedule.length} custom checkpoints`
        : 'Pending'
    : stream.stream_type === 'HYBRID'
      ? stream.hybrid_upfront_amount !== undefined
        ? `${formatAssetAmount(stream.hybrid_upfront_amount, stream.token_type)} upfront`
        : 'Pending'
    : stream.stream_type === 'STEP'
      ? stream.step_amount !== undefined
        ? formatAssetAmount(stream.step_amount, stream.token_type)
        : 'Pending'
      : 'Continuously vested';
  const scheduleRows = buildScheduleRows(stream);
  const scheduleChartPoints = buildStreamDetailChartPoints(stream);
  const backDestination = stream.vault_id
    ? `/vaults/${stream.vault_id}?tab=streams`
    : effectiveDaoContext
      ? '/app/dao'
      : '/streams';
  const backLabel = stream.vault_id
    ? 'Back to Treasury'
    : effectiveDaoContext
      ? 'Back to Organization Workspace'
      : 'Back to Streams';
  const feedbackToneClasses: Record<FeedbackTone, string> = {
    success: 'border-success/40 bg-success/10 text-success',
    warning: 'border-warning/40 bg-warning/10 text-warning',
    error: 'border-error/40 bg-error/10 text-error',
    info: 'border-primary/30 bg-primary/10 text-primary',
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          to={backDestination}
          className="inline-flex items-center gap-2 text-textSecondary hover:text-primary transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel}
        </Link>

        {(effectiveDaoContext || stream.vault_id) && (
          <Card className="mb-4 p-4 md:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">
                  {stream.vault_id ? 'Treasury-backed stream' : 'Organization workspace'}
                </p>
                <h2 className="font-display text-xl text-textPrimary mb-2">
                  {effectiveDaoContext?.title || 'Treasury execution context'}
                </h2>
                <p className="text-sm text-textSecondary">
                  {stream.vault_id
                    ? `This schedule is linked to vault ${stream.vault_id} and should be managed inside the treasury workflow.`
                    : effectiveDaoContext?.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {stream.vault_id && (
                  <Button variant="outline" onClick={() => navigate(`/vaults/${stream.vault_id}?tab=streams`)}>
                    Open Treasury
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => navigate(effectiveDaoContext ? '/app/dao/stream-activity' : '/streams/activity', {
                    state: effectiveDaoContext ? { daoContext: effectiveDaoContext } : undefined,
                  })}
                >
                  View Stream Activity
                </Button>
                {effectiveDaoContext && (
                  <Button variant="outline" onClick={() => navigate('/app/dao')}>
                    Return to Organization Workspace
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-textPrimary mb-1">
              {stream.stream_type === 'LINEAR' && 'Linear Vesting Stream'}
              {stream.stream_type === 'RECURRING' && (stream.refillable ? 'Open-Ended Recurring Stream' : 'Recurring Payout Stream')}
              {stream.stream_type === 'STEP' && 'Milestone Vesting Stream'}
              {stream.stream_type === 'TRANCHE' && 'Custom Tranche Stream'}
              {stream.stream_type === 'HYBRID' && 'Upfront + Linear Stream'}
            </h1>
            {templateLabel && (
              <p className="text-sm font-mono text-textSecondary mb-2">
                Template: {templateLabel}
              </p>
            )}
            <button
              onClick={() => copyToClipboard(stream.stream_id, 'stream_id')}
              className="flex items-center gap-2 group"
              title="Click to copy full ID"
            >
              <p className="text-sm font-mono text-textMuted truncate max-w-[300px] md:max-w-[500px]">
                {displayStreamId}
              </p>
              {copiedAddress === 'stream_id' ? (
                <Check className="w-3 h-3 text-green-600" />
              ) : (
                <Copy className="w-3 h-3 text-textMuted opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
            <p className="text-textSecondary text-sm mt-1">
              Created {formatDate(stream.created_at)}
            </p>
          </div>
          {getStatusBadge(stream.status)}
        </div>
      </div>

      {feedback && (
        <Card
          padding="lg"
          className={`mb-6 border ${feedbackToneClasses[feedback.tone]}`}
        >
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
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content - Left 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Progress Ring Card */}
          <Card className="p-8">
            <div className="flex flex-col md:flex-row items-center gap-8">
              {/* Circular Progress */}
              <CircularProgress
                percentage={stream.progress_percentage}
                size={240}
                strokeWidth={16}
                label="Vested"
              />

              {/* Stats */}
              <div className="flex-1 grid w-full grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-textMuted mb-1">Total Amount</p>
                  <p className="text-lg md:text-xl lg:text-2xl font-bold text-textPrimary">
                    {formatAssetAmount(stream.total_amount, stream.token_type)}
                  </p>
                  {stream.stream_type === 'RECURRING' && stream.refillable && (
                    <p className="text-xs font-mono text-textMuted mt-1">Current funded runway</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-textMuted mb-1">Vested</p>
                  <p className="text-lg md:text-xl lg:text-2xl font-bold text-primary">
                    {formatAssetAmount(stream.vested_amount, stream.token_type)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-textMuted mb-1">Withdrawn</p>
                  <p className="text-lg md:text-xl lg:text-2xl font-bold text-textSecondary">
                    {formatAssetAmount(stream.withdrawn_amount, stream.token_type)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-textMuted mb-1">Claimable Now</p>
                  <p className="text-lg md:text-xl lg:text-2xl font-bold text-green-600">
                    {formatAssetAmount(stream.claimable_amount, stream.token_type)}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:flex-wrap">
              {/* Fund Button (for PENDING streams) */}
              {stream.status === 'PENDING' && isSender && (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleFund}
                  disabled={funding}
                  className="flex-1"
                >
                  <TrendingUp className="w-5 h-5 mr-2" />
                  {funding ? 'Funding...' : 'Fund Stream'}
                </Button>
              )}

              {/* Claim Button (for ACTIVE streams) */}
              {isRecipient && stream.status === 'ACTIVE' && (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleClaim}
                  disabled={stream.claimable_amount <= 0 || claiming}
                  className="flex-1"
                >
                  <Download className="w-5 h-5 mr-2" />
                  {claiming ? 'Claiming...' : `Claim ${formatAssetAmount(stream.claimable_amount, stream.token_type)}`}
                </Button>
              )}

              {/* Cancel Button (for sender) */}
              {stream.cancelable && isSender && stream.status === 'ACTIVE' && (
                <Button
                  variant="outline"
                  onClick={handlePause}
                  disabled={pausing}
                >
                  <Clock className="w-5 h-5 mr-2" />
                  {pausing ? 'Pausing...' : 'Pause Stream'}
                </Button>
              )}

              {stream.cancelable && isSender && stream.status === 'PAUSED' && (
                <Button
                  variant="primary"
                  onClick={handleResume}
                  disabled={resuming}
                >
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  {resuming ? 'Resuming...' : 'Resume Stream'}
                </Button>
              )}

              {stream.cancelable && isSender && (stream.status === 'ACTIVE' || stream.status === 'PAUSED') && (
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  <XCircle className="w-5 h-5 mr-2" />
                  {cancelling ? 'Cancelling...' : 'Cancel Stream'}
                </Button>
              )}
            </div>
          </Card>

          {/* Timeline Card */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-textPrimary mb-4">Timeline</h3>

            <div className="space-y-4">
              {/* Start */}
              <div className="flex items-start gap-4">
                <div className="mt-1 p-2 bg-green-100 rounded-full">
                  <Calendar className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-textPrimary">Stream Started</p>
                  <p className="text-sm text-textMuted">{formatDate(stream.start_time)}</p>
                </div>
              </div>

              {/* Cliff */}
              {stream.cliff_timestamp && (
                <div className="flex items-start gap-4">
                  <div className="mt-1 p-2 bg-purple-100 rounded-full">
                    <Clock className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-textPrimary">
                      {stream.stream_type === 'HYBRID' ? 'Upfront unlock checkpoint' : 'Cliff Period Ended'}
                    </p>
                    <p className="text-sm text-textMuted">{formatDate(stream.cliff_timestamp)}</p>
                  </div>
                </div>
              )}

              {/* End */}
              {stream.end_time && (
                <div className="flex items-start gap-4">
                  <div className="mt-1 p-2 bg-blue-100 rounded-full">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-textPrimary">
                      {Date.now() / 1000 < stream.end_time ? 'Stream Ends' : 'Stream Ended'}
                    </p>
                    <p className="text-sm text-textMuted">{formatDate(stream.end_time)}</p>
                    {stream.start_time && stream.end_time && (
                      <p className="text-xs text-textMuted mt-1">
                        Duration: {formatDuration(stream.end_time - stream.start_time)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {!stream.end_time && stream.stream_type === 'RECURRING' && (
                <div className="flex items-start gap-4">
                  <div className="mt-1 p-2 bg-surfaceAlt rounded-full">
                    <Repeat className="w-4 h-4 text-textMuted" />
                  </div>
                  <div>
                    <p className="font-medium text-textPrimary">Open-ended recurring stream</p>
                    <p className="text-sm text-textMuted">Runs until cancelled or until its funded runway is exhausted.</p>
                  </div>
                </div>
              )}

              {stream.next_payment_time && (
                <div className="flex items-start gap-4">
                  <div className="mt-1 p-2 bg-accent/10 rounded-full">
                    <Clock className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <p className="font-medium text-textPrimary">Next release time</p>
                    <p className="text-sm text-textMuted">{formatDate(stream.next_payment_time)}</p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Schedule Card */}
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-textPrimary">Schedule Shape</h3>
                <p className="text-sm text-textMuted mt-1">
                  {stream.stream_type === 'LINEAR' && 'Continuous vesting across the configured duration.'}
                  {stream.stream_type === 'HYBRID' && 'A fixed share unlocks at one checkpoint, then the remaining balance vests linearly through the end of the schedule.'}
                  {stream.stream_type === 'RECURRING' && (
                    stream.refillable
                      ? 'Fixed recurring payouts unlock on cadence, and the sender can extend runway by refilling the same stream.'
                      : 'Fixed payouts become claimable on each configured release date.'
                  )}
                  {stream.stream_type === 'STEP' && 'Milestones unlock chunked balances at each schedule boundary.'}
                  {stream.stream_type === 'TRANCHE' && 'Each checkpoint unlocks a custom share of the total allocation at an immutable vesting timestamp.'}
                </p>
              </div>
              <div className="rounded-full border border-border bg-surfaceAlt px-3 py-1 text-xs font-mono text-textMuted">
                {templateLabel || stream.stream_type}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3 mb-5">
              <div className="rounded-xl border border-border bg-surfaceAlt p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-textMuted mb-2">Cadence</p>
                <p className="font-display text-lg text-textPrimary">{cadenceLabel}</p>
              </div>
              <div className="rounded-xl border border-border bg-surfaceAlt p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-textMuted mb-2">Per Unlock</p>
                <p className="font-display text-lg text-textPrimary">{trancheLabel}</p>
              </div>
              <div className="rounded-xl border border-border bg-surfaceAlt p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-textMuted mb-2">Unlock Count</p>
                <p className="font-display text-lg text-textPrimary">
                  {stream.stream_type === 'LINEAR'
                    ? 'Continuous'
                    : stream.stream_type === 'HYBRID'
                      ? '2-stage hybrid unlock'
                    : stream.stream_type === 'RECURRING' && stream.refillable
                      ? fundedRunwayLabel
                      : stream.stream_type === 'TRANCHE'
                        ? `${stream.tranche_schedule?.length || 0} custom unlocks`
                      : `${stream.schedule_count || 0} unlocks`}
                </p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <StreamScheduleChart
                shape={stream.stream_type}
                points={scheduleChartPoints}
                title={
                  stream.stream_type === 'LINEAR'
                    ? stream.cliff_timestamp && stream.cliff_timestamp > stream.start_time
                      ? 'Linear vesting with cliff release'
                      : 'Continuous vesting curve'
                    : stream.stream_type === 'HYBRID'
                      ? 'Upfront unlock + linear tail'
                    : stream.stream_type === 'RECURRING'
                      ? stream.refillable
                        ? 'Open-ended recurring runway'
                        : 'Recurring payout curve'
                      : stream.stream_type === 'STEP'
                        ? 'Milestone unlock curve'
                        : 'Custom tranche unlock curve'
                }
                subtitle={
                  stream.stream_type === 'LINEAR'
                    ? stream.cliff_timestamp && stream.cliff_timestamp > stream.start_time
                      ? 'The curve stays flat until the cliff unlocks the accrued balance, then continues vesting linearly.'
                      : 'Value accrues linearly across the full stream duration.'
                    : stream.stream_type === 'HYBRID'
                      ? 'The curve stays flat until the upfront unlock date, then the remaining balance continues vesting linearly to schedule completion.'
                    : stream.stream_type === 'RECURRING'
                      ? stream.refillable
                        ? 'The chart reflects the currently funded runway. Additional refills extend the same cadence without changing recipients or interval.'
                        : 'Each step is a fixed payout released on the configured cadence.'
                      : stream.stream_type === 'STEP'
                        ? 'Each step marks a milestone unlock rather than continuous vesting.'
                        : 'Each step can carry a different allocation size, letting BCH schedules model non-uniform unlock plans.'
                }
              />

              <div className="space-y-3">
                {scheduleRows.map((row) => (
                  <div
                    key={`${row.label}-${row.date}`}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-background px-4 py-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-medium text-textPrimary">{row.label}</p>
                      <p className="text-sm text-textMuted">{row.date}</p>
                    </div>
                    <p className="text-sm font-mono text-primary">{row.note}</p>
                  </div>
                ))}
              </div>
            </div>

            {stream.description && (
              <div className="mt-5 rounded-xl border border-border bg-surfaceAlt p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-textMuted mb-2">Description</p>
                <p className="text-sm text-textPrimary leading-6">{stream.description}</p>
              </div>
            )}

            {stream.launch_context && (
              <div className="mt-5 rounded-xl border border-border bg-surfaceAlt p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-textMuted mb-2">Organization context</p>
                    <p className="text-sm font-semibold text-textPrimary">
                      {effectiveDaoContext?.title || 'Organization stream workflow'}
                    </p>
                    <p className="text-sm text-textSecondary mt-1 leading-6">
                      {effectiveDaoContext?.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-mono text-textMuted">
                      Source • {stream.launch_context.source}
                    </span>
                    {stream.launch_context.preferredLane && (
                      <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-mono text-textMuted">
                        Lane • {stream.launch_context.preferredLane}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Activity Timeline */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-textPrimary mb-4">Activity Timeline</h3>

            {events.length === 0 ? (
              <p className="text-sm font-mono text-textMuted">No activity events recorded yet.</p>
            ) : (
              <div className="space-y-3 max-h-[18rem] overflow-y-auto pr-1">
                {events.map((event) => (
                  <div key={event.id} className="rounded-lg border border-border bg-surfaceAlt p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-textPrimary">
                          {formatStreamEventLabel(event.event_type)}
                        </p>
                        <p className="text-xs text-textMuted">
                          {formatDate(event.created_at)}
                        </p>
                        {event.actor && (
                          <p className="text-xs font-mono text-textMuted mt-1 break-all">
                            actor: {event.actor}
                          </p>
                        )}
                        {typeof event.amount === 'number' && (
                          <p className="text-xs font-mono text-textMuted mt-1">
                            amount: {formatAssetAmount(event.amount, stream.token_type)}
                          </p>
                        )}
                      </div>
                      {event.tx_hash && (
                        <a
                          href={getExplorerUrl(event.tx_hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:text-primaryHover"
                        >
                          tx
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {relatedActivity.length > 0 && (
            <Card className="p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-textPrimary">Related Organization Activity</h3>
                  <p className="text-sm text-textMuted mt-1">
                    Other treasury-backed stream events in this same organization context.
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="text-xs font-mono text-textMuted">
                    {relatedActivity.length} related event{relatedActivity.length === 1 ? '' : 's'}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => navigate(effectiveDaoContext ? '/app/dao/stream-activity' : '/streams/activity', {
                      state: effectiveDaoContext ? { daoContext: effectiveDaoContext } : undefined,
                    })}
                  >
                    Open Full Feed
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {relatedActivity.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-xl border border-border bg-surfaceAlt p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-textPrimary">
                          {formatStreamEventLabel(event.event_type)} • {formatLogicalId(event.stream.stream_id)}
                        </p>
                        <p className="text-xs text-textSecondary mt-1">
                          {getStreamScheduleTemplateLabel(event.stream.schedule_template || '') || event.stream.stream_type}
                        </p>
                        <p className="text-xs text-textMuted font-mono mt-2">
                          {formatDate(event.created_at)}
                        </p>
                        {event.stream.launch_context?.preferredLane && (
                          <p className="text-xs text-textMuted font-mono mt-1">
                            Lane • {event.stream.launch_context.preferredLane}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {event.tx_hash && (
                          <a
                            href={getExplorerUrl(event.tx_hash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs text-primary hover:text-primaryHover"
                          >
                            View tx
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Claim History */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-textPrimary mb-4">Claim History</h3>

            {claims.length === 0 ? (
              <div className="text-center py-8">
                <TrendingUp className="w-12 h-12 text-textMuted mx-auto mb-3" />
                <p className="text-textSecondary">No claims yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {claims.map((claim) => (
                  <div
                    key={claim.id}
                    className="flex flex-col gap-3 rounded-lg bg-surfaceAlt p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-textPrimary">
                        {formatAssetAmount(claim.amount, stream.token_type)}
                      </p>
                      <p className="text-sm text-textMuted">
                        {formatDate(claim.claimed_at)}
                      </p>
                    </div>
                    {claim.tx_hash && (
                      <a
                        href={getExplorerUrl(claim.tx_hash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-primary hover:text-primaryHover"
                      >
                        View TX
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar - Right 1/3 */}
        <div className="space-y-6">
          {/* Attributes */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-textPrimary mb-4">Attributes</h3>

            <div className="space-y-4">
              {/* Sender */}
              <div>
                <p className="text-xs text-textMuted mb-1">Sender</p>
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 break-all text-sm font-mono text-textPrimary sm:break-normal sm:truncate">
                    {formatAddress(stream.sender)}
                  </p>
                  <button
                    onClick={() => copyToClipboard(stream.sender, 'sender')}
                    className="p-1 hover:bg-surfaceAlt rounded transition-colors"
                  >
                    {copiedAddress === 'sender' ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-textMuted" />
                    )}
                  </button>
                </div>
              </div>

              {/* Recipient */}
              <div>
                <p className="text-xs text-textMuted mb-1">Recipient</p>
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 break-all text-sm font-mono text-textPrimary sm:break-normal sm:truncate">
                    {formatAddress(stream.recipient)}
                  </p>
                  <button
                    onClick={() => copyToClipboard(stream.recipient, 'recipient')}
                    className="p-1 hover:bg-surfaceAlt rounded transition-colors"
                  >
                    {copiedAddress === 'recipient' ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-textMuted" />
                    )}
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Type */}
              <div className="flex justify-between">
                <p className="text-xs text-textMuted">Stream Type</p>
                <p className="text-sm font-medium text-textPrimary">{stream.stream_type}</p>
              </div>

              {/* Token */}
              <div className="flex justify-between">
                <p className="text-xs text-textMuted">Token</p>
                <p className="text-sm font-medium text-textPrimary">
                  {stream.token_type === 'BCH' ? 'Bitcoin Cash' : 'CashTokens'}
                </p>
              </div>

              {stream.stream_type !== 'LINEAR' && stream.stream_type !== 'HYBRID' && stream.interval_seconds && (
                <div className="flex justify-between">
                  <p className="text-xs text-textMuted">Cadence</p>
                  <p className="text-sm font-medium text-textPrimary">{formatIntervalLabel(stream.interval_seconds)}</p>
                </div>
              )}

              {stream.stream_type === 'HYBRID' && stream.hybrid_unlock_time && (
                <div className="flex justify-between">
                  <p className="text-xs text-textMuted">Upfront Unlock</p>
                  <p className="text-sm font-medium text-textPrimary">
                    {formatDate(stream.hybrid_unlock_time)}
                  </p>
                </div>
              )}

              {stream.stream_type === 'HYBRID' && stream.hybrid_upfront_amount !== undefined && (
                <div className="flex justify-between">
                  <p className="text-xs text-textMuted">Upfront Amount</p>
                  <p className="text-sm font-medium text-textPrimary">
                    {formatAssetAmount(stream.hybrid_upfront_amount, stream.token_type)}
                  </p>
                </div>
              )}

              {stream.stream_type === 'TRANCHE' && (
                <div className="flex justify-between">
                  <p className="text-xs text-textMuted">Unlock Points</p>
                  <p className="text-sm font-medium text-textPrimary">
                    {stream.tranche_schedule?.length || 0}
                  </p>
                </div>
              )}

              {stream.stream_type === 'RECURRING' && stream.amount_per_interval !== undefined && (
                <div className="flex justify-between">
                  <p className="text-xs text-textMuted">Per Release</p>
                  <p className="text-sm font-medium text-textPrimary">
                    {formatAssetAmount(stream.amount_per_interval, stream.token_type)}
                  </p>
                </div>
              )}

              {stream.stream_type === 'RECURRING' && (
                <div className="flex justify-between">
                  <p className="text-xs text-textMuted">Refillable</p>
                  <p className="text-sm font-medium text-textPrimary">
                    {stream.refillable ? 'Yes' : 'No'}
                  </p>
                </div>
              )}

              {stream.stream_type === 'STEP' && stream.step_amount !== undefined && (
                <div className="flex justify-between">
                  <p className="text-xs text-textMuted">Per Milestone</p>
                  <p className="text-sm font-medium text-textPrimary">
                    {formatAssetAmount(stream.step_amount, stream.token_type)}
                  </p>
                </div>
              )}

              {stream.stream_type === 'TRANCHE' && stream.tranche_schedule && stream.tranche_schedule.length > 0 && (
                <div className="flex justify-between">
                  <p className="text-xs text-textMuted">Final Unlock</p>
                  <p className="text-sm font-medium text-textPrimary">
                    {formatDate(stream.tranche_schedule[stream.tranche_schedule.length - 1].unlock_time)}
                  </p>
                </div>
              )}

              {/* Cancelable */}
              <div className="flex justify-between">
                <p className="text-xs text-textMuted">Cancelable</p>
                <p className="text-sm font-medium text-textPrimary">
                  {stream.cancelable ? 'Yes' : 'No'}
                </p>
              </div>

              {/* Transferable */}
              <div className="flex justify-between">
                <p className="text-xs text-textMuted">Transferable</p>
                <p className="text-sm font-medium text-textPrimary">
                  {stream.transferable ? 'Yes' : 'No'}
                </p>
              </div>

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Vault Link */}
              {stream.vault_id ? (
                <div>
                  <p className="text-xs text-textMuted mb-2">Treasury</p>
                  <Link
                    to={`/vaults/${stream.vault_id}`}
                    className="text-sm text-primary hover:text-primaryHover flex items-center gap-1"
                  >
                    View Treasury
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-textMuted mb-2">Treasury</p>
                  <p className="text-sm text-textPrimary">Standalone stream</p>
                </div>
              )}
            </div>
          </Card>

          {stream.stream_type === 'RECURRING' && stream.refillable && isSender && (stream.status === 'ACTIVE' || stream.status === 'PAUSED') && (
            <Card className="p-6">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-textPrimary">Refill Runway</h3>
                  <p className="text-sm text-textMuted mt-1">
                    Extend this open-ended recurring stream by adding more {stream.token_type === 'BCH' ? 'BCH' : 'tokens'} to the existing state UTXO.
                  </p>
                </div>
                <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-mono text-accent">
                  Sender only
                </span>
              </div>

              <div className="space-y-4">
                <Input
                  label={`Refill amount (${stream.token_type === 'BCH' ? 'BCH' : 'tokens'})`}
                  type="number"
                  min="0"
                  step={stream.token_type === 'BCH' ? '0.00000001' : '1'}
                  value={refillAmountInput}
                  onChange={(event) => setRefillAmountInput(event.target.value)}
                  helpText="This adds more funded runway without changing cadence, recipient, or schedule state."
                />
                <Button
                  variant="primary"
                  onClick={handleRefill}
                  disabled={refilling || !refillAmountInput.trim()}
                  className="w-full"
                >
                  {refilling ? 'Refilling...' : 'Refill Stream Runway'}
                </Button>
              </div>
            </Card>
          )}

          {stream.transferable && stream.stream_type !== 'RECURRING' && (
            <Card className="p-6">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-textPrimary">Recipient Transfer</h3>
                  <p className="text-sm text-textMuted mt-1">
                    Transferable vesting lets the current recipient reassign future claims to a new BCH address.
                  </p>
                </div>
                <span className="rounded-full border border-border bg-surfaceAlt px-3 py-1 text-xs font-mono text-textMuted">
                  Vesting only
                </span>
              </div>

              {isRecipient && stream.status === 'ACTIVE' ? (
                <div className="space-y-4">
                  <Input
                    label="New Recipient Address"
                    placeholder="bchtest:..."
                    value={nextRecipientAddress}
                    onChange={(event) => setNextRecipientAddress(event.target.value)}
                    helpText="The new recipient will become the on-chain owner of future vesting claims once this transfer confirms."
                  />
                  <Button
                    variant="primary"
                    onClick={handleTransfer}
                    disabled={transferring || !nextRecipientAddress.trim()}
                    className="w-full"
                  >
                    {transferring ? 'Transferring...' : 'Transfer Recipient Rights'}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-textSecondary leading-6">
                  {stream.status !== 'ACTIVE'
                    ? 'Recipient transfer is only available while the stream is active.'
                    : 'Only the current recipient can transfer this vesting stream.'}
                </p>
              )}
            </Card>
          )}

          {/* Quick Stats */}
          <Card className="p-6 bg-gradient-to-br from-primary/5 to-white">
            <h3 className="text-sm font-semibold text-textMuted mb-4">Quick Stats</h3>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-textMuted">Progress</span>
                <span className="text-sm font-bold text-primary">
                  {stream.progress_percentage.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-textMuted">Unclaimed</span>
                <span className="text-sm font-bold text-green-600">
                  {formatAssetAmount(stream.vested_amount - stream.withdrawn_amount, stream.token_type)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-textMuted">Remaining</span>
                <span className="text-sm font-bold text-textSecondary">
                  {formatAssetAmount(stream.total_amount - stream.vested_amount, stream.token_type)}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function formatStreamEventLabel(eventType: string): string {
  switch (eventType) {
    case 'created':
      return 'Stream Created';
    case 'funded':
      return 'Stream Funded';
    case 'claim':
      return 'Stream Claimed';
    case 'paused':
      return 'Stream Paused';
    case 'resumed':
      return 'Stream Resumed';
    case 'refilled':
      return 'Runway Refilled';
    case 'transferred':
      return 'Recipient Transferred';
    case 'cancelled':
      return 'Stream Cancelled';
    default:
      return eventType
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
}
