import { useEffect, useMemo, useState } from 'react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Stack } from '../components/layout/Stack';
import { TwoColumn } from '../components/layout/TwoColumn';
import { ActivityList } from '../components/ui/ActivityList';
import { Amount } from '../components/ui/Amount';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Eyebrow } from '../components/ui/Eyebrow';
import { CircleCheck } from '../components/ui/Icon';
import { LinkCard } from '../components/ui/LinkCard';
import type { ListState } from '../components/ui/List';
import { Panel } from '../components/ui/Panel';
import { Skeleton } from '../components/ui/Skeleton';
import { StatRow } from '../components/ui/StatRow';
import { StatTile } from '../components/ui/StatTile';
import { StatusPill } from '../components/ui/StatusPill';
import type { Asset } from '../components/ui/types';
import { ACTIONS, LABELS, MOMENTS } from '../copy/common';
import { toEventKind, type ActivityEvent } from '../copy/events';
import { formatAddress, formatAmount, formatDate } from '../copy/format';
import {
  ATTENTION,
  HOME,
  NEW_TO_BCH_LINKS,
  ORG_HOME,
  START_ACTIONS,
  STAT_SUBS,
} from '../copy/home';
import { APP_GROUPS, ORGANIZATION_GROUP, type AppNavKey } from '../copy/nav';
import { BUILD_NETWORK } from '../copy/network';
import { ORG_SECTION_LINES, percent, usd } from '../copy/organization';
import type { StatusKey } from '../copy/status';
import { deriveOrganizationSummary, useDaoWorkspace } from '../stores/useDaoWorkspace';
import { useAppMode } from '../hooks/useAppMode';
import { useWallet } from '../hooks/useWallet';
import { sameWallet } from '../utils/address';
import { fetchPayments, fetchProposals, fetchVaults } from '../utils/api';
import { getCachedTokenMeta } from '../utils/tokenMeta';

const BCH: Asset = { kind: 'bch' };
const SATS_PER_BCH = 100_000_000;
const STREAM_PAGE_LIMIT = 100;
const ACTIVITY_LIMIT = 8;
const ATTENTION_LIMIT = 8;
const MY_STREAM_ACTIVITY_PATH = '/streams/activity';
const STREAMS_LIST = '/api/streams';
const STREAM_ACTIVITY = '/api/streams/activity';

type TokenFields = { token_type?: string | null; token_category?: string | null; token_decimals?: number | null };

type StreamRecord = TokenFields & {
  id: string;
  sender: string;
  recipient: string;
  claimable_amount?: number | null;
  status?: string | null;
  description?: string | null;
};

type StreamPage = { streams?: StreamRecord[]; totalPages?: number };

type PaymentRecord = TokenFields & {
  id: string;
  sender: string;
  recipient: string;
  recipient_name?: string | null;
  amount_per_period?: number | null;
  next_payment_date?: number | null;
  status?: string | null;
};

type VaultRecord = {
  id: string;
  name?: string | null;
  balance?: number | null;
  contractAddress?: string | null;
  signers?: string[] | null;
};

type ProposalRecord = {
  id: string;
  amount?: number | null;
  recipient?: string | null;
  status?: string | null;
  approvals?: string[] | null;
};

type StreamActivityEvent = {
  id: string;
  entity_id: string;
  event_type: string;
  actor: string | null;
  amount: number | null;
  tx_hash: string | null;
  created_at: number;
};

type Source<T> = { state: 'loading' } | { state: 'error' } | { state: 'ready'; data: T };

type StreamsData = { incoming: StreamRecord[]; outgoing: StreamRecord[]; partial: boolean };
type PaymentsData = { incoming: PaymentRecord[]; outgoing: PaymentRecord[] };
type VaultsData = { vaults: VaultRecord[]; waiting: { vault: VaultRecord; request: ProposalRecord }[] };

type HomeData = {
  streams: Source<StreamsData>;
  payments: Source<PaymentsData>;
  vaults: Source<VaultsData>;
  activity: Source<StreamActivityEvent[]>;
};

type AttentionItem = {
  key: string;
  status: StatusKey;
  sentence: string;
  action: { label: string; to: string };
};

