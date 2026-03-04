import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  daoAlerts,
  daoAssets,
  daoGuardrails,
  daoMembers,
  daoPolicyLanes,
  daoProposals,
  daoRoles,
  daoTimeline,
  daoVaults,
  type DaoAlert,
  type DaoAssetRow,
  type DaoGuardrailRow,
  type DaoMemberRow,
  type DaoPolicyLaneRow,
  type DaoProposalRow,
  type DaoRoleRow,
  type DaoTimelineItem,
  type DaoVaultRow,
} from '../data/daoBeta';

type ProposalStage = DaoProposalRow['stage'];
type PolicyStatus = DaoVaultRow['policyStatus'];
type MemberStatus = DaoMemberRow['status'];
type RoleRiskTier = DaoRoleRow['riskTier'];

export interface DaoWorkspaceAsset extends DaoAssetRow {
  id: string;
}

export interface DaoWorkspaceVault extends DaoVaultRow {
  id: string;
  monthlyOutflowNumber: number;
  runwayMonths: number;
}

export interface DaoWorkspaceProposal extends DaoProposalRow {
  id: string;
}

export interface DaoWorkspaceMember extends DaoMemberRow {
  id: string;
}

export interface DaoWorkspaceRole extends Omit<DaoRoleRow, 'members'> {
  id: string;
}

export interface DaoWorkspacePolicyLane extends DaoPolicyLaneRow {
  id: string;
}

export interface DaoWorkspaceGuardrail extends DaoGuardrailRow {
  id: string;
}

export interface DaoWorkspaceAlert extends DaoAlert {
  id: string;
}

export interface DaoWorkspaceTimeline extends DaoTimelineItem {
  id: string;
}

export interface DaoWorkspaceRecipientRule {
  id: string;
  name: string;
  address: string;
  category: 'Payroll' | 'Vendor' | 'Grant' | 'Delegate' | 'Emergency';
  assetScope: string;
  lane: string;
  status: 'Approved' | 'Watch' | 'Blocked';
}

export interface DaoWorkspaceCashflowPoint {
  id: string;
  label: string;
  inflow: number;
  outflow: number;
}

export interface DaoSummaryView {
  treasuryValue: string;
  treasuryValueNumber: number;
  activeVaults: number;
  coveredAssets: number;
  runway: string;
  runwayMonths: number;
  monthlyOutflow: string;
  monthlyOutflowNumber: number;
  proposalsInFlight: number;
  policyCoverage: string;
  teamMembers: number;
  signerCoverage: string;
  whitelistedRecipients: number;
  emergencyDelay: string;
}

export interface DaoProposalDraft {
  title: string;
  lane: string;
  amountNumber: number;
  asset: string;
  stage: ProposalStage;
  eta: string;
}

export interface DaoMemberDraft {
  name: string;
  role: string;
  wallets: string;
  vaultCoverage: string;
  signingWindow: string;
  responseSla: string;
  status: MemberStatus;
}

export interface DaoRoleDraft {
  role: string;
  scope: string;
  approvalLane: string;
  permissions: string;
  riskTier: RoleRiskTier;
}

export interface DaoPolicyLaneDraft {
  lane: string;
  txCap: string;
  dailyCap: string;
  approvers: string;
  executionWindow: string;
  assets: string;
}

export interface DaoGuardrailDraft {
  assetClass: string;
  defaultLane: string;
  dailyNetCap: string;
  routingRule: string;
  notes: string;
}

export interface DaoRecipientRuleDraft {
  name: string;
  address: string;
  category: DaoWorkspaceRecipientRule['category'];
  assetScope: string;
  lane: string;
  status: DaoWorkspaceRecipientRule['status'];
}

