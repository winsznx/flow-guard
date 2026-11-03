import { MarketingFooter } from '../layout/Footer';
import { MarketingNav } from '../layout/MarketingNav';
import { LegalPage, type LegalPageProps } from '../marketing/LegalPage';
import { LEGAL_PAGES, type LegalPageKey } from '../../copy/legal';

export type LegalSection = LegalPageProps['sections'][number];

export type LegalPageLayoutProps = {
  page: LegalPageKey;
  sections: LegalSection[];
};

export function LegalPageLayout({ page, sections }: LegalPageLayoutProps) {
  const copy = LEGAL_PAGES[page];

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <MarketingNav />
      <div className="min-w-0 flex-1">
        <LegalPage
          title={copy.title}
          description={copy.description}
          updated={copy.updated}
          summary={copy.summary}
          sections={sections}
        />
      </div>
      <MarketingFooter />
    </div>
  );
}
