import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Stack } from '../components/layout/Stack';
import { Address } from '../components/ui/Address';
import { AddressInput } from '../components/ui/AddressInput';
import { Amount } from '../components/ui/Amount';
import { AmountInput } from '../components/ui/AmountInput';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { DetailList } from '../components/ui/DetailList';
import { ErrorSummary } from '../components/ui/ErrorSummary';
import { Heading } from '../components/ui/Heading';
import { Input } from '../components/ui/Input';
import { Notice } from '../components/ui/Notice';
import { PublicKeyInput } from '../components/ui/PublicKeyInput';
import { RadioGroup } from '../components/ui/Radio';
import { Select } from '../components/ui/Select';
import { Steps } from '../components/ui/Steps';
import { Switch } from '../components/ui/Switch';
import { Textarea } from '../components/ui/Textarea';
import { TermHint } from '../components/ui/TermHint';
import { TransactionReview } from '../components/ui/TransactionReview';
import { TxLink } from '../components/ui/TxLink';
import type { Asset } from '../components/ui/types';
import { ACTIONS, LABELS } from '../copy/common';
import { asFlowError, errorMessage, type FlowError } from '../copy/errors';
import { formatAmount } from '../copy/format';
import { addressErrors } from '../copy/network';
import { NETWORK_FEE_CEILING_BCH } from '../copy/pricing';
import {
  VAULT_CREATE,
  VAULT_DETAIL,
  everyDays,
  reachedNetwork,
  sameAddress,
  signersRequiredShort,
} from '../copy/vaults';
import { useNetwork } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import { createVault, updateVaultBalance } from '../utils/api';
import { depositToVault } from '../utils/blockchain';

const BCH: Asset = { kind: 'bch' };
const SIGNER_COUNT = 3;

type StepKey = 'name' | 'signers' | 'money' | 'check';
type Interval = (typeof VAULT_CREATE.intervals)[number]['value'];
type Approvals = '1' | '2';
type SignerRow = { address: string; addressValid: boolean; publicKey: string; keyValid: boolean };
type Errors = Record<string, string>;
type CreatedVault = { id: string; contractAddress: string };

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'name', label: VAULT_CREATE.steps.name },
  { key: 'signers', label: VAULT_CREATE.steps.signers },
  { key: 'money', label: VAULT_CREATE.steps.money },
  { key: 'check', label: VAULT_CREATE.steps.check },
];

const ORDER: StepKey[] = STEPS.map((step) => step.key);

const emptySigner = (): SignerRow => ({
  address: '',
  addressValid: false,
  publicKey: '',
  keyValid: false,
});

const fieldId = (key: string) => `vault-${key}`;

