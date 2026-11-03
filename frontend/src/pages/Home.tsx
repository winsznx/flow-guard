import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ClosingBand } from '../components/marketing/ClosingBand';
import { FactStrip } from '../components/marketing/FactStrip';
import { FactsCard } from '../components/marketing/FactsCard';
import { FeatureModule } from '../components/marketing/FeatureModule';
import { HeroProductCard } from '../components/marketing/HeroProductCard';
import { MarketingHero } from '../components/marketing/MarketingHero';
import { NumberedFaq } from '../components/marketing/NumberedFaq';
import { MarketingFooter } from '../components/layout/Footer';
import { MarketingNav } from '../components/layout/MarketingNav';
import { MarketingSection } from '../components/layout/MarketingSection';
import { ApprovalMeter, type ApprovalMeterProps } from '../components/ui/ApprovalMeter';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { Display } from '../components/ui/Display';
import { Eyebrow } from '../components/ui/Eyebrow';
import { Heading } from '../components/ui/Heading';
import { MilestoneList, type MilestoneListProps } from '../components/ui/MilestoneList';
import { ScheduleTimeline, type ScheduleTimelineProps } from '../components/ui/ScheduleTimeline';
import { StatusPill } from '../components/ui/StatusPill';
import type { Asset } from '../components/ui/types';
import {
  HOME_CLOSING,
  HOME_FACTS,
  HOME_HERO,
  HOME_QUESTIONS,
  HOW_IT_WORKS,
  SAMPLE_CAPTION,
  WHAT_IT_COSTS,
  WHAT_YOU_CAN_DO,
  WHO_CAN_MOVE,
} from '../copy/marketingHome';

const LEGACY_SECURITY_HASH = '#security';
const SECURITY_PATH = '/security';
const HOME_PREVIEW_IMAGE = '/images/og-home.png';

const BCH: Asset = { kind: 'bch' };
const DAY_MS = 24 * 60 * 60 * 1000;
const SAMPLE_NOW = Date.now();

const SAMPLE_TIMELINE: ScheduleTimelineProps = {
  asset: BCH,
  now: SAMPLE_NOW,
  blocks: [-60, -30, -1, 29, 59, 89].map((days, index) => ({
    at: SAMPLE_NOW + days * DAY_MS,
    amount: '2.00',
    state: index < 2 ? 'claimed' : index === 2 ? 'ready' : 'later',
  })),
};

const SAMPLE_SIGNERS: ApprovalMeterProps['signers'] = [
  { name: 'Sam', address: 'bitcoincash:qr6m7j9njldwwzlg9v7v53unlr4jkmx6eylep8ekg2', approved: true },
  { name: 'Maya', address: 'bitcoincash:qp3wjpa3tjlj042z2wv7hahsldgwhwy0rq9sywjpyy', approved: false },
  { name: 'Ade', address: 'bitcoincash:qz2708636snqhsxu8wnlka78h6fdp77ar59jrf5035', approved: false },
];

const SAMPLE_MILESTONES: MilestoneListProps['milestones'] = [
  { id: 'draft', title: 'Write the first draft', amount: '4.00', status: 'released' },
  { id: 'review', title: 'Review with the community', amount: '4.00', status: 'pending' },
  { id: 'publish', title: 'Publish the guide', amount: '4.00', status: 'pending' },
];

const GROUP_VISUALS: Record<(typeof WHAT_YOU_CAN_DO.groups)[number]['id'], React.ReactNode> = {
  'pay-people': <ScheduleTimeline {...SAMPLE_TIMELINE} />,
  'shared-funds': <ApprovalMeter required={2} signers={SAMPLE_SIGNERS} />,
  'send-to-many': <MilestoneList asset={BCH} milestones={SAMPLE_MILESTONES} />,
};

function SampleVisual({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <figcaption className="text-small text-ink-secondary">{label}</figcaption>
        <StatusPill status="sample" size="sm" />
      </div>
      {children}
      <p className="sr-only">{SAMPLE_CAPTION}</p>
    </figure>
  );
}

function ChapterHeader({
  id,
  number,
  eyebrow,
  title,
  lead,
}: {
  id: string;
  number: string;
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="flex max-w-reading flex-col gap-4">
      <Eyebrow number={number}>{eyebrow}</Eyebrow>
      <Display size="headline" as="h2" id={id}>
        {title}
      </Display>
      {lead ? <p className="text-body-lg text-ink-secondary">{lead}</p> : null}
    </div>
  );
}

