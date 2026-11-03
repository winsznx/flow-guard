import { MarketingFooter } from '../components/layout/Footer';
import { MarketingNav } from '../components/layout/MarketingNav';
import { MarketingSection } from '../components/layout/MarketingSection';
import { ClosingBand } from '../components/marketing/ClosingBand';
import { MarketingHero } from '../components/marketing/MarketingHero';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { Display } from '../components/ui/Display';
import { Eyebrow } from '../components/ui/Eyebrow';
import { Heading } from '../components/ui/Heading';
import { Notice } from '../components/ui/Notice';
import { DEMO_CLOSING, DEMO_HERO, DEMO_NEEDS, DEMO_STEPS, TEST_APP_URL, TEST_NETWORK_NOTICE } from '../copy/demo';

function stepNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

export default function DemoPage() {

  return (
    <>
      <MarketingNav />
      <main className="min-w-0">
        <MarketingHero
          eyebrow={DEMO_HERO.eyebrow}
          headline={DEMO_HERO.headline}
          accent={DEMO_HERO.accent}
          lead={DEMO_HERO.lead}
          primary={DEMO_HERO.primary}
          secondary={DEMO_HERO.secondary}
          note={DEMO_HERO.note}
          size="headline"
        />

        <MarketingSection labelledBy="demo-needs" tone="surface">
          <div className="flex flex-col gap-8">
            <div className="flex max-w-reading flex-col gap-4">
              <Eyebrow>{DEMO_NEEDS.eyebrow}</Eyebrow>
              <Display size="headline" as="h2" id="demo-needs">
                {DEMO_NEEDS.title}
              </Display>
            </div>
            <ul className="grid gap-4 md:grid-cols-3">
              {DEMO_NEEDS.items.map((item) => (
                <Card key={item.title} as="li">
                  <div className="flex flex-col gap-2">
                    <Heading level="item">{item.title}</Heading>
                    <p className="text-small text-ink-secondary">{item.body}</p>
                  </div>
                </Card>
              ))}
            </ul>
            <div className="flex max-w-reading flex-col gap-4">
              <Notice
                tone="info"
                title={DEMO_NEEDS.realMoney.title}
                action={
                  <ButtonLink to={DEMO_NEEDS.getWallet.href} variant="link">
                    {DEMO_NEEDS.getWallet.label}
                  </ButtonLink>
                }
              >
                {DEMO_NEEDS.realMoney.body}
              </Notice>
              {TEST_APP_URL ? (
                <Notice
                  tone="neutral"
                  title={TEST_NETWORK_NOTICE.title}
                  action={
                    <ButtonLink href={TEST_APP_URL} external variant="link">
                      {TEST_NETWORK_NOTICE.action}
                    </ButtonLink>
                  }
                >
                  {TEST_NETWORK_NOTICE.body}
                </Notice>
              ) : null}
            </div>
          </div>
        </MarketingSection>

        <MarketingSection id={DEMO_STEPS.id} labelledBy="demo-steps">
          <div className="flex flex-col gap-8">
            <div className="flex max-w-reading flex-col gap-4">
              <Eyebrow>{DEMO_STEPS.eyebrow}</Eyebrow>
              <Display size="headline" as="h2" id="demo-steps">
                {DEMO_STEPS.title}
              </Display>
            </div>
            <ol className="grid gap-4 md:grid-cols-2">
              {DEMO_STEPS.steps.map((step, index) => (
                <Card key={step.title} as="li">
                  <div className="flex h-full flex-col items-start gap-3">
                    <span className="text-label text-ink-muted">{stepNumber(index)}</span>
                    <Heading level="item">{step.title}</Heading>
                    <p className="text-small text-ink-secondary">{step.body}</p>
                    {step.action ? (
                      <div className="mt-auto pt-2">
                        <ButtonLink to={step.action.href} variant="secondary" size="sm">
                          {step.action.label}
                        </ButtonLink>
                      </div>
                    ) : null}
                  </div>
                </Card>
              ))}
            </ol>
          </div>
        </MarketingSection>

        <div className="pt-16 lg:pt-24">
          <ClosingBand {...DEMO_CLOSING} />
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}
