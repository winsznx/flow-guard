import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Wallet,
  Lock,
  Boxes,
  Users,
  Receipt,
  ShieldCheck,
  Layers,
  Clock,
  GitBranch,
  Sparkles,
  Code2,
} from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { SolutionsDropdown } from '../components/ui/SolutionsDropdown';
import { ResourcesDropdown } from '../components/ui/ResourcesDropdown';
import { NoiseBackground } from '../components/ui/NoiseBackground';
import { PageMeta } from '../components/seo/PageMeta';
import { APP_SITE_URL, DOCS_SITE_URL } from '../utils/publicUrls';

// TODO(design): replace illustrative SVG placeholders in each section with
// final diagram assets - see /public/diagrams/* once the design pass ships.

interface Section {
  id: string;
  eyebrow: string;
  title: string;
  icon: typeof Wallet;
  diagramAlt: string;
  paragraphs: string[];
  bullets: { label: string; detail: string }[];
}

const SECTIONS: Section[] = [
  {
    id: 'wallets-not-servers',
    eyebrow: '01 - custody',
    title: 'wallets, not servers',
    icon: Wallet,
    diagramAlt: 'a user wallet signing a transaction that posts to a covenant address on bitcoin cash',
    paragraphs: [
      'flowguard never holds your keys. every action that moves funds - depositing into a vault, creating a stream, claiming a payout, sweeping a refund - is a bitcoin cash transaction signed by your own wallet. we cannot reverse it. we cannot move funds without your signature. we cannot pause your stream because we disagree with you.',
      'the flowguard server exists to make this convenient. it indexes the chain, calculates schedules, hands you pre-built transactions to sign, and remembers your team. but the source of truth is the chain, and the source of authority is your wallet.',
    ],
    bullets: [
      {
        label: 'self-custody by default',
        detail: 'no seed phrases, no exports, no escrow accounts. your wallet is the only place a private key ever exists.',
      },
      {
        label: 'wallet-bound sessions',
        detail: 'session tokens are signed by your wallet on login. they cannot be replayed against a different address.',
      },
      {
        label: 'offline-safe',
        detail: 'if flowguard.cash goes dark, your funds are still claimable. the covenant rules live on bch, not on our server.',
      },
    ],
  },
  {
    id: 'covenants',
    eyebrow: '02 - rules on chain',
    title: 'covenants on-chain',
    icon: Lock,
    diagramAlt: 'a covenant utxo with a locking script enforcing schedule, beneficiary, and authority',
    paragraphs: [
      'a flowguard vault is a covenant - a bitcoin cash utxo locked by a cashscript contract. the script encodes the rules of the workflow: who can spend, when they can spend, what fraction is unlocked, and what the refund path is. the rules are part of the address. once funds are sent to that address, the rules apply to every output that spends from it.',
      'this is fundamentally different from an eoa with a multisig wrapper. there is no off-chain ruleset that a malicious signer can ignore. the script must be satisfied for the spend to be mined at all. if your covenant says payouts unlock linearly over 18 months, then a spend that tries to take 100% on day one is invalid as a bitcoin cash transaction and miners will reject it.',
    ],
    bullets: [
      {
        label: 'rules baked into the address',
        detail: 'the locking script is the address. you cannot change one without changing the other.',
      },
      {
        label: 'no protocol kill switch',
        detail: 'we do not have an admin key, a pause flag, a migration hook, or a fee skim. there is nothing to compromise.',
      },
      {
        label: 'auditable bytecode',
        detail: 'every covenant template is open source. the bytecode you sign over is reproducible from the published source.',
      },
    ],
  },
  {
    id: 'mutable-nft-state',
    eyebrow: '03 - mutable state',
    title: 'mutable nft state',
    icon: Boxes,
    diagramAlt: 'a single anchor utxo carrying mutable cashtokens nft state across stream lifecycle',
    paragraphs: [
      'long-running workflows like vesting, streams, and grants need state that updates over time: how much has been claimed, what the next unlock height is, which recipients have been paid. on most chains that state lives in a contract storage slot. on bitcoin cash, cashtokens give us a different option: state lives on the utxo itself.',
      'flowguard parks a single anchor utxo per workflow. that utxo carries a non-fungible cashtoken with a small payload in its commitment field - the mutable state. every legal action on the workflow consumes the anchor utxo and produces a new one with updated state. the chain enforces a single, ordered history of state transitions without us having to lean on any off-chain ordering authority.',
    ],
    bullets: [
      {
        label: 'one anchor utxo per workflow',
        detail: 'a stream, a vault, a budget plan - each owns a single anchor whose history is the workflow history.',
      },
      {
        label: 'commitment-encoded payload',
        detail: 'state changes are compact: typically tens of bytes, not a contract-storage write.',
      },
      {
        label: 'no race conditions',
        detail: 'utxo consumption is atomic. two conflicting transitions cannot both be mined.',
      },
    ],
  },
  {
    id: 'authority-models',
    eyebrow: '04 - who can act',
    title: 'authority models',
    icon: Users,
    diagramAlt: 'comparison of creator-only authority versus m-of-n co-signer authority on a covenant',
    paragraphs: [
      'flowguard supports two authority models out of the box. the right choice depends on the trust profile of the workflow. a personal vesting schedule for a single founder is almost always creator-only. a treasury holding a daos working capital almost always wants co-signers.',
      'in either case, authority is a property of the covenant - encoded as a set of public keys in the locking script. you cannot add a signer after the fact without migrating to a new covenant. that is a deliberate constraint: a workflow whose signer set could change silently is a workflow whose security depends on a moderator, not on the chain.',
    ],
    bullets: [
      {
        label: 'creator-only',
        detail: 'a single signer authorizes all actions. simplest model. appropriate for personal savings, single-founder vesting, or self-paid streams.',
      },
      {
        label: 'm-of-n co-signers',
        detail: 'a threshold of signers must approve. appropriate for daos, multi-founder treasuries, and any workflow with shared accountability.',
      },
      {
        label: 'role-bound permissions',
        detail: 'some flows expose narrower roles - for example, a claimant whose only power is to take their own scheduled payout.',
      },
    ],
  },
  {
    id: 'receipts-bcmr',
    eyebrow: '05 - proof of position',
    title: 'receipt nfts and bcmr',
    icon: Receipt,
    diagramAlt: 'a receipt nft minted to a recipient, decorated with bcmr metadata in the wallet',
    paragraphs: [
      'when you become a recipient in a flowguard workflow - a vesting allocation, a payroll seat, an airdrop entry, a bounty winner - you receive a receipt nft. the receipt is a cashtokens nft that proves your position on chain. it lives in your wallet. it can be transferred (where the workflow allows). it is the artifact you present when you claim.',
      'the receipt is decorated with bcmr metadata so wallets render it with a real name, a workflow icon, and a description of what it represents. bcmr (bitcoin cash metadata registry) is an off-chain pointer that turns a token category id into a human-readable identity. flowguard publishes a signed registry per workflow so receipts show up correctly across every cashtokens-aware wallet.',
    ],
    bullets: [
      {
        label: 'self-sovereign proof',
        detail: 'no flowguard account is required to hold or transfer a receipt. it is a token in your wallet.',
      },
      {
        label: 'wallet-rendered identity',
        detail: 'bcmr maps category ids to icons and titles so a receipt is not just a hex blob.',
      },
      {
        label: 'composable',
        detail: 'receipt nfts can be used in other protocols as collateral, as voting weight, or as eligibility checks.',
      },
    ],
  },
];

