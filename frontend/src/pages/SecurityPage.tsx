import React from 'react';
import { MarketingFooter } from '../components/layout/Footer';
import { MarketingNav } from '../components/layout/MarketingNav';
import { MarketingSection } from '../components/layout/MarketingSection';
import { FactsCard } from '../components/marketing/FactsCard';
import { PageMeta } from '../components/seo/PageMeta';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { Display } from '../components/ui/Display';
import { Heading } from '../components/ui/Heading';
import { Check, Icon } from '../components/ui/Icon';
import { Panel } from '../components/ui/Panel';
import {
  CHECKED_FACTS,
  CONTRACTS,
  DISCLOSURE_STEPS,
  NOT_COVERED,
  PLAIN_ANSWERS,
  PRODUCT_FACTS,
  REPORT_OPTIONS,
  REVIEW_COVERED,
  SAFE_HARBOR,
  SECURITY_PAGE,
  SECURITY_TIMELINE,
} from '../copy/security';
import { formatMilestoneDate } from '../copy/updates';

function SectionHeader({ id, title, line }: { id: string; title: string; line?: string }) {
  return (
    <div className="flex max-w-reading flex-col gap-2">
      <Heading level="section" as="h2" id={id}>
        {title}
      </Heading>
      {line ? <p className="text-body text-ink-secondary">{line}</p> : null}
    </div>
  );
}

function SubHeader({ id, title, line }: { id: string; title: string; line?: string }) {
  return (
    <div className="flex max-w-reading flex-col gap-1">
      <Heading level="item" as="h3" id={id}>
        {title}
      </Heading>
      {line ? <p className="text-small text-ink-secondary">{line}</p> : null}
    </div>
  );
}

function PlainList({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-ink-secondary">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function CuriousBlock({ id, title, line, children }: { id: string; title: string; line?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <SubHeader id={id} title={title} line={line} />
      {children}
    </section>
  );
}

