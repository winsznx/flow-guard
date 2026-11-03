import React, { useState, useSyncExternalStore } from 'react';
import { ClosingBand } from '../../components/marketing/ClosingBand';
import { ComparisonTable } from '../../components/marketing/ComparisonTable';
import { FactStrip } from '../../components/marketing/FactStrip';
import { FactsCard } from '../../components/marketing/FactsCard';
import { FeatureModule } from '../../components/marketing/FeatureModule';
import { HeroProductCard } from '../../components/marketing/HeroProductCard';
import { LegalPage } from '../../components/marketing/LegalPage';
import { MarketingHero } from '../../components/marketing/MarketingHero';
import { NumberedFaq } from '../../components/marketing/NumberedFaq';
import { SolutionPage } from '../../components/marketing/SolutionPage';
import { MarketingSection } from '../../components/layout/MarketingSection';
import { PageContainer } from '../../components/layout/PageContainer';
import { PageHeader } from '../../components/layout/PageHeader';
import { Prose } from '../../components/layout/Prose';
import { Stack } from '../../components/layout/Stack';
import { TwoColumn } from '../../components/layout/TwoColumn';
import { PageMeta } from '../../components/seo/PageMeta';
import { Accordion } from '../../components/ui/Accordion';
import { ActivityList } from '../../components/ui/ActivityList';
import { Address } from '../../components/ui/Address';
import { AddressInput } from '../../components/ui/AddressInput';
import { Amount } from '../../components/ui/Amount';
import { AmountInput } from '../../components/ui/AmountInput';
import { ApprovalMeter } from '../../components/ui/ApprovalMeter';
import { BackLink } from '../../components/ui/BackLink';
import { BchPriceTicker } from '../../components/ui/BchPriceTicker';
import { BetaTag } from '../../components/ui/BetaTag';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import { Button, type ButtonVariant } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { Card } from '../../components/ui/Card';
import { Checkbox } from '../../components/ui/Checkbox';
import { ChoiceCardGroup } from '../../components/ui/ChoiceCard';
import { Code } from '../../components/ui/Code';
import { Combobox } from '../../components/ui/Combobox';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ConnectGate } from '../../components/ui/ConnectGate';
import { CopyButton } from '../../components/ui/CopyButton';
import { CopyField } from '../../components/ui/CopyField';
import { DashedCard } from '../../components/ui/DashedCard';
import { DateInput } from '../../components/ui/DateInput';
import { DetailList } from '../../components/ui/DetailList';
import { Dialog } from '../../components/ui/Dialog';
import { Display } from '../../components/ui/Display';
import { Drawer, type DrawerProps } from '../../components/ui/Drawer';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { ErrorSummary } from '../../components/ui/ErrorSummary';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { FileImport } from '../../components/ui/FileImport';
import { FilterChips } from '../../components/ui/FilterChips';
import { Heading } from '../../components/ui/Heading';
import {
  Activity,
  ArrowRight,
  Award,
  Building2,
  CalendarClock,
  FileCheck,
  Gift,
  Globe,
  House,
  Icon,
  KeyRound,
  LifeBuoy,
  Pencil,
  Plus,
  Repeat,
  Settings,
  ShieldCheck,
  Target,
  Users,
  Vault,
  Vote,
  Wallet,
  Waves,
  type LucideIcon,
} from '../../components/ui/Icon';
import { IconButton } from '../../components/ui/IconButton';
import { Input } from '../../components/ui/Input';
import { InsetBlock } from '../../components/ui/InsetBlock';
import { LinkCard } from '../../components/ui/LinkCard';
import { List, type Column, type ListState } from '../../components/ui/List';
import { ListRows } from '../../components/ui/ListRows';
import { ListTable } from '../../components/ui/ListTable';
import { Menu } from '../../components/ui/Menu';
import { MilestoneList } from '../../components/ui/MilestoneList';
import { NetworkCapsule } from '../../components/ui/NetworkCapsule';
import { NoResults } from '../../components/ui/NoResults';
import { Notice } from '../../components/ui/Notice';
import { Pagination } from '../../components/ui/Pagination';
import { Panel } from '../../components/ui/Panel';
import { PlanSentence } from '../../components/ui/PlanSentence';
import { ProgressMeter } from '../../components/ui/ProgressMeter';
import { PublicKeyInput } from '../../components/ui/PublicKeyInput';
import { QrCode } from '../../components/ui/QrCode';
import { RadioGroup } from '../../components/ui/Radio';
import { ReleaseBar } from '../../components/ui/ReleaseBar';
import { RepeatableRows } from '../../components/ui/RepeatableRows';
import { RoleTag } from '../../components/ui/RoleTag';
import { RouteFallback } from '../../components/ui/RouteFallback';
import { ScheduleTimeline } from '../../components/ui/ScheduleTimeline';
import { SearchInput } from '../../components/ui/SearchInput';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Select } from '../../components/ui/Select';
import { SiteBanner } from '../../components/ui/SiteBanner';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatRow } from '../../components/ui/StatRow';
import { StatTile } from '../../components/ui/StatTile';
import { StatusPill } from '../../components/ui/StatusPill';
import { Steps } from '../../components/ui/Steps';
import { Switch } from '../../components/ui/Switch';
import { TableOfContents } from '../../components/ui/TableOfContents';
import { Tabs } from '../../components/ui/Tabs';
import { TermHint } from '../../components/ui/TermHint';
import { Textarea } from '../../components/ui/Textarea';
import { TimeInput } from '../../components/ui/TimeInput';
import { useToast, type ToastInput } from '../../components/ui/Toast';
import { Tooltip } from '../../components/ui/Tooltip';
import { TransactionReview, type ReviewSummary, type TxStep } from '../../components/ui/TransactionReview';
import { TxLink } from '../../components/ui/TxLink';
import { TxProgress } from '../../components/ui/TxProgress';
import { UptimeStrip } from '../../components/ui/UptimeStrip';
import { WalletModal } from '../../components/ui/WalletModal';
import { XIcon } from '../../components/ui/XIcon';
import type { Size, Tone } from '../../components/ui/types';
import { ACTIONS, LABELS, REVIEW, backTo, noneMatch, noneYet } from '../../copy/common';
import { errorMessage, toFlowError, type ErrorCode } from '../../copy/errors';
import { formatAmount, formatDate } from '../../copy/format';
import { connectGatePurpose } from '../../copy/network';
import { emitTransactionNotice } from '../../utils/txNotice';
import {
  ACCORDION_ITEMS,
  ACTIVITY_EVENTS,
  ADE,
  BATCH_ROWS,
  BCH,
  COMPARISON,
  CREATE_STEPS,
  FACTS,
  FACTS_CARD,
  FILTER_OPTIONS,
  FINISHED_ROWS,
  KIT_NOW,
  LEGAL_FIXTURE,
  MAYA,
  MILESTONES,
  NUMBERED_ACCORDION_ITEMS,
  PAYMENT_ROWS,
  PEOPLE_OPTIONS,
  RADIO_OPTIONS,
  ROLES,
  SAM,
  SAMPLE_CLAIM_LINK,
  SAMPLE_PUBLIC_KEY,
  SAMPLE_TXID,
  SCHEDULES,
  SCHEDULE_CHOICE_OPTIONS,
  SEGMENT_OPTIONS,
  SELECT_OPTIONS,
  SIGNERS,
  SOLUTION_FIXTURE,
  STATUS_KEYS,
  TIMELINE,
  TOC_ITEMS,
  TOKEN,
  TOKEN_NO_SYMBOL,
  TOKEN_READY_ADDRESS,
  UPTIME_DAYS,
  WAITING_TIMELINE,
  daysFromNow,
  type BatchRow,
  type CancelChoice,
  type FilterChoice,
  type IntervalChoice,
  type PaymentRow,
  type PersonChoice,
  type ScheduleChoice,
  type SegmentChoice,
} from './fixtures';

