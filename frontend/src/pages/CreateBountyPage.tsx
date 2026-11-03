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
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DateInput } from '../components/ui/DateInput';
import { DetailList } from '../components/ui/DetailList';
import { ErrorSummary } from '../components/ui/ErrorSummary';
import { Input } from '../components/ui/Input';
import { InsetBlock } from '../components/ui/InsetBlock';
import { Notice } from '../components/ui/Notice';
import { Panel } from '../components/ui/Panel';
import { PlanSentence } from '../components/ui/PlanSentence';
import { Textarea } from '../components/ui/Textarea';
import type { Asset } from '../components/ui/types';
import { useNetwork } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import { BOUNTY_CREATE, datesLine, tooManyDecimals } from '../copy/bounties';
import { ACTIONS } from '../copy/common';
import { asFlowError, errorMessage } from '../copy/errors';
import { formatAmount, formatDate } from '../copy/format';
import { createBounty, type CreateBountyInput } from '../services/bountyApi';
import { parseAmount, parsedUnits } from '../utils/campaignAmounts';
import { resolveTokenMeta, type TokenMeta } from '../utils/tokenMeta';
import { checkTokenCategory } from '../utils/tokenValidation';

type TokenType = 'BCH' | 'FUNGIBLE_TOKEN';

type FormData = {
  title: string;
  description: string;
  tokenType: TokenType;
  tokenCategory: string;
  rewardPerWinner: string;
  maxWinners: string;
  startDate: string;
  endDate: string;
};

type FormField = keyof FormData;
type FormErrors = Partial<Record<FormField, string>>;
type Summary = { title: string; message: string } | null;

const DRAFT_KEY = 'flowguard:draft:create-bounty';
const RECOMMENDED_MAX_WINNERS = 19;
const TITLE_MAX = 80;
const TOKEN_ID = /^[0-9a-fA-F]{64}$/;
const HEX = /^[0-9a-fA-F]*$/;
const BCH: Asset = { kind: 'bch' };

const FIELD_ID: Record<FormField, string> = {
  title: 'bounty-title',
  description: 'bounty-description',
  tokenType: 'bounty-token-type',
  tokenCategory: 'bounty-token-id',
  rewardPerWinner: 'bounty-prize',
  maxWinners: 'bounty-winners',
  startDate: 'bounty-start',
  endDate: 'bounty-end',
};

const FIELD_LABEL: Record<FormField, string> = {
  title: BOUNTY_CREATE.about.titleLabel,
  description: BOUNTY_CREATE.about.descriptionLabel,
  tokenType: BOUNTY_CREATE.asset.legend,
  tokenCategory: BOUNTY_CREATE.asset.tokenIdLabel,
  rewardPerWinner: BOUNTY_CREATE.prizes.perWinnerLabel,
  maxWinners: BOUNTY_CREATE.prizes.winnersLabel,
  startDate: BOUNTY_CREATE.dates.startLabel,
  endDate: BOUNTY_CREATE.dates.endLabel,
};

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
    tokenType: 'BCH',
    tokenCategory: '',
    rewardPerWinner: '',
    maxWinners: '1',
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
    const text = (key: FormField) => (typeof record[key] === 'string' ? (record[key] as string) : base[key]);
    return {
      title: text('title'),
      description: text('description'),
      tokenType: record.tokenType === 'FUNGIBLE_TOKEN' ? 'FUNGIBLE_TOKEN' : 'BCH',
      tokenCategory: text('tokenCategory'),
      rewardPerWinner: text('rewardPerWinner'),
      maxWinners: text('maxWinners'),
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
  return (Object.keys(base) as FormField[]).some((key) => key !== 'startDate' && form[key] !== base[key]);
}

