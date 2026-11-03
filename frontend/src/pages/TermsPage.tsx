import { LegalPageLayout, type LegalSection } from '../components/legal/LegalPageLayout';

const TERMS_SECTIONS: LegalSection[] = [
  {
    id: 'scope',
    title: 'Scope',
    body: (
      <>
        <p>
          FlowGuard is non-custodial software for treasury management, contract-backed
          distributions, recurring payouts, stream schedules, and governance workflows on Bitcoin
          Cash. These terms apply to your use of the public website, docs, dashboard, API endpoints,
          and related interfaces.
        </p>
      </>
    ),
  },
  {
    id: 'eligibility-and-wallet-responsibility',
    title: 'Eligibility and wallet responsibility',
    body: (
      <>
        <p>
          You are responsible for the wallets, keys, signatures, and accounts you use with
          FlowGuard. We do not hold your keys, recover lost credentials, or reverse on-chain
          transactions. If you authorize a transaction through your wallet, you are responsible for
          that authorization.
        </p>
      </>
    ),
  },
  {
    id: 'non-custodial-software',
    title: 'Non-custodial software',
    body: (
      <>
        <p>
          FlowGuard provides software interfaces and transaction-building logic. We do not take
          custody of user funds or act as your agent. Contract rules, wallet approvals, network
          conditions, and the Bitcoin Cash blockchain determine whether a transaction can be
          created, signed, broadcast, and confirmed.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>You agree not to use FlowGuard to:</p>
        <ul>
          <li>violate applicable law or sanctions requirements</li>
          <li>interfere with the security or availability of the app or APIs</li>
          <li>misrepresent authority over wallets, vaults, tokens, or organizations</li>
          <li>attempt to extract private keys, bypass contract rules, or abuse rate limits</li>
        </ul>
      </>
    ),
  },
  {
    id: 'network-token-and-contract-risk',
    title: 'Network, token, and contract risk',
    body: (
      <>
        <p>
          Use of Bitcoin Cash, CashTokens, and smart-contract based financial workflows involves
          technical and economic risk. This includes software bugs, market volatility, wallet
          incompatibilities, indexer mismatch, mempool conditions, miner fee changes, chain reorgs,
          and unsupported asset behavior. You should test important workflows before relying on them
          in production.
        </p>
      </>
    ),
  },
  {
    id: 'no-advice',
    title: 'No advice',
    body: (
      <>
        <p>
          FlowGuard does not provide legal, tax, accounting, treasury, or investment advice. Any
          examples, templates, or educational material are provided for informational use only.
        </p>
      </>
    ),
  },
  {
    id: 'availability-and-changes',
    title: 'Availability and changes',
    body: (
      <>
        <p>
          We may update, suspend, or remove features, routes, contract templates, or API behavior at
          any time. Chipnet features, beta features, and preview organization surfaces may change
          materially before mainnet release.
        </p>
      </>
    ),
  },
  {
    id: 'open-source-and-intellectual-property',
    title: 'Open-source and intellectual property',
    body: (
      <>
        <p>
          FlowGuard includes open-source components and repository materials governed by their
          respective licenses. Except where a license grants broader rights, FlowGuard branding,
          documentation, and site content remain protected by applicable intellectual property law.
        </p>
      </>
    ),
  },
  {
    id: 'warranty-disclaimer-and-liability-limits',
    title: 'Warranty disclaimer and liability limits',
    body: (
      <>
        <p>
          FlowGuard is provided on an &quot;as is&quot; and &quot;as available&quot; basis without
          warranties of any kind. To the maximum extent permitted by law, we disclaim implied
          warranties of merchantability, fitness for a particular purpose, and non-infringement. We
          are not liable for indirect, incidental, special, consequential, or punitive damages, or
          for loss of funds, profits, data, opportunity, or reputation arising from your use of the
          software.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <>
        <p>
          Questions about these terms can be directed through the public channels linked in the
          footer and documentation.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return <LegalPageLayout page="terms" sections={TERMS_SECTIONS} />;
}