const KIT_TITLE = 'Component kit';
const KIT_DESCRIPTION = 'Every component in every state, from sample data.';

const BUTTON_VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger', 'danger-quiet', 'link'];
const SIZES: Size[] = ['sm', 'md', 'lg'];
const TONES: Tone[] = ['success', 'warning', 'danger', 'info', 'neutral'];

const ICONS: { name: string; glyph: LucideIcon }[] = [
  { name: 'Home', glyph: House },
  { name: 'Streams', glyph: Waves },
  { name: 'Recurring payments', glyph: Repeat },
  { name: 'Vaults', glyph: Vault },
  { name: 'Spending requests', glyph: FileCheck },
  { name: 'Votes', glyph: Vote },
  { name: 'Budget plans', glyph: CalendarClock },
  { name: 'Airdrops', glyph: Gift },
  { name: 'Grants', glyph: Award },
  { name: 'Bounties', glyph: Target },
  { name: 'Explorer', glyph: Activity },
  { name: 'Help', glyph: LifeBuoy },
  { name: 'Settings', glyph: Settings },
  { name: 'Organization', glyph: Building2 },
  { name: 'Team', glyph: Users },
  { name: 'Roles', glyph: KeyRound },
  { name: 'Security', glyph: ShieldCheck },
  { name: 'Wallet', glyph: Wallet },
  { name: 'Website', glyph: Globe },
];

const LIST_STATES: { value: ListState; label: string }[] = [
  { value: 'ready', label: 'Ready' },
  { value: 'loading', label: 'Loading' },
  { value: 'empty', label: 'Empty' },
  { value: 'no-results', label: 'No results' },
  { value: 'error', label: 'Failed' },
];

const PAYMENT_COLUMNS: Column<PaymentRow>[] = [
  { key: 'title', header: 'Name', cell: (row) => row.title, primary: true },
  {
    key: 'person',
    header: 'Recipient',
    cell: (row) => <Address value={row.person.address} name={row.person.name} copy={false} />,
    mobile: 'bottom-start',
  },
  {
    key: 'amount',
    header: 'Amount',
    cell: (row) => <Amount value={row.amount} asset={BCH} precision="list" />,
    align: 'end',
    sortable: true,
    mobile: 'top',
  },
  { key: 'status', header: 'Status', cell: (row) => <StatusPill status={row.status} size="sm" />, mobile: 'bottom-end', width: 'md' },
  { key: 'next', header: 'Next release', cell: (row) => formatDate(row.next) ?? LABELS.notSet, mobile: 'bottom-end', mobileLabel: 'Next', width: 'md' },
];

const TX_SUMMARIES: { key: string; label: string; summary: ReviewSummary }[] = [
  {
    key: 'out',
    label: 'Money leaves your wallet',
    summary: {
      direction: 'out',
      leavesWallet: { amount: '12.00', asset: BCH },
      goesTo: { address: SAM.address, name: SAM.name },
      feeEstimate: formatAmount('0.0000042', BCH),
      whoCanStop: 'Only you, until a release is claimed',
      network: 'mainnet',
    },
  },
  {
    key: 'in',
    label: 'Money comes in',
    summary: { direction: 'in', youReceive: { amount: '0.70', asset: BCH }, from: { address: MAYA.address, name: MAYA.name }, network: 'mainnet' },
  },
  {
    key: 'returns',
    label: 'Money comes back',
    summary: {
      direction: 'returns',
      comesBack: { amount: '8.00', asset: BCH },
      recipientKeeps: { amount: '4.00', asset: BCH },
      network: 'mainnet',
    },
  },
  {
    key: 'from-contract',
    label: 'Money leaves a contract',
    summary: {
      direction: 'out',
      source: 'contract',
      leavesLabel: 'Leaves this grant',
      leavesWallet: { amount: '3.00', asset: BCH },
      goesTo: { address: ADE.address, name: ADE.name },
      network: 'mainnet',
    },
  },
  {
    key: 'many',
    label: 'Money goes to many people',
    summary: {
      direction: 'out',
      leavesWallet: { amount: '36.00', asset: BCH },
      goesTo: { label: '12 new contracts, one for each person' },
      network: 'mainnet',
    },
  },
  {
    key: 'returns-unknown',
    label: 'Comes back, amount not known',
    summary: { direction: 'returns', comesBack: { label: 'The BCH you voted with' }, network: 'mainnet' },
  },
  { key: 'fee-only', label: 'Network fee only', summary: { direction: 'fee-only', feeEstimate: null, network: 'mainnet' } },
];