const LIFECYCLE = [
  {
    step: '01',
    title: 'create',
    body: 'pick a workflow template. supply the schedule, recipients, and authority. flowguard builds the covenant and shows you the address.',
    icon: Sparkles,
  },
  {
    step: '02',
    title: 'fund',
    body: 'send bch or cashtokens to the covenant address from your wallet. funds are now locked under the workflow rules.',
    icon: Layers,
  },
  {
    step: '03',
    title: 'unlock',
    body: 'as scheduled time passes, the covenant permits claims. an executor (ours or yours) can post unlock transactions, or recipients can do it themselves.',
    icon: Clock,
  },
  {
    step: '04',
    title: 'claim',
    body: 'recipients sign a claim transaction with their wallet. funds move from the covenant to their address. the receipt nft is updated to reflect the new balance.',
    icon: Receipt,
  },
  {
    step: '05',
    title: 'close',
    body: 'when the workflow runs out - vesting fully released, payroll term ended, airdrop expired - any leftover funds follow the refund path written into the covenant.',
    icon: GitBranch,
  },
];

const TRUST_BOUNDARIES = [
  {
    title: 'you trust the chain',
    body: 'bitcoin cash miners must process your transactions and respect the consensus rules. this is the same trust assumption as holding bch in any wallet.',
    icon: ShieldCheck,
  },
  {
    title: 'you trust the covenant code',
    body: 'the cashscript that locks your funds must be correct. we publish source, bytecode, and tests. external audits cover the production templates.',
    icon: Code2,
  },
  {
    title: 'you do not have to trust us',
    body: 'flowguard the company can go offline, get acquired, or stop shipping. your covenants keep working because the rules live on bch.',
    icon: Lock,
  },
];

