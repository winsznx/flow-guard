import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Coins,
  Plus,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { StatsCard } from '../../components/shared/StatsCard';
import { DataTable, type Column } from '../../components/shared/DataTable';
import { DaoPreviewBanner } from '../../components/dao/DaoPreviewBanner';
import { DaoSectionNav } from '../../components/dao/DaoSectionNav';
import { DaoWorkspaceModal } from '../../components/dao/DaoWorkspaceModal';
import { DaoAssetAllocationChart } from '../../components/dao/DaoAssetAllocationChart';
import { DaoCashflowChart } from '../../components/dao/DaoCashflowChart';
import { DaoProposalStageChart } from '../../components/dao/DaoProposalStageChart';
import {
  deriveDaoSummary,
  formatUsd,
  useDaoWorkspace,
  type DaoProposalDraft,
  type DaoWorkspaceProposal,
  type DaoWorkspaceVault,
} from '../../stores/useDaoWorkspace';
import { buildDaoBatchStreamState, buildDaoSingleStreamState } from '../../utils/daoStreamLaunch';

const emptyProposalDraft: DaoProposalDraft = {
  title: '',
  lane: 'Finance lane',
  amountNumber: 2500,
  asset: 'BCH',
  stage: 'Draft',
  eta: 'Awaiting author',
};

