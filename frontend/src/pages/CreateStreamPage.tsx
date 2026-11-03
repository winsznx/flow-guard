import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { TwoColumn } from '../components/layout/TwoColumn';
import { Address } from '../components/ui/Address';
import { AddressInput, CheckedCodeInput } from '../components/ui/AddressInput';
import { Amount } from '../components/ui/Amount';
import { AmountInput } from '../components/ui/AmountInput';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { ChoiceCardGroup } from '../components/ui/ChoiceCard';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DetailList } from '../components/ui/DetailList';
import { ErrorSummary } from '../components/ui/ErrorSummary';
import { FilterChips } from '../components/ui/FilterChips';
import { Heading } from '../components/ui/Heading';
import { CircleAlert, Icon } from '../components/ui/Icon';
import { Input } from '../components/ui/Input';
import { InsetBlock } from '../components/ui/InsetBlock';
import { Notice } from '../components/ui/Notice';
import { Panel } from '../components/ui/Panel';
import { PlanSentence, type Schedule } from '../components/ui/PlanSentence';
import { RepeatableRows } from '../components/ui/RepeatableRows';
import { ScheduleTimeline } from '../components/ui/ScheduleTimeline';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Select } from '../components/ui/Select';
import { Steps } from '../components/ui/Steps';
import { Switch } from '../components/ui/Switch';
import type { Asset } from '../components/ui/types';
import { useWallet } from '../hooks/useWallet';
import { useNetwork } from '../hooks/useNetwork';
import { authFetch } from '../utils/auth';
import { rememberDaoLaunchContext, ORG_LAUNCH_SOURCE, type DaoLaunchContext } from '../utils/daoStreamLaunch';
import {
  COMMON_SCHEDULE_CHOICES,
  DAY_SECONDS,
  DEFAULT_SCHEDULE,
  INTERVAL_CHOICES,
  MORE_SCHEDULE_CHOICES,
  SCHEDULE_CHOICE_WORDS,
  SCHEDULE_FIELD_ID,
  SCHEDULE_FIELD_LABEL,
  TOKEN_REFUSED_CHOICES,
  TOKEN_CHOICE_UNAVAILABLE,
  TOKEN_SCHEDULE_UNAVAILABLE,
  evenSplitProblem,
  getStreamScheduleTemplateById,
  matchedTemplateId,
  nextRowId,
  parseUnits,
  planReleases,
  planSchedule,
  positiveWhole,
  regularAddressProblem,
  scheduleFromTemplate,
  scheduleShape,
  splitByShares,
  splitIntoSteps,
  templatesForChoice,
  unitsToDisplay,
  validateSchedule,
  type PlannedRelease,
  type ScheduleChoice,
  type ScheduleDraft,
  type ScheduleErrors,
  type ScheduleField,
  type SplitProblem,
} from '../utils/streamShapes';
import { checkTokenCategory } from '../utils/tokenValidation';
import { TOKEN_ID, tokenIdCheck } from '../utils/tokenField';
import { resolveTokenMeta, type TokenMeta } from '../utils/tokenMeta';
import { ACTIONS, BUSY, LABELS, backTo } from '../copy/common';
import { apiErrorDetails, apiFailure, asFlowError, errorMessage } from '../copy/errors';
import { formatAddress, formatAmount, formatDate } from '../copy/format';
import { NETWORK_LABEL } from '../copy/network';
import { ORG_LAUNCH } from '../copy/organization';
import {
  BACK,
  CREATE_HEADER,
  FIELD_ERRORS,
  LEAVE,
  REVIEW_NOTES,
  REVIEW_ROWS,
  SCHEDULE,
  SCHEDULE_ERRORS,
  SIDE,
  STEP_LABELS,
  SUMMARY,
  WHO,
} from '../copy/streamCreate';

/* ------------------------------------------------------------------------------------------------
 * Schedule fields and the side summary, shared with the batch page.
 * --------------------------------------------------------------------------------------------- */

function FieldProblem({ id, message }: { id?: string; message: string }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-small text-danger-ink">
      <span className="mt-0.5 inline-flex shrink-0">
        <Icon icon={CircleAlert} size={16} />
      </span>
      <span>{message}</span>
    </p>
  );
}

export type ScheduleFieldsProps = {
  draft: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
  token: boolean;
  allowDelay: boolean;
  many: boolean;
  errors: ScheduleErrors;
  start: number;
  asset: Asset;
  total: bigint | null;
  recipientName: string;
  split: SplitProblem | null;
  onUseAmount?: (amount: string) => void;
};

function dayDate(start: number, days: number): string | null {
  return days > 0 ? formatDate(start + days * DAY_SECONDS) : null;
}

