import { MarketingFooter } from '../../components/layout/Footer';
import { MarketingNav } from '../../components/layout/MarketingNav';
import { SolutionPage } from '../../components/marketing/SolutionPage';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { MARKETING_COPY, MARKETING_PATHS, type SolutionPageCopy } from '../../copy/solutions/shared';

export function SolutionRoute({ copy }: { copy: SolutionPageCopy }) {
  const { source, ...solution } = copy;
  const footer = (
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      <span className="whitespace-nowrap">
        <ButtonLink href={source} external variant="link">
          {MARKETING_COPY.contractSource}
        </ButtonLink>
      </span>
      <ButtonLink to={MARKETING_PATHS.security} variant="link">
        {MARKETING_COPY.security}
      </ButtonLink>
    </div>
  );

  return (
    <>
      <MarketingNav />
      <SolutionPage copy={{ ...solution, facts: { ...solution.facts, footer } }} />
      <MarketingFooter />
    </>
  );
}
