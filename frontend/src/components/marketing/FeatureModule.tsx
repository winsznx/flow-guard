import React from 'react';
import { ButtonLink } from '../ui/ButtonLink';
import { Card } from '../ui/Card';
import { Display } from '../ui/Display';
import { Eyebrow } from '../ui/Eyebrow';
import { Heading } from '../ui/Heading';
import { Panel } from '../ui/Panel';
import { cx } from '../ui/cx';

export type FeatureModuleProps = {
  id?: string;
  /** Leave out `number` when several modules share one numbered chapter heading. */
  eyebrow: { number?: string; label: string };
  title: string;
  body: string;
  action?: { label: string; href: string };
  facts?: { title: string; body: string }[];
  visual?: React.ReactNode;
  className?: string;
};

const MAX_FACTS = 4;

export function FeatureModule({ id, eyebrow, title, body, action, facts = [], visual, className }: FeatureModuleProps) {
  const headingId = id ? `${id}-title` : undefined;

  return (
    <article
      id={id}
      aria-labelledby={headingId}
      className={cx('grid scroll-mt-header gap-8 lg:grid-cols-2 lg:items-start lg:gap-12', className)}
    >
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Eyebrow number={eyebrow.number}>{eyebrow.label}</Eyebrow>
          <Display size="headline" as="h2" id={headingId}>
            {title}
          </Display>
          <p className="max-w-reading text-body-lg text-ink-secondary">{body}</p>
        </div>
        {action ? (
          <div>
            <ButtonLink to={action.href} variant="secondary">
              {action.label}
            </ButtonLink>
          </div>
        ) : null}
        {facts.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            {facts.slice(0, MAX_FACTS).map((fact) => (
              <Card key={fact.title} as="li">
                <div className="flex flex-col gap-1">
                  <Heading level="item">{fact.title}</Heading>
                  <p className="text-small text-ink-secondary">{fact.body}</p>
                </div>
              </Card>
            ))}
          </ul>
        ) : null}
      </div>
      {visual ? <Panel className="min-w-0">{visual}</Panel> : null}
    </article>
  );
}
