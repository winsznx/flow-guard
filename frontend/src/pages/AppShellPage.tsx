import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Coins,
  FileText,
  Landmark,
  Layers3,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppMode } from '../hooks/useAppMode';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatsCard } from '../components/shared/StatsCard';
import { daoNavSections } from '../data/daoBeta';
import { deriveDaoSummary, useDaoWorkspace } from '../stores/useDaoWorkspace';
import { buildDaoBatchStreamState, buildDaoSingleStreamState } from '../utils/daoStreamLaunch';

const daoIcons = {
  Overview: Layers3,
  Team: Users,
  Roles: ShieldCheck,
  Policy: Settings,
};

export const AppShellPage: React.FC = () => {
  const { mode } = useAppMode();
  const { assets, vaults, proposals, members, policyLanes, recipientRules, alerts } = useDaoWorkspace();
  const daoSummary = deriveDaoSummary({ assets, vaults, proposals, members, policyLanes, recipientRules });

  if (mode === 'dao') {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 md:px-6">
        <div className="mb-8 rounded-3xl border border-border/40 bg-surface p-6 shadow-sm md:p-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-mono uppercase tracking-[0.24em] text-accent">
            DAO Command Center
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.45fr,0.95fr]">
            <div>
              <h1 className="mb-4 font-display text-3xl text-textPrimary md:text-5xl">
                Organization-wide treasury visibility, without leaving the FlowGuard dashboard.
              </h1>
              <p className="max-w-3xl text-base leading-7 text-textSecondary">
                Monitor treasury posture, approval lanes, signer coverage, and policy health across BCH,
                stablecoins, governance tokens, and milestone NFTs without leaving the main workspace.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/streams/create?template=linear-cliff"
                  state={buildDaoSingleStreamState({
                    source: 'dao-home',
                    title: 'Launch from DAO command center',
                    description: 'Opening the shared stream builder with treasury-friendly defaults from the DAO workspace.',
                    preferredLane: 'Finance lane',
                  })}
                >
                  <Button>Create treasury stream</Button>
                </Link>
                <Link
                  to="/streams/batch-create"
                  state={buildDaoBatchStreamState(recipientRules, {
                    source: 'dao-home',
                    title: 'Launch payroll batch',
                    description: 'Approved treasury routes from the DAO workspace are preloaded into the shared batch stream console.',
                    preferredLane: 'Finance lane',
                  })}
                >
                  <Button variant="outline">Launch payroll batch</Button>
                </Link>
              </div>
            </div>

            <Card padding="lg" className="bg-surfaceAlt border-border/40">
              <div className="mb-4 flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">
                    Organization Layer
                  </p>
                  <h2 className="mt-2 font-display text-2xl text-textPrimary">What DAO mode will manage</h2>
                </div>
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Landmark className="h-6 w-6" />
                </div>
              </div>
              <div className="space-y-3">
                {[
                  'Aggregate treasury posture across multiple vaults',
                  'Separate execution lanes by asset class and risk',
                  'Signer coverage, team ownership, and delegated controls',
                  'Proposal queues tied directly to treasury movement',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl bg-surface p-3">
                    <div className="mt-1 h-2 w-2 rounded-full bg-accent" />
                    <p className="text-sm text-textSecondary">{item}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatsCard
            label="Treasury Value"
            value={daoSummary.treasuryValue}
            subtitle={`${daoSummary.activeVaults} active vaults`}
            icon={Wallet}
            color="accent"
          />
          <StatsCard
            label="Covered Assets"
            value={daoSummary.coveredAssets}
            subtitle="BCH, stablecoins, governance FT, NFTs"
            icon={Coins}
            color="primary"
          />
          <StatsCard
            label="Runway"
            value={daoSummary.runway}
            subtitle={`Monthly outflow ${daoSummary.monthlyOutflow}`}
            icon={Activity}
            color="secondary"
          />
          <StatsCard
            label="Policy Coverage"
            value={daoSummary.policyCoverage}
            subtitle={`${daoSummary.proposalsInFlight} proposals in flight`}
            icon={ShieldCheck}
            color="muted"
          />
        </div>

        <div className="mb-8 grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
          <Card padding="lg" className="border-border/40">
            <div className="mb-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Multi-Asset Treasury</p>
                <h2 className="mt-2 font-display text-2xl text-textPrimary">Asset mix across organization vaults</h2>
              </div>
              <Link to="/vaults" className="text-sm font-mono text-accent transition-colors hover:text-primary">
                Inspect vault balances
              </Link>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {assets.map((asset) => (
                <div key={asset.id} className="rounded-2xl border border-border/30 bg-surfaceAlt p-4">
                  <div className="mb-3 flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-display text-xl text-textPrimary">{asset.symbol}</h3>
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-mono uppercase tracking-[0.2em] text-primary">
                          {asset.category}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-textMuted">{asset.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-xl text-textPrimary">{asset.valueUsd}</p>
                      <p className="text-xs font-mono text-textMuted">{asset.balance}</p>
                    </div>
                  </div>
                  <div className="mb-3 h-2 overflow-hidden rounded-full bg-primarySoft/60">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${asset.allocation}%` }} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-textMuted">
                    <span>{asset.allocation}% allocation</span>
                    <span>{asset.vaults} vaults</span>
                    <span>{asset.executionLane}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="space-y-6">
            <Card padding="lg" className="border-border/40">
              <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Approval Lanes</p>
                  <h2 className="mt-2 font-display text-2xl text-textPrimary">Execution readiness</h2>
                </div>
                <div className="rounded-2xl bg-secondary/10 p-3 text-secondary">
                  <FileText className="h-6 w-6" />
                </div>
              </div>
              <div className="space-y-3">
                {policyLanes.slice(0, 3).map((lane) => (
                  <div key={lane.id} className="rounded-2xl border border-border/30 bg-surfaceAlt p-4">
                    <div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="font-display text-lg text-textPrimary">{lane.lane}</h3>
                      <span className="rounded-full bg-surface px-2 py-1 text-[11px] font-mono uppercase tracking-[0.2em] text-textMuted">
                        {lane.executionWindow}
                      </span>
                    </div>
                    <p className="text-sm text-textSecondary">{lane.approvers}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono text-textMuted">
                      <span className="rounded-full bg-surface px-2 py-1">{lane.txCap} / tx</span>
                      <span className="rounded-full bg-surface px-2 py-1">{lane.dailyCap} daily</span>
                      <span className="rounded-full bg-surface px-2 py-1">{lane.assets}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card padding="lg" className="border-border/40">
              <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Risk Watch</p>
                  <h2 className="mt-2 font-display text-2xl text-textPrimary">DAO alerts</h2>
                </div>
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <AlertTriangle className="h-6 w-6" />
                </div>
              </div>
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div key={alert.id} className="rounded-2xl border border-border/30 bg-surfaceAlt p-4">
                    <div className="mb-2 flex items-center gap-3">
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-mono uppercase tracking-[0.2em] ${
                          alert.severity === 'critical'
                            ? 'bg-error/10 text-error'
                            : alert.severity === 'watch'
                              ? 'bg-secondary/10 text-secondary'
                              : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {alert.severity}
                      </span>
                      <h3 className="font-sans text-sm font-semibold text-textPrimary">{alert.title}</h3>
                    </div>
                    <p className="text-sm leading-6 text-textSecondary">{alert.detail}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {daoNavSections.map((section) => {
            const Icon = daoIcons[section.label as keyof typeof daoIcons];

            return (
              <Link
                key={section.path}
                to={section.path}
                className="group rounded-3xl border border-border/40 bg-surface p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-borderHover hover:shadow-md"
              >
                <div className="mb-5 flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
                  <div>
                    <div className="mb-3 inline-flex rounded-2xl bg-accent/10 p-3 text-accent">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h2 className="font-display text-2xl text-textPrimary">{section.label}</h2>
                    <p className="mt-2 max-w-xl text-sm leading-7 text-textSecondary">{section.description}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-textMuted transition-all group-hover:translate-x-1 group-hover:text-textPrimary" />
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-mono text-textMuted">
                  <span className="rounded-full bg-surfaceAlt px-2 py-1">Responsive dashboard</span>
                  <span className="rounded-full bg-surfaceAlt px-2 py-1">Live frontend state</span>
                  <span className="rounded-full bg-surfaceAlt px-2 py-1">Editable workspace</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:px-8">
      <div className="mb-10 text-center md:text-left">
        <h1 className="mb-3 font-display text-3xl text-textPrimary md:text-4xl">Welcome to FlowGuard</h1>
        <p className="max-w-2xl text-lg text-textSecondary">
          Access your vaults, vesting schedules, payment rails, and proposal tools from one BCH-native workspace.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/vaults"
          className="group flex h-full flex-col items-start rounded-2xl border border-border/40 bg-surface p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-borderHover hover:shadow-md"
        >
          <div className="mb-4 rounded-xl bg-primary/10 p-3 text-primary">
            <Wallet className="h-6 w-6" />
          </div>
          <h2 className="mb-2 font-display text-2xl text-textPrimary">Treasury Vaults</h2>
          <p className="mb-6 flex-grow text-sm leading-7 text-textSecondary">
            Manage on-chain treasury balances, signer sets, and proposal-backed execution from one place.
          </p>
          <span className="inline-flex items-center gap-2 text-sm font-mono text-accent">
            Open Vaults
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </Link>

        <Link
          to="/streams"
          className="group flex h-full flex-col items-start rounded-2xl border border-border/40 bg-surface p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-borderHover hover:shadow-md"
        >
          <div className="mb-4 rounded-xl bg-accent/10 p-3 text-accent">
            <Coins className="h-6 w-6" />
          </div>
          <h2 className="mb-2 font-display text-2xl text-textPrimary">Vesting & Streams</h2>
          <p className="mb-6 flex-grow text-sm leading-7 text-textSecondary">
            Track recurring payments, vesting schedules, cliffs, and claimable balances across BCH and CashTokens.
          </p>
          <span className="inline-flex items-center gap-2 text-sm font-mono text-accent">
            Manage Streams
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </Link>

        <Link
          to="/payments"
          className="group flex h-full flex-col items-start rounded-2xl border border-border/40 bg-surface p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-borderHover hover:shadow-md"
        >
          <div className="mb-4 rounded-xl bg-secondary/10 p-3 text-secondary">
            <ArrowRight className="h-6 w-6" />
          </div>
          <h2 className="mb-2 font-display text-2xl text-textPrimary">Payments & Distribution</h2>
          <p className="mb-6 flex-grow text-sm leading-7 text-textSecondary">
            Coordinate recurring payments, one-off releases, and distribution workflows without leaving your wallet.
          </p>
          <span className="inline-flex items-center gap-2 text-sm font-mono text-accent">
            Open Payment Tools
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </Link>
      </div>
    </div>
  );
};
