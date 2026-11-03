import { MarketingFooter } from '../components/layout/Footer';
import { MarketingNav } from '../components/layout/MarketingNav';
import { MarketingSection } from '../components/layout/MarketingSection';
import { ClosingBand } from '../components/marketing/ClosingBand';
import { FeatureModule } from '../components/marketing/FeatureModule';
import { MarketingHero } from '../components/marketing/MarketingHero';
import { ApprovalMeter } from '../components/ui/ApprovalMeter';
import { ButtonLink } from '../components/ui/ButtonLink';
import { PlanSentence } from '../components/ui/PlanSentence';
import { ScheduleTimeline } from '../components/ui/ScheduleTimeline';
import { USE_CASES, USE_CASES_CLOSING, USE_CASES_HERO, USE_CASES_JUMP_LABEL, type UseCaseVisual } from '../copy/useCases';

function UseCaseVisualView({ visual }: { visual: UseCaseVisual }) {
  switch (visual.kind) {
    case 'plan':
      return (
        <div className="flex flex-col gap-6">
          <PlanSentence {...visual.plan} />
          {visual.timeline ? <ScheduleTimeline {...visual.timeline} /> : null}
        </div>
      );
    case 'timeline':
      return <ScheduleTimeline {...visual.timeline} />;
    case 'approvals':
      return <ApprovalMeter {...visual.meter} />;
  }
}

export default function UseCasesPage() {

  return (
    <>
      <MarketingNav />
      <main className="min-w-0">
        <MarketingHero
          headline={USE_CASES_HERO.headline}
          lead={USE_CASES_HERO.lead}
          primary={USE_CASES_HERO.primary}
          secondary={USE_CASES_HERO.secondary}
          note={USE_CASES_HERO.note}
          size="headline"
        />

        <nav aria-label={USE_CASES_JUMP_LABEL} className="border-y border-line bg-surface">
          <ul className="mx-auto flex w-full min-w-0 max-w-page flex-col gap-3 px-4 py-4 sm:flex-row sm:flex-wrap sm:gap-x-8 sm:px-6 lg:px-8">
            {USE_CASES.map((useCase) => (
              <li key={useCase.id}>
                <ButtonLink to={`#${useCase.id}`} variant="link">
                  {useCase.title}
                </ButtonLink>
              </li>
            ))}
          </ul>
        </nav>

        {USE_CASES.map((useCase, index) => (
          <MarketingSection key={useCase.id} tone={index % 2 === 0 ? 'canvas' : 'surface'}>
            <FeatureModule
              id={useCase.id}
              eyebrow={useCase.eyebrow}
              title={useCase.title}
              body={useCase.body}
              action={useCase.action}
              facts={useCase.facts}
              visual={<UseCaseVisualView visual={useCase.visual} />}
            />
          </MarketingSection>
        ))}

        <div className="pt-16 lg:pt-24">
          <ClosingBand {...USE_CASES_CLOSING} />
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}
