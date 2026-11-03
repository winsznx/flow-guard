import { useState } from 'react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Stack } from '../../components/layout/Stack';
import { OrganizationHeader } from '../../components/dao/DaoSectionNav';
import { SampleEditDialog } from '../../components/dao/DaoWorkspaceModal';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { KeyRound, Plus } from '../../components/ui/Icon';
import { Input } from '../../components/ui/Input';
import { List, type Column } from '../../components/ui/List';
import { Panel } from '../../components/ui/Panel';
import { Select } from '../../components/ui/Select';
import { StatRow } from '../../components/ui/StatRow';
import { StatTile } from '../../components/ui/StatTile';
import { useToast } from '../../components/ui/Toast';
import {
  ACCESS_WORD,
  ACTIVITY,
  DIALOG,
  ROLES,
  SAMPLE,
  memberCount,
  type RoleAccess,
} from '../../copy/organization';
import type { DaoRoleRow } from '../../data/daoBeta';
import {
  roleHolderCount,
  ruleName,
  useDaoWorkspace,
  type RoleDraft,
} from '../../stores/useDaoWorkspace';

const NO_RULE = '';

const EMPTY_DRAFT: RoleDraft = {
  name: '',
  access: 'review',
  ruleId: null,
  canDo: '',
  looksAfter: '',
};

const ACCESS_OPTIONS = (Object.keys(ACCESS_WORD) as RoleAccess[]).map((value) => ({
  value,
  label: ACCESS_WORD[value],
}));

type Editing = { id?: string; draft: RoleDraft };

