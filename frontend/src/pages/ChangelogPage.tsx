import { useState } from 'react';
import { MarketingFooter } from '../components/layout/Footer';
import { MarketingNav } from '../components/layout/MarketingNav';
import { PageContainer } from '../components/layout/PageContainer';
import { PageMeta } from '../components/seo/PageMeta';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Display } from '../components/ui/Display';
import { Heading } from '../components/ui/Heading';
import { NoResults } from '../components/ui/NoResults';
import { Notice } from '../components/ui/Notice';
import { Panel } from '../components/ui/Panel';
import { SearchInput } from '../components/ui/SearchInput';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { StatusPill } from '../components/ui/StatusPill';
import type { Tone } from '../components/ui/types';
import { formatDate } from '../copy/format';
import { matchesQuery } from '../copy/help';
import { CHANGE_LABELS, CHANGELOG_PAGE, RELEASES, type ChangeKind, type Release } from '../copy/updates';

type KindFilter = ChangeKind | 'all';

const KINDS: readonly ChangeKind[] = ['added', 'changed', 'fixed'];
const CHANGE_TONE: Record<ChangeKind, Tone> = { added: 'success', changed: 'info', fixed: 'neutral' };

const FILTER_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: CHANGELOG_PAGE.all },
  ...KINDS.map((kind) => ({ value: kind, label: CHANGE_LABELS[kind] })),
];

type VisibleRelease = Release & { groups: { kind: ChangeKind; items: readonly string[] }[] };

function visibleReleases(query: string, filter: KindFilter): VisibleRelease[] {
  return RELEASES.map((release) => ({
    ...release,
    groups: KINDS.filter((kind) => filter === 'all' || filter === kind)
      .map((kind) => ({
        kind,
        items: (release.changes[kind] ?? []).filter((item) => matchesQuery(query, item, release.title)),
      }))
      .filter((group) => group.items.length > 0),
  })).filter((release) => release.groups.length > 0);
}

export default function ChangelogPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<KindFilter>('all');
  const releases = visibleReleases(query, filter);

  const clear = () => {
    setQuery('');
    setFilter('all');
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PageMeta title={CHANGELOG_PAGE.title} description={CHANGELOG_PAGE.description} path="/changelog" />
      <MarketingNav />
      <main className="min-w-0 flex-1">
        <PageContainer width="reading" className="flex flex-col gap-8 pt-12 lg:pt-16">
          <header className="flex flex-col gap-3">
            <Display size="headline" as="h1">
              {CHANGELOG_PAGE.title}
            </Display>
            <p className="text-body-lg text-ink-secondary">{CHANGELOG_PAGE.description}</p>
          </header>

          <div className="flex flex-col gap-3">
            <SearchInput
              label={CHANGELOG_PAGE.searchLabel}
              placeholder={CHANGELOG_PAGE.searchPlaceholder}
              value={query}
              onChange={setQuery}
            />
            <SegmentedControl label={CHANGELOG_PAGE.filterLabel} options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
          </div>

          {releases.length === 0 ? (
            <NoResults thing={CHANGELOG_PAGE.noMatchThing} onClear={clear} />
          ) : (
            <ol className="flex flex-col gap-6">
              {releases.map((release) => (
                <li key={release.version}>
                  <Panel>
                    <article aria-labelledby={`release-${release.version}`} className="flex flex-col gap-6">
                      <header className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <span className="text-label text-ink">{release.version}</span>
                          <time dateTime={release.date} className="text-small text-ink-muted">
                            {formatDate(release.date)}
                          </time>
                          <StatusPill status={release.network === 'main' ? 'networkMain' : 'networkTest'} size="sm" />
                        </div>
                        <Heading level="section" as="h2" id={`release-${release.version}`}>
                          {release.title}
                        </Heading>
                      </header>
                      {release.groups.map((group) => (
                        <section key={group.kind} className="flex flex-col gap-2">
                          <h3 className="flex">
                            <StatusPill label={CHANGE_LABELS[group.kind]} tone={CHANGE_TONE[group.kind]} size="sm" />
                          </h3>
                          <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-ink-secondary">
                            {group.items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </section>
                      ))}
                      {release.note ? (
                        <Notice tone="info" title={CHANGELOG_PAGE.noteTitle}>
                          {release.note}
                        </Notice>
                      ) : null}
                    </article>
                  </Panel>
                </li>
              ))}
            </ol>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink variant="secondary" href={CHANGELOG_PAGE.githubHref} external>
              {CHANGELOG_PAGE.githubLabel}
            </ButtonLink>
            <ButtonLink variant="secondary" href={CHANGELOG_PAGE.docsHref} external>
              {CHANGELOG_PAGE.docsLabel}
            </ButtonLink>
          </div>
        </PageContainer>
      </main>
      <MarketingFooter />
    </div>
  );
}
