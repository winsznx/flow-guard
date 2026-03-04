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

export default function TermsPage() {
  return (
    <>
      <PageMeta
        title="Terms"
        description="Read the terms governing use of the FlowGuard website, application surfaces, docs, APIs, and non-custodial Bitcoin Cash workflows."
        path="/terms"
      />
      <LegalPageLayout
        eyebrow="Terms of Use"
        title="Terms for using FlowGuard."
        summary="These terms govern access to the FlowGuard website, application surfaces, documentation, and any supporting APIs we make available."
        lastUpdated="March 4, 2026"
      >
        <Section title="1. Scope">
        <p>
          FlowGuard is non-custodial software for treasury management, contract-backed
          distributions, recurring payouts, stream schedules, and governance workflows on Bitcoin
          Cash. These terms apply to your use of the public website, docs, dashboard, API endpoints,
          and related interfaces.
        </p>
        </Section>

      <Section title="2. Eligibility and wallet responsibility">
        <p>
          You are responsible for the wallets, keys, signatures, and accounts you use with
          FlowGuard. We do not hold your keys, recover lost credentials, or reverse on-chain
          transactions. If you authorize a transaction through your wallet, you are responsible for
          that authorization.
        </p>
      </Section>

      <Section title="3. Non-custodial software">
        <p>
          FlowGuard provides software interfaces and transaction-building logic. We do not take
          custody of user funds or act as your agent. Contract rules, wallet approvals, network
          conditions, and the Bitcoin Cash blockchain determine whether a transaction can be
          created, signed, broadcast, and confirmed.
        </p>
      </Section>

      <Section title="4. Acceptable use">
        <p>You agree not to use FlowGuard to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>violate applicable law or sanctions requirements</li>
          <li>interfere with the security or availability of the app or APIs</li>
          <li>misrepresent authority over wallets, vaults, tokens, or organizations</li>
          <li>attempt to extract private keys, bypass contract rules, or abuse rate limits</li>
        </ul>
      </Section>

      <Section title="5. Network, token, and contract risk">
        <p>
          Use of Bitcoin Cash, CashTokens, and smart-contract based financial workflows involves
          technical and economic risk. This includes software bugs, market volatility, wallet
          incompatibilities, indexer mismatch, mempool conditions, miner fee changes, chain reorgs,
          and unsupported asset behavior. You should test important workflows before relying on them
          in production.
        </p>
      </Section>

      <Section title="6. No advice">
        <p>
          FlowGuard does not provide legal, tax, accounting, treasury, or investment advice. Any
          examples, templates, or educational material are provided for informational use only.
        </p>
      </Section>

      <Section title="7. Availability and changes">
        <p>
          We may update, suspend, or remove features, routes, contract templates, or API behavior at
          any time. Chipnet features, beta features, and preview organization surfaces may change
          materially before mainnet release.
        </p>
      </Section>

      <Section title="8. Open-source and intellectual property">
        <p>
          FlowGuard includes open-source components and repository materials governed by their
          respective licenses. Except where a license grants broader rights, FlowGuard branding,
          documentation, and site content remain protected by applicable intellectual property law.
        </p>
      </Section>

      <Section title="9. Warranty disclaimer and liability limits">
        <p>
          FlowGuard is provided on an &quot;as is&quot; and &quot;as available&quot; basis without
          warranties of any kind. To the maximum extent permitted by law, we disclaim implied
          warranties of merchantability, fitness for a particular purpose, and non-infringement. We
          are not liable for indirect, incidental, special, consequential, or punitive damages, or
          for loss of funds, profits, data, opportunity, or reputation arising from your use of the
          software.
        </p>
      </Section>

        <Section title="10. Contact">
        <p>
          Questions about these terms can be directed through the public channels linked in the
          footer and documentation.
        </p>
        </Section>
      </LegalPageLayout>
    </>
  );
}
