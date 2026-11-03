import { useLocation } from 'react-router-dom';
import { SkeletonCard, SkeletonStats, SkeletonTable, SkeletonText } from './Skeleton';
import { cx } from './cx';
import { DashboardLayout } from '../layout/DashboardLayout';
import { MarketingNav } from '../layout/MarketingNav';
import { PageContainer } from '../layout/PageContainer';
import { appPageKind, findActiveAppItem, isAppFramePath, isHomePath, type AppPageKind } from '../layout/chromeRoutes';
import { SITE_NAME, routeTitle, CHROME } from '../../copy/nav';
import { useWallet } from '../../hooks/useWallet';

const BLOCK = 'block rounded-inline bg-sunken animate-pulse';

function loadingLabel(title: string | null | undefined): string {
  return title ? `${CHROME.loading} ${title}` : CHROME.loading;
}

function HeaderBlocks({ withTrail = false }: { withTrail?: boolean }) {
  return (
    <div className="mb-8 flex flex-col gap-3">
      {withTrail ? <span className={cx(BLOCK, 'h-4 w-1/4')} /> : null}
      <span className={cx(BLOCK, 'h-9 w-1/3')} />
      <span className={cx(BLOCK, 'h-4 w-1/2')} />
    </div>
  );
}

function AppBlocks({ kind }: { kind: AppPageKind }) {
  switch (kind) {
    case 'home':
      return (
        <>
          <HeaderBlocks />
          <SkeletonCard lines={3} className="mb-6" />
          <SkeletonStats count={4} className="mb-6" />
          <SkeletonTable rows={5} />
        </>
      );
    case 'list':
      return (
        <>
          <HeaderBlocks />
          <SkeletonStats count={4} className="mb-6" />
          <SkeletonTable rows={6} />
        </>
      );
    case 'detail':
      return (
        <>
          <HeaderBlocks withTrail />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-6 lg:col-span-2">
              <SkeletonCard lines={3} />
              <SkeletonCard lines={4} />
            </div>
            <SkeletonCard lines={5} />
          </div>
        </>
      );
    case 'create':
      return (
        <div className="max-w-reading">
          <HeaderBlocks withTrail />
          <SkeletonCard lines={6} />
        </div>
      );
    case 'other':
      return (
        <div className="max-w-reading">
          <HeaderBlocks />
          <SkeletonCard lines={4} />
        </div>
      );
  }
}

export type AppPageSkeletonProps = { label: string };

/** The content area of an app page while it loads, for use inside DashboardLayout. */
export function AppPageSkeleton({ label }: AppPageSkeletonProps) {
  const { pathname } = useLocation();

  return (
    <PageContainer>
      <p role="status" className="sr-only">
        {label}
      </p>
      <div aria-hidden="true">
        <AppBlocks kind={appPageKind(pathname)} />
      </div>
    </PageContainer>
  );
}

function MarketingBlocks({ label }: { label: string }) {
  return (
    <>
      <MarketingNav />
      <div className="mx-auto w-full max-w-page px-4 pt-16 pb-16 sm:px-6 lg:px-8 lg:pt-24">
        <p role="status" className="sr-only">
          {label}
        </p>
        <div aria-hidden="true" className="flex max-w-reading flex-col gap-4">
          <span className={cx(BLOCK, 'h-4 w-24')} />
          <span className={cx(BLOCK, 'h-12 w-full')} />
          <span className={cx(BLOCK, 'h-12 w-3/4')} />
          <SkeletonText lines={3} className="mt-4" />
        </div>
      </div>
    </>
  );
}

function ConnectBlocks({ label }: { label: string }) {
  return (
    <PageContainer width="narrow" className="mt-10 lg:mt-16">
      <p role="status" className="sr-only">
        {label}
      </p>
      <div aria-hidden="true">
        <SkeletonCard lines={5} />
      </div>
    </PageContainer>
  );
}

export function RouteFallback() {
  const { pathname } = useLocation();
  const { isConnected } = useWallet();

  if (isHomePath(pathname)) {
    const label = loadingLabel(findActiveAppItem(pathname, false)?.label);
    if (!isConnected) return <ConnectBlocks label={label} />;
    return (
      <DashboardLayout>
        <AppPageSkeleton label={label} />
      </DashboardLayout>
    );
  }

  if (isAppFramePath(pathname)) {
    return (
      <DashboardLayout>
        <AppPageSkeleton label={loadingLabel(findActiveAppItem(pathname, true)?.label)} />
      </DashboardLayout>
    );
  }

  return <MarketingBlocks label={loadingLabel(pathname === '/' ? SITE_NAME : routeTitle(pathname))} />;
}
