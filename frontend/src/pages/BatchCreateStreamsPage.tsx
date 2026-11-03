import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Papa from 'papaparse';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { TwoColumn } from '../components/layout/TwoColumn';
import { Address } from '../components/ui/Address';
import { Amount } from '../components/ui/Amount';
import { AmountInput } from '../components/ui/AmountInput';
import { AddressInput, CheckedCodeInput } from '../components/ui/AddressInput';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DateInput, TIME_ZONE_LINE } from '../components/ui/DateInput';
import { DetailList } from '../components/ui/DetailList';
import { ErrorSummary } from '../components/ui/ErrorSummary';
import { FileImport } from '../components/ui/FileImport';
import { Heading } from '../components/ui/Heading';
import { Input } from '../components/ui/Input';
import { InsetBlock } from '../components/ui/InsetBlock';
import { List } from '../components/ui/List';
import { Notice } from '../components/ui/Notice';
import { Panel } from '../components/ui/Panel';
import { RepeatableRows } from '../components/ui/RepeatableRows';
import { ScheduleTimeline } from '../components/ui/ScheduleTimeline';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Select } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import { Steps } from '../components/ui/Steps';
import { TransactionReview, type TxStep } from '../components/ui/TransactionReview';
import { useWallet } from '../hooks/useWallet';
import { useNetwork } from '../hooks/useNetwork';
import { fundBatchStreamContracts } from '../utils/blockchain';
import { ORG_LAUNCH_SOURCE, rememberDaoLaunchContext, type DaoLaunchContext } from '../utils/daoStreamLaunch';
import {
  DAY_SECONDS,
  DEFAULT_SCHEDULE,
  SCHEDULE_CHOICE_WORDS,
  SCHEDULE_FIELD_ID,
  SCHEDULE_FIELD_LABEL,
  evenSplitProblem,
  getStreamScheduleTemplateById,
  matchedTemplateId,
  nextRowId,
  parseUnits,
  planReleases,
  regularAddressProblem,
  scheduleFromTemplate,
  scheduleShape,
  splitByShares,
  unitsToDisplay,
  validateSchedule,
  type ScheduleDraft,
  type ScheduleErrors,
  type ScheduleField,
} from '../utils/streamShapes';
import { confirmToken, tokenIdCheck, useTokenChoice } from '../utils/tokenField';
import { ACTIONS, BUSY, LABELS, backTo } from '../copy/common';
import { CodedError, asFlowError } from '../copy/errors';
import { formatAddress, formatAmount, formatDate, toDate } from '../copy/format';
import { NETWORK_LABEL } from '../copy/network';
import { ORG_LAUNCH } from '../copy/organization';
import {
  BACK,
  BATCH,
  BATCH_HEADER,
  FIELD_ERRORS,
  LEAVE,
  REVIEW_ROWS,
  SIDE,
  STEP_LABELS,
  SUMMARY,
  WHO,
} from '../copy/streamCreate';
import { ScheduleFields } from './CreateStreamPage';

type StepKey = 'who' | 'when' | 'check';
type EntryMode = 'type' | 'import';

type BatchRow = { id: string; address: string; amount: string; note: string };

type BatchDraft = {
  step: StepKey;
  entry: EntryMode;
  vaultChoice: string;
  payWith: 'bch' | 'token';
  tokenId: string;
  startDate: string;
  rows: BatchRow[];
  schedule: ScheduleDraft;
};

type RowErrors = Record<string, { address?: string; amount?: string }>;

interface VaultOption {
  id: string;
  vault_id?: string;
  vaultId?: string;
  name?: string | null;
  role?: string;
}

interface LocationState {
  importedData?: Array<Record<string, string | number>>;
  preferredTemplateId?: string;
  daoContext?: DaoLaunchContext;
}

type ImportProblem = { line: number; key: string; message: string };

const MAX_PEOPLE = 100;

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'who', label: STEP_LABELS.who },
  { key: 'when', label: STEP_LABELS.when },
  { key: 'check', label: STEP_LABELS.checkApprove },
];

const SCHEDULE_COLUMNS = [
  'scheduleTemplate',
  'schedule_template',
  'startDate',
  'start_date',
  'durationDays',
  'duration_days',
  'intervalDays',
  'interval_days',
  'cliffDays',
  'cliff_days',
  'hybridUnlockDays',
  'hybridUnlockPercent',
  'trancheOffsetsDays',
  'tranchePercentages',
];

const VAULT_FIELD_ID = 'batch-vault';
const START_FIELD_ID = 'batch-start';
const TOKEN_FIELD_ID = 'batch-token-id';

function blankRow(): BatchRow {
  return { id: nextRowId('person'), address: '', amount: '', note: '' };
}

function isBlank(row: BatchRow): boolean {
  return !row.address.trim() && !row.amount.trim() && !row.note.trim();
}

function localDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return localDateString(date);
}

