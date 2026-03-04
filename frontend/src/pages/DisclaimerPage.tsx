import type { ReactNode } from 'react';
import { LegalPageLayout } from '../components/legal/LegalPageLayout';
import { PageMeta } from '../components/seo/PageMeta';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl text-textPrimary">{title}</h2>
      <div className="space-y-4 text-sm leading-7 text-textSecondary md:text-base">{children}</div>
    </section>
  );
}

export default function DisclaimerPage() {
  return (
    <>
      <PageMeta
        title="Risk Disclaimer"
        description="Review the technical, market, wallet, and contract risks associated with using FlowGuard and blockchain treasury software."
        path="/disclaimer"
      />
      <LegalPageLayout
        eyebrow="Risk Disclaimer"
        title="Important risk disclosures for using FlowGuard."
        summary="FlowGuard is professional treasury and contract software, but blockchain systems remain high-risk environments. Read these disclosures before relying on the app in production."
        lastUpdated="March 4, 2026"
      >
        <Section title="1. Software risk">
        <p>
          Smart contracts, transaction builders, wallets, browser extensions, indexers, RPC
          infrastructure, and third-party dependencies can fail in unexpected ways. Even where code
          has been reviewed or tested, defects may still exist.
        </p>
        </Section>

      <Section title="2. No guarantee of transaction execution">
        <p>
          Transaction construction does not guarantee wallet compatibility, successful signing,
          broadcast, mempool acceptance, or block confirmation. Network conditions, missing fee
          inputs, stale UTXOs, wallet behavior, or contract state changes can prevent execution.
        </p>
      </Section>

      <Section title="3. Asset and market risk">
        <p>
          BCH and CashToken-denominated assets may experience significant price volatility,
          liquidity constraints, delisting events, or issuer risk. FlowGuard does not protect
          against market losses or token-specific failures.
        </p>
      </Section>

      <Section title="4. User responsibility">
        <p>
          You are responsible for verifying contract parameters, recipients, cadence, cliff
          settings, tranche schedules, treasury policies, token identifiers, and fee assumptions
          before signing. You should review every transaction in your wallet before approving it.
        </p>
      </Section>

      <Section title="5. Testnet and beta features">
        <p>
          Chipnet, preview, alpha, and beta features are for evaluation and operational testing.
          They may change without notice, and they may not reflect final mainnet behavior.
        </p>
      </Section>

      <Section title="6. No professional advice">
        <p>
          Nothing in FlowGuard, its docs, examples, templates, or UI copy should be interpreted as
          legal, investment, accounting, security, or tax advice. You should obtain independent
          professional advice where appropriate.
        </p>
      </Section>

        <Section title="7. Use at your own risk">
        <p>
          By using FlowGuard, you accept the operational, technical, and market risks associated
          with blockchain software and treasury management. If you are not comfortable reviewing and
          approving contract-backed transactions, you should not use the product.
        </p>
        </Section>
      </LegalPageLayout>
    </>
  );
}
