import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { TwoColumn } from '../components/layout/TwoColumn';
import { Address } from '../components/ui/Address';
import { AddressInput } from '../components/ui/AddressInput';
import { AmountInput } from '../components/ui/AmountInput';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ChoiceCardGroup } from '../components/ui/ChoiceCard';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DetailList } from '../components/ui/DetailList';
import { ErrorSummary } from '../components/ui/ErrorSummary';
import { Heading } from '../components/ui/Heading';
import { Input } from '../components/ui/Input';
import { Panel } from '../components/ui/Panel';
import { PlanSentence } from '../components/ui/PlanSentence';
import { RepeatableRows } from '../components/ui/RepeatableRows';
import { Steps } from '../components/ui/Steps';
import { Switch } from '../components/ui/Switch';
import { Textarea } from '../components/ui/Textarea';
import type { Asset } from '../components/ui/types';
import { useNetwork } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import { createGrant } from '../services/grantApi';
import type { CreateGrantInput, CreateGrantMilestoneInput } from '../services/grantApi';
import { resolveTokenMeta, type TokenMeta } from '../utils/tokenMeta';
import { checkTokenCategory } from '../utils/tokenValidation';
import { asFlowError, errorMessage } from '../copy/errors';
import { assetDecimals, assetUnit, formatAmount } from '../copy/format';
import { CREATE_GRANT, GRANT_DETAIL, milestoneTotalLine, nextFundingLine, tokenAsset, whoCanMoveTheMoney } from '../copy/grants';

type StepKey = 'who' | 'milestones' | 'review';
type PaysIn = 'bch' | 'token';

interface MilestoneDraft {
  id: string;
  title: string;
  about: string;
}

interface Draft {
  step: StepKey;
  name: string;
  about: string;
  recipient: string;
  recipientValid: boolean;
  paysIn: PaysIn;
  tokenId: string;
  amount: string;
  /** The asset key the amount was typed in. A different asset hides the amount until it's entered again. */
  amountFor: string;
  milestones: MilestoneDraft[];
  cancelable: boolean;
  transferable: boolean;
}

type TokenState =
  | { kind: 'idle' }
  | { kind: 'checking'; id: string }
  | { kind: 'ok'; id: string; meta: TokenMeta | null }
  | { kind: 'error'; id: string; message: string };

type FieldKey = 'name' | 'recipient' | 'tokenId' | 'amount';

const DRAFT_KEY = 'flowguard-grant-draft-v1';
const MAX_MILESTONES = 255;
const STEP_ORDER: readonly StepKey[] = ['who', 'milestones', 'review'];
const TOKEN_ID_PATTERN = /^[0-9a-fA-F]{64}$/;
const BCH_KEY = 'bch';
const FIELD_IDS: Record<FieldKey, string> = {
  name: 'grant-name',
  recipient: 'grant-recipient',
  tokenId: 'grant-token-id',
  amount: 'grant-amount',
};