interface DaoWorkspaceState {
  assets: DaoWorkspaceAsset[];
  vaults: DaoWorkspaceVault[];
  proposals: DaoWorkspaceProposal[];
  members: DaoWorkspaceMember[];
  roles: DaoWorkspaceRole[];
  policyLanes: DaoWorkspacePolicyLane[];
  guardrails: DaoWorkspaceGuardrail[];
  recipientRules: DaoWorkspaceRecipientRule[];
  alerts: DaoWorkspaceAlert[];
  timeline: DaoWorkspaceTimeline[];
  cashflow: DaoWorkspaceCashflowPoint[];
  addProposal: (draft: DaoProposalDraft) => void;
  updateProposal: (id: string, draft: DaoProposalDraft) => void;
  addMember: (draft: DaoMemberDraft) => void;
  updateMember: (id: string, draft: DaoMemberDraft) => void;
  removeMember: (id: string) => void;
  addRole: (draft: DaoRoleDraft) => void;
  updateRole: (id: string, draft: DaoRoleDraft) => void;
  removeRole: (id: string) => void;
  addPolicyLane: (draft: DaoPolicyLaneDraft) => void;
  updatePolicyLane: (id: string, draft: DaoPolicyLaneDraft) => void;
  addRecipientRule: (draft: DaoRecipientRuleDraft) => void;
  updateRecipientRule: (id: string, draft: DaoRecipientRuleDraft) => void;
  removeRecipientRule: (id: string) => void;
  updateGuardrail: (id: string, draft: DaoGuardrailDraft) => void;
  updateVaultStatus: (id: string, status: PolicyStatus) => void;
  resetWorkspace: () => void;
}

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

const parseCurrency = (value: string) => Number(value.replace(/[^0-9.]/g, '')) || 0;

export const formatUsd = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);

const initialRecipientRules: DaoWorkspaceRecipientRule[] = [
  {
    id: createId(),
    name: 'Payroll Batch',
    address: 'bitcoincash:qz35...payroll',
    category: 'Payroll',
    assetScope: 'USDh',
    lane: 'Finance lane',
    status: 'Approved',
  },
  {
    id: createId(),
    name: 'Open Source Grants',
    address: 'bitcoincash:qz2u...grants',
    category: 'Grant',
    assetScope: 'BCH',
    lane: 'Timelocked lane',
    status: 'Approved',
  },
  {
    id: createId(),
    name: 'Security Incident Escrow',
    address: 'bitcoincash:qq4a...secres',
    category: 'Emergency',
    assetScope: 'BCH, USDh',
    lane: 'Emergency lane',
    status: 'Watch',
  },
];

const initialCashflow: DaoWorkspaceCashflowPoint[] = [
  { id: createId(), label: 'Jan', inflow: 42000, outflow: 9800 },
  { id: createId(), label: 'Feb', inflow: 39000, outflow: 11200 },
  { id: createId(), label: 'Mar', inflow: 46500, outflow: 12800 },
  { id: createId(), label: 'Apr', inflow: 47800, outflow: 12100 },
  { id: createId(), label: 'May', inflow: 43100, outflow: 13400 },
  { id: createId(), label: 'Jun', inflow: 45200, outflow: 12600 },
];

const createInitialState = () => ({
  assets: daoAssets.map((asset) => ({ ...asset, id: createId() })),
  vaults: daoVaults.map((vault) => ({
    ...vault,
    id: createId(),
    monthlyOutflowNumber: parseCurrency(vault.monthlyOutflow),
    runwayMonths: parseCurrency(vault.runway),
  })),
  proposals: daoProposals.map((proposal) => ({ ...proposal, id: createId() })),
  members: daoMembers.map((member) => ({ ...member, id: createId() })),
  roles: daoRoles.map(({ members: _members, ...role }) => ({ ...role, id: createId() })),
  policyLanes: daoPolicyLanes.map((lane) => ({ ...lane, id: createId() })),
  guardrails: daoGuardrails.map((guardrail) => ({ ...guardrail, id: createId() })),
  alerts: daoAlerts.map((alert) => ({ ...alert, id: createId() })),
  timeline: daoTimeline.map((item) => ({ ...item, id: createId() })),
  recipientRules: initialRecipientRules,
  cashflow: initialCashflow,
});

