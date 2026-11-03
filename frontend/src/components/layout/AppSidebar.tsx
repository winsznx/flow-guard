import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { NetworkCapsule } from '../ui/NetworkCapsule';
import { cx } from '../ui/cx';
import { HOME_PATH, SITE_NAME, CHROME } from '../../copy/nav';
import { BUILD_NETWORK } from '../../copy/network';
import { version as APP_VERSION } from '../../../package.json';
import { Logo } from './Logo';
import { SidebarNav } from './Sidebar';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

export type AppSidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
};

const STATUS_PATH = '/status';

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  return (
    <aside
      className={cx(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-canvas lg:flex',
        collapsed ? 'w-sidebar-rail' : 'w-sidebar',
      )}
    >
      <div className={cx('flex h-topbar shrink-0 items-center', collapsed ? 'justify-center px-3' : 'px-6')}>
        <Link to={HOME_PATH} aria-label={SITE_NAME} data-control className="inline-flex items-center rounded-control">
          <Logo variant={collapsed ? 'mark' : 'full'} />
        </Link>
      </div>
      {collapsed ? null : (
        <div className="px-3 pt-2">
          <WorkspaceSwitcher />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <SidebarNav collapsed={collapsed} />
      </div>
      <div
        className={cx(
          'flex shrink-0 gap-3 border-t border-line px-3 py-4',
          collapsed ? 'flex-col items-center' : 'items-center justify-between',
        )}
      >
        {collapsed ? null : (
          <div className="flex min-w-0 flex-col items-start gap-2 px-3">
            <NetworkCapsule network={BUILD_NETWORK} to={STATUS_PATH} />
            <p className="font-mono text-mono-sm text-ink-muted">v{APP_VERSION}</p>
          </div>
        )}
        <IconButton
          icon={collapsed ? ChevronRight : ChevronLeft}
          label={collapsed ? CHROME.expandSidebar : CHROME.collapseSidebar}
          onClick={onToggle}
        />
      </div>
    </aside>
  );
}