const LOADING: HomeData = {
  streams: { state: 'loading' },
  payments: { state: 'loading' },
  vaults: { state: 'loading' },
  activity: { state: 'loading' },
};

function assetOf(record: TokenFields): Asset {
  if (record.token_type !== 'CASHTOKENS' || !record.token_category) return BCH;
  const meta = getCachedTokenMeta(record.token_category);
  return {
    kind: 'token',
    tokenId: record.token_category,
    symbol: meta?.symbol,
    decimals: meta?.decimals ?? record.token_decimals ?? 0,
  };
}

function isClaimableStream(stream: StreamRecord): boolean {
  if (stream.status === 'CANCELLED' || stream.status === 'PAUSED') return false;
  return Number(stream.claimable_amount ?? 0) > 0;
}

function isDuePayment(payment: PaymentRecord, now: number): boolean {
  return payment.status === 'ACTIVE' && Number(payment.next_payment_date ?? 0) * 1000 <= now;
}

function keepAddressTogether(short: string): string {
  return short.replace('…', '\u2060…\u2060');
}

function amountText(value: number | null | undefined, asset: Asset): string {
  return formatAmount(value, asset, { precision: 'list' }) ?? ATTENTION.someAmount;
}

async function loadStreams(address: string, role: 'recipient' | 'sender'): Promise<StreamPage> {
  const query = new URLSearchParams({ [role]: address, limit: String(STREAM_PAGE_LIMIT) });
  const response = await fetch(`${STREAMS_LIST}?${query}`);
  if (!response.ok) throw new Error(`streams ${response.status}`);
  return (await response.json()) as StreamPage;
}

async function loadActivity(address: string): Promise<StreamActivityEvent[]> {
  const query = new URLSearchParams({ address, limit: String(ACTIVITY_LIMIT) });
  const response = await fetch(`${STREAM_ACTIVITY}?${query}`);
  if (!response.ok) throw new Error(`activity ${response.status}`);
  const body = (await response.json()) as { events?: StreamActivityEvent[] };
  return body.events ?? [];
}

async function loadVaults(address: string): Promise<VaultsData> {
  const response = await fetchVaults(address);
  const mine = [...(response.created ?? []), ...(response.signerIn ?? [])] as VaultRecord[];
  const vaults = mine.filter((vault, index) => mine.findIndex((other) => other.id === vault.id) === index);
  const signing = vaults.filter((vault) => (vault.signers ?? []).some((signer) => sameWallet(signer, address, BUILD_NETWORK)));
  const lists = await Promise.all(
    signing.map(async (vault) => ({ vault, requests: (await fetchProposals(vault.id, address)) as ProposalRecord[] })),
  );
  const waiting = lists.flatMap(({ vault, requests }) =>
    requests
      .filter((request) => request.status === 'pending')
      .filter((request) => !(request.approvals ?? []).some((approver) => sameWallet(approver, address, BUILD_NETWORK)))
      .map((request) => ({ vault, request })),
  );
  return { vaults, waiting };
}

function settle<T>(result: PromiseSettledResult<T>): Source<T> {
  if (result.status === 'fulfilled') return { state: 'ready', data: result.value };
  console.error('[AppShellPage] A home section failed to load:', result.reason);
  return { state: 'error' };
}

function useHomeData(address: string | null): { data: HomeData; reload: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<HomeData>(LOADING);

  useEffect(() => {
    if (!address) return undefined;
    let ignore = false;
    setData(LOADING);

    const streams = Promise.all([loadStreams(address, 'recipient'), loadStreams(address, 'sender')]).then(
      ([incoming, outgoing]): StreamsData => ({
        incoming: incoming.streams ?? [],
        outgoing: outgoing.streams ?? [],
        partial: Number(incoming.totalPages ?? 1) > 1 || Number(outgoing.totalPages ?? 1) > 1,
      }),
    );
    const payments = Promise.all([fetchPayments({ recipient: address }), fetchPayments({ sender: address })]).then(
      ([incoming, outgoing]): PaymentsData => ({
        incoming: (incoming?.payments ?? []) as PaymentRecord[],
        outgoing: (outgoing?.payments ?? []) as PaymentRecord[],
      }),
    );
    const vaults = loadVaults(address);
    const activity = loadActivity(address);

    void Promise.allSettled([streams, payments, vaults, activity]).then(([s, p, v, a]) => {
      if (ignore) return;
      setData({ streams: settle(s), payments: settle(p), vaults: settle(v), activity: settle(a) });
    });

    return () => {
      ignore = true;
    };
  }, [address, attempt]);

  return { data, reload: () => setAttempt((n) => n + 1) };
}

