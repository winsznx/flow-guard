import { useState } from 'react';
import { MarketingFooter } from '../components/layout/Footer';
import { MarketingNav } from '../components/layout/MarketingNav';
import { NumberedFaq } from '../components/marketing/NumberedFaq';
import { PageMeta } from '../components/seo/PageMeta';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Display } from '../components/ui/Display';
import { Eyebrow } from '../components/ui/Eyebrow';
import { NoResults } from '../components/ui/NoResults';
import { SearchInput } from '../components/ui/SearchInput';
import { FAQ_GROUPS, FAQ_PAGE, faqResultCount, matchesQuery, type FaqItem, type HelpLink } from '../copy/help';

function AnswerLink({ link }: { link: HelpLink }) {
  if ('mailto' in link) {
    return (
      <ButtonLink variant="link" href={`mailto:${link.mailto}`}>
        {link.label}
      </ButtonLink>
    );
  }
  return 'href' in link ? (
    <ButtonLink variant="link" href={link.href} external>
      {link.label}
    </ButtonLink>
  ) : (
    <ButtonLink variant="link" to={link.to}>
      {link.label}
    </ButtonLink>
  );
}

function answerOf(item: FaqItem) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p>{item.answer}</p>
      {item.link ? <AnswerLink link={item.link} /> : null}
    </div>
  );
}

export default function FaqPage() {
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;

  const groups = FAQ_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => matchesQuery(query, item.question, item.answer, group.label)),
  })).filter((group) => group.items.length > 0);
  const resultCount = groups.reduce((total, group) => total + group.items.length, 0);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PageMeta title={FAQ_PAGE.title} description={FAQ_PAGE.description} path="/faq" />
      <MarketingNav />
      <main className="min-w-0 flex-1">
        <div className="mx-auto grid w-full min-w-0 max-w-page gap-10 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-3 lg:gap-12 lg:px-8 lg:pt-16 lg:pb-24">
          <aside className="min-w-0 lg:col-span-1">
            <div className="flex flex-col gap-6 lg:sticky lg:top-24">
              <div className="flex flex-col gap-3">
                <Display size="headline" as="h1">
                  {FAQ_PAGE.title}
                </Display>
                <p className="text-body-lg text-ink-secondary">{FAQ_PAGE.description}</p>
              </div>
              <div className="flex flex-col gap-2">
                <SearchInput
                  label={FAQ_PAGE.searchLabel}
                  placeholder={FAQ_PAGE.searchPlaceholder}
                  value={query}
                  onChange={setQuery}
                />
                <p className="text-small text-ink-muted" aria-live="polite">
                  {searching ? faqResultCount(resultCount, groups.length) : ''}
                </p>
              </div>
              <p className="text-small text-ink-secondary">
                {`${FAQ_PAGE.stillStuck} `}
                <ButtonLink variant="link" to="/help">
                  {FAQ_PAGE.getHelp}
                </ButtonLink>
              </p>
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-12 lg:col-span-2">
            {groups.length === 0 ? (
              <NoResults thing={FAQ_PAGE.noMatchThing} onClear={() => setQuery('')} />
            ) : (
              groups.map((group) => (
                <section
                  key={group.id}
                  id={group.id}
                  aria-labelledby={`${group.id}-title`}
                  className="flex scroll-mt-header flex-col gap-4"
                >
                  <Eyebrow as="h2" id={`${group.id}-title`}>
                    {group.label}
                  </Eyebrow>
                  <NumberedFaq
                    items={group.items.map((item) => ({ id: item.id, question: item.question, answer: answerOf(item) }))}
                  />
                </section>
              ))
            )}
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