const appendTimeline = (
  timeline: DaoWorkspaceTimeline[],
  item: Pick<DaoWorkspaceTimeline, 'title' | 'detail'>,
) => [
  { id: createId(), ...item, time: 'Just now' },
  ...timeline,
].slice(0, 8);

const amountToLabel = (amountNumber: number) => formatUsd(amountNumber);

export const deriveDaoSummary = (state: Pick<
  DaoWorkspaceState,
  'assets' | 'vaults' | 'proposals' | 'members' | 'policyLanes' | 'recipientRules'
>): DaoSummaryView => {
  const treasuryValueNumber = state.assets.reduce((sum, asset) => sum + asset.valueUsdNumber, 0);
  const monthlyOutflowNumber = state.vaults.reduce((sum, vault) => sum + vault.monthlyOutflowNumber, 0);
  const runwayMonths =
    monthlyOutflowNumber > 0 ? Number((treasuryValueNumber / monthlyOutflowNumber).toFixed(1)) : 0;
  const whitelistedRecipients = state.recipientRules.filter((rule) => rule.status === 'Approved').length;
  const emergencyDelay =
    state.policyLanes.find((lane) => lane.lane.toLowerCase().includes('emergency'))?.executionWindow ?? '12-hour delay';
  const policyCoverageScore = Math.min(
    99,
    82 + Math.round((state.policyLanes.length + whitelistedRecipients + state.recipientRules.length) / 3),
  );

  return {
    treasuryValue: formatUsd(treasuryValueNumber),
    treasuryValueNumber,
    activeVaults: state.vaults.length,
    coveredAssets: state.assets.length,
    runway: `${runwayMonths.toFixed(1)} mo`,
    runwayMonths,
    monthlyOutflow: formatUsd(monthlyOutflowNumber),
    monthlyOutflowNumber,
    proposalsInFlight: state.proposals.length,
    policyCoverage: `${policyCoverageScore}%`,
    teamMembers: state.members.length,
    signerCoverage: '24h follow-the-sun',
    whitelistedRecipients,
    emergencyDelay,
  };
};

export const getRoleMemberCount = (roleName: string, members: DaoWorkspaceMember[]) =>
  members.filter((member) => member.role === roleName).length;

export const getProposalStageCounts = (proposals: DaoWorkspaceProposal[]) => {
  const stages: ProposalStage[] = ['Draft', 'Review', 'Queued', 'Ready'];
  return stages.map((stage) => ({
    stage,
    count: proposals.filter((proposal) => proposal.stage === stage).length,
  }));
};

