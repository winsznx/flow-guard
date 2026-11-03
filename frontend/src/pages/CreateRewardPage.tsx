import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Stack } from '../components/layout/Stack';
import { TwoColumn } from '../components/layout/TwoColumn';
import { AmountInput } from '../components/ui/AmountInput';
import { Button } from '../components/ui/Button';
import { ChoiceCardGroup } from '../components/ui/ChoiceCard';
import { Select } from '../components/ui/Select';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DateInput } from '../components/ui/DateInput';
import { DetailList } from '../components/ui/DetailList';
import { ErrorSummary } from '../components/ui/ErrorSummary';
import { Input } from '../components/ui/Input';
import { InsetBlock } from '../components/ui/InsetBlock';
import { Panel } from '../components/ui/Panel';
import { Textarea } from '../components/ui/Textarea';
import type { Asset } from '../components/ui/types';
import { useNetwork } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import { datesLine } from '../copy/bounties';
import {
  REWARD_CREATE,
  REWARD_TYPE,
  REWARD_TYPE_ORDER,
  enoughFor,
  rewardPlan,
  tooManyDecimals,
} from '../copy/rewards';
import { ACTIONS } from '../copy/common';
import { asFlowError, errorMessage } from '../copy/errors';
import { formatAmount, formatDate } from '../copy/format';
import { createReward, type CreateRewardInput, type RewardCategory } from '../services/rewardApi';
import { parseAmount, parsedUnits } from '../utils/campaignAmounts';
import { resolveTokenMeta, type TokenMeta } from '../utils/tokenMeta';
import { checkTokenCategory } from '../utils/tokenValidation';

type TokenType = 'BCH' | 'FUNGIBLE_TOKEN';

type FormData = {
  title: string;
  description: string;
  rewardCategory: RewardCategory;
  tokenType: TokenType;
  tokenCategory: string;
  totalPool: string;
  maxRewardAmount: string;
  startDate: string;
  endDate: string;
};

type FormField = keyof FormData;
type FormErrors = Partial<Record<FormField, string>>;
type Summary = { title: string; message: string } | null;

const DRAFT_KEY = 'flowguard:draft:create-reward';
const TITLE_MAX = 80;
const TOKEN_ID = /^[0-9a-fA-F]{64}$/;
const HEX = /^[0-9a-fA-F]*$/;
const BCH: Asset = { kind: 'bch' };

const FIELD_ID: Record<FormField, string> = {
  title: 'reward-title',
  description: 'reward-description',
  rewardCategory: 'reward-type',
  tokenType: 'reward-token-type',
  tokenCategory: 'reward-token-id',
  totalPool: 'reward-budget',
  maxRewardAmount: 'reward-limit',
  startDate: 'reward-start',
  endDate: 'reward-end',
};

const FIELD_LABEL: Record<FormField, string> = {
  title: REWARD_CREATE.about.titleLabel,
  description: REWARD_CREATE.about.descriptionLabel,
  rewardCategory: REWARD_CREATE.about.typeLabel,
  tokenType: REWARD_CREATE.asset.legend,
  tokenCategory: REWARD_CREATE.asset.tokenIdLabel,
  totalPool: REWARD_CREATE.budget.totalLabel,
  maxRewardAmount: REWARD_CREATE.budget.limitLabel,
  startDate: REWARD_CREATE.dates.startLabel,
  endDate: REWARD_CREATE.dates.endLabel,
};

const TYPES: ReadonlySet<string> = new Set(REWARD_TYPE_ORDER);

function todayIso(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `YYYY-MM-DD` at a local time of day, in unix seconds (the bare date would parse as UTC). */
function isoDateToUnixSeconds(value: string, time = '00:00:00'): number | undefined {
  if (!value) return undefined;
  const ts = Date.parse(`${value}T${time}`);
  if (Number.isNaN(ts)) return undefined;
  return Math.floor(ts / 1000);
}

function emptyForm(): FormData {
  return {
    title: '',
    description: '',
    rewardCategory: 'CUSTOM',
    tokenType: 'BCH',
    tokenCategory: '',
    totalPool: '',
    maxRewardAmount: '',
    startDate: todayIso(),
    endDate: '',
  };
}

function readDraft(): FormData {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return emptyForm();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyForm();
    const base = emptyForm();
    const record = parsed as Record<string, unknown>;
    const text = (key: FormField) =>
      typeof record[key] === 'string' ? (record[key] as string) : base[key];
    return {
      title: text('title'),
      description: text('description'),
      rewardCategory: TYPES.has(String(record.rewardCategory))
        ? (record.rewardCategory as RewardCategory)
        : base.rewardCategory,
      tokenType: record.tokenType === 'FUNGIBLE_TOKEN' ? 'FUNGIBLE_TOKEN' : 'BCH',
      tokenCategory: text('tokenCategory'),
      totalPool: text('totalPool'),
      maxRewardAmount: text('maxRewardAmount'),
      startDate: text('startDate'),
      endDate: text('endDate'),
    };
  } catch {
    return emptyForm();
  }
}