function buildAttention(data: HomeData, now: number): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (data.streams.state === 'ready') {
    for (const stream of data.streams.data.incoming.filter(isClaimableStream)) {
      const amount = amountText(Number(stream.claimable_amount), assetOf(stream));
      items.push({
        key: `claim-${stream.id}`,
        status: 'readyToClaim',
        sentence: ATTENTION.streamReady(amount, stream.description || ATTENTION.streamFrom(formatAddress(stream.sender))),
        action: { label: ATTENTION.claimAmount(amount), to: `/streams/${stream.id}` },
      });
    }
  }

  if (data.payments.state === 'ready') {
    for (const payment of data.payments.data.incoming.filter((record) => isDuePayment(record, now))) {
      const amount = amountText(payment.amount_per_period, assetOf(payment));
      items.push({
        key: `payment-${payment.id}`,
        status: 'readyToClaim',
        sentence: ATTENTION.paymentReady(amount, formatAddress(payment.sender)),
        action: { label: ATTENTION.claimAmount(amount), to: `/payments/${payment.id}` },
      });
    }
  }

  if (data.vaults.state === 'ready') {
    for (const { vault, request } of data.vaults.data.waiting) {
      items.push({
        key: `request-${request.id}`,
        status: 'waitingForApproval',
        sentence: ATTENTION.requestWaiting(
          vault.name || formatAddress(vault.contractAddress ?? vault.id),
          amountText(request.amount, BCH),
          request.recipient ? formatAddress(request.recipient) : LABELS.notSet,
        ),
        action: { label: ATTENTION.reviewRequest, to: `/vaults/${vault.id}` },
      });
    }
  }

  if (data.streams.state === 'ready') {
    for (const stream of data.streams.data.outgoing) {
      if (stream.status !== 'PENDING') continue;
      const to = formatAddress(stream.recipient);
      items.push({
        key: `fund-stream-${stream.id}`,
        status: 'notFunded',
        sentence: ATTENTION.streamNotFunded(stream.description || ATTENTION.streamTo(to), to),
        action: { label: ATTENTION.fundStream, to: `/streams/${stream.id}` },
      });
    }
  }

  if (data.payments.state === 'ready') {
    for (const payment of data.payments.data.outgoing) {
      if (payment.status !== 'PENDING') continue;
      const to = formatAddress(payment.recipient);
      items.push({
        key: `fund-payment-${payment.id}`,
        status: 'notFunded',
        sentence: ATTENTION.paymentNotFunded(payment.recipient_name || ATTENTION.paymentTo(to), to),
        action: { label: ATTENTION.fundPayment, to: `/payments/${payment.id}` },
      });
    }
  }

  return items;
}

function toActivity(events: StreamActivityEvent[], streams: StreamRecord[], address: string): ActivityEvent[] {
  const byId = new Map(streams.map((stream) => [stream.id, stream]));
  return events.map((event) => {
    const stream = byId.get(event.entity_id);
    const amount = event.amount !== null && event.amount !== undefined && stream ? { value: event.amount, asset: assetOf(stream) } : undefined;
    return {
      id: event.id,
      kind: toEventKind(event.event_type),
      object: { kind: 'stream', name: stream?.description || undefined },
      at: event.created_at,
      actor: event.actor ? { address: event.actor, isYou: sameWallet(event.actor, address, BUILD_NETWORK) } : undefined,
      amount,
      txid: event.tx_hash ?? undefined,
    };
  });
}