export default function SecurityPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PageMeta title={SECURITY_PAGE.title} description={SECURITY_PAGE.description} path="/security" />
      <MarketingNav />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full min-w-0 max-w-page px-4 pt-12 pb-16 sm:px-6 lg:px-8 lg:pt-16">
          <div className="flex flex-col gap-10">
            <div className="flex max-w-reading flex-col gap-3">
              <Display size="headline" as="h1">
                {SECURITY_PAGE.title}
              </Display>
              <p className="text-body-lg text-ink-secondary">{SECURITY_PAGE.description}</p>
            </div>
            <Panel title={SECURITY_PAGE.plainTitle} className="max-w-reading">
              <ul className="flex flex-col gap-3">
                {PLAIN_ANSWERS.map((answer) => (
                  <li key={answer} className="flex gap-3 text-body text-ink">
                    <span className="mt-1 inline-flex shrink-0 text-brand">
                      <Icon icon={Check} size={16} />
                    </span>
                    {answer}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>

        <MarketingSection id="who-can-move" tone="surface" labelledBy="who-can-move-title">
          <div className="flex flex-col gap-8">
            <SectionHeader id="who-can-move-title" title={SECURITY_PAGE.whoTitle} line={SECURITY_PAGE.whoLine} />
            <div className="flex flex-col gap-6">
              {PRODUCT_FACTS.map((product) => (
                <FactsCard
                  key={product.id}
                  eyebrow={product.label}
                  rows={[
                    { label: SECURITY_PAGE.rowWho, value: product.who },
                    { label: SECURITY_PAGE.rowGoesAway, value: product.goesAway },
                    {
                      label: SECURITY_PAGE.rowSource,
                      value: (
                        <ButtonLink variant="link" href={product.source.href} external>
                          {product.source.label}
                        </ButtonLink>
                      ),
                    },
                  ]}
                />
              ))}
            </div>
          </div>
        </MarketingSection>

        <MarketingSection id="how-checked" labelledBy="how-checked-title">
          <div className="flex flex-col gap-8">
            <SectionHeader id="how-checked-title" title={SECURITY_PAGE.checkedTitle} line={SECURITY_PAGE.checkedLine} />
            <ul className="grid gap-4 md:grid-cols-3">
              {CHECKED_FACTS.map((fact) => (
                <Card key={fact.title} as="li">
                  <div className="flex flex-col gap-2">
                    <Heading level="item" as="h3">
                      {fact.title}
                    </Heading>
                    <p className="text-small text-ink-secondary">{fact.body}</p>
                  </div>
                </Card>
              ))}
            </ul>
          </div>
        </MarketingSection>

        <MarketingSection id="for-the-curious" tone="surface" labelledBy="curious-title">
          <div className="flex flex-col gap-12">
            <SectionHeader id="curious-title" title={SECURITY_PAGE.curiousTitle} line={SECURITY_PAGE.curiousLine} />

            <CuriousBlock id="contracts-title" title={SECURITY_PAGE.contractsTitle} line={SECURITY_PAGE.contractsLine}>
              <Panel padding="none">
                <ul className="flex flex-col divide-y divide-line">
                  {CONTRACTS.map((contract) => (
                    <li key={contract.name} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <p className="text-label text-ink">{contract.name}</p>
                        <p className="text-small text-ink-secondary">{contract.description}</p>
                      </div>
                      <ButtonLink variant="link" href={contract.href} external className="inline-flex shrink-0 items-center gap-1">
                        {SECURITY_PAGE.viewSource}
                      </ButtonLink>
                    </li>
                  ))}
                </ul>
              </Panel>
            </CuriousBlock>

            <div className="grid gap-8 lg:grid-cols-2">
              <CuriousBlock id="covered-title" title={SECURITY_PAGE.coveredTitle}>
                <p className="text-body text-ink-secondary">{REVIEW_COVERED}</p>
              </CuriousBlock>
              <CuriousBlock id="not-covered-title" title={SECURITY_PAGE.notCoveredTitle}>
                <PlainList items={NOT_COVERED} />
              </CuriousBlock>
            </div>

            <CuriousBlock id="timeline-title" title={SECURITY_PAGE.timelineTitle} line={SECURITY_PAGE.timelineLine}>
              <ol className="flex flex-col gap-6 border-l border-line pl-6">
                {SECURITY_TIMELINE.map((entry) => (
                  <li key={entry.title} className="flex flex-col gap-1">
                    <time dateTime={entry.date} className="text-small text-ink-muted">
                      {formatMilestoneDate(entry.date)}
                    </time>
                    <p className="text-label text-ink">{entry.title}</p>
                    <p className="text-small text-ink-secondary">{entry.body}</p>
                  </li>
                ))}
              </ol>
            </CuriousBlock>

            <CuriousBlock id="disclosure-title" title={SECURITY_PAGE.disclosureTitle} line={SECURITY_PAGE.disclosureLine}>
              <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {DISCLOSURE_STEPS.map((step, index) => (
                  <Card key={step.title} as="li">
                    <div className="flex flex-col gap-2">
                      <span className="text-label text-brand">{String(index + 1).padStart(2, '0')}</span>
                      <p className="text-label text-ink">{step.title}</p>
                      <p className="text-small text-ink-secondary">{step.body}</p>
                    </div>
                  </Card>
                ))}
              </ol>
            </CuriousBlock>

            <CuriousBlock id="safe-harbor-title" title={SECURITY_PAGE.safeHarborTitle}>
              <div className="flex max-w-reading flex-col gap-3">
                <p className="text-body text-ink-secondary">{SAFE_HARBOR.intro}</p>
                <PlainList items={SAFE_HARBOR.rules} />
              </div>
            </CuriousBlock>

          </div>
        </MarketingSection>

        <MarketingSection id="report" labelledBy="report-title">
          <Panel>
            <div className="flex flex-col gap-6">
              <SectionHeader id="report-title" title={SECURITY_PAGE.reportTitle} line={SECURITY_PAGE.reportLine} />
              <ul className="grid gap-4 md:grid-cols-2">
                {REPORT_OPTIONS.map((option) => (
                  <li key={option.email} className="flex flex-col items-start gap-2">
                    <p className="text-label text-ink">{option.title}</p>
                    <p className="text-small text-ink-secondary">{option.line}</p>
                    <ButtonLink variant="secondary" href={`mailto:${option.email}`}>
                      {option.action}
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        </MarketingSection>
      </main>
      <MarketingFooter />
    </div>
  );
}