function newMilestone(): MilestoneDraft {
  return { id: `milestone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: '', about: '' };
}

function emptyDraft(): Draft {
  return {
    step: 'who',
    name: '',
    about: '',
    recipient: '',
    recipientValid: false,
    paysIn: 'bch',
    tokenId: '',
    amount: '',
    amountFor: '',
    milestones: [newMilestone(), newMilestone(), newMilestone()],
    cancelable: true,
    transferable: false,
  };
}

function isDraft(value: unknown): value is Draft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<Draft>;
  return (
    typeof draft.name === 'string' &&
    typeof draft.recipient === 'string' &&
    typeof draft.amount === 'string' &&
    Array.isArray(draft.milestones) &&
    draft.milestones.length > 0 &&
    (draft.step === 'who' || draft.step === 'milestones' || draft.step === 'review')
  );
}

function readDraft(): Draft {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return emptyDraft();
    const parsed: unknown = JSON.parse(raw);
    if (!isDraft(parsed)) return emptyDraft();
    const restored = { ...emptyDraft(), ...parsed };
    if (typeof parsed.amountFor !== 'string' && restored.paysIn === 'bch') restored.amountFor = BCH_KEY;
    return restored.paysIn === 'token' ? { ...restored, step: 'who' } : restored;
  } catch (error) {
    console.warn('Saved grant draft could not be read', error);
    return emptyDraft();
  }
}

function writeDraft(draft: Draft | null): void {
  try {
    if (draft) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else window.sessionStorage.removeItem(DRAFT_KEY);
  } catch (error) {
    console.warn('Grant draft could not be saved', error);
  }
}

function isDirty(draft: Draft): boolean {
  return Boolean(
    draft.name.trim() ||
      draft.about.trim() ||
      draft.recipient.trim() ||
      draft.tokenId.trim() ||
      draft.amount.trim() ||
      draft.milestones.some((milestone) => milestone.title.trim() || milestone.about.trim()),
  );
}

/** A display string to the asset's smallest units, exactly. Null when it isn't a number or has more decimals than the asset. */
function toUnits(amount: string, decimals: number): bigint | null {
  const match = /^(\d*)(?:\.(\d*))?$/.exec(amount.trim());
  if (!match || (match[1] === '' && (match[2] ?? '') === '')) return null;
  const fraction = match[2] ?? '';
  if (fraction.length > decimals) return null;
  return BigInt(`${match[1] || '0'}${fraction.padEnd(decimals, '0')}`);
}

function unitsToText(units: bigint, decimals: number): string {
  if (decimals === 0) return units.toString();
  const digits = units.toString().padStart(decimals + 1, '0');
  return `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}

/** The token check that belongs to the ID in the field, or idle when the field has moved on. */
function tokenFor(token: TokenState, id: string): TokenState {
  return token.kind !== 'idle' && token.id === id ? token : { kind: 'idle' };
}

/** The asset amounts are typed in, or null while the token hasn't been checked. */
function draftAsset(draft: Draft, token: TokenState): Asset | null {
  if (draft.paysIn === 'bch') return { kind: 'bch' };
  const id = draft.tokenId.trim();
  const checked = tokenFor(token, id);
  if (checked.kind !== 'ok') return null;
  return tokenAsset(id, checked.meta ? checked.meta.decimals : null, checked.meta?.symbol);
}

function assetKey(asset: Asset | null): string | null {
  if (!asset) return null;
  if (asset.kind === 'bch') return BCH_KEY;
  return `token:${asset.tokenId}:${asset.decimals}:${asset.symbol ?? ''}`;
}

/** The per-milestone amount in smallest units, or null when it's missing, zero or typed in another asset. */
function perMilestoneUnits(draft: Draft, asset: Asset | null): bigint | null {
  if (!asset || draft.amountFor !== assetKey(asset)) return null;
  const units = toUnits(draft.amount, assetDecimals(asset));
  return units !== null && units > 0n ? units : null;
}

function tokenProblem(reason: 'format' | 'not_found' | 'unavailable'): string {
  if (reason === 'format') return CREATE_GRANT.tokenFormat;
  if (reason === 'not_found') return CREATE_GRANT.tokenNotFound;
  return CREATE_GRANT.tokenUnavailable;
}

export default function CreateGrantPage() {
  const navigate = useNavigate();
  const wallet = useWallet();
  const network = useNetwork();

  const [draft, setDraft] = useState<Draft>(readDraft);
  const [token, setToken] = useState<TokenState>({ kind: 'idle' });
  const [attempted, setAttempted] = useState<Partial<Record<StepKey, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    writeDraft(draft);
  }, [draft]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSubmitError(null);
  };

  const tokenId = draft.tokenId.trim();
  const currentToken = tokenFor(token, tokenId);
  const typedAsset = draftAsset(draft, token);
  const asset: Asset = typedAsset ?? tokenAsset(tokenId, 0);
  const decimalsUnknown = currentToken.kind === 'ok' && !currentToken.meta;
  const amountShown = draft.amountFor === assetKey(typedAsset) ? draft.amount : '';

  const count = draft.milestones.length;
  const decimals = assetDecimals(asset);
  const perUnits = perMilestoneUnits(draft, typedAsset);
  const eachText = perUnits !== null ? unitsToText(perUnits, decimals) : null;
  const totalText = perUnits !== null ? unitsToText(perUnits * BigInt(count), decimals) : null;
  const eachLabel = eachText ? formatAmount(eachText, asset) : null;
  const totalLabel = totalText ? formatAmount(totalText, asset) : null;

  const checkToken = useCallback(
    async (id: string): Promise<TokenState> => {
      if (!TOKEN_ID_PATTERN.test(id)) {
        const failed: TokenState = { kind: 'error', id, message: id ? CREATE_GRANT.tokenFormat : CREATE_GRANT.tokenIdMissing };
        setToken(failed);
        return failed;
      }
      setToken({ kind: 'checking', id });
      const result = await checkTokenCategory(id, network);
      const checked: TokenState = result.ok
        ? { kind: 'ok', id, meta: await resolveTokenMeta(id, network) }
        : { kind: 'error', id, message: tokenProblem(result.reason) };
      setToken(checked);
      return checked;
    },
    [network],
  );

  useEffect(() => {
    if (draft.paysIn !== 'token' || !TOKEN_ID_PATTERN.test(tokenId) || tokenFor(token, tokenId).kind !== 'idle') return;
    void checkToken(tokenId);
  }, [draft.paysIn, tokenId, token, checkToken]);

  const whoErrors = (checked: TokenState): Partial<Record<FieldKey, string>> => {
    const errors: Partial<Record<FieldKey, string>> = {};
    const typed = draft.paysIn === 'bch' ? asset : checked.kind === 'ok' ? draftAsset(draft, checked) : null;
    if (!draft.name.trim()) errors.name = CREATE_GRANT.nameMissing;
    if (!draft.recipient.trim()) errors.recipient = CREATE_GRANT.recipientMissing;
    if (draft.paysIn === 'token' && !tokenId) errors.tokenId = CREATE_GRANT.tokenIdMissing;
    else if (draft.paysIn === 'token' && checked.kind === 'error') errors.tokenId = checked.message;
    if (!typed) errors.amount = CREATE_GRANT.amountNeedsToken;
    else if (perMilestoneUnits(draft, typed) === null) errors.amount = CREATE_GRANT.amountMissing;
    return errors;
  };

  const shownErrors = attempted.who ? whoErrors(currentToken) : {};

  const goTo = (step: StepKey) => {
    setSubmitError(null);
    update('step', step);
  };

  const continueFromWho = async () => {
    setAttempted((current) => ({ ...current, who: true }));
    let checked = currentToken;
    if (draft.paysIn === 'token' && checked.kind !== 'ok') {
      setContinuing(true);
      checked = await checkToken(tokenId);
      setContinuing(false);
    }
    const errors = whoErrors(checked);
    const firstInvalid = (Object.keys(FIELD_IDS) as FieldKey[]).find((key) => errors[key]);
    if (firstInvalid || !draft.recipientValid) {
      document.getElementById(FIELD_IDS[firstInvalid ?? 'recipient'])?.focus();
      return;
    }
    goTo('milestones');
  };

  const submit = async () => {
    if (submitting) return;
    if (!wallet.isConnected || !wallet.address) {
      setSubmitError(errorMessage('NOT_CONNECTED'));
      return;
    }
    if (!wallet.signCashScriptTransaction) {
      setSubmitError(errorMessage('WALLET_UNSUPPORTED'));
      return;
    }
    if (!eachText || !totalText) {
      goTo('who');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const milestonesInput: CreateGrantMilestoneInput[] = draft.milestones.map((milestone) => ({
        title: milestone.title.trim() || undefined,
        description: milestone.about.trim() || undefined,
      }));
      const tokenDecimals = draft.paysIn === 'token' ? decimals : 0;

      const payload: CreateGrantInput = {
        title: draft.name.trim(),
        description: draft.about.trim() || undefined,
        recipient: draft.recipient.trim(),
        tokenType: draft.paysIn === 'token' ? 'FUNGIBLE_TOKEN' : 'BCH',
        tokenCategory: draft.paysIn === 'token' ? draft.tokenId.trim() : undefined,
        tokenDecimals,
        milestonesTotal: count,
        amountPerMilestone: Number(eachText),
        totalAmount: Number(totalText),
        cancelable: draft.cancelable,
        transferable: draft.transferable,
        milestones: milestonesInput,
      };

      const result = await createGrant(payload, wallet.address);
      writeDraft(null);
      const grantId = result.grant?.id;
      if (!grantId) {
        navigate('/grants');
        return;
      }
      navigate(`/grants/${grantId}`, { state: { freshCreate: true } });
    } catch (error) {
      console.error('Grant was not created', error);
      setSubmitError(asFlowError(error).message);
      setSubmitting(false);
    }
  };

  const clearForm = async () => {
    const fresh = emptyDraft();
    setDraft(fresh);
    setToken({ kind: 'idle' });
    setAttempted({});
    setSubmitError(null);
    setConfirmClear(false);
  };

  const plan = (
    <PlanSentence
      recipient={draft.recipientValid ? { address: draft.recipient.trim() } : undefined}
      schedule={{
        kind: 'milestones',
        asset,
        milestones: eachText
          ? draft.milestones.map((milestone, index) => ({
              title: milestone.title.trim() || CREATE_GRANT.milestoneTitle(index + 1),
              amount: eachText,
            }))
          : [],
      }}
    />
  );

  const whoCanMove = whoCanMoveTheMoney(
    'sender',
    { address: wallet.address ?? '', isYou: true },
    { address: draft.recipient.trim(), isYou: false },
    draft.cancelable,
  );

  const side = (
    <div className="flex flex-col gap-4 lg:sticky lg:top-20">
      {plan}
      <Card as="section">
        <div className="flex flex-col gap-2">
          <Heading level="item" as="h2">
            {GRANT_DETAIL.whoPanel}
          </Heading>
          {whoCanMove.map((line) => (
            <p key={line} className="text-small text-ink-secondary">
              {line}
            </p>
          ))}
        </div>
      </Card>
    </div>
  );

  const tokenHelper =
    currentToken.kind === 'checking'
      ? CREATE_GRANT.tokenChecking
      : currentToken.kind === 'ok'
        ? CREATE_GRANT.tokenFound(currentToken.meta?.symbol?.trim() || null)
        : CREATE_GRANT.tokenIdHelper;

  const whoStep = (
    <Panel>
      <Input
        id={FIELD_IDS.name}
        label={CREATE_GRANT.name}
        placeholder={CREATE_GRANT.namePlaceholder}
        helper={CREATE_GRANT.nameHelper}
        value={draft.name}
        onChange={(event) => update('name', event.target.value)}
        error={shownErrors.name}
      />
      <Textarea
        label={CREATE_GRANT.about}
        optional
        placeholder={CREATE_GRANT.aboutPlaceholder}
        value={draft.about}
        onChange={(event) => update('about', event.target.value)}
        rows={3}
      />
      <AddressInput
        id={FIELD_IDS.recipient}
        label={CREATE_GRANT.recipient}
        helper={CREATE_GRANT.recipientHelper}
        value={draft.recipient}
        onChange={(value) => update('recipient', value)}
        onValidChange={(valid) => update('recipientValid', valid)}
        network={network}
        error={shownErrors.recipient}
      />
      <ChoiceCardGroup
        name="grant-pays-in"
        legend={CREATE_GRANT.paysIn}
        value={draft.paysIn}
        onChange={(value) => update('paysIn', value)}
        options={[
          { value: 'bch', ...CREATE_GRANT.paysInOptions.bch },
          { value: 'token', ...CREATE_GRANT.paysInOptions.token },
        ]}
      />
      {draft.paysIn === 'token' ? (
        <Input
          id={FIELD_IDS.tokenId}
          label={CREATE_GRANT.tokenId}
          helper={tokenHelper}
          value={draft.tokenId}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => update('tokenId', event.target.value.trim())}
          onBlur={() => {
            if (tokenId && !TOKEN_ID_PATTERN.test(tokenId)) void checkToken(tokenId);
          }}
          error={currentToken.kind === 'error' ? currentToken.message : shownErrors.tokenId}
        />
      ) : null}
      <AmountInput
        id={FIELD_IDS.amount}
        label={CREATE_GRANT.amount}
        helper={
          !typedAsset ? CREATE_GRANT.amountNeedsToken : decimalsUnknown ? CREATE_GRANT.amountHelperBase : CREATE_GRANT.amountHelper
        }
        asset={asset}
        unit={decimalsUnknown ? 'base' : 'display'}
        disabled={!typedAsset}
        value={amountShown}
        onChange={(value) => setDraft((current) => ({ ...current, amount: value, amountFor: assetKey(typedAsset) ?? '' }))}
        error={typedAsset ? shownErrors.amount : undefined}
      />
    </Panel>
  );

  const milestonesStep = (
    <>
      <Panel>
        <RepeatableRows
          legend={CREATE_GRANT.milestones}
          rows={draft.milestones}
          onChange={(rows) => update('milestones', rows)}
          makeRow={newMilestone}
          min={1}
          max={MAX_MILESTONES}
          addLabel={CREATE_GRANT.addMilestone}
          rowKey={(row) => row.id}
          renderRow={(row, index, change) => (
            <>
              <Input
                label={CREATE_GRANT.milestoneTitle(index + 1)}
                placeholder={CREATE_GRANT.milestonePlaceholder}
                value={row.title}
                onChange={(event) => change({ ...row, title: event.target.value })}
              />
              <Input
                label={CREATE_GRANT.milestoneAbout}
                optional
                placeholder={CREATE_GRANT.milestoneAboutPlaceholder}
                value={row.about}
                onChange={(event) => change({ ...row, about: event.target.value })}
              />
            </>
          )}
        />
        <p className="text-body text-ink">{milestoneTotalLine(count, eachLabel, totalLabel)}</p>
        <p className="text-small text-ink-secondary">
          {count >= MAX_MILESTONES ? CREATE_GRANT.maxMilestones : CREATE_GRANT.milestonesHelper}
        </p>
      </Panel>
      <Panel title={CREATE_GRANT.rules}>
        <Switch
          label={CREATE_GRANT.cancelable}
          description={draft.cancelable ? CREATE_GRANT.cancelableOn : CREATE_GRANT.cancelableOff}
          checked={draft.cancelable}
          onChange={(value) => update('cancelable', value)}
        />
        <Switch
          label={CREATE_GRANT.transferable}
          description={draft.transferable ? CREATE_GRANT.transferableOn : CREATE_GRANT.transferableOff}
          checked={draft.transferable}
          onChange={(value) => update('transferable', value)}
        />
      </Panel>
    </>
  );

  const yesNo = (value: boolean) => (value ? CREATE_GRANT.review.yes : CREATE_GRANT.review.no);

  const reviewStep = (
    <Panel title={CREATE_GRANT.reviewPanel}>
      <DetailList
        items={[
          { label: CREATE_GRANT.review.name, value: draft.name.trim() },
          {
            label: CREATE_GRANT.review.recipient,
            value: draft.recipient.trim() ? <Address value={draft.recipient.trim()} variant="full" /> : null,
          },
          {
            label: CREATE_GRANT.review.paysIn,
            value: draft.paysIn === 'bch' ? assetUnit(asset) : currentToken.kind === 'ok' && currentToken.meta?.symbol?.trim() ? currentToken.meta.symbol.trim() : CREATE_GRANT.paysInOptions.token.title,
          },
          { label: CREATE_GRANT.review.perMilestone, value: eachLabel },
          { label: CREATE_GRANT.review.milestones, value: String(count) },
          { label: CREATE_GRANT.review.total, value: totalLabel },
          { label: CREATE_GRANT.review.pauseOrCancel, value: yesNo(draft.cancelable) },
          { label: CREATE_GRANT.review.changeRecipient, value: yesNo(draft.transferable) },
        ]}
      />
      <p className="text-body text-ink-secondary">{nextFundingLine(totalLabel)}</p>
    </Panel>
  );

  const stepIndex = STEP_ORDER.indexOf(draft.step);
  const previous = stepIndex > 0 ? STEP_ORDER[stepIndex - 1] : null;

  const footer = (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      {previous ? (
        <Button variant="ghost" onClick={() => goTo(previous)}>
          {CREATE_GRANT.back}
        </Button>
      ) : isDirty(draft) ? (
        <Button variant="ghost" onClick={() => setConfirmClear(true)}>
          {CREATE_GRANT.clearForm}
        </Button>
      ) : (
        <span />
      )}
      {draft.step === 'who' ? (
        <Button variant="primary" onClick={() => void continueFromWho()} busy={continuing} busyLabel={CREATE_GRANT.tokenChecking}>
          {CREATE_GRANT.continue}
        </Button>
      ) : draft.step === 'milestones' ? (
        <Button variant="primary" onClick={() => goTo(eachText ? 'review' : 'who')}>
          {CREATE_GRANT.continue}
        </Button>
      ) : (
        <Button variant="primary" onClick={() => void submit()} busy={submitting} busyLabel={CREATE_GRANT.submitting}>
          {CREATE_GRANT.submit}
        </Button>
      )}
    </div>
  );

  return (
    <PageContainer>
      <PageHeader
        title={CREATE_GRANT.title}
        description={CREATE_GRANT.description}
        back={{ to: '/grants', label: CREATE_GRANT.backToGrants }}
      />
      <div className="mb-6 max-w-reading">
        <Steps steps={[...CREATE_GRANT.steps]} current={draft.step} onBack={(key) => goTo(key as StepKey)} />
      </div>
      <TwoColumn
        main={
          <div className="flex max-w-reading flex-col gap-6">
            {draft.step === 'who' ? whoStep : draft.step === 'milestones' ? milestonesStep : reviewStep}
            {submitError && draft.step === 'review' ? (
              <ErrorSummary title={CREATE_GRANT.submitFailed} message={submitError} />
            ) : null}
            {footer}
          </div>
        }
        side={side}
      />
      <ConfirmDialog
        open={confirmClear}
        title={CREATE_GRANT.clearTitle}
        body={CREATE_GRANT.clearBody}
        confirmLabel={CREATE_GRANT.clearForm}
        keepLabel={CREATE_GRANT.keepEditing}
        tone="danger"
        busyLabel={CREATE_GRANT.clearing}
        onConfirm={clearForm}
        onClose={() => setConfirmClear(false)}
      />
    </PageContainer>
  );
}
