import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Stack } from '../components/layout/Stack';
import { AddressInput } from '../components/ui/AddressInput';
import { Amount } from '../components/ui/Amount';
import { AmountInput } from '../components/ui/AmountInput';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { DateInput } from '../components/ui/DateInput';
import { DetailList } from '../components/ui/DetailList';
import { ErrorState } from '../components/ui/ErrorState';
import { ErrorSummary } from '../components/ui/ErrorSummary';
import { Heading } from '../components/ui/Heading';
import { Input } from '../components/ui/Input';
import { Notice } from '../components/ui/Notice';
import { PlanSentence } from '../components/ui/PlanSentence';
import { Select } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import { Steps } from '../components/ui/Steps';
import { TransactionReview } from '../components/ui/TransactionReview';
import { TxLink } from '../components/ui/TxLink';
import type { Asset } from '../components/ui/types';
import { BUDGET_CREATE, PLAN_DIALOG } from '../copy/budgets';
import { ACTIONS } from '../copy/common';
import { asFlowError, errorMessage, type FlowError } from '../copy/errors';
import { formatAmount, formatDate } from '../copy/format';
import { addressErrors } from '../copy/network';
import { reachedNetwork, vaultTitle } from '../copy/vaults';
import { useNetwork } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import { createBudgetPlan, fetchVaults } from '../utils/api';
import { fundBudgetPlan } from '../utils/blockchain';

const BCH: Asset = { kind: 'bch' };
const MAX_PAYMENTS = 120;

type StepKey = 'who' | 'when' | 'check';
type Interval = (typeof BUDGET_CREATE.intervals)[number]['value'];
type Field = 'vault' | 'recipient' | 'amount' | 'count';
type Errors = Partial<Record<Field, string>>;
type VaultOption = { value: string; label: string };
type Created = { id: string; contractAddress: string };

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'who', label: BUDGET_CREATE.steps.who },
  { key: 'when', label: BUDGET_CREATE.steps.when },
  { key: 'check', label: BUDGET_CREATE.steps.check },
];

const FIELD_IDS: Record<Field, string> = {
  vault: 'plan-vault',
  recipient: 'plan-recipient',
  amount: 'plan-amount',
  count: 'plan-count',
};

const FIELD_LABELS: Record<Field, string> = {
  vault: BUDGET_CREATE.vault,
  recipient: BUDGET_CREATE.recipient,
  amount: BUDGET_CREATE.amount,
  count: BUDGET_CREATE.count,
};

const FIELD_STEP: Record<Field, StepKey> = {
  vault: 'who',
  recipient: 'who',
  amount: 'when',
  count: 'when',
};

function planTotal(perPayment: string, count: number): string {
  const per = Number.parseFloat(perPayment);
  if (!Number.isFinite(per) || count <= 0) return '0';
  return String(Math.round(per * count * 1e8) / 1e8);
}

