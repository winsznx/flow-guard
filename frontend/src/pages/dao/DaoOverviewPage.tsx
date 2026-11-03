import { useMemo } from 'react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Stack } from '../../components/layout/Stack';
import { TwoColumn } from '../../components/layout/TwoColumn';
import {
  CardLabelled,
  OrganizationHeader,
  OrganizationSection,
} from '../../components/dao/DaoSectionNav';
import { EmptyState } from '../../components/ui/EmptyState';
import { FileCheck, Vault, Wallet } from '../../components/ui/Icon';
import { List, type Column } from '../../components/ui/List';
import { Panel } from '../../components/ui/Panel';
import { StatRow } from '../../components/ui/StatRow';
import { StatTile } from '../../components/ui/StatTile';
import { StatusPill } from '../../components/ui/StatusPill';
import { LABELS } from '../../copy/common';
import { formatRelative } from '../../copy/format';
import {
  ASSET_KIND_WORD,
  OVERVIEW,
  SAMPLE,
  activityText,
  approvalsWords,
  percent,
  usd,
} from '../../copy/organization';
import type { DaoAssetRow, DaoProposalRow, DaoVaultRow } from '../../data/daoBeta';
import {
  deriveOrganizationSummary,
  ruleName,
  sampleCashflow,
  useDaoWorkspace,
  type OrganizationMonth,
} from '../../stores/useDaoWorkspace';

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });

function metaLine(...parts: (string | null)[]): string {
  return parts.filter(Boolean).join(' · ');
}

function NameCell({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-title-item text-ink">{title}</span>
      <span className="text-small text-ink-muted">{meta}</span>
    </div>
  );
}

function SamplePill() {
  return <StatusPill status="sample" />;
}

function netWords(month: OrganizationMonth): string {
  const net = month.inflowUsd - month.outflowUsd;
  if (net === 0) return OVERVIEW.moneyInOut.even;
  return net > 0 ? OVERVIEW.moneyInOut.moreIn(usd(net)) : OVERVIEW.moneyInOut.moreOut(usd(-net));
}

