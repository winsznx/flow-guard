import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ButtonLink } from './ButtonLink';
import { Heading } from './Heading';
import { Icon } from './Icon';
import { LABELS } from '../../copy/common';

export type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  learnMore?: { label: string; to: string };
  example?: string;
};

export function EmptyState({ icon, title, description, action, learnMore, example }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <div className="flex w-full max-w-narrow flex-col items-center gap-3">
        <span className="inline-flex size-12 items-center justify-center rounded-pill bg-sunken text-ink-secondary">
          <Icon icon={icon} size={24} />
        </span>
        <Heading level="item" as="h2">
          {title}
        </Heading>
        <p className="text-body text-ink-secondary">{description}</p>
        {example ? (
          <p className="text-small text-ink-muted">
            {LABELS.forExample} {example}
          </p>
        ) : null}
        {action || learnMore ? (
          <div className="mt-2 flex flex-col items-center gap-3">
            {action}
            {learnMore ? (
              <ButtonLink variant="link" to={learnMore.to}>
                {learnMore.label}
              </ButtonLink>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
