import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Coins,
  Lock,
  Plus,
  Repeat,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { StreamScheduleChart } from '../components/streams/StreamScheduleChart';
import { useWallet } from '../hooks/useWallet';
import { useNetwork } from '../hooks/useNetwork';
import { rememberDaoLaunchContext, type DaoLaunchContext } from '../utils/daoStreamLaunch';
import {
  buildScheduleChartPoints,
  getStreamScheduleTemplateById,
  matchesStreamScheduleTemplate,
  streamScheduleTemplates,
} from '../utils/streamShapes';
import { validateTokenCategory } from '../utils/tokenValidation';

type StreamType = 'LINEAR' | 'RECURRING' | 'STEP' | 'TRANCHE' | 'HYBRID';
type TokenType = 'BCH' | 'FUNGIBLE_TOKEN';
type FormField = keyof FormData | 'scheduleInterval' | 'trancheSchedule';

interface FormData {
  recipient: string;
  tokenType: TokenType;
  tokenCategory?: string;
  amount: string;
  duration: string;
  streamType: StreamType;
  cliffDays: string;
  cancelable: boolean;
  refillable: boolean;
  description: string;
  recurringIntervalDays: string;
  stepIntervalDays: string;
  hybridUnlockDays: string;
  hybridUnlockPercent: string;
}

interface FormTranche {
  id: string;
  offsetDays: string;
  percentage: string;
}

interface VaultOption {
  id: string;
  vault_id?: string;
  vaultId?: string;
  name?: string | null;
  role?: string;
}

interface CreateStreamLocationState {
  daoContext?: DaoLaunchContext;
}

interface PreviewUnlock {
  label: string;
  dateLabel: string;
  amountLabel: string;
  note?: string;
}

const DAY_SECONDS = 24 * 60 * 60;

const recurringCadencePresets = [
  { label: 'Weekly', days: 7 },
  { label: 'Biweekly', days: 14 },
  { label: 'Monthly', days: 30 },
  { label: 'Quarterly', days: 90 },
];

const stepCadencePresets = [
  { label: 'Monthly', days: 30 },
  { label: 'Bi-Monthly', days: 60 },
  { label: 'Quarterly', days: 90 },
  { label: 'Half-Yearly', days: 180 },
];

const DEFAULT_TRANCHE_CONFIG: FormTranche[] = [
  { id: 'tranche-1', offsetDays: '90', percentage: '50' },
  { id: 'tranche-2', offsetDays: '180', percentage: '50' },
];


function toOnChainAmount(amount: number, tokenType: TokenType): number {
  if (!Number.isFinite(amount)) return 0;
  return tokenType === 'BCH'
    ? Math.max(0, Math.round(amount * 100_000_000))
    : Math.max(0, Math.round(amount));
}

function toDisplayAmount(amount: number, tokenType: TokenType): number {
  return tokenType === 'BCH' ? amount / 100_000_000 : amount;
}

function formatAssetAmount(amount: number | null, tokenType: TokenType): string {
  if (amount === null || !Number.isFinite(amount)) return 'Pending';
  const fractionDigits = tokenType === 'BCH' ? 8 : 0;
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  })} ${tokenType === 'BCH' ? 'BCH' : 'tokens'}`;
}

function formatDateFromNow(offsetSeconds: number): string {
  return new Date(Date.now() + offsetSeconds * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCadenceLabel(days: number | null, mode: StreamType): string {
  if (!days || days <= 0) return 'Configure cadence';
  if (days % 365 === 0) {
    const years = days / 365;
    return `${years} year${years === 1 ? '' : 's'} per ${mode === 'STEP' ? 'milestone' : 'release'}`;
  }
  if (days % 30 === 0) {
    const months = days / 30;
    return `${months} month${months === 1 ? '' : 's'} per ${mode === 'STEP' ? 'milestone' : 'release'}`;
  }
  if (days % 7 === 0) {
    const weeks = days / 7;
    return `${weeks} week${weeks === 1 ? '' : 's'} per ${mode === 'STEP' ? 'milestone' : 'release'}`;
  }
  return `${days} day${days === 1 ? '' : 's'} per ${mode === 'STEP' ? 'milestone' : 'release'}`;
}

function formatPercentLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) return 'Pending';
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}% upfront`;
}