export const useDaoWorkspace = create<DaoWorkspaceState>()(
  persist(
    (set) => ({
      ...createInitialState(),
      addProposal: (draft) =>
        set((state) => ({
          proposals: [{ id: createId(), ...draft, amount: amountToLabel(draft.amountNumber) }, ...state.proposals],
          timeline: appendTimeline(state.timeline, {
            title: 'Proposal drafted',
            detail: `${draft.title} entered ${draft.stage.toLowerCase()} in ${draft.lane}.`,
          }),
        })),
      updateProposal: (id, draft) =>
        set((state) => ({
          proposals: state.proposals.map((proposal) =>
            proposal.id === id ? { ...proposal, ...draft, amount: amountToLabel(draft.amountNumber) } : proposal,
          ),
          timeline: appendTimeline(state.timeline, {
            title: 'Proposal updated',
            detail: `${draft.title} was updated in the treasury queue.`,
          }),
        })),
      addMember: (draft) =>
        set((state) => ({
          members: [{ id: createId(), ...draft }, ...state.members],
          timeline: appendTimeline(state.timeline, {
            title: 'Team member added',
            detail: `${draft.name} joined as ${draft.role}.`,
          }),
        })),
      updateMember: (id, draft) =>
        set((state) => ({
          members: state.members.map((member) => (member.id === id ? { ...member, ...draft } : member)),
          timeline: appendTimeline(state.timeline, {
            title: 'Team member updated',
            detail: `${draft.name}'s treasury coverage was updated.`,
          }),
        })),
      removeMember: (id) =>
        set((state) => {
          const removed = state.members.find((member) => member.id === id);
          return {
            members: state.members.filter((member) => member.id !== id),
            timeline: removed
              ? appendTimeline(state.timeline, {
                  title: 'Team member removed',
                  detail: `${removed.name} was removed from the DAO workspace.`,
                })
              : state.timeline,
          };
        }),
      addRole: (draft) =>
        set((state) => ({
          roles: [{ id: createId(), ...draft }, ...state.roles],
          timeline: appendTimeline(state.timeline, {
            title: 'Role created',
            detail: `${draft.role} now governs the ${draft.approvalLane} path.`,
          }),
        })),
      updateRole: (id, draft) =>
        set((state) => ({
          roles: state.roles.map((role) => (role.id === id ? { ...role, ...draft } : role)),
          timeline: appendTimeline(state.timeline, {
            title: 'Role updated',
            detail: `${draft.role} permissions were updated.`,
          }),
        })),
      removeRole: (id) =>
        set((state) => {
          const removed = state.roles.find((role) => role.id === id);
          return {
            roles: state.roles.filter((role) => role.id !== id),
            timeline: removed
              ? appendTimeline(state.timeline, {
                  title: 'Role removed',
                  detail: `${removed.role} was retired from the workspace model.`,
                })
              : state.timeline,
          };
        }),
      addPolicyLane: (draft) =>
        set((state) => ({
          policyLanes: [{ id: createId(), ...draft }, ...state.policyLanes],
          timeline: appendTimeline(state.timeline, {
            title: 'Policy lane created',
            detail: `${draft.lane} was added with ${draft.executionWindow.toLowerCase()}.`,
          }),
        })),
      updatePolicyLane: (id, draft) =>
        set((state) => ({
          policyLanes: state.policyLanes.map((lane) => (lane.id === id ? { ...lane, ...draft } : lane)),
          timeline: appendTimeline(state.timeline, {
            title: 'Policy lane updated',
            detail: `${draft.lane} thresholds were updated.`,
          }),
        })),
      addRecipientRule: (draft) =>
        set((state) => ({
          recipientRules: [{ id: createId(), ...draft }, ...state.recipientRules],
          timeline: appendTimeline(state.timeline, {
            title: 'Recipient rule added',
            detail: `${draft.name} was added to ${draft.lane}.`,
          }),
        })),
      updateRecipientRule: (id, draft) =>
        set((state) => ({
          recipientRules: state.recipientRules.map((rule) => (rule.id === id ? { ...rule, ...draft } : rule)),
          timeline: appendTimeline(state.timeline, {
            title: 'Recipient rule updated',
            detail: `${draft.name} policy routing was updated.`,
          }),
        })),
      removeRecipientRule: (id) =>
        set((state) => {
          const removed = state.recipientRules.find((rule) => rule.id === id);
          return {
            recipientRules: state.recipientRules.filter((rule) => rule.id !== id),
            timeline: removed
              ? appendTimeline(state.timeline, {
                  title: 'Recipient rule removed',
                  detail: `${removed.name} was removed from treasury routing.`,
                })
              : state.timeline,
          };
        }),
      updateGuardrail: (id, draft) =>
        set((state) => ({
          guardrails: state.guardrails.map((guardrail) =>
            guardrail.id === id ? { ...guardrail, ...draft } : guardrail,
          ),
          timeline: appendTimeline(state.timeline, {
            title: 'Guardrail updated',
            detail: `${draft.assetClass} policy guidance was updated.`,
          }),
        })),
      updateVaultStatus: (id, status) =>
        set((state) => ({
          vaults: state.vaults.map((vault) => (vault.id === id ? { ...vault, policyStatus: status } : vault)),
          timeline: appendTimeline(state.timeline, {
            title: 'Vault status changed',
            detail: `Treasury health state moved to ${status.toLowerCase()}.`,
          }),
        })),
      resetWorkspace: () =>
        set(() => ({
          ...createInitialState(),
        })),
    }),
    {
      name: 'flowguard-dao-workspace',
    },
  ),
);
