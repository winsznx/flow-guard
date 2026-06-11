import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import Papa from 'papaparse';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Wallet2,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { StreamScheduleChart } from '../components/streams/StreamScheduleChart';
import { useWallet } from '../hooks/useWallet';
import { useWalletModal } from '../hooks/useWalletModal';
import { useNetwork } from '../hooks/useNetwork';
import { rememberDaoLaunchContext, type DaoLaunchContext } from '../utils/daoStreamLaunch';
import {
  buildScheduleChartPoints,
  getStreamScheduleTemplateById,
  streamScheduleTemplates,
  type StreamScheduleTemplate,
} from '../utils/streamShapes';
import { fundBatchStreamContracts, getExplorerTxUrl } from '../utils/blockchain';
import { validateTokenCategory } from '../utils/tokenValidation';

type RowField =
  | 'recipient'
  | 'amount'
  | 'description'
  | 'scheduleTemplateId'
  | 'startDate'
  | 'durationDays'
  | 'cliffDays'
  | 'intervalDays'
  | 'hybridUnlockDays'
  | 'hybridUnlockPercent'
  | 'trancheOffsetsDays'
  | 'tranchePercentages';

interface BatchRow {
  id: string;
  recipient: string;
  amount: string;
  description: string;
  scheduleTemplateId: string;
  startDate: string;
  durationDays: string;
  cliffDays: string;
  intervalDays: string;
  hybridUnlockDays: string;
  hybridUnlockPercent: string;
  trancheOffsetsDays: string;
  tranchePercentages: string;
}

interface VaultOption {
  id: string;
  vault_id?: string;
  vaultId?: string;
  name?: string | null;
  role?: string;
  balance?: number;
}

interface LocationState {
  importedData?: Array<Record<string, string | number>>;
  preferredTemplateId?: string;
  daoContext?: DaoLaunchContext;
}

const CSV_COLUMNS = [
  'recipient',
  'amount',
  'description',
  'scheduleTemplate',
  'startDate',
  'durationDays',
  'intervalDays',
  'cliffDays',
  'hybridUnlockDays',
  'hybridUnlockPercent',
  'trancheOffsetsDays',
  'tranchePercentages',
] as const;

const DAY_SECONDS = 24 * 60 * 60;

const DEFAULT_ROWS: BatchRow[] = [
  {
    id: 'row-1',
    recipient: '',
    amount: '',
    description: '',
    scheduleTemplateId: '',
    startDate: '',
    durationDays: '',
    cliffDays: '',
    intervalDays: '',
    hybridUnlockDays: '',
    hybridUnlockPercent: '',
    trancheOffsetsDays: '',
    tranchePercentages: '',
  },
  {
    id: 'row-2',
    recipient: '',
    amount: '',
    description: '',
    scheduleTemplateId: '',
    startDate: '',
    durationDays: '',
    cliffDays: '',
    intervalDays: '',
    hybridUnlockDays: '',
    hybridUnlockPercent: '',
    trancheOffsetsDays: '',
    tranchePercentages: '',
  },
];

const CSV_TEMPLATE = `recipient,amount,description,scheduleTemplate,startDate,durationDays,intervalDays,cliffDays,hybridUnlockDays,hybridUnlockPercent,trancheOffsetsDays,tranchePercentages
bchtest:qpk8l9exampleaddress0000000000000000000,1.25000000,Core contributor payroll,recurring-open-monthly,2026-03-10,180,30,,,,,
bchtest:qru7x2exampleaddress0000000000000000000,0.85000000,Ops retainer,,,,,,,,,
bchtest:qz6n44exampleaddress0000000000000000000,2.50000000,Grant vesting lane,linear-cliff,2026-03-17,365,,30,,,,
bchtest:qz9hybridexampleaddress000000000000000000,4.20000000,Hybrid unlock grant,hybrid-upfront-linear,2026-04-01,360,,,90,25,,
bchtest:qpm8ulcustomtranche000000000000000000000,5.00000000,Custom grant runway,tranche-backweighted,2026-04-01,300,,,,,30|120|210|300,20|20|25|35`;

