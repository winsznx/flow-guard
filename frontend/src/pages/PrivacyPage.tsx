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

export default function PrivacyPage() {
  return (
    <>
      <PageMeta
        title="Privacy"
        description="Understand how FlowGuard handles wallet addresses, transaction payloads, infrastructure logs, and browser state across the site and app."
        path="/privacy"
      />
      <LegalPageLayout
        eyebrow="Privacy Notice"
        title="How FlowGuard handles product and wallet data."
        summary="This notice explains the operational data FlowGuard may process when you browse the site, connect a wallet, build a transaction, or use our docs and app interfaces."
        lastUpdated="March 4, 2026"
      >
        <Section title="1. Data we may process">
        <p>Depending on how you use FlowGuard, we may process:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>wallet addresses and public account identifiers</li>
          <li>transaction descriptors, unsigned transaction payloads, and contract metadata</li>
          <li>vault, stream, payment, proposal, or airdrop configuration data you submit</li>
          <li>standard infrastructure logs such as IP address, user agent, and request timing</li>
          <li>local browser preferences used to keep workspace state or UI selections</li>
        </ul>
      </Section>

      <Section title="2. Why we process it">
        <p>We use this information to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>render application state and route users through the app</li>
          <li>build unsigned contract transactions and supporting payloads</li>
          <li>index or display on-chain activity related to FlowGuard workflows</li>
          <li>operate, secure, debug, and improve the website and APIs</li>
        </ul>
      </Section>

      <Section title="3. On-chain data is public">
        <p>
          Transactions broadcast to Bitcoin Cash or stored on-chain through CashTokens are public by
          design. Once a transaction is confirmed, we cannot make that blockchain data private or
          delete it.
        </p>
      </Section>

      <Section title="4. Local storage and browser state">
        <p>
          FlowGuard may store local preferences in your browser so the app can preserve selected
          workspace mode, stream launch context, form drafts, or similar usability settings. You can
          clear those values through your browser settings, although doing so may remove saved app
          preferences.
        </p>
      </Section>

      <Section title="5. Infrastructure providers">
        <p>
          We may rely on hosting, docs, analytics, RPC, or other infrastructure providers to operate
          the site and APIs. Those providers may receive the categories of operational data
          necessary to deliver their service, such as IP logs, request metadata, and payloads routed
          through the backend.
        </p>
      </Section>

      <Section title="6. Retention">
        <p>
          We retain operational and application data only as long as needed for product operation,
          debugging, security, compliance, or business continuity. On-chain records are retained by
          the blockchain itself.
        </p>
      </Section>

      <Section title="7. Your choices">
        <p>
          You can choose not to connect a wallet, avoid submitting optional information, clear local
          browser data, or stop using the app at any time. Because FlowGuard is non-custodial, some
          features cannot function without a connected wallet or submitted transaction parameters.
        </p>
      </Section>

        <Section title="8. Changes to this notice">
        <p>
          We may update this notice as the product evolves. If the categories of data or usage
          materially change, we will update this page to reflect the new behavior.
        </p>
        </Section>
      </LegalPageLayout>
    </>
  );
}
