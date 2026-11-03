import { ORG_LAUNCH } from '../copy/organization';

/**
 * Carried from the Organization workspace into the stream builders. Only the source id
 * identifies where a flow started; title and description are display copy from ORG_LAUNCH.
 */
export interface DaoLaunchContext {
  source: string;
  title: string;
  description: string;
  preferredLane?: string;
}

export const ORG_LAUNCH_SOURCE = 'organization-vault-streams';

const DAO_STREAM_CONTEXT_KEY = 'flowguard-dao-stream-context';

export function buildDaoSingleStreamState(): { daoContext: DaoLaunchContext } {
  return {
    daoContext: {
      source: ORG_LAUNCH_SOURCE,
      title: ORG_LAUNCH.title,
      description: ORG_LAUNCH.stream,
    },
  };
}

/** Opens the batch builder empty: sample recipients never reach a real money flow. */
export function buildDaoBatchStreamState(): { daoContext: DaoLaunchContext } {
  return {
    daoContext: {
      source: ORG_LAUNCH_SOURCE,
      title: ORG_LAUNCH.title,
      description: ORG_LAUNCH.batch,
    },
  };
}

function sessionStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch (error) {
    console.warn('Session storage is unavailable, so the Organization context is not kept.', error);
    return null;
  }
}

export function rememberDaoLaunchContext(context: DaoLaunchContext | null | undefined): void {
  const store = sessionStore();
  if (!store) return;
  try {
    if (context) store.setItem(DAO_STREAM_CONTEXT_KEY, JSON.stringify(context));
    else store.removeItem(DAO_STREAM_CONTEXT_KEY);
  } catch (error) {
    console.warn('Could not update the Organization context in session storage.', error);
  }
}

function isLaunchContext(value: unknown): value is DaoLaunchContext {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.source === 'string' &&
    typeof record.title === 'string' &&
    typeof record.description === 'string'
  );
}

export function readDaoLaunchContext(): DaoLaunchContext | null {
  const store = sessionStore();
  if (!store) return null;
  try {
    const stored = store.getItem(DAO_STREAM_CONTEXT_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isLaunchContext(parsed) ? parsed : null;
  } catch (error) {
    console.warn('Ignoring an unreadable Organization context in session storage.', error);
    return null;
  }
}
