import { useState } from 'react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Stack } from '../../components/layout/Stack';
import {
  CardLabelled,
  OrganizationHeader,
  OrganizationSection,
} from '../../components/dao/DaoSectionNav';
import { SampleEditDialog } from '../../components/dao/DaoWorkspaceModal';
import { Address } from '../../components/ui/Address';
import { AddressInput } from '../../components/ui/AddressInput';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Plus, ShieldCheck, Users } from '../../components/ui/Icon';
import { Input } from '../../components/ui/Input';
import { List, type Column } from '../../components/ui/List';
import { Notice } from '../../components/ui/Notice';
import { Panel } from '../../components/ui/Panel';
import { Select } from '../../components/ui/Select';
import { StatRow } from '../../components/ui/StatRow';
import { StatTile } from '../../components/ui/StatTile';
import { StatusPill } from '../../components/ui/StatusPill';
import { useToast } from '../../components/ui/Toast';
import { LABELS } from '../../copy/common';
import { BUILD_NETWORK } from '../../copy/network';
import { isValidAddress } from '../../utils/address';
import {
  ACTIVITY,
  DIALOG,
  RECIPIENT_STATUS_WORD,
  RECIPIENT_USE_WORD,
  RULES,
  SAMPLE,
  approvalsWords,
  hoursWords,
  usd,
  waitWords,
  type RecipientStatus,
  type RecipientUse,
} from '../../copy/organization';
import type { DaoAssetRuleRow, DaoRecipientRow, DaoSpendingRuleRow } from '../../data/daoBeta';
import { ruleName, useDaoWorkspace, type RecipientDraft } from '../../stores/useDaoWorkspace';

const NO_RULE = '';
const EMERGENCY = /emergency/i;

const USE_OPTIONS = (Object.keys(RECIPIENT_USE_WORD) as RecipientUse[]).map((value) => ({
  value,
  label: RECIPIENT_USE_WORD[value],
}));
const STATUS_OPTIONS = (Object.keys(RECIPIENT_STATUS_WORD) as RecipientStatus[]).map((value) => ({
  value,
  label: RECIPIENT_STATUS_WORD[value],
}));

function useRuleOptions() {
  const rules = useDaoWorkspace((state) => state.rules);
  return [
    { value: NO_RULE, label: DIALOG.none },
    ...rules.map((rule) => ({ value: rule.id, label: rule.name })),
  ];
}

function NameCell({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-title-item text-ink">{title}</span>
      <span className="text-small text-ink-muted">{meta}</span>
    </div>
  );
}

function wholeNumber(text: string, min: number): number | null {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) && value >= min ? value : null;
}

function dollars(text: string): number | null {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 ? value : null;
}

function HelpList({ title, lines }: { title: string; lines: readonly string[] }) {
  return (
    <Panel title={title}>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-ink-secondary">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Panel>
  );
}

type RuleForm = {
  name: string;
  approvals: string;
  signers: string;
  perPayment: string;
  daily: string;
  wait: string;
  assets: string;
};

function toRuleForm(rule?: DaoSpendingRuleRow): RuleForm {
  if (!rule)
    return {
      name: '',
      approvals: '',
      signers: '',
      perPayment: '',
      daily: '',
      wait: '0',
      assets: '',
    };
  return {
    name: rule.name,
    approvals: String(rule.approvalsNeeded),
    signers: String(rule.signerCount),
    perPayment: String(rule.limitPerPaymentUsd),
    daily: String(rule.dailyLimitUsd),
    wait: String(rule.waitHours),
    assets: rule.assets,
  };
}

