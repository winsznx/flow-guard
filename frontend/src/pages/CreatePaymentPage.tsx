import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { TwoColumn } from '../components/layout/TwoColumn';
import { AddressInput, CheckedCodeInput } from '../components/ui/AddressInput';
import { AmountInput } from '../components/ui/AmountInput';
import { Button } from '../components/ui/Button';
import { DateInput } from '../components/ui/DateInput';
import { DetailList } from '../components/ui/DetailList';
import { ErrorSummary } from '../components/ui/ErrorSummary';
import { Input } from '../components/ui/Input';
import { InsetBlock } from '../components/ui/InsetBlock';
import { Notice } from '../components/ui/Notice';
import { Panel } from '../components/ui/Panel';
import { PlanSentence } from '../components/ui/PlanSentence';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Select } from '../components/ui/Select';
import { Steps } from '../components/ui/Steps';
import { useNetwork } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import { sameWallet } from '../utils/address';
import { BUSY, LABELS } from '../copy/common';
import { apiFailure, asFlowError, errorMessage } from '../copy/errors';
import { formatAddress, formatAmount, formatDate } from '../copy/format';
import { CREATE_PAYMENT, INTERVAL_DAYS, INTERVAL_WORD, type PaymentInterval } from '../copy/payments';
import { FIELD_ERRORS, WHO } from '../copy/streamCreate';
import { authFetch } from '../utils/auth';
import { parseUnits, regularAddressProblem, unitsToDisplay } from '../utils/streamShapes';
import { confirmToken, tokenIdCheck, useTokenChoice } from '../utils/tokenField';

type StepKey = 'who' | 'when' | 'check';

interface FormState {
  step: StepKey;
  recipient: string;
  recipientName: string;
  payWith: 'bch' | 'token';
  tokenId: string;
  amount: string;
  interval: PaymentInterval;
  startDate: string;
  endDate: string;
}

type FieldKey = 'recipient' | 'tokenId' | 'amount' | 'startDate' | 'endDate';

const DAY_SECONDS = 86_400;
const NO_END_PAYMENTS = 12;
const STORAGE_KEY = 'flowguard:create-payment:v1';
const STEP_ORDER: StepKey[] = ['who', 'when', 'check'];
const STEPS = STEP_ORDER.map((key) => ({ key, label: CREATE_PAYMENT.steps[key] }));
const INTERVALS: PaymentInterval[] = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'YEARLY'];
const INTERVAL_OPTIONS = INTERVALS.map((value) => ({ value, label: INTERVAL_WORD[value] }));
const FIELD_ID: Record<FieldKey, string> = {
  recipient: 'payment-recipient',
  tokenId: 'payment-token-id',
  amount: 'payment-amount',
  startDate: 'payment-start',
  endDate: 'payment-end',
};
const FIELD_LABEL: Record<FieldKey, string> = {
  recipient: CREATE_PAYMENT.recipient.label,
  tokenId: WHO.tokenIdLabel,
  amount: CREATE_PAYMENT.amount.label,
  startDate: CREATE_PAYMENT.start.label,
  endDate: CREATE_PAYMENT.end.label,
};
const STEP_FIELDS: Record<StepKey, FieldKey[]> = {
  who: ['recipient', 'tokenId', 'amount'],
  when: ['startDate', 'endDate'],
  check: [],
};

function todayLocalDate(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Local midnight of a `YYYY-MM-DD` date input, in unix seconds. */
function localDayStart(value: string): number {
  return Math.floor(new Date(`${value}T00:00:00`).getTime() / 1000);
}

function freshForm(): FormState {
  return {
    step: 'who',
    recipient: '',
    recipientName: '',
    payWith: 'bch',
    tokenId: '',
    amount: '',
    interval: 'MONTHLY',
    startDate: todayLocalDate(),
    endDate: '',
  };
}

function readSaved(): FormState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return freshForm();
    const saved: Partial<FormState> = JSON.parse(raw);
    const base = freshForm();
    return {
      step: STEP_ORDER.includes(saved.step as StepKey) ? (saved.step as StepKey) : base.step,
      recipient: typeof saved.recipient === 'string' ? saved.recipient : base.recipient,
      recipientName: typeof saved.recipientName === 'string' ? saved.recipientName : base.recipientName,
      payWith: saved.payWith === 'token' ? 'token' : base.payWith,
      tokenId: typeof saved.tokenId === 'string' ? saved.tokenId : base.tokenId,
      amount: typeof saved.amount === 'string' ? saved.amount : base.amount,
      interval: INTERVALS.includes(saved.interval as PaymentInterval) ? (saved.interval as PaymentInterval) : base.interval,
      startDate: typeof saved.startDate === 'string' && saved.startDate ? saved.startDate : base.startDate,
      endDate: typeof saved.endDate === 'string' ? saved.endDate : base.endDate,
    };
  } catch (error) {
    console.warn('Saved recurring payment form could not be read', error);
    return freshForm();
  }
}

