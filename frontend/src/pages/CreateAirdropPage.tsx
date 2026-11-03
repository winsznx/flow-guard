import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { TwoColumn } from '../components/layout/TwoColumn';
import { AmountInput } from '../components/ui/AmountInput';
import { Button } from '../components/ui/Button';
import { ChoiceCardGroup } from '../components/ui/ChoiceCard';
import { DateInput } from '../components/ui/DateInput';
import { DetailList } from '../components/ui/DetailList';
import { ErrorSummary } from '../components/ui/ErrorSummary';
import { Input } from '../components/ui/Input';
import { InsetBlock } from '../components/ui/InsetBlock';
import { Notice } from '../components/ui/Notice';
import { Panel } from '../components/ui/Panel';
import { PlanSentence } from '../components/ui/PlanSentence';
import { Steps } from '../components/ui/Steps';
import { Textarea } from '../components/ui/Textarea';
import type { Asset } from '../components/ui/types';
import { useNetwork } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import { AIRDROP_ACCESS, AIRDROP_COSIGN, AIRDROP_FEE_FROM_POOL, CREATE_AIRDROP } from '../copy/airdrops';
import { LABELS } from '../copy/common';
import { apiFailure, asFlowError, errorMessage } from '../copy/errors';
import { formatAmount, formatDate } from '../copy/format';
import { authFetch } from '../utils/auth';
import { resolveTokenMeta, type TokenMeta } from '../utils/tokenMeta';

type StepKey = 'what' | 'when' | 'check';
type AssetChoice = 'BCH' | 'FUNGIBLE_TOKEN';
type FieldKey = 'title' | 'tokenCategory' | 'amountPerClaim' | 'totalAmount' | 'startDate' | 'endDate';

interface FormState {
  step: StepKey;
  title: string;
  description: string;
  tokenType: AssetChoice;
  tokenCategory: string;
  amountPerClaim: string;
  totalAmount: string;
  startDate: string;
  endDate: string;
}

type TokenLookup = { category: string; meta: TokenMeta | null; done: boolean };

const BCH: Asset = { kind: 'bch' };
const STORAGE_KEY = 'flowguard:create-airdrop:v1';
const TOKEN_ID = /^[0-9a-fA-F]{64}$/;
const STEP_ORDER: StepKey[] = ['what', 'when', 'check'];
const STEPS = STEP_ORDER.map((key) => ({ key, label: CREATE_AIRDROP.steps[key] }));
const FIELD_ID: Record<FieldKey, string> = {
  title: 'airdrop-name',
  tokenCategory: 'airdrop-token',
  amountPerClaim: 'airdrop-share',
  totalAmount: 'airdrop-pool',
  startDate: 'airdrop-opens',
  endDate: 'airdrop-closes',
};
const FIELD_LABEL: Record<FieldKey, string> = {
  title: CREATE_AIRDROP.name.label,
  tokenCategory: CREATE_AIRDROP.tokenId.label,
  amountPerClaim: CREATE_AIRDROP.share.label,
  totalAmount: CREATE_AIRDROP.pool.label,
  startDate: CREATE_AIRDROP.start.label,
  endDate: CREATE_AIRDROP.end.label,
};
const STEP_FIELDS: Record<StepKey, FieldKey[]> = {
  what: ['title', 'tokenCategory', 'amountPerClaim', 'totalAmount'],
  when: ['startDate', 'endDate'],
  check: [],
};
const ASSET_OPTIONS: { value: AssetChoice; title: string; description: string }[] = [
  { value: 'BCH', ...CREATE_AIRDROP.asset.bch },
  { value: 'FUNGIBLE_TOKEN', ...CREATE_AIRDROP.asset.token },
];

function todayLocalDate(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Local midnight of a `YYYY-MM-DD` date input, in unix seconds. */
function localDayStart(value: string): number {
  return Math.floor(new Date(`${value}T00:00:00`).getTime() / 1000);
}

/** Last second of a `YYYY-MM-DD` date input in local time, so the chosen end day is included. */
function localDayEnd(value: string): number {
  return Math.floor(new Date(`${value}T23:59:59`).getTime() / 1000);
}

function freshForm(): FormState {
  return {
    step: 'what',
    title: '',
    description: '',
    tokenType: 'BCH',
    tokenCategory: '',
    amountPerClaim: '',
    totalAmount: '',
    startDate: todayLocalDate(),
    endDate: '',
  };
}

function readSaved(): FormState {
  const base = freshForm();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved: Partial<FormState> = JSON.parse(raw);
    const text = (key: Exclude<keyof FormState, 'step' | 'tokenType'>) =>
      typeof saved[key] === 'string' ? (saved[key] as string) : base[key];
    return {
      step: STEP_ORDER.includes(saved.step as StepKey) ? (saved.step as StepKey) : base.step,
      title: text('title'),
      description: text('description'),
      tokenType: saved.tokenType === 'FUNGIBLE_TOKEN' ? 'FUNGIBLE_TOKEN' : 'BCH',
      tokenCategory: text('tokenCategory'),
      amountPerClaim: text('amountPerClaim'),
      totalAmount: text('totalAmount'),
      startDate: text('startDate') || base.startDate,
      endDate: text('endDate'),
    };
  } catch (error) {
    console.warn('Saved airdrop form could not be read', error);
    return base;
  }
}