export default function CreateBountyPage() {
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
    ? { kind: 'token', tokenId: tokenId || '0'.repeat(64), symbol: tokenMeta?.symbol, decimals: tokenMeta?.decimals ?? 0 }
    : BCH;
  const decimals = asset.kind === 'bch' ? 8 : asset.decimals;

  const prize = useMemo(() => parseAmount(form.rewardPerWinner, decimals), [form.rewardPerWinner, decimals]);
  const prizeUnits = parsedUnits(prize);
  const winners = /^\d+$/.test(form.maxWinners.trim()) ? Number.parseInt(form.maxWinners, 10) : 0;
  const totalText =
    prizeUnits !== null && prizeUnits > 0n && winners > 0 ? formatAmount(prizeUnits * BigInt(winners), asset) : null;

  const set = <K extends FormField>(field: K, value: FormData[K]): void => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    const copy = BOUNTY_CREATE.errors;
    if (!form.title.trim()) next.title = copy.title;
    if (usesToken) {
      if (!tokenId) next.tokenCategory = copy.tokenId;
      else if (!HEX.test(tokenId)) next.tokenCategory = copy.tokenIdChars;
      else if (tokenId.length !== 64) next.tokenCategory = copy.tokenIdLength;
    }
    if (prize && 'tooPrecise' in prize) next.rewardPerWinner = tooManyDecimals(decimals);
    else if (prizeUnits === null || prizeUnits <= 0n) next.rewardPerWinner = copy.perWinner;
    if (winners <= 0) next.maxWinners = copy.winners;
    if (form.endDate && form.startDate && form.endDate <= form.startDate) next.endDate = copy.endBeforeStart;
    return next;
  };

  const showFieldErrors = (next: FormErrors) => {
    setErrors(next);
    setSummary({ title: BOUNTY_CREATE.errorTitle, message: BOUNTY_CREATE.fixFields });
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const next = validate();
    if (Object.keys(next).length > 0) {
      showFieldErrors(next);
      return;
    }
    if (!wallet.isConnected || !wallet.address) {
      setSummary({ title: BOUNTY_CREATE.errorTitle, message: errorMessage('NOT_CONNECTED') });
      return;
    }
    if (!wallet.signCashScriptTransaction) {
      setSummary({ title: BOUNTY_CREATE.errorTitle, message: errorMessage('WALLET_UNSUPPORTED') });
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
          setSummary({ title: BOUNTY_CREATE.errorTitle, message: BOUNTY_CREATE.errors.tokenUnavailable });
        } else {
          showFieldErrors({
            tokenCategory: check.reason === 'format' ? BOUNTY_CREATE.errors.tokenIdLength : BOUNTY_CREATE.errors.tokenNotFound,
          });
        }
        return;
      }
      const meta = await resolveTokenMeta(tokenId, network).catch(() => null);
      tokenDecimals = meta?.decimals ?? 0;
    }

    const submitDecimals = usesToken ? tokenDecimals : decimals;
    const submitPrize = parsedUnits(parseAmount(form.rewardPerWinner, submitDecimals));
    if (submitPrize === null) {
      setBusy(false);
      showFieldErrors({ rewardPerWinner: tooManyDecimals(submitDecimals) });
      return;
    }

    try {
      const payload: CreateBountyInput = {
        creator: wallet.address,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        tokenType: form.tokenType,
        tokenCategory: usesToken ? tokenId : undefined,
        tokenDecimals,
        rewardPerWinner: Number(submitPrize) / 10 ** submitDecimals,
        maxWinners: winners,
        startDate: isoDateToUnixSeconds(form.startDate),
        endDate: form.endDate ? isoDateToUnixSeconds(form.endDate, '23:59:59') : undefined,
      };

      const result = await createBounty(payload, wallet.address);
      const bountyId = result?.campaign?.id;
      if (!bountyId) {
        setSummary({ title: BOUNTY_CREATE.errorTitle, message: BOUNTY_CREATE.maybeCreated });
        return;
      }
      writeDraft(null);
      navigate(`/bounties/${bountyId}`, { replace: true });
    } catch (error) {
      setSummary({ title: BOUNTY_CREATE.errorTitle, message: asFlowError(error).message });
    } finally {
      setBusy(false);
    }
  };

  const leave = async (): Promise<void> => {
    writeDraft(null);
    navigate('/bounties');
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

  const plan = (sticky: boolean) =>
    prizeUnits === null || prizeUnits <= 0n ? (
      <InsetBlock className={sticky ? 'lg:sticky lg:top-20' : undefined}>
        <p className="text-body text-ink">{BOUNTY_CREATE.planIncomplete}</p>
      </InsetBlock>
    ) : (
    <PlanSentence
      sticky={sticky}
      schedule={{
        kind: 'prize',
        perWinner: formatAmount(prizeUnits, asset, { unit: false }) ?? '',
        winners: Math.max(winners, 1),
        asset,
        endsAt: isoDateToUnixSeconds(form.endDate, '23:59:59'),
      }}
    />
  );

  return (
    <PageContainer>
      <PageHeader
        title={BOUNTY_CREATE.title}
        description={BOUNTY_CREATE.description}
        back={{ to: '/bounties', label: BOUNTY_CREATE.back }}
      />
      <form noValidate onSubmit={(event) => void handleSubmit(event)}>
        <TwoColumn
          main={
            <Stack>
              <Panel title={BOUNTY_CREATE.about.title}>
                <Stack gap={4}>
                  <Input
                    id={FIELD_ID.title}
                    label={BOUNTY_CREATE.about.titleLabel}
                    placeholder={BOUNTY_CREATE.about.titlePlaceholder}
                    helper={BOUNTY_CREATE.about.titleHelper}
                    value={form.title}
                    maxLength={TITLE_MAX}
                    onChange={(event) => set('title', event.target.value)}
                    error={errors.title}
                  />
                  <Textarea
                    id={FIELD_ID.description}
                    label={BOUNTY_CREATE.about.descriptionLabel}
                    optional
                    placeholder={BOUNTY_CREATE.about.descriptionPlaceholder}
                    helper={BOUNTY_CREATE.about.descriptionHelper}
                    value={form.description}
                    maxLength={1000}
                    onChange={(event) => set('description', event.target.value)}
                  />
                </Stack>
              </Panel>

              <Panel title={BOUNTY_CREATE.prizes.title}>
                <Stack gap={4}>
                  <ChoiceCardGroup<TokenType>
                    name="bounty-asset"
                    legend={BOUNTY_CREATE.asset.legend}
                    value={form.tokenType}
                    onChange={(value) => set('tokenType', value)}
                    options={[
                      { value: 'BCH', title: BOUNTY_CREATE.asset.bchTitle, description: BOUNTY_CREATE.asset.bchLine },
                      { value: 'FUNGIBLE_TOKEN', title: BOUNTY_CREATE.asset.tokenTitle, description: BOUNTY_CREATE.asset.tokenLine },
                    ]}
                  />
                  {usesToken ? (
                    <Input
                      id={FIELD_ID.tokenCategory}
                      label={BOUNTY_CREATE.asset.tokenIdLabel}
                      placeholder={BOUNTY_CREATE.asset.tokenIdPlaceholder}
                      helper={BOUNTY_CREATE.asset.tokenIdHelper}
                      value={form.tokenCategory}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => set('tokenCategory', event.target.value.trim())}
                      error={errors.tokenCategory}
                    />
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <AmountInput
                      id={FIELD_ID.rewardPerWinner}
                      label={BOUNTY_CREATE.prizes.perWinnerLabel}
                      asset={asset}
                      value={form.rewardPerWinner}
                      onChange={(value) => set('rewardPerWinner', value)}
                      helper={BOUNTY_CREATE.prizes.perWinnerHelper}
                      error={errors.rewardPerWinner}
                    />
                    <Input
                      id={FIELD_ID.maxWinners}
                      label={BOUNTY_CREATE.prizes.winnersLabel}
                      inputMode="numeric"
                      value={form.maxWinners}
                      onChange={(event) => set('maxWinners', event.target.value.replace(/\D/g, ''))}
                      helper={BOUNTY_CREATE.prizes.winnersHelper}
                      error={errors.maxWinners}
                    />
                  </div>
                  {winners > RECOMMENDED_MAX_WINNERS ? (
                    <Notice tone="warning" title={BOUNTY_CREATE.prizes.manyWinnersTitle}>
                      {BOUNTY_CREATE.prizes.manyWinnersLine}
                    </Notice>
                  ) : null}
                </Stack>
              </Panel>

              <Panel title={BOUNTY_CREATE.dates.title}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <DateInput
                    id={FIELD_ID.startDate}
                    label={BOUNTY_CREATE.dates.startLabel}
                    value={form.startDate}
                    onChange={(value) => set('startDate', value)}
                    helper={BOUNTY_CREATE.dates.startHelper}
                    error={errors.startDate}
                  />
                  <DateInput
                    id={FIELD_ID.endDate}
                    label={BOUNTY_CREATE.dates.endLabel}
                    value={form.endDate}
                    min={form.startDate || undefined}
                    onChange={(value) => set('endDate', value)}
                    helper={BOUNTY_CREATE.dates.endHelper}
                    error={errors.endDate}
                  />
                </div>
              </Panel>

              <Panel title={BOUNTY_CREATE.review.title}>
                <Stack gap={4}>
                  <div className="lg:hidden">{plan(false)}</div>
                  <InsetBlock>
                    <DetailList
                      items={[
                        { label: BOUNTY_CREATE.review.total, value: totalText },
                        { label: BOUNTY_CREATE.review.dates, value: datesLine(startText, endText) },
                        { label: BOUNTY_CREATE.review.cancel, value: BOUNTY_CREATE.review.cancelLine },
                      ]}
                    />
                  </InsetBlock>
                  <p className="text-small text-ink-secondary">{BOUNTY_CREATE.review.nextStep}</p>
                  {summary ? (
                    <ErrorSummary title={summary.title} message={summary.message} fields={invalidFields} />
                  ) : null}
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Button variant="ghost" onClick={askToLeave}>
                      {BOUNTY_CREATE.leave}
                    </Button>
                    <Button variant="primary" type="submit" busy={busy} busyLabel={BOUNTY_CREATE.submitBusy}>
                      {BOUNTY_CREATE.submit}
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
        title={BOUNTY_CREATE.leaveTitle}
        body={BOUNTY_CREATE.leaveBody}
        keepLabel={ACTIONS.keepEditing}
        confirmLabel={ACTIONS.leave}
        tone="danger"
        busyLabel={BOUNTY_CREATE.leaving}
        onConfirm={leave}
        onClose={() => setLeaving(false)}
      />
    </PageContainer>
  );
}
