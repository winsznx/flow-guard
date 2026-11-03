import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Old activity links open Explorer filtered to streams (IA 4). The personal one starts on
 * your own activity. Explorer has no vault filter, so the Organization one carries no scope.
 */
export default function StreamActivityPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (pathname.startsWith('/app/dao')) next.delete('scope');
    else if (!next.get('scope')) next.set('scope', 'personal');
    if (!next.get('type')) next.set('type', 'stream');
    navigate(`/explorer?${next.toString()}`, { replace: true });
  }, [navigate, pathname, searchParams]);

  return null;
}
