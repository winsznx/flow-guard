import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SkeletonCard } from '../components/ui/Skeleton';

export default function ClaimLinkPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const resolveClaimLink = async () => {
      if (!token) {
        setError('Missing claim token');
        return;
      }

      try {
        const response = await fetch(`/api/airdrops/claim/${token}`);
        const payload = await response.json();
        if (!response.ok || !payload?.campaignId) {
          throw new Error(payload?.error || payload?.message || 'Claim link is invalid or expired');
        }
        navigate(`/airdrops/${payload.campaignId}`, { replace: true });
      } catch (e: any) {
        setError(e?.message || 'Failed to resolve claim link');
      }
    };

    resolveClaimLink();
  }, [token, navigate]);

  if (!error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <SkeletonCard lines={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <Card padding="xl" className="max-w-xl w-full text-center">
        <h1 className="text-2xl font-display font-bold text-textPrimary mb-2">Claim Link Error</h1>
        <p className="text-textMuted font-mono mb-6">{error}</p>
        <Button onClick={() => navigate('/airdrops')}>Go to Airdrops</Button>
      </Card>
    </div>
  );
}