export function ScheduleFields({
  draft,
  onChange,
  token,
  allowDelay,
  many,
  errors,
  start,
  asset,
  total,
  recipientName,
  split,
  onUseAmount,
}: ScheduleFieldsProps) {
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...draft, ...patch, templateId: null });
  const shape = scheduleShape(draft, token, allowDelay);
  const streamType = shape.streamType;
  const moreShown = draft.moreOpen || MORE_SCHEDULE_CHOICES.includes(draft.choice);
  const visibleChoices = [...COMMON_SCHEDULE_CHOICES, ...(moreShown ? MORE_SCHEDULE_CHOICES : [])];
  const refusedForToken = (choice: ScheduleChoice) =>
    Boolean(token) && TOKEN_REFUSED_CHOICES.has(choice) && choice !== draft.choice;
  const presets = templatesForChoice(draft.choice, token);
  const activeTemplate = getStreamScheduleTemplateById(draft.templateId);
  const count = positiveWhole(draft.paymentCount);
  const intervalSelect = draft.intervalOther || !INTERVAL_CHOICES.includes(draft.intervalDays) ? 'other' : draft.intervalDays;
  const customParts =
    total !== null && streamType === 'TRANCHE' ? splitByShares(total, shape.custom.map((row) => row.share)) : [];
  const stepParts = total !== null && streamType === 'STEP' && draft.choice === 'same' ? splitIntoSteps(total, count) : [];
  const unevenSteps = stepParts.length > 1 && stepParts[stepParts.length - 1] !== stepParts[0];

  const chooseSchedule = (choice: ScheduleChoice) => onChange({ ...draft, choice, templateId: null });
  const choosePreset = (ids: string[]) => {
    const template = getStreamScheduleTemplateById(ids[0]);
    if (template) onChange(scheduleFromTemplate(template, draft));
  };

  return (
    <div className="flex flex-col gap-6">
      <div id={SCHEDULE_FIELD_ID.choice} tabIndex={-1} className="flex flex-col gap-3">
        <ChoiceCardGroup
          name="schedule-choice"
          legend={SCHEDULE.legend}
          columns={1}
          value={draft.choice}
          onChange={chooseSchedule}
          options={visibleChoices.map((choice) => ({
            value: choice,
            title: SCHEDULE_CHOICE_WORDS[choice].title,
            description: SCHEDULE_CHOICE_WORDS[choice].description,
            disabled: refusedForToken(choice),
            disabledReason: refusedForToken(choice) ? TOKEN_CHOICE_UNAVAILABLE : undefined,
          }))}
        />
        {errors.choice ? <FieldProblem message={errors.choice} /> : null}
        <div className="flex flex-col items-start gap-2">
          {MORE_SCHEDULE_CHOICES.includes(draft.choice) ? null : (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={moreShown}
              onClick={() => onChange({ ...draft, moreOpen: !draft.moreOpen })}
            >
              {moreShown ? SCHEDULE.fewer : SCHEDULE.more}
            </Button>
          )}
        </div>
      </div>

      {presets.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-label text-ink">{SCHEDULE.examplesLabel}</p>
          <FilterChips
            label={SCHEDULE.examplesGroup}
            options={presets.map((template) => ({ value: template.id, label: template.title }))}
            selected={activeTemplate ? [activeTemplate.id] : []}
            onChange={choosePreset}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {activeTemplate ? <p className="text-small text-ink-secondary">{SCHEDULE.usingExample(activeTemplate.title)}</p> : null}
            <ButtonLink variant="link" to="/streams/shapes">
              {SCHEDULE.seeExamples}
            </ButtonLink>
          </div>
        </div>
      ) : null}

      {draft.choice === 'once' ? (
        <Input
          id={SCHEDULE_FIELD_ID.onceDays}
          label={SCHEDULE.onceDaysLabel}
          inputMode="numeric"
          value={draft.onceDays}
          onChange={(event) => set({ onceDays: event.target.value })}
          error={errors.onceDays}
          helper={dayDate(start, shape.durationDays) ? SCHEDULE.releasedOn(dayDate(start, shape.durationDays) ?? '') : undefined}
        />
      ) : null}

      {draft.choice === 'wait' ? (
        <Input
          id={SCHEDULE_FIELD_ID.waitDays}
          label={SCHEDULE.waitLabel}
          inputMode="numeric"
          value={draft.waitDays}
          onChange={(event) => set({ waitDays: event.target.value })}
          error={errors.waitDays}
          helper={dayDate(start, shape.waitDays) ? SCHEDULE.waitHelper(dayDate(start, shape.waitDays) ?? '') : undefined}
        />
      ) : null}

      {draft.choice === 'part' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id={SCHEDULE_FIELD_ID.upfrontDays}
            label={SCHEDULE.upfrontDaysLabel}
            inputMode="numeric"
            value={draft.upfrontDays}
            onChange={(event) => set({ upfrontDays: event.target.value })}
            error={errors.upfrontDays}
            helper={dayDate(start, shape.upfrontDays) ? SCHEDULE.upfrontDayHelper(dayDate(start, shape.upfrontDays) ?? '') : undefined}
          />
          <Input
            id={SCHEDULE_FIELD_ID.upfrontPercent}
            label={SCHEDULE.upfrontPercentLabel}
            inputMode="decimal"
            value={draft.upfrontPercent}
            onChange={(event) => set({ upfrontPercent: event.target.value })}
            error={errors.upfrontPercent}
            helper={SCHEDULE.upfrontPercentHelper}
          />
        </div>
      ) : null}

      {draft.choice === 'even' || draft.choice === 'wait' || draft.choice === 'part' ? (
        <Input
          id={SCHEDULE_FIELD_ID.lengthDays}
          label={SCHEDULE.lengthLabel}
          inputMode="numeric"
          value={draft.lengthDays}
          onChange={(event) => set({ lengthDays: event.target.value })}
          error={errors.lengthDays}
          helper={dayDate(start, shape.durationDays) ? SCHEDULE.endsOn(dayDate(start, shape.durationDays) ?? '') : undefined}
        />
      ) : null}

      {draft.choice === 'same' ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id={SCHEDULE_FIELD_ID.intervalDays}
              label={SCHEDULE.intervalLabel}
              value={intervalSelect}
              onValueChange={(value) =>
                value === 'other' ? set({ intervalOther: true }) : set({ intervalDays: value, intervalOther: false })
              }
              options={[
                ...INTERVAL_CHOICES.map((days) => ({ value: days, label: SCHEDULE.intervalChoice(Number(days)) })),
                { value: 'other', label: SCHEDULE.intervalOther },
              ]}
              error={intervalSelect === 'other' ? undefined : errors.intervalDays}
            />
            <Input
              id={SCHEDULE_FIELD_ID.paymentCount}
              label={streamType === 'RECURRING' && draft.refillable ? SCHEDULE.depositCoversLabel : SCHEDULE.countLabel}
              inputMode="numeric"
              value={draft.paymentCount}
              onChange={(event) => set({ paymentCount: event.target.value })}
              error={errors.paymentCount ?? split?.message}
              helper={
                streamType === 'RECURRING' && draft.refillable
                  ? SCHEDULE.depositCoversHelper
                  : dayDate(start, shape.durationDays + shape.waitDays)
                    ? SCHEDULE.countHelper(dayDate(start, shape.durationDays + shape.waitDays) ?? '')
                    : undefined
              }
            />
          </div>
          {intervalSelect === 'other' ? (
            <Input
              id={`${SCHEDULE_FIELD_ID.intervalDays}-days`}
              label={SCHEDULE.intervalOtherLabel}
              inputMode="numeric"
              value={draft.intervalDays}
              onChange={(event) => set({ intervalDays: event.target.value, intervalOther: true })}
              error={errors.intervalDays}
            />
          ) : null}
          {split && onUseAmount ? (
            <div className="flex flex-wrap gap-2">
              {split.amounts.map((amount) => (
                <Button key={amount} variant="secondary" size="sm" onClick={() => onUseAmount(amount)}>
                  {SCHEDULE_ERRORS.pickAmount(formatAmount(amount, asset) ?? amount)}
                </Button>
              ))}
            </div>
          ) : null}
          {unevenSteps ? <p className="text-small text-ink-secondary">{SCHEDULE.stepRoundingLine}</p> : null}
          {allowDelay ? (
            <Input
              id={SCHEDULE_FIELD_ID.delayDays}
              label={SCHEDULE.waitOptionalLabel}
              inputMode="numeric"
              value={draft.delayDays}
              onChange={(event) => set({ delayDays: event.target.value })}
              error={errors.delayDays}
              helper={
                streamType === 'RECURRING'
                  ? SCHEDULE.recurringWaitHelper
                  : dayDate(start, shape.waitDays)
                    ? SCHEDULE.waitHelper(dayDate(start, shape.waitDays) ?? '')
                    : undefined
              }
            />
          ) : null}
          <Switch
            label={SCHEDULE.topUpsLabel}
            description={draft.refillable ? SCHEDULE.topUpsOn(count) : SCHEDULE.topUpsOff(count)}
            checked={draft.refillable}
            onChange={(refillable) =>
              onChange({ ...draft, refillable, sameKind: refillable ? 'RECURRING' : draft.sameKind, templateId: null })
            }
          />
          {many ? null : (
            <p className="text-small text-ink-secondary">
              {SCHEDULE.recurringPaymentLine}{' '}
              <ButtonLink variant="link" to="/payments/create">
                {SCHEDULE.recurringPaymentLink}
              </ButtonLink>
            </p>
          )}
        </div>
      ) : null}

      {draft.choice === 'custom' ? (
        <div id={SCHEDULE_FIELD_ID.customRows} tabIndex={-1} className="flex flex-col gap-2">
          <RepeatableRows
            legend={SCHEDULE.customLegend}
            rows={draft.customRows}
            onChange={(customRows) => set({ customRows })}
            makeRow={() => {
              const last = positiveWhole(draft.customRows[draft.customRows.length - 1]?.day ?? '0');
              return { id: nextRowId('release'), day: String(last + 30), share: '' };
            }}
            min={1}
            max={8}
            addLabel={SCHEDULE.customAdd}
            rowKey={(row) => row.id}
            renderRow={(row, index, update) => {
              const date = dayDate(start, positiveWhole(row.day));
              const part = customParts[index];
              return (
                <>
                  <Input
                    label={SCHEDULE.customDayLabel}
                    inputMode="numeric"
                    value={row.day}
                    onChange={(event) => update({ ...row, day: event.target.value })}
                    helper={date ? SCHEDULE.customRowHelper(date, part !== undefined ? formatAmount(part, asset) : null) : undefined}
                  />
                  <Input
                    label={SCHEDULE.customShareLabel}
                    inputMode="decimal"
                    value={row.share}
                    onChange={(event) => update({ ...row, share: event.target.value })}
                  />
                </>
              );
            }}
          />
          <p className="text-small text-ink-secondary">{SCHEDULE.customHelper}</p>
          {errors.customRows ? <FieldProblem message={errors.customRows} /> : null}
        </div>
      ) : null}

      <Switch
        label={many ? SCHEDULE.cancelableManyLabel : SCHEDULE.cancelableLabel}
        description={
          !draft.cancelable
            ? SCHEDULE.cancelableOff
            : streamType === 'RECURRING'
              ? SCHEDULE.cancelableOnRecurring(recipientName)
              : SCHEDULE.cancelableOn(recipientName)
        }
        checked={draft.cancelable}
        onChange={(cancelable) => onChange({ ...draft, cancelable })}
      />
      {streamType === 'RECURRING' ? null : (
        <Switch
          label={many ? SCHEDULE.transferableManyLabel : SCHEDULE.transferableLabel}
          description={draft.transferable ? SCHEDULE.transferableOn(recipientName) : SCHEDULE.transferableOff}
          checked={draft.transferable}
          onChange={(transferable) => onChange({ ...draft, transferable })}
        />
      )}
    </div>
  );
}

