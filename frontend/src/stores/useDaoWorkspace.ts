import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ActivityEvent } from '../copy/organization';
import {
  daoAssetRules,
  daoAssets,
  daoCashflowSeed,
  daoMembers,
  daoProposals,
  daoRecipients,
  daoRoles,
  daoSpendingRules,
  daoTimelineSeed,
  daoVaults,
  type DaoAssetRow,
  type DaoAssetRuleRow,
  type DaoMemberRow,
  type DaoProposalRow,
  type DaoRecipientRow,
  type DaoRoleRow,
  type DaoSpendingRuleRow,
  type DaoVaultRow,
} from '../data/daoBeta';

/**
 * Sample data for the Organization workspace (beta). Edits stay in this browser and are never
 * sent anywhere. Bump SAMPLE_VERSION whenever the sample in `daoBeta.ts` changes, so everyone
 * who saved an older copy gets the corrected one.
 */
const SAMPLE_VERSION = 3;
const STORAGE_KEY = 'flowguard-dao-workspace';
const ACTIVITY_LIMIT = 20;
const HOUR_MS = 60 * 60 * 1000;

export interface OrganizationActivity {
  id: string;
  event: ActivityEvent;
  at: number;
}

export interface OrganizationMonth {
  id: string;
  /** First day of the month, as a timestamp. */
  month: number;
  inflowUsd: number;
  outflowUsd: number;
}

export type MemberDraft = Omit<DaoMemberRow, 'id'>;
export type RoleDraft = Omit<DaoRoleRow, 'id'>;
export type SpendingRuleDraft = Omit<DaoSpendingRuleRow, 'id'>;
export type AssetRuleDraft = Omit<DaoAssetRuleRow, 'id' | 'asset'>;
export type RecipientDraft = Omit<DaoRecipientRow, 'id'>;

interface OrganizationSample {
  assets: DaoAssetRow[];
  vaults: DaoVaultRow[];
  requests: DaoProposalRow[];
  members: DaoMemberRow[];
  roles: DaoRoleRow[];
  rules: DaoSpendingRuleRow[];
  assetRules: DaoAssetRuleRow[];
  recipients: DaoRecipientRow[];
  activity: OrganizationActivity[];
}

interface OrganizationActions {
  saveMember: (draft: MemberDraft, id?: string) => void;
  removeMember: (id: string) => void;
  saveRole: (draft: RoleDraft, id?: string) => void;
  removeRole: (id: string) => void;
  saveRule: (draft: SpendingRuleDraft, id?: string) => void;
  removeRule: (id: string) => void;
  saveAssetRule: (id: string, draft: AssetRuleDraft) => void;
  saveRecipient: (draft: RecipientDraft, id?: string) => void;
  removeRecipient: (id: string) => void;
  resetSample: () => void;
}

export type OrganizationState = OrganizationSample & OrganizationActions;

export interface OrganizationSummary {
  totalValueUsd: number;
  moneyOutPerMonthUsd: number;
  /** Whole months the total lasts at the current monthly outflow, or null when nothing goes out. */
  monthsLeft: number | null;
  openRequests: number;
  waitingRequests: number;
}

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

function monthStart(monthsAgo: number, now: Date): number {
  return new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1).getTime();
}

/** The last six months of sample money in and out, dated against `now` so the window keeps moving. */
export function sampleCashflow(now: Date = new Date()): OrganizationMonth[] {
  return daoCashflowSeed.map((seed) => ({
    id: `month-${seed.monthsAgo}`,
    month: monthStart(seed.monthsAgo, now),
    inflowUsd: seed.inflowUsd,
    outflowUsd: seed.outflowUsd,
  }));
}

function createSample(): OrganizationSample {
  const now = Date.now();
  return {
    assets: daoAssets.map((row) => ({ ...row })),
    vaults: daoVaults.map((row) => ({ ...row })),
    requests: daoProposals.map((row) => ({ ...row })),
    members: daoMembers.map((row) => ({ ...row })),
    roles: daoRoles.map((row) => ({ ...row })),
    rules: daoSpendingRules.map((row) => ({ ...row })),
    assetRules: daoAssetRules.map((row) => ({ ...row })),
    recipients: daoRecipients.map((row) => ({ ...row })),
    activity: daoTimelineSeed.map((seed) => ({
      id: createId(),
      event: seed.event,
      at: now - seed.hoursAgo * HOUR_MS,
    })),
  };
}

function logged(activity: OrganizationActivity[], event: ActivityEvent): OrganizationActivity[] {
  return [{ id: createId(), at: Date.now(), event }, ...activity].slice(0, ACTIVITY_LIMIT);
}

function upsert<Row extends { id: string }>(
  rows: Row[],
  id: string | undefined,
  next: Omit<Row, 'id'>
): Row[] {
  if (id && rows.some((row) => row.id === id)) {
    return rows.map((row) => (row.id === id ? ({ ...row, ...next } as Row) : row));
  }
  return [{ ...next, id: createId() } as Row, ...rows];
}

function nameOf(rows: { id: string; name: string }[], id: string | null): string | null {
  return rows.find((row) => row.id === id)?.name ?? null;
}