export default function CreateVaultPage() {
  const [params] = useSearchParams();
  const wallet = useWallet();
  const network = useNetwork();
  const [step, setStep] = useState<StepKey>('name');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [signers, setSigners] = useState<SignerRow[]>(() =>
    Array.from({ length: SIGNER_COUNT }, emptySigner)
  );
  const [approvals, setApprovals] = useState<Approvals>('2');
  const [deposit, setDeposit] = useState('');
  const [howOften, setHowOften] = useState<Interval>('2592000');
  const [release, setRelease] = useState('');
  const [limit, setLimit] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [errorLabels, setErrorLabels] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<FlowError | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedVault | null>(null);
  const [depositing, setDepositing] = useState(false);
  const [deposited, setDeposited] = useState<'no' | 'yes' | 'syncing'>('no');
  const [depositTxid, setDepositTxid] = useState<string | null>(null);

  if (params.get('type') === 'grants') return <Navigate to="/grants/create" replace />;

  const depositValue = Number.parseFloat(deposit);
  const releaseValue = Number.parseFloat(release);
  const limitValue = Number.parseFloat(limit);
  const walletBch = wallet.balance?.bch ?? null;
  const depositLabel = formatAmount(Number.isFinite(depositValue) ? depositValue : 0, BCH) ?? '';
  const coversDeposit = walletBch === null || depositValue + NETWORK_FEE_CEILING_BCH <= walletBch;

  const updateSigner = (index: number, patch: Partial<SignerRow>) => {
    setSigners((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const fillMyWallet = () => {
    if (!wallet.address) return;
    updateSigner(0, {
      address: wallet.address,
      addressValid: true,
      publicKey: wallet.publicKey ?? '',
      keyValid: Boolean(wallet.publicKey),
    });
  };

  const validate = (key: StepKey): { errors: Errors; labels: Record<string, string> } => {
    const next: Errors = {};
    const labels: Record<string, string> = {};
    const add = (field: string, label: string, message: string) => {
      next[field] = message;
      labels[field] = label;
    };
    const checkAll = key === 'check';
    if (key === 'name' || checkAll) {
      if (!name.trim()) add('name', VAULT_CREATE.name.label, VAULT_CREATE.name.required);
    }
    if (key === 'signers' || checkAll) {
      signers.forEach((row, i) => {
        const label = VAULT_CREATE.signers.signer(i + 1);
        if (!row.address.trim()) add(`address-${i}`, label, VAULT_CREATE.signers.addressRequired);
        else if (!row.addressValid) add(`address-${i}`, label, addressErrors(network).notAnAddress);
        else if (signers.some((other, j) => j < i && sameAddress(other.address, row.address))) {
          add(`address-${i}`, label, VAULT_CREATE.signers.duplicate);
        }
        const keyLabel = `${label}: ${VAULT_CREATE.signers.publicKey}`;
        if (!row.publicKey.trim()) add(`key-${i}`, keyLabel, VAULT_CREATE.signers.keyRequired);
        else if (!row.keyValid) add(`key-${i}`, keyLabel, VAULT_CREATE.signers.keyInvalid);
      });
    }
    if (key === 'money' || checkAll) {
      if (!Number.isFinite(depositValue) || depositValue <= 0) {
        add('deposit', VAULT_CREATE.money.deposit, VAULT_CREATE.money.depositRequired);
      } else if (depositValue > VAULT_CREATE.maxDeposit) {
        add('deposit', VAULT_CREATE.money.deposit, VAULT_CREATE.money.depositTooLarge);
      } else if (!coversDeposit) {
        add('deposit', VAULT_CREATE.money.deposit, VAULT_CREATE.insufficient(depositLabel));
      }
      if (!Number.isFinite(releaseValue) || releaseValue <= 0) {
        add('release', VAULT_CREATE.money.releaseAmount, VAULT_CREATE.money.releaseRequired);
      }
    }
    return { errors: next, labels };
  };

  const goTo = (key: StepKey) => {
    setErrors({});
    setErrorLabels({});
    setStep(key);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validate(step);
    setErrors(result.errors);
    setErrorLabels(result.labels);
    if (Object.keys(result.errors).length > 0) return;
    const index = ORDER.indexOf(step);
    if (step === 'check') void create();
    else setStep(ORDER[index + 1]);
  };

  const create = async () => {
    if (creating || created || !wallet.address) return;
    setCreating(true);
    setSubmitError(null);
    try {
      const vault = await createVault(
        {
          name: name.trim(),
          description: description.trim() || undefined,
          totalDeposit: depositValue,
          spendingCap: Number.isFinite(limitValue) && limitValue > 0 ? limitValue : 0,
          approvalThreshold: Number(approvals),
          signers: signers.map((row) => row.address.trim()),
          signerPubkeys: signers.map((row) => row.publicKey.trim()),
          cycleDuration: Number(howOften),
          unlockAmount: releaseValue,
          isPublic,
        },
        wallet
      );
      setCreated({
        id: String(vault.id ?? ''),
        contractAddress: String(vault.contractAddress ?? ''),
      });
    } catch (error) {
      setSubmitError(asFlowError(error));
    } finally {
      setCreating(false);
    }
  };

  const runDeposit = async () => {
    if (!created) return {};
    let txid: string;
    try {
      txid = await depositToVault(
        wallet,
        created.contractAddress,
        depositValue,
        undefined,
        created.id
      );
    } catch (error) {
      if (reachedNetwork(error)) {
        setDepositTxid(asFlowError(error).txid ?? null);
        setDeposited('syncing');
      }
      throw error;
    }
    setDepositTxid(txid);
    setDeposited('syncing');
    await updateVaultBalance(created.id, txid, depositValue, wallet);
    setDeposited('yes');
    return { txid };
  };

  const header = (
    <PageHeader
      title={VAULT_CREATE.title}
      description={VAULT_CREATE.description}
      back={{ to: '/vaults', label: VAULT_CREATE.back }}
    />
  );

  if (created) {
    return (
      <PageContainer width="reading">
        {header}
        <Card>
          <div className="flex flex-col gap-4">
            {created.contractAddress ? (
              <Heading level="section" as="h2">
                {VAULT_CREATE.created.title}
              </Heading>
            ) : (
              <Notice tone="warning" title={VAULT_CREATE.created.notSetUpTitle}>
                {VAULT_CREATE.created.notSetUpLine}
              </Notice>
            )}
            {deposited === 'yes' ? (
              <Notice tone="success" title={VAULT_CREATE.created.done} />
            ) : deposited === 'syncing' ? (
              <Notice tone="warning" title={errorMessage('SENT_NOT_SYNCED', { outcome: 'deposit' })}>
                {depositTxid ? <TxLink txid={depositTxid} network={network} /> : null}
              </Notice>
            ) : created.contractAddress ? (
              <p className="text-body text-ink-secondary">
                {VAULT_CREATE.created.depositLine(depositLabel)}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <ButtonLink
                to={`/vaults/${created.id}`}
                variant={deposited !== 'no' || !created.contractAddress ? 'primary' : 'secondary'}
              >
                {VAULT_CREATE.created.goToVault}
              </ButtonLink>
              {deposited !== 'no' || !created.contractAddress ? null : (
                <Button variant="primary" onClick={() => setDepositing(true)}>
                  {VAULT_CREATE.created.deposit(depositLabel)}
                </Button>
              )}
            </div>
          </div>
        </Card>
        {created.contractAddress ? (
          <TransactionReview
            open={depositing}
            onClose={() => setDepositing(false)}
            title={VAULT_CREATE.created.depositReviewTitle(depositLabel)}
            summary={{
              direction: 'out',
              leavesWallet: { amount: String(depositValue), asset: BCH },
              goesTo: { address: created.contractAddress, name: name.trim() },
              network,
            }}
            checks={
              walletBch === null
                ? []
                : [
                    {
                      label: VAULT_CREATE.money.deposit,
                      ok: coversDeposit,
                      fix: VAULT_CREATE.insufficient(depositLabel),
                    },
                  ]
            }
            run={runDeposit}
            next={
              <div className="flex flex-col gap-2">
                <p>{VAULT_CREATE.created.done}</p>
                <div>
                  <ButtonLink to={`/vaults/${created.id}`} variant="secondary" size="sm">
                    {VAULT_CREATE.created.goToVault}
                  </ButtonLink>
                </div>
              </div>
            }
          />
        ) : null}
      </PageContainer>
    );
  }

  const invalid = Object.keys(errors);
  const intervalWords = everyDays(Number(howOften)) ?? '';

  return (
    <PageContainer width="reading">
      {header}
      <Stack>
        <Steps steps={STEPS} current={step} onBack={(key) => goTo(key as StepKey)} />
        <form noValidate onSubmit={submit} className="flex flex-col gap-6">
          {step === 'name' ? (
            <>
              <Input
                id={fieldId('name')}
                label={VAULT_CREATE.name.label}
                helper={VAULT_CREATE.name.helper}
                placeholder={VAULT_CREATE.name.placeholder}
                value={name}
                onChange={(event) => setName(event.target.value)}
                error={errors.name}
              />
              <Textarea
                label={VAULT_CREATE.name.description}
                optional
                helper={VAULT_CREATE.name.descriptionHelper}
                placeholder={VAULT_CREATE.name.descriptionPlaceholder}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
              />
              <Switch
                label={VAULT_CREATE.name.public}
                description={VAULT_CREATE.name.publicLine}
                checked={isPublic}
                onChange={setIsPublic}
              />
            </>
          ) : null}

          {step === 'signers' ? (
            <>
              <div className="flex flex-col gap-1 text-body text-ink-secondary">
                <p>
                  {VAULT_CREATE.signers.intro}{' '}
                  <TermHint term="publicKey">{VAULT_CREATE.signers.publicKey}</TermHint>
                </p>
                <p className="text-small">{VAULT_CREATE.signers.fixed}</p>
              </div>
              {signers.map((row, i) => (
                <fieldset
                  key={i}
                  className="flex flex-col gap-4 rounded-card border border-line p-4"
                >
                  <legend className="px-1 text-label text-ink">
                    {VAULT_CREATE.signers.signer(i + 1)}
                  </legend>
                  {i === 0 && wallet.address && !sameAddress(row.address, wallet.address) ? (
                    <div>
                      <Button variant="secondary" size="sm" onClick={fillMyWallet}>
                        {VAULT_CREATE.signers.useMine}
                      </Button>
                    </div>
                  ) : null}
                  <AddressInput
                    id={fieldId(`address-${i}`)}
                    label={VAULT_CREATE.signers.address}
                    helper={VAULT_CREATE.signers.addressHelper}
                    value={row.address}
                    onChange={(address) => updateSigner(i, { address })}
                    onValidChange={(addressValid) => updateSigner(i, { addressValid })}
                    network={network}
                    error={errors[`address-${i}`]}
                  />
                  <PublicKeyInput
                    id={fieldId(`key-${i}`)}
                    label={VAULT_CREATE.signers.publicKey}
                    helper={VAULT_CREATE.signers.publicKeyHelper}
                    value={row.publicKey}
                    onChange={(publicKey) => updateSigner(i, { publicKey })}
                    onValidChange={(keyValid) => updateSigner(i, { keyValid })}
                    error={
                      errors[`key-${i}`] ??
                      (i === 0 && sameAddress(row.address, wallet.address) && !row.publicKey
                        ? VAULT_CREATE.signers.noPublicKey
                        : undefined)
                    }
                  />
                </fieldset>
              ))}
              <RadioGroup<Approvals>
                legend={VAULT_CREATE.signers.approvals}
                name="vault-approvals"
                value={approvals}
                onChange={setApprovals}
                options={[
                  { value: '1', label: VAULT_CREATE.signers.approvalsOption(1) },
                  { value: '2', label: VAULT_CREATE.signers.approvalsOption(2) },
                ]}
              />
              <p className="text-small text-ink-muted">{VAULT_CREATE.signers.approvalsLine}</p>
            </>
          ) : null}

          {step === 'money' ? (
            <>
              <AmountInput
                id={fieldId('deposit')}
                label={VAULT_CREATE.money.deposit}
                helper={
                  depositValue >= 1000 && Number.isInteger(depositValue)
                    ? VAULT_CREATE.money.looksLikeSats
                    : VAULT_CREATE.money.depositHelper
                }
                asset={BCH}
                value={deposit}
                onChange={setDeposit}
                balance={walletBch === null ? null : formatAmount(walletBch, BCH)}
                error={errors.deposit}
              />
              <Select<Interval>
                label={VAULT_CREATE.money.howOften}
                helper={VAULT_CREATE.money.howOftenHelper}
                value={howOften}
                onValueChange={setHowOften}
                options={[...VAULT_CREATE.intervals]}
              />
              <AmountInput
                id={fieldId('release')}
                label={VAULT_CREATE.money.releaseAmount}
                helper={VAULT_CREATE.money.releaseHelper}
                asset={BCH}
                value={release}
                onChange={setRelease}
                error={errors.release}
              />
              <AmountInput
                label={`${VAULT_CREATE.money.limit} ${LABELS.optional}`}
                helper={VAULT_CREATE.money.limitHelper}
                asset={BCH}
                value={limit}
                onChange={setLimit}
              />
            </>
          ) : null}

          {step === 'check' ? (
            <Card>
              <div className="flex flex-col gap-4">
                <Heading level="item" as="h2">
                  {VAULT_CREATE.check.title}
                </Heading>
                <DetailList
                  items={[
                    { label: VAULT_CREATE.name.label, value: name.trim() },
                    { label: VAULT_CREATE.name.description, value: description.trim() },
                    {
                      label: VAULT_DETAIL.details.visibility,
                      value: isPublic
                        ? VAULT_DETAIL.details.publicValue
                        : VAULT_DETAIL.details.privateValue,
                    },
                    {
                      label: VAULT_CREATE.money.deposit,
                      value: <Amount value={deposit || '0'} asset={BCH} />,
                    },
                    {
                      label: VAULT_CREATE.money.releaseAmount,
                      value: release
                        ? `${formatAmount(releaseValue, BCH) ?? ''} ${intervalWords}`
                        : null,
                    },
                    {
                      label: VAULT_CREATE.money.limit,
                      value: limitValue > 0 ? formatAmount(limitValue, BCH) : null,
                    },
                    {
                      label: VAULT_CREATE.signers.approvals,
                      value: signersRequiredShort(Number(approvals), SIGNER_COUNT),
                    },
                  ]}
                />
                <div className="flex flex-col gap-2">
                  <p className="text-label text-ink-secondary">{VAULT_CREATE.check.signersLabel}</p>
                  <ul className="flex flex-col gap-2">
                    {signers.map((row, i) => (
                      <li key={i} className="flex flex-col gap-0.5">
                        <span className="text-small text-ink-muted">
                          {VAULT_CREATE.signers.signer(i + 1)}
                        </span>
                        <Address
                          value={row.address}
                          variant="full"
                          isYou={sameAddress(row.address, wallet.address)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-small text-ink-secondary">{VAULT_CREATE.check.fixedNote}</p>
                <p className="text-small text-ink-secondary">{VAULT_CREATE.check.createNote}</p>
                <Notice tone="info" title={VAULT_CREATE.check.sendingNote} />
              </div>
            </Card>
          ) : null}

          {invalid.length > 0 ? (
            <ErrorSummary
              title={VAULT_CREATE.check.errorTitle}
              message={VAULT_CREATE.check.fixFields}
              fields={invalid.map((key) => ({ label: errorLabels[key] ?? key, id: fieldId(key) }))}
            />
          ) : null}
          {submitError ? (
            <ErrorSummary title={VAULT_CREATE.check.errorTitle} message={submitError.message} />
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            {step === 'name' ? (
              <ButtonLink to="/vaults" variant="ghost">
                {VAULT_CREATE.back}
              </ButtonLink>
            ) : (
              <Button variant="ghost" onClick={() => goTo(ORDER[ORDER.indexOf(step) - 1])}>
                {ACTIONS.back}
              </Button>
            )}
            {step === 'check' ? (
              <Button
                type="submit"
                variant="primary"
                busy={creating}
                busyLabel={VAULT_CREATE.check.creating}
              >
                {VAULT_CREATE.check.create}
              </Button>
            ) : (
              <Button type="submit" variant="primary">
                {ACTIONS.continue}
              </Button>
            )}
          </div>
        </form>
      </Stack>
    </PageContainer>
  );
}
