import { useEffect, useState } from 'react';
import { MarketingFooter } from '../components/layout/Footer';
import { MarketingNav } from '../components/layout/MarketingNav';
import { MarketingSection } from '../components/layout/MarketingSection';
import { PageMeta } from '../components/seo/PageMeta';
import { Accordion } from '../components/ui/Accordion';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Display } from '../components/ui/Display';
import { Heading } from '../components/ui/Heading';
import { Repeat, Users, Vault, Wallet, type LucideIcon } from '../components/ui/Icon';
import { LinkCard } from '../components/ui/LinkCard';
import { NoResults } from '../components/ui/NoResults';
import { Panel } from '../components/ui/Panel';
import { SearchInput } from '../components/ui/SearchInput';
import { Skeleton } from '../components/ui/Skeleton';
import { StatusPill } from '../components/ui/StatusPill';
import {
  CONTACT_CHANNELS,
  FAQ_GROUPS,
  HELP_PAGE,
  HELP_PROBLEMS,
  HELP_TOPICS,
  matchesQuery,
  type HelpLink,
  type HelpProblem,
} from '../copy/help';
import { serviceStatus, type StatusKey } from '../copy/status';

const STATUS_URL = '/api/status';
const STATUS_PATH = '/status';

const TOPIC_ICONS: readonly LucideIcon[] = [Wallet, Repeat, Vault, Users];

type ServiceState = { kind: 'loading' } | { kind: 'loaded'; status: StatusKey } | { kind: 'unavailable' };

function useOverallStatus(): ServiceState {
  const [state, setState] = useState<ServiceState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch(STATUS_URL, { headers: { Accept: 'application/json' }, signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ overall?: string }>) : null))
      .then((payload) =>
        setState(
          payload?.overall ? { kind: 'loaded', status: serviceStatus(payload.overall) } : { kind: 'unavailable' }
        )
      )
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'unavailable' });
      });
    return () => controller.abort();
  }, []);

  return state;
}

function HelpLinkButton({ link }: { link: HelpLink }) {
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

function ProblemBody({ problem }: { problem: HelpProblem }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-label text-ink">{HELP_PAGE.causesLabel}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {problem.causes.map((cause) => (
            <li key={cause}>{cause}</li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-label text-ink">{HELP_PAGE.fixesLabel}</p>
        <ol className="flex list-decimal flex-col gap-1 pl-5">
          {problem.fixes.map((fix) => (
            <li key={fix}>{fix}</li>
          ))}
        </ol>
      </div>
      {problem.link ? <HelpLinkButton link={problem.link} /> : null}
    </div>
  );
}

function StatusLine({ state }: { state: ServiceState }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-small text-ink-secondary">{HELP_PAGE.statusTitle}</span>
      {state.kind === 'loading' ? (
        <Skeleton kind="pill" />
      ) : state.kind === 'loaded' ? (
        <StatusPill status={state.status} />
      ) : (
        <span className="text-small text-ink-muted">{HELP_PAGE.statusUnavailable}</span>
      )}
      <ButtonLink variant="link" to={STATUS_PATH}>
        {HELP_PAGE.statusLink}
      </ButtonLink>
    </div>
  );
}

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const status = useOverallStatus();
  const searching = query.trim().length > 0;

  const questions = searching
    ? FAQ_GROUPS.flatMap((group) => group.items).filter((item) => matchesQuery(query, item.question, item.answer))
    : [];
  const problems = HELP_PROBLEMS.filter((problem) =>
    matchesQuery(query, problem.title, ...problem.causes, ...problem.fixes)
  );
  const nothingMatches = searching && questions.length === 0 && problems.length === 0;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PageMeta title={HELP_PAGE.title} description={HELP_PAGE.description} path="/help" />
      <MarketingNav />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full min-w-0 max-w-page px-4 pt-12 pb-12 sm:px-6 lg:px-8 lg:pt-16">
          <div className="flex max-w-reading flex-col gap-6">
            <div className="flex flex-col gap-3">
              <Display size="headline" as="h1">
                {HELP_PAGE.title}
              </Display>
              <p className="text-body-lg text-ink-secondary">{HELP_PAGE.description}</p>
            </div>
            <SearchInput
              label={HELP_PAGE.searchLabel}
              placeholder={HELP_PAGE.searchPlaceholder}
              value={query}
              onChange={setQuery}
            />
            <StatusLine state={status} />
          </div>
        </div>

        {nothingMatches ? (
          <div className="mx-auto w-full min-w-0 max-w-page px-4 pb-16 sm:px-6 lg:px-8">
            <NoResults thing={HELP_PAGE.noMatchThing} onClear={() => setQuery('')} />
          </div>
        ) : (
          <>
            {searching && questions.length === 0 ? null : (
              <section
                aria-labelledby="help-start"
                className="mx-auto w-full min-w-0 max-w-page px-4 pb-16 sm:px-6 lg:px-8"
              >
                <div className="flex flex-col gap-4">
                  <Heading level="section" as="h2" id="help-start">
                    {searching ? HELP_PAGE.resultsTitle : HELP_PAGE.topicsTitle}
                  </Heading>
                  {searching ? (
                    <ul className="grid gap-3 md:grid-cols-2">
                      {questions.map((item) => (
                        <li key={item.id} className="flex">
                          <LinkCard
                            to={`/faq#${item.id}`}
                            title={item.question}
                            description={item.answer}
                            meta={HELP_PAGE.questionLabel}
                            className="flex-1"
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {HELP_TOPICS.map((topic, index) => (
                        <li key={topic.to} className="flex">
                          <LinkCard
                            to={topic.to}
                            icon={TOPIC_ICONS[index]}
                            title={topic.title}
                            description={topic.description}
                            className="flex-1"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {problems.length > 0 ? (
              <MarketingSection id="problems" tone="surface" labelledBy="help-problems" className="lg:py-16">
                <div className="flex max-w-reading flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Heading level="section" as="h2" id="help-problems">
                      {HELP_PAGE.problemsTitle}
                    </Heading>
                    <p className="text-body text-ink-secondary">{HELP_PAGE.problemsLine}</p>
                  </div>
                  <Accordion
                    items={problems.map((problem) => ({
                      id: problem.id,
                      title: problem.title,
                      content: <ProblemBody problem={problem} />,
                    }))}
                  />
                </div>
              </MarketingSection>
            ) : null}
          </>
        )}

        <section
          aria-labelledby="help-contact"
          className="mx-auto w-full min-w-0 max-w-page px-4 py-16 sm:px-6 lg:px-8"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Heading level="section" as="h2" id="help-contact">
                {HELP_PAGE.contactTitle}
              </Heading>
              <p className="text-body text-ink-secondary">{HELP_PAGE.contactLine}</p>
            </div>
            <Panel padding="none">
              <ul className="flex flex-col divide-y divide-line">
                {CONTACT_CHANNELS.map((channel) => (
                  <li
                    key={channel.title}
                    className="flex flex-col gap-3 p-4 sm:p-6 md:flex-row md:items-start md:gap-6"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-small text-ink-muted">{channel.need}</p>
                      <Heading level="item" as="h3">
                        {channel.title}
                      </Heading>
                      <p className="text-small text-ink-secondary">{channel.description}</p>
                    </div>
                    <div className="flex min-w-0 flex-col items-start gap-1 md:w-popover md:shrink-0">
                      <HelpLinkButton link={channel.link} />
                      <p className="text-small text-ink-muted">{channel.reply}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
