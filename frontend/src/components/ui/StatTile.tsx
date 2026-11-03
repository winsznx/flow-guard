import React from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { Skeleton } from './Skeleton';
import { ACTIONS, LABELS } from '../../copy/common';

export type StatTileProps = {
  label: string;
  value: React.ReactNode;
  sub?: string;
  state?: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  pageOnly?: boolean;
};

export function StatTile({ label, value, sub, state = 'ready', onRetry, pageOnly = false }: StatTileProps) {
  return (
    <Card padding="none">
      <div className="flex flex-col gap-2 p-4">
        <p className="text-label text-ink-secondary">{pageOnly ? `${label} ${LABELS.onThisPage}` : label}</p>
        {state === 'loading' ? (
          <Skeleton kind="amount" />
        ) : state === 'error' ? (
          <p className="flex flex-wrap items-baseline gap-x-2 text-small text-ink-secondary">
            {LABELS.couldntLoad}
            {onRetry ? (
              <Button variant="link" onClick={onRetry}>
                {ACTIONS.tryAgain}
              </Button>
            ) : null}
          </p>
        ) : (
          <div className="text-amount-lg text-ink">{value}</div>
        )}
        {sub && state === 'ready' ? <p className="text-small text-ink-muted">{sub}</p> : null}
      </div>
    </Card>
  );
}