function writeSaved(form: FormState | null) {
  try {
    if (form) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Airdrop form could not be saved in this browser', error);
  }
}

export default function CreateAirdropPage() {
  const navigate = useNavigate();
  const wallet = useWallet();
  const network = useNetwork();
  const [form, setForm] = useState<FormState>(readSaved);
  const [lookup, setLookup] = useState<TokenLookup | null>(null);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitError, setSubmitError] = useState<{ message: string; fields: FieldKey[] } | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    writeSaved(form);
  }, [form]);

  const category = form.tokenType === 'FUNGIBLE_TOKEN' ? form.tokenCategory.trim().toLowerCase() : '';
  const validCategory = TOKEN_ID.test(category);

  useEffect(() => {
    if (!validCategory) return undefined;
    let cancelled = false;
    resolveTokenMeta(category, network)
      .then((meta) => {
        if (!cancelled) setLookup({ category, meta, done: true });
      })
      .catch((error: unknown) => {
        console.warn('Token details did not load', error);
        if (!cancelled) setLookup({ category, meta: null, done: true });
      });
    return () => {
      cancelled = true;
    };
  }, [category, network, validCategory]);

  const tokenMeta = lookup && lookup.category === category ? lookup.meta : null;
  const lookupDone = Boolean(lookup && lookup.category === category && lookup.done);
  const asset: Asset =
    form.tokenType === 'FUNGIBLE_TOKEN'
      ? { kind: 'token', tokenId: category, symbol: tokenMeta?.symbol, decimals: tokenMeta?.decimals ?? 0 }
      : BCH;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key in FIELD_ID) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const share = Number(form.amountPerClaim);
  const pool = Number(form.totalAmount);
  const capacity = share > 0 && pool > 0 ? Math.floor(pool / share + 1e-9) : null;
  const opens = form.startDate ? localDayStart(form.startDate) : null;
  const closes = form.endDate ? localDayEnd(form.endDate) : null;
  const poolText = pool > 0 ? formatAmount(form.totalAmount, asset) : null;

  const fieldError = (key: FieldKey): string | undefined => {
    switch (key) {
      case 'title':
        return form.title.trim() ? undefined : CREATE_AIRDROP.name.missing;
      case 'tokenCategory':
        if (form.tokenType !== 'FUNGIBLE_TOKEN') return undefined;
        if (!category) return CREATE_AIRDROP.tokenId.missing;
        return validCategory ? undefined : CREATE_AIRDROP.tokenId.format;
      case 'amountPerClaim':
        return share > 0 ? undefined : CREATE_AIRDROP.share.missing;
      case 'totalAmount':
        if (!(pool > 0)) return CREATE_AIRDROP.pool.missing;
        return share > 0 && share > pool ? CREATE_AIRDROP.pool.tooSmall : undefined;
      case 'startDate':
        return form.startDate ? undefined : CREATE_AIRDROP.start.missing;
      case 'endDate':
        return form.endDate && form.startDate && localDayStart(form.endDate) <= localDayStart(form.startDate)
          ? CREATE_AIRDROP.end.beforeStart
          : undefined;
    }
  };

  const blur = (key: FieldKey) => setErrors((prev) => ({ ...prev, [key]: fieldError(key) }));

  const checkFields = (keys: FieldKey[]): FieldKey[] => {
    const next: Partial<Record<FieldKey, string>> = {};
    const bad: FieldKey[] = [];
    for (const key of keys) {
      const message = fieldError(key);
      next[key] = message;
      if (message) bad.push(key);
    }
    setErrors((prev) => ({ ...prev, ...next }));
    return bad;
  };

  const goTo = (step: StepKey) => {
    setSubmitError(null);
    set('step', step);
  };

  /** Shows the step that holds the first bad field, so every link in the error summary has a target. */
  const showFieldErrors = (bad: FieldKey[]) => {
    const step = STEP_ORDER.find((key) => STEP_FIELDS[key].some((field) => bad.includes(field))) ?? form.step;
    set('step', step);
    setSubmitError({ message: CREATE_AIRDROP.fieldErrors, fields: bad.filter((field) => STEP_FIELDS[step].includes(field)) });
  };

  const advance = () => {
    const bad = checkFields(STEP_FIELDS[form.step]);
    if (bad.length > 0) {
      showFieldErrors(bad);
      return;
    }
    goTo(STEP_ORDER[Math.min(STEP_ORDER.indexOf(form.step) + 1, STEP_ORDER.length - 1)]);
  };

  const submit = async () => {
    const bad = checkFields([...STEP_FIELDS.what, ...STEP_FIELDS.when]);
    if (bad.length > 0) {
      showFieldErrors(bad);
      return;
    }
    if (!wallet.isConnected || !wallet.address) {
      setSubmitError({ message: errorMessage('NOT_CONNECTED'), fields: [] });
      return;
    }
    if (!wallet.signCashScriptTransaction) {
      setSubmitError({ message: errorMessage('WALLET_UNSUPPORTED'), fields: [] });
      return;
    }

    setCreating(true);
    setSubmitError(null);
    try {
      const meta = form.tokenType === 'FUNGIBLE_TOKEN' ? await resolveTokenMeta(category, network) : null;
      const payload = {
        creator: wallet.address,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        campaignType: 'AIRDROP',
        tokenType: form.tokenType,
        tokenCategory: form.tokenType === 'FUNGIBLE_TOKEN' ? category : undefined,
        tokenDecimals: meta?.decimals ?? 0,
        totalAmount: parseFloat(form.totalAmount),
        amountPerClaim: parseFloat(form.amountPerClaim),
        startDate: localDayStart(form.startDate),
        endDate: form.endDate ? localDayEnd(form.endDate) : undefined,
        requireKyc: false,
        maxClaimsPerAddress: 1,
      };

      const response = await authFetch('/api/airdrops/create', {
        wallet,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch((error: unknown) => {
        console.warn('Create airdrop response was not JSON', error);
        return null;
      });
      if (!response.ok) throw apiFailure(body, response.status, 'UNKNOWN');
      const createdId = (body as { campaign?: { id?: string } } | null)?.campaign?.id;
      if (!createdId) throw apiFailure(body, response.status, 'SERVER_PREPARE_FAILED');
      writeSaved(null);
      navigate(`/airdrops/${createdId}`, { state: { freshCreate: true } });
    } catch (error) {
      console.error('Airdrop was not created', error);
      setSubmitError({ message: asFlowError(error).message, fields: [] });
      setCreating(false);
    }
  };

  const plan = (
    <PlanSentence
      schedule={{
        kind: 'per-claim',
        perClaim: share > 0 ? form.amountPerClaim : '',
        maxClaims: capacity,
        asset,
        closesAt: closes ? closes * 1000 : undefined,
      }}
      sticky
    />
  );

  const tokenHelper = (() => {
    if (!validCategory) return CREATE_AIRDROP.tokenId.helper;
    if (!lookupDone) return CREATE_AIRDROP.tokenId.helper;
    if (tokenMeta?.name || tokenMeta?.symbol) return CREATE_AIRDROP.tokenId.found(tokenMeta.name ?? tokenMeta.symbol ?? '');
    return CREATE_AIRDROP.tokenId.noDetails;
  })();

  const stepIndex = STEP_ORDER.indexOf(form.step);

  const main = (
    <Panel>
      <div className="flex flex-col gap-6">
        {form.step === 'what' ? (
          <>
            <Input
              id={FIELD_ID.title}
              label={CREATE_AIRDROP.name.label}
              helper={CREATE_AIRDROP.name.helper}
              placeholder={CREATE_AIRDROP.name.placeholder}
              value={form.title}
              onChange={(event) => set('title', event.target.value)}
              onBlur={() => blur('title')}
              error={errors.title}
            />
            <Textarea
              label={CREATE_AIRDROP.message.label}
              optional
              helper={CREATE_AIRDROP.message.helper}
              placeholder={CREATE_AIRDROP.message.placeholder}
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
            />
            <ChoiceCardGroup
              name="airdrop-asset"
              legend={CREATE_AIRDROP.asset.legend}
              options={ASSET_OPTIONS}
              value={form.tokenType}
              onChange={(value) => set('tokenType', value)}
            />
            {form.tokenType === 'FUNGIBLE_TOKEN' ? (
              <Input
                id={FIELD_ID.tokenCategory}
                label={CREATE_AIRDROP.tokenId.label}
                helper={tokenHelper}
                value={form.tokenCategory}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => set('tokenCategory', event.target.value)}
                onBlur={() => blur('tokenCategory')}
                error={errors.tokenCategory}
              />
            ) : null}
            <AmountInput
              id={FIELD_ID.amountPerClaim}
              label={CREATE_AIRDROP.share.label}
              helper={CREATE_AIRDROP.share.helper}
              asset={asset}
              value={form.amountPerClaim}
              onChange={(value) => set('amountPerClaim', value)}
              onBlur={() => blur('amountPerClaim')}
              error={errors.amountPerClaim}
            />
            <AmountInput
              id={FIELD_ID.totalAmount}
              label={CREATE_AIRDROP.pool.label}
              helper={capacity ? `${CREATE_AIRDROP.pool.helper} ${CREATE_AIRDROP.capacity(capacity)}` : CREATE_AIRDROP.pool.helper}
              asset={asset}
              value={form.totalAmount}
              onChange={(value) => set('totalAmount', value)}
              onBlur={() => blur('totalAmount')}
              error={errors.totalAmount}
            />
            <Notice tone="info" title={LABELS.whoCanMoveTheMoney}>
              {AIRDROP_ACCESS} {AIRDROP_COSIGN}
            </Notice>
          </>
        ) : null}

        {form.step === 'when' ? (
          <>
            <DateInput
              id={FIELD_ID.startDate}
              label={CREATE_AIRDROP.start.label}
              helper={CREATE_AIRDROP.start.helper}
              value={form.startDate}
              onChange={(value) => set('startDate', value)}
              onBlur={() => blur('startDate')}
              error={errors.startDate}
            />
            <DateInput
              id={FIELD_ID.endDate}
              label={`${CREATE_AIRDROP.end.label} ${LABELS.optional}`}
              helper={CREATE_AIRDROP.end.helper}
              value={form.endDate}
              min={form.startDate || undefined}
              onChange={(value) => set('endDate', value)}
              onBlur={() => blur('endDate')}
              error={errors.endDate}
            />
          </>
        ) : null}

        {form.step === 'check' ? (
          <>
            <div className="lg:hidden">{plan}</div>
            <InsetBlock>
              <DetailList
                items={[
                  { label: CREATE_AIRDROP.name.label, value: form.title.trim() },
                  { label: CREATE_AIRDROP.share.label, value: share > 0 ? formatAmount(form.amountPerClaim, asset) : null },
                  { label: CREATE_AIRDROP.pool.label, value: poolText },
                  { label: CREATE_AIRDROP.start.label, value: formatDate(opens) },
                  { label: CREATE_AIRDROP.end.label, value: formatDate(closes) },
                  { label: LABELS.whoCanMoveTheMoney, value: CREATE_AIRDROP.whoCanMove },
                ]}
              />
            </InsetBlock>
            <p className="text-small text-ink-secondary">{AIRDROP_ACCESS}</p>
            <p className="text-small text-ink-secondary">{AIRDROP_FEE_FROM_POOL}</p>
            <p className="text-body text-ink">{poolText ? CREATE_AIRDROP.next(poolText) : CREATE_AIRDROP.nextUnknown}</p>
          </>
        ) : null}

        {form.step !== 'check' ? <div className="lg:hidden">{plan}</div> : null}
        {submitError ? (
          <ErrorSummary
            title={CREATE_AIRDROP.errorTitle}
            message={submitError.message}
            fields={submitError.fields.map((key) => ({ id: FIELD_ID[key], label: FIELD_LABEL[key] }))}
          />
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          {stepIndex > 0 ? (
            <Button variant="ghost" onClick={() => goTo(STEP_ORDER[stepIndex - 1])}>
              {CREATE_AIRDROP.backLabel}
            </Button>
          ) : (
            <span />
          )}
          {form.step === 'check' ? (
            <Button variant="primary" size="lg" busy={creating} busyLabel={CREATE_AIRDROP.busy} onClick={() => void submit()}>
              {CREATE_AIRDROP.submit}
            </Button>
          ) : (
            <Button variant="primary" onClick={advance}>
              {CREATE_AIRDROP.continueLabel}
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );

  return (
    <PageContainer>
      <PageHeader
        title={CREATE_AIRDROP.title}
        description={CREATE_AIRDROP.description}
        back={{ to: '/airdrops', label: CREATE_AIRDROP.back }}
      />
      <div className="mb-6">
        <Steps steps={STEPS} current={form.step} onBack={(key) => goTo(key as StepKey)} />
      </div>
      <TwoColumn main={main} side={<div className="hidden lg:block">{plan}</div>} />
    </PageContainer>
  );
}