function formatAssetAmount(amount: number, tokenType: 'BCH' | 'FUNGIBLE_TOKEN'): string {
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: tokenType === 'BCH' ? 8 : 0,
  })} ${tokenType === 'BCH' ? 'BCH' : 'tokens'}`;
}

function parseImportedRows(importedData?: Array<Record<string, string | number>>): BatchRow[] {
  if (!importedData?.length) return DEFAULT_ROWS;

  const parsed = importedData
    .map((row, index) => {
      const recipient = String(row.recipient || row.address || '').trim();
      const amount = String(row.amount || row.totalAmount || '').trim();
      const description = String(row.description || row.label || row.note || '').trim();
      const scheduleTemplateId = String(row.scheduleTemplate || row.schedule_template || '').trim();
      const startDate = String(row.startDate || row.start_date || '').trim();
      const durationDays = String(row.durationDays || row.duration_days || '').trim();
      const cliffDays = String(row.cliffDays || row.cliff_days || '').trim();
      const intervalDays = String(row.intervalDays || row.interval_days || '').trim();
      const hybridUnlockDays = String(
        row.hybridUnlockDays || row.hybrid_unlock_days || row.unlockDay || row.unlock_day || '',
      ).trim();
      const hybridUnlockPercent = String(
        row.hybridUnlockPercent || row.hybrid_unlock_percent || row.unlockPercent || row.unlock_percent || '',
      ).trim();
      const trancheOffsetsDays = String(
        row.trancheOffsetsDays || row.tranche_offsets_days || row.trancheOffsets || row.tranche_offsets || '',
      ).trim();
      const tranchePercentages = String(
        row.tranchePercentages || row.tranche_percentages || row.trancheWeights || row.tranche_weights || '',
      ).trim();
      if (
        !recipient
        && !amount
        && !description
        && !scheduleTemplateId
        && !startDate
        && !durationDays
        && !cliffDays
        && !intervalDays
        && !hybridUnlockDays
        && !hybridUnlockPercent
        && !trancheOffsetsDays
        && !tranchePercentages
      ) return null;
      return {
        id: `imported-${index + 1}`,
        recipient,
        amount,
        description,
        scheduleTemplateId,
        startDate,
        durationDays,
        cliffDays,
        intervalDays,
        hybridUnlockDays,
        hybridUnlockPercent,
        trancheOffsetsDays,
        tranchePercentages,
      };
    })
    .filter(Boolean) as BatchRow[];

  return parsed.length ? parsed : DEFAULT_ROWS;
}

function buildTrancheSchedule(
  totalAmount: number,
  startTime: number,
  template: StreamScheduleTemplate,
  durationDaysOverride?: number,
  tokenType: 'BCH' | 'FUNGIBLE_TOKEN' = 'BCH',
  customGeometry?: {
    offsetsDays?: number[];
    percentages?: number[];
  },
): Array<{ unlockTime: number; amount: number; percentage: number }> {
  const templateDurationDays = Math.max(1, Number(template.duration || '1'));
  const resolvedDurationDays = Math.max(1, durationDaysOverride || templateDurationDays);
  const offsets = (customGeometry?.offsetsDays || template.trancheOffsetsDays || []).map((value) => Number(value));
  const percentages = (customGeometry?.percentages || template.tranchePercentages || []).map((value) => Number(value));
  const usesCustomGeometry = Boolean(customGeometry?.offsetsDays?.length && customGeometry?.percentages?.length);
  const scaledOffsets = offsets.map((offsetDays, index) => {
    if (index === offsets.length - 1) return resolvedDurationDays;
    if (usesCustomGeometry) return Math.max(1, Math.round(offsetDays));
    const scaled = Math.max(1, Math.round((offsetDays / templateDurationDays) * resolvedDurationDays));
    return scaled;
  });
  const totalOnChain = toOnChainChartAmount(totalAmount, tokenType);
  let allocatedOnChain = 0;

  return scaledOffsets.map((offsetDays, index) => {
    const previousOffset = index > 0 ? scaledOffsets[index - 1] : 0;
    const remainingUnlocks = scaledOffsets.length - index - 1;
    const latestAllowedOffset = Math.max(previousOffset + 1, resolvedDurationDays - remainingUnlocks);
    const safeOffset = index === scaledOffsets.length - 1
      ? resolvedDurationDays
      : Math.min(
          Math.max(previousOffset + 1, offsetDays),
          latestAllowedOffset,
        );
    const percentage = percentages[index] || 0;
    const trancheOnChain =
      index === scaledOffsets.length - 1
        ? Math.max(0, totalOnChain - allocatedOnChain)
        : Math.floor((totalOnChain * percentage) / 100);
    allocatedOnChain += trancheOnChain;
    return {
      unlockTime: startTime + safeOffset * DAY_SECONDS,
      amount: tokenType === 'BCH' ? trancheOnChain / 100_000_000 : trancheOnChain,
      percentage,
    };
  });
}

interface ResolvedBatchRow {
  template: StreamScheduleTemplate;
  startDate: string;
  startTimestamp: number;
  durationDays: number;
  cliffDays: number;
  intervalDays: number;
  hybridUnlockDays: number;
  hybridUnlockPercent: number;
  refillable: boolean;
  usesTemplateOverride: boolean;
  hasTrancheOverride: boolean;
  trancheOffsetsDays?: number[];
  tranchePercentages?: number[];
  trancheGeometryError?: string;
  trancheSchedule?: Array<{ unlockTime: number; amount: number; percentage: number }>;
}

interface BatchRowPreview {
  resolved: ResolvedBatchRow;
  chartPoints: Array<{ x: number; y: number }>;
  chartTitle: string;
  chartSubtitle: string;
  summaryBadges: string[];
  releaseCountLabel: string;
  amountModelLabel: string;
  state: 'ready' | 'draft' | 'invalid';
  stateTitle?: string;
  stateMessage?: string;
}

function toOnChainChartAmount(amount: number, tokenType: 'BCH' | 'FUNGIBLE_TOKEN') {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return tokenType === 'BCH' ? Math.round(amount * 100_000_000) : Math.round(amount);
}

function parsePipeList(rawValue: string) {
  return rawValue
    .split('|')
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseNumberList(rawValue: string) {
  const values = parsePipeList(rawValue);
  if (!values.length) return [];

  return values.map((value) => Number(value));
}

function resolveTrancheGeometry(
  row: BatchRow,
  template: StreamScheduleTemplate,
  resolvedDurationDays: number,
) {
  const templateOffsets = (template.trancheOffsetsDays || []).map((value) => Number(value));
  const templatePercentages = (template.tranchePercentages || []).map((value) => Number(value));
  const rawOffsets = row.trancheOffsetsDays.trim();
  const rawPercentages = row.tranchePercentages.trim();
  const hasOverride = Boolean(rawOffsets || rawPercentages);

  if (!hasOverride) {
    return {
      offsetsDays: templateOffsets,
      percentages: templatePercentages,
      hasOverride: false,
      error: null as string | null,
    };
  }

  if (!rawOffsets || !rawPercentages) {
    return {
      offsetsDays: templateOffsets,
      percentages: templatePercentages,
      hasOverride: true,
      error: 'Provide both tranche offsets and tranche percentages to override the template geometry.',
    };
  }

  const offsetsDays = parseNumberList(rawOffsets);
  const percentages = parseNumberList(rawPercentages);

  if (!offsetsDays.length || !percentages.length) {
    return {
      offsetsDays: templateOffsets,
      percentages: templatePercentages,
      hasOverride: true,
      error: 'Add at least one tranche checkpoint and weight.',
    };
  }

  if (offsetsDays.length > 8) {
    return {
      offsetsDays: templateOffsets,
      percentages: templatePercentages,
      hasOverride: true,
      error: 'Tranche geometry supports at most 8 checkpoints per row.',
    };
  }

  if (offsetsDays.length !== percentages.length) {
    return {
      offsetsDays: templateOffsets,
      percentages: templatePercentages,
      hasOverride: true,
      error: 'Tranche offsets and percentages must have the same number of entries.',
    };
  }

  if (offsetsDays.some((value) => !Number.isFinite(value) || value <= 0)) {
    return {
      offsetsDays: templateOffsets,
      percentages: templatePercentages,
      hasOverride: true,
      error: 'Tranche offsets must be positive day values separated by "|".',
    };
  }

  if (percentages.some((value) => !Number.isFinite(value) || value <= 0)) {
    return {
      offsetsDays: templateOffsets,
      percentages: templatePercentages,
      hasOverride: true,
      error: 'Tranche percentages must be positive numbers separated by "|".',
    };
  }

  if (offsetsDays.some((value, index) => index > 0 && value <= offsetsDays[index - 1])) {
    return {
      offsetsDays: templateOffsets,
      percentages: templatePercentages,
      hasOverride: true,
      error: 'Tranche offsets must be strictly increasing.',
    };
  }

  if (offsetsDays[offsetsDays.length - 1] > resolvedDurationDays) {
    return {
      offsetsDays: templateOffsets,
      percentages: templatePercentages,
      hasOverride: true,
      error: 'The final tranche offset must fit inside the resolved schedule duration.',
    };
  }

  const totalPercentage = percentages.reduce((sum, value) => sum + value, 0);
  if (Math.abs(totalPercentage - 100) > 0.001) {
    return {
      offsetsDays: templateOffsets,
      percentages: templatePercentages,
      hasOverride: true,
      error: 'Tranche percentages must sum to 100.',
    };
  }

  return {
    offsetsDays,
    percentages,
    hasOverride: true,
    error: null as string | null,
  };
}

export default function BatchCreateStreamsPage() {
  const { id: vaultIdFromRoute } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const launchState = location.state as LocationState | null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wallet = useWallet();
  const { openModal } = useWalletModal();
  const network = useNetwork();
  const daoContext = launchState?.daoContext || null;
  const preferredTemplateId = launchState?.preferredTemplateId || '';

  const importedRows = useMemo(
    () => parseImportedRows(launchState?.importedData),
    [launchState],
  );

  const [rows, setRows] = useState<BatchRow[]>(importedRows);
  const [vaults, setVaults] = useState<VaultOption[]>([]);
  const [loadingVaults, setLoadingVaults] = useState(false);
  const [selectedVaultId, setSelectedVaultId] = useState('');
  const [tokenType, setTokenType] = useState<'BCH' | 'FUNGIBLE_TOKEN'>('BCH');
  const [tokenCategory, setTokenCategory] = useState('');
  const [templateId, setTemplateId] = useState(
    getStreamScheduleTemplateById(preferredTemplateId)?.id || 'recurring-open-monthly',
  );
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  });
  const [durationDays, setDurationDays] = useState('180');
  const [intervalDays, setIntervalDays] = useState('30');
  const [cliffDays, setCliffDays] = useState('0');
  const [hybridUnlockDays, setHybridUnlockDays] = useState('90');
  const [hybridUnlockPercent, setHybridUnlockPercent] = useState('25');
  const [cancelable, setCancelable] = useState(true);
  const [refillable, setRefillable] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [batchError, setBatchError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedTx, setCompletedTx] = useState<string | null>(null);
  const [completedCount, setCompletedCount] = useState(0);

  const selectedTemplate = useMemo(
    () => getStreamScheduleTemplateById(templateId) || streamScheduleTemplates[0],
    [templateId],
  );

  useEffect(() => {
    setRows(importedRows);
  }, [importedRows]);

  useEffect(() => {
    if (daoContext) {
      rememberDaoLaunchContext(daoContext);
    }
  }, [daoContext]);

  useEffect(() => {
    if (!preferredTemplateId) return;
    const template = getStreamScheduleTemplateById(preferredTemplateId);
    if (template) {
      setTemplateId(template.id);
    }
  }, [preferredTemplateId]);

  useEffect(() => {
    if (!selectedTemplate) return;
    setDurationDays(selectedTemplate.duration);
    setCliffDays(selectedTemplate.cliffDays);
    if (selectedTemplate.streamType === 'RECURRING') {
      setIntervalDays(selectedTemplate.recurringIntervalDays || '30');
      setRefillable(Boolean(selectedTemplate.refillable));
    } else if (selectedTemplate.streamType === 'STEP') {
      setIntervalDays(selectedTemplate.stepIntervalDays || selectedTemplate.duration);
      setRefillable(false);
    } else if (selectedTemplate.streamType === 'HYBRID') {
      setIntervalDays('30');
      setHybridUnlockDays(selectedTemplate.hybridUnlockDays || '90');
      setHybridUnlockPercent(selectedTemplate.hybridUnlockPercent || '25');
      setRefillable(false);
    } else {
      setIntervalDays(selectedTemplate.recurringIntervalDays || selectedTemplate.stepIntervalDays || '30');
      setRefillable(false);
    }
  }, [selectedTemplate]);

  useEffect(() => {
    if (!wallet.address || !vaultIdFromRoute) return;

    const fetchVaultContext = async () => {
      try {
        const response = await fetch(`/api/vaults/${vaultIdFromRoute}`, {
          headers: {
            'x-user-address': wallet.address || '',
          },
        });
        const data = await response.json();
        const resolvedVaultId = data.vaultId || data.vault_id || vaultIdFromRoute;
        setSelectedVaultId(resolvedVaultId);
      } catch (error) {
        console.error('Failed to resolve vault context for batch stream creation:', error);
        setSelectedVaultId(vaultIdFromRoute);
      }
    };

    fetchVaultContext();
  }, [wallet.address, vaultIdFromRoute]);

  useEffect(() => {
    if (!wallet.address || vaultIdFromRoute) return;

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
        const firstVaultId = availableVaults[0]?.vault_id || availableVaults[0]?.vaultId;
        if (!selectedVaultId && firstVaultId) {
          setSelectedVaultId(firstVaultId);
        }
      } catch (error) {
        console.error('Failed to load vaults for batch stream creation:', error);
        setVaults([]);
      } finally {
        setLoadingVaults(false);
      }
    };

    fetchVaults();
  }, [wallet.address, vaultIdFromRoute, selectedVaultId]);

  const startTimestamp = useMemo(() => Math.floor(new Date(`${startDate}T00:00:00`).getTime() / 1000), [startDate]);
  const durationDaysValue = Number(durationDays || 0);
  const cliffDaysValue = Number(cliffDays || 0);
  const intervalDaysValue = Number(intervalDays || 0);

  const chartPoints = useMemo(() => {
    const representativeTotal = toOnChainChartAmount(1, tokenType);
    const trancheSchedule = selectedTemplate.streamType === 'TRANCHE'
      ? buildTrancheSchedule(1, startTimestamp, selectedTemplate, undefined, tokenType).map((tranche) => ({
          offsetDays: Math.round((tranche.unlockTime - startTimestamp) / DAY_SECONDS),
          cumulativeAmountOnChain: Math.round(
            buildTrancheSchedule(1, startTimestamp, selectedTemplate, undefined, tokenType)
              .filter((item) => item.unlockTime <= tranche.unlockTime)
              .reduce((sum, item) => sum + toOnChainChartAmount(item.amount, tokenType), 0),
          ),
        }))
      : undefined;

    return buildScheduleChartPoints({
      streamType: selectedTemplate.streamType,
      durationDays: durationDaysValue,
      cliffDays: cliffDaysValue,
      intervalDays: intervalDaysValue,
      totalOnChain: representativeTotal,
      hybridUnlockDays: Number(hybridUnlockDays || 0),
      hybridUnlockPercent: Number(hybridUnlockPercent || 0),
      trancheSchedule,
    });
  }, [
    cliffDaysValue,
    durationDaysValue,
    hybridUnlockDays,
    hybridUnlockPercent,
    intervalDaysValue,
    selectedTemplate,
    startTimestamp,
    tokenType,
  ]);

  const validRows = rows.filter((row) => row.recipient.trim() && Number(row.amount) > 0);
  const totalBatchAmount = validRows.reduce((sum, row) => sum + Number(row.amount), 0);
  const overrideRowCount = rows.filter((row) =>
    row.scheduleTemplateId.trim()
    || row.startDate.trim()
    || row.durationDays.trim()
    || row.cliffDays.trim()
    || row.intervalDays.trim()
    || row.hybridUnlockDays.trim()
    || row.hybridUnlockPercent.trim()
    || row.trancheOffsetsDays.trim()
    || row.tranchePercentages.trim(),
  ).length;

  const resolveRow = (row: BatchRow): ResolvedBatchRow => {
    const templateOverride = row.scheduleTemplateId.trim()
      ? getStreamScheduleTemplateById(row.scheduleTemplateId.trim())
      : null;
    const template = templateOverride || selectedTemplate;
    const usesTemplateOverride = Boolean(templateOverride);
    const startDateValue = row.startDate.trim() || startDate;
    const startTimestampValue = Math.floor(new Date(`${startDateValue}T00:00:00`).getTime() / 1000);
    const baseDuration = usesTemplateOverride ? Number(template.duration || '0') : durationDaysValue;
    const baseCliff = usesTemplateOverride ? Number(template.cliffDays || '0') : cliffDaysValue;
    const baseInterval = usesTemplateOverride
      ? Number(
          template.streamType === 'RECURRING'
            ? template.recurringIntervalDays || '0'
            : template.streamType === 'STEP'
              ? template.stepIntervalDays || '0'
              : '0',
        )
      : intervalDaysValue;
    const baseHybridUnlockDays = usesTemplateOverride
      ? Number(template.hybridUnlockDays || '0')
      : Number(hybridUnlockDays || 0);
    const baseHybridUnlockPercent = usesTemplateOverride
      ? Number(template.hybridUnlockPercent || '0')
      : Number(hybridUnlockPercent || 0);
    const resolvedDuration = row.durationDays.trim() ? Number(row.durationDays) : baseDuration;
    const resolvedCliff = template.streamType === 'LINEAR'
      ? (row.cliffDays.trim() ? Number(row.cliffDays) : baseCliff)
      : 0;
    const resolvedInterval = template.streamType === 'RECURRING' || template.streamType === 'STEP'
      ? (row.intervalDays.trim() ? Number(row.intervalDays) : baseInterval)
      : 0;
    const resolvedHybridUnlockDays = template.streamType === 'HYBRID'
      ? (row.hybridUnlockDays.trim() ? Number(row.hybridUnlockDays) : baseHybridUnlockDays)
      : 0;
    const resolvedHybridUnlockPercent = template.streamType === 'HYBRID'
      ? (row.hybridUnlockPercent.trim() ? Number(row.hybridUnlockPercent) : baseHybridUnlockPercent)
      : 0;
    const resolvedRefillable = template.streamType === 'RECURRING'
      ? (usesTemplateOverride ? Boolean(template.refillable) : refillable)
      : false;
    const trancheGeometry = template.streamType === 'TRANCHE'
      ? resolveTrancheGeometry(row, template, resolvedDuration)
      : null;
    const trancheSchedule = template.streamType === 'TRANCHE'
      ? buildTrancheSchedule(
          Number(row.amount || 0),
          startTimestampValue,
          template,
          resolvedDuration,
          tokenType,
          trancheGeometry && !trancheGeometry.error
            ? {
                offsetsDays: trancheGeometry.offsetsDays,
                percentages: trancheGeometry.percentages,
              }
            : undefined,
        )
      : undefined;

    return {
      template,
      startDate: startDateValue,
      startTimestamp: startTimestampValue,
      durationDays: resolvedDuration,
      cliffDays: resolvedCliff,
      intervalDays: resolvedInterval,
      hybridUnlockDays: resolvedHybridUnlockDays,
      hybridUnlockPercent: resolvedHybridUnlockPercent,
      refillable: resolvedRefillable,
      usesTemplateOverride,
      hasTrancheOverride: Boolean(trancheGeometry?.hasOverride),
      trancheOffsetsDays: trancheGeometry?.offsetsDays,
      tranchePercentages: trancheGeometry?.percentages,
      trancheGeometryError: trancheGeometry?.error || undefined,
      trancheSchedule,
    };
  };

  const rowPreviewMap = useMemo(() => {
    const previews = new Map<string, BatchRowPreview>();

    rows.forEach((row) => {
      const resolved = resolveRow(row);
      const rowAmount = Number(row.amount || 0);
      const actualTotalOnChain = toOnChainChartAmount(rowAmount, tokenType);
      const representativeTotalOnChain = actualTotalOnChain || toOnChainChartAmount(1, tokenType);
      const hasValidStartTimestamp = Number.isFinite(resolved.startTimestamp);
      const rowIssues: string[] = [];
      let trancheChartSchedule:
        | Array<{ offsetDays: number; cumulativeAmountOnChain: number }>
        | undefined;
      let releaseCountLabel = 'Continuous unlock';
      let amountModelLabel = 'Accrues continuously';
      let chartSubtitle = `Starts ${resolved.startDate} • ${resolved.durationDays || 0}-day horizon`;
      let state: BatchRowPreview['state'] = 'ready';
      let stateTitle: string | undefined;
      let stateMessage: string | undefined;

      if (!row.recipient.trim() || rowAmount <= 0) {
        state = 'draft';
        stateTitle = 'Draft row preview';
        stateMessage = 'Add a recipient and amount to finalize this row. The curve still reflects the resolved schedule shape.';
      }

      if (!hasValidStartTimestamp) {
        rowIssues.push('Choose a valid row start date.');
        chartSubtitle = 'Choose a valid row start date to preview the unlock schedule.';
        releaseCountLabel = 'Pending schedule';
        amountModelLabel = 'Awaiting valid inputs';
      } else if (resolved.durationDays <= 0) {
        rowIssues.push('Enter a positive row duration.');
        chartSubtitle = 'Enter a positive duration to render the unlock schedule.';
        releaseCountLabel = 'Pending schedule';
        amountModelLabel = 'Awaiting valid inputs';
      } else if (resolved.template.streamType === 'TRANCHE') {
        if (resolved.trancheGeometryError) {
          rowIssues.push(resolved.trancheGeometryError);
          chartSubtitle = 'Fix the tranche override values to render the staged unlock curve.';
          releaseCountLabel = 'Pending tranche geometry';
          amountModelLabel = 'Awaiting valid tranche inputs';
        }
        let cumulativeAmountOnChain = 0;
        const offsetsDays = resolved.trancheOffsetsDays || [];
        const percentages = resolved.tranchePercentages || [];
        trancheChartSchedule = offsetsDays.map((offsetDays, trancheIndex) => {
          cumulativeAmountOnChain += Math.round((representativeTotalOnChain * (percentages[trancheIndex] || 0)) / 100);
          return {
            offsetDays: Math.max(0, Math.round(offsetDays)),
            cumulativeAmountOnChain,
          };
        });
        releaseCountLabel = `${offsetsDays.length || 0} staged unlocks`;
        amountModelLabel = resolved.hasTrancheOverride ? 'Custom tranche weights' : 'Variable tranche sizes';
        chartSubtitle = `Starts ${resolved.startDate} • ${offsetsDays.length || 0} checkpoints across ${resolved.durationDays || 0} days`;
      } else if (resolved.template.streamType === 'RECURRING') {
        if (!resolved.intervalDays || resolved.intervalDays <= 0) {
          rowIssues.push('Enter a valid recurring cadence.');
          chartSubtitle = 'Enter a positive cadence to preview recurring payouts.';
          releaseCountLabel = 'Pending cadence';
          amountModelLabel = 'Awaiting valid inputs';
        }
        const releaseCount = resolved.intervalDays > 0 ? Math.floor(resolved.durationDays / resolved.intervalDays) : 0;
        releaseCountLabel = `${releaseCount || 0} recurring payouts`;
        amountModelLabel = releaseCount > 0 && rowAmount > 0
          ? `${formatAssetAmount(rowAmount / releaseCount, tokenType)} per payout`
          : 'Fixed recurring payouts';
        chartSubtitle = `Starts ${resolved.startDate} • every ${resolved.intervalDays || 0} days over ${resolved.durationDays || 0} days`;
      } else if (resolved.template.streamType === 'STEP') {
        if (!resolved.intervalDays || resolved.intervalDays <= 0) {
          rowIssues.push('Enter a valid milestone cadence.');
          chartSubtitle = 'Enter a positive cadence to preview milestone unlocks.';
          releaseCountLabel = 'Pending cadence';
          amountModelLabel = 'Awaiting valid inputs';
        }
        const milestoneCount = resolved.intervalDays > 0 ? Math.floor(resolved.durationDays / resolved.intervalDays) : 0;
        releaseCountLabel = `${milestoneCount || 0} milestone unlocks`;
        amountModelLabel = milestoneCount > 0 && rowAmount > 0
          ? `~${formatAssetAmount(rowAmount / milestoneCount, tokenType)} per milestone`
          : 'Chunked milestone releases';
        chartSubtitle = `Starts ${resolved.startDate} • every ${resolved.intervalDays || 0} days across ${resolved.durationDays || 0} days`;
      } else if (resolved.template.streamType === 'HYBRID') {
        if (!resolved.hybridUnlockDays || resolved.hybridUnlockDays <= 0) {
          rowIssues.push('Enter a valid upfront unlock day.');
          chartSubtitle = 'Set an upfront unlock day to preview the hybrid release curve.';
          releaseCountLabel = 'Pending unlock split';
          amountModelLabel = 'Awaiting valid inputs';
        } else if (resolved.hybridUnlockDays >= resolved.durationDays) {
          rowIssues.push('Upfront unlock day must be earlier than the full schedule duration.');
          chartSubtitle = 'Move the upfront unlock earlier than the full schedule duration.';
          releaseCountLabel = 'Pending unlock split';
          amountModelLabel = 'Awaiting valid inputs';
        } else if (!resolved.hybridUnlockPercent || resolved.hybridUnlockPercent <= 0 || resolved.hybridUnlockPercent >= 100) {
          rowIssues.push('Enter an upfront unlock percentage between 0 and 100.');
          chartSubtitle = 'Choose a valid upfront percentage to preview the hybrid release curve.';
          releaseCountLabel = 'Pending unlock split';
          amountModelLabel = 'Awaiting valid inputs';
        } else {
          releaseCountLabel = '2-stage hybrid unlock';
          amountModelLabel = `${resolved.hybridUnlockPercent}% upfront, remainder linear`;
          chartSubtitle = `Starts ${resolved.startDate} • unlocks ${resolved.hybridUnlockPercent}% at day ${resolved.hybridUnlockDays}, then vests linearly through day ${resolved.durationDays || 0}`;
        }
      } else if (resolved.cliffDays > 0) {
        if (resolved.cliffDays >= resolved.durationDays) {
          rowIssues.push('Cliff days must be shorter than the full schedule duration.');
          chartSubtitle = 'Shorten the cliff to render the continuous unlock curve.';
          releaseCountLabel = 'Pending cliff fix';
          amountModelLabel = 'Awaiting valid inputs';
        }
        releaseCountLabel = 'Continuous unlock with cliff';
        amountModelLabel = `Cliff release at day ${resolved.cliffDays}`;
        chartSubtitle = `Starts ${resolved.startDate} • ${resolved.cliffDays}-day cliff within a ${resolved.durationDays || 0}-day horizon`;
      }

      if (rowIssues.length > 0) {
        state = 'invalid';
        stateTitle = 'Preview needs attention';
        stateMessage = rowIssues[0];
      }

      const summaryBadges = [
        resolved.template.eyebrow,
        `${resolved.durationDays || 0} day horizon`,
      ];

      if (resolved.template.streamType === 'LINEAR' && resolved.cliffDays > 0) {
        summaryBadges.push(`${resolved.cliffDays} day cliff`);
      }

      if (resolved.template.streamType === 'RECURRING' || resolved.template.streamType === 'STEP') {
        summaryBadges.push(`Every ${resolved.intervalDays || 0} days`);
      }

      if (resolved.template.streamType === 'HYBRID') {
        summaryBadges.push(`Unlock ${resolved.hybridUnlockPercent || 0}% on day ${resolved.hybridUnlockDays || 0}`);
      }

      if (resolved.template.streamType === 'TRANCHE') {
        summaryBadges.push(`${resolved.trancheSchedule?.length || 0} unlock points`);
      }

      if (resolved.template.streamType === 'TRANCHE' && resolved.hasTrancheOverride) {
        summaryBadges.push('Custom tranche geometry');
      }

      if (resolved.template.streamType === 'RECURRING' && resolved.refillable) {
        summaryBadges.push('Refillable');
      }

      summaryBadges.push(resolved.usesTemplateOverride ? 'Customized for this recipient' : 'Inherited from payroll lane');

      previews.set(row.id, {
        resolved,
        chartPoints: buildScheduleChartPoints({
          streamType: resolved.template.streamType,
          durationDays: resolved.durationDays,
          cliffDays: resolved.cliffDays,
          intervalDays: resolved.intervalDays,
          totalOnChain: representativeTotalOnChain,
          hybridUnlockDays: resolved.hybridUnlockDays,
          hybridUnlockPercent: resolved.hybridUnlockPercent,
          trancheSchedule: trancheChartSchedule,
        }),
        chartTitle: resolved.template.title,
        chartSubtitle,
        summaryBadges,
        releaseCountLabel,
        amountModelLabel,
        state,
        stateTitle,
        stateMessage,
      });
    });

    return previews;
  }, [
    rows,
    tokenType,
    selectedTemplate,
    startDate,
    durationDaysValue,
    cliffDaysValue,
    intervalDaysValue,
    hybridUnlockDays,
    hybridUnlockPercent,
    refillable,
  ]);

  const resetTransientState = () => {
    setBatchError(null);
    setCompletedTx(null);
    setCompletedCount(0);
  };

  const updateRow = (id: string, field: RowField, value: string) => {
    resetTransientState();
    setRows((previous) =>
      previous.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  };

  const addRow = () => {
    resetTransientState();
    setRows((previous) => [
      ...previous,
      {
        id: `row-${Date.now()}`,
        recipient: '',
        amount: '',
        description: '',
        scheduleTemplateId: '',
        startDate: '',
        durationDays: '',
        cliffDays: '',
        intervalDays: '',
        hybridUnlockDays: '',
        hybridUnlockPercent: '',
        trancheOffsetsDays: '',
        tranchePercentages: '',
      },
    ]);
  };

  const removeRow = (id: string) => {
    resetTransientState();
    setRows((previous) => (previous.length > 1 ? previous.filter((row) => row.id !== id) : previous));
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'flowguard-stream-payroll-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportCurrentRoster = () => {
    const csv = Papa.unparse(
      rows.map((row) => {
        const resolved = resolveRow(row);
        return {
          recipient: row.recipient,
          amount: row.amount,
          description: row.description,
          scheduleTemplate: resolved.template.id,
          startDate: resolved.startDate,
          durationDays: resolved.durationDays ? String(resolved.durationDays) : '',
          intervalDays:
            resolved.template.streamType === 'RECURRING' || resolved.template.streamType === 'STEP'
              ? String(resolved.intervalDays || '')
              : '',
          cliffDays: resolved.template.streamType === 'LINEAR' ? String(resolved.cliffDays || '') : '',
          hybridUnlockDays:
            resolved.template.streamType === 'HYBRID'
              ? String(resolved.hybridUnlockDays || '')
              : '',
          hybridUnlockPercent:
            resolved.template.streamType === 'HYBRID'
              ? String(resolved.hybridUnlockPercent || '')
              : '',
          trancheOffsetsDays:
            resolved.template.streamType === 'TRANCHE'
              ? (resolved.trancheOffsetsDays || []).join('|')
              : '',
          tranchePercentages:
            resolved.template.streamType === 'TRANCHE'
              ? (resolved.tranchePercentages || []).join('|')
              : '',
        };
      }),
      { columns: [...CSV_COLUMNS] },
    );
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'flowguard-stream-payroll-roster.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvUpload = (file: File) => {
    resetTransientState();
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = parseImportedRows(results.data as Array<Record<string, string | number>>);
        setRows(parsed);
      },
      error: (error) => {
        setBatchError(`Failed to parse CSV: ${error.message}`);
      },
    });
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};

    if (!selectedVaultId) {
      nextErrors.vault = 'Select a treasury vault for this payroll run';
    }

    if (tokenType === 'FUNGIBLE_TOKEN') {
      if (!tokenCategory.trim()) {
        nextErrors.tokenCategory = 'Enter the CashToken category for this payroll lane';
      } else if (tokenCategory.trim().length !== 64 || !/^[0-9a-fA-F]{64}$/.test(tokenCategory.trim())) {
        nextErrors.tokenCategory = 'Token category must be a 64-character hex string';
      }
    }

    if (!startDate || Number.isNaN(startTimestamp)) {
      nextErrors.startDate = 'Choose a valid start date';
    }

    if (!durationDaysValue || durationDaysValue <= 0) {
      nextErrors.duration = 'Enter a positive schedule duration';
    }

    if (
      (selectedTemplate.streamType === 'RECURRING' || selectedTemplate.streamType === 'STEP') &&
      (!intervalDaysValue || intervalDaysValue <= 0)
    ) {
      nextErrors.interval = 'Enter a valid release cadence';
    }

    if (selectedTemplate.streamType === 'HYBRID') {
      const laneHybridUnlockDays = Number(hybridUnlockDays || 0);
      const laneHybridUnlockPercent = Number(hybridUnlockPercent || 0);
      if (!laneHybridUnlockDays || laneHybridUnlockDays <= 0) {
        nextErrors.hybridUnlockDays = 'Enter a valid upfront unlock day';
      } else if (durationDaysValue > 0 && laneHybridUnlockDays >= durationDaysValue) {
        nextErrors.hybridUnlockDays = 'Upfront unlock day must be earlier than the full schedule duration';
      }
      if (!laneHybridUnlockPercent || laneHybridUnlockPercent <= 0 || laneHybridUnlockPercent >= 100) {
        nextErrors.hybridUnlockPercent = 'Enter an upfront unlock percentage between 0 and 100';
      }
    }

    rows.forEach((row, index) => {
      const resolvedRow = resolveRow(row);
      if (row.scheduleTemplateId.trim() && !getStreamScheduleTemplateById(row.scheduleTemplateId.trim())) {
        nextErrors[`row-${index}-template`] = 'Choose a valid schedule template';
      }
      if (!row.recipient.trim()) {
        nextErrors[`row-${index}-recipient`] = 'Recipient address required';
      }
      if (!row.amount || Number(row.amount) <= 0) {
        nextErrors[`row-${index}-amount`] = 'Positive amount required';
      }
      if (Number.isNaN(resolvedRow.startTimestamp)) {
        nextErrors[`row-${index}-startDate`] = 'Choose a valid row start date';
      }
      if (!resolvedRow.durationDays || resolvedRow.durationDays <= 0) {
        nextErrors[`row-${index}-duration`] = 'Duration must be a positive number of days';
      }
      if (resolvedRow.template.streamType === 'LINEAR') {
        if (resolvedRow.cliffDays < 0) {
          nextErrors[`row-${index}-cliff`] = 'Cliff days cannot be negative';
        } else if (resolvedRow.cliffDays >= resolvedRow.durationDays) {
          nextErrors[`row-${index}-cliff`] = 'Cliff must be shorter than the full schedule duration';
        }
      }
      if (resolvedRow.template.streamType === 'RECURRING' || resolvedRow.template.streamType === 'STEP') {
        if (!resolvedRow.intervalDays || resolvedRow.intervalDays <= 0) {
          nextErrors[`row-${index}-interval`] = 'Cadence must be a positive number of days';
        } else if (resolvedRow.intervalDays > resolvedRow.durationDays) {
          nextErrors[`row-${index}-interval`] = 'Cadence must fit inside the full schedule duration';
        } else if (resolvedRow.durationDays % resolvedRow.intervalDays !== 0) {
          nextErrors[`row-${index}-interval`] = 'Cadence must divide the schedule duration evenly';
        }
      }
      if (resolvedRow.template.streamType === 'HYBRID') {
        if (!resolvedRow.hybridUnlockDays || resolvedRow.hybridUnlockDays <= 0) {
          nextErrors[`row-${index}-hybridUnlockDays`] = 'Upfront unlock day must be positive';
        } else if (resolvedRow.hybridUnlockDays >= resolvedRow.durationDays) {
          nextErrors[`row-${index}-hybridUnlockDays`] = 'Upfront unlock day must be earlier than the full duration';
        }
        if (!resolvedRow.hybridUnlockPercent || resolvedRow.hybridUnlockPercent <= 0 || resolvedRow.hybridUnlockPercent >= 100) {
          nextErrors[`row-${index}-hybridUnlockPercent`] = 'Upfront unlock percentage must be between 0 and 100';
        }
      }
      if (resolvedRow.template.streamType === 'TRANCHE' && resolvedRow.trancheGeometryError) {
        nextErrors[`row-${index}-trancheGeometry`] = resolvedRow.trancheGeometryError;
      }
    });

    if (!validRows.length) {
      nextErrors.rows = 'Add at least one valid payroll row';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!wallet.address) {
      setBatchError('Connect a wallet before creating a payroll run');
      return;
    }
    if (!validate()) return;

    setIsSubmitting(true);
    setBatchError(null);

    try {
      if (tokenType === 'FUNGIBLE_TOKEN' && tokenCategory.trim()) {
        const isValidCategory = await validateTokenCategory(tokenCategory.trim(), network);
        if (!isValidCategory) {
          setErrors((previous) => ({
            ...previous,
            tokenCategory: 'Token category not found on blockchain. Please verify the category ID.',
          }));
          return;
        }
      }

      const payload = {
        senderAddress: wallet.address,
        tokenType,
        tokenCategory: tokenType === 'FUNGIBLE_TOKEN' ? tokenCategory.trim() : undefined,
        launchContext: daoContext || undefined,
        entries: validRows.map((row) => {
          const resolvedRow = resolveRow(row);
          const endTime = resolvedRow.startTimestamp + resolvedRow.durationDays * DAY_SECONDS;
          const baseEntry = {
            recipient: row.recipient.trim(),
            totalAmount: Number(row.amount),
            description: row.description.trim() || null,
            streamType: resolvedRow.template.streamType,
            startTime: resolvedRow.startTimestamp,
            endTime,
            cliffTimestamp: resolvedRow.cliffDays > 0
              ? resolvedRow.startTimestamp + resolvedRow.cliffDays * DAY_SECONDS
              : null,
            cancelable,
            refillable: resolvedRow.refillable,
            scheduleTemplate: resolvedRow.template.id,
          };

          if (resolvedRow.template.streamType === 'RECURRING' || resolvedRow.template.streamType === 'STEP') {
            return {
              ...baseEntry,
              intervalSeconds: resolvedRow.intervalDays * DAY_SECONDS,
            };
          }

          if (resolvedRow.template.streamType === 'TRANCHE') {
            return {
              ...baseEntry,
              trancheSchedule: resolvedRow.trancheSchedule,
            };
          }

          if (resolvedRow.template.streamType === 'HYBRID') {
            return {
              ...baseEntry,
              hybridUnlockTimestamp: resolvedRow.startTimestamp + resolvedRow.hybridUnlockDays * DAY_SECONDS,
              hybridUpfrontPercentage: resolvedRow.hybridUnlockPercent,
            };
          }

          return baseEntry;
        }),
      };

      const result = await fundBatchStreamContracts(wallet, selectedVaultId, payload);
      setCompletedTx(result.txId);
      setCompletedCount(result.streamIds.length);
    } catch (error: any) {
      setBatchError(error.message || 'Failed to create and fund batch streams');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="max-w-lg p-8 text-center">
          <Wallet2 className="w-12 h-12 text-primary mx-auto mb-4" />
          <h1 className="font-display text-2xl sm:text-3xl text-textPrimary mb-3">Connect your treasury signer</h1>
          <p className="text-textSecondary mb-6">
            Batch stream creation builds and funds real covenant outputs. Connect the treasury wallet that will fund the full payroll run.
          </p>
          <Button onClick={openModal}>Connect Wallet</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              to={vaultIdFromRoute ? `/vaults/${vaultIdFromRoute}` : daoContext ? '/app/dao' : '/streams'}
              className="inline-flex items-center gap-2 text-textSecondary hover:text-primary transition-colors mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              {selectedVaultId ? 'Back to treasury' : 'Back to streams'}
            </Link>
            <p className="text-xs uppercase tracking-[0.2em] text-primary font-mono mb-2">Treasury Payroll Console</p>
            <h1 className="font-display text-3xl md:text-5xl text-textPrimary mb-3">
              Batch Create Streams
            </h1>
            <p className="max-w-3xl text-textSecondary">
              Configure one schedule lane, import recipients, and fund every {tokenType === 'BCH' ? 'BCH' : 'CashToken'} stream in a single treasury transaction.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={exportCurrentRoster}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export Current CSV
            </Button>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-2" />
              CSV Template
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              Import CSV
            </Button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleCsvUpload(file);
          }}
          className="hidden"
        />

        {daoContext && (
          <Card className="p-5 md:p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">
                  Organization launch context
                </p>
                <h2 className="font-display text-2xl text-textPrimary mb-2">
                  {daoContext.title}
                </h2>
                <p className="text-textSecondary max-w-3xl">
                  {daoContext.description}
                </p>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-5 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">CSV operations</p>
              <h2 className="font-display text-2xl text-textPrimary mb-2">Import and geometry guide</h2>
              <p className="max-w-3xl text-textSecondary">
                Import a shared payroll roster, export your live working draft, and use tranche geometry columns when recipients need custom staged unlocks.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-surfaceAlt px-4 py-3 text-xs text-textSecondary font-mono">
              Columns: {CSV_COLUMNS.join(', ')}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-border bg-surfaceAlt px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-textMuted font-mono mb-2">Lane inheritance</p>
              <p className="text-sm text-textSecondary">
                Leave override fields blank to inherit the shared payroll lane while editing. Exported roster CSVs write the fully resolved row schedule so re-importing reproduces the same draft accurately.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-surfaceAlt px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-textMuted font-mono mb-2">Tranche geometry</p>
              <p className="text-sm text-textSecondary">
                Use <span className="font-mono text-textPrimary">trancheOffsetsDays</span> and <span className="font-mono text-textPrimary">tranchePercentages</span> with <span className="font-mono text-textPrimary">|</span>-separated values like <span className="font-mono text-textPrimary">30|120|210|300</span> and <span className="font-mono text-textPrimary">20|20|25|35</span>.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-surfaceAlt px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-textMuted font-mono mb-2">Template aliases</p>
              <p className="text-sm text-textSecondary">
                CSV import accepts <span className="font-mono text-textPrimary">scheduleTemplate</span> or <span className="font-mono text-textPrimary">schedule_template</span>, plus tranche aliases like <span className="font-mono text-textPrimary">trancheOffsets</span> and <span className="font-mono text-textPrimary">trancheWeights</span>.
              </p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-6">
          <div className="space-y-6">
            <Card className="p-5 md:p-6">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">Configuration</p>
                  <h2 className="font-display text-2xl text-textPrimary">Payroll lane setup</h2>
                </div>
                <div className="px-3 py-1.5 rounded-full bg-primarySoft text-textPrimary font-mono text-xs">
                  {tokenType === 'BCH' ? 'BCH lane' : 'CashToken lane'}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  {vaultIdFromRoute ? (
                    <div className="rounded-2xl border border-border bg-surfaceAlt px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-textMuted font-mono mb-1">Treasury context</p>
                      <p className="text-sm text-textPrimary font-medium">{vaultIdFromRoute}</p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-textPrimary mb-2">Funding treasury</label>
                      <select
                        value={selectedVaultId}
                        onChange={(event) => setSelectedVaultId(event.target.value)}
                        className="w-full rounded-md border border-border bg-surface px-4 py-2 text-textPrimary focus:ring-2 focus:ring-focusRing"
                      >
                        <option value="">
                          {loadingVaults ? 'Loading treasury vaults...' : 'Select a vault'}
                        </option>
                        {vaults.map((vault) => (
                          <option key={vault.vault_id || vault.vaultId} value={vault.vault_id || vault.vaultId}>
                            {vault.name || vault.vault_id || vault.vaultId}
                          </option>
                        ))}
                      </select>
                      {errors.vault && <p className="mt-1 text-sm text-primary">{errors.vault}</p>}
                    </div>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-textPrimary mb-2">Asset lane</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        resetTransientState();
                        setTokenType('BCH');
                        setTokenCategory('');
                      }}
                      className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                        tokenType === 'BCH'
                          ? 'border-primary bg-primarySoft'
                          : 'border-border bg-surface hover:border-borderHover'
                      }`}
                    >
                      <p className="text-sm font-medium text-textPrimary">BCH treasury lane</p>
                      <p className="text-xs text-textSecondary mt-1">Fund every stream with native BCH.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resetTransientState();
                        setTokenType('FUNGIBLE_TOKEN');
                      }}
                      className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                        tokenType === 'FUNGIBLE_TOKEN'
                          ? 'border-primary bg-primarySoft'
                          : 'border-border bg-surface hover:border-borderHover'
                      }`}
                    >
                      <p className="text-sm font-medium text-textPrimary">CashToken treasury lane</p>
                      <p className="text-xs text-textSecondary mt-1">Requires same-category mint authority for stream state NFTs.</p>
                    </button>
                  </div>
                </div>

                {tokenType === 'FUNGIBLE_TOKEN' && (
                  <div className="md:col-span-2">
                    <Input
                      label="CashToken category"
                      value={tokenCategory}
                      onChange={(event) => setTokenCategory(event.target.value)}
                      error={errors.tokenCategory}
                      placeholder="32-byte category hex"
                    />
                    <p className="mt-2 text-xs text-textSecondary">
                      The funding signer must already control a minting NFT for this token category. FlowGuard preserves that authority back to the signer after funding the batch.
                    </p>
                  </div>
                )}

                <Input
                  label="Start date"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  error={errors.startDate}
                />
                <Input
                  label="Schedule duration (days)"
                  type="number"
                  min="1"
                  value={durationDays}
                  onChange={(event) => setDurationDays(event.target.value)}
                  error={errors.duration}
                />

                {(selectedTemplate.streamType === 'RECURRING' || selectedTemplate.streamType === 'STEP') && (
                  <Input
                    label={selectedTemplate.streamType === 'RECURRING' ? 'Release cadence (days)' : 'Milestone cadence (days)'}
                    type="number"
                    min="1"
                    value={intervalDays}
                    onChange={(event) => setIntervalDays(event.target.value)}
                    error={errors.interval}
                  />
                )}

                {selectedTemplate.streamType === 'HYBRID' && (
                  <>
                    <Input
                      label="Upfront unlock day"
                      type="number"
                      min="1"
                      value={hybridUnlockDays}
                      onChange={(event) => setHybridUnlockDays(event.target.value)}
                      error={errors.hybridUnlockDays}
                    />
                    <Input
                      label="Upfront unlock percentage"
                      type="number"
                      min="1"
                      max="99"
                      step="0.01"
                      value={hybridUnlockPercent}
                      onChange={(event) => setHybridUnlockPercent(event.target.value)}
                      error={errors.hybridUnlockPercent}
                    />
                  </>
                )}

                {selectedTemplate.streamType === 'LINEAR' && (
                  <Input
                    label="Cliff days"
                    type="number"
                    min="0"
                    value={cliffDays}
                    onChange={(event) => setCliffDays(event.target.value)}
                  />
                )}

                <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCancelable((value) => !value)}
                    className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                      cancelable
                        ? 'border-primary bg-primarySoft'
                        : 'border-border bg-surface hover:border-borderHover'
                    }`}
                  >
                    <p className="text-sm font-medium text-textPrimary">Cancelable by sender</p>
                    <p className="text-xs text-textSecondary mt-1">Allow the treasury to stop future unlocks.</p>
                  </button>

                  {selectedTemplate.streamType === 'RECURRING' && (
                    <button
                      type="button"
                      onClick={() => setRefillable((value) => !value)}
                      className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                        refillable
                          ? 'border-primary bg-primarySoft'
                          : 'border-border bg-surface hover:border-borderHover'
                      }`}
                    >
                      <p className="text-sm font-medium text-textPrimary">Refillable runway</p>
                      <p className="text-xs text-textSecondary mt-1">Keep the cadence open-ended and top up later.</p>
                    </button>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-5 md:p-6">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">Templates</p>
                  <h2 className="font-display text-2xl text-textPrimary">Schedule shape</h2>
                </div>
                <Link to="/streams/shapes" className="text-sm text-primary hover:text-primaryHover font-medium">
                  Explore all shapes
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {streamScheduleTemplates.map((template) => {
                  const isActive = template.id === templateId;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setTemplateId(template.id)}
                      className={`rounded-2xl border p-4 text-left transition-colors ${
                        isActive
                          ? 'border-primary bg-primarySoft'
                          : 'border-border bg-surface hover:border-borderHover hover:bg-surfaceAlt'
                      }`}
                    >
                      <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">{template.eyebrow}</p>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-display text-lg text-textPrimary mb-2">{template.title}</h3>
                          <p className="text-sm text-textSecondary mb-3">{template.description}</p>
                        </div>
                        {isActive && <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {template.tags.map((tag) => (
                          <span key={tag} className="px-2.5 py-1 rounded-full bg-surfaceAlt text-xs text-textSecondary font-mono">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card className="p-5 md:p-6">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">Recipients</p>
                  <h2 className="font-display text-2xl text-textPrimary">Batch roster</h2>
                </div>
                <Button variant="outline" onClick={addRow}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add row
                </Button>
              </div>

              <div className="space-y-3">
                {rows.map((row, index) => (
                  <div key={row.id} className="rounded-2xl border border-border bg-surfaceAlt p-4">
                    {(() => {
                      const rowPreview = rowPreviewMap.get(row.id);
                      const resolvedRow = rowPreview?.resolved || resolveRow(row);
                      return (
                        <>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div>
                        <p className="text-sm font-medium text-textPrimary">Recipient {index + 1}</p>
                        <p className="text-xs text-textSecondary mt-1">
                          {resolvedRow.usesTemplateOverride ? 'Customized for this recipient' : 'Inherited from payroll lane'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="p-2 rounded-full text-textMuted hover:text-primary hover:bg-primarySoft transition-colors"
                        aria-label={`Remove recipient ${index + 1}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {(rowPreview?.summaryBadges || []).map((badge) => (
                        <span
                          key={badge}
                          className={`px-2.5 py-1 rounded-full text-xs font-mono ${
                            badge === 'Customized for this recipient' || badge === 'Refillable'
                              ? 'bg-primarySoft text-textPrimary'
                              : 'bg-background text-textSecondary'
                          }`}
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                    <div className="mb-4 rounded-2xl border border-border bg-surface px-4 py-4">
                      <div className="flex flex-col gap-1 mb-4">
                        <p className="text-sm font-medium text-textPrimary">Resolved schedule preview</p>
                        <p className="text-xs text-textSecondary">
                          This reflects the actual on-chain schedule for this row after defaults and overrides are applied.
                        </p>
                      </div>
                      {rowPreview?.state && rowPreview.state !== 'ready' && (
                        <div
                          className={`mb-4 flex items-start gap-3 rounded-2xl border px-4 py-3 ${
                            rowPreview.state === 'invalid'
                              ? 'border-primary/40 bg-primarySoft'
                              : 'border-border bg-surfaceAlt'
                          }`}
                        >
                          {rowPreview.state === 'invalid' ? (
                            <AlertCircle className="mt-0.5 h-4 w-4 text-primary shrink-0" />
                          ) : (
                            <Sparkles className="mt-0.5 h-4 w-4 text-primary shrink-0" />
                          )}
                          <div>
                            <p className="text-sm font-medium text-textPrimary">
                              {rowPreview.stateTitle}
                            </p>
                            <p className="text-xs text-textSecondary mt-1">
                              {rowPreview.stateMessage}
                            </p>
                          </div>
                        </div>
                      )}
                      <StreamScheduleChart
                        shape={resolvedRow.template.streamType}
                        points={rowPreview?.chartPoints || [{ x: 0, y: 0 }, { x: 1, y: 0 }]}
                        title={rowPreview?.chartTitle}
                        subtitle={rowPreview?.chartSubtitle}
                        variant="row"
                        showLegend={false}
                        showAxisLabels
                        className="bg-transparent border-0 p-0"
                      />
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-2xl border border-border bg-surfaceAlt px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-textMuted font-mono mb-1">
                            Schedule family
                          </p>
                          <p className="text-sm text-textPrimary font-medium">
                            {resolvedRow.template.eyebrow}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border bg-surfaceAlt px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-textMuted font-mono mb-1">
                            Unlock count
                          </p>
                          <p className="text-sm text-textPrimary font-medium">
                            {rowPreview?.releaseCountLabel || 'Pending'}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border bg-surfaceAlt px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-textMuted font-mono mb-1">
                            Amount model
                          </p>
                          <p className="text-sm text-textPrimary font-medium">
                            {rowPreview?.amountModelLabel || 'Pending'}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-[1.5fr_0.7fr_1fr] gap-3">
                      <Input
                        label="Recipient address"
                        value={row.recipient}
                        onChange={(event) => updateRow(row.id, 'recipient', event.target.value)}
                        error={errors[`row-${index}-recipient`]}
                        placeholder="bchtest:..."
                      />
                      <Input
                        label={`Amount (${tokenType === 'BCH' ? 'BCH' : 'tokens'})`}
                        type="number"
                        min="0"
                        step={tokenType === 'BCH' ? '0.00000001' : '1'}
                        value={row.amount}
                        onChange={(event) => updateRow(row.id, 'amount', event.target.value)}
                        error={errors[`row-${index}-amount`]}
                      />
                      <Input
                        label="Description"
                        value={row.description}
                        onChange={(event) => updateRow(row.id, 'description', event.target.value)}
                        placeholder="Optional note"
                      />
                    </div>
                    <div className="mt-4 rounded-2xl border border-border bg-surface px-4 py-4">
                      <div className="flex flex-col gap-1 mb-4">
                        <p className="text-sm font-medium text-textPrimary">Optional row overrides</p>
                        <p className="text-xs text-textSecondary">
                          {resolvedRow.usesTemplateOverride
                            ? 'Unset timing fields use the selected row template defaults.'
                            : 'Unset timing fields inherit the shared payroll lane.'}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <div className="xl:col-span-2">
                          <label className="block text-sm font-medium text-textPrimary mb-2">Schedule template</label>
                          <select
                            value={row.scheduleTemplateId}
                            onChange={(event) => updateRow(row.id, 'scheduleTemplateId', event.target.value)}
                            className="w-full rounded-md border border-border bg-surfaceAlt px-4 py-2 text-textPrimary focus:ring-2 focus:ring-focusRing"
                          >
                            <option value="">Use payroll lane ({selectedTemplate.title})</option>
                            {streamScheduleTemplates.map((template) => (
                              <option key={template.id} value={template.id}>
                                {template.title}
                              </option>
                            ))}
                          </select>
                          {errors[`row-${index}-template`] && (
                            <p className="mt-1 text-sm text-primary">{errors[`row-${index}-template`]}</p>
                          )}
                        </div>
                        <Input
                          label="Start date"
                          type="date"
                          value={row.startDate}
                          onChange={(event) => updateRow(row.id, 'startDate', event.target.value)}
                          error={errors[`row-${index}-startDate`]}
                        />
                        <Input
                          label="Duration (days)"
                          type="number"
                          min="1"
                          value={row.durationDays}
                          onChange={(event) => updateRow(row.id, 'durationDays', event.target.value)}
                          error={errors[`row-${index}-duration`]}
                          placeholder={resolvedRow.usesTemplateOverride ? resolvedRow.template.duration : durationDays}
                        />
                        {resolvedRow.template.streamType === 'LINEAR' && (
                          <Input
                            label="Cliff days"
                            type="number"
                            min="0"
                            value={row.cliffDays}
                            onChange={(event) => updateRow(row.id, 'cliffDays', event.target.value)}
                            error={errors[`row-${index}-cliff`]}
                            placeholder={String(resolvedRow.usesTemplateOverride ? resolvedRow.template.cliffDays : cliffDays)}
                          />
                        )}
                        {(resolvedRow.template.streamType === 'RECURRING' || resolvedRow.template.streamType === 'STEP') && (
                          <Input
                            label={resolvedRow.template.streamType === 'RECURRING' ? 'Cadence (days)' : 'Milestone cadence (days)'}
                            type="number"
                            min="1"
                            value={row.intervalDays}
                            onChange={(event) => updateRow(row.id, 'intervalDays', event.target.value)}
                            error={errors[`row-${index}-interval`]}
                            placeholder={String(
                              resolvedRow.usesTemplateOverride
                                ? (resolvedRow.template.streamType === 'RECURRING'
                                    ? resolvedRow.template.recurringIntervalDays || ''
                                    : resolvedRow.template.stepIntervalDays || '')
                                : intervalDays,
                            )}
                          />
                        )}
                        {resolvedRow.template.streamType === 'HYBRID' && (
                          <>
                            <Input
                              label="Upfront unlock day"
                              type="number"
                              min="1"
                              value={row.hybridUnlockDays}
                              onChange={(event) => updateRow(row.id, 'hybridUnlockDays', event.target.value)}
                              error={errors[`row-${index}-hybridUnlockDays`]}
                              placeholder={String(
                                resolvedRow.usesTemplateOverride
                                  ? resolvedRow.template.hybridUnlockDays || ''
                                  : hybridUnlockDays,
                              )}
                            />
                            <Input
                              label="Upfront unlock percentage"
                              type="number"
                              min="1"
                              max="99"
                              step="0.01"
                              value={row.hybridUnlockPercent}
                              onChange={(event) => updateRow(row.id, 'hybridUnlockPercent', event.target.value)}
                              error={errors[`row-${index}-hybridUnlockPercent`]}
                              placeholder={String(
                                resolvedRow.usesTemplateOverride
                                  ? resolvedRow.template.hybridUnlockPercent || ''
                                  : hybridUnlockPercent,
                              )}
                            />
                          </>
                        )}
                        {resolvedRow.template.streamType === 'TRANCHE' && (
                          <>
                            <Input
                              label="Tranche offsets (days)"
                              value={row.trancheOffsetsDays}
                              onChange={(event) => updateRow(row.id, 'trancheOffsetsDays', event.target.value)}
                              error={errors[`row-${index}-trancheGeometry`]}
                              placeholder={(resolvedRow.trancheOffsetsDays || []).join('|')}
                            />
                            <Input
                              label="Tranche percentages"
                              value={row.tranchePercentages}
                              onChange={(event) => updateRow(row.id, 'tranchePercentages', event.target.value)}
                              error={errors[`row-${index}-trancheGeometry`]}
                              placeholder={(resolvedRow.tranchePercentages || []).join('|')}
                            />
                            <div className="md:col-span-2 xl:col-span-4 rounded-2xl border border-border bg-surfaceAlt px-4 py-3">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-textMuted font-mono mb-2">
                                Tranche override format
                              </p>
                              <p className="text-xs text-textSecondary">
                                Use <span className="font-mono text-textPrimary">|</span> separated values, for example{' '}
                                <span className="font-mono text-textPrimary">30|120|210|300</span> and{' '}
                                <span className="font-mono text-textPrimary">20|20|25|35</span>. Leave both fields empty to inherit the template geometry.
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>

              {errors.rows && (
                <div className="mt-4 rounded-2xl border border-primary bg-primarySoft px-4 py-3 text-sm text-textPrimary">
                  {errors.rows}
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-5 md:p-6">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">Preview</p>
                  <h2 className="font-display text-2xl text-textPrimary">Lane economics</h2>
                </div>
                <div className="px-3 py-1.5 rounded-full bg-surfaceAlt text-textSecondary text-xs font-mono">
                  {selectedTemplate.contractFamily}
                </div>
              </div>

              <div className="rounded-[28px] border border-border bg-[radial-gradient(circle_at_top_left,var(--color-primary-soft),transparent_55%),var(--color-surface)] p-4 md:p-5 mb-5">
                <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">
                  {selectedTemplate.eyebrow}
                </p>
                <h3 className="font-display text-2xl sm:text-3xl text-textPrimary mb-2">{selectedTemplate.title}</h3>
                <p className="text-textSecondary mb-4">{selectedTemplate.description}</p>
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                    <p className="text-textMuted mb-1">Stream count</p>
                    <p className="font-display text-xl text-textPrimary">{validRows.length}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                    <p className="text-textMuted mb-1">Batch value</p>
                    <p className="font-display text-xl text-textPrimary">{formatAssetAmount(totalBatchAmount, tokenType)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surfaceAlt p-4">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div>
                    <p className="text-sm font-medium text-textPrimary">Shared lane default</p>
                    <p className="text-xs text-textSecondary">
                      Representative curve for rows that inherit the payroll lane.
                    </p>
                  </div>
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <StreamScheduleChart
                  shape={selectedTemplate.streamType}
                  points={chartPoints}
                  title={selectedTemplate.title}
                  subtitle={[
                    'Shared lane default',
                    selectedTemplate.streamType === 'RECURRING'
                      ? `${intervalDaysValue || 0} day cadence`
                      : selectedTemplate.streamType === 'HYBRID'
                        ? `${hybridUnlockPercent || 0}% unlock on day ${hybridUnlockDays || 0}`
                      : selectedTemplate.streamType === 'TRANCHE'
                        ? `${selectedTemplate.trancheOffsetsDays?.length || 0} unlock checkpoints`
                        : `${durationDaysValue || 0} day horizon`,
                  ].join(' • ')}
                />
                {overrideRowCount > 0 && (
                  <p className="mt-3 text-xs text-textSecondary">
                    Some rows diverge from this shared lane preview.
                  </p>
                )}
              </div>
            </Card>

            <Card className="p-5 md:p-6">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">Run summary</p>
                  <h2 className="font-display text-2xl text-textPrimary">Funding snapshot</h2>
                </div>
                <Users className="w-5 h-5 text-primary" />
              </div>

              <div className="space-y-3">
                {[
                  ['Treasury', selectedVaultId || 'Select a vault'],
                  ['Asset lane', tokenType === 'BCH' ? 'BCH' : 'CashToken'],
                  ['Schedule template', selectedTemplate.title],
                  ['Unlock model', selectedTemplate.streamType === 'HYBRID'
                    ? `${hybridUnlockPercent || 0}% upfront on day ${hybridUnlockDays || 0}`
                    : selectedTemplate.streamType === 'TRANCHE'
                      ? `${selectedTemplate.trancheOffsetsDays?.length || 0} checkpoint geometry`
                      : selectedTemplate.streamType === 'RECURRING'
                        ? `${intervalDaysValue || 0} day recurring cadence`
                        : selectedTemplate.streamType === 'STEP'
                          ? `${intervalDaysValue || 0} day milestone cadence`
                          : cliffDaysValue > 0
                            ? `Continuous vesting after ${cliffDaysValue}-day cliff`
                            : 'Continuous vesting'],
                  ['Row overrides', overrideRowCount > 0 ? `${overrideRowCount} customized rows` : 'Lane defaults only'],
                  ['Cancelable', cancelable ? 'Enabled' : 'Disabled'],
                  ['Refillable', selectedTemplate.streamType === 'RECURRING' ? (refillable ? 'Enabled' : 'Disabled') : 'Not applicable'],
                  ['Funding model', tokenType === 'BCH' ? 'One multi-output treasury transaction' : 'One token transaction plus preserved mint authority output'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surfaceAlt px-4 py-3">
                    <p className="text-sm text-textSecondary">{label}</p>
                    <p className="text-sm text-textPrimary font-medium text-right">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-border bg-surfaceAlt px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">Operational note</p>
                <p className="text-sm text-textSecondary">
                  Each stream in the run is deployed with its own covenant state UTXO, but the treasury signs only once for the funding leg. CashToken lanes additionally require mint authority so the batch can mint the mutable state NFTs safely.
                </p>
              </div>
            </Card>

            {batchError && (
              <Card className="p-5 border border-primary">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-textPrimary mb-1">Batch creation failed</p>
                    <p className="text-sm text-textSecondary">{batchError}</p>
                  </div>
                </div>
              </Card>
            )}

            {completedTx && (
              <Card className="p-5 md:p-6 border border-primary">
                <div className="flex items-start gap-3 mb-4">
                  <CheckCircle2 className="w-6 h-6 text-primary mt-0.5" />
                  <div>
                    <p className="font-display text-2xl text-textPrimary mb-1">Batch funded successfully</p>
                    <p className="text-textSecondary">
                      {completedCount} streams were activated from one treasury transaction.
                    </p>
                  </div>
                </div>
                <a
                  href={getExplorerTxUrl(completedTx)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:text-primaryHover font-medium"
                >
                  View batch transaction
                  <ExternalLink className="w-4 h-4" />
                </a>
                <div className="mt-4 flex flex-wrap gap-3">
                  {selectedVaultId && (
                    <Button variant="outline" onClick={() => navigate(`/vaults/${selectedVaultId}?tab=streams`)}>
                      Open Treasury Streams
                    </Button>
                  )}
                  {daoContext && (
                    <Button variant="outline" onClick={() => navigate('/app/dao')}>
                      Return to Organization Workspace
                    </Button>
                  )}
                </div>
              </Card>
            )}

            <Card className="p-5 md:p-6">
              <Button
                className="w-full"
                size="lg"
                loading={isSubmitting}
                onClick={handleSubmit}
                disabled={!validRows.length || isSubmitting}
              >
                <FileSpreadsheet className="w-5 h-5 mr-2" />
                Build and fund batch streams
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