function RuleDialog({
  rule,
  onClose,
  onRemove,
}: {
  rule?: DaoSpendingRuleRow;
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  const saveRule = useDaoWorkspace((state) => state.saveRule);
  const { toast } = useToast();
  const [form, setForm] = useState<RuleForm>(() => toRuleForm(rule));
  const [submitted, setSubmitted] = useState(false);

  const name = form.name.trim();
  const approvals = wholeNumber(form.approvals, 1);
  const signers = approvals === null ? null : wholeNumber(form.signers, approvals);
  const perPayment = dollars(form.perPayment);
  const daily = dollars(form.daily);
  const wait = wholeNumber(form.wait, 0);
  const errors = {
    name: name ? undefined : DIALOG.nameMissing,
    approvals: approvals === null ? RULES.errors.approvals : undefined,
    signers: approvals !== null && signers === null ? RULES.errors.signers(approvals) : undefined,
    perPayment: perPayment === null ? RULES.errors.limit : undefined,
    daily: daily === null ? RULES.errors.limit : undefined,
    wait: wait === null ? RULES.errors.wait : undefined,
  };
  const shown = (key: keyof typeof errors) => (submitted ? errors[key] : undefined);
  const update = (key: keyof RuleForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = () => {
    setSubmitted(true);
    if (
      !name ||
      approvals === null ||
      signers === null ||
      perPayment === null ||
      daily === null ||
      wait === null
    )
      return;
    saveRule(
      {
        name,
        approvalsNeeded: approvals,
        signerCount: signers,
        limitPerPaymentUsd: perPayment,
        dailyLimitUsd: daily,
        waitHours: wait,
        assets: form.assets.trim(),
      },
      rule?.id
    );
    toast({ tone: 'success', title: rule ? ACTIVITY.ruleUpdated : ACTIVITY.ruleAdded });
    onClose();
  };

  const numberProps = { type: 'number', inputMode: 'numeric' as const, min: 0 };

  return (
    <SampleEditDialog
      open
      title={rule ? RULES.dialog.editTitle : RULES.dialog.addTitle}
      line={RULES.dialog.line}
      saveLabel={rule ? DIALOG.save : RULES.dialog.create}
      onSave={save}
      onClose={onClose}
      remove={rule ? { label: RULES.remove.action, onSelect: () => onRemove(rule.id) } : undefined}
    >
      <Input
        label={RULES.fields.name}
        value={form.name}
        placeholder={RULES.fields.namePlaceholder}
        onChange={(event) => update('name', event.target.value)}
        error={shown('name')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          {...numberProps}
          label={RULES.fields.approvals}
          value={form.approvals}
          onChange={(event) => update('approvals', event.target.value)}
          error={shown('approvals')}
        />
        <Input
          {...numberProps}
          label={RULES.fields.signers}
          value={form.signers}
          onChange={(event) => update('signers', event.target.value)}
          error={shown('signers')}
        />
        <Input
          {...numberProps}
          label={RULES.fields.perPayment}
          value={form.perPayment}
          placeholder={RULES.fields.limitPlaceholder}
          onChange={(event) => update('perPayment', event.target.value)}
          error={shown('perPayment')}
        />
        <Input
          {...numberProps}
          label={RULES.fields.daily}
          value={form.daily}
          placeholder={RULES.fields.limitPlaceholder}
          onChange={(event) => update('daily', event.target.value)}
          error={shown('daily')}
        />
      </div>
      <Input
        {...numberProps}
        label={RULES.fields.wait}
        helper={RULES.fields.waitHelper}
        value={form.wait}
        onChange={(event) => update('wait', event.target.value)}
        error={shown('wait')}
      />
      <Input
        label={RULES.fields.assets}
        optional
        value={form.assets}
        placeholder={RULES.fields.assetsPlaceholder}
        onChange={(event) => update('assets', event.target.value)}
      />
    </SampleEditDialog>
  );
}

function AssetRuleDialog({ row, onClose }: { row: DaoAssetRuleRow; onClose: () => void }) {
  const saveAssetRule = useDaoWorkspace((state) => state.saveAssetRule);
  const ruleOptions = useRuleOptions();
  const { toast } = useToast();
  const [ruleId, setRuleId] = useState(row.ruleId ?? NO_RULE);
  const [daily, setDaily] = useState(row.dailyLimitUsd === null ? '' : String(row.dailyLimitUsd));
  const [goesTo, setGoesTo] = useState(row.goesTo);
  const [notes, setNotes] = useState(row.notes);
  const [submitted, setSubmitted] = useState(false);

  const dailyValue = daily.trim() === '' ? null : dollars(daily);
  const dailyError =
    submitted && daily.trim() !== '' && dailyValue === null ? RULES.errors.limit : undefined;

  const save = () => {
    setSubmitted(true);
    if (daily.trim() !== '' && dailyValue === null) return;
    saveAssetRule(row.id, {
      ruleId: ruleId === NO_RULE ? null : ruleId,
      dailyLimitUsd: dailyValue,
      goesTo: goesTo.trim(),
      notes: notes.trim(),
    });
    toast({ tone: 'success', title: ACTIVITY.assetRuleUpdated });
    onClose();
  };

  return (
    <SampleEditDialog
      open
      title={RULES.assets.editTitle}
      line={RULES.assets.line}
      saveLabel={DIALOG.save}
      onSave={save}
      onClose={onClose}
    >
      <p className="text-title-item text-ink">{row.asset}</p>
      <Select
        label={RULES.assets.defaultRule}
        options={ruleOptions}
        value={ruleId}
        onValueChange={setRuleId}
      />
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        label={RULES.fields.daily}
        optional
        helper={RULES.assets.dailyHelper}
        value={daily}
        onChange={(event) => setDaily(event.target.value)}
        error={dailyError}
      />
      <Input
        label={RULES.assets.goesTo}
        optional
        value={goesTo}
        placeholder={RULES.assets.goesToPlaceholder}
        onChange={(event) => setGoesTo(event.target.value)}
      />
      <Input
        label={RULES.assets.notes}
        optional
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />
    </SampleEditDialog>
  );
}

const EMPTY_RECIPIENT: RecipientDraft = {
  name: '',
  address: '',
  usedFor: 'payroll',
  assets: '',
  ruleId: null,
  status: 'underReview',
};

function RecipientDialog({
  row,
  onClose,
  onRemove,
}: {
  row?: DaoRecipientRow;
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  const saveRecipient = useDaoWorkspace((state) => state.saveRecipient);
  const ruleOptions = useRuleOptions();
  const { toast } = useToast();
  const [draft, setDraft] = useState<RecipientDraft>(() => (row ? { ...row } : EMPTY_RECIPIENT));
  const [submitted, setSubmitted] = useState(false);

  const isNew = !row;
  const name = draft.name.trim();
  const address = draft.address.trim();
  const addressMissing = isNew && !address;
  const nameError = submitted && !name ? DIALOG.nameMissing : undefined;
  const addressError = submitted && addressMissing ? RULES.recipients.addressMissing : undefined;
  const update = <K extends keyof RecipientDraft>(key: K, value: RecipientDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = () => {
    setSubmitted(true);
    if (!name || addressMissing || (address && address !== row?.address && !isValidAddress(address, BUILD_NETWORK))) return;
    saveRecipient({ ...draft, name, address, assets: draft.assets.trim() }, row?.id);
    toast({ tone: 'success', title: row ? ACTIVITY.recipientUpdated : ACTIVITY.recipientAdded });
    onClose();
  };

  return (
    <SampleEditDialog
      open
      title={row ? RULES.recipients.editTitle : RULES.recipients.addTitle}
      line={RULES.recipients.line}
      saveLabel={row ? DIALOG.save : RULES.recipients.create}
      onSave={save}
      onClose={onClose}
      remove={
        row ? { label: RULES.removeRecipient.action, onSelect: () => onRemove(row.id) } : undefined
      }
    >
      <Input
        label={RULES.recipients.name}
        value={draft.name}
        placeholder={RULES.recipients.namePlaceholder}
        onChange={(event) => update('name', event.target.value)}
        error={nameError}
      />
      <AddressInput
        label={RULES.recipients.addressLabel}
        helper={isNew ? RULES.recipients.newAddressHelper : RULES.recipients.addressHelper}
        network={BUILD_NETWORK}
        value={draft.address}
        onChange={(value) => update('address', value)}
        error={addressError}
      />
      <Select
        label={RULES.recipients.usedFor}
        options={USE_OPTIONS}
        value={draft.usedFor}
        onValueChange={(value) => update('usedFor', value)}
      />
      <Input
        label={RULES.recipients.assets}
        optional
        value={draft.assets}
        placeholder={RULES.fields.assetsPlaceholder}
        onChange={(event) => update('assets', event.target.value)}
      />
      <Select
        label={RULES.recipients.rule}
        options={ruleOptions}
        value={draft.ruleId ?? NO_RULE}
        onValueChange={(value) => update('ruleId', value === NO_RULE ? null : value)}
      />
      <Select
        label={RULES.recipients.status}
        helper={RULES.recipients.statusHelper}
        options={STATUS_OPTIONS}
        value={draft.status}
        onValueChange={(value) => update('status', value)}
      />
    </SampleEditDialog>
  );
}

type Editing =
  | { kind: 'rule'; row?: DaoSpendingRuleRow }
  | { kind: 'asset'; row: DaoAssetRuleRow }
  | { kind: 'recipient'; row?: DaoRecipientRow };

type Removing =
  | { kind: 'rule'; row: DaoSpendingRuleRow }
  | { kind: 'recipient'; row: DaoRecipientRow };

export function DaoTreasuryPolicyPage() {
  const { rules, assetRules, recipients, removeRule, removeRecipient } = useDaoWorkspace();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<Removing | null>(null);

  const approvedCount = recipients.filter((row) => row.status === 'approved').length;
  const emergencyRule = rules.find((rule) => EMERGENCY.test(rule.name));
  const openAddRule = () => setEditing({ kind: 'rule' });
  const openAddRecipient = () => setEditing({ kind: 'recipient' });

  const ruleColumns: Column<DaoSpendingRuleRow>[] = [
    {
      key: 'rule',
      header: RULES.list.rule,
      primary: true,
      mobile: 'top',
      cell: (row) => <NameCell title={row.name} meta={row.assets || DIALOG.none} />,
    },
    {
      key: 'approvals',
      header: RULES.list.approvals,
      mobile: 'bottom-end',
      cell: (row) => approvalsWords(row.approvalsNeeded, row.signerCount),
    },
    {
      key: 'perPayment',
      header: RULES.list.perPayment,
      align: 'end',
      mobile: 'bottom-start',
      cell: (row) => (
        <CardLabelled before={RULES.upTo} after={RULES.each}>
          {usd(row.limitPerPaymentUsd)}
        </CardLabelled>
      ),
    },
    {
      key: 'daily',
      header: RULES.list.daily,
      align: 'end',
      mobile: 'bottom-start',
      mobileLabel: RULES.list.daily,
      cell: (row) => usd(row.dailyLimitUsd),
    },
    {
      key: 'wait',
      header: RULES.list.wait,
      mobile: 'bottom-end',
      cell: (row) => waitWords(row.waitHours),
    },
  ];

  const assetColumns: Column<DaoAssetRuleRow>[] = [
    {
      key: 'asset',
      header: RULES.assets.asset,
      primary: true,
      mobile: 'top',
      cell: (row) => <NameCell title={row.asset} meta={row.notes || DIALOG.none} />,
    },
    {
      key: 'rule',
      header: RULES.assets.defaultRule,
      mobile: 'bottom-start',
      mobileLabel: RULES.list.rule,
      cell: (row) => ruleName(rules, row.ruleId) ?? DIALOG.none,
    },
    {
      key: 'daily',
      header: RULES.assets.daily,
      align: 'end',
      mobile: 'bottom-end',
      cell: (row) =>
        row.dailyLimitUsd === null ? (
          RULES.noDailyLimit
        ) : (
          <CardLabelled before={RULES.assets.daily}>{usd(row.dailyLimitUsd)}</CardLabelled>
        ),
    },
    {
      key: 'goesTo',
      header: RULES.assets.goesTo,
      mobile: 'hidden',
      cell: (row) => row.goesTo || DIALOG.none,
    },
  ];

  const recipientColumns: Column<DaoRecipientRow>[] = [
    {
      key: 'recipient',
      header: RULES.recipients.recipient,
      primary: true,
      mobile: 'top',
      cell: (row) => <NameCell title={row.name} meta={RECIPIENT_USE_WORD[row.usedFor]} />,
    },
    {
      key: 'address',
      header: RULES.recipients.address,
      mobile: 'hidden',
      cell: (row) =>
        row.address ? <Address value={row.address} copy={false} /> : RULES.recipients.noAddress,
    },
    {
      key: 'assets',
      header: RULES.recipients.assets,
      mobile: 'hidden',
      cell: (row) => row.assets || DIALOG.none,
    },
    {
      key: 'rule',
      header: RULES.recipients.rule,
      mobile: 'bottom-start',
      mobileLabel: RULES.list.rule,
      cell: (row) => ruleName(rules, row.ruleId) ?? DIALOG.none,
    },
    {
      key: 'status',
      header: RULES.recipients.status,
      mobile: 'bottom-end',
      cell: (row) => <StatusPill status={row.status} size="sm" />,
    },
  ];

  const startRemove = (next: Removing) => {
    setEditing(null);
    setRemoving(next);
  };

  const confirmRemove = async () => {
    if (!removing) return;
    if (removing.kind === 'rule') {
      removeRule(removing.row.id);
      toast({ tone: 'success', title: RULES.remove.done });
    } else {
      removeRecipient(removing.row.id);
      toast({ tone: 'success', title: RULES.removeRecipient.done });
    }
    setRemoving(null);
  };

  const removeCopy =
    removing?.kind === 'rule'
      ? { ...RULES.remove, title: RULES.remove.title(removing.row.name), body: RULES.remove.body }
      : removing?.kind === 'recipient'
        ? {
            ...RULES.removeRecipient,
            title: RULES.removeRecipient.title(removing.row.name),
            body: RULES.removeRecipient.body(removing.row.name),
          }
        : null;

  return (
    <PageContainer>
      <OrganizationHeader
        page="rules"
        sample
        stateLine={SAMPLE.savedHere}
        primaryAction={
          <Button variant="primary" leadingIcon={Plus} onClick={openAddRule}>
            {RULES.add}
          </Button>
        }
      />
      <Stack>
        <Notice
          tone="info"
          title={RULES.notice.title}
          action={
            <ButtonLink variant="link" to="/vaults">
              {RULES.notice.action}
            </ButtonLink>
          }
        >
          <p>{RULES.notice.body}</p>
        </Notice>

        <StatRow>
          <StatTile label={RULES.stats.rules} value={rules.length} sub={SAMPLE.tag} />
          <StatTile label={RULES.stats.recipients} value={approvedCount} />
          <StatTile
            label={RULES.stats.emergencyWait}
            value={emergencyRule ? hoursWords(emergencyRule.waitHours) : LABELS.notSet}
          />
          <StatTile label={RULES.stats.assetRules} value={assetRules.length} />
        </StatRow>

        <OrganizationSection title={RULES.list.title} description={RULES.list.description}>
          <List
            label={RULES.list.listLabel}
            columns={ruleColumns}
            rows={rules}
            rowKey={(row) => row.id}
            onRowOpen={(row) => setEditing({ kind: 'rule', row })}
            state={rules.length > 0 ? 'ready' : 'empty'}
            empty={
              <EmptyState
                icon={ShieldCheck}
                title={RULES.empty.title}
                description={RULES.empty.description}
                action={
                  <Button variant="primary" leadingIcon={Plus} onClick={openAddRule}>
                    {RULES.add}
                  </Button>
                }
              />
            }
            noResults={null}
            error={null}
          />
        </OrganizationSection>

        <OrganizationSection title={RULES.assets.title} description={RULES.assets.description}>
          <List
            label={RULES.assets.listLabel}
            columns={assetColumns}
            rows={assetRules}
            rowKey={(row) => row.id}
            onRowOpen={(row) => setEditing({ kind: 'asset', row })}
            state="ready"
            empty={null}
            noResults={null}
            error={null}
          />
        </OrganizationSection>

        <OrganizationSection
          title={RULES.recipients.title}
          description={RULES.recipients.description}
          action={
            <Button variant="secondary" size="sm" leadingIcon={Plus} onClick={openAddRecipient}>
              {RULES.recipients.add}
            </Button>
          }
        >
          <List
            label={RULES.recipients.listLabel}
            columns={recipientColumns}
            rows={recipients}
            rowKey={(row) => row.id}
            onRowOpen={(row) => setEditing({ kind: 'recipient', row })}
            state={recipients.length > 0 ? 'ready' : 'empty'}
            empty={
              <EmptyState
                icon={Users}
                title={RULES.recipients.empty}
                description={RULES.recipients.emptyLine}
              />
            }
            noResults={null}
            error={null}
          />
        </OrganizationSection>

        <HelpList title={RULES.help.title} lines={RULES.help.lines} />
      </Stack>

      {editing?.kind === 'rule' ? (
        <RuleDialog
          key={editing.row?.id ?? 'new'}
          rule={editing.row}
          onClose={() => setEditing(null)}
          onRemove={(id) => {
            const row = rules.find((rule) => rule.id === id);
            if (row) startRemove({ kind: 'rule', row });
          }}
        />
      ) : null}
      {editing?.kind === 'asset' ? (
        <AssetRuleDialog key={editing.row.id} row={editing.row} onClose={() => setEditing(null)} />
      ) : null}
      {editing?.kind === 'recipient' ? (
        <RecipientDialog
          key={editing.row?.id ?? 'new'}
          row={editing.row}
          onClose={() => setEditing(null)}
          onRemove={(id) => {
            const row = recipients.find((recipient) => recipient.id === id);
            if (row) startRemove({ kind: 'recipient', row });
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removeCopy !== null}
        title={removeCopy?.title ?? ''}
        body={removeCopy?.body ?? ''}
        confirmLabel={removeCopy?.action ?? ''}
        keepLabel={removeCopy?.keep ?? ''}
        tone="danger"
        busyLabel={removeCopy?.busy ?? ''}
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />
    </PageContainer>
  );
}
