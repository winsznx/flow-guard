import { MarketingFooter } from '../components/layout/Footer';
import { MarketingNav } from '../components/layout/MarketingNav';
import { PageMeta } from '../components/seo/PageMeta';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { Display } from '../components/ui/Display';
import { Heading } from '../components/ui/Heading';
import { Panel } from '../components/ui/Panel';
import { StatusPill } from '../components/ui/StatusPill';
import type { Tone } from '../components/ui/types';
import { formatMilestoneDate, ROADMAP_GROUPS, ROADMAP_PAGE, type RoadmapGroupKey } from '../copy/updates';

const GROUP_TONE: Record<RoadmapGroupKey, Tone> = { shipped: 'success', working: 'info', planned: 'neutral' };

export default function RoadmapPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PageMeta title={ROADMAP_PAGE.title} description={ROADMAP_PAGE.description} path="/roadmap" />
      <MarketingNav />
      <main className="min-w-0 flex-1">
        <div className="mx-auto flex w-full min-w-0 max-w-page flex-col gap-12 px-4 pt-12 pb-16 sm:px-6 lg:px-8 lg:pt-16 lg:pb-24">
          <header className="flex max-w-reading flex-col gap-3">
            <Display size="headline" as="h1">
              {ROADMAP_PAGE.title}
            </Display>
            <p className="text-body-lg text-ink-secondary">{ROADMAP_PAGE.description}</p>
            <p className="text-body text-ink-secondary">
              {`${ROADMAP_PAGE.now} `}
              <ButtonLink variant="link" to="/changelog">
                {ROADMAP_PAGE.changelogLink}
              </ButtonLink>
            </p>
          </header>

          <div className="grid gap-10 lg:grid-cols-3 lg:gap-6">
            {ROADMAP_GROUPS.map((group) => (
              <section key={group.key} aria-labelledby={`roadmap-${group.key}`} className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <Heading level="section" as="h2" id={`roadmap-${group.key}`}>
                    {group.label}
                  </Heading>
                  <p className="text-small text-ink-secondary">{group.line}</p>
                </div>
                <ul className="flex flex-col gap-3">
                  {group.items.map((item) => (
                    <Card key={item.title} as="li">
                      <div className="flex flex-col items-start gap-1">
                        <StatusPill label={group.label} tone={GROUP_TONE[group.key]} size="sm" />
                        <Heading level="item" as="h3">
                          {item.title}
                        </Heading>
                        <p className="text-small text-ink-secondary">{item.description}</p>
                        {item.date ? (
                          <time dateTime={item.date} className="text-small text-ink-muted">
                            {formatMilestoneDate(item.date)}
                          </time>
                        ) : null}
                      </div>
                    </Card>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <Panel title={ROADMAP_PAGE.ideaTitle} description={ROADMAP_PAGE.ideaLine}>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <ButtonLink variant="primary" href={ROADMAP_PAGE.telegramHref} external>
                {ROADMAP_PAGE.telegram}
              </ButtonLink>
              <ButtonLink variant="secondary" href={ROADMAP_PAGE.githubHref} external>
                {ROADMAP_PAGE.github}
              </ButtonLink>
              <ButtonLink variant="ghost" to="/updates">
                {ROADMAP_PAGE.updates}
              </ButtonLink>
            </div>
          </Panel>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