export type ScheduleSideProps = {
  plan: Schedule;
  recipient?: { address: string; name?: string };
  releases: PlannedRelease[];
  asset: Asset;
  decimals: number;
  hasAmount: boolean;
  openEnded: boolean;
  /** Shown in place of the plan and the dates while a recurring amount doesn't split evenly. */
  unevenLine?: string;
};

export function ScheduleSide({ plan, recipient, releases, asset, decimals, hasAmount, openEnded, unevenLine }: ScheduleSideProps) {
  const paid = releases.filter((release) => !release.waiting);
  const first = paid[0];
  const last = paid[paid.length - 1];
  return (
    <div className="flex flex-col gap-4 lg:sticky lg:top-20">
      {unevenLine ? (
        <InsetBlock>
          <p className="text-body text-ink">{unevenLine}</p>
        </InsetBlock>
      ) : (
        <PlanSentence recipient={recipient} schedule={plan} />
      )}
      <Card>
        <div className="flex flex-col gap-4">
          <Heading level="item" as="h2">
            {SIDE.scheduleTitle}
          </Heading>
          {!hasAmount ? (
            <p className="text-small text-ink-secondary">{SIDE.noAmount}</p>
          ) : unevenLine ? (
            <p className="text-small text-ink-secondary">{SIDE.unevenSplit}</p>
          ) : paid.length === 0 ? (
            <p className="text-small text-ink-secondary">{SIDE.noDates}</p>
          ) : (
            <>
              <ScheduleTimeline
                asset={asset}
                variant="preview"
                blocks={releases.map((release) => ({
                  at: release.at,
                  amount: unitsToDisplay(release.units, decimals),
                  state: release.waiting ? 'waiting' : 'later',
                }))}
              />
              <DetailList
                items={[
                  { label: SIDE.firstRelease, value: first ? formatDate(first.at) : null },
                  { label: SIDE.ends, value: openEnded ? SIDE.noEnd : last ? formatDate(last.at) : null },
                ]}
              />
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * The create page.
 * --------------------------------------------------------------------------------------------- */

type StepKey = 'who' | 'when' | 'check';

type CreateDraft = {
  step: StepKey;
  recipient: string;
  payWith: 'bch' | 'token';
  tokenId: string;
  amount: string;
  vaultChoice: string;
  note: string;
  schedule: ScheduleDraft;
};

type WhoField = 'recipient' | 'tokenId' | 'amount';

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

type SubmitProblem = { message: string };

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'who', label: STEP_LABELS.who },
  { key: 'when', label: STEP_LABELS.when },
  { key: 'check', label: STEP_LABELS.checkCreate },
];

const WHO_FIELD_ID: Record<WhoField, string> = {
  recipient: 'stream-recipient',
  tokenId: 'stream-token-id',
  amount: 'stream-amount',
};

const FRESH_DRAFT: CreateDraft = {
  step: 'who',
  recipient: '',
  payWith: 'bch',
  tokenId: '',
  amount: '',
  vaultChoice: '',
  note: '',
  schedule: DEFAULT_SCHEDULE,
};

function draftKey(vaultId: string | undefined, walletAddress: string | null | undefined): string {
  return `flowguard.create-stream.v1:${vaultId ?? 'personal'}:${walletAddress ?? 'no-wallet'}`;
}

function readDraft(key: string): CreateDraft | null {
  try {
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || !('schedule' in parsed) || !('step' in parsed)) return null;
    const draft = parsed as CreateDraft;
    return { ...FRESH_DRAFT, ...draft, schedule: { ...DEFAULT_SCHEDULE, ...draft.schedule } };
  } catch (error) {
    console.warn('Ignoring an unreadable stream draft in session storage.', error);
    return null;
  }
}

function writeDraft(key: string, draft: CreateDraft | null): void {
  try {
    if (draft) window.sessionStorage.setItem(key, JSON.stringify(draft));
    else window.sessionStorage.removeItem(key);
  } catch (error) {
    console.warn('Could not save the stream draft in session storage.', error);
  }
}

function vaultKeyOf(vault: VaultOption): string {
  return vault.vault_id || vault.vaultId || vault.id;
}

function pipeNumbers(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split('|')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function initialDraft(key: string, params: URLSearchParams): CreateDraft {
  const stored = readDraft(key) ?? FRESH_DRAFT;
  const template = getStreamScheduleTemplateById(params.get('template'));
  if (!template) return stored;
  const duration = Number(params.get('duration'));
  const offsets = pipeNumbers(params.get('trancheOffsets'));
  const shares = pipeNumbers(params.get('tranchePercentages'));
  const custom = offsets.length > 0 && offsets.length === shares.length ? { offsets, shares } : {};
  return {
    ...stored,
    schedule: scheduleFromTemplate(template, stored.schedule, { duration: duration > 0 ? duration : undefined, ...custom }),
  };
}

function serverMessage(body: unknown, status: number): string {
  const raw = apiErrorDetails(body) ?? '';
  if (/p2pkh/i.test(raw)) return SUMMARY.recipientRefused;
  if (/token/i.test(raw) && /(available|support|refuse|can't|cannot)/i.test(raw)) return `${TOKEN_SCHEDULE_UNAVAILABLE} ${SUMMARY.nothingSent}`;
  if (/(divide|split)\s+evenly/i.test(raw)) return SUMMARY.splitRefused;
  return apiFailure(body, status, 'SERVER_PREPARE_FAILED').message;
}

export default function CreateStreamPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: vaultId } = useParams();
  const [searchParams] = useSearchParams();
  const wallet = useWallet();
  const network = useNetwork();
  const daoContext = (location.state as CreateStreamLocationState | null)?.daoContext;
  const storageKey = draftKey(vaultId, wallet.address);

  const [draft, setDraft] = useState<CreateDraft>(() => initialDraft(storageKey, searchParams));
  const [draftKeyInUse, setDraftKeyInUse] = useState(storageKey);
  if (draftKeyInUse !== storageKey) {
    setDraftKeyInUse(storageKey);
    const stored = readDraft(storageKey);
    if (stored) setDraft(stored);
  }
  const [whoErrors, setWhoErrors] = useState<Partial<Record<WhoField, string>>>({});
  const [scheduleErrors, setScheduleErrors] = useState<ScheduleErrors>({});
  const [showSummary, setShowSummary] = useState(false);
  const [submitProblem, setSubmitProblem] = useState<SubmitProblem | null>(null);
  const [checking, setChecking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [vaults, setVaults] = useState<VaultOption[]>([]);
  const [savedWithoutLink, setSavedWithoutLink] = useState(false);
  const [routeVaultName, setRouteVaultName] = useState<string | null>(null);
  const [tokenMeta, setTokenMeta] = useState<{ category: string; meta: TokenMeta | null } | null>(null);
  const [start] = useState(() => Math.floor(Date.now() / 1000));

  const token = draft.payWith === 'token';
  const tokenId = token ? draft.tokenId.trim() : '';
  const meta = tokenMeta && tokenMeta.category === tokenId ? tokenMeta.meta : null;
  const metaPending = token && TOKEN_ID.test(tokenId) && tokenMeta?.category !== tokenId;
  const decimals = token ? meta?.decimals ?? 0 : 8;
  const asset: Asset = token ? { kind: 'token', tokenId, symbol: meta?.symbol, decimals } : { kind: 'bch' };
  const totalUnits = parseUnits(draft.amount, decimals);
  const total = totalUnits !== null && totalUnits > 0n ? totalUnits : null;
  const shape = scheduleShape(draft.schedule, token, true);
  const streamType = shape.streamType;
  const paymentCount = positiveWhole(draft.schedule.paymentCount);
  const split = streamType === 'RECURRING' ? evenSplitProblem(total, paymentCount, asset, decimals) : null;
  const inputAsset: Asset = metaPending ? { kind: 'token', tokenId, decimals: 18 } : asset;
  const releases = total === null ? [] : planReleases(shape, total, start);
  const plan = planSchedule(shape, draft.schedule.choice, total, asset, decimals, start);
  const recipientValid = regularAddressProblem(draft.recipient, network) === null;
  const recipient = recipientValid ? { address: draft.recipient.trim() } : undefined;
  const recipientName = recipientValid ? formatAddress(draft.recipient, 'short') : SCHEDULE.cancelableRecipientFallback;
  const openEnded = streamType === 'RECURRING' && draft.schedule.refillable;
  const selectedVault = vaults.find((vault) => vaultKeyOf(vault) === draft.vaultChoice);
  const vaultLabel = vaultId ? routeVaultName ?? CREATE_HEADER.vaultFallback : selectedVault?.name || null;

  const back = vaultId
    ? { to: `/vaults/${vaultId}`, label: backTo(routeVaultName ?? BACK.vault) }
    : daoContext?.source === ORG_LAUNCH_SOURCE
      ? { to: '/app/dao/streams', label: backTo(BACK.vaultStreams) }
      : { to: '/streams', label: backTo(BACK.streams) };

  useEffect(() => {
    if (!savedWithoutLink) writeDraft(storageKey, draft);
  }, [storageKey, draft, savedWithoutLink]);

  useEffect(() => {
    if (daoContext) rememberDaoLaunchContext(daoContext);
  }, [daoContext]);

  useEffect(() => {
    if (!TOKEN_ID.test(tokenId)) return;
    let ignore = false;
    resolveTokenMeta(tokenId, network).then((resolved) => {
      if (!ignore) setTokenMeta({ category: tokenId, meta: resolved });
    });
    return () => {
      ignore = true;
    };
  }, [network, tokenId]);

  useEffect(() => {
    if (!wallet.address || vaultId) return;
    let ignore = false;
    fetch('/api/vaults', { headers: { 'x-user-address': wallet.address } })
      .then((response) => response.json())
      .then((data: { all?: VaultOption[] }) => {
        if (ignore) return;
        const usable = (data.all ?? []).filter((vault) => vault.role !== 'viewer');
        setVaults(usable);
        setDraft((current) =>
          current.vaultChoice && !usable.some((vault) => vaultKeyOf(vault) === current.vaultChoice)
            ? { ...current, vaultChoice: '' }
            : current,
        );
      })
      .catch((error: unknown) => {
        console.error('Vaults for the stream form did not load:', error);
        if (ignore) return;
        setVaults([]);
        setDraft((current) => (current.vaultChoice ? { ...current, vaultChoice: '' } : current));
      });
    return () => {
      ignore = true;
    };
  }, [vaultId, wallet.address]);

  useEffect(() => {
    if (!wallet.address || !vaultId) return;
    let ignore = false;
    fetch(`/api/vaults/${vaultId}`, { headers: { 'x-user-address': wallet.address } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { name?: string | null } | null) => {
        if (!ignore && data?.name) setRouteVaultName(data.name);
      })
      .catch((error: unknown) => {
        console.error('Vault name for the stream form did not load:', error);
      });
    return () => {
      ignore = true;
    };
  }, [vaultId, wallet.address]);

  const update = (patch: Partial<CreateDraft>) => {
    setSubmitProblem(null);
    setDraft((current) => ({ ...current, ...patch }));
  };

  const updateSchedule = (schedule: ScheduleDraft) => {
    setSubmitProblem(null);
    setScheduleErrors({});
    setDraft((current) => ({ ...current, schedule }));
  };

  const goTo = (step: StepKey) => {
    setShowSummary(false);
    setDraft((current) => ({ ...current, step }));
    window.scrollTo({ top: 0 });
  };

  const validateWho = (): Partial<Record<WhoField, string>> => {
    const errors: Partial<Record<WhoField, string>> = {};
    const recipientProblem = regularAddressProblem(draft.recipient, network);
    if (recipientProblem) errors.recipient = recipientProblem;
    if (token) {
      if (!tokenId) errors.tokenId = FIELD_ERRORS.tokenMissing;
      else {
        const check = tokenIdCheck(tokenId);
        if (!check.ok) errors.tokenId = check.message;
      }
    }
    if (!draft.amount.trim() || !(Number(draft.amount) > 0)) errors.amount = FIELD_ERRORS.amountMissing;
    else if (totalUnits === null && !metaPending) errors.amount = token ? FIELD_ERRORS.amountTokenDecimals(decimals) : FIELD_ERRORS.amountBchDecimals;
    return errors;
  };

  const validateWhen = (): ScheduleErrors => {
    const errors = validateSchedule(draft.schedule, token, true);
    if (split && !errors.paymentCount) errors.paymentCount = split.message;
    return errors;
  };

  const continueFromWho = async () => {
    const errors = validateWho();
    setWhoErrors(errors);
    if (Object.keys(errors).length > 0) {
      setShowSummary(true);
      return;
    }
    if (token) {
      setChecking(true);
      try {
        const result = await checkTokenCategory(tokenId, network);
        if (!result.ok) {
          setWhoErrors({ tokenId: result.reason === 'unavailable' ? FIELD_ERRORS.tokenUnavailable : FIELD_ERRORS.tokenNotFound });
          setShowSummary(true);
          return;
        }
        const resolved = await resolveTokenMeta(tokenId, network);
        setTokenMeta({ category: tokenId, meta: resolved });
        if (parseUnits(draft.amount, resolved?.decimals ?? 0) === null) {
          setWhoErrors({ amount: FIELD_ERRORS.amountTokenDecimals(resolved?.decimals ?? 0) });
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
    const errors = validateWhen();
    setScheduleErrors(errors);
    if (Object.keys(errors).length > 0) {
      setShowSummary(true);
      return;
    }
    goTo('check');
  };

  const createStream = async () => {
    const who = validateWho();
    const when = validateWhen();
    if (Object.keys(who).length > 0) {
      setWhoErrors(who);
      goTo('who');
      setShowSummary(true);
      return;
    }
    if (Object.keys(when).length > 0) {
      setScheduleErrors(when);
      goTo('when');
      setShowSummary(true);
      return;
    }
    if (!wallet.isConnected || !wallet.address) {
      setSubmitProblem({ message: errorMessage('NOT_CONNECTED') });
      return;
    }
    if (!wallet.signCashScriptTransaction) {
      setSubmitProblem({ message: errorMessage('WALLET_UNSUPPORTED') });
      return;
    }

    setCreating(true);
    setSubmitProblem(null);
    try {
      let submitDecimals = 0;
      if (token) {
        const check = await checkTokenCategory(tokenId, network);
        if (!check.ok) {
          setWhoErrors({ tokenId: check.reason === 'unavailable' ? FIELD_ERRORS.tokenUnavailable : FIELD_ERRORS.tokenNotFound });
          goTo('who');
          setShowSummary(true);
          return;
        }
        submitDecimals = (await resolveTokenMeta(tokenId, network))?.decimals ?? 0;
        if (parseUnits(draft.amount, submitDecimals) === null) {
          setWhoErrors({ amount: FIELD_ERRORS.amountTokenDecimals(submitDecimals) });
          goTo('who');
          setShowSummary(true);
          return;
        }
      }

      const submitShape = scheduleShape(draft.schedule, token, true);
      const type = submitShape.streamType;
      const now = Math.floor(Date.now() / 1000);
      const cliffDays =
        type === 'TRANCHE' ? (submitShape.custom[0]?.day ?? 0) : type === 'HYBRID' ? 0 : submitShape.waitDays;
      const startTime = type === 'RECURRING' && cliffDays > 0 ? now + cliffDays * DAY_SECONDS : now;
      const endTime = startTime + submitShape.durationDays * DAY_SECONDS;
      const cliffTimestamp = cliffDays > 0 ? (type === 'RECURRING' ? startTime : now + cliffDays * DAY_SECONDS) : undefined;
      const submitUnits = parseUnits(draft.amount, token ? submitDecimals : 8) ?? 0n;
      const trancheParts =
        type === 'TRANCHE' ? splitByShares(submitUnits, submitShape.custom.map((row) => row.share)) : [];

      const payload = {
        sender: wallet.address,
        recipient: draft.recipient.trim(),
        tokenType: token ? 'FUNGIBLE_TOKEN' : 'BCH',
        tokenCategory: token ? tokenId : undefined,
        tokenDecimals: submitDecimals,
        totalAmount: Number(draft.amount),
        streamType: type,
        startTime,
        endTime,
        cliffTimestamp,
        intervalSeconds: type === 'RECURRING' || type === 'STEP' ? submitShape.intervalDays * DAY_SECONDS : undefined,
        cancelable: draft.schedule.cancelable,
        transferable: type !== 'RECURRING' && draft.schedule.transferable,
        refillable: type === 'RECURRING' && draft.schedule.refillable,
        scheduleTemplate: matchedTemplateId(draft.schedule, submitShape),
        description: draft.note,
        vaultId: vaultId || (selectedVault ? draft.vaultChoice : undefined),
        launchContext: daoContext || undefined,
        hybridUnlockTimestamp: type === 'HYBRID' ? startTime + submitShape.upfrontDays * DAY_SECONDS : undefined,
        hybridUpfrontPercentage: type === 'HYBRID' ? submitShape.upfrontPercent : undefined,
        trancheSchedule:
          type === 'TRANCHE'
            ? submitShape.custom.map((row, index) => ({
                unlockTime: startTime + row.day * DAY_SECONDS,
                amount: Number(unitsToDisplay(trancheParts[index] ?? 0n, token ? submitDecimals : 8)),
                percentage: row.share,
              }))
            : undefined,
      };

      const response = await authFetch('/api/streams/create', {
        wallet,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setSubmitProblem({ message: serverMessage(body, response.status) });
        return;
      }
      const streamId =
        body && typeof body === 'object' && 'stream' in body && body.stream && typeof body.stream === 'object' && 'id' in body.stream
          ? String(body.stream.id)
          : null;
      writeDraft(storageKey, null);
      if (!streamId) {
        setSavedWithoutLink(true);
        return;
      }
      navigate(`/streams/${streamId}`, { state: { freshCreate: true, ...(daoContext ? { daoContext } : {}) } });
    } catch (error) {
      console.error('Stream create failed:', error);
      setSubmitProblem({ message: asFlowError(error).message });
    } finally {
      setCreating(false);
    }
  };

  const dirty = Boolean(draft.recipient.trim() || draft.amount.trim() || draft.note.trim() || draft.tokenId.trim());

  const leave = () => {
    if (dirty) {
      setLeaving(true);
      return;
    }
    navigate(back.to);
  };

  const whoFields = (Object.keys(whoErrors) as WhoField[])
    .filter((field) => whoErrors[field])
    .map((field) => ({
      id: WHO_FIELD_ID[field],
      label: field === 'recipient' ? WHO.recipientLabel : field === 'tokenId' ? WHO.tokenIdLabel : WHO.amountLabel,
    }));
  const whenFields = (Object.keys(scheduleErrors) as ScheduleField[])
    .filter((field) => scheduleErrors[field])
    .map((field) => ({ id: SCHEDULE_FIELD_ID[field], label: SCHEDULE_FIELD_LABEL[field] }));

  const amountText = total !== null ? formatAmount(total, asset) : null;
  const balanceUnits = !token && wallet.balance && Number.isFinite(wallet.balance.sat) ? BigInt(Math.trunc(wallet.balance.sat)) : null;
  const balanceInput = balanceUnits === null ? (token || !wallet.isConnected ? undefined : null) : unitsToDisplay(balanceUnits, 8);
  const balance = balanceUnits === null ? null : formatAmount(balanceUnits, { kind: 'bch' });
  const balanceLow = balanceUnits !== null && total !== null && balanceUnits < total;
  const firstRelease = releases.find((release) => !release.waiting);
  const lastRelease = [...releases].reverse().find((release) => !release.waiting);
  const tokenLine = meta
    ? decimals > 0
      ? WHO.tokenFound(meta.name || meta.symbol || WHO.tokenUnnamed, decimals)
      : WHO.tokenFoundWhole(meta.name || meta.symbol || WHO.tokenUnnamed)
    : WHO.tokenIdHelper;

  const footer = (primary: React.ReactNode, onBack: () => void) => (
    <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
      <Button variant="ghost" onClick={onBack}>
        {ACTIONS.back}
      </Button>
      {primary}
    </div>
  );

  const whoStep = (
    <Panel title={STEP_LABELS.who}>
      <AddressInput
        id={WHO_FIELD_ID.recipient}
        label={WHO.recipientLabel}
        value={draft.recipient}
        onChange={(recipientValue) => update({ recipient: recipientValue })}
        network={network}
        accept="p2pkh"
        helper={WHO.recipientHelper}
        error={whoErrors.recipient}
      />
      <div className="flex flex-col gap-1.5">
        <p className="text-label text-ink">{WHO.payWith}</p>
        <div>
          <SegmentedControl
            label={WHO.payWith}
            value={draft.payWith}
            onChange={(payWith) => update({ payWith })}
            options={[
              { value: 'bch', label: WHO.payBch },
              { value: 'token', label: WHO.payToken },
            ]}
          />
        </div>
      </div>
      {token ? (
        <CheckedCodeInput
          id={WHO_FIELD_ID.tokenId}
          label={WHO.tokenIdLabel}
          value={draft.tokenId}
          onChange={(value) => update({ tokenId: value })}
          check={tokenIdCheck}
          validLabel={WHO.tokenIdValid}
          pasteLabel={WHO.tokenIdPaste}
          helper={tokenLine}
          error={whoErrors.tokenId}
        />
      ) : null}
      <AmountInput
        id={WHO_FIELD_ID.amount}
        label={openEnded ? WHO.firstDepositLabel : WHO.amountLabel}
        asset={inputAsset}
        value={draft.amount}
        onChange={(amount) => update({ amount })}
        balance={balanceInput}
        helper={openEnded ? WHO.firstDepositHelper : token ? WHO.amountHelperToken : WHO.amountHelperBch}
        error={whoErrors.amount}
      />
      {!vaultId && vaults.length > 0 ? (
        <Select
          label={WHO.vaultLabel}
          value={draft.vaultChoice}
          onValueChange={(vaultChoice) => update({ vaultChoice })}
          helper={WHO.vaultHelper}
          options={[
            { value: '', label: WHO.vaultNone },
            ...vaults.map((vault) => ({
              value: vaultKeyOf(vault),
              label: vault.name || CREATE_HEADER.vaultFallback,
            })),
          ]}
        />
      ) : null}
      <Input
        label={WHO.noteLabel}
        optional
        value={draft.note}
        onChange={(event) => update({ note: event.target.value })}
        placeholder={WHO.notePlaceholder}
        helper={WHO.noteHelper}
      />
      {showSummary && whoFields.length > 0 ? (
        <ErrorSummary title={SUMMARY.stepTitle} message={SUMMARY.stepMessage} fields={whoFields} />
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
      <ScheduleFields
        draft={draft.schedule}
        onChange={updateSchedule}
        token={token}
        allowDelay
        many={false}
        errors={scheduleErrors}
        start={start}
        asset={asset}
        total={total}
        recipientName={recipientName}
        split={split}
        onUseAmount={(amount) => update({ amount })}
      />
      {showSummary && whenFields.length > 0 ? (
        <ErrorSummary title={SUMMARY.stepTitle} message={SUMMARY.stepMessage} fields={whenFields} />
      ) : null}
      {footer(
        <Button variant="primary" onClick={continueFromWhen}>
          {ACTIONS.continue}
        </Button>,
        () => goTo('who'),
      )}
    </Panel>
  );

  const reviewItems = [
    { label: REVIEW_ROWS.recipient, value: <Address value={draft.recipient.trim()} variant="full" /> },
    {
      label: openEnded ? REVIEW_ROWS.firstDeposit : REVIEW_ROWS.amount,
      value: total !== null ? <Amount value={unitsToDisplay(total, decimals)} asset={asset} /> : null,
    },
    ...(token ? [{ label: REVIEW_ROWS.token, value: meta?.name || meta?.symbol || `${tokenId.slice(0, 6)}…${tokenId.slice(-6)}` }] : []),
    { label: REVIEW_ROWS.schedule, value: SCHEDULE_CHOICE_WORDS[draft.schedule.choice].title },
    ...(getStreamScheduleTemplateById(draft.schedule.templateId)
      ? [{ label: REVIEW_ROWS.example, value: getStreamScheduleTemplateById(draft.schedule.templateId)?.title }]
      : []),
    { label: REVIEW_ROWS.firstRelease, value: firstRelease ? formatDate(firstRelease.at) : null },
    {
      label: REVIEW_ROWS.ends,
      value: openEnded ? REVIEW_ROWS.noEnd(paymentCount) : lastRelease ? formatDate(lastRelease.at) : null,
    },
    { label: REVIEW_ROWS.pauseCancel, value: draft.schedule.cancelable ? REVIEW_ROWS.canPause : REVIEW_ROWS.cantPause },
    ...(streamType === 'RECURRING'
      ? []
      : [{ label: REVIEW_ROWS.recipientMove, value: draft.schedule.transferable ? REVIEW_ROWS.canMove : REVIEW_ROWS.cantMove }]),
    { label: REVIEW_ROWS.listedUnder, value: vaultLabel ?? REVIEW_ROWS.noVault },
    { label: REVIEW_ROWS.paidFrom, value: LABELS.yourWallet },
    { label: LABELS.network, value: NETWORK_LABEL[network] },
    ...(draft.note.trim() ? [{ label: REVIEW_ROWS.note, value: draft.note.trim() }] : []),
  ];

  const nextLine = amountText ? REVIEW_NOTES.next(amountText) : REVIEW_NOTES.nextFallback;

  const checkStep = (
    <Panel title={STEP_LABELS.checkCreate}>
      <PlanSentence recipient={recipient} schedule={plan} />
      <InsetBlock>
        <DetailList items={reviewItems} />
      </InsetBlock>
      <Notice tone="warning" title={REVIEW_NOTES.clockTitle}>
        {REVIEW_NOTES.clockBody}
      </Notice>
      {balanceLow && balance && amountText ? (
        <Notice tone="warning" title={REVIEW_NOTES.balanceLowTitle}>
          {REVIEW_NOTES.balanceLow(amountText, balance)}
        </Notice>
      ) : balance ? (
        <p className="text-small text-ink-secondary">{REVIEW_NOTES.balance(balance)}</p>
      ) : null}
      {savedWithoutLink ? null : <p className="text-small text-ink-secondary">{REVIEW_NOTES.twoApprovals}</p>}
      {submitProblem ? (
        <ErrorSummary title={SUMMARY.createTitle} message={submitProblem.message} />
      ) : null}
      {savedWithoutLink ? (
        <Notice tone="warning" title={SUMMARY.savedNoLinkTitle}>
          {SUMMARY.savedNoLink}
        </Notice>
      ) : null}
      {savedWithoutLink ? (
        <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <ButtonLink variant="primary" to="/streams">
            {SUMMARY.goToStreams}
          </ButtonLink>
        </div>
      ) : (
        <>
          <p className="text-small text-ink-secondary">{nextLine}</p>
          {footer(
            <Button variant="primary" onClick={() => void createStream()} busy={creating} busyLabel={REVIEW_NOTES.busy}>
              {REVIEW_NOTES.continue}
            </Button>,
            () => goTo('when'),
          )}
        </>
      )}
    </Panel>
  );

  return (
    <PageContainer>
      <PageHeader
        title={CREATE_HEADER.title}
        description={vaultId ? CREATE_HEADER.vaultDescription(vaultLabel ?? CREATE_HEADER.vaultFallback) : CREATE_HEADER.description}
        metaDescription={vaultId ? undefined : CREATE_HEADER.description}
        back={back}
      />
      <TwoColumn
        main={
          <>
            {daoContext ? (
              <Notice tone="info" title={ORG_LAUNCH.title}>
                {ORG_LAUNCH.stream}
              </Notice>
            ) : null}
            <Steps steps={STEPS} current={draft.step} onBack={savedWithoutLink ? undefined : (key) => goTo(key as StepKey)} />
            <form noValidate onSubmit={(event) => event.preventDefault()} className="flex min-w-0 flex-col gap-6">
              {draft.step === 'who' ? whoStep : draft.step === 'when' ? whenStep : checkStep}
            </form>
          </>
        }
        side={
          <ScheduleSide
            plan={plan}
            recipient={recipient}
            releases={releases}
            asset={asset}
            decimals={decimals}
            hasAmount={total !== null}
            openEnded={openEnded}
            unevenLine={split ? split.message : undefined}
          />
        }
      />
      <ConfirmDialog
        open={leaving}
        title={LEAVE.title}
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