function cell(row: Record<string, string | number>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

/** Rows from parsed records, each with its line in the file (the header is line 1). */
function linedRowsFromRecords(records: Array<Record<string, string | number>>): { row: BatchRow; line: number }[] {
  return records
    .map((record, index) => ({
      line: index + 2,
      row: {
        id: nextRowId('person'),
        address: cell(record, ['recipient', 'address']),
        amount: cell(record, ['amount', 'totalAmount']),
        note: cell(record, ['note', 'description', 'label']),
      },
    }))
    .filter(({ row }) => !isBlank(row));
}

function rowsFromRecords(records: Array<Record<string, string | number>>): BatchRow[] {
  return linedRowsFromRecords(records).map(({ row }) => row);
}

function draftKey(vaultId: string | undefined): string {
  return `flowguard.batch-create.v1:${vaultId ?? 'personal'}`;
}

function readDraft(key: string): BatchDraft | null {
  try {
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || !('rows' in parsed) || !('schedule' in parsed)) return null;
    const draft = parsed as BatchDraft;
    return {
      ...draft,
      payWith: draft.payWith === 'token' ? 'token' : 'bch',
      tokenId: typeof draft.tokenId === 'string' ? draft.tokenId : '',
      schedule: { ...DEFAULT_SCHEDULE, ...draft.schedule },
    };
  } catch (error) {
    console.warn('Ignoring an unreadable batch draft in session storage.', error);
    return null;
  }
}

function writeDraft(key: string, draft: BatchDraft | null): void {
  try {
    if (draft) window.sessionStorage.setItem(key, JSON.stringify(draft));
    else window.sessionStorage.removeItem(key);
  } catch (error) {
    console.warn('Could not save the batch draft in session storage.', error);
  }
}

function initialDraft(key: string, state: LocationState | null): BatchDraft {
  const fresh: BatchDraft = {
    step: 'who',
    entry: 'type',
    vaultChoice: '',
    payWith: 'bch',
    tokenId: '',
    startDate: tomorrow(),
    rows: [blankRow()],
    schedule: { ...DEFAULT_SCHEDULE, choice: 'same' },
  };
  const imported = state?.importedData ? rowsFromRecords(state.importedData).slice(0, MAX_PEOPLE) : [];
  const base = imported.length > 0 ? { ...fresh, rows: imported } : readDraft(key) ?? fresh;
  const template = getStreamScheduleTemplateById(state?.preferredTemplateId);
  return template ? { ...base, schedule: scheduleFromTemplate(template, base.schedule) } : base;
}

function sampleCsv(): string {
  const [first, second] = BATCH.sampleNames;
  const rows = [
    ['address', 'amount', 'note'],
    [BATCH.sampleAddress(first), '1.2', BATCH.sampleNote],
    [BATCH.sampleAddress(second), '0.9', BATCH.sampleNoteTwo],
  ];
  return `data:text/csv;charset=utf-8,${encodeURIComponent(Papa.unparse(rows))}`;
}

function parseCsv(file: File): Promise<Array<Record<string, string | number>>> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string | number>>(file, {
      header: true,
      skipEmptyLines: false,
      complete: (results) => resolve(results.data),
      error: (error) => reject(error),
    });
  });
}

