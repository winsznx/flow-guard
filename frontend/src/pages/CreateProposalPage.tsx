import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
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
import { ErrorState } from '../components/ui/ErrorState';
import { ErrorSummary } from '../components/ui/ErrorSummary';
import { Notice } from '../components/ui/Notice';
import { Skeleton } from '../components/ui/Skeleton';
import { Textarea } from '../components/ui/Textarea';
import { TransactionReview } from '../components/ui/TransactionReview';
import type { Asset } from '../components/ui/types';
import { asFlowError, type FlowError } from '../copy/errors';
import { formatAmount } from '../copy/format';
import { addressErrors } from '../copy/network';
import { REQUEST_CREATE } from '../copy/requests';
import { signersRequiredShort, vaultTitle } from '../copy/vaults';
import { useNetwork } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import { createProposal, fetchVault } from '../utils/api';
import { authFetch, type WalletForAuth } from '../utils/auth';
import { createProposalOnChain } from '../utils/blockchain';

const BCH: Asset = { kind: 'bch' };
const FIELD_IDS = {
  recipient: 'request-recipient',
  amount: 'request-amount',
  reason: 'request-reason',
} as const;

type VaultSummary = {
  name: string;
  balance: number | null;
  spendingCap: number;
  approvalThreshold: number;
  signerCount: number;
  isSigner: boolean;
};

type Errors = Partial<Record<keyof typeof FIELD_IDS, string>>;

function toSummary(raw: Record<string, unknown>): VaultSummary {
  const id = typeof raw.id === 'string' ? raw.id : '';
  const balance = typeof raw.balance === 'number' && raw.contractAddress ? raw.balance / 1e8 : null;
  return {
    name: vaultTitle({ id, name: typeof raw.name === 'string' ? raw.name : null }),
    balance,
    spendingCap: Number(raw.spendingCap) || 0,
    approvalThreshold: Number(raw.approvalThreshold) || 0,
    signerCount: Array.isArray(raw.signers) ? raw.signers.length : 0,
    isSigner: raw.role === 'creator' || raw.role === 'signer',
  };
}

/** A request whose signature never went out leaves a pending row behind. The server marks it abandoned. */
async function abandonRequest(requestId: string, wallet: WalletForAuth): Promise<void> {
  const response = await authFetch(`/api/proposals/${requestId}`, { wallet, method: 'DELETE' });
  if (!response.ok) console.warn('Abandoned spending request was not cleaned up', response.status);
}