export default function Home() {
  const { hash } = useLocation();

  if (hash === LEGACY_SECURITY_HASH) return <Navigate to={SECURITY_PATH} replace />;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <MarketingNav />
      <main className="min-w-0 flex-1">
        <MarketingHero
          livePill
          headline={HOME_HERO.headline}
          accent={HOME_HERO.accent}
          lead={HOME_HERO.lead}
          primary={HOME_HERO.primary}
          secondary={HOME_HERO.secondary}
          note={
            <>
              {HOME_HERO.need}{' '}
              <ButtonLink variant="link" to={HOME_HERO.getWallet.href}>
                {HOME_HERO.getWallet.label}
              </ButtonLink>
            </>
          }
          visual={<HeroProductCard kind="stream" />}
          image={HOME_PREVIEW_IMAGE}
        />

        <div className="mx-auto w-full min-w-0 max-w-page px-4 sm:px-6 lg:px-8">
          <FactStrip facts={HOME_FACTS} />
        </div>

        {WHAT_YOU_CAN_DO.groups.map((group, index) => (
          <MarketingSection
            key={group.id}
            tone={index % 2 === 0 ? 'canvas' : 'surface'}
            labelledBy={`${group.id}-title`}
          >
            <div className="flex flex-col gap-8">
              {index === 0 ? <Eyebrow number={WHAT_YOU_CAN_DO.number}>{WHAT_YOU_CAN_DO.eyebrow}</Eyebrow> : null}
              <FeatureModule
                id={group.id}
                eyebrow={{ label: group.eyebrow }}
                title={group.title}
                body={group.body}
                action={group.action}
                facts={group.facts}
                visual={<SampleVisual label={group.visualLabel}>{GROUP_VISUALS[group.id]}</SampleVisual>}
              />
            </div>
          </MarketingSection>
        ))}

        <MarketingSection id={HOW_IT_WORKS.id} tone="surface" labelledBy={`${HOW_IT_WORKS.id}-title`}>
          <div className="flex flex-col gap-12">
            <ChapterHeader
              id={`${HOW_IT_WORKS.id}-title`}
              number={HOW_IT_WORKS.number}
              eyebrow={HOW_IT_WORKS.eyebrow}
              title={HOW_IT_WORKS.title}
            />
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {HOW_IT_WORKS.steps.map((step, index) => (
                <Card key={step.title} as="li">
                  <div className="flex flex-col gap-3">
                    <span className="text-label text-brand">{String(index + 1).padStart(2, '0')}</span>
                    <Heading level="item" as="h3">
                      {step.title}
                    </Heading>
                    <p className="text-small text-ink-secondary">{step.body}</p>
                  </div>
                </Card>
              ))}
            </ol>
          </div>
        </MarketingSection>

        <MarketingSection id={WHO_CAN_MOVE.id} labelledBy={`${WHO_CAN_MOVE.id}-title`}>
          <div className="flex flex-col gap-12">
            <ChapterHeader
              id={`${WHO_CAN_MOVE.id}-title`}
              number={WHO_CAN_MOVE.number}
              eyebrow={WHO_CAN_MOVE.eyebrow}
              title={WHO_CAN_MOVE.title}
              lead={WHO_CAN_MOVE.lead}
            />
            <div className="flex flex-col gap-6">
              {WHO_CAN_MOVE.cards.map((card) => (
                <FactsCard
                  key={card.eyebrow}
                  eyebrow={card.eyebrow}
                  rows={[
                    { label: WHO_CAN_MOVE.rowLabels.who, value: card.who },
                    { label: WHO_CAN_MOVE.rowLabels.away, value: card.away },
                    {
                      label: WHO_CAN_MOVE.rowLabels.source,
                      value: (
                        <ButtonLink variant="link" external href={card.href}>
                          {WHO_CAN_MOVE.sourceLink}
                          <span className="sr-only"> {card.sourceFor}</span>
                        </ButtonLink>
                      ),
                    },
                  ]}
                />
              ))}
            </div>
            <div>
              <ButtonLink variant="secondary" to={WHO_CAN_MOVE.more.href}>
                {WHO_CAN_MOVE.more.label}
              </ButtonLink>
            </div>
          </div>
        </MarketingSection>

        <MarketingSection id={WHAT_IT_COSTS.id} tone="surface" labelledBy={`${WHAT_IT_COSTS.id}-title`}>
          <div className="flex flex-col items-start gap-6">
            <ChapterHeader
              id={`${WHAT_IT_COSTS.id}-title`}
              number={WHAT_IT_COSTS.number}
              eyebrow={WHAT_IT_COSTS.eyebrow}
              title={WHAT_IT_COSTS.title}
              lead={WHAT_IT_COSTS.body}
            />
            <ButtonLink variant="secondary" to={WHAT_IT_COSTS.more.href}>
              {WHAT_IT_COSTS.more.label}
            </ButtonLink>
          </div>
        </MarketingSection>

        <MarketingSection id={HOME_QUESTIONS.id} labelledBy={`${HOME_QUESTIONS.id}-title`}>
          <div className="flex flex-col gap-12">
            <ChapterHeader
              id={`${HOME_QUESTIONS.id}-title`}
              number={HOME_QUESTIONS.number}
              eyebrow={HOME_QUESTIONS.eyebrow}
              title={HOME_QUESTIONS.title}
            />
            <NumberedFaq items={[...HOME_QUESTIONS.items]} />
            <div>
              <ButtonLink variant="secondary" to={HOME_QUESTIONS.more.href}>
                {HOME_QUESTIONS.more.label}
              </ButtonLink>
            </div>
          </div>
        </MarketingSection>

        <ClosingBand
          eyebrow={HOME_CLOSING.eyebrow}
          headline={HOME_CLOSING.headline}
          accent={HOME_CLOSING.accent}
          lead={HOME_CLOSING.lead}
          primary={HOME_CLOSING.primary}
          secondary={HOME_CLOSING.secondary}
          facts={HOME_CLOSING.facts}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}