export function deriveOrganizationSummary(
  state: Pick<OrganizationSample, 'assets' | 'vaults' | 'requests'>
): OrganizationSummary {
  const totalValueUsd = state.assets.reduce((sum, asset) => sum + asset.valueUsdNumber, 0);
  const moneyOutPerMonthUsd = state.vaults.reduce(
    (sum, vault) => sum + vault.moneyOutPerMonthUsd,
    0
  );
  return {
    totalValueUsd,
    moneyOutPerMonthUsd,
    monthsLeft: moneyOutPerMonthUsd > 0 ? Math.floor(totalValueUsd / moneyOutPerMonthUsd) : null,
    openRequests: state.requests.length,
    waitingRequests: state.requests.filter((request) => request.status === 'waitingForApproval')
      .length,
  };
}

export function roleHolderCount(roleId: string, members: DaoMemberRow[]): number {
  return members.filter((member) => member.roleId === roleId).length;
}

export function ruleName(rules: DaoSpendingRuleRow[], id: string | null): string | null {
  return nameOf(rules, id);
}

export function roleName(roles: DaoRoleRow[], id: string | null): string | null {
  return nameOf(roles, id);
}

export const useDaoWorkspace = create<OrganizationState>()(
  persist(
    (set) => ({
      ...createSample(),

      saveMember: (draft, id) =>
        set((state) => {
          const event: ActivityEvent = id
            ? { kind: 'memberUpdated', name: draft.name }
            : { kind: 'memberAdded', name: draft.name, role: roleName(state.roles, draft.roleId) };
          return {
            members: upsert(state.members, id, draft),
            activity: logged(state.activity, event),
          };
        }),

      removeMember: (id) =>
        set((state) => {
          const removed = state.members.find((member) => member.id === id);
          if (!removed) return {};
          return {
            members: state.members.filter((member) => member.id !== id),
            activity: logged(state.activity, { kind: 'memberRemoved', name: removed.name }),
          };
        }),

      saveRole: (draft, id) =>
        set((state) => ({
          roles: upsert(state.roles, id, draft),
          activity: logged(state.activity, {
            kind: id ? 'roleUpdated' : 'roleAdded',
            role: draft.name,
          }),
        })),

      removeRole: (id) =>
        set((state) => {
          const removed = state.roles.find((role) => role.id === id);
          if (!removed) return {};
          return {
            roles: state.roles.filter((role) => role.id !== id),
            members: state.members.map((member) =>
              member.roleId === id ? { ...member, roleId: null } : member
            ),
            activity: logged(state.activity, { kind: 'roleRemoved', role: removed.name }),
          };
        }),

      saveRule: (draft, id) =>
        set((state) => ({
          rules: upsert(state.rules, id, draft),
          activity: logged(
            state.activity,
            id
              ? { kind: 'ruleUpdated', rule: draft.name }
              : { kind: 'ruleAdded', rule: draft.name, waitHours: draft.waitHours }
          ),
        })),

      removeRule: (id) =>
        set((state) => {
          const removed = state.rules.find((rule) => rule.id === id);
          if (!removed) return {};
          const clear = <Row extends { ruleId: string | null }>(rows: Row[]) =>
            rows.map((row) => (row.ruleId === id ? { ...row, ruleId: null } : row));
          return {
            rules: state.rules.filter((rule) => rule.id !== id),
            roles: clear(state.roles),
            assetRules: clear(state.assetRules),
            recipients: clear(state.recipients),
            requests: clear(state.requests),
            assets: clear(state.assets),
            activity: logged(state.activity, { kind: 'ruleRemoved', rule: removed.name }),
          };
        }),

      saveAssetRule: (id, draft) =>
        set((state) => {
          const current = state.assetRules.find((row) => row.id === id);
          if (!current) return {};
          return {
            assetRules: state.assetRules.map((row) => (row.id === id ? { ...row, ...draft } : row)),
            activity: logged(state.activity, { kind: 'assetRuleUpdated', asset: current.asset }),
          };
        }),

      saveRecipient: (draft, id) =>
        set((state) => ({
          recipients: upsert(state.recipients, id, draft),
          activity: logged(state.activity, {
            kind: id ? 'recipientUpdated' : 'recipientAdded',
            name: draft.name,
          }),
        })),

      removeRecipient: (id) =>
        set((state) => {
          const removed = state.recipients.find((row) => row.id === id);
          if (!removed) return {};
          return {
            recipients: state.recipients.filter((row) => row.id !== id),
            activity: logged(state.activity, { kind: 'recipientRemoved', name: removed.name }),
          };
        }),

      resetSample: () => set(createSample()),
    }),
    {
      name: STORAGE_KEY,
      version: SAMPLE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: ({
        assets,
        vaults,
        requests,
        members,
        roles,
        rules,
        assetRules,
        recipients,
        activity,
      }) => ({
        assets,
        vaults,
        requests,
        members,
        roles,
        rules,
        assetRules,
        recipients,
        activity,
      }),
      migrate: () => createSample(),
    }
  )
);
