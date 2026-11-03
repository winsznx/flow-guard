import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { RouteFallback } from '../components/ui/RouteFallback';
import { useWallet } from '../hooks/useWallet';
import { requestPath } from '../utils/requestLink';

const REQUESTS_PATH = '/proposals';

type Target = { id: string; to: string };

/** Old links to one spending request land on its vault page, with that request's card in view. */
export default function ProposalRedirectPage() {
  const { id = '' } = useParams<{ id: string }>();
  const address = useWallet().address;
  const [target, setTarget] = useState<Target | null>(null);

  useEffect(() => {
    if (!id) return undefined;
    const controller = new AbortController();
    const headers: Record<string, string> = address ? { 'x-user-address': address } : {};
    fetch(`/api/proposals/${encodeURIComponent(id)}`, { headers, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Request lookup failed with ${response.status}`);
        const body: { vaultId?: unknown } = await response.json();
        const vaultId = typeof body.vaultId === 'string' && body.vaultId ? body.vaultId : null;
        setTarget({ id, to: vaultId ? requestPath(vaultId, id) : REQUESTS_PATH });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn('Spending request lookup failed', error);
        setTarget({ id, to: REQUESTS_PATH });
      });
    return () => controller.abort();
  }, [id, address]);

  if (!id) return <Navigate to={REQUESTS_PATH} replace />;
  if (target?.id !== id) return <RouteFallback />;
  return <Navigate to={target.to} replace />;
}
