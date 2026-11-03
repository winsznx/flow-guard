import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { ListToolbar } from '../components/layout/ListToolbar';
import { PageHeader } from '../components/layout/PageHeader';
import { Stack } from '../components/layout/Stack';
import { Amount } from '../components/ui/Amount';
import { ButtonLink } from '../components/ui/ButtonLink';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Plus, Vault } from '../components/ui/Icon';
import { List, type Column, type ListState } from '../components/ui/List';
import { RoleTag } from '../components/ui/RoleTag';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { StatRow } from '../components/ui/StatRow';
import { StatTile } from '../components/ui/StatTile';
import type { Asset } from '../components/ui/types';
import { BUDGETS_TAB } from '../copy/budgets';
import { errorMessage, asFlowError } from '../copy/errors';
import { glossaryHelp } from '../copy/glossary';
import { VAULTS_PAGE, signersRequiredShort, vaultTitle } from '../copy/vaults';
import { useWallet } from '../hooks/useWallet';
import { fetchVaults } from '../utils/api';
import BudgetPlansTab from './BudgetPlansPage';

const BCH: Asset = { kind: 'bch' };

type Segment = 'yours' | 'public';
type Tab = 'vaults' | 'budgets';

type VaultRow = {
  id: string;
  name: string;
  description: string;
  balanceSats: bigint | null;
  approvalThreshold: number;
  signerCount: number;
  isPublic: boolean;
  isViewer: boolean;
};

function toVaultRow(raw: Record<string, unknown>): VaultRow {
  const id = String(raw.id ?? '');
  const balance =
    typeof raw.balance === 'number' && Number.isFinite(raw.balance) ? raw.balance : null;
  const signers = Array.isArray(raw.signers) ? raw.signers : [];
  return {
    id,
    name: vaultTitle({ id, name: typeof raw.name === 'string' ? raw.name : null }),
    description: typeof raw.description === 'string' ? raw.description : '',
    balanceSats: raw.contractAddress && balance !== null ? BigInt(Math.trunc(balance)) : null,
    approvalThreshold: Number(raw.approvalThreshold) || 0,
    signerCount: signers.length,
    isPublic: raw.isPublic === true,
    isViewer: raw.role !== 'creator' && raw.role !== 'signer',
  };
}

const SEGMENT_OPTIONS: { value: Segment; label: string }[] = [
  { value: 'yours', label: VAULTS_PAGE.segments.yours },
  { value: 'public', label: VAULTS_PAGE.segments.public },
];

const COLUMNS: Column<VaultRow>[] = [
  {
    key: 'name',
    header: VAULTS_PAGE.columns.name,
    primary: true,
    cell: (row) => (
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate">{row.name}</span>
        {row.description ? (
          <span className="truncate text-small text-ink-muted">{row.description}</span>
        ) : null}
      </span>
    ),
  },
  {
    key: 'held',
    header: VAULTS_PAGE.columns.held,
    align: 'end',
    mobile: 'bottom-end',
    cell: (row) =>
      row.balanceSats === null ? (
        <span className="text-ink-muted">{VAULTS_PAGE.noContract}</span>
      ) : (
        <Amount value={row.balanceSats} asset={BCH} precision="list" />
      ),
  },
  {
    key: 'approvals',
    header: VAULTS_PAGE.columns.approvals,
    mobile: 'bottom-start',
    cell: (row) => signersRequiredShort(row.approvalThreshold, row.signerCount),
  },
  {
    key: 'visibility',
    header: VAULTS_PAGE.columns.visibility,
    mobile: 'top',
    cell: (row) => (
      <span className="flex flex-wrap items-center gap-2">
        <span>{row.isPublic ? VAULTS_PAGE.public : VAULTS_PAGE.private}</span>
        {row.isViewer ? <RoleTag role="viewer" /> : null}
      </span>
    ),
  },
];

