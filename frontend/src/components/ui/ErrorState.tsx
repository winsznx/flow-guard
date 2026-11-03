import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Heading } from './Heading';
import { CircleAlert, Icon } from './Icon';
import { ACTIONS, BUSY, MOMENTS } from '../../copy/common';

export type ErrorStateProps = {
  title: string;
  reason?: string;
  onRetry?: () => Promise<void> | void;
  action?: React.ReactNode;
};

export function ErrorState({ title, reason, onRetry, action }: ErrorStateProps) {
  const [retrying, setRetrying] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const retry = async () => {
    if (!onRetry) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      if (mounted.current) setRetrying(false);
    }
  };

  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <div className="flex w-full max-w-narrow flex-col items-center gap-3">
        <span className="inline-flex size-12 items-center justify-center rounded-pill bg-sunken text-danger-dot">
          <Icon icon={CircleAlert} size={24} />
        </span>
        <Heading level="item" as="h2">
          {title}
        </Heading>
        {reason ? <p className="text-body text-ink-secondary">{reason}</p> : null}
        <p className="text-body text-ink-secondary">{MOMENTS.walletUnchanged}</p>
        {onRetry || action ? (
          <div className="mt-2 flex flex-col items-center gap-3">
            {onRetry ? (
              <Button variant="secondary" onClick={() => void retry()} busy={retrying} busyLabel={BUSY.tryingAgain}>
                {ACTIONS.tryAgain}
              </Button>
            ) : null}
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}
