import { LegalPageLayout, type LegalSection } from '../components/legal/LegalPageLayout';

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'data-we-may-process',
    title: 'Data we may process',
    body: (
      <>
        <p>Depending on how you use FlowGuard, we may process:</p>
        <ul>
          <li>wallet addresses and public account identifiers</li>
          <li>transaction descriptors, unsigned transaction payloads, and contract metadata</li>
          <li>vault, stream, payment, proposal, or airdrop configuration data you submit</li>
          <li>standard infrastructure logs such as IP address, user agent, and request timing</li>
          <li>local browser preferences used to keep workspace state or UI selections</li>
        </ul>
      </>
    ),
  },
  {
    id: 'why-we-process-it',
    title: 'Why we process it',
    body: (
      <>
        <p>We use this information to:</p>
        <ul>
          <li>render application state and route users through the app</li>
          <li>build unsigned contract transactions and supporting payloads</li>
          <li>index or display on-chain activity related to FlowGuard workflows</li>
          <li>operate, secure, debug, and improve the website and APIs</li>
        </ul>
      </>
    ),
  },
  {
    id: 'on-chain-data-is-public',
    title: 'On-chain data is public',
    body: (
      <>
        <p>
          Transactions broadcast to Bitcoin Cash or stored on-chain through CashTokens are public by
          design. Once a transaction is confirmed, we cannot make that blockchain data private or
          delete it.
        </p>
      </>
    ),
  },
  {
    id: 'local-storage-and-browser-state',
    title: 'Local storage and browser state',
    body: (
      <>
        <p>
          FlowGuard may store local preferences in your browser so the app can preserve selected
          workspace mode, stream launch context, form drafts, or similar usability settings. You can
          clear those values through your browser settings, although doing so may remove saved app
          preferences.
        </p>
      </>
    ),
  },
  {
    id: 'infrastructure-providers',
    title: 'Infrastructure providers',
    body: (
      <>
        <p>
          We may rely on hosting, docs, analytics, RPC, or other infrastructure providers to operate
          the site and APIs. Those providers may receive the categories of operational data
          necessary to deliver their service, such as IP logs, request metadata, and payloads routed
          through the backend.
        </p>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'Retention',
    body: (
      <>
        <p>
          We retain operational and application data only as long as needed for product operation,
          debugging, security, compliance, or business continuity. On-chain records are retained by
          the blockchain itself.
        </p>
      </>
    ),
  },
  {
    id: 'your-choices',
    title: 'Your choices',
    body: (
      <>
        <p>
          You can choose not to connect a wallet, avoid submitting optional information, clear local
          browser data, or stop using the app at any time. Because FlowGuard is non-custodial, some
          features cannot function without a connected wallet or submitted transaction parameters.
        </p>
      </>
    ),
  },
  {
    id: 'changes-to-this-notice',
    title: 'Changes to this notice',
    body: (
      <>
        <p>
          We may update this notice as the product evolves. If the categories of data or usage
          materially change, we will update this page to reflect the new behavior.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return <LegalPageLayout page="privacy" sections={PRIVACY_SECTIONS} />;
}
