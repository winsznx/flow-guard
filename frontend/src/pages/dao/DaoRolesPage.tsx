import React, { useMemo, useState } from 'react';
import { ArrowRight, BadgeCheck, Plus, ShieldAlert, ShieldCheck, UserCog, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
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
  getRoleMemberCount,
  useDaoWorkspace,
  type DaoRoleDraft,
  type DaoWorkspaceRole,
} from '../../stores/useDaoWorkspace';

const emptyRoleDraft: DaoRoleDraft = {
  role: '',
  scope: '',
  approvalLane: 'Finance lane',
  permissions: '',
  riskTier: 'Controlled',
};

export const DaoRolesPage: React.FC = () => {
  const { roles, members, policyLanes, addRole, updateRole, removeRole } = useDaoWorkspace();
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<DaoWorkspaceRole | null>(null);
  const [roleDraft, setRoleDraft] = useState<DaoRoleDraft>(emptyRoleDraft);

  const roleCoverage = useMemo(
    () =>
      roles.map((role) => ({
        ...role,
        memberCount: getRoleMemberCount(role.role, members),
        assignedMembers: members.filter((member) => member.role === role.role).map((member) => member.name),
      })),
    [roles, members],
  );

  const criticalRoles = roleCoverage.filter((role) => role.riskTier === 'Critical').length;
  const observerCount = members.filter((member) => member.status === 'Observer').length;

  const roleColumns: Column<(typeof roleCoverage)[number]>[] = [
    {
      key: 'role',
      label: 'Role',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-display text-lg text-textPrimary">{row.role}</p>
          <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">{row.scope}</p>
        </div>
      ),
    },
    {
      key: 'memberCount',
      label: 'Assigned Members',
      sortable: true,
      render: (row) => (
        <span className="rounded-full bg-surfaceAlt px-3 py-1 text-xs font-mono text-textPrimary">
          {row.memberCount} member{row.memberCount === 1 ? '' : 's'}
        </span>
      ),
    },
    {
      key: 'approvalLane',
      label: 'Approval Lane',
      sortable: true,
      render: (row) => <span className="text-sm text-textPrimary">{row.approvalLane}</span>,
    },
    {
      key: 'permissions',
      label: 'Permissions',
      sortable: true,
      render: (row) => <span className="text-sm leading-6 text-textSecondary">{row.permissions}</span>,
    },
    {
      key: 'riskTier',
      label: 'Risk Tier',
      sortable: true,
      render: (row) => (
        <span
          className={`rounded-full px-3 py-1 text-xs font-mono uppercase tracking-[0.18em] ${
            row.riskTier === 'Critical'
              ? 'bg-error/10 text-error'
              : row.riskTier === 'Controlled'
                ? 'bg-secondary/10 text-secondary'
                : 'bg-surfaceAlt text-textMuted'
          }`}
        >
          {row.riskTier}
        </span>
      ),
    },
  ];

  const openNewRoleModal = () => {
    setEditingRole(null);
    setRoleDraft(emptyRoleDraft);
    setIsRoleModalOpen(true);
  };

  const openEditRoleModal = (role: DaoWorkspaceRole) => {
    setEditingRole(role);
    setRoleDraft({
      role: role.role,
      scope: role.scope,
      approvalLane: role.approvalLane,
      permissions: role.permissions,
      riskTier: role.riskTier,
    });
    setIsRoleModalOpen(true);
  };

  const handleSaveRole = () => {
    if (editingRole) {
      updateRole(editingRole.id, roleDraft);
    } else {
      addRole(roleDraft);
    }
    setIsRoleModalOpen(false);
    setEditingRole(null);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <div className="mb-6">
        <p className="mb-3 text-xs font-mono uppercase tracking-[0.24em] text-textMuted">DAO Treasury</p>
        <h1 className="font-display text-3xl text-textPrimary md:text-5xl">Roles And Permissions</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-textSecondary">
          Define who can initiate, approve, review, pause, or only observe treasury actions across the organization.
        </p>
      </div>

      <DaoSectionNav />

      <DaoPreviewBanner
        eyebrow="Permission Model"
        title="Role architecture that makes treasury authority explicit."
        description="Create and edit roles, tie them to approval lanes, and clarify the exact permissions each operator has before any backend role engine is connected."
      />

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          label="Role Families"
          value={roles.length}
          subtitle="Treasury, finance, delegate, security"
          icon={UserCog}
          color="accent"
        />
        <StatsCard
          label="Critical Roles"
          value={criticalRoles}
          subtitle="Can move funds or freeze execution"
          icon={ShieldAlert}
          color="primary"
        />
        <StatsCard
          label="Observer Seats"
          value={observerCount}
          subtitle="Read-only audit visibility"
          icon={Users}
          color="secondary"
        />
        <StatsCard
          label="Lane Mapping"
          value={`${policyLanes.length}`}
          subtitle="Policy lanes available to roles"
          icon={BadgeCheck}
          color="muted"
        />
      </div>

      <div className="mb-8 grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <Card padding="lg" className="border-border/40">
          <div className="mb-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Role Canvas</p>
              <h2 className="mt-2 font-display text-2xl text-textPrimary">Permission families</h2>
            </div>
            <Button variant="outline" onClick={openNewRoleModal}>
              <Plus className="mr-2 h-4 w-4" />
              Add Role
            </Button>
          </div>
          <div className="space-y-4">
            {roleCoverage.map((role) => (
              <button
                key={role.id}
                onClick={() => openEditRoleModal(role)}
                className="w-full rounded-2xl border border-border/30 bg-surfaceAlt p-4 text-left transition-colors hover:border-borderHover hover:bg-surface"
              >
                <div className="mb-3 flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                  <div>
                    <h3 className="font-display text-xl text-textPrimary">{role.role}</h3>
                    <p className="text-sm text-textSecondary">{role.scope}</p>
                  </div>
                  <span className="rounded-full bg-surface px-3 py-1 text-xs font-mono text-textPrimary">
                    {role.memberCount} mapped
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-mono text-textMuted">
                  <span className="rounded-full bg-surface px-2 py-1">{role.approvalLane}</span>
                  <span className="rounded-full bg-surface px-2 py-1">{role.permissions}</span>
                  <span className="rounded-full bg-surface px-2 py-1">{role.riskTier}</span>
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
              </button>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card padding="lg" className="border-border/40">
            <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Design Rules</p>
                <h2 className="mt-2 font-display text-2xl text-textPrimary">What roles should enforce</h2>
              </div>
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <ShieldCheck className="h-6 w-6" />
              </div>
            </div>
            <div className="space-y-3">
              {[
                'No single role should draft, approve, and broadcast every high-value treasury action by default.',
                'Stablecoin routing and BCH operations should be reviewable through different control lanes.',
                'Emergency powers should be narrow, explicit, and always attributable in the audit trail.',
                'Observers should preserve visibility without silently inheriting execution rights.',
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
                <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Escalation Path</p>
                <h2 className="mt-2 font-display text-2xl text-textPrimary">When coverage changes</h2>
              </div>
              <div className="rounded-2xl bg-secondary/10 p-3 text-secondary">
                <Users className="h-6 w-6" />
              </div>
            </div>
            <div className="space-y-3">
              {[
                'If a signer misses SLA, backup coverage should step in without widening permissions.',
                'If a role loses quorum, treasury actions should slow down rather than fall through policy checks.',
                'Security Council overrides should always stand out as exceptional, not normal, treasury behavior.',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-border/30 bg-surfaceAlt p-4 text-sm leading-6 text-textSecondary">
                  {item}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="mb-8">
        <div className="mb-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Permission Matrix</p>
            <h2 className="mt-2 font-display text-2xl text-textPrimary">Role by role treasury authority</h2>
          </div>
          <Link to="/app/dao/team" className="inline-flex items-center gap-2 text-sm font-mono text-accent hover:text-primary">
            Compare against team assignments
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <DataTable
          columns={roleColumns}
          data={roleCoverage}
          onRowClick={openEditRoleModal}
          enableImport={false}
          emptyMessage="No roles configured yet."
        />
      </div>

      <DaoWorkspaceModal
        isOpen={isRoleModalOpen}
        onClose={() => {
          setEditingRole(null);
          setIsRoleModalOpen(false);
        }}
        onSubmit={handleSaveRole}
        submitLabel={editingRole ? 'Update role' : 'Create role'}
        submitDisabled={!roleDraft.role.trim()}
        onDelete={editingRole ? () => {
          removeRole(editingRole.id);
          setEditingRole(null);
          setIsRoleModalOpen(false);
        } : undefined}
        deleteLabel="Delete role"
        title={editingRole ? 'Update treasury role' : 'Create treasury role'}
        description="This role editor is frontend-only for now, but the shape is intended to map directly to an eventual organization permissions backend."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Role name"
            value={roleDraft.role}
            onChange={(event) => setRoleDraft((current) => ({ ...current, role: event.target.value }))}
          />
          <Select
            label="Risk tier"
            value={roleDraft.riskTier}
            onChange={(event) =>
              setRoleDraft((current) => ({
                ...current,
                riskTier: event.target.value as DaoRoleDraft['riskTier'],
              }))
            }
            options={[
              { value: 'Critical', label: 'Critical' },
              { value: 'Controlled', label: 'Controlled' },
              { value: 'Observed', label: 'Observed' },
            ]}
          />
          <Select
            label="Approval lane"
            value={roleDraft.approvalLane}
            onChange={(event) => setRoleDraft((current) => ({ ...current, approvalLane: event.target.value }))}
            options={policyLanes.map((lane) => ({ value: lane.lane, label: lane.lane }))}
          />
          <Input
            label="Permissions summary"
            value={roleDraft.permissions}
            onChange={(event) => setRoleDraft((current) => ({ ...current, permissions: event.target.value }))}
            placeholder="Approve, broadcast, export"
          />
          <div className="md:col-span-2">
            <Textarea
              label="Role scope"
              rows={3}
              value={roleDraft.scope}
              onChange={(event) => setRoleDraft((current) => ({ ...current, scope: event.target.value }))}
              placeholder="Describe what this role governs in the treasury workflow."
            />
          </div>
        </div>
      </DaoWorkspaceModal>
    </div>
  );
};
