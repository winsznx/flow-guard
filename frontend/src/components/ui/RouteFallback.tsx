import { useLocation } from 'react-router-dom';
import { SkeletonStats, SkeletonTable, SkeletonCard, SkeletonText } from './Skeleton';

/**
 * RouteFallback paints the shape of the destination page while its lazy chunk
 * downloads. Each branch matches what the real page renders, so the user sees
 * a meaningful preview instead of a generic spinner.
 */
export function RouteFallback() {
  const { pathname } = useLocation();
  return <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">{pickSkeleton(pathname)}</div>;
}

function pickSkeleton(pathname: string) {
  // Detail-style pages: header + stats row + body card.
  if (looksLikeDetail(pathname)) {
    return (
      <>
        <div className="mb-6 h-10 w-2/3 animate-pulse rounded bg-surfaceAlt border border-border/40" />
        <SkeletonStats count={4} className="mb-6" />
        <SkeletonCard className="mb-4" lines={4} />
        <SkeletonCard lines={3} />
      </>
    );
  }

  // Create / form pages: header + form card with several input rows.
  if (pathname.includes('/create')) {
    return (
      <>
        <div className="mb-6 h-10 w-1/2 animate-pulse rounded bg-surfaceAlt border border-border/40" />
        <div className="rounded-lg border border-border/40 bg-surface p-6 space-y-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-32 animate-pulse rounded bg-surfaceAlt border border-border/40" />
              <div className="h-10 w-full animate-pulse rounded bg-surfaceAlt border border-border/40" />
            </div>
          ))}
        </div>
      </>
    );
  }

  // List-style product pages: header + stats + table.
  if (isListRoute(pathname)) {
    return (
      <>
        <div className="mb-6 h-10 w-1/3 animate-pulse rounded bg-surfaceAlt border border-border/40" />
        <SkeletonStats count={4} className="mb-6" />
        <SkeletonTable rows={6} columns={5} />
      </>
    );
  }

  // Onboarding / article-style pages: long-form prose.
  if (isArticleRoute(pathname)) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 h-12 w-3/4 animate-pulse rounded bg-surfaceAlt border border-border/40" />
        <SkeletonText lines={5} className="mb-8" />
        <SkeletonText lines={7} className="mb-8" />
        <SkeletonText lines={6} />
      </div>
    );
  }

  // App home / dashboard: stats + 2-col cards.
  if (pathname === '/app' || pathname === '/' || pathname === '/app/dao') {
    return (
      <>
        <div className="mb-6 h-10 w-2/5 animate-pulse rounded bg-surfaceAlt border border-border/40" />
        <SkeletonStats count={4} className="mb-6" />
        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
        <SkeletonTable rows={5} columns={4} />
      </>
    );
  }

  // Generic fallback: a single content card.
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 h-10 w-1/2 animate-pulse rounded bg-surfaceAlt border border-border/40" />
      <SkeletonCard lines={5} />
    </div>
  );
}

function looksLikeDetail(p: string): boolean {
  const detailParents = ['/streams/', '/payments/', '/airdrops/', '/bounties/', '/rewards/', '/grants/', '/vaults/', '/proposals/', '/budgets/', '/updates/', '/requests/'];
  return detailParents.some((parent) => p.startsWith(parent) && !p.endsWith(parent) && !p.includes('/create') && !p.includes('/batch'));
}

function isListRoute(p: string): boolean {
  return [
    '/streams', '/streams/activity', '/streams/batches', '/streams/shapes',
    '/payments', '/airdrops', '/bounties', '/rewards', '/grants',
    '/proposals', '/budgets', '/governance', '/vaults',
    '/explorer', '/app/dao/overview', '/app/dao/streams', '/app/dao/team',
    '/app/dao/roles', '/app/dao/treasury-policy', '/app/dao/stream-batches',
    '/app/dao/stream-activity', '/updates',
  ].some((route) => p === route);
}

function isArticleRoute(p: string): boolean {
  return [
    '/faq', '/security', '/how-it-works', '/pricing', '/use-cases', '/demo',
    '/help', '/settings', '/terms', '/privacy', '/disclaimer', '/changelog',
    '/roadmap', '/status', '/grants-info',
  ].some((route) => p === route || p.startsWith(`${route}/`));
}
