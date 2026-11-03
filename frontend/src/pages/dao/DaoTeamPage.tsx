import { useState } from 'react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Stack } from '../../components/layout/Stack';
import { OrganizationHeader } from '../../components/dao/DaoSectionNav';
import { SampleEditDialog } from '../../components/dao/DaoWorkspaceModal';
import { Address } from '../../components/ui/Address';
import { AddressInput } from '../../components/ui/AddressInput';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Plus, Users } from '../../components/ui/Icon';
import { Input } from '../../components/ui/Input';
import { List, type Column } from '../../components/ui/List';
import { Panel } from '../../components/ui/Panel';
import { Select } from '../../components/ui/Select';
import { StatRow } from '../../components/ui/StatRow';
import { StatTile } from '../../components/ui/StatTile';
import { useToast } from '../../components/ui/Toast';
import { BUILD_NETWORK } from '../../copy/network';
import { isValidAddress } from '../../utils/address';
import {
  ACTIVITY,
  DIALOG,
  SAMPLE,
  SIGNS_AS_WORD,
  TEAM,
  type MemberSignsAs,
} from '../../copy/organization';
import type { DaoMemberRow } from '../../data/daoBeta';
import { roleName, useDaoWorkspace, type MemberDraft } from '../../stores/useDaoWorkspace';

const NO_ROLE = '';

const EMPTY_DRAFT: MemberDraft = {
  name: '',
  roleId: null,
  address: '',
  vaults: '',
  available: '',
  repliesWithin: '',
  signsAs: 'main',
};

const SIGNS_AS_OPTIONS = (Object.keys(SIGNS_AS_WORD) as MemberSignsAs[]).map((value) => ({
  value,
  label: SIGNS_AS_WORD[value],
}));

type Editing = { id?: string; draft: MemberDraft };

function MemberDialog({
  editing,
  onClose,
  onRemove,
}: {
  editing: Editing | null;
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  const { roles, saveMember } = useDaoWorkspace();
  const { toast } = useToast();
  const [draft, setDraft] = useState<MemberDraft>(editing?.draft ?? EMPTY_DRAFT);
  const [submitted, setSubmitted] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);

  const editId = editing?.id;
  const isEdit = Boolean(editId);
  const name = draft.name.trim();
  const nameError = (submitted || nameTouched) && !name ? DIALOG.nameMissing : undefined;
  const addressOk =
    !draft.address.trim() ||
    draft.address === editing?.draft.address ||
    isValidAddress(draft.address, BUILD_NETWORK);
  const roleOptions = [
    { value: NO_ROLE, label: DIALOG.noRole },
    ...roles.map((role) => ({ value: role.id, label: role.name })),
  ];

  const update = <K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = () => {
    setSubmitted(true);
    if (!name || !addressOk) return;
    saveMember({ ...draft, name, address: draft.address.trim() }, editId);
    toast({ tone: 'success', title: isEdit ? ACTIVITY.memberUpdated : ACTIVITY.memberAdded });
    onClose();
  };

  return (
    <SampleEditDialog
      open={editing !== null}
      title={isEdit ? TEAM.dialog.editTitle : TEAM.dialog.addTitle}
      line={TEAM.dialog.line}
      saveLabel={isEdit ? DIALOG.save : TEAM.dialog.create}
      onSave={save}
      onClose={onClose}
      remove={editId ? { label: TEAM.remove.action, onSelect: () => onRemove(editId) } : undefined}
    >
      <Input
        label={TEAM.fields.name}
        value={draft.name}
        placeholder={TEAM.fields.namePlaceholder}
        onChange={(event) => update('name', event.target.value)}
        onBlur={() => setNameTouched(true)}
        error={nameError}
      />
      <Select
        label={TEAM.fields.role}
        options={roleOptions}
        value={draft.roleId ?? NO_ROLE}
        onValueChange={(value) => update('roleId', value === NO_ROLE ? null : value)}
      />
      <Select
        label={TEAM.fields.signsAs}
        options={SIGNS_AS_OPTIONS}
        value={draft.signsAs}
        onValueChange={(value) => update('signsAs', value)}
      />
      <AddressInput
        label={TEAM.fields.address}
        helper={TEAM.fields.addressHelper}
        network={BUILD_NETWORK}
        value={draft.address}
        onChange={(value) => update('address', value)}
      />
      <Input
        label={TEAM.fields.vaults}
        optional
        value={draft.vaults}
        placeholder={TEAM.fields.vaultsPlaceholder}
        onChange={(event) => update('vaults', event.target.value)}
      />
      <Input
        label={TEAM.fields.available}
        optional
        value={draft.available}
        placeholder={TEAM.fields.availablePlaceholder}
        onChange={(event) => update('available', event.target.value)}
      />
      <Input
        label={TEAM.fields.replies}
        optional
        value={draft.repliesWithin}
        placeholder={TEAM.fields.repliesPlaceholder}
        onChange={(event) => update('repliesWithin', event.target.value)}
      />
    </SampleEditDialog>
  );
}

