import { useEffect, useState } from 'react';
import { ButtonLink } from '../ui/ButtonLink';
import { Display } from '../ui/Display';
import { Eyebrow } from '../ui/Eyebrow';
import { cx } from '../ui/cx';
import { formatRelative } from '../../copy/format';
import { NETWORK_NAME_START } from '../../copy/network';

type BandLink = { label: string; href: string };

export type ClosingBandProps = {
  eyebrow?: string;
  headline: string;
  accent?: string;
  lead: string;
  primary: BandLink;
  secondary?: BandLink;
  facts: [string, string, string];
  showChainData?: boolean;
  className?: string;
};

type ChainStatus = { updatedAt?: string; chain?: { ageSeconds?: number | null } };

const STATUS_URL = '/api/status';

function lastNetworkUpdate(payload: ChainStatus): number | null {
  const ageSeconds = payload.chain?.ageSeconds;
  const reportedAt = payload.updatedAt ? Date.parse(payload.updatedAt) : Number.NaN;
  if (typeof ageSeconds !== 'number' || !Number.isFinite(ageSeconds) || Number.isNaN(reportedAt)) return null;
  return reportedAt - ageSeconds * 1000;
}

function useLastNetworkUpdate(enabled: boolean): number | null {
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    fetch(STATUS_URL, { headers: { Accept: 'application/json' }, signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<ChainStatus>) : null))
      .then((payload) => setUpdatedAt(payload ? lastNetworkUpdate(payload) : null))
      .catch(() => {
        if (!controller.signal.aborted) setUpdatedAt(null);
      });
    return () => controller.abort();
  }, [enabled]);

  return enabled ? updatedAt : null;
}

export function ClosingBand({
  eyebrow,
  headline,
  accent,
  lead,
  primary,
  secondary,
  facts,
  showChainData = false,
  className,
}: ClosingBandProps) {
  const updatedAt = useLastNetworkUpdate(showChainData);
  const updatedText = updatedAt === null ? null : formatRelative(updatedAt);

  return (
    <div className={cx('mx-auto w-full min-w-0 max-w-page px-4 pb-16 sm:px-6 lg:px-8', className)}>
      <section className="on-inverse rounded-band bg-inverse px-6 py-16 text-ink-inverse lg:px-16 lg:py-24">
        <div className="flex max-w-reading flex-col items-start gap-6">
          {eyebrow ? <Eyebrow onInverse>{eyebrow}</Eyebrow> : null}
          <Display size="headline" as="h2" accent={accent} onInverse>
            {headline}
          </Display>
          <p className="text-body-lg text-ink-inverse-muted">{lead}</p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
            <ButtonLink to={primary.href} variant="on-inverse" size="lg">
              {primary.label}
            </ButtonLink>
            {secondary ? (
              <ButtonLink to={secondary.href} variant="on-inverse-secondary" size="lg">
                {secondary.label}
              </ButtonLink>
            ) : null}
          </div>
          {updatedText ? (
            <p className="font-mono text-mono-sm text-ink-inverse-muted">{`${NETWORK_NAME_START}: transactions last confirmed ${updatedText}`}</p>
          ) : null}
        </div>
        <ul className="mt-12 flex flex-col gap-2 font-mono text-eyebrow text-ink-inverse-muted sm:flex-row sm:flex-wrap sm:gap-x-6">
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
