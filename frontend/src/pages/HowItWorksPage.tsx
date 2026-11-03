import { MarketingFooter } from '../components/layout/Footer';
import { MarketingNav } from '../components/layout/MarketingNav';
import { MarketingSection } from '../components/layout/MarketingSection';
import { ClosingBand } from '../components/marketing/ClosingBand';
import { FactsCard } from '../components/marketing/FactsCard';
import { MarketingHero } from '../components/marketing/MarketingHero';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { Display } from '../components/ui/Display';
import { Eyebrow } from '../components/ui/Eyebrow';
import { Heading } from '../components/ui/Heading';
import { Check, Icon, X } from '../components/ui/Icon';
import {
  CAN_AND_CANT,
  FOR_DEVELOPERS,
  HOW_IT_WORKS_CLOSING,
  HOW_IT_WORKS_HERO,
  HOW_IT_WORKS_STEPS,
  RULES_YOU_CAN_CHECK,
  WHO_CAN_MOVE_SECTION,
} from '../copy/howItWorks';

function stepNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

function SectionHeader({ id, eyebrow, title, lead }: { id: string; eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="flex max-w-reading flex-col gap-4">
      <Eyebrow>{eyebrow}</Eyebrow>
      <Display size="headline" as="h2" id={id}>
        {title}
      </Display>
      {lead ? <p className="text-body-lg text-ink-secondary">{lead}</p> : null}
    </div>
  );
}

function MarkList({ title, items, mark }: { title: string; items: string[]; mark: 'can' | 'cant' }) {
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <Heading level="section" as="h3">
          {title}
        </Heading>
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item} className="flex gap-3 text-body text-ink-secondary">
              <span aria-hidden="true" className="mt-1 inline-flex shrink-0 text-ink">
                <Icon icon={mark === 'can' ? Check : X} size={16} />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export default function HowItWorksPage() {

  return (
    <>
      <MarketingNav />
      <main className="min-w-0">
        <MarketingHero
          headline={HOW_IT_WORKS_HERO.headline}
          lead={HOW_IT_WORKS_HERO.lead}
          primary={HOW_IT_WORKS_HERO.primary}
          secondary={HOW_IT_WORKS_HERO.secondary}
          note={HOW_IT_WORKS_HERO.note}
          size="headline"
        />

        <MarketingSection labelledBy="how-steps" tone="surface">
          <div className="flex flex-col gap-8">
            <SectionHeader id="how-steps" eyebrow={HOW_IT_WORKS_STEPS.eyebrow} title={HOW_IT_WORKS_STEPS.title} />
            <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {HOW_IT_WORKS_STEPS.steps.map((step, index) => (
                <Card key={step.title} as="li">
                  <div className="flex flex-col gap-2">
                    <span className="text-label text-ink-muted">{stepNumber(index)}</span>
                    <Heading level="item">{step.title}</Heading>
                    <p className="text-small text-ink-secondary">{step.body}</p>
                  </div>
                </Card>
              ))}
            </ol>
          </div>
        </MarketingSection>

        <MarketingSection labelledBy="how-can">
          <div className="flex flex-col gap-8">
            <SectionHeader id="how-can" eyebrow={CAN_AND_CANT.eyebrow} title={CAN_AND_CANT.title} />
            <div className="grid gap-4 lg:grid-cols-2">
              <MarkList title={CAN_AND_CANT.canTitle} items={CAN_AND_CANT.can} mark="can" />
              <MarkList title={CAN_AND_CANT.cantTitle} items={CAN_AND_CANT.cant} mark="cant" />
            </div>
          </div>
        </MarketingSection>

        <MarketingSection labelledBy="how-rules" tone="surface">
          <div className="flex flex-col gap-8">
            <SectionHeader
              id="how-rules"
              eyebrow={RULES_YOU_CAN_CHECK.eyebrow}
              title={RULES_YOU_CAN_CHECK.title}
              lead={RULES_YOU_CAN_CHECK.lead}
            />
            <ul className="grid gap-4 md:grid-cols-2">
              {RULES_YOU_CAN_CHECK.facts.map((fact) => (
                <Card key={fact.title} as="li">
                  <div className="flex flex-col gap-2">
                    <Heading level="item">{fact.title}</Heading>
                    <p className="text-small text-ink-secondary">{fact.body}</p>
                  </div>
                </Card>
              ))}
            </ul>
          </div>
        </MarketingSection>

        <MarketingSection labelledBy="how-who">
          <div className="flex flex-col gap-8">
            <SectionHeader
              id="how-who"
              eyebrow={WHO_CAN_MOVE_SECTION.eyebrow}
              title={WHO_CAN_MOVE_SECTION.title}
              lead={WHO_CAN_MOVE_SECTION.lead}
            />
            <ul className="grid gap-4 lg:grid-cols-2">
              {WHO_CAN_MOVE_SECTION.products.map((product) => (
                <li key={product.id} className="min-w-0">
                  <FactsCard
                    eyebrow={product.label}
                    rows={[
                      { label: WHO_CAN_MOVE_SECTION.rowWho, value: product.who },
                      { label: WHO_CAN_MOVE_SECTION.rowGoesAway, value: product.goesAway },
                    ]}
                    footer={
                      <span className="whitespace-nowrap">
                        <ButtonLink href={product.source.href} external variant="link">
                          {product.source.label}
                        </ButtonLink>
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
            <div>
              <ButtonLink to={WHO_CAN_MOVE_SECTION.more.href} variant="secondary">
                {WHO_CAN_MOVE_SECTION.more.label}
              </ButtonLink>
            </div>
          </div>
        </MarketingSection>

        <MarketingSection labelledBy="how-developers" tone="surface">
          <div className="flex flex-col gap-8">
            <SectionHeader
              id="how-developers"
              eyebrow={FOR_DEVELOPERS.eyebrow}
              title={FOR_DEVELOPERS.title}
              lead={FOR_DEVELOPERS.lead}
            />
            <ul className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {FOR_DEVELOPERS.links.map((link) => (
                <li key={link.href}>
                  <ButtonLink href={link.href} external variant="secondary">
                    {link.label}
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </div>
        </MarketingSection>

        <div className="pt-16 lg:pt-24">
          <ClosingBand {...HOW_IT_WORKS_CLOSING} />
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}
