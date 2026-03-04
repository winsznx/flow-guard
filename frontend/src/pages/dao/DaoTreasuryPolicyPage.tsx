import React, { useState } from 'react';
import { ArrowRight, Landmark, Plus, Shield, Siren, SlidersHorizontal } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { StatsCard } from '../../components/shared/StatsCard';
import { DataTable, type Column } from '../../components/shared/DataTable';
import { DaoPreviewBanner } from '../../components/dao/DaoPreviewBanner';
import { DaoSectionNav } from '../../components/dao/DaoSectionNav';
import { DaoWorkspaceModal } from '../../components/dao/DaoWorkspaceModal';
import {
  deriveDaoSummary,
  useDaoWorkspace,
  type DaoGuardrailDraft,
  type DaoPolicyLaneDraft,
  type DaoRecipientRuleDraft,
  type DaoWorkspaceGuardrail,
  type DaoWorkspacePolicyLane,
  type DaoWorkspaceRecipientRule,
} from '../../stores/useDaoWorkspace';
import { buildDaoBatchStreamState } from '../../utils/daoStreamLaunch';

const emptyLaneDraft: DaoPolicyLaneDraft = {
  lane: '',
  txCap: '$2.5K',
  dailyCap: '$7.5K',
  approvers: '2 of 4 signers',
  executionWindow: 'Immediate',
  assets: 'BCH',
};

const emptyRecipientDraft: DaoRecipientRuleDraft = {
  name: '',
  address: '',
  category: 'Vendor',
  assetScope: 'BCH',
  lane: 'Finance lane',
  status: 'Approved',
};

export const DaoTreasuryPolicyPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    assets,
    vaults,
    proposals,
    members,
    policyLanes,
    recipientRules,
    guardrails,
    addPolicyLane,
    updatePolicyLane,
    addRecipientRule,
    updateRecipientRule,
    removeRecipientRule,
    updateGuardrail,
  } = useDaoWorkspace();
  const summary = deriveDaoSummary({ assets, vaults, proposals, policyLanes, recipientRules, members });

  const [isLaneModalOpen, setIsLaneModalOpen] = useState(false);
  const [editingLane, setEditingLane] = useState<DaoWorkspacePolicyLane | null>(null);
  const [laneDraft, setLaneDraft] = useState<DaoPolicyLaneDraft>(emptyLaneDraft);

  const [isGuardrailModalOpen, setIsGuardrailModalOpen] = useState(false);
  const [editingGuardrail, setEditingGuardrail] = useState<DaoWorkspaceGuardrail | null>(null);
  const [guardrailDraft, setGuardrailDraft] = useState<DaoGuardrailDraft>({
    assetClass: '',
    defaultLane: '',
    dailyNetCap: '',
    routingRule: '',
    notes: '',
  });

  const [isRecipientModalOpen, setIsRecipientModalOpen] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<DaoWorkspaceRecipientRule | null>(null);
  const [recipientDraft, setRecipientDraft] = useState<DaoRecipientRuleDraft>(emptyRecipientDraft);

  const laneColumns: Column<DaoWorkspacePolicyLane>[] = [
    {
      key: 'lane',
      label: 'Execution Lane',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-display text-lg text-textPrimary">{row.lane}</p>
          <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">{row.assets}</p>
        </div>
      ),
    },
    {
      key: 'approvers',
      label: 'Approvers',
      sortable: true,
      render: (row) => <span className="text-sm text-textPrimary">{row.approvers}</span>,
    },
    {
      key: 'txCap',
      label: 'Per Tx Cap',
      sortable: true,
      render: (row) => <span className="rounded-full bg-surfaceAlt px-3 py-1 text-xs font-mono text-textPrimary">{row.txCap}</span>,
    },
    {
      key: 'dailyCap',
      label: 'Daily Cap',
      sortable: true,
      render: (row) => <span className="text-sm text-textPrimary">{row.dailyCap}</span>,
    },
    {
      key: 'executionWindow',
      label: 'Execution Window',
      sortable: true,
      render: (row) => (
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-mono uppercase tracking-[0.18em] text-primary">
          {row.executionWindow}
        </span>
      ),
    },
  ];

  const guardrailColumns: Column<DaoWorkspaceGuardrail>[] = [
    {
      key: 'assetClass',
      label: 'Asset Class',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-display text-lg text-textPrimary">{row.assetClass}</p>
          <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">{row.defaultLane}</p>
        </div>
      ),
    },
    {
      key: 'dailyNetCap',
      label: 'Daily Net Cap',
      sortable: true,
      render: (row) => <span className="rounded-full bg-surfaceAlt px-3 py-1 text-xs font-mono text-textPrimary">{row.dailyNetCap}</span>,
    },
    {
      key: 'routingRule',
      label: 'Routing Rule',
      sortable: true,
      render: (row) => <span className="text-sm leading-6 text-textSecondary">{row.routingRule}</span>,
    },
    {
      key: 'notes',
      label: 'Notes',
      sortable: true,
      render: (row) => <span className="text-sm leading-6 text-textSecondary">{row.notes}</span>,
    },
  ];

  const recipientColumns: Column<DaoWorkspaceRecipientRule>[] = [
    {
      key: 'name',
      label: 'Recipient',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-display text-lg text-textPrimary">{row.name}</p>
          <p className="text-xs font-mono text-textMuted">{row.address}</p>
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      sortable: true,
      render: (row) => <span className="rounded-full bg-surfaceAlt px-3 py-1 text-xs font-mono text-textPrimary">{row.category}</span>,
    },
    {
      key: 'assetScope',
      label: 'Asset Scope',
      sortable: true,
      render: (row) => <span className="text-sm text-textPrimary">{row.assetScope}</span>,
    },
    {
      key: 'lane',
      label: 'Policy Lane',
      sortable: true,
      render: (row) => <span className="text-sm text-textPrimary">{row.lane}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <span
          className={`rounded-full px-3 py-1 text-xs font-mono uppercase tracking-[0.18em] ${
            row.status === 'Approved'
              ? 'bg-primary/10 text-primary'
              : row.status === 'Watch'
                ? 'bg-secondary/10 text-secondary'
                : 'bg-error/10 text-error'
          }`}
        >
          {row.status}
        </span>
      ),
    },
  ];

  const openLaneModal = (lane?: DaoWorkspacePolicyLane) => {
    if (lane) {
      setEditingLane(lane);
      setLaneDraft({
        lane: lane.lane,
        txCap: lane.txCap,
        dailyCap: lane.dailyCap,
        approvers: lane.approvers,
        executionWindow: lane.executionWindow,
        assets: lane.assets,
      });
    } else {
      setEditingLane(null);
      setLaneDraft(emptyLaneDraft);
    }
    setIsLaneModalOpen(true);
  };

  const openGuardrailModal = (guardrail: DaoWorkspaceGuardrail) => {
    setEditingGuardrail(guardrail);
    setGuardrailDraft({
      assetClass: guardrail.assetClass,
      defaultLane: guardrail.defaultLane,
      dailyNetCap: guardrail.dailyNetCap,
      routingRule: guardrail.routingRule,
      notes: guardrail.notes,
    });
    setIsGuardrailModalOpen(true);
  };

  const openRecipientModal = (recipient?: DaoWorkspaceRecipientRule) => {
    if (recipient) {
      setEditingRecipient(recipient);
      setRecipientDraft({
        name: recipient.name,
        address: recipient.address,
        category: recipient.category,
        assetScope: recipient.assetScope,
        lane: recipient.lane,
        status: recipient.status,
      });
    } else {
      setEditingRecipient(null);
      setRecipientDraft(emptyRecipientDraft);
    }
    setIsRecipientModalOpen(true);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <div className="mb-6">
        <p className="mb-3 text-xs font-mono uppercase tracking-[0.24em] text-textMuted">DAO Treasury</p>
        <h1 className="font-display text-3xl text-textPrimary md:text-5xl">Treasury Policy</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-textSecondary">
          Control how treasury value moves by editing execution lanes, asset guardrails, and recipient routing rules.
        </p>
      </div>

      <DaoSectionNav />

      <DaoPreviewBanner
        eyebrow="Policy Surface"
        title="Thresholds, delays, whitelists, and asset rules in one place."
        description="This page is built to act like a full treasury policy console, even before the backend policy engine lands. Lanes, guardrails, and routing rules are all editable and persist locally."
      />

      <div className="mb-8 flex flex-wrap gap-3">
        <Button
          onClick={() =>
            navigate(
              '/streams/batch-create',
              {
                state: buildDaoBatchStreamState(recipientRules, {
                  source: 'dao-policy',
                  title: 'Open payroll batch from policy',
                  description: 'Approved routing rules are preloaded into the shared batch stream console so treasury ops can act without rebuilding the roster.',
                  preferredLane: 'Finance lane',
                }),
              },
            )
          }
        >
          Launch policy-approved batch
        </Button>
        <Link to="/streams/create?template=tranche-cliff-staged" state={{
          daoContext: {
            source: 'dao-policy',
            title: 'Open staged treasury vesting',
            description: 'Launching the shared stream builder from treasury policy with a staged vesting template.',
            preferredLane: 'Timelocked lane',
          },
        }}>
          <Button variant="outline">Create staged treasury vesting</Button>
        </Link>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          label="Execution Lanes"
          value={policyLanes.length}
          subtitle="Immediate, finance, timelocked, emergency"
          icon={SlidersHorizontal}
          color="accent"
        />
        <StatsCard
          label="Approved Recipients"
          value={summary.whitelistedRecipients}
          subtitle="Treasury routes currently allowed"
          icon={Shield}
          color="primary"
        />
        <StatsCard
          label="Emergency Delay"
          value={summary.emergencyDelay}
          subtitle="High-friction override window"
          icon={Siren}
          color="secondary"
        />
        <StatsCard
          label="Policy Coverage"
          value={summary.policyCoverage}
          subtitle={`${guardrails.length} asset guardrails in force`}
          icon={Landmark}
          color="muted"
        />
      </div>

      <div className="mb-8 grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <Card padding="lg" className="border-border/40">
          <div className="mb-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Execution Lanes</p>
              <h2 className="mt-2 font-display text-2xl text-textPrimary">Threshold and timing model</h2>
            </div>
            <Button variant="outline" onClick={() => openLaneModal()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Lane
            </Button>
          </div>
          <div className="space-y-4">
            {policyLanes.map((lane) => (
              <button
                key={lane.id}
                onClick={() => openLaneModal(lane)}
                className="w-full rounded-2xl border border-border/30 bg-surfaceAlt p-4 text-left transition-colors hover:border-borderHover hover:bg-surface"
              >
                <div className="mb-3 flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                  <div>
                    <h3 className="font-display text-xl text-textPrimary">{lane.lane}</h3>
                    <p className="text-sm text-textSecondary">{lane.approvers}</p>
                  </div>
                  <span className="rounded-full bg-surface px-3 py-1 text-xs font-mono text-textPrimary">
                    {lane.executionWindow}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-mono text-textMuted">
                  <span className="rounded-full bg-surface px-2 py-1">{lane.txCap} / tx</span>
                  <span className="rounded-full bg-surface px-2 py-1">{lane.dailyCap} daily</span>
                  <span className="rounded-full bg-surface px-2 py-1">{lane.assets}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card padding="lg" className="border-border/40">
            <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Policy Principles</p>
                <h2 className="mt-2 font-display text-2xl text-textPrimary">How the treasury should behave</h2>
              </div>
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Shield className="h-6 w-6" />
              </div>
            </div>
            <div className="space-y-3">
              {[
                'BCH operations should stay fast, but only inside caps and approved recipient paths.',
                'Stablecoin settlement should require stronger review and richer accounting context.',
                'Governance token flows should be timelocked and socially reviewable before execution.',
                'NFT receipts and milestone proofs should behave like audit-sensitive treasury artifacts.',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl bg-surfaceAlt p-4">
                  <div className="mt-1 h-2 w-2 rounded-full bg-accent" />
                  <p className="text-sm leading-6 text-textSecondary">{item}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card padding="lg" className="border-border/40">
            <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Guardrail Health</p>
                <h2 className="mt-2 font-display text-2xl text-textPrimary">Asset rule coverage</h2>
              </div>
              <div className="rounded-2xl bg-secondary/10 p-3 text-secondary">
                <Siren className="h-6 w-6" />
              </div>
            </div>
            <div className="space-y-3">
              {guardrails.map((guardrail) => (
                <button
                  key={guardrail.id}
                  onClick={() => openGuardrailModal(guardrail)}
                  className="w-full rounded-2xl border border-border/30 bg-surfaceAlt p-4 text-left transition-colors hover:border-borderHover hover:bg-surface"
                >
                  <div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="font-display text-lg text-textPrimary">{guardrail.assetClass}</h3>
                    <span className="rounded-full bg-surface px-2 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-textMuted">
                      {guardrail.defaultLane}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-textSecondary">{guardrail.routingRule}</p>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="mb-8">
        <div className="mb-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Policy Matrix</p>
            <h2 className="mt-2 font-display text-2xl text-textPrimary">Lanes, caps, and delays</h2>
          </div>
          <Link to="/proposals" className="inline-flex items-center gap-2 text-sm font-mono text-accent hover:text-primary">
            Compare with proposal queue
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <DataTable
          columns={laneColumns}
          data={policyLanes}
          onRowClick={openLaneModal}
          enableImport={false}
          emptyMessage="No policy lanes configured yet."
        />
      </div>

      <div className="mb-8">
        <div className="mb-4">
          <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Asset Guardrails</p>
          <h2 className="mt-2 font-display text-2xl text-textPrimary">Rules by treasury asset class</h2>
        </div>
        <DataTable
          columns={guardrailColumns}
          data={guardrails}
          onRowClick={openGuardrailModal}
          enableImport={false}
          emptyMessage="No asset guardrails configured yet."
        />
      </div>

      <div className="mb-8">
        <div className="mb-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Recipient Rules</p>
            <h2 className="mt-2 font-display text-2xl text-textPrimary">Whitelisted treasury destinations</h2>
          </div>
          <Button variant="outline" onClick={() => openRecipientModal()}>
            <Plus className="mr-2 h-4 w-4" />
            Add Recipient Rule
          </Button>
        </div>
        <DataTable
          columns={recipientColumns}
          data={recipientRules}
          onRowClick={openRecipientModal}
          enableImport={false}
          emptyMessage="No recipient rules configured yet."
        />
      </div>

      <DaoWorkspaceModal
        isOpen={isLaneModalOpen}
        onClose={() => {
          setEditingLane(null);
          setIsLaneModalOpen(false);
        }}
        onSubmit={() => {
          if (editingLane) {
            updatePolicyLane(editingLane.id, laneDraft);
          } else {
            addPolicyLane(laneDraft);
          }
          setEditingLane(null);
          setIsLaneModalOpen(false);
        }}
        submitLabel={editingLane ? 'Update lane' : 'Create lane'}
        submitDisabled={!laneDraft.lane.trim()}
        title={editingLane ? 'Update policy lane' : 'Create policy lane'}
        description="Use lanes to define spend caps, approval thresholds, delays, and which asset classes can move through each route."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Lane name"
            value={laneDraft.lane}
            onChange={(event) => setLaneDraft((current) => ({ ...current, lane: event.target.value }))}
          />
          <Input
            label="Approvers"
            value={laneDraft.approvers}
            onChange={(event) => setLaneDraft((current) => ({ ...current, approvers: event.target.value }))}
            placeholder="3 of 5 reviewers"
          />
          <Input
            label="Per-transaction cap"
            value={laneDraft.txCap}
            onChange={(event) => setLaneDraft((current) => ({ ...current, txCap: event.target.value }))}
          />
          <Input
            label="Daily cap"
            value={laneDraft.dailyCap}
            onChange={(event) => setLaneDraft((current) => ({ ...current, dailyCap: event.target.value }))}
          />
          <Input
            label="Execution window"
            value={laneDraft.executionWindow}
            onChange={(event) => setLaneDraft((current) => ({ ...current, executionWindow: event.target.value }))}
          />
          <Input
            label="Assets"
            value={laneDraft.assets}
            onChange={(event) => setLaneDraft((current) => ({ ...current, assets: event.target.value }))}
            placeholder="BCH, USDh"
          />
        </div>
      </DaoWorkspaceModal>

      <DaoWorkspaceModal
        isOpen={isGuardrailModalOpen}
        onClose={() => {
          setEditingGuardrail(null);
          setIsGuardrailModalOpen(false);
        }}
        onSubmit={() => {
          if (editingGuardrail) {
            updateGuardrail(editingGuardrail.id, guardrailDraft);
          }
          setEditingGuardrail(null);
          setIsGuardrailModalOpen(false);
        }}
        submitLabel="Update guardrail"
        submitDisabled={!guardrailDraft.assetClass.trim()}
        title="Update asset guardrail"
        description="Guardrails define how each asset class should be routed, capped, and explained inside the treasury workspace."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Asset class"
            value={guardrailDraft.assetClass}
            onChange={(event) => setGuardrailDraft((current) => ({ ...current, assetClass: event.target.value }))}
          />
          <Select
            label="Default lane"
            value={guardrailDraft.defaultLane}
            onChange={(event) => setGuardrailDraft((current) => ({ ...current, defaultLane: event.target.value }))}
            options={policyLanes.map((lane) => ({ value: lane.lane, label: lane.lane }))}
          />
          <Input
            label="Daily net cap"
            value={guardrailDraft.dailyNetCap}
            onChange={(event) => setGuardrailDraft((current) => ({ ...current, dailyNetCap: event.target.value }))}
          />
          <div className="md:col-span-2">
            <Textarea
              label="Routing rule"
              rows={3}
              value={guardrailDraft.routingRule}
              onChange={(event) => setGuardrailDraft((current) => ({ ...current, routingRule: event.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <Textarea
              label="Notes"
              rows={3}
              value={guardrailDraft.notes}
              onChange={(event) => setGuardrailDraft((current) => ({ ...current, notes: event.target.value }))}
            />
          </div>
        </div>
      </DaoWorkspaceModal>

      <DaoWorkspaceModal
        isOpen={isRecipientModalOpen}
        onClose={() => {
          setEditingRecipient(null);
          setIsRecipientModalOpen(false);
        }}
        onSubmit={() => {
          if (editingRecipient) {
            updateRecipientRule(editingRecipient.id, recipientDraft);
          } else {
            addRecipientRule(recipientDraft);
          }
          setEditingRecipient(null);
          setIsRecipientModalOpen(false);
        }}
        onDelete={editingRecipient ? () => {
          removeRecipientRule(editingRecipient.id);
          setEditingRecipient(null);
          setIsRecipientModalOpen(false);
        } : undefined}
        deleteLabel="Remove rule"
        submitLabel={editingRecipient ? 'Update recipient rule' : 'Create recipient rule'}
        submitDisabled={!recipientDraft.name.trim() || !recipientDraft.address.trim()}
        title={editingRecipient ? 'Update recipient rule' : 'Add recipient rule'}
        description="Recipient rules determine which treasury destinations are allowed, under which lane, and for which asset classes."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Recipient name"
            value={recipientDraft.name}
            onChange={(event) => setRecipientDraft((current) => ({ ...current, name: event.target.value }))}
          />
          <Input
            label="Address"
            value={recipientDraft.address}
            onChange={(event) => setRecipientDraft((current) => ({ ...current, address: event.target.value }))}
          />
          <Select
            label="Category"
            value={recipientDraft.category}
            onChange={(event) =>
              setRecipientDraft((current) => ({
                ...current,
                category: event.target.value as DaoRecipientRuleDraft['category'],
              }))
            }
            options={[
              { value: 'Payroll', label: 'Payroll' },
              { value: 'Vendor', label: 'Vendor' },
              { value: 'Grant', label: 'Grant' },
              { value: 'Delegate', label: 'Delegate' },
              { value: 'Emergency', label: 'Emergency' },
            ]}
          />
          <Input
            label="Asset scope"
            value={recipientDraft.assetScope}
            onChange={(event) => setRecipientDraft((current) => ({ ...current, assetScope: event.target.value }))}
            placeholder="BCH, USDh"
          />
          <Select
            label="Lane"
            value={recipientDraft.lane}
            onChange={(event) => setRecipientDraft((current) => ({ ...current, lane: event.target.value }))}
            options={policyLanes.map((lane) => ({ value: lane.lane, label: lane.lane }))}
          />
          <Select
            label="Status"
            value={recipientDraft.status}
            onChange={(event) =>
              setRecipientDraft((current) => ({
                ...current,
                status: event.target.value as DaoRecipientRuleDraft['status'],
              }))
            }
            options={[
              { value: 'Approved', label: 'Approved' },
              { value: 'Watch', label: 'Watch' },
              { value: 'Blocked', label: 'Blocked' },
            ]}
          />
        </div>
      </DaoWorkspaceModal>
    </div>
  );
};