export default function BatchCreateStreamsPage() {
  const { id: vaultIdFromRoute } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const wallet = useWallet();
  const network = useNetwork();
  const launchState = location.state as LocationState | null;
  const daoContext = launchState?.daoContext ?? null;
  const storageKey = draftKey(vaultIdFromRoute);

  const [draft, setDraft] = useState<BatchDraft>(() => initialDraft(storageKey, launchState));
  const [rowErrors, setRowErrors] = useState<RowErrors>({});
  const [vaultError, setVaultError] = useState<string | undefined>();
  const [tokenError, setTokenError] = useState<string | undefined>();
  const [checking, setChecking] = useState(false);
  const [startError, setStartError] = useState<string | undefined>();
  const [scheduleErrors, setScheduleErrors] = useState<ScheduleErrors>({});
  const [showSummary, setShowSummary] = useState(false);
  const [vaults, setVaults] = useState<VaultOption[] | null>(null);
  const [routeVault, setRouteVault] = useState<{ key: string; name: string | null } | null>(null);
  const [pendingImport, setPendingImport] = useState<BatchRow[] | null>(null);
  const replaceAnswer = useRef<((replace: boolean) => void) | null>(null);
  const [importNote, setImportNote] = useState<{ count: number; scheduleColumns: boolean } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [completed, setCompleted] = useState<{ txid?: string; count: number; synced: boolean } | null>(null);
  const [leaving, setLeaving] = useState(false);

  const filledRows = draft.rows.filter((row) => !isBlank(row));
  const token = draft.payWith === 'token';
  const tokenId = token ? draft.tokenId.trim() : '';
  const tokenChoice = useTokenChoice(token, draft.tokenId, network);
  const asset = tokenChoice.asset;
  const decimals = tokenChoice.decimals;
  const shape = scheduleShape(draft.schedule, token, false);
  const paymentCount = shape.streamType === 'RECURRING' && shape.intervalDays > 0 ? Math.floor(shape.durationDays / shape.intervalDays) : 0;
  const startDate = toDate(draft.startDate);
  const startTimestamp = startDate ? Math.floor(startDate.getTime() / 1000) : NaN;
  const previewStart = Number.isFinite(startTimestamp) ? startTimestamp : Math.floor(Date.now() / 1000);
  const totalUnits = filledRows.reduce((sum, row) => {
    const units = parseUnits(row.amount, decimals);
    return units !== null ? sum + units : sum;
  }, 0n);
  const totalText = formatAmount(totalUnits, asset);
  const unevenSplit =
    draft.step !== 'who' &&
    paymentCount > 0 &&
    filledRows.some((row) => evenSplitProblem(parseUnits(row.amount, decimals), paymentCount, asset, decimals) !== null);
  const releases = totalUnits > 0n && !unevenSplit ? planReleases(shape, totalUnits, previewStart) : [];
  const openEnded = shape.streamType === 'RECURRING' && draft.schedule.refillable;
  const listedVault = vaultIdFromRoute
    ? routeVault
    : (() => {
        const match = (vaults ?? []).find((vault) => (vault.vault_id || vault.vaultId || vault.id) === draft.vaultChoice);
        return match ? { key: draft.vaultChoice, name: match.name ?? null } : null;
      })();
  const vaultName = listedVault?.name ?? null;
  const locked = completed !== null;

  const back = vaultIdFromRoute
    ? { to: `/vaults/${vaultIdFromRoute}`, label: backTo(vaultName ?? BACK.vault) }
    : daoContext?.source === ORG_LAUNCH_SOURCE
      ? { to: '/app/dao/streams', label: backTo(BACK.vaultStreams) }
      : { to: '/streams', label: backTo(BACK.streams) };

  useEffect(() => {
    if (!locked) writeDraft(storageKey, draft);
  }, [storageKey, draft, locked]);

  useEffect(() => {
    if (daoContext) rememberDaoLaunchContext(daoContext);
  }, [daoContext]);

  useEffect(() => {
    if (!wallet.address || !vaultIdFromRoute) return;
    let ignore = false;
    fetch(`/api/vaults/${vaultIdFromRoute}`, { headers: { 'x-user-address': wallet.address } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { vaultId?: string; vault_id?: string; name?: string | null } | null) => {
        if (ignore) return;
        setRouteVault({ key: data?.vaultId || data?.vault_id || vaultIdFromRoute, name: data?.name ?? null });
      })
      .catch((error: unknown) => {
        console.error('Vault for the batch form did not load:', error);
        if (!ignore) setRouteVault({ key: vaultIdFromRoute, name: null });
      });
    return () => {
      ignore = true;
    };
  }, [vaultIdFromRoute, wallet.address]);

  useEffect(() => {
    if (!wallet.address || vaultIdFromRoute) return;
    let ignore = false;
    fetch('/api/vaults', { headers: { 'x-user-address': wallet.address } })
      .then((response) => response.json())
      .then((data: { all?: VaultOption[] }) => {
        if (!ignore) setVaults((data.all ?? []).filter((vault) => vault.role !== 'viewer'));
      })
      .catch((error: unknown) => {
        console.error('Vaults for the batch form did not load:', error);
        if (!ignore) setVaults([]);
      });
    return () => {
      ignore = true;
    };
  }, [vaultIdFromRoute, wallet.address]);

  const update = (patch: Partial<BatchDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const updateRows = (rows: BatchRow[]) => {
    setRowErrors((current) => {
      const next: RowErrors = {};
      for (const row of rows) {
        const before = draft.rows.find((candidate) => candidate.id === row.id);
        const kept = current[row.id];
        if (!kept || !before) continue;
        next[row.id] = {
          address: before.address === row.address ? kept.address : undefined,
          amount: before.amount === row.amount ? kept.amount : undefined,
        };
      }
      return next;
    });
    update({ rows });
  };

  const goTo = (step: StepKey) => {
    setShowSummary(false);
    update({ step });
    window.scrollTo({ top: 0 });
  };

  const checkRows = (withSplit: boolean): RowErrors => {
    const errors: RowErrors = {};
    for (const row of filledRows) {
      const address = regularAddressProblem(row.address, network) ?? undefined;
      let amount: string | undefined;
      const units = parseUnits(row.amount, decimals);
      if (!row.amount.trim() || !(Number(row.amount) > 0)) amount = FIELD_ERRORS.amountMissing;
      else if (units === null && !tokenChoice.pending) amount = token ? FIELD_ERRORS.amountTokenDecimals(decimals) : FIELD_ERRORS.amountBchDecimals;
      else if (units === null) amount = undefined;
      else if (withSplit && paymentCount > 0) amount = evenSplitProblem(units, paymentCount, asset, decimals)?.message;
      if (address || amount) errors[row.id] = { address, amount };
    }
    return errors;
  };

  const vaultKey = vaultIdFromRoute ? routeVault?.key ?? vaultIdFromRoute : draft.vaultChoice;

  const tokenIdProblem = (): string | undefined => {
    if (!token) return undefined;
    if (!tokenId) return FIELD_ERRORS.tokenMissing;
    const check = tokenIdCheck(tokenId);
    return check.ok ? undefined : check.message;
  };

  const continueFromWho = async () => {
    const errors = checkRows(false);
    const missingVault = !vaultKey ? FIELD_ERRORS.vaultMissing : undefined;
    const badToken = tokenIdProblem();
    setRowErrors(errors);
    setVaultError(missingVault);
    setTokenError(badToken);
    if (missingVault || badToken || filledRows.length === 0 || Object.keys(errors).length > 0) {
      setShowSummary(true);
      return;
    }
    if (token) {
      setChecking(true);
      try {
        const result = await confirmToken(tokenId, '', network);
        if (!result.ok) {
          setTokenError(result.message);
          setShowSummary(true);
          return;
        }
        const tooPrecise = filledRows.find((row) => parseUnits(row.amount, result.decimals) === null);
        if (tooPrecise) {
          setRowErrors({ [tooPrecise.id]: { amount: FIELD_ERRORS.amountTokenDecimals(result.decimals) } });
          setShowSummary(true);
          return;
        }
      } finally {
        setChecking(false);
      }
    }
    goTo('when');
  };

  const continueFromWhen = () => {
    const errors = validateSchedule(draft.schedule, token, false);
    const today = localDateString(new Date());
    const dateProblem = !startDate || draft.startDate < today ? FIELD_ERRORS.startDate : undefined;
    setScheduleErrors(errors);
    setStartError(dateProblem);
    if (dateProblem || Object.keys(errors).length > 0) {
      setShowSummary(true);
      return;
    }
    setRowErrors(checkRows(true));
    goTo('check');
  };

  const openReview = () => {
    const errors = checkRows(true);
    setRowErrors(errors);
    if (Object.keys(errors).length > 0 || filledRows.length === 0) {
      setShowSummary(true);
      return;
    }
    setReviewOpen(true);
  };

  const buildPayload = () => {
    const type = shape.streamType;
    const cliffDays = type === 'LINEAR' ? shape.waitDays : 0;
    return {
      senderAddress: wallet.address ?? '',
      tokenType: token ? ('FUNGIBLE_TOKEN' as const) : ('BCH' as const),
      tokenCategory: token ? tokenId : undefined,
      tokenDecimals: token ? decimals : 0,
      launchContext: daoContext || undefined,
      entries: filledRows.map((row) => {
        const endTime = startTimestamp + shape.durationDays * DAY_SECONDS;
        const units = parseUnits(row.amount, decimals) ?? 0n;
        const base = {
          recipient: row.address.trim(),
          totalAmount: Number(row.amount),
          description: row.note.trim() || null,
          streamType: type,
          startTime: startTimestamp,
          endTime,
          cliffTimestamp: cliffDays > 0 ? startTimestamp + cliffDays * DAY_SECONDS : null,
          cancelable: draft.schedule.cancelable,
          transferable: type !== 'RECURRING' && draft.schedule.transferable,
          refillable: type === 'RECURRING' && draft.schedule.refillable,
          scheduleTemplate: matchedTemplateId(draft.schedule, shape),
        };
        if (type === 'RECURRING' || type === 'STEP') return { ...base, intervalSeconds: shape.intervalDays * DAY_SECONDS };
        if (type === 'TRANCHE') {
          const parts = splitByShares(units, shape.custom.map((release) => release.share));
          return {
            ...base,
            trancheSchedule: shape.custom.map((release, index) => ({
              unlockTime: startTimestamp + release.day * DAY_SECONDS,
              amount: Number(unitsToDisplay(parts[index] ?? 0n, decimals)),
              percentage: release.share,
            })),
          };
        }
        if (type === 'HYBRID') {
          return {
            ...base,
            hybridUnlockTimestamp: startTimestamp + shape.upfrontDays * DAY_SECONDS,
            hybridUpfrontPercentage: shape.upfrontPercent,
          };
        }
        return base;
      }),
    };
  };

  const fund = async (report: (step: TxStep) => void): Promise<{ txid?: string }> => {
    const payload = buildPayload();
    const people = filledRows;
    try {
      const result = await fundBatchStreamContracts(wallet, vaultKey, payload);
      report({ step: 'wallet', index: 1, of: 1, status: 'done' });
      report({ step: 'network', status: 'done' });
      writeDraft(storageKey, null);
      setCompleted({ txid: result.txId, count: result.streamIds.length || people.length, synced: true });
      return { txid: result.txId };
    } catch (error) {
      const flow = asFlowError(error);
      if (flow.txid || flow.code === 'SENT_NOT_SYNCED') {
        writeDraft(storageKey, null);
        setCompleted({ txid: flow.txid, count: people.length, synced: false });
        throw error;
      }
      const entry = /entry\s+(\d+)/i.exec(flow.details ?? '');
      const position = entry ? Number(entry[1]) : 0;
      const person = people[position - 1];
      if (person) {
        throw new CodedError({ ...flow, message: BATCH.lineRefused(position, formatAddress(person.address, 'short')) });
      }
      throw error;
    }
  };

  const importFile = async (file: File): Promise<{ rows: BatchRow[]; problems: ImportProblem[] }> => {
    const records = await parseCsv(file);
    const all = linedRowsFromRecords(records);
    const kept = all.slice(0, MAX_PEOPLE);
    const rows = kept.map(({ row }) => row);
    const problems: ImportProblem[] = [];
    kept.forEach(({ row, line }) => {
      if (regularAddressProblem(row.address, network)) problems.push({ line, key: `${line}-address`, message: BATCH.problemAddress });
      const units = parseUnits(row.amount, decimals);
      if (!(Number(row.amount) > 0)) problems.push({ line, key: `${line}-amount`, message: BATCH.problemAmount });
      else if (units === null) problems.push({ line, key: `${line}-amount`, message: BATCH.problemTooPrecise });
    });
    const firstLeftOut = all[MAX_PEOPLE];
    if (firstLeftOut) problems.push({ line: firstLeftOut.line, key: 'over-limit', message: BATCH.overLimit });
    const scheduleColumns = records.some((record) => SCHEDULE_COLUMNS.some((column) => cell(record, [column])));
    setImportNote({ count: rows.length, scheduleColumns });
    return { rows, problems };
  };

  const confirmReplace = (rows: BatchRow[]): boolean | Promise<boolean> => {
    if (rows.length === 0 || filledRows.length === 0) return true;
    setPendingImport(rows);
    return new Promise<boolean>((resolve) => {
      replaceAnswer.current = resolve;
    });
  };

  const answerReplace = (replace: boolean) => {
    const answer = replaceAnswer.current;
    if (!answer) return;
    replaceAnswer.current = null;
    answer(replace);
    if (!replace) setImportNote(null);
    setPendingImport(null);
  };

  const receiveImport = (rows: BatchRow[]) => {
    if (rows.length === 0) return;
    setRowErrors({});
    update({ rows });
  };

  const dirty = filledRows.length > 0;
  const leave = () => {
    if (dirty) {
      setLeaving(true);
      return;
    }
    navigate(back.to);
  };

  const rowLine = (row: BatchRow) => filledRows.findIndex((candidate) => candidate.id === row.id) + 1;
  const rowFieldLinks = filledRows.flatMap((row) => {
    const problem = rowErrors[row.id];
    if (!problem) return [];
    const line = rowLine(row);
    return [
      ...(problem.address ? [{ id: `${row.id}-address`, label: BATCH.rowField(line, BATCH.addressLabel) }] : []),
      ...(problem.amount ? [{ id: `${row.id}-amount`, label: BATCH.rowField(line, BATCH.amountLabel) }] : []),
    ];
  });
  const whoLinks = [
    ...(vaultError ? [{ id: VAULT_FIELD_ID, label: BATCH.vaultLabel }] : []),
    ...(tokenError ? [{ id: TOKEN_FIELD_ID, label: WHO.tokenIdLabel }] : []),
    ...rowFieldLinks,
  ];
  const whenLinks = [
    ...(startError ? [{ id: START_FIELD_ID, label: BATCH.startLabel }] : []),
    ...(Object.keys(scheduleErrors) as ScheduleField[])
      .filter((field) => scheduleErrors[field])
      .map((field) => ({ id: SCHEDULE_FIELD_ID[field], label: SCHEDULE_FIELD_LABEL[field] })),
  ];

  const balanceUnits = wallet.balance && Number.isFinite(wallet.balance.sat) ? BigInt(Math.trunc(wallet.balance.sat)) : null;
  const balanceText = balanceUnits === null ? null : formatAmount(balanceUnits, { kind: 'bch' });
  const scheduleTitle = SCHEDULE_CHOICE_WORDS[draft.schedule.choice].title;
  const firstRelease = releases.find((release) => !release.waiting);
  const lastRelease = [...releases].reverse().find((release) => !release.waiting);

  const footer = (primary: React.ReactNode, onBack: (() => void) | null) => (
    <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
      {onBack ? (
        <Button variant="ghost" onClick={onBack}>
          {ACTIONS.back}
        </Button>
      ) : (
        <span />
      )}
      {primary}
    </div>
  );

  const vaultField = vaultIdFromRoute ? null : vaults === null ? (
    <Skeleton kind="text" lines={2} />
  ) : vaults.length === 0 ? (
    <Notice
      tone="info"
      title={BATCH.noVaultTitle}
      action={
        <div className="flex flex-wrap gap-2">
          <ButtonLink variant="secondary" size="sm" to="/vaults/create">
            {BATCH.createVault}
          </ButtonLink>
          <ButtonLink variant="ghost" size="sm" to="/streams/create">
            {BATCH.createStream}
          </ButtonLink>
        </div>
      }
    >
      {BATCH.noVaultBody}
    </Notice>
  ) : (
    <Select
      id={VAULT_FIELD_ID}
      label={BATCH.vaultLabel}
      value={draft.vaultChoice}
      onValueChange={(vaultChoice) => {
        setVaultError(undefined);
        update({ vaultChoice });
      }}
      helper={BATCH.vaultHelper}
      error={vaultError}
      options={[
        { value: '', label: BATCH.vaultPick },
        ...vaults.map((vault) => ({ value: vault.vault_id || vault.vaultId || vault.id, label: vault.name || BACK.vault })),
      ]}
    />
  );

  const typedList = (
    <div className="flex flex-col gap-2">
      <RepeatableRows
        legend={BATCH.peopleLegend}
        rows={draft.rows}
        onChange={updateRows}
        makeRow={blankRow}
        min={1}
        max={MAX_PEOPLE}
        addLabel={BATCH.addPerson}
        rowKey={(row) => row.id}
        renderRow={(row, _index, change) => (
          <>
            <AddressInput
              id={`${row.id}-address`}
              label={BATCH.addressLabel}
              value={row.address}
              onChange={(address) => change({ ...row, address })}
              network={network}
              accept="p2pkh"
              error={rowErrors[row.id]?.address}
            />
            <AmountInput
              id={`${row.id}-amount`}
              label={BATCH.amountLabel}
              asset={tokenChoice.inputAsset}
              value={row.amount}
              onChange={(amount) => change({ ...row, amount })}
              error={rowErrors[row.id]?.amount}
            />
            <Input
              label={BATCH.noteLabel}
              optional
              value={row.note}
              onChange={(event) => change({ ...row, note: event.target.value })}
            />
          </>
        )}
      />
      <p className="text-small text-ink-secondary">
        {draft.rows.length >= MAX_PEOPLE ? BATCH.full : BATCH.count(filledRows.length)}
      </p>
      <p className="text-small text-ink-secondary">{BATCH.noteHelper}</p>
    </div>
  );

  const importer = (
    <div className="flex flex-col gap-3">
      <FileImport
        label={BATCH.importLabel}
        accept=".csv"
        sampleHref={sampleCsv()}
        limits={BATCH.importLimits}
        parse={importFile}
        onRows={receiveImport}
        confirmReplace={confirmReplace}
      />
      {importNote && importNote.count > 0 && !pendingImport ? (
        <p className="text-small text-ink-secondary">{BATCH.imported(importNote.count)}</p>
      ) : null}
      {importNote?.scheduleColumns ? (
        <Notice tone="info" title={BATCH.scheduleColumnsTitle}>
          {BATCH.scheduleColumnsBody}
        </Notice>
      ) : null}
    </div>
  );

  const whoStep = (
    <Panel title={STEP_LABELS.who}>
      {vaultField}
      <div className="flex flex-col gap-1.5">
        <p className="text-label text-ink">{WHO.payWith}</p>
        <div>
          <SegmentedControl
            label={WHO.payWith}
            value={draft.payWith}
            onChange={(payWith) => {
              setTokenError(undefined);
              update({ payWith });
            }}
            options={[
              { value: 'bch', label: WHO.payBch },
              { value: 'token', label: WHO.payToken },
            ]}
          />
        </div>
      </div>
      {token ? (
        <>
          <CheckedCodeInput
            id={TOKEN_FIELD_ID}
            label={WHO.tokenIdLabel}
            value={draft.tokenId}
            onChange={(value) => {
              setTokenError(undefined);
              update({ tokenId: value });
            }}
            check={tokenIdCheck}
            validLabel={WHO.tokenIdValid}
            pasteLabel={WHO.tokenIdPaste}
            helper={tokenChoice.helper}
            error={tokenError}
          />
          <Notice tone="info" title={BATCH.tokenNoteTitle}>
            {BATCH.tokenNoteBody}
          </Notice>
        </>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <p className="text-label text-ink">{BATCH.entryLabel}</p>
        <div>
          <SegmentedControl
            label={BATCH.entryLabel}
            value={draft.entry}
            onChange={(entry) => update({ entry })}
            options={[
              { value: 'type', label: BATCH.typeList },
              { value: 'import', label: BATCH.importCsv },
            ]}
          />
        </div>
        <p className="text-small text-ink-secondary">{BATCH.limits}</p>
      </div>
      {draft.entry === 'type' ? typedList : importer}
      {showSummary && (whoLinks.length > 0 || filledRows.length === 0) ? (
        <ErrorSummary
          title={SUMMARY.stepTitle}
          message={filledRows.length === 0 ? BATCH.noPeople : SUMMARY.stepMessage}
          fields={whoLinks}
        />
      ) : null}
      {footer(
        <Button variant="primary" onClick={() => void continueFromWho()} busy={checking} busyLabel={BUSY.checking}>
          {ACTIONS.continue}
        </Button>,
        leave,
      )}
    </Panel>
  );

  const whenStep = (
    <Panel title={STEP_LABELS.when}>
      <DateInput
        id={START_FIELD_ID}
        label={BATCH.startLabel}
        value={draft.startDate}
        min={localDateString(new Date())}
        onChange={(startDateValue) => {
          setStartError(undefined);
          update({ startDate: startDateValue });
        }}
        error={startError}
        helper={
          startDate ? `${BATCH.startHelper(formatDate(startDate) ?? draft.startDate)} ${TIME_ZONE_LINE}.` : TIME_ZONE_LINE
        }
      />
      <ScheduleFields
        draft={draft.schedule}
        onChange={(schedule) => {
          setScheduleErrors({});
          update({ schedule });
        }}
        token={token}
        allowDelay={false}
        many
        errors={scheduleErrors}
        start={previewStart}
        asset={asset}
        total={null}
        recipientName={BATCH.eachPerson}
        split={null}
      />
      {showSummary && whenLinks.length > 0 ? (
        <ErrorSummary title={SUMMARY.stepTitle} message={SUMMARY.stepMessage} fields={whenLinks} />
      ) : null}
      {footer(
        <Button variant="primary" onClick={continueFromWhen}>
          {ACTIONS.continue}
        </Button>,
        () => goTo('who'),
      )}
    </Panel>
  );

  const checkProblems = draft.step === 'check' ? checkRows(true) : rowErrors;
  const orderedRows = [...filledRows].sort((a, b) => Number(Boolean(checkProblems[b.id])) - Number(Boolean(checkProblems[a.id])));
  const problemCount = Object.keys(checkProblems).filter((id) => filledRows.some((row) => row.id === id)).length;

  const checkStep = (
    <Panel title={STEP_LABELS.checkApprove}>
      <InsetBlock>
        <DetailList
          items={[
            { label: REVIEW_ROWS.people, value: BATCH.peopleCount(filledRows.length) },
            { label: REVIEW_ROWS.total, value: totalUnits > 0n ? <Amount value={unitsToDisplay(totalUnits, decimals)} asset={asset} /> : null },
            { label: BATCH.eachGets, value: BATCH.eachGetsValue },
            { label: REVIEW_ROWS.schedule, value: scheduleTitle },
            { label: REVIEW_ROWS.starts, value: startDate ? formatDate(startDate) : null },
            { label: REVIEW_ROWS.firstRelease, value: firstRelease ? formatDate(firstRelease.at) : null },
            { label: REVIEW_ROWS.ends, value: openEnded ? SIDE.noEnd : lastRelease ? formatDate(lastRelease.at) : null },
            { label: REVIEW_ROWS.pauseCancel, value: draft.schedule.cancelable ? REVIEW_ROWS.canPause : REVIEW_ROWS.cantPause },
            { label: REVIEW_ROWS.listedUnder, value: vaultName ?? BACK.vault },
            { label: REVIEW_ROWS.paidFrom, value: LABELS.yourWallet },
            { label: LABELS.network, value: NETWORK_LABEL[network] },
          ]}
        />
      </InsetBlock>
      <List
        label={BATCH.listLabel}
        columns={[
          { key: 'line', header: BATCH.lineHeader, cell: (row: BatchRow) => BATCH.rowLabel(rowLine(row)), primary: true },
          { key: 'address', header: BATCH.addressHeader, cell: (row: BatchRow) => <Address value={row.address.trim()} /> },
          {
            key: 'amount',
            header: BATCH.amountHeader,
            align: 'end',
            cell: (row: BatchRow) =>
              parseUnits(row.amount, decimals) !== null ? <Amount value={row.amount.trim()} asset={asset} /> : row.amount,
          },
          {
            key: 'check',
            header: BATCH.checkHeader,
            cell: (row: BatchRow) => {
              const problem = checkProblems[row.id];
              return problem ? (
                <span className="text-danger-ink">{problem.address ?? problem.amount}</span>
              ) : (
                BATCH.rowOk
              );
            },
          },
        ]}
        rows={orderedRows}
        rowKey={(row) => row.id}
        state={orderedRows.length > 0 ? 'ready' : 'empty'}
        empty={<p className="p-4 text-small text-ink-secondary">{BATCH.noneYet}</p>}
        noResults={null}
        error={null}
      />
      {completed ? (
        completed.synced ? (
          <Notice tone="success" title={BATCH.lockedTitle}>
            {BATCH.done(completed.count)} {BATCH.lockedBody}
          </Notice>
        ) : (
          <Notice tone="warning" title={BATCH.lockedNotSyncedTitle}>
            {BATCH.lockedNotSyncedBody} {BATCH.lockedBody}
          </Notice>
        )
      ) : null}
      {!completed && showSummary && (problemCount > 0 || filledRows.length === 0) ? (
        <ErrorSummary
          title={SUMMARY.fundTitle}
          message={filledRows.length === 0 ? BATCH.noPeople : SUMMARY.stepMessage}
        />
      ) : null}
      {completed ? (
        <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <ButtonLink variant="secondary" to={vaultIdFromRoute ? `/vaults/${vaultIdFromRoute}` : '/streams'}>
            {vaultIdFromRoute ? BATCH.backToVault(vaultName ?? BACK.vault) : BATCH.viewStreams}
          </ButtonLink>
          <ButtonLink variant="primary" to="/streams/batches">
            {BATCH.goToBatch}
          </ButtonLink>
        </div>
      ) : (
        footer(
          filledRows.length === 0 ? (
            <Button variant="primary" disabled disabledReason={BATCH.fundReason}>
              {BATCH.fund(0)}
            </Button>
          ) : problemCount > 0 ? (
            <Button variant="primary" disabled disabledReason={BATCH.fixReason}>
              {BATCH.fund(filledRows.length)}
            </Button>
          ) : (
            <Button variant="primary" onClick={openReview}>
              {BATCH.fund(filledRows.length)}
            </Button>
          ),
          () => goTo('when'),
        )
      )}
    </Panel>
  );

  const step = locked ? 'check' : draft.step;

  return (
    <PageContainer>
      <PageHeader
        title={BATCH_HEADER.title}
        description={vaultIdFromRoute ? BATCH_HEADER.vaultDescription(vaultName ?? BACK.vault) : BATCH_HEADER.description}
        metaDescription={BATCH_HEADER.description}
        back={back}
      />
      <TwoColumn
        main={
          <>
            {daoContext ? (
              <Notice tone="info" title={ORG_LAUNCH.title}>
                {ORG_LAUNCH.batch}
              </Notice>
            ) : null}
            <Steps steps={STEPS} current={step} onBack={locked ? undefined : (key) => goTo(key as StepKey)} />
            <form noValidate onSubmit={(event) => event.preventDefault()} className="flex min-w-0 flex-col gap-6">
              {step === 'who' ? whoStep : step === 'when' ? whenStep : checkStep}
            </form>
          </>
        }
        side={
          <div className="flex flex-col gap-4 lg:sticky lg:top-20">
            <Card>
              <div className="flex flex-col gap-4">
                <Heading level="item" as="h2">
                  {BATCH.summaryTitle}
                </Heading>
                <DetailList
                  items={[
                    { label: REVIEW_ROWS.people, value: filledRows.length > 0 ? BATCH.peopleCount(filledRows.length) : BATCH.noneYet },
                    { label: REVIEW_ROWS.total, value: totalUnits > 0n ? totalText : null },
                    { label: BATCH.scheduleLine, value: scheduleTitle },
                    { label: BATCH.networkLine, value: NETWORK_LABEL[network] },
                  ]}
                />
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-4">
                <Heading level="item" as="h2">
                  {BATCH.releasesTitle}
                </Heading>
                {totalUnits <= 0n ? (
                  <p className="text-small text-ink-secondary">{SIDE.noAmount}</p>
                ) : unevenSplit ? (
                  <p className="text-small text-ink-secondary">{SIDE.unevenSplitMany}</p>
                ) : releases.filter((release) => !release.waiting).length === 0 ? (
                  <p className="text-small text-ink-secondary">{SIDE.noDates}</p>
                ) : (
                  <ScheduleTimeline
                    asset={asset}
                    now={previewStart}
                    blocks={releases.map((release) => ({
                      at: release.at,
                      amount: unitsToDisplay(release.units, decimals),
                      state: release.waiting ? 'waiting' : 'later',
                    }))}
                  />
                )}
              </div>
            </Card>
          </div>
        }
      />
      <TransactionReview
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        plan={
          <InsetBlock>
            <p className="text-body text-ink">{BATCH.reviewPlan(filledRows.length, totalText ?? '', vaultName ?? BACK.vault)}</p>
          </InsetBlock>
        }
        summary={{
          direction: 'out',
          leavesWallet: { amount: unitsToDisplay(totalUnits, decimals), asset },
          goesTo: { label: BATCH.goesTo(filledRows.length) },
          whoCanStop: draft.schedule.cancelable ? BATCH.whoCanStopYes : BATCH.whoCanStopNo,
          network,
        }}
        checks={
          balanceUnits === null || token
            ? []
            : [
                {
                  label: BATCH.balanceCheck,
                  ok: balanceUnits >= totalUnits,
                  fix: BATCH.balanceFix(balanceText ?? '', totalText ?? ''),
                },
              ]
        }
        run={fund}
        next={
          <div className="flex flex-col items-start gap-2">
            <p>{BATCH.done(completed?.count ?? filledRows.length)}</p>
            <ButtonLink variant="primary" size="sm" to="/streams/batches">
              {BATCH.goToBatch}
            </ButtonLink>
          </div>
        }
      />
      <ConfirmDialog
        open={pendingImport !== null}
        title={BATCH.replaceTitle(filledRows.length)}
        body={BATCH.replaceBody(pendingImport?.length ?? 0)}
        keepLabel={BATCH.replaceKeep}
        confirmLabel={BATCH.replaceConfirm}
        busyLabel={BATCH.replaceBusy}
        tone="primary"
        onClose={() => answerReplace(false)}
        onConfirm={async () => answerReplace(true)}
      />
      <ConfirmDialog
        open={leaving}
        title={LEAVE.titleBatch}
        body={LEAVE.body}
        keepLabel={LEAVE.keep}
        confirmLabel={LEAVE.leave}
        busyLabel={LEAVE.busy}
        tone="danger"
        onClose={() => setLeaving(false)}
        onConfirm={async () => {
          writeDraft(storageKey, null);
          setLeaving(false);
          navigate(back.to);
        }}
      />
    </PageContainer>
  );
}