export function DaoOverviewPage() {
  const { assets, vaults, requests, rules, activity } = useDaoWorkspace();
  const cashflow = useMemo(() => sampleCashflow(), []);
  const summary = deriveOrganizationSummary({ assets, vaults, requests });
  const total = summary.totalValueUsd;

  const holdingColumns = useMemo<Column<DaoAssetRow>[]>(
    () => [
      {
        key: 'asset',
        header: OVERVIEW.holdings.asset,
        primary: true,
        mobile: 'top',
        cell: (row) => (
          <NameCell
            title={row.symbol}
            meta={metaLine(
              row.name,
              ASSET_KIND_WORD[row.category],
              OVERVIEW.holdings.inVaults(row.vaults)
            )}
          />
        ),
      },
      {
        key: 'amount',
        header: OVERVIEW.holdings.amount,
        align: 'end',
        mobile: 'bottom-start',
        cell: (row) => row.balance,
      },
      {
        key: 'value',
        header: OVERVIEW.holdings.value,
        align: 'end',
        mobile: 'bottom-end',
        cell: (row) =>
          row.isEstimate
            ? metaLine(usd(row.valueUsdNumber), OVERVIEW.holdings.estimate)
            : usd(row.valueUsdNumber),
      },
      {
        key: 'share',
        header: OVERVIEW.holdings.share,
        align: 'end',
        mobile: 'hidden',
        cell: (row) => percent(total > 0 ? row.valueUsdNumber / total : 0),
      },
    ],
    [total]
  );

  const monthColumns: Column<OrganizationMonth>[] = [
    {
      key: 'month',
      header: OVERVIEW.moneyInOut.month,
      primary: true,
      mobile: 'top',
      cell: (row) => (
        <NameCell
          title={MONTH.format(row.month)}
          meta={OVERVIEW.moneyInOut.inAndOut(usd(row.inflowUsd), usd(row.outflowUsd))}
        />
      ),
    },
    {
      key: 'net',
      header: OVERVIEW.moneyInOut.net,
      align: 'end',
      mobile: 'bottom-end',
      cell: (row) => netWords(row),
    },
  ];

  const vaultColumns: Column<DaoVaultRow>[] = [
    {
      key: 'vault',
      header: OVERVIEW.vaults.vault,
      primary: true,
      mobile: 'top',
      cell: (row) => <NameCell title={row.name} meta={row.purpose} />,
    },
    { key: 'assets', header: OVERVIEW.vaults.assets, mobile: 'hidden', cell: (row) => row.assets },
    {
      key: 'approvals',
      header: OVERVIEW.vaults.approvals,
      mobile: 'bottom-start',
      cell: (row) => approvalsWords(row.signersRequired, row.signersTotal),
    },
    {
      key: 'out',
      header: OVERVIEW.vaults.moneyOut,
      align: 'end',
      mobile: 'bottom-end',
      cell: (row) => (
        <CardLabelled after={OVERVIEW.vaults.outAMonth}>
          {usd(row.moneyOutPerMonthUsd)}
        </CardLabelled>
      ),
    },
  ];

  const requestColumns: Column<DaoProposalRow>[] = [
    {
      key: 'request',
      header: OVERVIEW.requests.request,
      primary: true,
      cell: (row) => (
        <NameCell title={row.title} meta={metaLine(row.asset, ruleName(rules, row.ruleId))} />
      ),
    },
    {
      key: 'status',
      header: OVERVIEW.requests.status,
      mobile: 'top',
      cell: (row) => <StatusPill status={row.status} />,
    },
    {
      key: 'value',
      header: OVERVIEW.requests.value,
      align: 'end',
      mobile: 'bottom-start',
      cell: (row) => usd(row.valueUsd),
    },
    { key: 'note', header: OVERVIEW.requests.note, mobile: 'bottom-end', cell: (row) => row.note },
  ];

  return (
    <PageContainer>
      <OrganizationHeader page="overview" sample stateLine={SAMPLE.savedHere} />
      <Stack>
        <section aria-label={OVERVIEW.stats.label}>
          <StatRow>
            <StatTile
              label={OVERVIEW.stats.totalValue}
              value={usd(total)}
              sub={OVERVIEW.inVaults(vaults.length)}
            />
            <StatTile
              label={OVERVIEW.stats.moneyOut}
              value={usd(summary.moneyOutPerMonthUsd)}
              sub={SAMPLE.tag}
            />
            <StatTile
              label={OVERVIEW.stats.lasts}
              value={
                summary.monthsLeft === null ? LABELS.notSet : OVERVIEW.months(summary.monthsLeft)
              }
              sub={OVERVIEW.atMonthlyOut(usd(summary.moneyOutPerMonthUsd))}
            />
            <StatTile
              label={OVERVIEW.stats.openRequests}
              value={summary.openRequests}
              sub={OVERVIEW.waiting(summary.waitingRequests)}
            />
          </StatRow>
        </section>

        <TwoColumn
          main={
            <Stack>
              <OrganizationSection
                title={OVERVIEW.holdings.title}
                description={OVERVIEW.holdings.description}
                action={<SamplePill />}
              >
                <List
                  label={OVERVIEW.holdings.listLabel}
                  columns={holdingColumns}
                  rows={assets}
                  rowKey={(row) => row.id}
                  state={assets.length > 0 ? 'ready' : 'empty'}
                  empty={
                    <EmptyState
                      icon={Wallet}
                      title={OVERVIEW.holdings.empty}
                      description={OVERVIEW.holdings.emptyLine}
                    />
                  }
                  noResults={null}
                  error={null}
                />
              </OrganizationSection>

              <OrganizationSection
                title={OVERVIEW.moneyInOut.title}
                description={OVERVIEW.moneyInOut.description}
                action={<SamplePill />}
              >
                <List
                  label={OVERVIEW.moneyInOut.listLabel}
                  columns={monthColumns}
                  rows={cashflow}
                  rowKey={(row) => row.id}
                  state="ready"
                  empty={null}
                  noResults={null}
                  error={null}
                />
              </OrganizationSection>

              <OrganizationSection
                title={OVERVIEW.vaults.title}
                description={OVERVIEW.vaults.description}
                action={<SamplePill />}
              >
                <List
                  label={OVERVIEW.vaults.listLabel}
                  columns={vaultColumns}
                  rows={vaults}
                  rowKey={(row) => row.id}
                  state={vaults.length > 0 ? 'ready' : 'empty'}
                  empty={
                    <EmptyState
                      icon={Vault}
                      title={OVERVIEW.vaults.empty}
                      description={OVERVIEW.vaults.emptyLine}
                    />
                  }
                  noResults={null}
                  error={null}
                />
              </OrganizationSection>

              <OrganizationSection
                title={OVERVIEW.requests.title}
                description={OVERVIEW.requests.description}
                action={<SamplePill />}
              >
                <List
                  label={OVERVIEW.requests.listLabel}
                  columns={requestColumns}
                  rows={requests}
                  rowKey={(row) => row.id}
                  state={requests.length > 0 ? 'ready' : 'empty'}
                  empty={
                    <EmptyState
                      icon={FileCheck}
                      title={OVERVIEW.requests.empty}
                      description={OVERVIEW.requests.emptyLine}
                    />
                  }
                  noResults={null}
                  error={null}
                />
              </OrganizationSection>
            </Stack>
          }
          side={
            <Panel title={OVERVIEW.activity.title} description={OVERVIEW.activity.description}>
              {activity.length === 0 ? (
                <p className="text-small text-ink-secondary">{OVERVIEW.activity.empty}</p>
              ) : (
                <ul className="flex flex-col">
                  {activity.map((item) => {
                    const { title, detail } = activityText(item.event);
                    return (
                      <li
                        key={item.id}
                        className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0 first:pt-0"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 text-title-item text-ink">{title}</span>
                          <span className="shrink-0 text-small text-ink-muted">
                            {formatRelative(item.at)}
                          </span>
                        </div>
                        <span className="text-small text-ink-secondary">{detail}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          }
        />
      </Stack>
    </PageContainer>
  );
}
