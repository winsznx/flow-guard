import { useId } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BetaTag } from '../ui/BetaTag';
import { Eyebrow } from '../ui/Eyebrow';
import { Icon } from '../ui/Icon';
import { Tooltip } from '../ui/Tooltip';
import { cx } from '../ui/cx';
import { APP_GROUPS, APP_HOME, APP_UTILITY, ORGANIZATION_GROUP, CHROME, type AppNavGroup, type AppNavItem } from '../../copy/nav';
import { useAppMode } from '../../hooks/useAppMode';
import { findActiveAppItem, workspaceForPath } from './chromeRoutes';

export type SidebarNavProps = {
  collapsed?: boolean;
  rows?: 'regular' | 'large';
  onNavigate?: () => void;
};

const ITEM =
  'flex items-center gap-3 rounded-control text-label transition-colors duration-(--duration-fast) ease-standard pointer-coarse:min-h-touch';

const ITEM_STATE = {
  rest: 'text-ink-secondary hover:bg-sunken hover:text-ink',
  active: 'bg-surface text-ink shadow-raised',
} as const;

const ITEM_ROWS = {
  regular: 'h-control-md',
  large: 'min-h-control-lg',
} as const;

type ItemProps = {
  item: AppNavItem;
  active: boolean;
  collapsed: boolean;
  rows: 'regular' | 'large';
  onNavigate?: () => void;
};

function SidebarItem({ item, active, collapsed, rows, onNavigate }: ItemProps) {
  const link = (
    <Link
      to={item.path}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      data-control
      className={cx(
        ITEM,
        ITEM_ROWS[rows],
        active ? ITEM_STATE.active : ITEM_STATE.rest,
        collapsed ? 'justify-center px-0' : 'px-3',
      )}
    >
      <span aria-hidden="true" className={cx('inline-flex', active ? 'text-brand' : 'text-ink-muted')}>
        <Icon icon={item.icon} size={20} />
      </span>
      <span className={collapsed ? 'sr-only' : 'min-w-0 truncate'}>{item.label}</span>
    </Link>
  );

  return <li>{collapsed ? <Tooltip content={item.label}>{link}</Tooltip> : link}</li>;
}

type GroupProps = Omit<ItemProps, 'item' | 'active'> & { group: AppNavGroup; activeKey: AppNavItem['key'] | null };

function SidebarGroup({ group, activeKey, collapsed, rows, onNavigate }: GroupProps) {
  const headingId = useId();

  return (
    <li className="mt-6">
      {collapsed ? (
        <span id={headingId} className="sr-only">
          {group.label}
        </span>
      ) : (
        <div id={headingId} className="mb-2 flex items-center gap-2 px-3">
          <Eyebrow>{group.label}</Eyebrow>
          {group.beta ? <BetaTag /> : null}
        </div>
      )}
      {collapsed ? <div aria-hidden="true" className="mx-3 mb-2 border-t border-line" /> : null}
      <ul aria-labelledby={headingId} className="flex flex-col gap-0.5">
        {group.items.map((item) => (
          <SidebarItem
            key={item.key}
            item={item}
            active={item.key === activeKey}
            collapsed={collapsed}
            rows={rows}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </li>
  );
}

export function SidebarNav({ collapsed = false, rows = 'regular', onNavigate }: SidebarNavProps) {
  const { pathname } = useLocation();
  const mode = useAppMode((state) => state.mode);
  const includeOrganization = workspaceForPath(pathname, mode) === 'dao';
  const activeKey = findActiveAppItem(pathname, includeOrganization)?.key ?? null;
  const groups = includeOrganization ? [...APP_GROUPS, ORGANIZATION_GROUP] : APP_GROUPS;
  const shared = { collapsed, rows, onNavigate };

  return (
    <nav aria-label={CHROME.mainNav} className="flex flex-col gap-6">
      <ul className="flex flex-col">
        <SidebarItem item={APP_HOME} active={activeKey === APP_HOME.key} {...shared} />
        {groups.map((group) => (
          <SidebarGroup key={group.key} group={group} activeKey={activeKey} {...shared} />
        ))}
      </ul>
      <ul className="flex flex-col gap-0.5 border-t border-line pt-4">
        {APP_UTILITY.map((item) => (
          <SidebarItem key={item.key} item={item} active={item.key === activeKey} {...shared} />
        ))}
      </ul>
    </nav>
  );
}
