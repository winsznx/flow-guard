import { LegalPageLayout, type LegalSection } from '../components/legal/LegalPageLayout';

const DISCLAIMER_SECTIONS: LegalSection[] = [
  {
    id: 'software-risk',
    title: 'Software risk',
    body: (
      <>
        <p>
          Smart contracts, transaction builders, wallets, browser extensions, indexers, RPC
          infrastructure, and third-party dependencies can fail in unexpected ways. Even where code
          has been reviewed or tested, defects may still exist.
        </p>
      </>
    ),
  },
  {
    id: 'no-guarantee-of-transaction-execution',
    title: 'No guarantee of transaction execution',
    body: (
      <>
        <p>
          Transaction construction does not guarantee wallet compatibility, successful signing,
          broadcast, mempool acceptance, or block confirmation. Network conditions, missing fee
          inputs, stale UTXOs, wallet behavior, or contract state changes can prevent execution.
        </p>
      </>
    ),
  },
  {
    id: 'asset-and-market-risk',
    title: 'Asset and market risk',
    body: (
      <>
        <p>
          BCH and CashToken-denominated assets may experience significant price volatility,
          liquidity constraints, delisting events, or issuer risk. FlowGuard does not protect
          against market losses or token-specific failures.
        </p>
      </>
    ),
  },
  {
    id: 'user-responsibility',
    title: 'User responsibility',
    body: (
      <>
        <p>
          You are responsible for verifying contract parameters, recipients, cadence, cliff
          settings, tranche schedules, treasury policies, token identifiers, and fee assumptions
          before signing. You should review every transaction in your wallet before approving it.
        </p>
      </>
    ),
  },
  {
    id: 'testnet-and-beta-features',
    title: 'Testnet and beta features',
    body: (
      <>
        <p>
          Chipnet, preview, alpha, and beta features are for evaluation and operational testing.
          They may change without notice, and they may not reflect final mainnet behavior.
        </p>
      </>
    ),
  },
  {
    id: 'no-professional-advice',
    title: 'No professional advice',
    body: (
      <>
        <p>
          Nothing in FlowGuard, its docs, examples, templates, or UI copy should be interpreted as
          legal, investment, accounting, security, or tax advice. You should obtain independent
          professional advice where appropriate.
        </p>
      </>
    ),
  },
  {
    id: 'use-at-your-own-risk',
    title: 'Use at your own risk',
    body: (
      <>
        <p>
          By using FlowGuard, you accept the operational, technical, and market risks associated
          with blockchain software and treasury management. If you are not comfortable reviewing and
          approving contract-backed transactions, you should not use the product.
        </p>
      </>
    ),
  },
];

export default function DisclaimerPage() {
  return <LegalPageLayout page="disclaimer" sections={DISCLAIMER_SECTIONS} />;
}