function AttentionPanel({ items, loading, someFailed, onRetry }: {
  items: AttentionItem[];
  loading: boolean;
  someFailed: boolean;
  onRetry: () => void;
}) {
  const shown = items.slice(0, ATTENTION_LIMIT);
  const hidden = items.length - shown.length;

  return (
    <Panel title={HOME.attentionTitle}>
      {loading ? (
        <Skeleton kind="row" lines={3} />
      ) : shown.length === 0 && !someFailed ? (
        <EmptyState icon={CircleCheck} title={MOMENTS.nothingNeedsYou} description={HOME.attentionEmpty} />
      ) : (
        <ul aria-label={HOME.attentionLabel} className="flex flex-col">
          {shown.map((item) => (
            <li
              key={item.key}
              className="flex flex-col gap-3 border-t border-line py-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
            >
              <div className="flex min-w-0 flex-col items-start gap-2">
                <StatusPill status={item.status} />
                <p className="text-body text-ink">{item.sentence}</p>
              </div>
              <div className="shrink-0">
                <ButtonLink variant="secondary" size="sm" to={item.action.to}>
                  {item.action.label}
                </ButtonLink>
              </div>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 ? <p className="text-small text-ink-muted">{ATTENTION.more(hidden)}</p> : null}
      {someFailed ? (
        <p className="flex flex-wrap items-baseline gap-x-2 text-small text-ink-secondary">
          {HOME.someFailed}
          <Button variant="link" onClick={onRetry}>
            {ACTIONS.tryAgain}
          </Button>
        </p>
      ) : null}
    </Panel>
  );
}

type TileState = 'loading' | 'error' | 'ready';

function tileState(...sources: Source<unknown>[]): TileState {
  if (sources.some((source) => source.state === 'loading')) return 'loading';
  if (sources.some((source) => source.state === 'error')) return 'error';
  return 'ready';
}

function HomeStats({ data, now, onRetry }: { data: HomeData; now: number; onRetry: () => void }) {
  const streams = data.streams.state === 'ready' ? data.streams.data : null;
  const payments = data.payments.state === 'ready' ? data.payments.data : null;
  const vaults = data.vaults.state === 'ready' ? data.vaults.data : null;

  const readyAmounts = [
    ...(streams?.incoming ?? []).filter(isClaimableStream).map((stream) => ({ record: stream, value: stream.claimable_amount })),
    ...(payments?.incoming ?? [])
      .filter((payment) => isDuePayment(payment, now))
      .map((payment) => ({ record: payment, value: payment.amount_per_period })),
  ];
  const bchReady = readyAmounts.filter(({ record }) => assetOf(record).kind === 'bch');
  const tokenReady = readyAmounts.length - bchReady.length;
  const readyTotal = bchReady.reduce((sum, { value }) => sum + Number(value ?? 0), 0);
  const onlyTokensReady = readyTotal <= 0 && tokenReady > 0;

  const nextOut = (payments?.outgoing ?? [])
    .filter((payment) => payment.status === 'ACTIVE' && payment.next_payment_date)
    .sort((a, b) => Number(a.next_payment_date) - Number(b.next_payment_date))[0];

  const vaultsWithBalance = (vaults?.vaults ?? []).filter((vault) => vault.contractAddress && typeof vault.balance === 'number');
  const vaultTotal = vaultsWithBalance.reduce((sum, vault) => sum + Number(vault.balance) / SATS_PER_BCH, 0);
  const waitingCount = vaults?.waiting.length ?? 0;

  return (
    <section aria-label={HOME.statsLabel}>
      <StatRow>
        <StatTile
          label={HOME.readyToClaim}
          state={tileState(data.streams, data.payments)}
          onRetry={onRetry}
          pageOnly={streams?.partial ?? false}
          value={
            onlyTokensReady ? (
              STAT_SUBS.tokenClaims(tokenReady)
            ) : (
              <Amount value={readyTotal} asset={BCH} size="lg" precision="list" />
            )
          }
          sub={!onlyTokensReady && tokenReady > 0 ? STAT_SUBS.tokensToo(tokenReady) : undefined}
        />
        <StatTile
          label={HOME.waitingForApproval}
          state={tileState(data.vaults)}
          onRetry={onRetry}
          value={waitingCount}
          sub={STAT_SUBS.requests}
        />
        <StatTile
          label={HOME.nextPaymentOut}
          state={tileState(data.payments)}
          onRetry={onRetry}
          value={nextOut ? formatDate(nextOut.next_payment_date) ?? LABELS.notSet : LABELS.notSet}
          sub={
            nextOut
              ? STAT_SUBS.nextPaymentTo(
                  amountText(nextOut.amount_per_period, assetOf(nextOut)),
                  keepAddressTogether(formatAddress(nextOut.recipient)),
                )
              : undefined
          }
        />
        <StatTile
          label={HOME.inYourVaults}
          state={tileState(data.vaults)}
          onRetry={onRetry}
          value={<Amount value={vaultTotal} asset={BCH} size="lg" precision="list" />}
          sub={STAT_SUBS.acrossVaults(vaultsWithBalance.length)}
        />
      </StatRow>
    </section>
  );
}

function StartPills() {
  return (
    <Panel title={HOME.startTitle}>
      <ul aria-label={HOME.startLabel} className="flex flex-wrap gap-2">
        {START_ACTIONS.map((action) => (
          <li key={action.to}>
            <ButtonLink variant="secondary" size="sm" to={action.to}>
              {action.label}
            </ButtonLink>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function StartCards() {
  return (
    <Panel title={HOME.startTitle} description={HOME.startDescription}>
      <div className="flex flex-col gap-6">
        {APP_GROUPS.map((group) => (
          <section key={group.key} aria-label={group.label} className="flex flex-col gap-3">
            <Eyebrow>{group.label}</Eyebrow>
            <ul className="grid gap-3 sm:grid-cols-2">
              {group.items.map((item) => (
                <li key={item.key}>
                  <LinkCard to={item.path} icon={item.icon} title={item.label} description={item.description ?? ''} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Panel>
  );
}

function NewToBchPanel() {
  return (
    <Panel title={HOME.newToBchTitle} description={HOME.newToBchDescription}>
      <ul className="grid gap-3 md:grid-cols-3">
        {NEW_TO_BCH_LINKS.map((link) => (
          <li key={link.to}>
            <LinkCard to={link.to} title={link.title} description={link.description} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function PersonalHome() {
  const wallet = useWallet();
  const address = wallet.address;
  const { data, reload } = useHomeData(address);
  const [now] = useState(() => Date.now());

  const sources = [data.streams, data.payments, data.vaults];
  const loading = sources.some((source) => source.state === 'loading');
  const allFailed = sources.every((source) => source.state === 'error');
  const someFailed = !loading && sources.some((source) => source.state === 'error');

  const attention = useMemo(() => buildAttention(data, now), [data, now]);

  const streams = data.streams.state === 'ready' ? data.streams.data : null;
  const payments = data.payments.state === 'ready' ? data.payments.data : null;
  const vaults = data.vaults.state === 'ready' ? data.vaults.data : null;
  const firstVisit =
    !loading &&
    !someFailed &&
    (streams?.incoming.length ?? 0) + (streams?.outgoing.length ?? 0) === 0 &&
    (payments?.incoming.length ?? 0) + (payments?.outgoing.length ?? 0) === 0 &&
    (vaults?.vaults.length ?? 0) === 0;

  const activityState: ListState =
    data.activity.state === 'loading' ? 'loading' : data.activity.state === 'error' ? 'error' : 'ready';
  const activityEvents =
    data.activity.state === 'ready' && address
      ? toActivity(data.activity.data, [...(streams?.incoming ?? []), ...(streams?.outgoing ?? [])], address)
      : [];

  return (
    <PageContainer>
      <PageHeader title={HOME.title} description={HOME.description} />
      {allFailed ? (
        <Panel>
          <ErrorState title={HOME.loadFailedTitle} reason={HOME.loadFailedReason} onRetry={reload} />
        </Panel>
      ) : firstVisit ? (
        <Stack>
          <StartCards />
          <NewToBchPanel />
        </Stack>
      ) : (
        <Stack>
          <AttentionPanel items={attention} loading={loading} someFailed={someFailed} onRetry={reload} />
          <HomeStats data={data} now={now} onRetry={reload} />
          <Panel title={HOME.activityTitle} description={HOME.activityDescription}>
            <ActivityList events={activityEvents} state={activityState} network={BUILD_NETWORK} seeAllHref={MY_STREAM_ACTIVITY_PATH} />
          </Panel>
          <StartPills />
        </Stack>
      )}
    </PageContainer>
  );
}

const ORG_LINE_BY_NAV: Partial<Record<AppNavKey, string>> = {
  orgOverview: ORG_SECTION_LINES.overview,
  orgStreams: ORG_SECTION_LINES.streams,
  orgTeam: ORG_SECTION_LINES.team,
  orgRoles: ORG_SECTION_LINES.roles,
  orgRules: ORG_SECTION_LINES.rules,
};

const HOME_RULE_LIMIT = 3;

function OrganizationHome() {
  const assets = useDaoWorkspace((state) => state.assets);
  const vaults = useDaoWorkspace((state) => state.vaults);
  const requests = useDaoWorkspace((state) => state.requests);
  const rules = useDaoWorkspace((state) => state.rules);
  const summary = deriveOrganizationSummary({ assets, vaults, requests });
  const totalValue = summary.totalValueUsd;
  const months = summary.monthsLeft;

  return (
    <PageContainer>
      <PageHeader
        title={HOME.title}
        badge="beta"
        description={ORG_HOME.description}
        secondaryActions={[
          <ButtonLink key="overview" variant="secondary" to="/app/dao/overview">
            {ORG_HOME.goToOverview}
          </ButtonLink>,
        ]}
      />
      <Stack>
        <section aria-label={ORG_HOME.statsLabel}>
          <StatRow>
            <StatTile label={ORG_HOME.totalValue} value={usd(totalValue)} sub={ORG_HOME.acrossVaults(vaults.length)} />
            <StatTile label={ORG_HOME.spendingPerMonth} value={usd(summary.moneyOutPerMonthUsd)} />
            <StatTile
              label={ORG_HOME.lastsAbout}
              value={months === null ? LABELS.notSet : ORG_HOME.months(months)}
              sub={ORG_HOME.atThisRate}
            />
            <StatTile label={ORG_HOME.requestsWaiting} value={summary.waitingRequests} />
          </StatRow>
        </section>

        <TwoColumn
          main={
            <Stack>
              <Panel title={ORG_HOME.assetsTitle} action={<StatusPill status="sample" />}>
                <ul className="flex flex-col">
                  {assets.map((asset) => (
                    <li
                      key={asset.id}
                      className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-title-item text-ink">{asset.symbol}</span>
                        <span className="text-small text-ink-muted">{asset.name}</span>
                      </div>
                      <div className="flex flex-col gap-0.5 sm:items-end">
                        <span className="text-amount text-ink">{asset.balance}</span>
                        <span className="text-small text-ink-muted">
                          {ORG_HOME.shareOfTotal(percent(totalValue > 0 ? asset.valueUsdNumber / totalValue : 0))}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title={ORG_HOME.rulesTitle} description={ORG_HOME.rulesDescription} action={<StatusPill status="sample" />}>
                <ul className="flex flex-col">
                  {rules.slice(0, HOME_RULE_LIMIT).map((rule) => (
                    <li key={rule.id} className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0 first:pt-0">
                      <span className="text-title-item text-ink">{rule.name}</span>
                      <span className="text-small text-ink-secondary">
                        {ORG_HOME.perPayment(usd(rule.limitPerPaymentUsd))} · {ORG_HOME.perDay(usd(rule.dailyLimitUsd))}
                      </span>
                    </li>
                  ))}
                </ul>
                <div>
                  <ButtonLink variant="link" to="/app/dao/treasury-policy">
                    {ORG_HOME.viewAllRules}
                  </ButtonLink>
                </div>
              </Panel>
            </Stack>
          }
          side={
            <Panel title={ORG_HOME.goToTitle}>
              <ul className="flex flex-col gap-3">
                {ORGANIZATION_GROUP.items.map((item) => (
                  <li key={item.key}>
                    <LinkCard
                      to={item.path}
                      icon={item.icon}
                      title={item.label}
                      description={ORG_LINE_BY_NAV[item.key] ?? item.label}
                    />
                  </li>
                ))}
              </ul>
            </Panel>
          }
        />
      </Stack>
    </PageContainer>
  );
}

export function AppShellPage() {
  const mode = useAppMode((state) => state.mode);
  return mode === 'dao' ? <OrganizationHome /> : <PersonalHome />;
}
