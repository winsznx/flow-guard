import React from 'react';
import { Amount } from '../ui/Amount';
import { ApprovalMeter, type ApprovalMeterProps } from '../ui/ApprovalMeter';
import { Heading } from '../ui/Heading';
import { ProgressMeter } from '../ui/ProgressMeter';
import { ReleaseBar } from '../ui/ReleaseBar';
import { StatusPill } from '../ui/StatusPill';
import type { StatusKey } from '../../copy/status';
import type { Asset } from '../ui/types';

export type HeroProductCardProps = { kind: 'stream' | 'vault' | 'grant' };

const BCH: Asset = { kind: 'bch' };

const SAMPLE_SIGNERS: ApprovalMeterProps['signers'] = [
  { name: 'Sam', address: 'bitcoincash:qr6m7j9njldwwzlg9v7v53unlr4jkmx6eylep8ekg2', approved: true },
  { name: 'Maya', address: 'bitcoincash:qp3wjpa3tjlj042z2wv7hahsldgwhwy0rq9sywjpyy', approved: false },
  { name: 'Ade', address: 'bitcoincash:qz2708636snqhsxu8wnlka78h6fdp77ar59jrf5035', approved: false },
];

type Sample = {
  title: string;
  status: StatusKey;
  amountLabel: string;
  amount: string;
  picture: React.ReactNode;
  events: { text: string; when: string }[];
};

const SAMPLES: Record<HeroProductCardProps['kind'], Sample> = {
  stream: {
    title: 'Stream to Sam',
    status: 'active',
    amountLabel: 'Total',
    amount: '4.20',
    picture: <ReleaseBar asset={BCH} claimed="0.70" ready="0.70" later="2.80" />,
    events: [
      { text: '4.20 BCH locked in a contract', when: 'Oct 1' },
      { text: 'Sam claimed 0.70 BCH', when: 'Nov 1' },
    ],
  },
  vault: {
    title: 'Team fund',
    status: 'waitingForApproval',
    amountLabel: 'In the vault',
    amount: '12.50',
    picture: <ApprovalMeter required={2} signers={SAMPLE_SIGNERS} />,
    events: [
      { text: 'Maya asked to send 1.50 BCH to Ade', when: 'Oct 28' },
      { text: 'Sam approved', when: 'Oct 29' },
    ],
  },
  grant: {
    title: 'Grant to Ade',
    status: 'active',
    amountLabel: 'Total',
    amount: '12.00',
    picture: <ProgressMeter label="1 of 3 milestones paid" value={1} max={3} />,
    events: [
      { text: '12.00 BCH locked in a contract', when: 'Sep 15' },
      { text: 'Maya released 4.00 BCH to Ade', when: 'Oct 20' },
    ],
  },
};

export function HeroProductCard({ kind }: HeroProductCardProps) {
  const sample = SAMPLES[kind];

  return (
    <figure className="flex flex-col gap-6 rounded-panel bg-surface p-6 shadow-overlay">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Heading level="item" as="h2">
            {sample.title}
          </Heading>
          <p className="text-small text-ink-muted">{sample.amountLabel}</p>
          <Amount value={sample.amount} asset={BCH} size="lg" />
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <StatusPill status="sample" size="sm" />
          <StatusPill status={sample.status} size="sm" />
        </div>
      </div>
      {sample.picture}
      <ol className="flex flex-col border-t border-line">
        {sample.events.map((event) => (
          <li key={event.text} className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-b-0">
            <span className="text-small text-ink-secondary">{event.text}</span>
            <span className="shrink-0 text-caption text-ink-muted">{event.when}</span>
          </li>
        ))}
      </ol>
      <figcaption className="sr-only">Sample people and amounts</figcaption>
    </figure>
  );
}