function writeDraft(form: FormData | null): void {
  try {
    if (form) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    else window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    return;
  }
}

function isDirty(form: FormData): boolean {
  const base = emptyForm();
  return (Object.keys(base) as FormField[]).some(
    (key) => key !== 'startDate' && form[key] !== base[key]
  );
}

export default function CreateRewardPage() {
  const navigate = useNavigate();
  const wallet = useWallet();
  const network = useNetwork();

  const [form, setForm] = useState<FormData>(readDraft);
  const [errors, setErrors] = useState<FormErrors>({});
  const [summary, setSummary] = useState<Summary>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [tokenMeta, setTokenMeta] = useState<TokenMeta | null>(null);

  useEffect(() => {
    writeDraft(form);
  }, [form]);

  const tokenId = form.tokenCategory.trim();
  const usesToken = form.tokenType === 'FUNGIBLE_TOKEN';

  useEffect(() => {
    if (!usesToken || !TOKEN_ID.test(tokenId)) {
      setTokenMeta(null);
      return undefined;
    }
    let current = true;
    resolveTokenMeta(tokenId, network)
      .then((meta) => {
        if (current) setTokenMeta(meta);
      })
      .catch(() => {
        if (current) setTokenMeta(null);
      });
    return () => {
      current = false;
    };
  }, [usesToken, tokenId, network]);

  const asset: Asset = usesToken
    ? {
        kind: 'token',
        tokenId: tokenId || '0'.repeat(64),
        symbol: tokenMeta?.symbol,
        decimals: tokenMeta?.decimals ?? 0,
      }
    : BCH;
  const decimals = asset.kind === 'bch' ? 8 : asset.decimals;

  const budget = useMemo(() => parseAmount(form.totalPool, decimals), [form.totalPool, decimals]);
  const limit = useMemo(() => parseAmount(form.maxRewardAmount, decimals), [form.maxRewardAmount, decimals]);
  const budgetUnits = parsedUnits(budget);
  const limitUnits = parsedUnits(limit);
  const budgetText =
    budgetUnits !== null && budgetUnits > 0n ? formatAmount(budgetUnits, asset) : null;
  const limitText = limitUnits !== null && limitUnits > 0n ? formatAmount(limitUnits, asset) : null;
  const rewardsAtLimit =
    budgetUnits !== null && limitUnits !== null && limitUnits > 0n && budgetUnits >= limitUnits
      ? Number(budgetUnits / limitUnits)
      : 0;

  const set = <K extends FormField>(field: K, value: FormData[K]): void => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    const copy = REWARD_CREATE.errors;
    if (!form.title.trim()) next.title = copy.title;
    if (usesToken) {
      if (!tokenId) next.tokenCategory = copy.tokenId;
      else if (!HEX.test(tokenId)) next.tokenCategory = copy.tokenIdChars;
      else if (tokenId.length !== 64) next.tokenCategory = copy.tokenIdLength;
    }
    if (budget && 'tooPrecise' in budget) next.totalPool = tooManyDecimals(decimals);
    else if (budgetUnits === null || budgetUnits <= 0n) next.totalPool = copy.budget;
    if (limit && 'tooPrecise' in limit) next.maxRewardAmount = tooManyDecimals(decimals);
    else if (limitUnits === null || limitUnits <= 0n) next.maxRewardAmount = copy.limit;
    else if (budgetUnits !== null && limitUnits > budgetUnits)
      next.maxRewardAmount = copy.limitOverBudget;
    if (form.endDate && form.startDate && form.endDate <= form.startDate)
      next.endDate = copy.endBeforeStart;
    return next;
  };

  const showFieldErrors = (next: FormErrors) => {
    setErrors(next);
    setSummary({ title: REWARD_CREATE.errorTitle, message: REWARD_CREATE.fixFields });
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const next = validate();
    if (Object.keys(next).length > 0) {
      showFieldErrors(next);
      return;
    }
    if (!wallet.isConnected || !wallet.address) {
      setSummary({ title: REWARD_CREATE.errorTitle, message: errorMessage('NOT_CONNECTED') });
      return;
    }
    if (!wallet.signCashScriptTransaction) {
      setSummary({ title: REWARD_CREATE.errorTitle, message: errorMessage('WALLET_UNSUPPORTED') });
      return;
    }

    setBusy(true);
    setSummary(null);

    let tokenDecimals = 0;
    if (usesToken) {
      const check = await checkTokenCategory(tokenId, network);
      if (!check.ok) {
        setBusy(false);
        if (check.reason === 'unavailable') {
          setSummary({
            title: REWARD_CREATE.errorTitle,
            message: REWARD_CREATE.errors.tokenUnavailable,
          });
        } else {
          showFieldErrors({
            tokenCategory:
              check.reason === 'format'
                ? REWARD_CREATE.errors.tokenIdLength
                : REWARD_CREATE.errors.tokenNotFound,
          });
        }
        return;
      }
      const meta = await resolveTokenMeta(tokenId, network).catch(() => null);
      tokenDecimals = meta?.decimals ?? 0;
    }

    const submitDecimals = usesToken ? tokenDecimals : decimals;
    const submitBudget = parsedUnits(parseAmount(form.totalPool, submitDecimals));
    const submitLimit = parsedUnits(parseAmount(form.maxRewardAmount, submitDecimals));
    if (submitBudget === null || submitLimit === null) {
      setBusy(false);
      showFieldErrors({
        ...(submitBudget === null ? { totalPool: tooManyDecimals(submitDecimals) } : {}),
        ...(submitLimit === null ? { maxRewardAmount: tooManyDecimals(submitDecimals) } : {}),
      });
      return;
    }

    try {
      const payload: CreateRewardInput = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        rewardCategory: form.rewardCategory,
        tokenType: form.tokenType,
        tokenCategory: usesToken ? tokenId : undefined,
        tokenDecimals,
        totalPool: Number(submitBudget) / 10 ** submitDecimals,
        maxRewardAmount: Number(submitLimit) / 10 ** submitDecimals,
        startDate: isoDateToUnixSeconds(form.startDate),
        endDate: form.endDate ? isoDateToUnixSeconds(form.endDate, '23:59:59') : undefined,
      };

      const result = await createReward(payload, wallet.address);
      const rewardId = result?.campaign?.id;
      if (!rewardId) {
        setSummary({ title: REWARD_CREATE.errorTitle, message: REWARD_CREATE.maybeCreated });
        return;
      }
      writeDraft(null);
      navigate(`/rewards/${rewardId}`, { replace: true });
    } catch (error) {
      setSummary({ title: REWARD_CREATE.errorTitle, message: asFlowError(error).message });
    } finally {
      setBusy(false);
    }
  };

  const leave = async (): Promise<void> => {
    writeDraft(null);
    navigate('/rewards');
  };

  const askToLeave = () => {
    if (isDirty(form)) setLeaving(true);
    else void leave();
  };

  const invalidFields = (Object.keys(errors) as FormField[])
    .filter((key) => errors[key])
    .map((key) => ({ label: FIELD_LABEL[key], id: FIELD_ID[key] }));

  const startText = formatDate(form.startDate);
  const endText = form.endDate ? formatDate(form.endDate) : null;

  const planText =
    budgetText && limitText ? rewardPlan(budgetText, limitText, startText, endText) : REWARD_CREATE.planIncomplete;

  const plan = (sticky: boolean) => (
    <InsetBlock className={sticky ? 'lg:sticky lg:top-20' : undefined}>
      <p className="text-body text-ink">{planText}</p>
    </InsetBlock>
  );

  const reviewItems = [
    { label: REWARD_CREATE.review.budget, value: budgetText },
    { label: REWARD_CREATE.review.limit, value: limitText },
    { label: REWARD_CREATE.review.dates, value: datesLine(startText, endText) },
    { label: REWARD_CREATE.review.type, value: REWARD_TYPE[form.rewardCategory] },
    { label: REWARD_CREATE.review.cancel, value: REWARD_CREATE.review.cancelLine },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={REWARD_CREATE.title}
        description={REWARD_CREATE.description}
        back={{ to: '/rewards', label: REWARD_CREATE.back }}
      />
      <form noValidate onSubmit={(event) => void handleSubmit(event)}>
        <TwoColumn
          main={
          <Stack>
            <Panel title={REWARD_CREATE.about.title}>
              <Stack gap={4}>
                <Input
                  id={FIELD_ID.title}
                  label={REWARD_CREATE.about.titleLabel}
                  placeholder={REWARD_CREATE.about.titlePlaceholder}
                  helper={REWARD_CREATE.about.titleHelper}
                  value={form.title}
                  maxLength={TITLE_MAX}
                  onChange={(event) => set('title', event.target.value)}
                  error={errors.title}
                />
                <Textarea
                  id={FIELD_ID.description}
                  label={REWARD_CREATE.about.descriptionLabel}
                  optional
                  placeholder={REWARD_CREATE.about.descriptionPlaceholder}
                  helper={REWARD_CREATE.about.descriptionHelper}
                  value={form.description}
                  maxLength={1000}
                  onChange={(event) => set('description', event.target.value)}
                />
                <Select<RewardCategory>
                  id={FIELD_ID.rewardCategory}
                  label={REWARD_CREATE.about.typeLabel}
                  helper={REWARD_CREATE.about.typeHelper}
                  value={form.rewardCategory}
                  onValueChange={(value) => set('rewardCategory', value)}
                  options={REWARD_TYPE_ORDER.map((key) => ({
                    value: key,
                    label: REWARD_TYPE[key],
                  }))}
                />
              </Stack>
            </Panel>

            <Panel title={REWARD_CREATE.budget.title}>
              <Stack gap={4}>
                <ChoiceCardGroup<TokenType>
                  name="reward-asset"
                  legend={REWARD_CREATE.asset.legend}
                  value={form.tokenType}
                  onChange={(value) => set('tokenType', value)}
                  options={[
                    {
                      value: 'BCH',
                      title: REWARD_CREATE.asset.bchTitle,
                      description: REWARD_CREATE.asset.bchLine,
                    },
                    {
                      value: 'FUNGIBLE_TOKEN',
                      title: REWARD_CREATE.asset.tokenTitle,
                      description: REWARD_CREATE.asset.tokenLine,
                    },
                  ]}
                />
                {usesToken ? (
                  <Input
                    id={FIELD_ID.tokenCategory}
                    label={REWARD_CREATE.asset.tokenIdLabel}
                    placeholder={REWARD_CREATE.asset.tokenIdPlaceholder}
                    helper={REWARD_CREATE.asset.tokenIdHelper}
                    value={form.tokenCategory}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => set('tokenCategory', event.target.value.trim())}
                    error={errors.tokenCategory}
                  />
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <AmountInput
                    id={FIELD_ID.totalPool}
                    label={REWARD_CREATE.budget.totalLabel}
                    asset={asset}
                    value={form.totalPool}
                    onChange={(value) => set('totalPool', value)}
                    helper={REWARD_CREATE.budget.totalHelper}
                    error={errors.totalPool}
                  />
                  <AmountInput
                    id={FIELD_ID.maxRewardAmount}
                    label={REWARD_CREATE.budget.limitLabel}
                    asset={asset}
                    value={form.maxRewardAmount}
                    onChange={(value) => set('maxRewardAmount', value)}
                    helper={
                      rewardsAtLimit > 0
                        ? enoughFor(rewardsAtLimit)
                        : REWARD_CREATE.budget.limitHelper
                    }
                    error={errors.maxRewardAmount}
                  />
                </div>
              </Stack>
            </Panel>

            <Panel title={REWARD_CREATE.dates.title}>
              <div className="grid gap-4 sm:grid-cols-2">
                <DateInput
                  id={FIELD_ID.startDate}
                  label={REWARD_CREATE.dates.startLabel}
                  value={form.startDate}
                  onChange={(value) => set('startDate', value)}
                  helper={REWARD_CREATE.dates.startHelper}
                  error={errors.startDate}
                />
                <DateInput
                  id={FIELD_ID.endDate}
                  label={REWARD_CREATE.dates.endLabel}
                  value={form.endDate}
                  min={form.startDate || undefined}
                  onChange={(value) => set('endDate', value)}
                  helper={REWARD_CREATE.dates.endHelper}
                  error={errors.endDate}
                />
              </div>
            </Panel>

            <Panel title={REWARD_CREATE.review.title}>
              <Stack gap={4}>
                <div className="lg:hidden">{plan(false)}</div>
                <InsetBlock>
                  <DetailList items={reviewItems} />
                </InsetBlock>
                <p className="text-small text-ink-secondary">{REWARD_CREATE.review.nextStep}</p>
                {summary ? (
                  <ErrorSummary
                    title={summary.title}
                    message={summary.message}
                    fields={invalidFields}
                  />
                ) : null}
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button variant="ghost" onClick={askToLeave}>
                    {REWARD_CREATE.leave}
                  </Button>
                  <Button
                    variant="primary"
                    type="submit"
                    busy={busy}
                    busyLabel={REWARD_CREATE.submitBusy}
                  >
                    {REWARD_CREATE.submit}
                  </Button>
                </div>
              </Stack>
            </Panel>
          </Stack>
          }
          side={<div className="hidden lg:block lg:h-full">{plan(true)}</div>}
        />
      </form>
      <ConfirmDialog
        open={leaving}
        title={REWARD_CREATE.leaveTitle}
        body={REWARD_CREATE.leaveBody}
        keepLabel={ACTIONS.keepEditing}
        confirmLabel={ACTIONS.leave}
        tone="danger"
        busyLabel={REWARD_CREATE.leaving}
        onConfirm={leave}
        onClose={() => setLeaving(false)}
      />
    </PageContainer>
  );
}
