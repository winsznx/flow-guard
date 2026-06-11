/**
 * Back-compat redirect: the old /streams/activity workspace is now folded
 * into the single canonical Explorer surface. Any deep link (sidebar,
 * StreamDetailPage button, external bookmark) lands here and is forwarded
 * to /explorer with the personal scope and stream filter pre-applied.
 *
 * Kept as a tiny component so App.tsx routes don't need to change in this
 * phase - Phase 3 owns the actual route rewrite.
 */

import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

const TARGET_BASE = '/explorer';

export default function StreamActivityPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (!next.get('scope')) next.set('scope', 'personal');
    if (!next.get('type')) next.set('type', 'stream');

    const isDaoRoute = location.pathname.startsWith('/app/dao');
    if (isDaoRoute && !searchParams.get('scope')) {
      next.set('scope', 'treasury');
    }

    const query = next.toString();
    const target = query ? `${TARGET_BASE}?${query}` : TARGET_BASE;
    navigate(target, { replace: true, state: location.state });
  }, [location.pathname, location.state, navigate, searchParams]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="font-sans text-sm text-textMuted">Opening the canonical Explorer…</p>
      </div>
    </div>
  );
}
