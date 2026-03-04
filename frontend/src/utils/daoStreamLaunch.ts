import type { DaoWorkspaceRecipientRule } from '../stores/useDaoWorkspace';

export interface DaoLaunchContext {
  source: string;
  title: string;
  description: string;
  preferredLane?: string;
}

const DAO_STREAM_CONTEXT_KEY = 'flowguard-dao-stream-context';

function tomorrowIsoDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function buildDaoPayrollImportedRows(
  recipientRules: DaoWorkspaceRecipientRule[],
  templateId = 'recurring-open-monthly',
) {
  const payrollRules = recipientRules.filter(
    (rule) => rule.status !== 'Blocked' && (rule.category === 'Payroll' || rule.category === 'Vendor'),
  );
  const fallbackRules = recipientRules.filter((rule) => rule.status !== 'Blocked');
  const selectedRules = (payrollRules.length ? payrollRules : fallbackRules).slice(0, 8);
  const startDate = tomorrowIsoDate();

  return selectedRules.map((rule) => ({
    recipient: rule.address,
    amount: '',
    description: rule.name,
    scheduleTemplate: templateId,
    startDate,
    durationDays: templateId.includes('weekly') ? '84' : '180',
    intervalDays: templateId.includes('weekly') ? '7' : '30',
    cliffDays: '',
    trancheOffsetsDays: '',
    tranchePercentages: '',
  }));
}

export function buildDaoSingleStreamState(context: DaoLaunchContext) {
  return {
    daoContext: context,
  };
}

export function buildDaoBatchStreamState(
  recipientRules: DaoWorkspaceRecipientRule[],
  context: DaoLaunchContext,
  templateId = 'recurring-open-monthly',
) {
  return {
    daoContext: context,
    preferredTemplateId: templateId,
    importedData: buildDaoPayrollImportedRows(recipientRules, templateId),
  };
}

export function rememberDaoLaunchContext(context: DaoLaunchContext | null | undefined) {
  if (typeof window === 'undefined') return;
  if (!context) {
    window.sessionStorage.removeItem(DAO_STREAM_CONTEXT_KEY);
    return;
  }
  window.sessionStorage.setItem(DAO_STREAM_CONTEXT_KEY, JSON.stringify(context));
}

export function readDaoLaunchContext() {
  if (typeof window === 'undefined') return null;
  const stored = window.sessionStorage.getItem(DAO_STREAM_CONTEXT_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as DaoLaunchContext;
  } catch {
    return null;
  }
}
