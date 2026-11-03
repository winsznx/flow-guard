import { MarketingSection } from '../layout/MarketingSection';
import { ApprovalMeter, type ApprovalMeterProps } from '../ui/ApprovalMeter';
import { Card } from '../ui/Card';
import { DetailList } from '../ui/DetailList';
import { Display } from '../ui/Display';
import { Heading } from '../ui/Heading';
import { MilestoneList, type MilestoneListProps } from '../ui/MilestoneList';
import { Panel } from '../ui/Panel';
import { PlanSentence, type PlanSentenceProps } from '../ui/PlanSentence';
import { ScheduleTimeline, type ScheduleTimelineProps } from '../ui/ScheduleTimeline';
import { ClosingBand, type ClosingBandProps } from './ClosingBand';
import { FactsCard, type FactsCardProps } from './FactsCard';
import { MarketingHero, type MarketingHeroProps } from './MarketingHero';
import { NumberedFaq, type NumberedFaqProps } from './NumberedFaq';
import { LABELS } from '../../copy/common';

export type SolutionVisual =
  | { kind: 'timeline'; timeline: ScheduleTimelineProps }
  | { kind: 'approvals'; meter: ApprovalMeterProps }
  | { kind: 'milestones'; list: MilestoneListProps };

type SolutionStep = { title: string; body: string };

export type SolutionCopy = {
  hero: Pick<MarketingHeroProps, 'headline' | 'accent' | 'lead' | 'primary' | 'secondary' | 'note'> & {
    eyebrow: string;
    visual?: SolutionVisual;
  };
  steps: [SolutionStep, SolutionStep, SolutionStep];
  example?: { plan: PlanSentenceProps; timeline?: ScheduleTimelineProps };
  decide: { label: string; value: string }[];
  facts: Omit<FactsCardProps, 'className'>;
  goodToKnow: string[];
  faq: NumberedFaqProps['items'];
  closing: Omit<ClosingBandProps, 'className'>;
};

export type SolutionPageProps = { copy: SolutionCopy };

const SOLUTION_EXAMPLE_ID = 'example';

const HEADINGS = {
  steps: 'How it works here',
  example: 'Example',
  decide: 'What you decide',
  goodToKnow: 'Good to know',
  faq: 'Questions',
} as const;

function SolutionVisualView({ visual }: { visual: SolutionVisual }) {
  switch (visual.kind) {
    case 'timeline':
      return <ScheduleTimeline {...visual.timeline} />;
    case 'approvals':
      return <ApprovalMeter {...visual.meter} />;
    case 'milestones':
      return <MilestoneList {...visual.list} />;
  }
}

function stepNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

export function SolutionPage({ copy }: SolutionPageProps) {
  const { hero, steps, example, decide, facts, goodToKnow, faq, closing } = copy;

  return (
    <main className="min-w-0">
      <MarketingHero
        eyebrow={hero.eyebrow}
        headline={hero.headline}
        accent={hero.accent}
        lead={hero.lead}
        primary={hero.primary}
        secondary={hero.secondary}
        note={hero.note}
        size="headline"
        visual={
          hero.visual ? (
            <Panel>
              <SolutionVisualView visual={hero.visual} />
            </Panel>
          ) : undefined
        }
      />

      <MarketingSection labelledBy="solution-steps">
        <div className="flex flex-col gap-8">
          <Display size="headline" as="h2" id="solution-steps">
            {HEADINGS.steps}
          </Display>
          <ol className="grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <Card key={step.title} as="li">
                <div className="flex flex-col gap-2">
                  <span className="text-label text-ink-muted">{stepNumber(index)}</span>
                  <Heading level="item">{step.title}</Heading>
                  <p className="text-small text-ink-secondary">{step.body}</p>
                </div>
              </Card>
            ))}
          </ol>
        </div>
      </MarketingSection>

      {example ? (
        <MarketingSection id={SOLUTION_EXAMPLE_ID} labelledBy="solution-example" tone="surface">
          <div className="flex max-w-reading flex-col gap-6">
            <Display size="headline" as="h2" id="solution-example">
              {HEADINGS.example}
            </Display>
            <PlanSentence {...example.plan} />
            {example.timeline ? <ScheduleTimeline {...example.timeline} variant="preview" /> : null}
          </div>
        </MarketingSection>
      ) : null}

      <MarketingSection labelledBy="solution-decide">
        <div className="grid gap-12 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-6">
            <Display size="headline" as="h2" id="solution-decide">
              {HEADINGS.decide}
            </Display>
            <Card>
              <DetailList items={decide} />
            </Card>
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <Display size="headline" as="h2">
              {LABELS.whoCanMoveTheMoney}
            </Display>
            <FactsCard {...facts} />
          </div>
        </div>
      </MarketingSection>

      <MarketingSection labelledBy="solution-limits">
        <div className="flex max-w-reading flex-col gap-6">
          <Display size="headline" as="h2" id="solution-limits">
            {HEADINGS.goodToKnow}
          </Display>
          <ul className="flex list-disc flex-col gap-3 pl-5 text-body text-ink-secondary">
            {goodToKnow.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </MarketingSection>

      <MarketingSection labelledBy="solution-faq">
        <div className="flex max-w-reading flex-col gap-6">
          <Display size="headline" as="h2" id="solution-faq">
            {HEADINGS.faq}
          </Display>
          <NumberedFaq items={faq} />
        </div>
      </MarketingSection>

      <ClosingBand {...closing} />
    </main>
  );
}