interface DiagramPlaceholderProps {
  alt: string;
  index: number;
}

function DiagramPlaceholder({ alt, index }: DiagramPlaceholderProps) {
  const tones = [
    'from-brand300/15 to-accent/10',
    'from-accent/15 to-brand300/10',
    'from-primary/10 to-brand300/15',
  ];
  const tone = tones[index % tones.length];
  return (
    <div
      className={`relative aspect-[4/3] rounded-2xl border border-border bg-gradient-to-br ${tone} flex items-center justify-center overflow-hidden`}
      aria-label={alt}
      role="img"
    >
      <NoiseBackground />
      <div className="relative z-10 text-center px-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-surface border border-border mb-4">
          <Layers className="w-6 h-6 text-brand300" />
        </div>
        <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-2">
          diagram
        </p>
        <p className="text-sm text-textSecondary leading-relaxed max-w-xs mx-auto">{alt}</p>
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <main className="bg-background min-h-screen">
      <PageMeta
        title="How FlowGuard Works"
        description="The covenant lifecycle, custody model, mutable NFT state, authority modes, and receipt NFTs that make FlowGuard a self-custodial treasury layer on Bitcoin Cash."
        path="/how-it-works"
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
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand300/10 border border-brand300/30 mb-6"
          >
            <Layers className="w-4 h-4 text-brand300" />
            <span className="text-sm font-medium text-brand300">how flowguard works</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-display text-5xl md:text-7xl mb-6 text-textPrimary leading-tight"
          >
            covenants, receipts, and a wallet you own
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-textSecondary mb-10 max-w-3xl mx-auto leading-relaxed"
          >
            flowguard turns bitcoin cash into a programmable treasury layer. funds live in
            covenants, state lives in mutable cashtokens nfts, and authority lives in your
            wallet. nothing in the middle that can override your rules.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <a href={APP_SITE_URL}>
              <button className="group bg-primary text-white px-8 py-4 rounded-full text-base font-semibold hover:bg-primaryHover transition-all shadow-2xl hover:shadow-brand300/20 flex items-center gap-3">
                Launch App
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </a>
            <Link to="/security">
              <button className="border-2 border-border text-textPrimary px-8 py-4 rounded-full text-base font-semibold hover:border-primary hover:bg-surfaceAlt/30 transition-all">
                See the security model
              </button>
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="py-16 px-6 lg:px-12 bg-surfaceAlt/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
              the lifecycle
            </p>
            <h2 className="font-display text-3xl md:text-4xl text-textPrimary">
              five steps from idea to claimed funds
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {LIFECYCLE.map((step) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.step}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="p-5 rounded-2xl bg-surface border border-border"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono text-textMuted">{step.step}</span>
                    <Icon className="w-5 h-5 text-brand300" />
                  </div>
                  <h3 className="font-semibold text-textPrimary mb-2">{step.title}</h3>
                  <p className="text-sm text-textSecondary leading-relaxed">{step.body}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {SECTIONS.map((section, idx) => {
        const Icon = section.icon;
        const isEven = idx % 2 === 0;
        return (
          <section
            key={section.id}
            id={section.id}
            className={`py-20 px-6 lg:px-12 ${isEven ? '' : 'bg-surfaceAlt/30'}`}
          >
            <div className="max-w-6xl mx-auto">
              <div
                className={`grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center ${
                  isEven ? '' : 'lg:[&>:first-child]:order-2'
                }`}
              >
                <motion.div
                  initial={{ opacity: 0, x: isEven ? -40 : 40 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                >
                  <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
                    {section.eyebrow}
                  </p>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-brand300/10 border border-brand300/30 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-brand300" />
                    </div>
                    <h2 className="font-display text-3xl md:text-4xl text-textPrimary">
                      {section.title}
                    </h2>
                  </div>
                  <div className="space-y-4 mb-8">
                    {section.paragraphs.map((p) => (
                      <p key={p.slice(0, 24)} className="text-base text-textSecondary leading-relaxed">
                        {p}
                      </p>
                    ))}
                  </div>
                  <div className="space-y-3">
                    {section.bullets.map((b) => (
                      <div
                        key={b.label}
                        className="p-4 rounded-xl border border-border bg-surface"
                      >
                        <p className="font-mono text-xs uppercase tracking-wider text-brand300 mb-1">
                          {b.label}
                        </p>
                        <p className="text-sm text-textSecondary leading-relaxed">{b.detail}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: isEven ? 40 : -40 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                >
                  <DiagramPlaceholder alt={section.diagramAlt} index={idx} />
                </motion.div>
              </div>
            </div>
          </section>
        );
      })}

      <section className="py-20 px-6 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
              trust boundaries
            </p>
            <h2 className="font-display text-3xl md:text-4xl text-textPrimary">
              what you actually have to trust
            </h2>
            <p className="text-base text-textSecondary mt-3 max-w-2xl mx-auto leading-relaxed">
              every protocol has assumptions. here are ours, written plainly, so you can decide
              if they fit your treasury.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TRUST_BOUNDARIES.map((b) => {
              const Icon = b.icon;
              return (
                <div
                  key={b.title}
                  className="p-6 rounded-2xl border border-border bg-surface"
                >
                  <div className="w-12 h-12 rounded-2xl bg-brand300/10 border border-brand300/30 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-brand300" />
                  </div>
                  <h3 className="font-semibold text-textPrimary text-lg mb-2">{b.title}</h3>
                  <p className="text-sm text-textSecondary leading-relaxed">{b.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-24 px-6 lg:px-12 bg-brand300/5">
        <NoiseBackground />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <h2 className="font-display text-4xl md:text-5xl mb-6 text-textPrimary">
            ready to put a rule on your treasury?
          </h2>
          <p className="text-xl text-textSecondary mb-10 leading-relaxed">
            launch the app, connect your wallet, and create your first covenant. you keep the
            keys. we hand you the tools.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href={APP_SITE_URL}>
              <button className="group bg-primary text-white px-12 py-6 rounded-full text-lg font-bold hover:bg-primaryHover transition-all shadow-2xl flex items-center gap-3 mx-auto">
                Launch App
                <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
              </button>
            </a>
            <a
              href={`${DOCS_SITE_URL}/concepts`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <button className="border-2 border-border text-textPrimary px-12 py-6 rounded-full text-lg font-bold hover:border-primary hover:bg-surfaceAlt/30 transition-all">
                Read the docs
              </button>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
