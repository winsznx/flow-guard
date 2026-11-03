import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MarketingFooter } from '../components/layout/Footer';
import { MarketingNav } from '../components/layout/MarketingNav';
import { PageContainer } from '../components/layout/PageContainer';
import { PageMeta } from '../components/seo/PageMeta';
import { Button } from '../components/ui/Button';
import { Code } from '../components/ui/Code';
import { Heading } from '../components/ui/Heading';
import { Activity, House, LifeBuoy, Search, type LucideIcon } from '../components/ui/Icon';
import { LinkCard } from '../components/ui/LinkCard';
import { SearchInput } from '../components/ui/SearchInput';
import { NOT_FOUND, NOT_FOUND_LINKS } from '../copy/help';
import { APP_UTILITY } from '../copy/nav';
import { isExplorerHost, MAIN_SITE_URL } from '../utils/publicUrls';

const LINK_ICONS: Record<string, LucideIcon> = {
  '/': House,
  '/help': LifeBuoy,
  '/explorer': APP_UTILITY.find((item) => item.key === 'explorer')?.icon ?? Search,
  '/status': Activity,
};

function explorerSearchPath(query: string): string {
  const base = isExplorerHost() ? '/' : '/explorer';
  return `${base}?q=${encodeURIComponent(query)}`;
}

export default function NotFoundPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const onExplorerHost = isExplorerHost();

  const search = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) navigate(explorerSearchPath(trimmed));
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PageMeta title={NOT_FOUND.title} description={NOT_FOUND.description} path="/404" noindex />
      <MarketingNav />
      <main className="min-w-0 flex-1">
        <PageContainer width="narrow" className="flex flex-col gap-8 pt-16 lg:pt-24">
          <header className="flex flex-col gap-3">
            <Heading level="page" as="h1">
              {NOT_FOUND.title}
            </Heading>
            <p className="text-body text-ink-secondary">{NOT_FOUND.description}</p>
            {pathname !== '/' ? (
              <p className="text-small text-ink-muted">
                {`${NOT_FOUND.triedLabel} `}
                <Code>{pathname}</Code>
              </p>
            ) : null}
          </header>

          <section aria-labelledby="not-found-search" className="flex flex-col gap-3">
            <Heading level="item" as="h2" id="not-found-search">
              {NOT_FOUND.searchTitle}
            </Heading>
            <div className="flex flex-col gap-3 sm:flex-row">
              <SearchInput
                label={NOT_FOUND.searchLabel}
                placeholder={NOT_FOUND.searchPlaceholder}
                value={query}
                onChange={setQuery}
                onSubmit={search}
                className="flex-1"
              />
              <Button variant="secondary" onClick={() => search(query)}>
                {NOT_FOUND.searchButton}
              </Button>
            </div>
          </section>

          <section aria-labelledby="not-found-pages" className="flex flex-col gap-3">
            <Heading level="item" as="h2" id="not-found-pages">
              {NOT_FOUND.pagesLabel}
            </Heading>
            <ul className="flex flex-col gap-3">
              {NOT_FOUND_LINKS.map((link) => (
                <li key={link.to} className="flex">
                  {onExplorerHost && link.to === '/' ? (
                    <LinkCard
                      href={MAIN_SITE_URL}
                      external
                      icon={LINK_ICONS[link.to]}
                      title={link.title}
                      description={link.description}
                      className="flex-1"
                    />
                  ) : (
                    <LinkCard
                      to={link.to}
                      icon={LINK_ICONS[link.to]}
                      title={link.title}
                      description={link.description}
                      className="flex-1"
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        </PageContainer>
      </main>
      <MarketingFooter />
    </div>
  );
}