function parsePipeNumberList(rawValue: string | null) {
  if (!rawValue) return [];
  return rawValue
    .split('|')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function toDisplayAmountFromOnChain(amount: number, tokenType: TokenType): number {
  return tokenType === 'BCH' ? amount / 100_000_000 : amount;
}

function buildTrancheAllocationPlan(
  totalOnChain: number,
  percentages: number[],
  tokenType: TokenType,
) {
  let runningAllocated = 0;
  return percentages.map((percentage, index) => {
    const trancheAmountOnChain = index === percentages.length - 1
      ? Math.max(0, totalOnChain - runningAllocated)
      : Math.floor((totalOnChain * percentage) / 100);
    runningAllocated += trancheAmountOnChain;
    return {
      amountOnChain: trancheAmountOnChain,
      amountDisplay: toDisplayAmountFromOnChain(trancheAmountOnChain, tokenType),
      cumulativeOnChain: runningAllocated,
      cumulativeDisplay: toDisplayAmountFromOnChain(runningAllocated, tokenType),
    };
  });
}

function buildRecurringPreview(
  startOffsetSeconds: number,
  intervalDays: number,
  releaseCount: number,
  amountPerRelease: number | null,
  tokenType: TokenType,
): PreviewUnlock[] {
  if (!intervalDays || intervalDays <= 0 || releaseCount <= 0 || amountPerRelease === null) {
    return [];
  }

  const preview: PreviewUnlock[] = [];
  const visibleCount = Math.min(releaseCount, 4);
  for (let index = 1; index <= visibleCount; index += 1) {
    preview.push({
      label: `Release ${index}`,
      dateLabel: formatDateFromNow(startOffsetSeconds + index * intervalDays * DAY_SECONDS),
      amountLabel: formatAssetAmount(amountPerRelease, tokenType),
    });
  }

  if (releaseCount > visibleCount) {
    preview.push({
      label: `Final release (${releaseCount})`,
      dateLabel: formatDateFromNow(startOffsetSeconds + releaseCount * intervalDays * DAY_SECONDS),
      amountLabel: formatAssetAmount(amountPerRelease, tokenType),
      note: `${releaseCount} total fixed recurring payouts`,
    });
  }

  return preview;
}

export default function CreateStreamPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: vaultId } = useParams();
  const [searchParams] = useSearchParams();
  const wallet = useWallet();
  const network = useNetwork();
  const launchState = location.state as CreateStreamLocationState | null;
  const daoContext = launchState?.daoContext;

  const [formData, setFormData] = useState<FormData>({
    recipient: '',
    tokenType: 'BCH',
    amount: '',
    duration: '180',
    streamType: 'LINEAR',
    cliffDays: '0',
    cancelable: true,
    refillable: false,
    description: '',
    recurringIntervalDays: '30',
    stepIntervalDays: '30',
    hybridUnlockDays: '90',
    hybridUnlockPercent: '25',
  });
  const [trancheConfig, setTrancheConfig] = useState<FormTranche[]>(DEFAULT_TRANCHE_CONFIG);
  const [vaults, setVaults] = useState<VaultOption[]>([]);
  const [loadingVaults, setLoadingVaults] = useState(false);
  const [selectedVaultId, setSelectedVaultId] = useState('');
  const [errors, setErrors] = useState<Partial<Record<FormField, string>>>({});
  const [isCreating, setIsCreating] = useState(false);

  const durationDays = Number(formData.duration || 0);
  const amountValue = Number(formData.amount || 0);
  const cliffDays = Math.max(0, Number(formData.cliffDays || 0));
  const recurringIntervalDays = Math.max(0, Number(formData.recurringIntervalDays || 0));
  const stepIntervalDays = Math.max(0, Number(formData.stepIntervalDays || 0));
  const hybridUnlockDays = Math.max(0, Number(formData.hybridUnlockDays || 0));
  const hybridUnlockPercent = Math.max(0, Number(formData.hybridUnlockPercent || 0));
  const totalOnChain = toOnChainAmount(amountValue, formData.tokenType);
  const intervalDays = formData.streamType === 'RECURRING' ? recurringIntervalDays : stepIntervalDays;
  const parsedTranches = useMemo(() => trancheConfig.map((tranche) => ({
    ...tranche,
    offsetDaysValue: Number(tranche.offsetDays || 0),
    percentageValue: Number(tranche.percentage || 0),
  })), [trancheConfig]);

  const tranchePreview = useMemo(() => {
    if (formData.streamType !== 'TRANCHE') {
      return {
        rows: [] as PreviewUnlock[],
        warning: null as string | null,
        releaseCountLabel: 'Pending',
        amountPerReleaseLabel: 'Pending',
        cadenceLabel: 'Custom unlock points',
        chartSchedule: [] as Array<{ offsetDays: number; cumulativeAmountOnChain: number }>,
      };
    }

    if (!durationDays) {
      return {
        rows: [] as PreviewUnlock[],
        warning: 'Set a schedule duration to configure tranche unlocks.',
        releaseCountLabel: 'Pending',
        amountPerReleaseLabel: 'Pending',
        cadenceLabel: 'Custom unlock points',
        chartSchedule: [] as Array<{ offsetDays: number; cumulativeAmountOnChain: number }>,
      };
    }

    if (parsedTranches.length < 1 || parsedTranches.length > 8) {
      return {
        rows: [] as PreviewUnlock[],
        warning: 'Custom tranche vesting supports between 1 and 8 unlock points.',
        releaseCountLabel: 'Pending',
        amountPerReleaseLabel: 'Pending',
        cadenceLabel: 'Custom unlock points',
        chartSchedule: [] as Array<{ offsetDays: number; cumulativeAmountOnChain: number }>,
      };
    }

    for (const tranche of parsedTranches) {
      if (!tranche.offsetDaysValue || tranche.offsetDaysValue <= 0) {
        return {
          rows: [] as PreviewUnlock[],
          warning: 'Each tranche needs an unlock offset in days.',
          releaseCountLabel: 'Pending',
          amountPerReleaseLabel: 'Pending',
          cadenceLabel: 'Custom unlock points',
          chartSchedule: [] as Array<{ offsetDays: number; cumulativeAmountOnChain: number }>,
        };
      }
      if (!tranche.percentageValue || tranche.percentageValue <= 0) {
        return {
          rows: [] as PreviewUnlock[],
          warning: 'Each tranche needs a positive unlock percentage.',
          releaseCountLabel: 'Pending',
          amountPerReleaseLabel: 'Pending',
          cadenceLabel: 'Custom unlock points',
          chartSchedule: [] as Array<{ offsetDays: number; cumulativeAmountOnChain: number }>,
        };
      }
    }

    for (let index = 1; index < parsedTranches.length; index += 1) {
      if (parsedTranches[index].offsetDaysValue <= parsedTranches[index - 1].offsetDaysValue) {
        return {
          rows: [] as PreviewUnlock[],
          warning: 'Tranche unlock offsets must be strictly increasing.',
          releaseCountLabel: 'Pending',
          amountPerReleaseLabel: 'Pending',
          cadenceLabel: 'Custom unlock points',
          chartSchedule: [] as Array<{ offsetDays: number; cumulativeAmountOnChain: number }>,
        };
      }
    }

    const totalPercentage = parsedTranches.reduce((sum, tranche) => sum + tranche.percentageValue, 0);
    if (Math.abs(totalPercentage - 100) > 0.0001) {
      return {
        rows: [] as PreviewUnlock[],
        warning: 'Tranche percentages must add up to exactly 100%.',
        releaseCountLabel: `${parsedTranches.length} unlocks`,
        amountPerReleaseLabel: 'Pending',
        cadenceLabel: 'Custom unlock points',
        chartSchedule: [] as Array<{ offsetDays: number; cumulativeAmountOnChain: number }>,
      };
    }

    const finalOffset = parsedTranches[parsedTranches.length - 1].offsetDaysValue;
    if (finalOffset !== durationDays) {
      return {
        rows: [] as PreviewUnlock[],
        warning: 'The final tranche should land on the full schedule duration.',
        releaseCountLabel: `${parsedTranches.length} unlocks`,
        amountPerReleaseLabel: 'Pending',
        cadenceLabel: 'Custom unlock points',
        chartSchedule: [] as Array<{ offsetDays: number; cumulativeAmountOnChain: number }>,
      };
    }

    const allocationPlan = buildTrancheAllocationPlan(
      Math.max(0, totalOnChain),
      parsedTranches.map((tranche) => tranche.percentageValue),
      formData.tokenType,
    );

    const rows = parsedTranches.map((tranche, index) => ({
      label: `Tranche ${index + 1}`,
      dateLabel: formatDateFromNow(tranche.offsetDaysValue * DAY_SECONDS),
      amountLabel: formatAssetAmount(allocationPlan[index].amountDisplay, formData.tokenType),
      note: `${tranche.percentageValue}% unlocked • cumulative ${formatAssetAmount(allocationPlan[index].cumulativeDisplay, formData.tokenType)}`,
    }));

    return {
      rows,
      warning: null as string | null,
      releaseCountLabel: `${parsedTranches.length} custom unlocks`,
      amountPerReleaseLabel: 'Non-uniform tranches',
      cadenceLabel: 'Custom tranche checkpoints',
      chartSchedule: parsedTranches.map((tranche, index) => ({
        offsetDays: tranche.offsetDaysValue,
        cumulativeAmountOnChain: allocationPlan[index].cumulativeOnChain,
      })),
    };
  }, [durationDays, formData.streamType, formData.tokenType, parsedTranches, totalOnChain]);

  const schedulePreview = useMemo(() => {
    const startOffsetSeconds = formData.streamType === 'RECURRING'
      ? cliffDays * DAY_SECONDS
      : 0;

    if (formData.streamType === 'LINEAR') {
      const items: PreviewUnlock[] = [];
      if (cliffDays > 0) {
        const cliffUnlock = durationDays > 0 && totalOnChain > 0
          ? toDisplayAmount(Math.floor((totalOnChain * cliffDays) / durationDays), formData.tokenType)
          : null;
        items.push({
          label: 'Cliff release',
          dateLabel: formatDateFromNow(cliffDays * DAY_SECONDS),
          amountLabel: cliffUnlock !== null
            ? formatAssetAmount(cliffUnlock, formData.tokenType)
            : 'Claims unlock',
          note: 'Accrued vesting becomes claimable the moment the cliff lifts.',
        });
      }
      items.push({
        label: 'Midpoint',
        dateLabel: formatDateFromNow(Math.floor(durationDays * DAY_SECONDS * 0.5)),
        amountLabel: `~50% vested`,
      });
      items.push({
        label: 'Full unlock',
        dateLabel: formatDateFromNow(durationDays * DAY_SECONDS),
        amountLabel: formatAssetAmount(amountValue, formData.tokenType),
      });
      return {
        cadenceLabel: cliffDays > 0
          ? 'Continuous vesting with cliff release'
          : 'Continuous unlock every second',
        releaseCountLabel: 'Continuous',
        amountPerReleaseLabel: 'Continuously vested',
        warning: null as string | null,
        rows: items,
      };
    }

    if (formData.streamType === 'HYBRID') {
      if (!durationDays || !hybridUnlockDays || hybridUnlockDays <= 0) {
        return {
          cadenceLabel: 'Configure upfront unlock timing',
          releaseCountLabel: 'Pending',
          amountPerReleaseLabel: 'Pending',
          warning: null as string | null,
          rows: [] as PreviewUnlock[],
        };
      }

      if (hybridUnlockDays >= durationDays) {
        return {
          cadenceLabel: 'Configure upfront unlock timing',
          releaseCountLabel: 'Pending',
          amountPerReleaseLabel: 'Pending',
          warning: 'The upfront unlock day must be earlier than the full schedule duration.',
          rows: [] as PreviewUnlock[],
        };
      }

      if (!hybridUnlockPercent || hybridUnlockPercent <= 0 || hybridUnlockPercent >= 100) {
        return {
          cadenceLabel: 'Configure upfront unlock split',
          releaseCountLabel: 'Pending',
          amountPerReleaseLabel: 'Pending',
          warning: 'Choose an upfront unlock percentage between 0 and 100.',
          rows: [] as PreviewUnlock[],
        };
      }

      const upfrontAmount = amountValue > 0 ? (amountValue * hybridUnlockPercent) / 100 : null;
      const linearRemainder = amountValue > 0 ? amountValue - (upfrontAmount || 0) : null;

      return {
        cadenceLabel: 'Upfront unlock followed by linear vesting',
        releaseCountLabel: '2-stage hybrid schedule',
        amountPerReleaseLabel: formatPercentLabel(hybridUnlockPercent),
        warning: null as string | null,
        rows: [
          {
            label: 'Upfront unlock',
            dateLabel: formatDateFromNow(hybridUnlockDays * DAY_SECONDS),
            amountLabel: upfrontAmount !== null
              ? formatAssetAmount(upfrontAmount, formData.tokenType)
              : formatPercentLabel(hybridUnlockPercent),
            note: `${formatPercentLabel(hybridUnlockPercent)} becomes claimable instantly at the unlock checkpoint.`,
          },
          {
            label: 'Linear remainder',
            dateLabel: `${formatDateFromNow(hybridUnlockDays * DAY_SECONDS)} → ${formatDateFromNow(durationDays * DAY_SECONDS)}`,
            amountLabel: linearRemainder !== null
              ? formatAssetAmount(linearRemainder, formData.tokenType)
              : 'Remaining balance',
            note: 'The remaining allocation vests continuously after the upfront unlock.',
          },
          {
            label: 'Full unlock',
            dateLabel: formatDateFromNow(durationDays * DAY_SECONDS),
            amountLabel: formatAssetAmount(amountValue, formData.tokenType),
          },
        ],
      };
    }

    if (formData.streamType === 'TRANCHE') {
      return tranchePreview;
    }

    if (!durationDays || !intervalDays) {
      return {
        cadenceLabel: 'Configure cadence',
        releaseCountLabel: 'Pending',
        amountPerReleaseLabel: 'Pending',
        warning: null as string | null,
        rows: [] as PreviewUnlock[],
      };
    }

    const releaseCount = Math.floor(durationDays / intervalDays);
    if (durationDays % intervalDays !== 0) {
      return {
        cadenceLabel: formatCadenceLabel(intervalDays, formData.streamType),
        releaseCountLabel: `${releaseCount} unlocks`,
        amountPerReleaseLabel: 'Uneven cadence',
        warning: 'Choose a cadence that divides the full duration evenly so the schedule has no dead tail.',
        rows: [] as PreviewUnlock[],
      };
    }
    if (releaseCount < 1) {
      return {
        cadenceLabel: formatCadenceLabel(intervalDays, formData.streamType),
        releaseCountLabel: '0 unlocks',
        amountPerReleaseLabel: 'Pending',
        warning: 'Cadence must fit inside the full schedule duration.',
        rows: [] as PreviewUnlock[],
      };
    }

    if (formData.streamType === 'RECURRING') {
      if (totalOnChain <= 0) {
        return {
          cadenceLabel: formatCadenceLabel(intervalDays, 'RECURRING'),
          releaseCountLabel: `${releaseCount} releases`,
          amountPerReleaseLabel: 'Pending',
          warning: null as string | null,
          rows: [] as PreviewUnlock[],
        };
      }

      if (totalOnChain % releaseCount !== 0) {
        return {
          cadenceLabel: formatCadenceLabel(intervalDays, 'RECURRING'),
          releaseCountLabel: `${releaseCount} releases`,
          amountPerReleaseLabel: 'Uneven total',
          warning: 'Recurring streams require the total amount to divide evenly across each release.',
          rows: [] as PreviewUnlock[],
        };
      }

      const amountPerRelease = toDisplayAmount(Math.floor(totalOnChain / releaseCount), formData.tokenType);
      return {
        cadenceLabel: formatCadenceLabel(intervalDays, 'RECURRING'),
        releaseCountLabel: formData.refillable
          ? `${releaseCount} funded releases`
          : `${releaseCount} fixed releases`,
        amountPerReleaseLabel: formatAssetAmount(amountPerRelease, formData.tokenType),
        warning: null as string | null,
        rows: buildRecurringPreview(
          startOffsetSeconds,
          intervalDays,
          releaseCount,
          amountPerRelease,
          formData.tokenType,
        ),
      };
    }

    const stepAmountOnChain = totalOnChain > 0
      ? Math.floor((totalOnChain + releaseCount - 1) / releaseCount)
      : 0;
    const stepAmount = stepAmountOnChain > 0
      ? toDisplayAmount(stepAmountOnChain, formData.tokenType)
      : null;
    const finalAmountOnChain = totalOnChain > 0
      ? totalOnChain - stepAmountOnChain * Math.max(0, releaseCount - 1)
      : 0;
    const finalAmount = finalAmountOnChain > 0
      ? toDisplayAmount(finalAmountOnChain, formData.tokenType)
      : null;
    const cliffCompletedSteps = cliffDays > 0 && intervalDays > 0
      ? Math.min(releaseCount, Math.floor(cliffDays / intervalDays))
      : 0;
    const cliffUnlockOnChain = totalOnChain > 0
      ? Math.min(cliffCompletedSteps * stepAmountOnChain, totalOnChain)
      : 0;
    const cliffUnlock = cliffUnlockOnChain > 0
      ? toDisplayAmount(cliffUnlockOnChain, formData.tokenType)
      : null;
    const rows: PreviewUnlock[] = [];

    if (cliffDays > 0 && cliffUnlock !== null) {
      rows.push({
        label: 'Cliff unlock',
        dateLabel: formatDateFromNow(cliffDays * DAY_SECONDS),
        amountLabel: formatAssetAmount(cliffUnlock, formData.tokenType),
        note: `${cliffCompletedSteps} milestone${cliffCompletedSteps === 1 ? '' : 's'} become claimable when the cliff lifts.`,
      });
    }

    const visibleMilestoneCount = Math.min(releaseCount - cliffCompletedSteps, 3);
    for (let offset = 0; offset < visibleMilestoneCount; offset += 1) {
      const milestoneIndex = cliffCompletedSteps + offset + 1;
      if (milestoneIndex > releaseCount) break;
      const isFinalMilestone = milestoneIndex === releaseCount;
      rows.push({
        label: `Milestone ${milestoneIndex}`,
        dateLabel: formatDateFromNow(milestoneIndex * intervalDays * DAY_SECONDS),
        amountLabel: formatAssetAmount(
          isFinalMilestone && finalAmount !== null ? finalAmount : (stepAmount ?? 0),
          formData.tokenType,
        ),
      });
    }

    if (releaseCount > cliffCompletedSteps + visibleMilestoneCount && finalAmount !== null) {
      rows.push({
        label: `Final milestone (${releaseCount})`,
        dateLabel: formatDateFromNow(releaseCount * intervalDays * DAY_SECONDS),
        amountLabel: formatAssetAmount(finalAmount, formData.tokenType),
        note: finalAmount !== stepAmount ? 'Final milestone includes the remaining balance.' : undefined,
      });
    }

    return {
      cadenceLabel: formatCadenceLabel(intervalDays, 'STEP'),
      releaseCountLabel: `${releaseCount} milestone unlocks`,
      amountPerReleaseLabel: stepAmount !== null
        ? `${formatAssetAmount(stepAmount, formData.tokenType)} per milestone`
        : 'Pending',
      warning: null as string | null,
      rows,
    };
  }, [
    amountValue,
    cliffDays,
    durationDays,
    formData.refillable,
    formData.streamType,
    formData.tokenType,
    hybridUnlockDays,
    hybridUnlockPercent,
    intervalDays,
    totalOnChain,
    tranchePreview,
  ]);

  const chartPoints = useMemo(() => buildScheduleChartPoints({
    streamType: formData.streamType,
    durationDays,
    cliffDays,
    intervalDays,
    totalOnChain,
    hybridUnlockDays,
    hybridUnlockPercent,
    trancheSchedule: formData.streamType === 'TRANCHE' ? tranchePreview.chartSchedule : undefined,
  }), [
    cliffDays,
    durationDays,
    formData.streamType,
    hybridUnlockDays,
    hybridUnlockPercent,
    intervalDays,
    totalOnChain,
    tranchePreview.chartSchedule,
  ]);

  const previewState = useMemo(() => {
    if (!formData.recipient || !formData.amount || amountValue <= 0) {
      return {
        state: 'draft' as const,
        title: 'Draft schedule preview',
        message: 'Add a recipient and funding amount to finalize this stream. The curve still reflects the resolved unlock shape.',
      };
    }

    if (!formData.duration || durationDays <= 0) {
      return {
        state: 'invalid' as const,
        title: 'Preview needs attention',
        message: 'Set a positive schedule duration to render a valid unlock plan.',
      };
    }

    if (schedulePreview.warning) {
      return {
        state: 'invalid' as const,
        title: 'Preview needs attention',
        message: schedulePreview.warning,
      };
    }

    return {
      state: 'ready' as const,
      title: 'Ready to deploy',
      message: 'This preview reflects the exact release shape and timing that will be embedded into the contract parameters.',
    };
  }, [amountValue, durationDays, formData.amount, formData.duration, formData.recipient, schedulePreview.warning]);

  const activeTemplateId = useMemo(
    () => streamScheduleTemplates.find((template) => matchesStreamScheduleTemplate({
      ...formData,
      hybridUnlockDays: formData.hybridUnlockDays,
      hybridUnlockPercent: formData.hybridUnlockPercent,
      trancheOffsetsDays: trancheConfig.map((tranche) => tranche.offsetDays),
      tranchePercentages: trancheConfig.map((tranche) => tranche.percentage),
    }, template))?.id ?? null,
    [
      formData.cliffDays,
      formData.duration,
      formData.refillable,
      formData.recurringIntervalDays,
      formData.stepIntervalDays,
      formData.hybridUnlockDays,
      formData.hybridUnlockPercent,
      formData.streamType,
      trancheConfig,
    ],
  );

  const recurringRunwayReleaseCount = useMemo(() => {
    if (formData.streamType !== 'RECURRING' || !durationDays || !recurringIntervalDays) return 0;
    return Math.max(0, Math.floor(durationDays / recurringIntervalDays));
  }, [durationDays, formData.streamType, recurringIntervalDays]);

  const handleChange = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (errors.scheduleInterval && (field === 'recurringIntervalDays' || field === 'stepIntervalDays')) {
      setErrors((prev) => ({ ...prev, scheduleInterval: undefined }));
    }
  };

  const updateTranche = (id: string, field: 'offsetDays' | 'percentage', value: string) => {
    setTrancheConfig((prev) => prev.map((tranche) => (
      tranche.id === id ? { ...tranche, [field]: value } : tranche
    )));
    if (errors.trancheSchedule) {
      setErrors((prev) => ({ ...prev, trancheSchedule: undefined }));
    }
  };

  const addTranche = () => {
    setTrancheConfig((prev) => {
      if (prev.length >= 8) return prev;
      const lastOffset = Number(prev[prev.length - 1]?.offsetDays || 0);
      return [
        ...prev,
        {
          id: `tranche-${Date.now()}`,
          offsetDays: String(lastOffset + 30 || 30),
          percentage: '10',
        },
      ];
    });
  };

  const removeTranche = (id: string) => {
    setTrancheConfig((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((tranche) => tranche.id !== id);
    });
  };

  const applyTemplate = (template: (typeof streamScheduleTemplates)[number]) => {
    setFormData((prev) => ({
      ...prev,
      streamType: template.streamType,
      duration: template.duration,
      cliffDays: template.cliffDays,
      refillable: Boolean(template.refillable),
      recurringIntervalDays: template.recurringIntervalDays ?? prev.recurringIntervalDays,
      stepIntervalDays: template.stepIntervalDays ?? prev.stepIntervalDays,
      hybridUnlockDays: template.hybridUnlockDays ?? prev.hybridUnlockDays,
      hybridUnlockPercent: template.hybridUnlockPercent ?? prev.hybridUnlockPercent,
    }));
    if (template.streamType === 'TRANCHE' && template.trancheOffsetsDays && template.tranchePercentages) {
      setTrancheConfig(template.trancheOffsetsDays.map((offsetDays, index) => ({
        id: `template-tranche-${template.id}-${index}`,
        offsetDays,
        percentage: template.tranchePercentages?.[index] || '0',
      })));
    }
    setErrors((prev) => ({
      ...prev,
      cliffDays: undefined,
      duration: undefined,
      scheduleInterval: undefined,
      trancheSchedule: undefined,
    }));
  };

  useEffect(() => {
    const templateId = searchParams.get('template');
    if (!templateId) return;

    const template = getStreamScheduleTemplateById(templateId);
    if (!template) return;

    setFormData((prev) => ({
      ...prev,
      streamType: template.streamType,
      duration: template.duration,
      cliffDays: template.cliffDays,
      refillable: Boolean(template.refillable),
      recurringIntervalDays: template.recurringIntervalDays ?? prev.recurringIntervalDays,
      stepIntervalDays: template.stepIntervalDays ?? prev.stepIntervalDays,
      hybridUnlockDays: template.hybridUnlockDays ?? prev.hybridUnlockDays,
      hybridUnlockPercent: template.hybridUnlockPercent ?? prev.hybridUnlockPercent,
    }));
    if (template.streamType === 'TRANCHE' && template.trancheOffsetsDays && template.tranchePercentages) {
      const queryOffsets = parsePipeNumberList(searchParams.get('trancheOffsets'));
      const queryPercentages = parsePipeNumberList(searchParams.get('tranchePercentages'));
      const canApplyCustomTranches =
        queryOffsets.length > 0
        && queryOffsets.length === queryPercentages.length;
      const offsets = canApplyCustomTranches
        ? queryOffsets.map((value) => String(value))
        : template.trancheOffsetsDays;
      const percentages = canApplyCustomTranches
        ? queryPercentages.map((value) => String(value))
        : template.tranchePercentages;
      setTrancheConfig(offsets.map((offsetDays, index) => ({
        id: `template-tranche-${template.id}-${index}`,
        offsetDays,
        percentage: percentages?.[index] || '0',
      })));
    }
    const queryDuration = searchParams.get('duration');
    if (queryDuration && Number(queryDuration) > 0) {
      setFormData((prev) => ({
        ...prev,
        duration: queryDuration,
      }));
    }
  }, [searchParams]);

  useEffect(() => {
    if (formData.streamType !== 'TRANCHE' || trancheConfig.length === 0) return;
    const firstOffset = trancheConfig[0]?.offsetDays || '0';
    const finalOffset = trancheConfig[trancheConfig.length - 1]?.offsetDays || '0';

    setFormData((prev) => (
      prev.duration === finalOffset && prev.cliffDays === firstOffset
        ? prev
        : {
            ...prev,
            duration: finalOffset,
            cliffDays: firstOffset,
          }
    ));
  }, [formData.streamType, trancheConfig]);

  useEffect(() => {
    if (!wallet.address || vaultId) return;

    const fetchVaults = async () => {
      try {
        setLoadingVaults(true);
        const response = await fetch('/api/vaults', {
          headers: {
            'x-user-address': wallet.address || '',
          },
        });
        const data = await response.json();
        const availableVaults = (data.all || []).filter((vault: VaultOption) => vault.role !== 'viewer');
        setVaults(availableVaults);

        if (daoContext) {
          const firstVaultId = availableVaults[0]?.vault_id || availableVaults[0]?.vaultId || '';
          if (firstVaultId) {
            setSelectedVaultId((currentValue) => currentValue || firstVaultId);
          }
        }
      } catch (error) {
        console.error('Failed to load vaults for shared stream creation:', error);
        setVaults([]);
      } finally {
        setLoadingVaults(false);
      }
    };

    fetchVaults();
  }, [daoContext, vaultId, wallet.address]);

  useEffect(() => {
    if (daoContext) {
      rememberDaoLaunchContext(daoContext);
    }
  }, [daoContext]);

  const validate = (): boolean => {
    const nextErrors: Partial<Record<FormField, string>> = {};
    const isValidCashAddr = (addr: string) =>
      addr.startsWith('bitcoincash:') || addr.startsWith('bchtest:');

    if (!formData.recipient) {
      nextErrors.recipient = 'Recipient address is required';
    } else if (!isValidCashAddr(formData.recipient)) {
      nextErrors.recipient = 'Must be a valid BCH address (bitcoincash:... or bchtest:...)';
    }

    if (formData.tokenType === 'FUNGIBLE_TOKEN') {
      if (!formData.tokenCategory) {
        nextErrors.tokenCategory = 'Token category ID is required for CashTokens';
      } else if (formData.tokenCategory.length !== 64) {
        nextErrors.tokenCategory = 'Token category must be 64 characters (32-byte hex)';
      } else if (!/^[0-9a-fA-F]{64}$/.test(formData.tokenCategory)) {
        nextErrors.tokenCategory = 'Token category must be valid hex';
      }
    }

    if (!formData.amount || amountValue <= 0) {
      nextErrors.amount = 'Amount must be greater than 0';
    }

    if (!formData.duration || durationDays <= 0) {
      nextErrors.duration = 'Duration must be at least 1 day';
    }

    if (formData.streamType !== 'RECURRING' && cliffDays >= durationDays && durationDays > 0) {
      nextErrors.cliffDays = 'Cliff period must be shorter than the full vesting duration';
    }

    if (formData.streamType === 'RECURRING') {
      if (!recurringIntervalDays || recurringIntervalDays <= 0) {
        nextErrors.scheduleInterval = 'Recurring streams require a cadence in days';
      } else if (recurringIntervalDays > durationDays) {
        nextErrors.scheduleInterval = 'Recurring cadence must fit within the total schedule duration';
      } else if (durationDays % recurringIntervalDays !== 0) {
        nextErrors.scheduleInterval = 'Recurring cadence must divide the schedule duration evenly';
      } else if (Math.floor(durationDays / recurringIntervalDays) < 1) {
        nextErrors.scheduleInterval = 'Recurring streams need at least one scheduled release';
      } else if (totalOnChain > 0 && totalOnChain % Math.floor(durationDays / recurringIntervalDays) !== 0) {
        nextErrors.scheduleInterval = 'Total amount must divide evenly across recurring releases';
      }
    }

    if (formData.streamType === 'STEP') {
      if (!stepIntervalDays || stepIntervalDays <= 0) {
        nextErrors.scheduleInterval = 'Step vesting requires a milestone cadence in days';
      } else if (stepIntervalDays > durationDays) {
        nextErrors.scheduleInterval = 'Milestone cadence must fit within the total vesting duration';
      } else if (durationDays % stepIntervalDays !== 0) {
        nextErrors.scheduleInterval = 'Milestone cadence must divide the schedule duration evenly';
      } else if (Math.floor(durationDays / stepIntervalDays) < 1) {
        nextErrors.scheduleInterval = 'Step vesting needs at least one milestone';
      }
    }

    if (formData.streamType === 'HYBRID') {
      if (!hybridUnlockDays || hybridUnlockDays <= 0) {
        nextErrors.hybridUnlockDays = 'Hybrid schedules require an upfront unlock day';
      } else if (hybridUnlockDays >= durationDays) {
        nextErrors.hybridUnlockDays = 'Upfront unlock day must be earlier than the full schedule duration';
      }

      if (!hybridUnlockPercent || hybridUnlockPercent <= 0 || hybridUnlockPercent >= 100) {
        nextErrors.hybridUnlockPercent = 'Upfront unlock percentage must be between 0 and 100';
      }
    }

    if (formData.streamType === 'TRANCHE') {
      if (trancheConfig.length < 1 || trancheConfig.length > 8) {
        nextErrors.trancheSchedule = 'Custom tranche vesting supports between 1 and 8 unlock points';
      } else {
        let totalPercentage = 0;
        for (let index = 0; index < trancheConfig.length; index += 1) {
          const tranche = trancheConfig[index];
          const offsetDays = Number(tranche.offsetDays || 0);
          const percentage = Number(tranche.percentage || 0);

          if (!offsetDays || offsetDays <= 0) {
            nextErrors.trancheSchedule = `Tranche ${index + 1} needs an unlock offset in days`;
            break;
          }
          if (!percentage || percentage <= 0) {
            nextErrors.trancheSchedule = `Tranche ${index + 1} needs a positive unlock percentage`;
            break;
          }
          if (index > 0 && offsetDays <= Number(trancheConfig[index - 1].offsetDays || 0)) {
            nextErrors.trancheSchedule = 'Tranche unlock offsets must be strictly increasing';
            break;
          }

          totalPercentage += percentage;
        }

        if (!nextErrors.trancheSchedule) {
          const lastOffset = Number(trancheConfig[trancheConfig.length - 1]?.offsetDays || 0);
          if (Math.abs(totalPercentage - 100) > 0.0001) {
            nextErrors.trancheSchedule = 'Tranche percentages must add up to exactly 100%';
          } else if (lastOffset !== durationDays) {
            nextErrors.trancheSchedule = 'The final tranche must land on the full schedule duration';
          }
        }
      }
    }

    if (formData.refillable && formData.streamType !== 'RECURRING') {
      nextErrors.scheduleInterval = 'Only recurring streams can use open-ended refillable runway';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;
    if (!wallet.isConnected || !wallet.address) {
      setErrors({
        recipient: 'Please connect a wallet before creating and funding a stream.',
      });
      return;
    }
    if (!wallet.signCashScriptTransaction) {
      setErrors({
        recipient: 'Connected wallet does not support CashScript transactions.',
      });
      return;
    }

    setIsCreating(true);

    if (formData.tokenType === 'FUNGIBLE_TOKEN' && formData.tokenCategory) {
      try {
        const isValid = await validateTokenCategory(formData.tokenCategory, network);
        if (!isValid) {
          setErrors({
            tokenCategory: 'Token category not found on blockchain. Please verify the token exists.',
          });
          setIsCreating(false);
          return;
        }
      } catch (validationError: any) {
        console.error('Token validation failed:', validationError);
        setErrors({
          tokenCategory: 'Failed to validate token category. Please try again.',
        });
        setIsCreating(false);
        return;
      }
    }

    try {
      const now = Math.floor(Date.now() / 1000);
      const effectiveVaultId = vaultId || selectedVaultId || undefined;
      const durationSeconds = durationDays * DAY_SECONDS;
      const cliffSeconds = cliffDays * DAY_SECONDS;
      const cadenceDays = formData.streamType === 'RECURRING' ? recurringIntervalDays : stepIntervalDays;
      const cadenceSeconds = cadenceDays > 0 ? cadenceDays * DAY_SECONDS : undefined;

      const recurringStartTime = formData.streamType === 'RECURRING' && cliffSeconds > 0
        ? now + cliffSeconds
        : now;
      const startTime = recurringStartTime;
      const endTime = formData.streamType === 'RECURRING' && formData.refillable
        ? undefined
        : startTime + durationSeconds;
      const cliffTimestamp = cliffSeconds > 0
        ? (formData.streamType === 'RECURRING' ? startTime : now + cliffSeconds)
        : undefined;
      const trancheAllocations = formData.streamType === 'TRANCHE'
        ? buildTrancheAllocationPlan(
            totalOnChain,
            trancheConfig.map((tranche) => Number(tranche.percentage || 0)),
            formData.tokenType,
          )
        : [];

      const streamPayload = {
        sender: wallet.address,
        recipient: formData.recipient,
        tokenType: formData.tokenType,
        tokenCategory: formData.tokenCategory,
        totalAmount: amountValue,
        streamType: formData.streamType,
        startTime,
        endTime,
        cliffTimestamp,
        intervalSeconds: cadenceSeconds,
        cancelable: formData.cancelable,
        refillable: formData.refillable,
        scheduleTemplate: activeTemplateId,
        description: formData.description,
        vaultId: effectiveVaultId,
        launchContext: daoContext || undefined,
        hybridUnlockTimestamp: formData.streamType === 'HYBRID'
          ? startTime + hybridUnlockDays * DAY_SECONDS
          : undefined,
        hybridUpfrontPercentage: formData.streamType === 'HYBRID'
          ? hybridUnlockPercent
          : undefined,
        trancheSchedule: formData.streamType === 'TRANCHE'
          ? trancheConfig.map((tranche, index) => ({
              unlockTime: startTime + Number(tranche.offsetDays || 0) * DAY_SECONDS,
              amount: trancheAllocations[index]?.amountDisplay ?? 0,
              percentage: Number(tranche.percentage || 0),
            }))
          : undefined,
      };

      const response = await fetch('/api/streams/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(streamPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || 'Failed to create stream');
      }

      const result = await response.json();
      const streamId = result.stream?.id;
      if (!streamId) {
        throw new Error('Stream created but no stream ID was returned.');
      }
      navigate(`/streams/${streamId}`, {
        state: { freshCreate: true, ...(daoContext ? { daoContext } : {}) },
      });
    } catch (error: any) {
      console.error('Failed to create stream:', error);
      setErrors({
        recipient: error.message || 'Failed to create stream. Please try again.',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    if (vaultId) {
      navigate(`/vaults/${vaultId}`);
      return;
    }
    if (daoContext) {
      navigate('/app/dao');
      return;
    }
    navigate('/streams');
  };

  const renderCadenceSelector = () => {
    if (formData.streamType === 'LINEAR' || formData.streamType === 'TRANCHE' || formData.streamType === 'HYBRID') return null;

    const isRecurring = formData.streamType === 'RECURRING';
    const currentValue = isRecurring ? formData.recurringIntervalDays : formData.stepIntervalDays;
    const presets = isRecurring ? recurringCadencePresets : stepCadencePresets;
    const label = isRecurring ? 'Recurring cadence' : 'Milestone cadence';
    const helpText = isRecurring
      ? 'Choose how often each fixed payout becomes claimable.'
      : 'Choose how often each milestone unlock should vest.';

    return (
      <Card padding="lg">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Repeat className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-1">
              {label}
            </h3>
            <p className="text-sm text-textMuted font-mono mb-4">
              {helpText}
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {presets.map((preset) => {
                const isActive = Number(currentValue) === preset.days;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleChange(isRecurring ? 'recurringIntervalDays' : 'stepIntervalDays', String(preset.days))}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                      isActive
                        ? 'border-accent bg-accent/10 text-textPrimary'
                        : 'border-border bg-surface hover:border-accent/50 text-textMuted'
                    }`}
                  >
                    <div className="text-sm font-display font-bold">{preset.label}</div>
                    <div className="text-xs font-mono mt-1">{preset.days} days</div>
                  </button>
                );
              })}
            </div>

            <Input
              label="Custom cadence (days)"
              type="number"
              min="1"
              value={currentValue}
              onChange={(e) => handleChange(isRecurring ? 'recurringIntervalDays' : 'stepIntervalDays', e.target.value)}
              error={errors.scheduleInterval}
              helpText={schedulePreview.warning || schedulePreview.cadenceLabel}
            />
          </div>
        </div>
      </Card>
    );
  };

  const renderHybridControls = () => {
    if (formData.streamType !== 'HYBRID') return null;

    return (
      <Card padding="lg">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-1">
              Upfront unlock settings
            </h3>
            <p className="text-sm text-textMuted font-mono mb-4">
              Release a fixed upfront share at one checkpoint, then stream the remaining balance linearly to the final vesting date.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Upfront unlock day"
                type="number"
                min="1"
                value={formData.hybridUnlockDays}
                onChange={(e) => handleChange('hybridUnlockDays', e.target.value)}
                helpText={hybridUnlockDays > 0
                  ? `First unlock lands on ${formatDateFromNow(hybridUnlockDays * DAY_SECONDS)}`
                  : 'Choose when the upfront unlock should happen.'}
              />
              <Input
                label="Upfront unlock percentage"
                type="number"
                min="1"
                max="99"
                step="0.01"
                value={formData.hybridUnlockPercent}
                onChange={(e) => handleChange('hybridUnlockPercent', e.target.value)}
                helpText="The remainder continues vesting linearly after the upfront unlock."
              />
            </div>
          </div>
        </div>
      </Card>
    );
  };

  const assetLabel = formData.tokenType === 'BCH' ? 'BCH' : 'tokens';
  const recurringStartLabel = cliffDays > 0
    ? `Recurring schedule starts on ${formatDateFromNow(cliffDays * DAY_SECONDS)}`
    : 'Recurring payouts begin after the first cadence interval';
  const amountFieldLabel =
    formData.streamType === 'RECURRING' && formData.refillable
      ? `Initial runway amount (${assetLabel})`
      : `Total amount (${assetLabel})`;
  const amountFieldHelpText =
    formData.streamType === 'RECURRING' && formData.refillable
      ? 'Funds the current recurring runway. You can refill the stream later without redeploying it.'
      : undefined;
  const durationFieldLabel =
    formData.streamType === 'RECURRING' && formData.refillable
      ? 'Initial funding runway (days)'
      : 'Schedule duration (days)';
  const durationFieldHelpText =
    formData.streamType === 'TRANCHE'
      ? 'Derived from the final tranche unlock point. Edit the tranche schedule below to change it.'
      : formData.streamType === 'RECURRING' && formData.refillable
      ? durationDays > 0
        ? `${recurringRunwayReleaseCount} funded release${recurringRunwayReleaseCount === 1 ? '' : 's'} in the current runway. Stream remains open-ended until cancelled.`
        : 'Use the initial runway to derive the fixed payout amount before later refills.'
      : durationDays > 0
        ? `Schedule completes on ${formatDateFromNow(durationDays * DAY_SECONDS)}`
        : 'Enter a schedule length';

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl md:text-5xl font-display font-bold mb-4 text-textPrimary">
                Create Stream
              </h1>
              <p className="text-textMuted font-mono max-w-3xl">
                {vaultId
                  ? 'Configure a real vesting schedule from your treasury with explicit release shape, cadence, and cliff controls.'
                  : 'Build a BCH-native release schedule with continuous vesting, recurring payouts, or milestone unlocks.'
                }
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/streams/shapes')}
              className="self-start"
            >
              Browse Shape Gallery
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {daoContext && !vaultId && (
            <Card padding="lg">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">
                    Organization launch context
                  </p>
                  <h3 className="text-xl font-display font-bold text-textPrimary mb-1">
                    {daoContext.title}
                  </h3>
                  <p className="text-sm text-textMuted font-mono">
                    {daoContext.description}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {!vaultId && (
            <Card padding="lg">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Lock className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-display font-bold text-textPrimary mb-1">
                    Funding context
                  </h3>
                  <p className="text-sm text-textMuted font-mono mb-4">
                    Leave the treasury blank to create a personal stream, or route this schedule through a vault for shared treasury execution.
                  </p>
                  <label className="block text-sm font-medium text-textPrimary mb-2">
                    Treasury vault (optional)
                  </label>
                  <select
                    value={selectedVaultId}
                    onChange={(event) => setSelectedVaultId(event.target.value)}
                    className="w-full rounded-md border border-border bg-surface px-4 py-2 text-textPrimary focus:ring-2 focus:ring-focusRing"
                  >
                    <option value="">
                      {loadingVaults ? 'Loading treasury vaults...' : 'Use personal stream funding'}
                    </option>
                    {vaults.map((vault) => (
                      <option key={vault.vault_id || vault.vaultId} value={vault.vault_id || vault.vaultId}>
                        {vault.name || vault.vault_id || vault.vaultId}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-textSecondary">
                    {selectedVaultId
                      ? 'This stream will be created inside the selected vault context and will return to the treasury view after funding.'
                      : 'This stream will remain in your personal stream workspace unless you select a treasury vault.'}
                  </p>
                </div>
              </div>
            </Card>
          )}

          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Coins className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">
                  Asset
                </h3>
                <p className="text-sm text-textMuted font-mono mb-4">
                  Choose the asset that will fund this stream.
                </p>

                <div className="grid md:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => handleChange('tokenType', 'BCH')}
                    className={`rounded-2xl border-2 p-5 text-left transition-all ${
                      formData.tokenType === 'BCH'
                        ? 'border-accent bg-accent/5 shadow-sm'
                        : 'border-border hover:border-accent/40'
                    }`}
                  >
                    <div className="font-display text-lg font-bold text-textPrimary mb-1">Bitcoin Cash</div>
                    <div className="text-sm font-mono text-textMuted">
                      Native BCH payout and vesting flows.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleChange('tokenType', 'FUNGIBLE_TOKEN')}
                    className={`rounded-2xl border-2 p-5 text-left transition-all ${
                      formData.tokenType === 'FUNGIBLE_TOKEN'
                        ? 'border-accent bg-accent/5 shadow-sm'
                        : 'border-border hover:border-accent/40'
                    }`}
                  >
                    <div className="font-display text-lg font-bold text-textPrimary mb-1">CashTokens</div>
                    <div className="text-sm font-mono text-textMuted">
                      Stream fungible token balances with the same schedule builder.
                    </div>
                  </button>
                </div>

                {formData.tokenType === 'FUNGIBLE_TOKEN' && (
                  <div className="mt-4">
                    <Input
                      label="Token category ID"
                      placeholder="a1b2c3d4..."
                      value={formData.tokenCategory || ''}
                      onChange={(e) => handleChange('tokenCategory', e.target.value)}
                      error={errors.tokenCategory}
                      helpText="Enter the 32-byte category ID for the CashToken you want to stream. The funding wallet must already control a minting NFT for this category so FlowGuard can mint the mutable stream state NFT safely."
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Recipient address"
                placeholder="bitcoincash:qr2x3uy3..."
                value={formData.recipient}
                onChange={(e) => handleChange('recipient', e.target.value)}
                error={errors.recipient}
                helpText="The BCH address that will receive the unlocks."
                required
              />
              <Input
                label={amountFieldLabel}
                type="number"
                step={formData.tokenType === 'BCH' ? '0.00000001' : '1'}
                placeholder={formData.tokenType === 'BCH' ? '10.00000000' : '1000'}
                value={formData.amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                error={errors.amount}
                helpText={amountFieldHelpText}
                required
              />
            </div>

            <div className="mt-4">
              <Input
                label={durationFieldLabel}
                type="number"
                min="1"
                placeholder="180"
                value={formData.duration}
                onChange={(e) => handleChange('duration', e.target.value)}
                error={errors.duration}
                helpText={durationFieldHelpText}
                disabled={formData.streamType === 'TRANCHE'}
                required
              />
            </div>
          </Card>

          {formData.streamType !== 'TRANCHE' && (
          <Card padding="lg">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">
                  Schedule templates
                </h3>
                <p className="text-sm text-textMuted font-mono mb-4">
                  Start from contract-backed payout patterns that already map cleanly to FlowGuard&apos;s stream primitives.
                </p>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {streamScheduleTemplates.map((template) => {
                    const isActive = activeTemplateId === template.id;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => applyTemplate(template)}
                        className={`rounded-2xl border-2 p-5 text-left transition-all ${
                          isActive
                            ? 'border-accent bg-accent/5 shadow-sm'
                            : 'border-border hover:border-accent/40'
                        }`}
                      >
                        <div className="mb-3 inline-flex rounded-full border border-border bg-background px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-textMuted">
                          {template.eyebrow}
                        </div>
                        <div className="font-display text-lg font-bold text-textPrimary mb-2">
                          {template.title}
                        </div>
                        <div className="text-sm font-mono text-textMuted leading-6 mb-4">
                          {template.description}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono text-textMuted">
                          <span>{template.duration}d schedule</span>
                          <span>{template.cliffDays === '0' ? 'No cliff' : `${template.cliffDays}d cliff`}</span>
                          {template.recurringIntervalDays && <span>{template.recurringIntervalDays}d cadence</span>}
                          {template.stepIntervalDays && <span>{template.stepIntervalDays}d milestones</span>}
                          {template.trancheOffsetsDays && <span>{template.trancheOffsetsDays.length} custom tranches</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>
          )}

          <Card padding="lg">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">
                  Release shape
                </h3>
                <p className="text-sm text-textMuted font-mono mb-4">
                  Pick the vesting behavior that best matches the payment intent.
                </p>

                <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-4">
                  {[
                    {
                      value: 'LINEAR' as const,
                      title: 'Linear vesting',
                      body: 'Continuous unlock every second across the full duration.',
                    },
                    {
                      value: 'RECURRING' as const,
                      title: 'Recurring payouts',
                      body: 'Fixed payouts on a cadence such as weekly, monthly, or quarterly.',
                    },
                    {
                      value: 'STEP' as const,
                      title: 'Milestone vesting',
                      body: 'Chunked unlocks at explicit milestone boundaries.',
                    },
                    {
                      value: 'HYBRID' as const,
                      title: 'Upfront + linear',
                      body: 'Release a fixed upfront share at one checkpoint, then vest the remainder continuously.',
                    },
                    {
                      value: 'TRANCHE' as const,
                      title: 'Custom tranches',
                      body: 'Non-uniform unlock checkpoints with manually chosen timing and allocation splits.',
                    },
                  ].map((shape) => {
                    const isActive = formData.streamType === shape.value;
                    return (
                      <button
                        key={shape.value}
                        type="button"
                        onClick={() => {
                          handleChange('streamType', shape.value);
                          if (shape.value !== 'RECURRING' && formData.refillable) {
                            handleChange('refillable', false);
                          }
                        }}
                        className={`rounded-2xl border-2 p-5 text-left transition-all ${
                          isActive
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <div className="font-display text-lg font-bold text-textPrimary mb-2">
                          {shape.title}
                        </div>
                        <div className="text-sm font-mono text-textMuted leading-6">
                          {shape.body}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          {renderCadenceSelector()}
          {renderHybridControls()}

          {formData.streamType === 'TRANCHE' && (
            <Card padding="lg">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-display font-bold text-textPrimary mb-1">
                        Custom tranche editor
                      </h3>
                      <p className="text-sm text-textMuted font-mono">
                        Configure up to eight non-uniform unlock checkpoints. The final tranche should align with the full schedule duration.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addTranche}
                      disabled={trancheConfig.length >= 8}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Tranche
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {trancheConfig.map((tranche, index) => (
                      <div
                        key={tranche.id}
                        className="rounded-2xl border border-border/60 bg-surface p-4"
                      >
                        <div className="mb-4 flex items-center justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-textMuted mb-1">
                              Tranche {index + 1}
                            </p>
                            <p className="font-display text-lg text-textPrimary">
                              Unlock checkpoint
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeTranche(tranche.id)}
                            disabled={trancheConfig.length <= 1}
                            className="rounded-xl border border-border bg-background p-2 text-textMuted transition-colors hover:border-error/40 hover:text-error disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <Input
                            label="Unlock offset (days)"
                            type="number"
                            min="1"
                            value={tranche.offsetDays}
                            onChange={(e) => updateTranche(tranche.id, 'offsetDays', e.target.value)}
                            helpText="Days after stream start when this tranche becomes claimable."
                          />
                          <Input
                            label="Unlock percentage"
                            type="number"
                            min="1"
                            max="100"
                            value={tranche.percentage}
                            onChange={(e) => updateTranche(tranche.id, 'percentage', e.target.value)}
                            helpText="Portion of the total amount released at this checkpoint."
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {errors.trancheSchedule && (
                    <div className="mt-4 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-mono text-error">
                      {errors.trancheSchedule}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {formData.streamType === 'RECURRING' && (
            <Card padding="lg">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <Repeat className="w-6 h-6 text-accent" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2 gap-4">
                    <div>
                      <h3 className="text-xl font-display font-bold text-textPrimary">
                        Open-ended recurring runway
                      </h3>
                      <p className="text-sm text-textMuted font-mono mt-1">
                        Keep this recurring stream open-ended and top it up later without redeploying the contract.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleChange('refillable', !formData.refillable)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        formData.refillable ? 'bg-accent' : 'bg-border'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          formData.refillable ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-surface px-4 py-3 text-sm font-mono text-textMuted">
                    {formData.refillable
                      ? 'Initial amount funds the current runway only. The contract stays open-ended until cancelled, and future refills extend the runway without changing cadence or recipient.'
                      : 'When disabled, the recurring stream is finite and completes after the configured number of releases.'}
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Card padding="lg">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-6 h-6 text-secondary" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">
                  {formData.streamType === 'RECURRING' ? 'Start delay (optional)' : 'Cliff period (optional)'}
                </h3>
                <p className="text-sm text-textMuted font-mono mb-4">
                  {formData.streamType === 'RECURRING'
                    ? 'Delay the start of recurring releases before the cadence begins.'
                    : 'Block claims until the cliff expires, then let the selected schedule unlock.'}
                </p>

                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={formData.cliffDays}
                  onChange={(e) => handleChange('cliffDays', e.target.value)}
                  error={errors.cliffDays}
                  helpText={formData.streamType === 'RECURRING'
                    ? recurringStartLabel
                    : cliffDays > 0
                      ? `Claims begin on ${formatDateFromNow(cliffDays * DAY_SECONDS)}`
                      : 'No cliff. Unlocks begin immediately when the schedule starts.'}
                />
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center flex-shrink-0">
                <Lock className="w-6 h-6 text-error" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-display font-bold text-textPrimary">
                    Cancelability
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleChange('cancelable', !formData.cancelable)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.cancelable ? 'bg-accent' : 'bg-border'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.cancelable ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-sm text-textMuted font-mono">
                  {formData.cancelable
                    ? 'Sender can unwind the stream and recover only the unvested balance.'
                    : 'This stream becomes a permanent on-chain commitment once funded.'}
                </p>
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <Textarea
              label="Description (optional)"
              placeholder="e.g. Q2 contributor stream, advisor vesting, or grants schedule"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
              helpText="Visible context for your own records and treasury operations."
            />
          </Card>

          <Card padding="lg" className="border-accent/30 bg-accent/5">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h4 className="font-display font-bold text-textPrimary mb-3">
                  Schedule review
                </h4>

                <div className="grid gap-4 md:grid-cols-3 mb-4">
                  <div className="rounded-xl border border-border/60 bg-surface p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-textMuted mb-2">Shape</p>
                    <p className="font-display text-lg text-textPrimary">
                      {formData.streamType === 'LINEAR' && 'Linear vesting'}
                      {formData.streamType === 'RECURRING' && 'Recurring payout'}
                      {formData.streamType === 'STEP' && 'Step vesting'}
                      {formData.streamType === 'HYBRID' && 'Upfront + linear vesting'}
                      {formData.streamType === 'TRANCHE' && 'Custom tranche vesting'}
                    </p>
                    <p className="text-sm font-mono text-textMuted mt-2">
                      {schedulePreview.cadenceLabel}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-surface p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-textMuted mb-2">Unlock count</p>
                    <p className="font-display text-lg text-textPrimary">{schedulePreview.releaseCountLabel}</p>
                    <p className="text-sm font-mono text-textMuted mt-2">
                      {formData.streamType === 'RECURRING' && formData.refillable
                        ? `Open-ended stream with ${durationDays || 0} day${durationDays === 1 ? '' : 's'} of funded runway today`
                        : formData.streamType === 'TRANCHE'
                          ? `Duration: ${durationDays || 0} day${durationDays === 1 ? '' : 's'}`
                        : `Duration: ${durationDays || 0} day${durationDays === 1 ? '' : 's'}`}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-surface p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-textMuted mb-2">Per release</p>
                    <p className="font-display text-lg text-textPrimary">{schedulePreview.amountPerReleaseLabel}</p>
                    <p className="text-sm font-mono text-textMuted mt-2">
                      {formData.cancelable ? 'Cancelable' : 'Permanent commitment'}
                    </p>
                  </div>
                </div>

                <div
                  className={`mb-4 rounded-xl border p-4 ${
                    previewState.state === 'invalid'
                      ? 'border-error/30 bg-error/10'
                      : previewState.state === 'draft'
                        ? 'border-border bg-surface'
                        : 'border-accent/20 bg-surface'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {previewState.state === 'invalid' ? (
                      <AlertCircle className="mt-0.5 h-5 w-5 text-error shrink-0" />
                    ) : previewState.state === 'draft' ? (
                      <Sparkles className="mt-0.5 h-5 w-5 text-accent shrink-0" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-accent shrink-0" />
                    )}
                    <div>
                      <p className="font-display text-base text-textPrimary">{previewState.title}</p>
                      <p className="mt-1 text-sm font-mono text-textMuted">{previewState.message}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                  <StreamScheduleChart
                    shape={formData.streamType}
                    points={chartPoints}
                    title={
                      formData.streamType === 'LINEAR'
                        ? cliffDays > 0
                          ? 'Linear vesting with cliff release'
                          : 'Continuous vesting curve'
                        : formData.streamType === 'RECURRING'
                          ? formData.refillable
                            ? 'Open-ended recurring runway'
                            : 'Recurring payout curve'
                          : formData.streamType === 'STEP'
                            ? 'Milestone unlock curve'
                            : formData.streamType === 'HYBRID'
                              ? 'Upfront unlock + linear remainder'
                              : 'Custom tranche unlock curve'
                    }
                    subtitle={
                      formData.streamType === 'LINEAR'
                        ? cliffDays > 0
                          ? 'Claims stay locked until the cliff lifts, then the accrued balance becomes available immediately.'
                          : 'Value accrues continuously from start to finish.'
                        : formData.streamType === 'RECURRING'
                          ? formData.refillable
                            ? 'The current runway funds fixed releases on the chosen cadence. Later refills extend the same stream without redeploying it.'
                            : 'Each step is a fixed payout that unlocks on the configured cadence.'
                          : formData.streamType === 'STEP'
                            ? 'Each step represents a discrete milestone unlock rather than a continuous stream.'
                            : formData.streamType === 'HYBRID'
                              ? 'A fixed upfront share unlocks once, then the remaining balance vests continuously until the final date.'
                              : 'Each checkpoint can unlock a different share of the total allocation at a different point in time.'
                    }
                  />

                  <div className="rounded-2xl border border-border/60 bg-surface p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Clock className="w-4 h-4 text-textMuted" />
                      <p className="text-sm font-display font-bold text-textPrimary">
                        Unlock preview
                      </p>
                    </div>

                    <div className="space-y-3">
                      {schedulePreview.rows.map((row) => (
                        <div
                          key={`${row.label}-${row.dateLabel}`}
                          className="flex flex-col gap-2 rounded-xl border border-border/50 bg-background px-4 py-3 md:flex-row md:items-center md:justify-between"
                        >
                          <div>
                            <p className="font-sans font-medium text-textPrimary">{row.label}</p>
                            <p className="text-sm font-mono text-textMuted">{row.dateLabel}</p>
                          </div>
                          <div className="text-left md:text-right">
                            <p className="font-display font-bold text-primary">{row.amountLabel}</p>
                            {row.note && (
                              <p className="text-xs font-mono text-textMuted mt-1">{row.note}</p>
                            )}
                          </div>
                        </div>
                      ))}

                      {schedulePreview.rows.length === 0 && (
                        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm font-mono text-textMuted">
                          Fill in the amount, duration, and cadence to generate the unlock preview.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-start gap-2 text-sm font-mono text-textMuted">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-accent" />
                  <p>
                    {formatAssetAmount(amountValue || 0, formData.tokenType)} will stream to{' '}
                    <span className="text-textPrimary">{formData.recipient || '[recipient]'}</span>.
                    {' '}The backend will preserve this exact shape, cadence, cliff behavior, and
                    {formData.streamType === 'RECURRING' && formData.refillable
                      ? ' open-ended refillability'
                      : formData.streamType === 'HYBRID'
                        ? ' upfront unlock split'
                      : formData.streamType === 'TRANCHE'
                        ? ' custom tranche schedule'
                      : ' finite schedule'}
                    {' '}in the on-chain contract parameters.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <div className="flex flex-col-reverse gap-4 pt-4 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCancel}
              disabled={isCreating}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isCreating}
              loading={isCreating}
              className="flex-1"
            >
              {isCreating ? 'Creating Stream...' : 'Create Stream'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