function RoleDialog({
  editing,
  onClose,
  onRemove,
}: {
  editing: Editing;
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  const { rules, saveRole } = useDaoWorkspace();
  const { toast } = useToast();
  const [draft, setDraft] = useState<RoleDraft>(editing.draft);
  const [submitted, setSubmitted] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);

  const editId = editing.id;
  const name = draft.name.trim();
  const nameError = (submitted || nameTouched) && !name ? DIALOG.nameMissing : undefined;
  const ruleOptions = [
    { value: NO_RULE, label: DIALOG.none },
    ...rules.map((rule) => ({ value: rule.id, label: rule.name })),
  ];

  const update = <K extends keyof RoleDraft>(key: K, value: RoleDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = () => {
    setSubmitted(true);
    if (!name) return;
    saveRole({ ...draft, name }, editId);
    toast({ tone: 'success', title: editId ? ACTIVITY.roleUpdated : ACTIVITY.roleAdded });
    onClose();
  };

  return (
    <SampleEditDialog
      open
      title={editId ? ROLES.dialog.editTitle : ROLES.dialog.addTitle}
      line={ROLES.dialog.line}
      saveLabel={editId ? DIALOG.save : ROLES.dialog.create}
      onSave={save}
      onClose={onClose}
      remove={editId ? { label: ROLES.remove.action, onSelect: () => onRemove(editId) } : undefined}
    >
      <Input
        label={ROLES.fields.name}
        value={draft.name}
        placeholder={ROLES.fields.namePlaceholder}
        onChange={(event) => update('name', event.target.value)}
        onBlur={() => setNameTouched(true)}
        error={nameError}
      />
      <Select
        label={ROLES.fields.access}
        options={ACCESS_OPTIONS}
        value={draft.access}
        onValueChange={(value) => update('access', value)}
      />
      <Select
        label={ROLES.fields.rule}
        options={ruleOptions}
        value={draft.ruleId ?? NO_RULE}
        onValueChange={(value) => update('ruleId', value === NO_RULE ? null : value)}
      />
      <Input
        label={ROLES.fields.canDo}
        optional
        value={draft.canDo}
        placeholder={ROLES.fields.canDoPlaceholder}
        onChange={(event) => update('canDo', event.target.value)}
      />
      <Input
        label={ROLES.fields.looksAfter}
        optional
        value={draft.looksAfter}
        placeholder={ROLES.fields.looksAfterPlaceholder}
        onChange={(event) => update('looksAfter', event.target.value)}
      />
    </SampleEditDialog>
  );
}

export function DaoRolesPage() {
  const { roles, rules, members, removeRole } = useDaoWorkspace();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<DaoRoleRow | null>(null);

  const count = (access: RoleAccess) => roles.filter((role) => role.access === access).length;
  const openAdd = () => setEditing({ draft: EMPTY_DRAFT });

  const columns: Column<DaoRoleRow>[] = [
    {
      key: 'role',
      header: ROLES.columns.role,
      primary: true,
      mobile: 'top',
      cell: (row) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-title-item text-ink">{row.name}</span>
          <span className="text-small text-ink-muted">{row.looksAfter || DIALOG.none}</span>
        </div>
      ),
    },
    {
      key: 'access',
      header: ROLES.columns.access,
      mobile: 'bottom-start',
      cell: (row) => ACCESS_WORD[row.access],
    },
    {
      key: 'canDo',
      header: ROLES.columns.canDo,
      mobile: 'hidden',
      cell: (row) => row.canDo || DIALOG.none,
    },
    {
      key: 'rule',
      header: ROLES.columns.rule,
      mobile: 'hidden',
      cell: (row) => ruleName(rules, row.ruleId) ?? DIALOG.none,
    },
    {
      key: 'members',
      header: ROLES.columns.members,
      align: 'end',
      mobile: 'bottom-end',
      cell: (row) => memberCount(roleHolderCount(row.id, members)),
    },
  ];

  const startRemove = (id: string) => {
    setEditing(null);
    setRemoving(roles.find((role) => role.id === id) ?? null);
  };

  const confirmRemove = async () => {
    if (!removing) return;
    removeRole(removing.id);
    setRemoving(null);
    toast({ tone: 'success', title: ROLES.remove.done });
  };

  return (
    <PageContainer>
      <OrganizationHeader
        page="roles"
        sample
        stateLine={SAMPLE.savedHere}
        primaryAction={
          <Button variant="primary" leadingIcon={Plus} onClick={openAdd}>
            {ROLES.add}
          </Button>
        }
      />
      <Stack>
        {roles.length > 0 ? (
          <StatRow>
            <StatTile label={ROLES.stats.roles} value={roles.length} sub={SAMPLE.tag} />
            <StatTile label={ROLES.stats.send} value={count('send')} />
            <StatTile label={ROLES.stats.review} value={count('review')} />
            <StatTile label={ROLES.stats.view} value={count('view')} />
          </StatRow>
        ) : null}

        <List
          label={ROLES.listLabel}
          columns={columns}
          rows={roles}
          rowKey={(row) => row.id}
          onRowOpen={(row) => setEditing({ id: row.id, draft: { ...row } })}
          state={roles.length > 0 ? 'ready' : 'empty'}
          empty={
            <EmptyState
              icon={KeyRound}
              title={ROLES.empty.title}
              description={ROLES.empty.description}
              action={
                <Button variant="primary" leadingIcon={Plus} onClick={openAdd}>
                  {ROLES.add}
                </Button>
              }
            />
          }
          noResults={null}
          error={null}
        />

        <Panel title={ROLES.help.title}>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-ink-secondary">
            {ROLES.help.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Panel>
      </Stack>

      {editing ? (
        <RoleDialog
          key={editing.id ?? 'new'}
          editing={editing}
          onClose={() => setEditing(null)}
          onRemove={startRemove}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={removing ? ROLES.remove.title(removing.name) : ''}
        body={removing ? ROLES.remove.body(roleHolderCount(removing.id, members)) : ''}
        confirmLabel={ROLES.remove.action}
        keepLabel={ROLES.remove.keep}
        tone="danger"
        busyLabel={ROLES.remove.busy}
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />
    </PageContainer>
  );
}
