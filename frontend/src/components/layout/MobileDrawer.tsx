import { Drawer } from '../ui/Drawer';
import { NetworkCapsule } from '../ui/NetworkCapsule';
import { BUILD_NETWORK } from '../../copy/network';
import { SidebarNav } from './Sidebar';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { APP_MENU_ID } from './chromeRoutes';
import { CHROME } from '../../copy/nav';

export type MobileDrawerProps = {
  open: boolean;
  onClose: () => void;
};

const STATUS_PATH = '/status';

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  return (
    <Drawer open={open} onClose={onClose} side="left" label={CHROME.menu} id={APP_MENU_ID}>
      <div className="flex flex-col gap-4 px-3 pb-6">
        <div className="px-3">
          <WorkspaceSwitcher />
        </div>
        <SidebarNav rows="large" onNavigate={onClose} />
        <div className="px-3">
          <NetworkCapsule network={BUILD_NETWORK} to={STATUS_PATH} />
        </div>
      </div>
    </Drawer>
  );
}