function VaultsTab() {
  const wallet = useWallet();
  const [segment, setSegment] = useState<Segment>('yours');
  const [data, setData] = useState<{ yours: VaultRow[]; public: VaultRow[] } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailure(null);
    setData(null);
    try {
      const response = await fetchVaults(wallet.address || undefined);
      setData({
        yours: [...response.created, ...response.signerIn].map(toVaultRow),
        public: response.public.map(toVaultRow),
      });
    } catch (error) {
      setFailure(asFlowError(error).message);
    }
  }, [wallet.address]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => (data ? data[segment] : []), [data, segment]);
  const state: ListState = failure
    ? 'error'
    : !data
      ? 'loading'
      : rows.length === 0
        ? 'empty'
        : 'ready';
  const heldSats = rows.reduce((sum, row) => sum + (row.balanceSats ?? 0n), 0n);
  const help = glossaryHelp('vault');

  const empty =
    segment === 'yours' ? (
      <EmptyState
        icon={Vault}
        title={VAULTS_PAGE.empty.yoursTitle}
        description={VAULTS_PAGE.empty.yoursLine}
        example={VAULTS_PAGE.empty.yoursExample}
        action={
          <ButtonLink to="/vaults/create" variant="primary" leadingIcon={Plus}>
            {VAULTS_PAGE.create}
          </ButtonLink>
        }
        learnMore={help ? { label: VAULTS_PAGE.empty.learnMore, to: help.path } : undefined}
      />
    ) : (
      <EmptyState
        icon={Vault}
        title={VAULTS_PAGE.empty.publicTitle}
        description={VAULTS_PAGE.empty.publicLine}
      />
    );

  return (
    <Stack>
      <ListToolbar
        segments={
          <div className="flex flex-col items-start gap-2">
            <SegmentedControl
              label={VAULTS_PAGE.segmentLabel}
              options={SEGMENT_OPTIONS}
              value={segment}
              onChange={setSegment}
            />
            {segment === 'public' ? (
              <p className="text-small text-ink-secondary">{VAULTS_PAGE.publicLine}</p>
            ) : null}
          </div>
        }
        stats={
          state === 'ready' ? (
            <StatRow>
              <StatTile label={VAULTS_PAGE.stats.count} value={String(rows.length)} />
              <StatTile
                label={VAULTS_PAGE.stats.held}
                value={<Amount value={heldSats} asset={BCH} size="lg" precision="list" />}
                sub={VAULTS_PAGE.stats.heldSub}
              />
            </StatRow>
          ) : null
        }
      />
      <List
        label={VAULTS_PAGE.listLabel}
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `/vaults/${row.id}`}
        state={state}
        empty={empty}
        noResults={null}
        error={
          <ErrorState
            title={VAULTS_PAGE.loadFailedTitle}
            reason={failure ?? errorMessage('LOAD_FAILED', { things: 'Your vaults' })}
            onRetry={load}
          />
        }
      />
    </Stack>
  );
}

export default function VaultsPage() {
  const { pathname } = useLocation();
  const tab: Tab = pathname.startsWith('/budgets') ? 'budgets' : 'vaults';

  const primaryAction =
    tab === 'vaults' ? (
      <ButtonLink to="/vaults/create" variant="primary" leadingIcon={Plus}>
        {VAULTS_PAGE.create}
      </ButtonLink>
    ) : (
      <ButtonLink to="/budgets/create" variant="primary" leadingIcon={Plus}>
        {BUDGETS_TAB.create}
      </ButtonLink>
    );

  return (
    <PageContainer>
      <PageHeader
        title={VAULTS_PAGE.title}
        documentTitle={tab === 'budgets' ? VAULTS_PAGE.budgetsDocumentTitle : VAULTS_PAGE.title}
        description={tab === 'budgets' ? VAULTS_PAGE.budgetsDescription : VAULTS_PAGE.description}
        primaryAction={primaryAction}
        tabs={{
          label: VAULTS_PAGE.tabsLabel,
          activeKey: tab,
          items: [
            { key: 'vaults', label: VAULTS_PAGE.tabs.vaults, to: '/vaults' },
            { key: 'budgets', label: VAULTS_PAGE.tabs.budgets, to: '/budgets' },
          ],
        }}
      />
      {tab === 'vaults' ? <VaultsTab /> : <BudgetPlansTab />}
    </PageContainer>
  );
}
