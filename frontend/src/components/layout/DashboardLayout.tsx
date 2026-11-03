import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { SiteBanner } from '../ui/SiteBanner';
import { IS_TEST_BUILD } from '../../copy/network';
import { useAppMode } from '../../hooks/useAppMode';
import { AppSidebar } from './AppSidebar';
import { AppTopBar } from './AppTopBar';
import { MobileDrawer } from './MobileDrawer';
import { showsSampleData } from './chromeRoutes';
import { useSidebar } from './useSidebar';
import { CHROME } from '../../copy/nav';

interface DashboardLayoutProps {
  children: ReactNode;
}

const CONTENT_ID = 'main-content';

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { pathname } = useLocation();
  const mode = useAppMode((state) => state.mode);
  const sidebarOpen = useSidebar((state) => state.open);
  const toggleSidebar = useSidebar((state) => state.toggle);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-canvas text-ink">
      <a
        href={`#${CONTENT_ID}`}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-(--z-toast) focus:rounded-pill focus:bg-surface focus:px-4 focus:py-2 focus:text-label focus:text-ink focus:shadow-overlay"
      >
        {CHROME.skipToContent}
      </a>
      <AppSidebar collapsed={!sidebarOpen} onToggle={toggleSidebar} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        {IS_TEST_BUILD ? <SiteBanner kind="test-network" /> : null}
        {showsSampleData(pathname, mode) ? <SiteBanner kind="sample-data" /> : null}
        <AppTopBar menuOpen={drawerOpen} onOpenMenu={() => setDrawerOpen(true)} />
        <main id={CONTENT_ID} tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
};
