import type { AppMode } from '../../hooks/useAppMode';
import { HOME_PATH, appNavItems, findActiveNavKey, type AppNavItem, type NavLink } from '../../copy/nav';

export const APP_MENU_ID = 'app-menu';
export const MARKETING_MENU_ID = 'marketing-menu';

const ORGANIZATION_PREFIX = '/app/dao';
const PUBLIC_UTILITY_KEYS: readonly AppNavItem['key'][] = ['explorer', 'help'];
const NOT_DETAIL_SEGMENTS = new Set(['create', 'batch-create', 'batches', 'shapes', 'activity']);

export function isOrganizationPath(pathname: string): boolean {
  return pathname === ORGANIZATION_PREFIX || pathname.startsWith(`${ORGANIZATION_PREFIX}/`);
}

export function findActiveAppItem(pathname: string, includeOrganization: boolean): AppNavItem | null {
  const items = appNavItems(includeOrganization);
  const key = findActiveNavKey(pathname, items);
  return items.find((item) => item.key === key) ?? null;
}

/** True for routes that render inside DashboardLayout, Home excluded since it depends on the wallet. */
export function isAppFramePath(pathname: string): boolean {
  if (isOrganizationPath(pathname)) return true;
  const item = findActiveAppItem(pathname, true);
  return item !== null && item.key !== 'home' && !PUBLIC_UTILITY_KEYS.includes(item.key);
}

export function isHomePath(pathname: string): boolean {
  return pathname === HOME_PATH;
}

/** Organization pages that list the viewer's real streams and batches, so they never carry the sample-data banner. */
const REAL_DATA_ORGANIZATION_PATHS = new Set([`${ORGANIZATION_PREFIX}/streams`, `${ORGANIZATION_PREFIX}/stream-batches`]);

export function showsSampleData(pathname: string, mode: AppMode): boolean {
  if (REAL_DATA_ORGANIZATION_PATHS.has(pathname.replace(/\/+$/, ''))) return false;
  return isOrganizationPath(pathname) || (mode === 'dao' && isHomePath(pathname));
}

export type AppPageKind = 'home' | 'list' | 'detail' | 'create' | 'other';

export function appPageKind(pathname: string): AppPageKind {
  if (isHomePath(pathname)) return 'home';
  const segments = pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? '';
  if (last === 'create' || last === 'batch-create') return 'create';
  const item = findActiveAppItem(pathname, true);
  if (!item || item.key === 'settings') return 'other';
  const listPaths = [item.path, ...(item.alsoMatches ?? [])];
  if (listPaths.includes(pathname) || isOrganizationPath(pathname)) return 'list';
  return NOT_DETAIL_SEGMENTS.has(last) ? 'list' : 'detail';
}

/** Anchor links open a section of another page, so they never mark the current page. */
export function isCurrentLink(link: NavLink, pathname: string): boolean {
  return 'path' in link && !link.path.includes('#') && link.path === pathname;
}

/** The workspace the chrome shows. An Organization route always shows the Organization workspace, whatever was saved. */
export function workspaceForPath(pathname: string, mode: AppMode): AppMode {
  return isOrganizationPath(pathname) ? 'dao' : mode;
}