const TX_PROGRESS_SAMPLES: { label: string; steps: TxStep[] }[] = [
  { label: 'Waiting for the wallet', steps: [{ step: 'wallet', index: 1, of: 2, status: 'pending' }] },
  {
    label: 'Sent, not confirmed',
    steps: [
      { step: 'wallet', index: 1, of: 1, status: 'done' },
      { step: 'network', status: 'done' },
      { step: 'confirmed', status: 'pending' },
    ],
  },
  {
    label: 'Confirmed',
    steps: [
      { step: 'wallet', index: 1, of: 1, status: 'done' },
      { step: 'network', status: 'done' },
      { step: 'confirmed', status: 'done' },
    ],
  },
  {
    label: 'Declined',
    steps: [{ step: 'wallet', index: 1, of: 1, status: 'failed' }, { error: toFlowError('WALLET_REJECTED') }],
  },
];

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToMotionPreference(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function readMotionSnapshot(): string {
  const reduced = window.matchMedia(REDUCED_MOTION_QUERY).matches;
  const fast = getComputedStyle(document.documentElement).getPropertyValue('--duration-fast').trim();
  return `${reduced ? 'reduce' : 'full'}|${fast}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function kitFailure(code: ErrorCode): Error {
  return Object.assign(new Error(errorMessage(code)), { code });
}

async function runSample(report: (step: TxStep) => void, walletSteps: number): Promise<{ txid?: string }> {
  for (let index = 1; index <= walletSteps; index += 1) {
    report({ step: 'wallet', index, of: walletSteps, status: 'pending' });
    await wait(600);
    report({ step: 'wallet', index, of: walletSteps, status: 'done' });
  }
  report({ step: 'network', status: 'pending' });
  await wait(600);
  report({ step: 'network', status: 'done' });
  report({ step: 'confirmed', status: 'done' });
  return { txid: SAMPLE_TXID };
}

async function runDeclined(report: (step: TxStep) => void): Promise<{ txid?: string }> {
  report({ step: 'wallet', index: 1, of: 1, status: 'pending' });
  await wait(600);
  report({ error: toFlowError('WALLET_REJECTED') });
  return {};
}

async function parseSampleCsv(file: File) {
  const text = await file.text();
  const rows: BatchRow[] = [];
  const problems: { line: number; key: string; message: string }[] = [];
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line, index) => {
      if (!line) return;
      const [address = '', amount = ''] = line.split(',').map((part) => part.trim());
      if (!Number.isFinite(Number.parseFloat(amount))) {
        problems.push({ line: index + 1, key: `${index}-${address}`, message: 'Add an amount, for example 1.50.' });
        return;
      }
      rows.push({ key: `${index}-${address}`, address, amount });
    });
  return { rows, problems };
}

function KitSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-6 flex-col gap-10 border-t border-line pt-10">
      <Heading level="section" as="h2" id={`${id}-title`}>
        {title}
      </Heading>
      {children}
    </section>
  );
}

function Specimen({
  title,
  layout = 'row',
  children,
}: {
  title: string;
  layout?: 'row' | 'stack' | 'grid';
  children: React.ReactNode;
}) {
  const body =
    layout === 'row'
      ? 'flex flex-wrap items-start gap-3'
      : layout === 'stack'
        ? 'flex flex-col gap-4'
        : 'grid gap-4 md:grid-cols-2 xl:grid-cols-3';
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Heading level="item" as="h3">
        {title}
      </Heading>
      <div className={body}>{children}</div>
    </div>
  );
}

function ReducedMotionCheck() {
  const snapshot = useSyncExternalStore(subscribeToMotionPreference, readMotionSnapshot, () => 'full|');
  const [preference, fast] = snapshot.split('|');
  const reduced = preference === 'reduce';
  const result = !reduced ? 'not-run' : fast === '0ms' ? 'pass' : 'fail';

  return (
    <div data-kit-check="reduced-motion" data-result={result}>
      {result === 'pass' ? (
        <Notice tone="success" title="Animation check passed">
          Your system asks for less animation, and the fast duration is {fast}.
        </Notice>
      ) : result === 'fail' ? (
        <Notice tone="danger" title="Animation check failed">
          Your system asks for less animation, but the fast duration is {fast || LABELS.notSet}. It should be 0ms.
        </Notice>
      ) : (
        <Notice tone="info" title="Animation check not run">
          The fast duration is {fast || LABELS.notSet}. Ask for less animation in your system settings, or emulate it in the
          browser, and this check reads it again.
        </Notice>
      )}
    </div>
  );
}

function ActionsSection() {
  const { toast } = useToast();
  return (
    <KitSection id="kit-actions" title="Actions">
      {SIZES.map((size) => (
        <Specimen key={size} title={`Button, size ${size}`}>
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant} size={size}>
              {variant === 'link' ? 'See all activity' : 'Create a stream'}
            </Button>
          ))}
        </Specimen>
      ))}
      <Specimen title="Button states">
        <Button variant="primary" leadingIcon={Plus}>
          Create a stream
        </Button>
        <Button variant="secondary" trailingIcon={ArrowRight}>Continue</Button>
        <Button variant="primary" busy busyLabel="Waiting for your wallet">
          Fund
        </Button>
        <Button variant="primary" disabled disabledReason="Connect a wallet first.">
          Fund
        </Button>
        <Button variant="link" disabled disabledReason="Nothing is ready to claim yet.">
          Claim
        </Button>
      </Specimen>
      <Specimen title="Button, full width" layout="stack">
        <Button variant="primary" fullWidth>
          Approve in your wallet
        </Button>
      </Specimen>
      <Specimen title="Button link">
        <ButtonLink to="/streams/create" variant="primary">
          Create a stream
        </ButtonLink>
        <ButtonLink to="/streams">Streams</ButtonLink>
        <ButtonLink to="/help" variant="ghost">
          Help
        </ButtonLink>
        <ButtonLink to="/help" variant="link">
          How streams work
        </ButtonLink>
        <ButtonLink href="https://docs.flowguard.cash" external>
          Docs
        </ButtonLink>
        <ButtonLink to="/streams" disabled disabledReason="Opens once the stream is funded.">
          Go to stream
        </ButtonLink>
      </Specimen>
      <Specimen title="Icon button">
        <IconButton icon={Pencil} label="Rename" size="sm" />
        <IconButton icon={Pencil} label="Rename" size="md" />
        <IconButton icon={Pencil} label="Rename" disabled disabledReason="Only the sender can rename it." />
        <IconButton icon={Pencil} label="Rename" busy busyLabel="Saving" />
      </Specimen>
      <Specimen title="Copy button and back link">
        <CopyButton value={SAM.address} label={ACTIONS.copyAddress} size="sm" />
        <CopyButton value={SAM.address} label={ACTIONS.copyAddress} size="md" />
        <BackLink to="/streams" label={backTo('streams')} />
      </Specimen>
      <Specimen title="Menu">
        <Menu
          label="Stream actions"
          items={[
            { label: 'Rename', icon: Pencil, onSelect: () => toast({ tone: 'info', title: 'Rename picked' }) },
            { label: 'See activity', to: '/explorer' },
            { label: 'Docs', href: 'https://docs.flowguard.cash', external: true },
            { label: 'Cancel stream', onSelect: () => toast({ tone: 'danger', title: 'Cancel picked' }), tone: 'danger' },
          ]}
        />
        <Menu
          label="More"
          trigger="button"
          items={[
            { label: 'Copy link', onSelect: () => toast({ tone: 'success', title: 'Link copied' }) },
            { label: 'Help', to: '/help' },
          ]}
        />
      </Specimen>
    </KitSection>
  );
}

function ContainersSection() {
  const { toast } = useToast();
  return (
    <KitSection id="kit-containers" title="Containers">
      <Specimen title="Card and panel" layout="grid">
        <Card>
          <p className="text-body text-ink">A card with the standard padding.</p>
        </Card>
        <Card padding="none" as="section">
          <p className="p-4 text-body text-ink">A card with no padding, for lists.</p>
        </Card>
        <Panel title="Spending requests" description="Payments waiting for signers." action={<Button variant="secondary" size="sm">New spending request</Button>}>
          <p className="text-body text-ink-secondary">{noneYet('spending requests')}</p>
        </Panel>
        <Panel padding="none">
          <p className="p-4 text-body text-ink-secondary">A panel with no title and no padding.</p>
        </Panel>
        <InsetBlock>
          <p className="text-body text-ink">An inset area for a summary inside a card.</p>
        </InsetBlock>
        <DashedCard>
          <p className="text-body text-ink-secondary">A dashed card for something not added yet.</p>
        </DashedCard>
      </Specimen>
      <Specimen title="Link card" layout="grid">
        <LinkCard to="/streams" icon={Waves} title="Streams" description="Pay someone bit by bit over time." meta="4 active" />
        <LinkCard href="https://docs.flowguard.cash" external icon={LifeBuoy} title="Docs" description="Guides for every product." />
        <LinkCard
          onSelect={() => toast({ tone: 'info', title: 'Wallet picked' })}
          icon={Wallet}
          title="Paytaca"
          description="Browser extension or phone app"
        />
      </Specimen>
    </KitSection>
  );
}

function FieldsSection() {
  const [name, setName] = useState(`Payroll for ${SAM.name}`);
  const [note, setNote] = useState('');
  const [interval, setInterval] = useState<IntervalChoice>('30');
  const [agree, setAgree] = useState(true);
  const [cancel, setCancel] = useState<CancelChoice | null>('sender');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [choice, setChoice] = useState<ScheduleChoice | null>('step');
  const [person, setPerson] = useState<PersonChoice | null>(null);
  const [amount, setAmount] = useState('1.50');
  const [tokenAmount, setTokenAmount] = useState('');
  const [baseAmount, setBaseAmount] = useState('');
  const [address, setAddress] = useState(SAM.address);
  const [badAddress, setBadAddress] = useState('bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6b');
  const [tokenAddress, setTokenAddress] = useState(TOKEN_READY_ADDRESS);
  const [publicKey, setPublicKey] = useState(SAMPLE_PUBLIC_KEY);
  const [date, setDate] = useState('2026-12-01');
  const [time, setTime] = useState('09:00');
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<SegmentChoice>('yours');
  const [filters, setFilters] = useState<FilterChoice[]>(['active']);
  const [single, setSingle] = useState<FilterChoice[]>([]);
  const [rows, setRows] = useState<BatchRow[]>(BATCH_ROWS);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const { toast } = useToast();

  return (
    <KitSection id="kit-fields" title="Form fields">
      <Specimen title="Text" layout="grid">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} helper="Only you see this name." />
        <Input label="Reference" optional value="" onChange={() => undefined} placeholder="For example, March pay" />
        <Input label="Name" value="" onChange={() => undefined} error="Add a name so you can find it later." />
        <Input label="Search by address" dense value="" onChange={() => undefined} />
        <Input label="Name" value={`Payroll for ${SAM.name}`} onChange={() => undefined} disabled />
        <Textarea label="Note" optional maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} helper="Sam sees this note." />
      </Specimen>
      <Specimen title="Choices" layout="grid">
        <Select label="How often" options={[...SELECT_OPTIONS]} value={interval} onValueChange={setInterval} />
        <Select label="How often" options={[...SELECT_OPTIONS]} value={interval} onValueChange={setInterval} error="Pick how often it pays." />
        <Combobox label="Recipient" options={[...PEOPLE_OPTIONS]} value={person} onChange={setPerson} placeholder="Pick a person" />
        <div className="flex flex-col">
          <Checkbox
            label="I checked the address"
            description="Payments to the wrong address can't be undone."
            checked={agree}
            onChange={setAgree}
          />
          <Checkbox label={`Send a copy to ${MAYA.name}`} checked={false} onChange={() => undefined} disabled disabledReason="Maya has no wallet linked yet." />
        </div>
        <RadioGroup legend="Who can cancel" name="kit-cancel" options={[...RADIO_OPTIONS]} value={cancel} onChange={setCancel} />
        <RadioGroup
          legend="Who can cancel"
          name="kit-cancel-locked"
          options={[...RADIO_OPTIONS]}
          value="nobody"
          onChange={() => undefined}
          disabled
          disabledReason="This can't change after funding."
        />
        <Switch label="Auto-update" description="Reads new activity every 30 seconds." checked={autoUpdate} onChange={setAutoUpdate} />
        <Switch
          label="Collapse the sidebar"
          description="Shows icons only."
          checked={false}
          onChange={() => undefined}
          disabled
          disabledReason="Available on wider screens."
        />
      </Specimen>
      <Specimen title="Choice cards" layout="stack">
        <ChoiceCardGroup
          name="kit-schedule"
          legend="How it's paid"
          options={SCHEDULE_CHOICE_OPTIONS.map((option, index) =>
            index === SCHEDULE_CHOICE_OPTIONS.length - 1
              ? { ...option, disabled: true, disabledReason: "Not available for tokens yet. Pick another schedule, or pay in BCH." }
              : option,
          )}
          value={choice}
          onChange={setChoice}
          columns={3}
        />
      </Specimen>
      <Specimen title="Money and addresses" layout="grid">
        <AmountInput label="Amount" asset={BCH} value={amount} onChange={setAmount} balance="24.5" onUseMax={() => setAmount('24.5')} />
        <AmountInput label="Amount" asset={TOKEN} value={tokenAmount} onChange={setTokenAmount} balance={null} />
        <AmountInput label="Amount" asset={TOKEN} unit="base" value={baseAmount} onChange={setBaseAmount} />
        <AmountInput
          id="kit-amount-error"
          label="Amount"
          asset={BCH}
          value="40"
          onChange={() => undefined}
          balance="24.5"
          error="That's more than your wallet holds. You have 24.50 BCH."
        />
        <AddressInput label="Recipient address" network="mainnet" value={address} onChange={setAddress} />
        <AddressInput id="kit-address-error" label="Recipient address" network="mainnet" value={badAddress} onChange={setBadAddress} />
        <AddressInput label="Token-ready address" network="mainnet" accept="token-aware" value={tokenAddress} onChange={setTokenAddress} />
        <PublicKeyInput label="Signer public key" value={publicKey} onChange={setPublicKey} />
        <CopyField label="Claim link" value={SAMPLE_CLAIM_LINK} />
      </Specimen>
      <Specimen title="Dates and search" layout="grid">
        <DateInput label="Start date" value={date} onChange={setDate} />
        <DateInput label="End date" value="2026-01-01" onChange={() => undefined} error="Pick an end date after the start date." />
        <TimeInput label="Start time" value={time} onChange={setTime} />
        <SearchInput
          label="Search streams"
          placeholder="Search by address"
          value={search}
          onChange={setSearch}
          onSubmit={(value) => toast({ tone: 'info', title: `Searched for ${value || 'nothing'}` })}
        />
      </Specimen>
      <Specimen title="Segmented control and filter chips">
        <SegmentedControl label="Which vaults" options={[...SEGMENT_OPTIONS]} value={segment} onChange={setSegment} />
        <FilterChips label="Status" options={[...FILTER_OPTIONS]} selected={filters} onChange={setFilters} multiple />
        <FilterChips label="Status, one at a time" options={[...FILTER_OPTIONS]} selected={single} onChange={setSingle} />
      </Specimen>
      <Specimen title="Repeatable rows" layout="stack">
        <RepeatableRows
          legend="People to pay"
          rows={rows}
          onChange={setRows}
          makeRow={() => ({ key: `r${Date.now()}`, address: '', amount: '' })}
          min={1}
          max={5}
          addLabel="Add person"
          rowKey={(row) => row.key}
          renderRow={(row, index, update) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <AddressInput
                label={`Address ${index + 1}`}
                network="mainnet"
                value={row.address}
                onChange={(value) => update({ ...row, address: value })}
              />
              <AmountInput
                label={`Amount ${index + 1}`}
                asset={BCH}
                value={row.amount}
                onChange={(value) => update({ ...row, amount: value })}
              />
            </div>
          )}
        />
      </Specimen>
      <Specimen title="File import" layout="stack">
        <FileImport<BatchRow>
          label="People to pay"
          accept=".csv"
          limits="Up to 100 people. Regular wallet addresses only."
          parse={parseSampleCsv}
          onRows={(imported) => setImportedCount(imported.length)}
        />
        {importedCount !== null ? <p className="text-small text-ink-secondary">{`${importedCount} rows ready.`}</p> : null}
      </Specimen>
    </KitSection>
  );
}

function StatusSection() {
  return (
    <KitSection id="kit-status" title="Status and values">
      <Specimen title="Status pill, size md">
        {STATUS_KEYS.map((key) => (
          <StatusPill key={key} status={key} />
        ))}
      </Specimen>
      <Specimen title="Status pill, size sm and with a date">
        <StatusPill status="active" size="sm" />
        <StatusPill status="paused" size="sm" since={formatDate(daysFromNow(-3)) ?? undefined} />
        <StatusPill status="finished" since={formatDate(daysFromNow(-12)) ?? undefined} />
      </Specimen>
      <Specimen title="Status pill with its own words">
        <StatusPill label="Added" tone="success" />
        <StatusPill label="Changed" tone="info" />
        <StatusPill label="Fixed" tone="neutral" />
      </Specimen>
      <Specimen title="Role tag, beta tag and network capsule">
        {ROLES.map((role) => (
          <RoleTag key={role} role={role} />
        ))}
        <BetaTag />
        <NetworkCapsule network="mainnet" />
        <NetworkCapsule network="chipnet" />
        <NetworkCapsule network="mainnet" to="/status" />
      </Specimen>
      <Specimen title="Amount" layout="grid">
        <Amount value="12.00" asset={BCH} />
        <Amount value="12.00" asset={BCH} size="lg" />
        <Amount value="1234.5" asset={BCH} size="xl" />
        <Amount value="0.00000546" asset={BCH} precision="list" />
        <Amount value={123456789n} asset={BCH} />
        <Amount value="250" asset={TOKEN} />
        <Amount value="250" asset={TOKEN_NO_SYMBOL} />
        <Amount value={null} asset={BCH} />
        <Amount value="2.00" asset={BCH} fiat={{ usd: 420.5, source: 'Sample price', at: KIT_NOW }} />
      </Specimen>
      <Specimen title="Address" layout="grid">
        <Address value={SAM.address} />
        <Address value={MAYA.address} name={MAYA.name} />
        <Address value={ADE.address} isYou />
        <Address value={SAM.address} copy={false} />
        <Address value={TOKEN_READY_ADDRESS} variant="full" />
      </Specimen>
      <Specimen title="Transaction link, code, hint and tooltip">
        <TxLink txid={SAMPLE_TXID} network="mainnet" />
        <TxLink txid={SAMPLE_TXID} network="chipnet" />
        <Code>bitcoincash:</Code>
        <p className="text-body text-ink">
          Each <TermHint term="stream" /> pays out on its schedule, and a <TermHint term="vault">shared vault</TermHint> needs
          approvals.
        </p>
        <Tooltip content="Copies the claim link">
          <Button variant="secondary" size="sm">Share</Button>
        </Tooltip>
      </Specimen>
      <Specimen title="Code on its own lines" layout="stack">
        <Code block>{'address,amount\nbitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a,1.50'}</Code>
      </Specimen>
    </KitSection>
  );
}

function DataSection() {
  const [listState, setListState] = useState<ListState>('ready');
  const [activityState, setActivityState] = useState<ListState>('ready');
  const [page, setPage] = useState(2);
  const [openPage, setOpenPage] = useState(1);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const { toast } = useToast();

  const sorted = [...PAYMENT_ROWS].sort((a, b) =>
    sortDirection === 'asc' ? Number(a.amount) - Number(b.amount) : Number(b.amount) - Number(a.amount),
  );
  const listProps = {
    label: 'Streams',
    columns: PAYMENT_COLUMNS,
    rows: sorted,
    rowKey: (row: PaymentRow) => row.id,
    rowHref: (row: PaymentRow) => `/streams/${row.id}`,
    state: listState,
    empty: (
      <EmptyState
        icon={Waves}
        title={noneYet('streams')}
        description="A stream pays someone bit by bit over time."
        action={<ButtonLink to="/streams/create" variant="primary">Create a stream</ButtonLink>}
      />
    ),
    noResults: <NoResults thing="streams" onClear={() => setListState('ready')} />,
    error: <ErrorState title="Streams didn't load" reason={errorMessage('LOAD_FAILED')} onRetry={() => setListState('ready')} />,
    collapsed: { label: 'Show finished', rows: FINISHED_ROWS },
    sort: {
      key: 'amount',
      direction: sortDirection,
      onChange: () => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc')),
    },
  };

  return (
    <KitSection id="kit-data" title="Data display">
      <Specimen title="Stat tile" layout="stack">
        <StatRow>
          <StatTile label="Released so far" value={<Amount value="4.00" asset={BCH} size="lg" />} sub="of 12.00 BCH" />
          <StatTile label="Ready to claim" value={<Amount value="2.00" asset={BCH} size="lg" />} />
          <StatTile label="Active streams" value="4" state="loading" />
          <StatTile label="Total sent" value="" state="error" onRetry={() => toast({ tone: 'info', title: 'Trying again' })} />
          <StatTile label="Active streams" value="3" pageOnly />
        </StatRow>
      </Specimen>
      <Specimen title="Detail list" layout="stack">
        <DetailList
          items={[
            { label: 'Recipient', value: <Address value={SAM.address} name={SAM.name} /> },
            { label: 'Total', value: <Amount value="12.00" asset={BCH} /> },
            { label: 'Starts', value: formatDate(daysFromNow(1)) },
            { label: 'Reference', value: '' },
          ]}
        />
      </Specimen>
      <Specimen title="List" layout="stack">
        <SegmentedControl label="List state" options={LIST_STATES} value={listState} onChange={setListState} />
        <List {...listProps} rowAction={(row) => <Button variant="secondary" size="sm">{row.status === 'readyToClaim' ? 'Claim' : 'Details'}</Button>} />
      </Specimen>
      <Specimen title="List as a table" layout="stack">
        <ListTable {...listProps} onRowOpen={(row) => toast({ tone: 'info', title: `Opened ${row.title}` })} rowHref={undefined} />
      </Specimen>
      <Specimen title="List as rows" layout="stack">
        <ListRows {...listProps} />
      </Specimen>
      <Specimen title="Activity" layout="stack">
        <SegmentedControl label="Activity state" options={LIST_STATES} value={activityState} onChange={setActivityState} />
        <ActivityList events={ACTIVITY_EVENTS} state={activityState} network="mainnet" seeAllHref="/explorer" />
      </Specimen>
      <Specimen title="Pagination" layout="stack">
        <Pagination page={page} pageSize={20} total={135} onPage={setPage} />
        <Pagination page={openPage} pageSize={20} total={null} onPage={setOpenPage} />
      </Specimen>
      <Specimen title="Empty, no results and error" layout="grid">
        <EmptyState
          icon={Gift}
          title={noneYet('airdrops')}
          description="An airdrop lets many people claim from one funded pool."
          action={<ButtonLink to="/airdrops/create" variant="primary">Create an airdrop</ButtonLink>}
          learnMore={{ label: 'How airdrops work', to: '/help' }}
          example="100 SEED each for the first 500 people who claim"
        />
        <NoResults thing="airdrops" onClear={() => toast({ tone: 'info', title: noneMatch('airdrops') })} />
        <ErrorState title="Airdrops didn't load" reason={errorMessage('OFFLINE')} onRetry={() => wait(800)} />
        <ErrorState title="This page didn't load" action={<ButtonLink to="/help">Help</ButtonLink>} />
      </Specimen>
      <Specimen title="Skeleton" layout="grid">
        <Skeleton kind="text" lines={3} />
        <Skeleton kind="amount" />
        <Skeleton kind="row" lines={3} />
        <Skeleton kind="tile" />
        <Skeleton kind="pill" />
      </Specimen>
      <Specimen title="Route fallback" layout="stack">
        <InsetBlock>
          <RouteFallback />
        </InsetBlock>
      </Specimen>
      <Specimen title="QR code">
        <QrCode value={SAMPLE_CLAIM_LINK} caption="Scan to open the claim link" size={160} />
        <QrCode value={SAMPLE_CLAIM_LINK} caption="Scan to open the claim link" />
        <QrCode value={SAMPLE_CLAIM_LINK} caption="Scan to open the claim link" size={240} />
      </Specimen>
      <Specimen title="Uptime" layout="stack">
        <UptimeStrip days={UPTIME_DAYS} />
        <UptimeStrip days={[]} />
      </Specimen>
      <Specimen title="Price" layout="grid">
        <BchPriceTicker />
        <BchPriceTicker variant="card" />
      </Specimen>
    </KitSection>
  );
}

function NavigationSection() {
  const [tab, setTab] = useState('all');
  const [step, setStep] = useState('when');
  return (
    <KitSection id="kit-navigation" title="Navigation inside pages">
      <Specimen title="Tabs" layout="stack">
        <Tabs
          label="Streams"
          activeKey={tab}
          items={[
            { key: 'all', label: 'All streams', count: 4, onSelect: () => setTab('all') },
            { key: 'batches', label: 'Batches', count: 2, onSelect: () => setTab('batches') },
          ]}
        />
        <Tabs
          label="Organization"
          activeKey="spending"
          items={[
            { key: 'overview', label: 'Overview', to: '#kit-navigation' },
            { key: 'team', label: 'Team', to: '#kit-navigation' },
            { key: 'roles', label: 'Roles and approvals', to: '#kit-navigation' },
            { key: 'streams', label: 'Streams', to: '#kit-navigation' },
            { key: 'spending', label: 'Spending rules', to: '#kit-navigation' },
          ]}
        />
      </Specimen>
      <Specimen title="Steps" layout="stack">
        <Steps steps={CREATE_STEPS} current={step} onBack={setStep} />
        <div>
          <Button variant="secondary" size="sm" onClick={() => setStep('when')}>
            Reset steps
          </Button>
        </div>
      </Specimen>
      <Specimen title="Breadcrumbs" layout="stack">
        <Breadcrumbs items={[{ label: 'Streams', to: '/streams' }, { label: `Payroll for ${SAM.name}` }]} />
        <Breadcrumbs items={[{ label: 'Vaults', to: '/vaults' }, { label: 'Ops budget', to: '/vaults/v1' }, { label: 'New spending request' }]} />
      </Specimen>
      <Specimen title="Table of contents" layout="stack">
        <TableOfContents items={TOC_ITEMS} />
      </Specimen>
      <Specimen title="Accordion" layout="grid">
        <Accordion items={ACCORDION_ITEMS} />
        <Accordion items={NUMBERED_ACCORDION_ITEMS} variant="numbered" />
      </Specimen>
    </KitSection>
  );
}

function FeedbackSection() {
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [errorSummaryShown, setErrorSummaryShown] = useState(false);
  const [dialog, setDialog] = useState<Size | 'locked' | null>(null);
  const [drawer, setDrawer] = useState<DrawerProps['side'] | null>(null);
  const [confirm, setConfirm] = useState<'danger' | 'primary' | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [walletPicker, setWalletPicker] = useState(false);

  const sampleToasts: { label: string; input: ToastInput }[] = [
    { label: 'Success toast', input: { tone: 'success', title: 'Address copied' } },
    {
      label: 'Info toast',
      input: {
        tone: 'info',
        title: 'Stream funded',
        line: 'Sent. Waiting for the network to confirm.',
        link: { label: ACTIONS.viewTransaction, href: 'https://blockchair.com/bitcoin-cash' },
      },
    },
    {
      label: 'Danger toast',
      input: {
        tone: 'danger',
        title: "This didn't go through",
        line: errorMessage('OFFLINE'),
        action: { label: ACTIONS.tryAgain, onClick: () => toast({ tone: 'info', title: 'Trying again' }) },
      },
    },
  ];

  const activeReview = TX_SUMMARIES.find((item) => item.key === review);

  return (
    <KitSection id="kit-feedback" title="Overlays and feedback">
      <Specimen title="Notice" layout="stack">
        {TONES.map((tone) => (
          <Notice key={tone} tone={tone} title={`A ${tone} notice`}>
            One plain line that says what happened and what to do next.
          </Notice>
        ))}
        <Notice tone="warning" title="Your wallet is on the test network" action={<Button variant="secondary" size="sm">Switch network</Button>} live="polite">
          Its coins have no value.
        </Notice>
        {dismissed ? (
          <div>
            <Button variant="secondary" size="sm" onClick={() => setDismissed(false)}>
              Show the notice again
            </Button>
          </div>
        ) : (
          <Notice tone="info" title="You can dismiss this one" onDismiss={() => setDismissed(true)} />
        )}
      </Specimen>
      <Specimen title="Site banner" layout="stack">
        <SiteBanner kind="test-network" />
        <SiteBanner kind="sample-data" />
      </Specimen>
      <Specimen title="Error summary" layout="stack">
        {errorSummaryShown ? (
          <ErrorSummary
            title="Fix 2 things to continue"
            message="Nothing was sent."
            fields={[
              { label: 'Amount', id: 'kit-amount-error' },
              { label: 'Recipient address', id: 'kit-address-error' },
            ]}
          />
        ) : (
          <div>
            <Button variant="secondary" size="sm" onClick={() => setErrorSummaryShown(true)}>
              Show the error summary
            </Button>
          </div>
        )}
      </Specimen>
      <Specimen title="Toast">
        {sampleToasts.map((sample) => (
          <Button variant="secondary" key={sample.label} size="sm" onClick={() => toast(sample.input)}>
            {sample.label}
          </Button>
        ))}
        <Button variant="secondary"
          size="sm"
          onClick={() => emitTransactionNotice({ txHash: SAMPLE_TXID, network: 'mainnet', label: 'Stream funded' })}
        >
          Transaction notice
        </Button>
      </Specimen>
      <Specimen title="Dialog and drawer">
        {SIZES.map((size) => (
          <Button variant="secondary" key={size} size="sm" onClick={() => setDialog(size)}>
            {`Dialog ${size}`}
          </Button>
        ))}
        <Button variant="secondary" size="sm" onClick={() => setDialog('locked')}>
          Dialog that needs a choice
        </Button>
        {(['left', 'right', 'full'] as const).map((side) => (
          <Button variant="secondary" key={side} size="sm" onClick={() => setDrawer(side)}>
            {`Drawer ${side}`}
          </Button>
        ))}
      </Specimen>
      <Specimen title="Confirm dialog">
        <Button size="sm" variant="danger-quiet" onClick={() => setConfirm('danger')}>
          {`Remove ${ADE.name}`}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setConfirm('primary')}>
          Save, and fail
        </Button>
      </Specimen>
      <Specimen title="Transaction review">
        {TX_SUMMARIES.map((item) => (
          <Button variant="secondary" key={item.key} size="sm" onClick={() => setReview(item.key)}>
            {item.label}
          </Button>
        ))}
        <Button variant="secondary" size="sm" onClick={() => setReview('two-steps')}>
          Two wallet steps
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setReview('declined')}>
          Declined in the wallet
        </Button>
      </Specimen>
      <Specimen title="Transaction progress" layout="grid">
        {TX_PROGRESS_SAMPLES.map((sample) => (
          <Card key={sample.label}>
            <div className="flex flex-col gap-3">
              <p className="text-label text-ink">{sample.label}</p>
              <TxProgress steps={sample.steps} />
            </div>
          </Card>
        ))}
      </Specimen>
      <Specimen title="Wallet picker">
        <Button variant="secondary" size="sm" data-wallet-trigger onClick={() => setWalletPicker(true)}>
          {ACTIONS.connectWallet}
        </Button>
      </Specimen>
      <Specimen title="Connect gate" layout="stack">
        <ConnectGate purpose={connectGatePurpose('your streams')} />
      </Specimen>

      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === 'locked' ? 'Leave without saving?' : 'Rename the stream'}
        size={dialog === 'locked' || dialog === null ? 'md' : dialog}
        dismissible={dialog !== 'locked'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>{dialog === 'locked' ? ACTIONS.keepEditing : ACTIONS.close}</Button>
            <Button variant="primary" onClick={() => setDialog(null)}>
              {dialog === 'locked' ? ACTIONS.leave : 'Save'}
            </Button>
          </>
        }
      >
        {dialog === 'locked' ? (
          <p className="text-body text-ink-secondary">What you typed so far won&apos;t be kept.</p>
        ) : (
          <Input label="Name" value={`Payroll for ${SAM.name}`} onChange={() => undefined} />
        )}
      </Dialog>

      <Drawer open={drawer !== null} onClose={() => setDrawer(null)} side={drawer ?? 'right'} label={`Payroll for ${SAM.name}`}>
        <div className="flex flex-col gap-4 p-4">
          <Heading level="item" as="h2">
            {`Payroll for ${SAM.name}`}
          </Heading>
          <DetailList
            items={[
              { label: 'Recipient', value: <Address value={SAM.address} name={SAM.name} /> },
              { label: 'Total', value: <Amount value="12.00" asset={BCH} /> },
            ]}
          />
          <Button variant="secondary" onClick={() => setDrawer(null)}>{ACTIONS.close}</Button>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirm === 'danger'}
        title={`Remove ${ADE.name} from the team?`}
        body="Ade loses access to this workspace. Nothing in any wallet changes."
        confirmLabel={`Remove ${ADE.name}`}
        keepLabel={`Keep ${ADE.name}`}
        tone="danger"
        busyLabel="Removing"
        onConfirm={() => wait(800)}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'primary'}
        title="Save the new name?"
        body="Only you see this name."
        confirmLabel="Save"
        keepLabel={ACTIONS.keepEditing}
        tone="primary"
        busyLabel="Saving"
        onConfirm={async () => {
          await wait(800);
          throw kitFailure('OFFLINE');
        }}
        onClose={() => setConfirm(null)}
      />

      <TransactionReview
        open={activeReview !== undefined}
        onClose={() => setReview(null)}
        summary={activeReview?.summary ?? TX_SUMMARIES[0].summary}
        plan={
          activeReview?.key === 'out' ? (
            <PlanSentence recipient={{ address: SAM.address, name: SAM.name }} schedule={SCHEDULES[2].schedule} />
          ) : undefined
        }
        consequence={
          activeReview?.key === 'returns'
            ? { tone: 'danger', body: 'The stream stops for good. Sam keeps what has been released.' }
            : undefined
        }
        confirmLabel={activeReview?.key === 'returns' ? 'Cancel stream' : undefined}
        checks={
          activeReview?.key === 'out'
            ? [
                { label: 'Enough money in your wallet', ok: true },
                { label: 'Address is on the main network', ok: true },
              ]
            : undefined
        }
        run={(report) => runSample(report, 1)}
        next={<ButtonLink to="/streams">Go to stream</ButtonLink>}
      />
      <TransactionReview
        open={review === 'two-steps'}
        onClose={() => setReview(null)}
        title={REVIEW.title}
        summary={TX_SUMMARIES[0].summary}
        steps={2}
        run={(report) => runSample(report, 2)}
      />
      <TransactionReview
        open={review === 'declined'}
        onClose={() => setReview(null)}
        summary={TX_SUMMARIES[1].summary}
        checks={[{ label: 'Wallet is on the main network', ok: false, fix: 'Switch your wallet to the main network.' }]}
        run={runDeclined}
      />

      <WalletModal
        isOpen={walletPicker}
        onClose={() => setWalletPicker(false)}
        onSelectWallet={async () => setWalletPicker(false)}
        isConnecting={false}
      />
    </KitSection>
  );
}

function MoneySection() {
  const { toast } = useToast();
  return (
    <KitSection id="kit-money" title="Money and schedules">
      <Specimen title="Release bar" layout="grid">
        <ReleaseBar asset={BCH} claimed="4.00" ready="2.00" later="6.00" />
        <ReleaseBar asset={BCH} claimed="0" ready="0" later="12.00" />
        <ReleaseBar asset={BCH} claimed="12.00" ready="0" later="0" />
      </Specimen>
      <Specimen title="Schedule timeline" layout="grid">
        <ScheduleTimeline {...TIMELINE} />
        <ScheduleTimeline {...WAITING_TIMELINE} />
        <ScheduleTimeline {...TIMELINE} variant="preview" />
        <ScheduleTimeline {...TIMELINE} continuous />
        <ScheduleTimeline {...TIMELINE} paused />
      </Specimen>
      <Specimen title="Plan sentence" layout="stack">
        {SCHEDULES.map((item) => (
          <div key={item.label} className="flex flex-col gap-1">
            <Eyebrow>{item.label}</Eyebrow>
            <PlanSentence recipient={{ address: SAM.address, name: SAM.name }} schedule={item.schedule} />
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <Eyebrow>No recipient yet, sticky</Eyebrow>
          <PlanSentence schedule={SCHEDULES[1].schedule} sticky />
        </div>
      </Specimen>
      <Specimen title="Approvals" layout="grid">
        <ApprovalMeter required={2} signers={SIGNERS} />
        <ApprovalMeter required={3} signers={SIGNERS} />
      </Specimen>
      <Specimen title="Progress meter" layout="grid">
        <ProgressMeter label="1 of 3 winners paid" value={1} max={3} />
        <ProgressMeter label="No winners paid yet" value={0} max={3} />
        <ProgressMeter label="3 of 3 winners paid" value={3} max={3} />
      </Specimen>
      <Specimen title="Milestones" layout="grid">
        <MilestoneList asset={BCH} milestones={MILESTONES} onRelease={(id) => toast({ tone: 'info', title: `Release ${id} picked` })} />
        <MilestoneList asset={BCH} milestones={MILESTONES} />
      </Specimen>
    </KitSection>
  );
}

function StructureSection() {
  const [tab, setTab] = useState('vaults');
  return (
    <KitSection id="kit-structure" title="Page structure and type">
      <Specimen title="Heading" layout="stack">
        <Heading level="page" as="h3">
          Streams
        </Heading>
        <Heading level="section" as="h3">
          Spending requests
        </Heading>
        <Heading level="item" as="h4">
          {`Payroll for ${SAM.name}`}
        </Heading>
      </Specimen>
      <Specimen title="Display and eyebrow" layout="stack">
        <Eyebrow>Payroll</Eyebrow>
        <Eyebrow number="01">Pay people</Eyebrow>
        <Display size="display" as="h2" accent="on Bitcoin Cash">
          Pay people and share money
        </Display>
        <Display size="headline" as="h2" accent="on a schedule">
          Pay your team
        </Display>
      </Specimen>
      <Specimen title="On the dark band" layout="stack">
        <div className="on-inverse flex flex-col gap-4 rounded-band bg-inverse p-8">
          <Eyebrow onInverse>Ready when you are</Eyebrow>
          <Display size="headline" as="h2" accent="a small amount" onInverse>
            Start with
          </Display>
          <div className="flex flex-wrap gap-3">
            <Button variant="on-inverse">Open app</Button>
            <Button variant="on-inverse-secondary">How it works</Button>
          </div>
        </div>
      </Specimen>
      <Specimen title="Icons">
        {ICONS.map((item) => (
          <span key={item.name} className="inline-flex items-center gap-2 text-small text-ink-secondary">
            <Icon icon={item.glyph} size={16} />
            <Icon icon={item.glyph} size={20} />
            <Icon icon={item.glyph} size={24} label={item.name} />
          </span>
        ))}
        <span className="inline-flex size-6 items-center text-ink-secondary">
          <XIcon aria-label="X" role="img" className="size-5" />
        </span>
      </Specimen>
      <Specimen title="Page header, list page" layout="stack">
        <PageHeader
          title="Streams"
          description="Pay someone bit by bit over time."
          primaryAction={<ButtonLink to="/streams/create" variant="primary" leadingIcon={Plus}>Create a stream</ButtonLink>}
          secondaryActions={[<ButtonLink key="many" to="/streams/batch-create">Pay many people</ButtonLink>]}
        />
      </Specimen>
      <Specimen title="Page header, detail page" layout="stack">
        <PageHeader
          title={`Payroll for ${SAM.name}`}
          description="Sam can claim 0.70 BCH every 30 days."
          breadcrumbs={[{ label: 'Streams', to: '/streams' }, { label: `Payroll for ${SAM.name}` }]}
          status="active"
          role="sender"
          stateLine="Next release in 29 days"
          plan={<PlanSentence recipient={{ address: SAM.address, name: SAM.name }} schedule={SCHEDULES[2].schedule} />}
          primaryAction={<Button variant="primary">Add funds</Button>}
          secondaryActions={[<Button variant="secondary" key="pause">Pause</Button>, <Button key="cancel" variant="danger-quiet">Cancel stream</Button>]}
        />
      </Specimen>
      <Specimen title="Page header, create page" layout="stack">
        <PageHeader title="Create a stream" description="Step 2 of 3" back={{ to: '/streams', label: backTo('streams') }} />
      </Specimen>
      <Specimen title="Page header, tabs and beta" layout="stack">
        <PageHeader
          title="Vaults"
          description="Shared money behind several approvals."
          badge="beta"
          tabs={{
            label: 'Vaults',
            activeKey: tab,
            items: [
              { key: 'vaults', label: 'Vaults', onSelect: () => setTab('vaults') },
              { key: 'plans', label: 'Budget plans', onSelect: () => setTab('plans') },
            ],
          }}
        />
      </Specimen>
      <Specimen title="Page container widths" layout="stack">
        {(['page', 'reading', 'narrow'] as const).map((width) => (
          <InsetBlock key={width}>
            <PageContainer width={width}>
              <DashedCard>
                <p className="text-small text-ink-secondary">{`Width ${width}`}</p>
              </DashedCard>
            </PageContainer>
          </InsetBlock>
        ))}
      </Specimen>
      <Specimen title="Stack, two columns and prose" layout="stack">
        <Stack gap={4}>
          <Card>
            <p className="text-body text-ink">Stack, gap 4</p>
          </Card>
          <Card>
            <p className="text-body text-ink">Second item</p>
          </Card>
        </Stack>
        <TwoColumn
          main={
            <Card>
              <p className="text-body text-ink">Main column</p>
            </Card>
          }
          side={
            <Card>
              <p className="text-body text-ink">Side column, first on phones</p>
            </Card>
          }
          sideFirstOnMobile
        />
        <Prose>
          <h2>How releases work</h2>
          <p>Each release becomes ready to claim on its date. Sam claims it from the stream page, and it arrives in Sam&apos;s wallet.</p>
          <h3>{`If ${SAM.name} doesn't claim`}</h3>
          <p>Nothing is lost. Ready amounts wait until Sam claims them.</p>
        </Prose>
      </Specimen>
    </KitSection>
  );
}

