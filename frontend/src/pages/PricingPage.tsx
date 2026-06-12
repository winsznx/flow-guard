import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  Server,
  CloudOff,
  Calculator,
} from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { SolutionsDropdown } from '../components/ui/SolutionsDropdown';
import { ResourcesDropdown } from '../components/ui/ResourcesDropdown';
import { NoiseBackground } from '../components/ui/NoiseBackground';
import { PageMeta } from '../components/seo/PageMeta';
import { APP_SITE_URL, DOCS_SITE_URL } from '../utils/publicUrls';
import { useBchPrice } from '../utils/usePrice';

interface TxCostOp {
  label: string;
  sats: number;
  hint: string;
}

const TX_COST_OPS: TxCostOp[] = [
  { label: 'create stream', sats: 600, hint: 'one-shot covenant deploy' },
  { label: 'claim airdrop', sats: 400, hint: 'recipient-driven, sponsorable' },
  { label: 'cancel grant', sats: 150, hint: 'creator unwinds remainder' },
];

function formatUsd(sats: number, bchUsd: number | null): string {
  if (bchUsd === null) return ' - ';
  const usd = (sats / 1e8) * bchUsd;
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(4)}`;
}

interface FeeRow {
  flow: string;
  typical: string;
  perAction: string;
  payer: string;
}

const FEE_TABLE: FeeRow[] = [
  {
    flow: 'create a vault',
    typical: '~700 sat',
    perAction: 'one transaction',
    payer: 'creator',
  },
  {
    flow: 'fund a vault or stream',
    typical: '~250 sat',
    perAction: 'one transaction per deposit',
    payer: 'creator',
  },
  {
    flow: 'create a vesting stream',
    typical: '~900 sat',
    perAction: 'one transaction',
    payer: 'creator',
  },
  {
    flow: 'claim a stream payout',
    typical: '~400 sat',
    perAction: 'one transaction per claim',
    payer: 'recipient (sponsorable)',
  },
  {
    flow: 'airdrop, per recipient',
    typical: '~250 sat',
    perAction: 'batched into a single tx',
    payer: 'creator',
  },
  {
    flow: 'bounty payout',
    typical: '~450 sat',
    perAction: 'one transaction',
    payer: 'creator',
  },
  {
    flow: 'reward distribution, per recipient',
    typical: '~250 sat',
    perAction: 'batched',
    payer: 'creator',
  },
  {
    flow: 'governance proposal',
    typical: '~800 sat',
    perAction: 'one transaction + per-approval signatures',
    payer: 'proposer',
  },
  {
    flow: 'multisig approval signature',
    typical: '0 sat',
    perAction: 'off-chain until the final spend',
    payer: 'signer (only pays gas on final spend)',
  },
];

interface CompareRow {
  feature: string;
  flowguard: string;
  sablier: string;
  llama: string;
  superfluid: string;
}

const COMPARE_ROWS: CompareRow[] = [
  {
    feature: 'protocol fee on stream creation',
    flowguard: 'zero',
    sablier: 'zero (gas only)',
    llama: 'zero (gas only)',
    superfluid: 'fee charged on flow rate',
  },
  {
    feature: 'protocol fee on claim',
    flowguard: 'zero',
    sablier: 'zero',
    llama: 'zero',
    superfluid: 'streaming fee',
  },
  {
    feature: 'protocol fee on airdrops',
    flowguard: 'zero',
    sablier: 'zero',
    llama: 'n/a',
    superfluid: 'n/a',
  },
  {
    feature: 'typical full claim cost',
    flowguard: 'under one cent',
    sablier: 'usd 0.50 - usd 5 on mainnet',
    llama: 'usd 0.20 - usd 2 on mainnet',
    superfluid: 'varies, plus protocol fee',
  },
  {
    feature: 'fee floor at network congestion',
    flowguard: 'sub-cent - bch fees are capped low',
    sablier: 'usd 5 - usd 50 on busy days',
    llama: 'similar to sablier',
    superfluid: 'similar to sablier',
  },
  {
    feature: 'token standard',
    flowguard: 'cashtokens (utxo-native)',
    sablier: 'erc-20',
    llama: 'erc-20',
    superfluid: 'super-token wrapper',
  },
  {
    feature: 'self-host option',
    flowguard: 'yes, fully free',
    sablier: 'no',
    llama: 'no',
    superfluid: 'no',
  },
];

const HOSTING_OPTIONS = [
  {
    icon: CloudOff,
    title: 'hosted at flowguard.cash',
    price: 'free',
    body: 'use app.flowguard.cash, our indexer, our executor, and our dashboards. no signup fee, no per-seat charge, no usage cap.',
    bullets: [
      'sso-free wallet login',
      'public indexer + explorer',
      'managed executor for scheduled unlocks',
      'support via telegram and email',
    ],
    cta: { label: 'Launch hosted app', href: APP_SITE_URL, external: true },
  },
  {
    icon: Server,
    title: 'self-hosted',
    price: 'free',
    body: 'run the open-source stack on your own infrastructure. ideal for orgs with stricter data-residency or compliance requirements.',
    bullets: [
      'docker compose template',
      'self-run indexer + postgres',
      'optional executor or recipient-driven claims',
      'identical user surface',
    ],
    cta: { label: 'Self-host guide', href: `${DOCS_SITE_URL}/self-host`, external: true },
  },
];

const FAQ = [
  {
    q: 'is the chipnet (test network) free?',
    a: 'yes. test bch from the faucet has no monetary value, so every action on chipnet is free in practice. we do not gate any feature behind a paid tier on testnet or mainnet.',
  },
  {
    q: 'do you take a fee on token-denominated flows?',
    a: 'no. zero protocol fee applies whether the workflow moves bch, cashtokens, or both. miner fees are paid in bch as usual.',
  },
  {
    q: 'how can flowguard be sustainable without fees?',
    a: 'the protocol layer is open source and zero-fee. the company behind it is supported by enterprise integration contracts, grants, and infrastructure offerings (managed indexer, sla-backed executor) for teams that want them. the public hosted product remains free.',
  },
  {
    q: 'can you raise fees later?',
    a: 'we can change the hosted dashboard at any time. we cannot retroactively impose a fee on covenants that are already on chain - they were created under a fee-free rule, and the rule is baked into the address. if we ever do change the hosted product, existing covenants are unaffected and self-hosting remains free.',
  },
  {
    q: 'who pays gas when a recipient is non-crypto-native?',
    a: 'for airdrops and payroll, the creator can sponsor miner fees through a fronting pattern. recipients then receive funds without needing bch in their wallet for gas. see the docs for the current state of fee-fronting flows.',
  },
];

export default function PricingPage() {
  const { price: bchUsd, source, isStale } = useBchPrice();
  const priceLabel = bchUsd !== null ? `$${bchUsd.toFixed(2)}` : ' - ';
  const sourceLabel = source === 'oracle' ? 'gp oracle' : source === 'coingecko' ? 'coingecko' : 'loading';

  return (
    <main className="bg-background min-h-screen">
      <PageMeta
        title="Pricing"
        description="FlowGuard is zero-fee. You pay BCH miners, not us. See typical transaction costs, comparison to alternatives, and self-host vs hosted options."
        path="/pricing"
      />

      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/30 h-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 h-full flex justify-between items-center">
          <Link to="/">
            <img src="/assets/flow-green.png" alt="FlowGuard" className="h-8 object-contain" />
          </Link>
          <div className="hidden md:flex items-center space-x-10">
            <Link
              to="/"
              className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors"
            >
              Home
            </Link>
            <SolutionsDropdown />
            <a
              href={DOCS_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors"
            >
              Developers
            </a>
            <Link
              to="/security"
              className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors"
            >
              Security
            </Link>
            <ResourcesDropdown />
            <a href={APP_SITE_URL}>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-primary text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-primaryHover transition-all shadow-lg hover:shadow-xl"
              >
                Launch App
              </motion.button>
            </a>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-16 px-6 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
                tx cost right now
              </p>
              <h1 className="font-display text-4xl md:text-6xl text-textPrimary leading-tight">
                what you would pay
                <br />
                <span className="text-brand300">if you signed it this second.</span>
              </h1>
            </div>
            <div className="flex items-center gap-3 text-sm font-mono text-textMuted">
              <span className={`inline-block w-2 h-2 rounded-full ${isStale ? 'bg-textMuted' : 'bg-brand300'}`} />
              <span>bch / usd</span>
              <span className="text-brand300">{priceLabel}</span>
              <span className="text-textMuted">via {sourceLabel}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TX_COST_OPS.map((op, i) => (
              <motion.div
                key={op.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="relative p-7 rounded-2xl border border-border bg-surface overflow-hidden"
              >
                <div className="flex items-baseline justify-between mb-5">
                  <span className="text-xs font-mono uppercase tracking-wider text-textMuted">
                    op {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-xs font-mono text-textMuted">~ miner fee</span>
                </div>
                <p className="text-textPrimary font-medium text-lg mb-1">{op.label}</p>
                <p className="text-xs text-textMuted mb-6">{op.hint}</p>
                <div className="flex items-baseline gap-3 mb-1">
                  <span className="font-display text-4xl text-brand300">{op.sats}</span>
                  <span className="text-sm font-mono text-textMuted">sat</span>
                </div>
                <div className="flex items-baseline gap-2 font-mono text-sm text-textSecondary">
                  <span>=</span>
                  <span className="text-textPrimary">{formatUsd(op.sats, bchUsd)}</span>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <a href={APP_SITE_URL}>
              <button className="group bg-primary text-white px-7 py-3.5 rounded-full text-sm font-semibold hover:bg-primaryHover transition-all shadow-xl flex items-center gap-2">
                Launch App
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </a>
            <a href="#fees">
              <button className="border border-border text-textPrimary px-7 py-3.5 rounded-full text-sm font-semibold hover:border-primary hover:bg-surfaceAlt/30 transition-all">
                Full fee table
              </button>
            </a>
          </div>
        </div>
      </section>

      <section id="fees" className="py-20 px-6 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
              what you actually pay
            </p>
            <h2 className="font-display text-3xl md:text-4xl text-textPrimary mb-4">
              miner fees, in satoshis
            </h2>
            <p className="text-base text-textSecondary max-w-2xl mx-auto leading-relaxed">
              these are observed values on chipnet and mainnet at typical fee rates of 1 sat
              per byte. real fees vary slightly with utxo set size and number of token outputs.
            </p>
          </div>
          <div className="rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-surfaceAlt/50">
                <tr>
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-textMuted">
                    flow
                  </th>
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-textMuted">
                    typical miner fee
                  </th>
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-textMuted">
                    per action
                  </th>
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-textMuted">
                    payer
                  </th>
                </tr>
              </thead>
              <tbody>
                {FEE_TABLE.map((row, i) => (
                  <tr
                    key={row.flow}
                    className={`border-t border-border ${
                      i % 2 === 0 ? 'bg-surface' : 'bg-surface/60'
                    }`}
                  >
                    <td className="px-6 py-4 text-sm text-textPrimary">{row.flow}</td>
                    <td className="px-6 py-4 text-sm font-mono text-brand300">{row.typical}</td>
                    <td className="px-6 py-4 text-sm text-textSecondary">{row.perAction}</td>
                    <td className="px-6 py-4 text-sm text-textSecondary">{row.payer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 p-5 rounded-2xl border border-border bg-surfaceAlt/30 flex items-start gap-4">
            <Calculator className="w-5 h-5 text-brand300 mt-1 flex-shrink-0" />
            <p className="text-sm text-textSecondary leading-relaxed">
              one satoshi is one hundred millionth of a bch. at usd 400 / bch, a 700 sat fee is
              roughly usd 0.0028 - under three tenths of a cent. an airdrop to 5,000 recipients
              would cost around 6 usd in total miner fees.
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 px-6 lg:px-12 bg-surfaceAlt/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
              compared to alternatives
            </p>
            <h2 className="font-display text-3xl md:text-4xl text-textPrimary">
              flowguard vs ethereum-native treasury tools
            </h2>
          </div>
          <div className="rounded-2xl border border-border overflow-hidden bg-surface">
            <table className="w-full text-left">
              <thead className="bg-surfaceAlt/50">
                <tr>
                  <th className="px-4 py-4 text-xs font-mono uppercase tracking-wider text-textMuted">
                    feature
                  </th>
                  <th className="px-4 py-4 text-xs font-mono uppercase tracking-wider text-brand300">
                    flowguard
                  </th>
                  <th className="px-4 py-4 text-xs font-mono uppercase tracking-wider text-textMuted">
                    sablier
                  </th>
                  <th className="px-4 py-4 text-xs font-mono uppercase tracking-wider text-textMuted">
                    llama
                  </th>
                  <th className="px-4 py-4 text-xs font-mono uppercase tracking-wider text-textMuted">
                    superfluid
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row, i) => (
                  <tr
                    key={row.feature}
                    className={`border-t border-border ${
                      i % 2 === 0 ? '' : 'bg-surfaceAlt/20'
                    }`}
                  >
                    <td className="px-4 py-4 text-sm text-textPrimary">{row.feature}</td>
                    <td className="px-4 py-4 text-sm text-brand300 font-medium">
                      {row.flowguard}
                    </td>
                    <td className="px-4 py-4 text-sm text-textSecondary">{row.sablier}</td>
                    <td className="px-4 py-4 text-sm text-textSecondary">{row.llama}</td>
                    <td className="px-4 py-4 text-sm text-textSecondary">{row.superfluid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-textMuted mt-4 text-center font-mono">
            comparison reflects publicly documented pricing as of march 2026. ethereum gas
            estimates assume a base fee of 25 gwei.
          </p>
        </div>
      </section>

      <section className="py-20 px-6 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
              hosted or self-hosted
            </p>
            <h2 className="font-display text-3xl md:text-4xl text-textPrimary">
              both options are free
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {HOSTING_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <div
                  key={opt.title}
                  className="p-8 rounded-2xl border border-border bg-surface relative overflow-hidden"
                >
                  <NoiseBackground />
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-brand300/10 border border-brand300/30 flex items-center justify-center">
                        <Icon className="w-6 h-6 text-brand300" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-textPrimary text-xl">{opt.title}</h3>
                        <p className="text-2xl font-display text-brand300">{opt.price}</p>
                      </div>
                    </div>
                    <p className="text-sm text-textSecondary leading-relaxed mb-5">{opt.body}</p>
                    <ul className="space-y-2 mb-6">
                      {opt.bullets.map((b) => (
                        <li key={b} className="flex items-start gap-2 text-sm text-textSecondary">
                          <Check className="w-4 h-4 text-brand300 mt-0.5 flex-shrink-0" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                    <a
                      href={opt.cta.href}
                      target={opt.cta.external ? '_blank' : undefined}
                      rel={opt.cta.external ? 'noopener noreferrer' : undefined}
                      className="inline-flex items-center gap-2 text-sm font-medium text-brand300 hover:text-brand300/80 transition-colors"
                    >
                      {opt.cta.label}
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 px-6 lg:px-12 bg-surfaceAlt/30">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
              pricing questions
            </p>
            <h2 className="font-display text-3xl md:text-4xl text-textPrimary">
              the small print, plainly
            </h2>
          </div>
          <div className="space-y-4">
            {FAQ.map((item) => (
              <div
                key={item.q}
                className="p-6 rounded-2xl border border-border bg-surface"
              >
                <p className="font-medium text-textPrimary mb-2">{item.q}</p>
                <p className="text-sm text-textSecondary leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