export function DaoTeamPage() {
  const { members, roles, removeMember } = useDaoWorkspace();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<DaoMemberRow | null>(null);

  const count = (signsAs: MemberSignsAs) =>
    members.filter((member) => member.signsAs === signsAs).length;
  const openAdd = () => setEditing({ draft: EMPTY_DRAFT });

  const columns: Column<DaoMemberRow>[] = [
    {
      key: 'member',
      header: TEAM.columns.member,
      primary: true,
      mobile: 'top',
      cell: (row) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-title-item text-ink">{row.name}</span>
          <span className="text-small text-ink-muted">
            {roleName(roles, row.roleId) ?? DIALOG.noRole}
          </span>
        </div>
      ),
    },
    {
      key: 'signsAs',
      header: TEAM.columns.signsAs,
      mobile: 'bottom-start',
      cell: (row) => SIGNS_AS_WORD[row.signsAs],
    },
    {
      key: 'vaults',
      header: TEAM.columns.vaults,
      mobile: 'hidden',
      cell: (row) => row.vaults || DIALOG.none,
    },
    {
      key: 'available',
      header: TEAM.columns.available,
      mobile: 'hidden',
      cell: (row) => row.available || DIALOG.none,
    },
    {
      key: 'replies',
      header: TEAM.columns.replies,
      mobile: 'hidden',
      cell: (row) => row.repliesWithin || DIALOG.none,
    },
    {
      key: 'address',
      header: TEAM.columns.address,
      mobile: 'hidden',
      cell: (row) => (row.address ? <Address value={row.address} copy={false} /> : TEAM.noAddress),
    },
  ];

  const confirmRemove = async () => {
    if (!removing) return;
    removeMember(removing.id);
    setRemoving(null);
    toast({ tone: 'success', title: TEAM.remove.done });
  };

  const startRemove = (id: string) => {
    const member = members.find((row) => row.id === id) ?? null;
    setEditing(null);
    setRemoving(member);
  };

  return (
    <PageContainer>
      <OrganizationHeader
        page="team"
        sample
        stateLine={SAMPLE.savedHere}
        primaryAction={
          <Button variant="primary" leadingIcon={Plus} onClick={openAdd}>
            {TEAM.add}
          </Button>
        }
      />
      <Stack>
        {members.length > 0 ? (
          <StatRow>
            <StatTile label={TEAM.stats.members} value={members.length} sub={SAMPLE.tag} />
            <StatTile label={TEAM.stats.main} value={count('main')} />
            <StatTile label={TEAM.stats.backup} value={count('backup')} />
            <StatTile label={TEAM.stats.viewOnly} value={count('viewOnly')} />
          </StatRow>
        ) : null}

        <List
          label={TEAM.listLabel}
          columns={columns}
          rows={members}
          rowKey={(row) => row.id}
          onRowOpen={(row) => setEditing({ id: row.id, draft: { ...row } })}
          state={members.length > 0 ? 'ready' : 'empty'}
          empty={
            <EmptyState
              icon={Users}
              title={TEAM.empty.title}
              description={TEAM.empty.description}
              action={
                <Button variant="primary" leadingIcon={Plus} onClick={openAdd}>
                  {TEAM.add}
                </Button>
              }
            />
          }
          noResults={null}
          error={null}
        />

        <Panel title={TEAM.help.title}>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-ink-secondary">
            {TEAM.help.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Panel>
      </Stack>

      {editing ? (
        <MemberDialog
          key={editing.id ?? 'new'}
          editing={editing}
          onClose={() => setEditing(null)}
          onRemove={startRemove}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={removing ? TEAM.remove.title(removing.name) : ''}
        body={removing ? TEAM.remove.body(removing.name) : ''}
        confirmLabel={TEAM.remove.action}
        keepLabel={TEAM.remove.keep}
        tone="danger"
        busyLabel={TEAM.remove.busy}
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />
    </PageContainer>
  );
}