export default function CreateBudgetPlanPage() {
  const wallet = useWallet();
  const network = useNetwork();
  const [vaults, setVaults] = useState<VaultOption[] | null>(null);
  const [vaultsError, setVaultsError] = useState<FlowError | null>(null);
  const [step, setStep] = useState<StepKey>('who');
  const [vaultId, setVaultId] = useState('');
  const [recipient, setRecipient] = useState('');
  const [recipientValid, setRecipientValid] = useState(false);
  const [name, setName] = useState('');
  const [perPayment, setPerPayment] = useState('');
  const [count, setCount] = useState('');
  const [interval, setHowOften] = useState<Interval>('2592000');
  const [startDate, setStartDate] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<FlowError | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [funding, setFunding] = useState(false);
  const [funded, setFunded] = useState<'no' | 'yes' | 'syncing'>('no');
  const [fundingTxid, setFundingTxid] = useState<string | null>(null);

  const loadVaults = useCallback(async () => {
    setVaultsError(null);
    try {
      const response = await fetchVaults(wallet.address || undefined);
      const own: Record<string, unknown>[] = [...response.created, ...response.signerIn];
      setVaults(
        own.map((vault) => ({
          value: String(vault.vaultId ?? ''),
          label: vaultTitle({
            id: String(vault.id ?? ''),
            name: typeof vault.name === 'string' ? vault.name : null,
          }),
        }))
      );
    } catch (error) {
      setVaultsError(asFlowError(error));
    }
  }, [wallet.address]);

  useEffect(() => {
    void loadVaults();
  }, [loadVaults]);

  const header = (
    <PageHeader
      title={BUDGET_CREATE.title}
      description={BUDGET_CREATE.description}
      back={{ to: '/budgets', label: BUDGET_CREATE.back }}
    />
  );

  if (vaultsError) {
    return (
      <PageContainer width="reading">
        {header}
        <ErrorState
          title={BUDGET_CREATE.noVaultsTitle}
          reason={BUDGET_CREATE.vaultsFailed}
          onRetry={loadVaults}
        />
      </PageContainer>
    );
  }

  if (!vaults) {
    return (
      <PageContainer width="reading">
        {header}
        <Skeleton kind="row" lines={4} />
      </PageContainer>
    );
  }

  if (vaults.length === 0) {
    return (
      <PageContainer width="reading">
        {header}
        <Notice
          tone="info"
          title={BUDGET_CREATE.noVaultsTitle}
          action={
            <ButtonLink to="/vaults/create" variant="primary" size="sm">
              {BUDGET_CREATE.createVault}
            </ButtonLink>
          }
        >
          {BUDGET_CREATE.noVaults}
        </Notice>
      </PageContainer>
    );
  }

  const payments = Number(count);
  const countOk = Number.isInteger(payments) && payments >= 1 && payments <= MAX_PAYMENTS;
  const perValue = Number.parseFloat(perPayment);
  const total = countOk ? planTotal(perPayment, payments) : '0';
  const totalLabel = formatAmount(total, BCH) ?? '';
  const vaultName = vaults.find((vault) => vault.value === vaultId)?.label ?? '';
  const everyDays = Math.round(Number(interval) / 86400);

  const validateStep = (key: StepKey): Errors => {
    const next: Errors = {};
    if (key === 'who' || key === 'check') {
      if (!vaultId) next.vault = BUDGET_CREATE.vaultRequired;
      if (!recipient.trim()) next.recipient = BUDGET_CREATE.recipientRequired;
      else if (!recipientValid) next.recipient = addressErrors(network).notAnAddress;
    }
    if (key === 'when' || key === 'check') {
      if (!Number.isFinite(perValue) || perValue <= 0) next.amount = BUDGET_CREATE.amountRequired;
      if (!countOk) next.count = BUDGET_CREATE.countRequired;
    }
    return next;
  };

  const goNext = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = validateStep(step);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    if (step === 'who') setStep('when');
    else if (step === 'when') setStep('check');
    else void create();
  };

  const create = async () => {
    if (creating || created) return;
    setCreating(true);
    setSubmitError(null);
    try {
      const response = await createBudgetPlan(
        vaultId,
        {
          recipient: recipient.trim(),
          recipientLabel: name.trim() || undefined,
          recipientName: name.trim() || undefined,
          totalAmount: Number(total),
          intervalSeconds: Number(interval),
          amountPerInterval: perValue,
          startDate: startDate ? Math.floor(new Date(startDate).getTime() / 1000) : undefined,
        },
        wallet
      );
      setCreated({
        id: String(response.plan?.id ?? ''),
        contractAddress: String(
          response.deployment?.contractAddress ?? response.plan?.contract_address ?? ''
        ),
      });
    } catch (error) {
      setSubmitError(asFlowError(error));
    } finally {
      setCreating(false);
    }
  };

  const invalid = (Object.keys(errors) as Field[]).filter((key) => errors[key]);
  const schedule = {
    kind: 'period-release' as const,
    perPeriod: perPayment || '0',
    everyDays,
    periods: countOk ? payments : 1,
    asset: BCH,
    vault: { id: vaultId, name: vaultName },
  };

  if (created) {
    const canFund = Boolean(created.contractAddress) && funded === 'no';
    return (
      <PageContainer width="reading">
        {header}
        <Card>
          <div className="flex flex-col gap-4">
            {created.contractAddress ? (
              <Heading level="section" as="h2">
                {BUDGET_CREATE.created.title}
              </Heading>
            ) : null}
            <PlanSentence
              recipient={{ address: recipient.trim(), name: name.trim() || undefined }}
              schedule={schedule}
            />
            {!created.contractAddress ? (
              <Notice tone="warning" title={PLAN_DIALOG.notSetUp} />
            ) : funded === 'yes' ? (
              <Notice tone="success" title={BUDGET_CREATE.created.done} />
            ) : funded === 'syncing' ? (
              <Notice tone="warning" title={errorMessage('SENT_NOT_SYNCED', { outcome: 'budgetFunded' })}>
                {fundingTxid ? <TxLink txid={fundingTxid} network={network} /> : null}
              </Notice>
            ) : (
              <p className="text-body text-ink-secondary">
                {BUDGET_CREATE.created.line(totalLabel)}
              </p>
            )}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <ButtonLink to="/budgets" variant={canFund ? 'secondary' : 'primary'}>
                {BUDGET_CREATE.created.goToPlans}
              </ButtonLink>
              {canFund ? (
                <Button variant="primary" onClick={() => setFunding(true)}>
                  {BUDGET_CREATE.created.fund(totalLabel)}
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
        {created.contractAddress ? (
          <TransactionReview
            open={funding}
            onClose={() => setFunding(false)}
            plan={
              <PlanSentence
                recipient={{ address: recipient.trim(), name: name.trim() || undefined }}
                schedule={schedule}
              />
            }
            summary={{
              direction: 'out',
              leavesWallet: { amount: total, asset: BCH },
              goesTo: {
                address: created.contractAddress,
                name: BUDGET_CREATE.created.contractName,
              },
              network,
            }}
            run={async () => {
              let txid: string;
              try {
                txid = await fundBudgetPlan(wallet, created.id);
              } catch (error) {
                if (reachedNetwork(error)) {
                  setFundingTxid(asFlowError(error).txid ?? null);
                  setFunded('syncing');
                }
                throw error;
              }
              setFunded('yes');
              return { txid };
            }}
            next={<p>{BUDGET_CREATE.created.done}</p>}
          />
        ) : null}
      </PageContainer>
    );
  }

  return (
    <PageContainer width="reading">
      {header}
      <Stack>
        <Steps
          steps={STEPS}
          current={step}
          onBack={(key) => {
            setErrors({});
            setStep(key as StepKey);
          }}
        />
        <form noValidate onSubmit={goNext} className="flex flex-col gap-6">
          {step === 'who' ? (
            <>
              <Select<string>
                id={FIELD_IDS.vault}
                label={BUDGET_CREATE.vault}
                helper={BUDGET_CREATE.vaultHelper}
                value={vaultId}
                onValueChange={setVaultId}
                options={[{ value: '', label: BUDGET_CREATE.vaultPlaceholder }, ...vaults]}
                error={errors.vault}
              />
              <AddressInput
                id={FIELD_IDS.recipient}
                label={BUDGET_CREATE.recipient}
                helper={BUDGET_CREATE.recipientHelper}
                value={recipient}
                onChange={setRecipient}
                onValidChange={setRecipientValid}
                network={network}
                error={errors.recipient}
              />
              <Input
                label={BUDGET_CREATE.name}
                optional
                helper={BUDGET_CREATE.nameHelper}
                placeholder={BUDGET_CREATE.namePlaceholder}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </>
          ) : null}

          {step === 'when' ? (
            <>
              <AmountInput
                id={FIELD_IDS.amount}
                label={BUDGET_CREATE.amount}
                helper={BUDGET_CREATE.amountHelper}
                asset={BCH}
                value={perPayment}
                onChange={setPerPayment}
                error={errors.amount}
              />
              <Select<Interval>
                label={BUDGET_CREATE.howOften}
                value={interval}
                onValueChange={setHowOften}
                options={[...BUDGET_CREATE.intervals]}
              />
              <Input
                id={FIELD_IDS.count}
                label={BUDGET_CREATE.count}
                helper={BUDGET_CREATE.countHelper}
                inputMode="numeric"
                value={count}
                onChange={(event) => setCount(event.target.value.replace(/[^\d]/g, ''))}
                error={errors.count}
              />
              <DateInput
                label={BUDGET_CREATE.start}
                helper={BUDGET_CREATE.startHelper}
                value={startDate}
                onChange={setStartDate}
              />
            </>
          ) : null}

          {step === 'check' ? (
            <Card>
              <div className="flex flex-col gap-4">
                <Heading level="item" as="h2">
                  {BUDGET_CREATE.check.title}
                </Heading>
                <PlanSentence
                  recipient={{ address: recipient.trim(), name: name.trim() || undefined }}
                  schedule={schedule}
                />
                <DetailList
                  items={[
                    { label: BUDGET_CREATE.check.recipient, value: recipient.trim() },
                    { label: BUDGET_CREATE.check.vault, value: vaultName },
                    {
                      label: BUDGET_CREATE.amount,
                      value: <Amount value={perPayment} asset={BCH} />,
                    },
                    {
                      label: BUDGET_CREATE.howOften,
                      value: BUDGET_CREATE.intervals.find((i) => i.value === interval)?.label,
                    },
                    { label: BUDGET_CREATE.count, value: count },
                    {
                      label: BUDGET_CREATE.check.total,
                      value: <Amount value={total} asset={BCH} />,
                    },
                    {
                      label: BUDGET_CREATE.check.starts,
                      value: startDate
                        ? formatDate(`${startDate}T00:00:00`)
                        : BUDGET_CREATE.check.today,
                    },
                  ]}
                />
                <p className="text-small text-ink-secondary">{BUDGET_CREATE.check.cantChange}</p>
                <p className="text-small text-ink-secondary">{BUDGET_CREATE.check.createNote}</p>
              </div>
            </Card>
          ) : null}

          {invalid.length > 0 ? (
            <ErrorSummary
              title={BUDGET_CREATE.check.errorTitle}
              message={BUDGET_CREATE.check.fixFields}
              fields={invalid
                .filter((key) => FIELD_STEP[key] === step || step === 'check')
                .map((key) => ({ label: FIELD_LABELS[key], id: FIELD_IDS[key] }))}
            />
          ) : null}
          {submitError ? (
            <ErrorSummary title={BUDGET_CREATE.check.errorTitle} message={submitError.message} />
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            {step === 'who' ? (
              <ButtonLink to="/budgets" variant="ghost">
                {BUDGET_CREATE.back}
              </ButtonLink>
            ) : (
              <Button
                variant="ghost"
                onClick={() => {
                  setErrors({});
                  setStep(step === 'check' ? 'when' : 'who');
                }}
              >
                {ACTIONS.back}
              </Button>
            )}
            {step === 'check' ? (
              <Button
                type="submit"
                variant="primary"
                busy={creating}
                busyLabel={BUDGET_CREATE.check.creating}
              >
                {BUDGET_CREATE.check.create}
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
