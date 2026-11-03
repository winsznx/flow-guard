import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DashboardLayout } from '../layout/DashboardLayout';
import { PageContainer } from '../layout/PageContainer';
import { appPageKind, findActiveAppItem, isOrganizationPath } from '../layout/chromeRoutes';
import { ConnectGate } from '../ui/ConnectGate';
import { AppPageSkeleton } from '../ui/RouteFallback';
import { connectGatePurpose } from '../../copy/network';
import { useAppMode } from '../../hooks/useAppMode';
import { useWallet } from '../../hooks/useWallet';
import { CHROME, CONNECT_PURPOSES, SHARED_LINK_PURPOSE } from '../../copy/nav';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const FALLBACK_PURPOSE = 'this page';
const SHARED_DETAIL_PATTERN = /^\/(streams|payments|grants)\/[^/]+\/?$/;

function isSharedDetailLink(pathname: string): boolean {
  return SHARED_DETAIL_PATTERN.test(pathname) && appPageKind(pathname) === 'detail';
}

function gatePurpose(pathname: string): string {
  if (isSharedDetailLink(pathname)) return SHARED_LINK_PURPOSE;
  if (isOrganizationPath(pathname)) return connectGatePurpose(CONNECT_PURPOSES.organization);
  const item = findActiveAppItem(pathname, false);
  if (!item) return connectGatePurpose(FALLBACK_PURPOSE);
  if (item.key === 'home') return connectGatePurpose(CONNECT_PURPOSES.home);
  return connectGatePurpose(`your ${item.label.toLowerCase()}`);
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { pathname } = useLocation();
  const wallet = useWallet();
  const pendingMode = useAppMode((state) => state.pendingMode);
  const commitPendingMode = useAppMode((state) => state.commitPendingMode);
  const savingWorkspace = wallet.isConnected && pendingMode !== null;

  useLayoutEffect(() => {
    if (savingWorkspace) commitPendingMode();
  }, [savingWorkspace, commitPendingMode]);

  if (!wallet.initAttempted || savingWorkspace) {
    return (
      <DashboardLayout>
        <AppPageSkeleton label={CHROME.checkingForWallet} />
      </DashboardLayout>
    );
  }

  if (!wallet.isConnected) {
    return (
      <DashboardLayout>
        <PageContainer>
          <ConnectGate purpose={gatePurpose(pathname)} />
        </PageContainer>
      </DashboardLayout>
    );
  }

  return <>{children}</>;
}
