import { MarketingFooter } from '../components/layout/Footer';
import { MarketingNav } from '../components/layout/MarketingNav';
import { MarketingSection } from '../components/layout/MarketingSection';
import { ClosingBand } from '../components/marketing/ClosingBand';
import { FactsCard } from '../components/marketing/FactsCard';
import { MarketingHero } from '../components/marketing/MarketingHero';
import { NumberedFaq } from '../components/marketing/NumberedFaq';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { Display } from '../components/ui/Display';
import { Eyebrow } from '../components/ui/Eyebrow';
import { Heading } from '../components/ui/Heading';
import { List, type Column } from '../components/ui/List';
import { formatUsd } from '../copy/format';
import {
  FEES,
  NETWORK_FEE_CEILING_BCH,
  PRICE_SUMMARY,
  PRICING_CLOSING,
  PRICING_FAQ,
  PRICING_HERO,
  WAYS_TO_USE,
  feeInDollars,
  type FeeRow,
} from '../copy/pricing';
import { useBchPrice } from '../utils/usePrice';

const FEE_COLUMNS: Column<FeeRow>[] = [
  { key: 'action', header: FEES.columns.action, cell: (row) => row.action, primary: true },
  { key: 'approves', header: FEES.columns.approves, cell: (row) => row.approves, mobile: 'bottom-start' },
  { key: 'transactions', header: FEES.columns.transactions, cell: (row) => row.transactions, mobile: 'bottom-start' },
  { key: 'fee', header: FEES.columns.fee, cell: (row) => row.fee, align: 'end', mobile: 'bottom-end' },
];

function useFeeInDollars(): string {
  const { price, isLoading } = useBchPrice();
  const usd = formatUsd(price === null ? null : price * NETWORK_FEE_CEILING_BCH);
  if (usd) return feeInDollars(usd);
  return isLoading ? PRICE_SUMMARY.loadingPrice : PRICE_SUMMARY.priceUnavailable;
}

function PriceSummary() {
  const inDollars = useFeeInDollars();

  return (
    <FactsCard
      eyebrow={PRICE_SUMMARY.eyebrow}
      network={PRICE_SUMMARY.network}
      rows={[
        { label: PRICE_SUMMARY.rows.flowGuardFee, value: PRICE_SUMMARY.none },
        { label: PRICE_SUMMARY.rows.networkFee, value: PRICE_SUMMARY.networkFee },
        { label: PRICE_SUMMARY.rows.inDollars, value: inDollars },
      ]}
    />
  );
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

export default function PricingPage() {

  return (
    <>
      <MarketingNav />
      <main className="min-w-0">
        <MarketingHero
          headline={PRICING_HERO.headline}
          lead={PRICING_HERO.lead}
          primary={PRICING_HERO.primary}
          secondary={PRICING_HERO.secondary}
          note={PRICING_HERO.note}
          size="headline"
          visual={<PriceSummary />}
        />

        <MarketingSection id={FEES.id} labelledBy="pricing-fees" tone="surface">
          <div className="flex flex-col gap-8">
            <SectionHeader id="pricing-fees" eyebrow={FEES.eyebrow} title={FEES.title} lead={FEES.lead} />
            <List
              label={FEES.listLabel}
              columns={FEE_COLUMNS}
              rows={FEES.rows}
              rowKey={(row) => row.id}
              state="ready"
              empty={null}
              noResults={null}
              error={null}
            />
            <Card className="max-w-reading">
              <div className="flex flex-col gap-2">
                <Heading level="item" as="h3">
                  {FEES.laterFees.title}
                </Heading>
                <p className="text-body text-ink-secondary">{FEES.laterFees.body}</p>
              </div>
            </Card>
            <p className="max-w-reading text-small text-ink-muted">{FEES.footnote}</p>
          </div>
        </MarketingSection>

        <MarketingSection labelledBy="pricing-ways">
          <div className="flex flex-col gap-8">
            <SectionHeader id="pricing-ways" eyebrow={WAYS_TO_USE.eyebrow} title={WAYS_TO_USE.title} />
            <ul className="grid gap-4 md:grid-cols-2">
              {WAYS_TO_USE.options.map((option) => (
                <Card key={option.id} as="li">
                  <div className="flex h-full flex-col items-start gap-4">
                    <div className="flex w-full items-baseline justify-between gap-4">
                      <Heading level="section" as="h3">
                        {option.title}
                      </Heading>
                      <span className="text-label text-ink-secondary">{option.price}</span>
                    </div>
                    <p className="text-body text-ink-secondary">{option.body}</p>
                    <div className="mt-auto">
                      {option.action.external ? (
                        <ButtonLink href={option.action.href} external variant="secondary">
                          {option.action.label}
                        </ButtonLink>
                      ) : (
                        <ButtonLink to={option.action.href} variant="primary">
                          {option.action.label}
                        </ButtonLink>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </ul>
          </div>
        </MarketingSection>

        <MarketingSection labelledBy="pricing-faq" tone="surface">
          <div className="flex max-w-reading flex-col gap-6">
            <Display size="headline" as="h2" id="pricing-faq">
              {PRICING_FAQ.title}
            </Display>
            <NumberedFaq items={PRICING_FAQ.items} />
          </div>
        </MarketingSection>

        <div className="pt-16 lg:pt-24">
          <ClosingBand {...PRICING_CLOSING} />
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}
