import React, { useMemo, useState } from 'react';
import { ArrowRight, Clock3, Plus, ShieldCheck, UserCheck, Users, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { StatsCard } from '../../components/shared/StatsCard';
import { DataTable, type Column } from '../../components/shared/DataTable';
import { DaoPreviewBanner } from '../../components/dao/DaoPreviewBanner';
import { DaoSectionNav } from '../../components/dao/DaoSectionNav';
import { DaoWorkspaceModal } from '../../components/dao/DaoWorkspaceModal';
import {
  deriveDaoSummary,
  getRoleMemberCount,
  useDaoWorkspace,
  type DaoMemberDraft,
  type DaoWorkspaceMember,
} from '../../stores/useDaoWorkspace';

const emptyMemberDraft: DaoMemberDraft = {
  name: '',
  role: 'Treasury Steward',
  wallets: '1 wallet',
  vaultCoverage: 'Ops',
  signingWindow: 'UTC+0 / 09:00-17:00',
  responseSla: '< 4 hrs',
  status: 'Primary',
};

export const DaoTeamPage: React.FC = () => {
  const { members, roles, assets, vaults, proposals, policyLanes, recipientRules, addMember, updateMember, removeMember } =
    useDaoWorkspace();
  const summary = deriveDaoSummary({ assets, vaults, proposals, policyLanes, recipientRules, members });
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<DaoWorkspaceMember | null>(null);
  const [memberDraft, setMemberDraft] = useState<DaoMemberDraft>(emptyMemberDraft);

  const primarySigners = members.filter((member) => member.status === 'Primary').length;
  const backupCoverage = members.filter((member) => member.status === 'Backup').length;

  const roleCoverage = useMemo(
    () =>
      roles.map((role) => ({
        ...role,
        memberCount: getRoleMemberCount(role.role, members),
        membersLabel: `${getRoleMemberCount(role.role, members)} member${getRoleMemberCount(role.role, members) === 1 ? '' : 's'}`,
        assignedMembers: members.filter((member) => member.role === role.role).map((member) => member.name),
      })),
    [roles, members],
  );

  const memberColumns: Column<DaoWorkspaceMember>[] = [
    {
      key: 'name',
      label: 'Member',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-display text-lg text-textPrimary">{row.name}</p>
          <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">{row.role}</p>
        </div>
      ),
    },
    {
      key: 'wallets',
      label: 'Wallet Coverage',
      sortable: true,
      render: (row) => (
        <div>
          <p className="text-sm text-textPrimary">{row.wallets}</p>
          <p className="text-xs font-mono text-textMuted">{row.vaultCoverage}</p>
        </div>
      ),
    },
    {
      key: 'signingWindow',
      label: 'Signing Window',
      sortable: true,
      render: (row) => <span className="text-sm text-textPrimary">{row.signingWindow}</span>,
    },
    {
      key: 'responseSla',
      label: 'Response SLA',
      sortable: true,
      render: (row) => <span className="rounded-full bg-surfaceAlt px-3 py-1 text-xs font-mono text-textPrimary">{row.responseSla}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <span
          className={`rounded-full px-3 py-1 text-xs font-mono uppercase tracking-[0.18em] ${
            row.status === 'Primary'
              ? 'bg-primary/10 text-primary'
              : row.status === 'Backup'
                ? 'bg-secondary/10 text-secondary'
                : 'bg-surfaceAlt text-textMuted'
          }`}
        >
          {row.status}
        </span>
      ),
    },
  ];

  const openNewMemberModal = () => {
    setEditingMember(null);
    setMemberDraft(emptyMemberDraft);
    setIsMemberModalOpen(true);
  };

  const openEditMemberModal = (member: DaoWorkspaceMember) => {
    setEditingMember(member);
    setMemberDraft({
      name: member.name,
      role: member.role,
      wallets: member.wallets,
      vaultCoverage: member.vaultCoverage,
      signingWindow: member.signingWindow,
      responseSla: member.responseSla,
      status: member.status,
    });
    setIsMemberModalOpen(true);
  };

  const handleSaveMember = () => {
    if (editingMember) {
      updateMember(editingMember.id, memberDraft);
    } else {
      addMember(memberDraft);
    }
    setIsMemberModalOpen(false);
    setEditingMember(null);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <div className="mb-6">
        <p className="mb-3 text-xs font-mono uppercase tracking-[0.24em] text-textMuted">DAO Treasury</p>
        <h1 className="font-display text-3xl text-textPrimary md:text-5xl">Team Directory</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-textSecondary">
          Assign signers, reviewers, delegates, and observers to the treasury workflows they actually own.
        </p>
      </div>

      <DaoSectionNav />

      <DaoPreviewBanner
        eyebrow="Operations Coverage"
        title="The people layer behind treasury execution."
        description="Manage signer coverage, handoffs, response SLAs, and role ownership in a frontend shell that already behaves like a real operations workspace."
      />

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          label="Tracked Members"
          value={summary.teamMembers}
          subtitle="Signers, reviewers, delegates, observers"
          icon={Users}
          color="accent"
        />
        <StatsCard
          label="Primary Signers"
          value={primarySigners}
          subtitle={summary.signerCoverage}
          icon={ShieldCheck}
          color="primary"
        />
        <StatsCard
          label="Backup Coverage"
          value={backupCoverage}
          subtitle="Delegated fallbacks ready"
          icon={UserCheck}
          color="secondary"
        />
        <StatsCard
          label="Wallet Readiness"
          value="94%"
          subtitle="Production-grade wallet coverage"
          icon={Wallet}
          color="muted"
        />
      </div>

      <div className="mb-8 grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <Card padding="lg" className="border-border/40">
          <div className="mb-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Role Coverage</p>
              <h2 className="mt-2 font-display text-2xl text-textPrimary">Who owns which treasury lane</h2>
            </div>
            <Button variant="outline" onClick={openNewMemberModal}>
              <Plus className="mr-2 h-4 w-4" />
              Add Member
            </Button>
          </div>

          <div className="space-y-4">
            {roleCoverage.map((role) => (
              <div key={role.id} className="rounded-2xl border border-border/30 bg-surfaceAlt p-4">
                <div className="mb-3 flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                  <div>
                    <h3 className="font-display text-xl text-textPrimary">{role.role}</h3>
                    <p className="text-sm text-textSecondary">{role.scope}</p>
                  </div>
                  <span className="rounded-full bg-surface px-3 py-1 text-xs font-mono text-textPrimary">
                    {role.membersLabel}
                  </span>
                </div>
                <div className="mb-3 h-2 overflow-hidden rounded-full bg-primarySoft/60">
                  <div
                    className={`h-full rounded-full ${
                      role.riskTier === 'Critical'
                        ? 'bg-primary'
                        : role.riskTier === 'Controlled'
                          ? 'bg-accent'
                          : 'bg-secondary'
                    }`}
                    style={{ width: `${Math.min(Math.max(role.memberCount, 1) * 18, 100)}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-mono text-textMuted">
                  <span className="rounded-full bg-surface px-2 py-1">{role.approvalLane}</span>
                  <span className="rounded-full bg-surface px-2 py-1">{role.permissions}</span>
                  <span className="rounded-full bg-surface px-2 py-1">{role.riskTier} tier</span>
                </div>
                {role.assignedMembers.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {role.assignedMembers.map((name) => (
                      <span key={name} className="rounded-full bg-primarySoft px-2 py-1 text-xs font-mono text-textPrimary">
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card padding="lg" className="border-border/40">
            <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Coverage Model</p>
                <h2 className="mt-2 font-display text-2xl text-textPrimary">Follow-the-sun signing</h2>
              </div>
              <div className="rounded-2xl bg-secondary/10 p-3 text-secondary">
                <Clock3 className="h-6 w-6" />
              </div>
            </div>
            <div className="space-y-3">
              {[
                'Europe/Africa operators open the day with payroll, grants, and treasury review.',
                'Americas coverage protects finance-lane refills, reconciliations, and vendor flows.',
                'APAC members backstop emergency and security-lane operations overnight.',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-border/30 bg-surfaceAlt p-4 text-sm leading-6 text-textSecondary">
                  {item}
                </div>
              ))}
            </div>
          </Card>

          <Card padding="lg" className="border-border/40">
            <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Readiness Checklist</p>
                <h2 className="mt-2 font-display text-2xl text-textPrimary">Before members go live</h2>
              </div>
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <ShieldCheck className="h-6 w-6" />
              </div>
            </div>
            <div className="space-y-3">
              {[
                'Primary and backup wallets must be mapped to the correct treasury lanes.',
                'Emergency escalation contacts should be explicit for every critical role.',
                'Observers should retain export and reporting access without signing rights.',
                'Every member should understand the asset classes they can move and the caps that apply.',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl bg-surfaceAlt p-4">
                  <div className="mt-1 h-2 w-2 rounded-full bg-accent" />
                  <p className="text-sm leading-6 text-textSecondary">{item}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="mb-8">
        <div className="mb-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Member Registry</p>
            <h2 className="mt-2 font-display text-2xl text-textPrimary">Wallet and signer directory</h2>
          </div>
          <Link to="/app/dao/roles" className="inline-flex items-center gap-2 text-sm font-mono text-accent hover:text-primary">
            Cross-check role model
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <DataTable
          columns={memberColumns}
          data={members}
          onRowClick={openEditMemberModal}
          enableImport={false}
          emptyMessage="No team members configured yet."
        />
      </div>

      <DaoWorkspaceModal
        isOpen={isMemberModalOpen}
        onClose={() => {
          setEditingMember(null);
          setIsMemberModalOpen(false);
        }}
        onSubmit={handleSaveMember}
        submitLabel={editingMember ? 'Update member' : 'Add member'}
        submitDisabled={!memberDraft.name.trim()}
        onDelete={editingMember ? () => {
          removeMember(editingMember.id);
          setEditingMember(null);
          setIsMemberModalOpen(false);
        } : undefined}
        deleteLabel="Remove member"
        title={editingMember ? 'Update team member' : 'Add team member'}
        description="This client-side workflow is designed to become the contract between the DAO frontend and the future organization backend."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Name"
            value={memberDraft.name}
            onChange={(event) => setMemberDraft((current) => ({ ...current, name: event.target.value }))}
          />
          <Select
            label="Role"
            value={memberDraft.role}
            onChange={(event) => setMemberDraft((current) => ({ ...current, role: event.target.value }))}
            options={roles.map((role) => ({ value: role.role, label: role.role }))}
          />
          <Input
            label="Wallet coverage"
            value={memberDraft.wallets}
            onChange={(event) => setMemberDraft((current) => ({ ...current, wallets: event.target.value }))}
            placeholder="2 wallets"
          />
          <Input
            label="Vault coverage"
            value={memberDraft.vaultCoverage}
            onChange={(event) => setMemberDraft((current) => ({ ...current, vaultCoverage: event.target.value }))}
            placeholder="Ops, Grants"
          />
          <Input
            label="Signing window"
            value={memberDraft.signingWindow}
            onChange={(event) => setMemberDraft((current) => ({ ...current, signingWindow: event.target.value }))}
            placeholder="UTC+1 / 08:00-18:00"
          />
          <Input
            label="Response SLA"
            value={memberDraft.responseSla}
            onChange={(event) => setMemberDraft((current) => ({ ...current, responseSla: event.target.value }))}
            placeholder="< 4 hrs"
          />
          <div className="md:col-span-2">
            <Select
              label="Status"
              value={memberDraft.status}
              onChange={(event) =>
                setMemberDraft((current) => ({
                  ...current,
                  status: event.target.value as DaoMemberDraft['status'],
                }))
              }
              options={[
                { value: 'Primary', label: 'Primary signer' },
                { value: 'Backup', label: 'Backup signer' },
                { value: 'Observer', label: 'Observer' },
              ]}
            />
          </div>
        </div>
      </DaoWorkspaceModal>
    </div>
  );
};