type PageTemplate = 'none' | 'solution' | 'legal';

const TEMPLATE_OPTIONS: { value: PageTemplate; label: string }[] = [
  { value: 'none', label: 'Hidden' },
  { value: 'solution', label: 'Solution page' },
  { value: 'legal', label: 'Legal page' },
];

function MarketingSectionSamples() {
  const [template, setTemplate] = useState<PageTemplate>('none');
  return (
    <KitSection id="kit-marketing" title="Marketing">
      <Specimen title="Hero" layout="stack">
        <MarketingHero
          eyebrow="Payroll"
          livePill
          headline="Pay your team"
          accent="on a schedule"
          lead="Set the amount and the dates once. Sam, Maya and Ade claim their pay as it releases."
          primary={{ label: 'Open app', href: 'https://app.flowguard.cash' }}
          secondary={{ label: 'How it works', href: '/how-it-works' }}
          note="Start with a small amount."
          visual={<HeroProductCard kind="stream" />}
          size="headline"
        />
      </Specimen>
      <Specimen title="Hero product card" layout="grid">
        <HeroProductCard kind="stream" />
        <HeroProductCard kind="vault" />
        <HeroProductCard kind="grant" />
      </Specimen>
      <Specimen title="Section and feature module" layout="stack">
        <MarketingSection tone="surface" labelledBy="kit-feature-title">
          <FeatureModule
            id="kit-feature"
            eyebrow={{ number: '01', label: 'Pay people' }}
            title="Streams pay out bit by bit"
            body="Sam sees what's ready and claims it from any wallet."
            action={{ label: 'See how vesting works', href: '/vesting' }}
            facts={[
              { title: 'Any schedule', body: 'Bit by bit, the same amount each time, or on dates you pick.' },
              { title: 'Clear rules', body: 'Everyone can check who can cancel it.' },
            ]}
            visual={<ScheduleTimeline {...TIMELINE} />}
          />
        </MarketingSection>
      </Specimen>
      <Specimen title="Fact strip and facts card" layout="grid">
        <FactStrip facts={FACTS} />
        <FactsCard {...FACTS_CARD} footer={<TxLink txid={SAMPLE_TXID} network="mainnet" />} />
      </Specimen>
      <Specimen title="Comparison table" layout="stack">
        <ComparisonTable {...COMPARISON} />
      </Specimen>
      <Specimen title="Numbered questions" layout="stack">
        <NumberedFaq items={ACCORDION_ITEMS.map((item) => ({ id: `faq-${item.id}`, question: item.title, answer: item.content }))} />
      </Specimen>
      <Specimen title="Closing band" layout="stack">
        <ClosingBand
          eyebrow="Ready when you are"
          headline="Start with"
          accent="a small amount"
          lead="Send yourself 0.01 BCH and see every step."
          primary={{ label: 'Open app', href: 'https://app.flowguard.cash' }}
          secondary={{ label: 'Try it', href: '/demo' }}
          facts={FACTS}
          showChainData={false}
        />
      </Specimen>
      <Specimen title="Page templates" layout="stack">
        <SegmentedControl label="Page template" options={TEMPLATE_OPTIONS} value={template} onChange={setTemplate} />
        {template === 'solution' ? <SolutionPage copy={SOLUTION_FIXTURE} /> : null}
        {template === 'legal' ? <LegalPage {...LEGAL_FIXTURE} /> : null}
      </Specimen>
    </KitSection>
  );
}

export default function KitPage() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-3">
          <Eyebrow>Development only</Eyebrow>
          <Heading level="page" as="h1">
            {KIT_TITLE}
          </Heading>
          <p className="text-body text-ink-secondary">{KIT_DESCRIPTION}</p>
        </div>
        <TwoColumn
          main={<ReducedMotionCheck />}
          side={
            <Panel title="On this page" padding="md">
              <TableOfContents items={TOC_ITEMS} />
            </Panel>
          }
        />
        <ActionsSection />
        <ContainersSection />
        <FieldsSection />
        <StatusSection />
        <DataSection />
        <NavigationSection />
        <FeedbackSection />
        <MoneySection />
        <StructureSection />
        <MarketingSectionSamples />
      </div>
      <PageMeta title={KIT_TITLE} description={KIT_DESCRIPTION} path="/dev/kit" />
    </PageContainer>
  );
}