export const DaoOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    assets,
    vaults,
    proposals,
    policyLanes,
    recipientRules,
    members,
    timeline,
    cashflow,
    addProposal,
    updateProposal,
    updateVaultStatus,
  } = useDaoWorkspace();

  const summary = deriveDaoSummary({ assets, vaults, proposals, policyLanes, recipientRules, members });
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [editingProposal, setEditingProposal] = useState<DaoWorkspaceProposal | null>(null);
  const [proposalDraft, setProposalDraft] = useState<DaoProposalDraft>(emptyProposalDraft);

  const laneOptions = policyLanes.map((lane) => ({ value: lane.lane, label: lane.lane }));
  const assetOptions = assets.map((asset) => ({ value: asset.symbol, label: asset.symbol }));

  const openNewProposalModal = () => {
    setEditingProposal(null);
    setProposalDraft(emptyProposalDraft);
    setIsProposalModalOpen(true);
  };

  const openEditProposalModal = (proposal: DaoWorkspaceProposal) => {
    setEditingProposal(proposal);
    setProposalDraft({
      title: proposal.title,
      lane: proposal.lane,
      amountNumber: proposal.amountNumber,
      asset: proposal.asset,
      stage: proposal.stage,
      eta: proposal.eta,
    });
    setIsProposalModalOpen(true);
  };

  const handleSaveProposal = () => {
    if (editingProposal) {
      updateProposal(editingProposal.id, proposalDraft);
    } else {
      addProposal(proposalDraft);
    }
    setIsProposalModalOpen(false);
    setEditingProposal(null);
  };

  const proposalColumns: Column<DaoWorkspaceProposal>[] = [
    {
      key: 'title',
      label: 'Proposal',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-sans font-semibold text-textPrimary">{row.title}</p>
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-textMuted">{row.lane}</p>
        </div>
      ),
    },
    {
      key: 'asset',
      label: 'Asset',
      sortable: true,
      render: (row) => (
        <span className="rounded-full bg-surfaceAlt px-3 py-1 text-xs font-mono text-textPrimary">{row.asset}</span>
      ),
    },
    {
      key: 'amountNumber',
      label: 'Amount',
      sortable: true,
      className: 'text-right',
      render: (row) => <span className="font-display text-lg text-textPrimary">{row.amount}</span>,
    },
    {
      key: 'stage',
      label: 'Stage',
      sortable: true,
      render: (row) => (
        <span
          className={`rounded-full px-3 py-1 text-xs font-mono uppercase tracking-[0.18em] ${
            row.stage === 'Ready'
              ? 'bg-primary/10 text-primary'
              : row.stage === 'Queued'
                ? 'bg-accent/10 text-accent'
                : row.stage === 'Review'
                  ? 'bg-secondary/10 text-secondary'
                  : 'bg-surfaceAlt text-textMuted'
          }`}
        >
          {row.stage}
        </span>
      ),
    },
  ];

  const vaultColumns: Column<DaoWorkspaceVault>[] = [
    {
      key: 'name',
      label: 'Vault',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-display text-lg text-textPrimary">{row.name}</p>
          <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">{row.mandate}</p>
        </div>
      ),
    },
    {
      key: 'assets',
      label: 'Assets',
      sortable: true,
      render: (row) => <span className="text-sm text-textPrimary">{row.assets}</span>,
    },
    {
      key: 'signers',
      label: 'Signers',
      sortable: true,
      render: (row) => (
        <span className="rounded-full bg-surfaceAlt px-3 py-1 text-xs font-mono text-textPrimary">{row.signers}</span>
      ),
    },
    {
      key: 'monthlyOutflowNumber',
      label: 'Monthly Outflow',
      sortable: true,
      className: 'text-right',
      render: (row) => <span className="font-display text-lg text-textPrimary">{formatUsd(row.monthlyOutflowNumber)}</span>,
    },
    {
      key: 'policyStatus',
      label: 'Policy Status',
      sortable: true,
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {(['Healthy', 'Watch', 'Needs Review'] as const).map((status) => (
            <button
              key={status}
              onClick={(event) => {
                event.stopPropagation();
                updateVaultStatus(row.id, status);
              }}
              className={`rounded-full px-3 py-1 text-xs font-mono uppercase tracking-[0.18em] transition-colors ${
                row.policyStatus === status
                  ? status === 'Healthy'
                    ? 'bg-primary/10 text-primary'
                    : status === 'Watch'
                      ? 'bg-secondary/10 text-secondary'
                      : 'bg-error/10 text-error'
                  : 'bg-surfaceAlt text-textMuted hover:bg-surface'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      ),
    },
  ];

  const runwaySignal = useMemo(
    () =>
      cashflow.reduce(
        (sum, point) => sum + (point.inflow - point.outflow),
        0,
      ),
    [cashflow],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <div className="mb-6">
        <p className="mb-3 text-xs font-mono uppercase tracking-[0.24em] text-textMuted">DAO Treasury</p>
        <h1 className="font-display text-3xl text-textPrimary md:text-5xl">Organization Overview</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-textSecondary">
          Monitor treasury posture across vaults, asset classes, proposal stages, and policy controls from a single DAO operations surface.
        </p>
      </div>

      <DaoSectionNav />

      <DaoPreviewBanner
        eyebrow="Organization Layer"
        title="Treasury visibility, proposal flow, and policy health in one command center."
        description="This frontend workspace is designed to feel production-ready: live treasury metrics, editable proposals, client-side governance controls, and multi-asset monitoring for BCH-native organizations."
      />

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          label="Treasury Value"
          value={summary.treasuryValue}
          subtitle={`${summary.activeVaults} active vaults`}
          icon={Wallet}
          color="accent"
        />
        <StatsCard
          label="Monthly Outflow"
          value={summary.monthlyOutflow}
          subtitle={`${summary.runway} projected runway`}
          icon={Activity}
          color="primary"
        />
        <StatsCard
          label="Asset Classes"
          value={summary.coveredAssets}
          subtitle={`${summary.whitelistedRecipients} approved treasury routes`}
          icon={Coins}
          color="secondary"
        />
        <StatsCard
          label="Policy Coverage"
          value={summary.policyCoverage}
          subtitle={`${summary.proposalsInFlight} active treasury actions`}
          icon={ShieldCheck}
          color="muted"
        />
      </div>

      <div className="mb-8 grid gap-6 xl:grid-cols-[1.35fr,0.65fr]">
        <DaoCashflowChart data={cashflow} />

        <Card padding="lg" className="border-border/40">
          <div className="mb-5">
            <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Quick Actions</p>
            <h2 className="mt-2 font-display text-2xl text-textPrimary">Operate the workspace</h2>
          </div>

          <div className="space-y-3">
            <Button className="w-full justify-between" onClick={openNewProposalModal}>
              Draft treasury proposal
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() =>
                navigate(
                  '/streams/create?template=linear-cliff',
                  {
                    state: buildDaoSingleStreamState({
                      source: 'dao-overview',
                      title: 'Create treasury stream',
                      description: 'You are opening the shared stream builder from DAO Overview with a treasury vesting template.',
                      preferredLane: 'Finance lane',
                    }),
                  },
                )
              }
            >
              Create treasury stream
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() =>
                navigate(
                  '/streams/batch-create',
                  {
                    state: buildDaoBatchStreamState(recipientRules, {
                      source: 'dao-overview',
                      title: 'Launch payroll batch',
                      description: 'Approved DAO recipient routes are preloaded into the shared batch stream console.',
                      preferredLane: 'Finance lane',
                    }),
                  },
                )
              }
            >
              Launch payroll batch
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Link to="/app/dao/streams" className="block">
              <Button variant="outline" className="w-full justify-between">
                Open treasury streams
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/app/dao/team" className="block">
              <Button variant="outline" className="w-full justify-between">
                Manage team coverage
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/app/dao/treasury-policy" className="block">
              <Button variant="outline" className="w-full justify-between">
                Adjust policy lanes
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="mt-6 rounded-2xl bg-surfaceAlt p-4">
            <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Treasury signal</p>
            <p className={`mt-2 font-display text-3xl ${runwaySignal >= 0 ? 'text-primary' : 'text-error'}`}>
              {formatUsd(runwaySignal)}
            </p>
            <p className="mt-2 text-sm leading-6 text-textSecondary">
              Net cash flow across the last six monthly periods. Positive territory means treasury intake is still outpacing operational burn.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-border/30 bg-surfaceAlt p-4">
            <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Recent activity</p>
            <div className="mt-3 space-y-3">
              {timeline.slice(0, 4).map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 h-4 w-4 text-accent" />
                  <div>
                    <p className="text-sm font-semibold text-textPrimary">{item.title}</p>
                    <p className="text-sm leading-6 text-textSecondary">{item.detail}</p>
                    <p className="text-xs font-mono text-textMuted">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="mb-8 grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <DaoAssetAllocationChart assets={assets} />
        <DaoProposalStageChart proposals={proposals} />
      </div>

      <div className="mb-8">
        <div className="mb-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Treasury Queue</p>
            <h2 className="mt-2 font-display text-2xl text-textPrimary">Proposal pipeline</h2>
          </div>
          <Button variant="outline" onClick={openNewProposalModal}>
            <Plus className="mr-2 h-4 w-4" />
            New Proposal
          </Button>
        </div>
        <DataTable
          columns={proposalColumns}
          data={proposals}
          onRowClick={openEditProposalModal}
          enableImport={false}
          emptyMessage="No treasury proposals yet."
        />
      </div>

      <div className="mb-8">
        <div className="mb-4">
          <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Vault Health</p>
          <h2 className="mt-2 font-display text-2xl text-textPrimary">Cross-vault operations matrix</h2>
        </div>
        <DataTable
          columns={vaultColumns}
          data={vaults}
          enableImport={false}
          emptyMessage="No treasury vaults configured."
        />
      </div>

      <DaoWorkspaceModal
        isOpen={isProposalModalOpen}
        onClose={() => {
          setIsProposalModalOpen(false);
          setEditingProposal(null);
        }}
        onSubmit={handleSaveProposal}
        submitLabel={editingProposal ? 'Update proposal' : 'Create proposal'}
        submitDisabled={!proposalDraft.title.trim()}
        title={editingProposal ? 'Update treasury proposal' : 'Create treasury proposal'}
        description="This is a frontend-only workflow for now, but the form shape is designed to map cleanly to a real DAO proposal backend."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Input
              label="Proposal title"
              value={proposalDraft.title}
              onChange={(event) => setProposalDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="Security reserve rebalance"
            />
          </div>
          <Select
            label="Execution lane"
            value={proposalDraft.lane}
            onChange={(event) => setProposalDraft((current) => ({ ...current, lane: event.target.value }))}
            options={laneOptions}
          />
          <Select
            label="Asset"
            value={proposalDraft.asset}
            onChange={(event) => setProposalDraft((current) => ({ ...current, asset: event.target.value }))}
            options={assetOptions}
          />
          <Input
            label="Amount (USD)"
            type="number"
            min="0"
            value={proposalDraft.amountNumber}
            onChange={(event) =>
              setProposalDraft((current) => ({
                ...current,
                amountNumber: Number(event.target.value) || 0,
              }))
            }
          />
          <Select
            label="Stage"
            value={proposalDraft.stage}
            onChange={(event) =>
              setProposalDraft((current) => ({
                ...current,
                stage: event.target.value as DaoProposalDraft['stage'],
              }))
            }
            options={[
              { value: 'Draft', label: 'Draft' },
              { value: 'Review', label: 'Review' },
              { value: 'Queued', label: 'Queued' },
              { value: 'Ready', label: 'Ready' },
            ]}
          />
          <div className="md:col-span-2">
            <Input
              label="ETA / status note"
              value={proposalDraft.eta}
              onChange={(event) => setProposalDraft((current) => ({ ...current, eta: event.target.value }))}
              placeholder="Executes in 6 hrs"
            />
          </div>
        </div>
      </DaoWorkspaceModal>
    </div>
  );
};