export default function CreateProposalPage() {
  const { id = '' } = useParams<{ id: string }>();
  const wallet = useWallet();
  const network = useNetwork();
  const [vault, setVault] = useState<VaultSummary | null>(null);
  const [loadError, setLoadError] = useState<FlowError | null>(null);
  const [recipient, setRecipient] = useState('');
  const [recipientValid, setRecipientValid] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [reviewing, setReviewing] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const raw = await fetchVault(id, wallet.address || undefined);
      setVault(toSummary(raw));
    } catch (error) {
      setLoadError(asFlowError(error));
    }
  }, [id, wallet.address]);

  useEffect(() => {
    void load();
  }, [load]);

  const backAction = { to: `/vaults/${id}`, label: REQUEST_CREATE.back };
  const description = vault
    ? REQUEST_CREATE.description(vault.name)
    : REQUEST_CREATE.descriptionFallback;

  if (loadError) {
    return (
      <PageContainer width="reading">
        <PageHeader title={REQUEST_CREATE.title} description={description} back={backAction} />
        <ErrorState
          title={REQUEST_CREATE.loadFailedTitle}
          reason={loadError.message}
          onRetry={load}
        />
      </PageContainer>
    );
  }

  if (!vault) {
    return (
      <PageContainer width="reading">
        <PageHeader title={REQUEST_CREATE.title} description={description} back={backAction} />
        <Skeleton kind="row" lines={4} />
      </PageContainer>
    );
  }

  const canSign = Boolean(wallet.signCashScriptTransaction);
  const amountValue = Number.parseFloat(amount);

  const validate = (): Errors => {
    const next: Errors = {};
    if (!recipient.trim()) next.recipient = REQUEST_CREATE.recipientRequired;
    else if (!recipientValid) next.recipient = addressErrors(network).notAnAddress;
    if (!Number.isFinite(amountValue) || amountValue <= 0)
      next.amount = REQUEST_CREATE.amountRequired;
    else if (vault.spendingCap > 0 && amountValue > vault.spendingCap) {
      next.amount = REQUEST_CREATE.overLimit(formatAmount(vault.spendingCap, BCH) ?? '');
    } else if (vault.balance !== null && amountValue > vault.balance) {
      next.amount = REQUEST_CREATE.overBalance(formatAmount(vault.balance, BCH) ?? '');
    }
    if (!reason.trim()) next.reason = REQUEST_CREATE.reasonRequired;
    return next;
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length === 0) setReviewing(true);
  };

  const run = async () => {
    const trimmed = recipient.trim();
    const created = await createProposal(
      id,
      { recipient: trimmed, amount: amountValue, reason: reason.trim() },
      wallet
    );
    try {
      const txid = await createProposalOnChain(wallet, created.id, wallet.publicKey || '', {
        vaultId: id,
        proposalId: created.id,
        amount: amountValue,
        toAddress: trimmed,
      });
      setDone(true);
      return { txid };
    } catch (error) {
      const flow = asFlowError(error);
      if (!flow.txid && flow.code !== 'SEND_UNCONFIRMED' && flow.code !== 'SENT_NOT_SYNCED') {
        await abandonRequest(String(created.id), wallet).catch((cleanup: unknown) => {
          console.warn('Abandoned spending request was not cleaned up', cleanup);
        });
      }
      throw error;
    }
  };

  const fieldLabels: Record<keyof typeof FIELD_IDS, string> = {
    recipient: REQUEST_CREATE.recipient,
    amount: REQUEST_CREATE.amount,
    reason: REQUEST_CREATE.reason,
  };
  const invalid = (Object.keys(errors) as (keyof typeof FIELD_IDS)[]).filter((key) => errors[key]);

  return (
    <PageContainer width="reading">
      <PageHeader title={REQUEST_CREATE.title} description={description} back={backAction} />
      <Stack>
        <Card>
          <div className="flex flex-col gap-2">
            <p className="text-label text-ink-secondary">{REQUEST_CREATE.vaultSummary}</p>
            <DetailList
              items={[
                {
                  label: REQUEST_CREATE.heldLabel,
                  value:
                    vault.balance === null ? null : <Amount value={vault.balance} asset={BCH} />,
                },
                {
                  label: REQUEST_CREATE.limitLabel,
                  value:
                    vault.spendingCap > 0
                      ? REQUEST_CREATE.limitValue(formatAmount(vault.spendingCap, BCH) ?? '')
                      : REQUEST_CREATE.noLimit,
                },
                {
                  label: REQUEST_CREATE.approvalsLabel,
                  value: signersRequiredShort(vault.approvalThreshold, vault.signerCount),
                },
              ]}
            />
          </div>
        </Card>

        {!vault.isSigner ? (
          <Notice tone="neutral" title={REQUEST_CREATE.signersOnly} />
        ) : !canSign ? (
          <Notice tone="warning" title={REQUEST_CREATE.cantSign} />
        ) : (
          <form noValidate onSubmit={submit} className="flex flex-col gap-6">
            <AddressInput
              id={FIELD_IDS.recipient}
              label={REQUEST_CREATE.recipient}
              helper={REQUEST_CREATE.recipientHelper}
              value={recipient}
              onChange={setRecipient}
              onValidChange={setRecipientValid}
              network={network}
              error={errors.recipient}
              required
            />
            <AmountInput
              id={FIELD_IDS.amount}
              label={REQUEST_CREATE.amount}
              helper={REQUEST_CREATE.amountHelper}
              asset={BCH}
              value={amount}
              onChange={setAmount}
              error={errors.amount}
              required
            />
            <Textarea
              id={FIELD_IDS.reason}
              label={REQUEST_CREATE.reason}
              helper={REQUEST_CREATE.reasonHelper}
              placeholder={REQUEST_CREATE.reasonPlaceholder}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              error={errors.reason}
              rows={3}
            />
            {invalid.length > 0 ? (
              <ErrorSummary
                title={REQUEST_CREATE.errorTitle}
                message={REQUEST_CREATE.fixFields}
                fields={invalid.map((key) => ({ label: fieldLabels[key], id: FIELD_IDS[key] }))}
              />
            ) : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              {done ? (
                <ButtonLink to={`/vaults/${id}`} variant="primary">
                  {REQUEST_CREATE.back}
                </ButtonLink>
              ) : (
                <>
                  <ButtonLink to={`/vaults/${id}`} variant="ghost">
                    {REQUEST_CREATE.back}
                  </ButtonLink>
                  <Button type="submit" variant="primary">
                    {REQUEST_CREATE.submit}
                  </Button>
                </>
              )}
            </div>
          </form>
        )}
      </Stack>

      <TransactionReview
        open={reviewing}
        onClose={() => setReviewing(false)}
        title={REQUEST_CREATE.review.title}
        consequence={{
          tone: 'info',
          body: REQUEST_CREATE.review.consequence(vault.approvalThreshold),
        }}
        plan={
          <div className="flex flex-col gap-1">
            <Amount value={amount} asset={BCH} size="lg" />
            <Address value={recipient.trim()} variant="full" />
            <p className="text-body text-ink-secondary">{reason.trim()}</p>
          </div>
        }
        summary={{ direction: 'fee-only', network }}
        run={run}
        next={
          <div className="flex flex-col gap-2">
            <p>{REQUEST_CREATE.review.done}</p>
            <div>
              <ButtonLink to={`/vaults/${id}`} variant="secondary" size="sm">
                {REQUEST_CREATE.back}
              </ButtonLink>
            </div>
          </div>
        }
      />
    </PageContainer>
  );
}