function writeSaved(form: FormState | null) {
  try {
    if (form) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Recurring payment form could not be saved in this browser', error);
  }
}

function paymentCount(form: FormState): number {
  const step = INTERVAL_DAYS[form.interval] * DAY_SECONDS;
  if (form.endDate && form.startDate) {
    const start = localDayStart(form.startDate);
    const end = localDayStart(form.endDate);
    if (end > start) return Math.max(1, Math.ceil((end - start) / step));
  }
  return NO_END_PAYMENTS;
}

function totalOf(amount: string, count: number, decimals: number): string | null {
  const each = parseUnits(amount, decimals);
  if (each === null || each <= 0n) return null;
  return unitsToDisplay(each * BigInt(count), decimals);
}

export default function CreatePaymentPage() {
  const navigate = useNavigate();
  const wallet = useWallet();
  const network = useNetwork();
  const [form, setForm] = useState<FormState>(readSaved);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitError, setSubmitError] = useState<{ message: string; fields: FieldKey[] } | null>(null);
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    writeSaved(form);
  }, [form]);

  const recipientValid = regularAddressProblem(form.recipient, network) === null;
  const token = form.payWith === 'token';
  const tokenId = token ? form.tokenId.trim() : '';
  const tokenChoice = useTokenChoice(token, form.tokenId, network);
  const asset = tokenChoice.asset;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key in FIELD_ID) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const count = paymentCount(form);
  const everyDays = INTERVAL_DAYS[form.interval];
  const startSeconds = form.startDate ? localDayStart(form.startDate) : null;
  const firstPayment = startSeconds !== null ? startSeconds + everyDays * DAY_SECONDS : null;
  const lastPayment = firstPayment !== null ? firstPayment + (count - 1) * everyDays * DAY_SECONDS : null;
  const total = totalOf(form.amount, count, tokenChoice.decimals);
  const totalText = total ? formatAmount(total, asset) : null;
  const recipientShort = recipientValid && form.recipient ? formatAddress(form.recipient) : null;
  const recipientLabel = form.recipientName.trim() || recipientShort || CREATE_PAYMENT.recipientFallback;

  const fieldError = (key: FieldKey): string | undefined => {
    switch (key) {
      case 'recipient':
        if (!form.recipient.trim()) return CREATE_PAYMENT.recipient.missing;
        if (!recipientValid) return undefined;
        if (sameWallet(form.recipient, wallet.address, network)) return CREATE_PAYMENT.recipient.yourself;
        return undefined;
      case 'tokenId': {
        if (!token) return undefined;
        if (!tokenId) return FIELD_ERRORS.tokenMissing;
        const check = tokenIdCheck(tokenId);
        return check.ok ? undefined : check.message;
      }
      case 'amount':
        if (!(Number(form.amount) > 0)) return token ? CREATE_PAYMENT.amount.missingToken : CREATE_PAYMENT.amount.missing;
        if (tokenChoice.pending || parseUnits(form.amount, tokenChoice.decimals) !== null) return undefined;
        return token ? FIELD_ERRORS.amountTokenDecimals(tokenChoice.decimals) : FIELD_ERRORS.amountBchDecimals;
      case 'startDate':
        return form.startDate ? undefined : CREATE_PAYMENT.start.missing;
      case 'endDate':
        return form.endDate && form.startDate && localDayStart(form.endDate) <= localDayStart(form.startDate)
          ? CREATE_PAYMENT.end.beforeStart
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
      if (message || (key === 'recipient' && !recipientValid)) bad.push(key);
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
    setSubmitError({ message: CREATE_PAYMENT.fieldErrors, fields: bad.filter((field) => STEP_FIELDS[step].includes(field)) });
  };

  /** Looks the token up on the network, so a wrong ID or amount shows on the first step instead of at funding. */
  const tokenProblem = async (): Promise<boolean> => {
    if (!token) return false;
    setChecking(true);
    try {
      const result = await confirmToken(tokenId, form.amount, network);
      if (result.ok) return false;
      setErrors((prev) => ({ ...prev, [result.field]: result.message }));
      showFieldErrors([result.field]);
      return true;
    } finally {
      setChecking(false);
    }
  };

  const advance = async () => {
    const bad = checkFields(STEP_FIELDS[form.step]);
    if (bad.length > 0) {
      showFieldErrors(bad);
      return;
    }
    if (form.step === 'who' && (await tokenProblem())) return;
    const index = STEP_ORDER.indexOf(form.step);
    goTo(STEP_ORDER[Math.min(index + 1, STEP_ORDER.length - 1)]);
  };

  const submit = async () => {
    const bad = checkFields([...STEP_FIELDS.who, ...STEP_FIELDS.when]);
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
      let tokenDecimals = 0;
      if (token) {
        const result = await confirmToken(tokenId, form.amount, network);
        if (!result.ok) {
          setErrors((prev) => ({ ...prev, [result.field]: result.message }));
          showFieldErrors([result.field]);
          setCreating(false);
          return;
        }
        tokenDecimals = result.decimals;
      }
      const payload = {
        sender: wallet.address,
        recipient: form.recipient.trim(),
        recipientName: form.recipientName.trim() || undefined,
        tokenType: token ? 'FUNGIBLE_TOKEN' : 'BCH',
        tokenCategory: token ? tokenId : undefined,
        tokenDecimals,
        amountPerPeriod: parseFloat(form.amount),
        interval: form.interval,
        startDate: localDayStart(form.startDate),
        // Local midnight, not end of day: the backend funds ceil((end - start) / interval) periods.
        endDate: form.endDate ? localDayStart(form.endDate) : undefined,
        pausable: true,
      };

      const response = await authFetch('/api/payments/create', {
        wallet,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch((error: unknown) => {
        console.warn('Create payment response was not JSON', error);
        return null;
      });
      if (!response.ok) throw apiFailure(body, response.status, 'UNKNOWN');

      const created = body as { payment?: { id?: string } } | null;
      const createdId = created?.payment?.id;
      if (!createdId) throw apiFailure(body, response.status, 'SERVER_PREPARE_FAILED');
      writeSaved(null);
      navigate(`/payments/${createdId}`, { state: { freshCreate: true } });
    } catch (error) {
      console.error('Recurring payment was not created', error);
      setSubmitError({ message: asFlowError(error).message, fields: [] });
      setCreating(false);
    }
  };

  const plan = (
    <PlanSentence
      recipient={recipientShort ? { address: form.recipient, name: form.recipientName.trim() || undefined } : undefined}
      schedule={{
        kind: 'recurring',
        perRelease: Number(form.amount) > 0 ? form.amount : '',
        asset,
        everyDays,
        count,
        start: (firstPayment ?? 0) * 1000,
      }}
      sticky
    />
  );

  const summary = submitError ? (
    <ErrorSummary
      title={CREATE_PAYMENT.errorTitle}
      message={submitError.message}
      fields={submitError.fields.map((key) => ({ id: FIELD_ID[key], label: FIELD_LABEL[key] }))}
    />
  ) : null;

  const stepIndex = STEP_ORDER.indexOf(form.step);
  const footer = (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      {stepIndex > 0 ? (
        <Button variant="ghost" onClick={() => goTo(STEP_ORDER[stepIndex - 1])}>
          {CREATE_PAYMENT.backLabel}
        </Button>
      ) : (
        <span />
      )}
      {form.step === 'check' ? (
        <Button variant="primary" size="lg" busy={creating} busyLabel={CREATE_PAYMENT.busy} onClick={() => void submit()}>
          {CREATE_PAYMENT.submit}
        </Button>
      ) : (
        <Button variant="primary" busy={checking} busyLabel={BUSY.checking} onClick={() => void advance()}>
          {CREATE_PAYMENT.continueLabel}
        </Button>
      )}
    </div>
  );

  const main = (
    <Panel>
      <div className="flex flex-col gap-6">
        {form.step === 'who' ? (
          <>
            <AddressInput
              id={FIELD_ID.recipient}
              label={CREATE_PAYMENT.recipient.label}
              helper={CREATE_PAYMENT.recipient.helper}
              network={network}
              accept="p2pkh"
              value={form.recipient}
              onChange={(value) => set('recipient', value)}
              onBlur={() => blur('recipient')}
              error={errors.recipient}
            />
            <Input
              label={CREATE_PAYMENT.name.label}
              optional
              helper={CREATE_PAYMENT.name.helper}
              placeholder={CREATE_PAYMENT.name.placeholder}
              value={form.recipientName}
              onChange={(event) => set('recipientName', event.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <p className="text-label text-ink">{WHO.payWith}</p>
              <div>
                <SegmentedControl
                  label={WHO.payWith}
                  value={form.payWith}
                  onChange={(payWith) => set('payWith', payWith)}
                  options={[
                    { value: 'bch', label: WHO.payBch },
                    { value: 'token', label: WHO.payToken },
                  ]}
                />
              </div>
            </div>
            {token ? (
              <CheckedCodeInput
                id={FIELD_ID.tokenId}
                label={WHO.tokenIdLabel}
                value={form.tokenId}
                onChange={(value) => set('tokenId', value)}
                check={tokenIdCheck}
                validLabel={WHO.tokenIdValid}
                pasteLabel={WHO.tokenIdPaste}
                helper={tokenChoice.helper}
                error={errors.tokenId}
              />
            ) : null}
            <AmountInput
              id={FIELD_ID.amount}
              label={CREATE_PAYMENT.amount.label}
              helper={token ? CREATE_PAYMENT.amount.helperToken : CREATE_PAYMENT.amount.helper}
              asset={tokenChoice.inputAsset}
              value={form.amount}
              onChange={(value) => set('amount', value)}
              onBlur={() => blur('amount')}
              error={errors.amount}
            />
            {token ? (
              <Notice tone="info" title={CREATE_PAYMENT.tokenNote.title}>
                {CREATE_PAYMENT.tokenNote.body}
              </Notice>
            ) : null}
          </>
        ) : null}

        {form.step === 'when' ? (
          <>
            <Select
              label={CREATE_PAYMENT.interval.label}
              helper={CREATE_PAYMENT.interval.helper}
              options={INTERVAL_OPTIONS}
              value={form.interval}
              onValueChange={(value) => set('interval', value)}
            />
            <DateInput
              id={FIELD_ID.startDate}
              label={CREATE_PAYMENT.start.label}
              helper={CREATE_PAYMENT.start.helper}
              value={form.startDate}
              onChange={(value) => set('startDate', value)}
              onBlur={() => blur('startDate')}
              error={errors.startDate}
            />
            <DateInput
              id={FIELD_ID.endDate}
              label={`${CREATE_PAYMENT.end.label} ${LABELS.optional}`}
              helper={CREATE_PAYMENT.end.helper}
              value={form.endDate}
              min={form.startDate || undefined}
              onChange={(value) => set('endDate', value)}
              onBlur={() => blur('endDate')}
              error={errors.endDate}
            />
            <Notice tone="warning" title={CREATE_PAYMENT.clockTitle}>
              {CREATE_PAYMENT.clockNotice}
            </Notice>
          </>
        ) : null}

        {form.step === 'check' ? (
          <>
            <div className="lg:hidden">{plan}</div>
            <InsetBlock>
              <DetailList
                items={[
                  { label: CREATE_PAYMENT.recipient.label, value: recipientShort ?? LABELS.notSet },
                  { label: CREATE_PAYMENT.amount.label, value: formatAmount(form.amount, asset) ?? LABELS.notSet },
                  { label: CREATE_PAYMENT.interval.label, value: INTERVAL_WORD[form.interval] },
                  { label: CREATE_PAYMENT.start.label, value: formatDate(startSeconds) ?? LABELS.notSet },
                  { label: CREATE_PAYMENT.firstPayment, value: formatDate(firstPayment) ?? LABELS.notSet },
                  { label: CREATE_PAYMENT.lastPayment, value: formatDate(lastPayment) ?? LABELS.notSet },
                  { label: LABELS.whoCanMoveTheMoney, value: CREATE_PAYMENT.whoCanMove(recipientLabel) },
                ]}
              />
            </InsetBlock>
            <p className="text-body text-ink-secondary">{CREATE_PAYMENT.claimsLine(recipientLabel)}</p>
            <p className="text-small text-ink-secondary">{token ? CREATE_PAYMENT.feesLineToken : CREATE_PAYMENT.feesLine}</p>
            <p className="text-body text-ink">{totalText ? CREATE_PAYMENT.next(totalText) : CREATE_PAYMENT.nextUnknown}</p>
          </>
        ) : null}

        {form.step !== 'check' ? <div className="lg:hidden">{plan}</div> : null}
        {summary}
        {footer}
      </div>
    </Panel>
  );

  return (
    <PageContainer>
      <PageHeader
        title={CREATE_PAYMENT.title}
        description={CREATE_PAYMENT.description}
        back={{ to: '/payments', label: CREATE_PAYMENT.back }}
      />
      <div className="mb-6">
        <Steps steps={STEPS} current={form.step} onBack={(key) => goTo(key as StepKey)} />
      </div>
      <TwoColumn main={main} side={<div className="hidden lg:block">{plan}</div>} />
    </PageContainer>
  );
}
