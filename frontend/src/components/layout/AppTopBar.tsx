import { useLocation } from 'react-router-dom';
import { MenuIcon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { NetworkCapsule } from '../ui/NetworkCapsule';
import { WalletChip } from '../ui/WalletDropdown';
import { ACTIONS } from '../../copy/common';
import { SITE_NAME } from '../../copy/nav';
import { BUILD_NETWORK } from '../../copy/network';
import { useAppMode } from '../../hooks/useAppMode';
import { APP_MENU_ID, findActiveAppItem, workspaceForPath } from './chromeRoutes';

export type AppTopBarProps = {
  menuOpen: boolean;
  onOpenMenu: () => void;
};

const STATUS_PATH = '/status';

export function AppTopBar({ menuOpen, onOpenMenu }: AppTopBarProps) {
  const { pathname } = useLocation();
  const mode = useAppMode((state) => state.mode);
  const title = findActiveAppItem(pathname, workspaceForPath(pathname, mode) === 'dao')?.label ?? SITE_NAME;

  return (
    <header className="sticky top-0 z-(--z-header) flex h-topbar shrink-0 items-center gap-3 border-b border-line bg-canvas px-4 lg:px-8">
      <IconButton
        icon={MenuIcon}
        label={ACTIONS.openMenu}
        aria-expanded={menuOpen}
        aria-controls={APP_MENU_ID}
        onClick={onOpenMenu}
        className="-ml-2 lg:hidden"
      />
      <p className="min-w-0 flex-1 truncate text-title-item text-ink lg:hidden">{title}</p>
      <div className="hidden flex-1 lg:block" />
      <NetworkCapsule network={BUILD_NETWORK} to={STATUS_PATH} />
      <div className="min-w-0 shrink">
        <WalletChip compact />
      </div>
    </header>
  );
}
