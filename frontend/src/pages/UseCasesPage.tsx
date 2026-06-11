import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Coins,
  Users,
  PieChart,
  Gift,
  Trophy,
  Award,
  Sparkles,
  Vote,
  Building2,
  Briefcase,
  HeartHandshake,
} from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { SolutionsDropdown } from '../components/ui/SolutionsDropdown';
import { ResourcesDropdown } from '../components/ui/ResourcesDropdown';
import { NoiseBackground } from '../components/ui/NoiseBackground';
import { PageMeta } from '../components/seo/PageMeta';
import { APP_SITE_URL, DOCS_SITE_URL } from '../utils/publicUrls';

interface UseCase {
  id: string;
  icon: typeof Coins;
  category: 'distribute' | 'pay' | 'govern' | 'reward';
  title: string;
  oneLiner: string;
  scenario: string;
  audience: string;
  outcomes: string[];
  ctaLabel: string;
  ctaPath: string;
}

const USE_CASES: UseCase[] = [
  {
    id: 'token-vesting',
    icon: Coins,
    category: 'distribute',
    title: 'token vesting for presales and team allocations',
    oneLiner: 'release tokens on a schedule that no one can override.',
    scenario:
      'a project closes a seed round with 8 investors at staggered terms. each allocation has a 6-month cliff, then 18 months of linear unlock. the team holds an 8% allocation with a 12-month cliff. all 9 schedules live in one dashboard and unlock automatically through covenant rules.',
    audience: 'token-launching teams, presale operators, vesting administrators',
    outcomes: [
      'no excel spreadsheet of unlock dates',
      'no manual airdrop on each unlock day',
      'investors see their schedule live and claim themselves',
    ],
    ctaLabel: 'see vesting',
    ctaPath: '/vesting',
  },
  {
    id: 'recurring-payroll',
    icon: Users,
    category: 'pay',
    title: 'recurring payroll for a dao or remote team',
    oneLiner: 'pay contributors weekly or monthly without manually pushing buttons.',
    scenario:
      'a 12-person remote team pays salaries on the 1st and 15th of each month. each contributor has a usd-denominated stream rate that converts to bch at the time of unlock. multi-sig approval is required to change the rate or stop a stream, but the routine payouts happen on schedule with no human in the loop.',
    audience: 'daos, distributed engineering teams, agencies paying retainers',
    outcomes: [
      'no missed paydays during travel or sick leave',
      'on-chain proof of every payout',
      'stops by policy, not by a manual revoke',
    ],
    ctaLabel: 'see payroll',
    ctaPath: '/payroll',
  },
  {
    id: 'treasury-policy',
    icon: PieChart,
    category: 'govern',
    title: 'treasury policy with multi-signer approvals',
    oneLiner: 'set a monthly spending cap, an approval threshold, and category limits.',
    scenario:
      'a community treasury holds 2,500 bch and 1.4m of a project token. the dao agrees that no single category may exceed 15% of monthly outflow, that any payment over 1,000 usd requires 3-of-5 signer approval, and that operating spend rolls forward at 10% per month. these rules live in a budget plan that flowguard enforces on every spend.',
    audience: 'daos, foundations, community treasuries',
    outcomes: [
      'spending caps cannot be bypassed by a single keyholder',
      'over-cap proposals show up in the queue as blocked',
      'monthly reports are derived directly from on-chain history',
    ],
    ctaLabel: 'see budgeting',
    ctaPath: '/budgeting',
  },
  {
    id: 'mass-airdrop',
    icon: Gift,
    category: 'distribute',
    title: 'mass airdrops and claim flows',
    oneLiner: 'drop tokens to thousands of addresses with one signature.',
    scenario:
      'a cauldron-style token launch wants to airdrop 12,000 holders of a specific cashtokens nft. flowguard batches the distribution into a small number of transactions, publishes a claim page, and lets recipients claim themselves through their wallet. unclaimed allocations return to the creator after the expiry block.',
    audience: 'token projects, community managers, marketing leads',
    outcomes: [
      'thousands of recipients, single signature surface',
      'public claim page with countdown',
      'unclaimed share returns to treasury automatically',
    ],
    ctaLabel: 'see airdrops',
    ctaPath: '/airdrops',
  },
  {
    id: 'bounty-competitions',
    icon: Trophy,
    category: 'reward',
    title: 'bounty competitions with onchain settlement',
    oneLiner: 'open a bounty, escrow the prize, settle to the winner with a signature.',
    scenario:
      'an open-source maintainer posts a 500 usd bounty for a security fix. funds are escrowed in a flowguard bounty covenant. the maintainer reviews submissions, picks a winner, and the prize is released. if no submission is accepted within the deadline, the bounty refunds to the maintainer.',
    audience: 'open-source maintainers, hackathon hosts, growth teams',
    outcomes: [
      'no out-of-pocket payouts to chase',
      'public prize pool that contributors can verify',
      'automatic refund if no winner is selected',
    ],
    ctaLabel: 'see bounties',
    ctaPath: '/bounties',
  },
  {
    id: 'reward-distributions',
    icon: Award,
    category: 'reward',
    title: 'reward distributions to active contributors',
    oneLiner: 'periodically reward a list of contributors, weighted by your scoring rule.',
    scenario:
      'a developer community runs a quarterly reward round of 25,000 usd. contributions are scored off-chain (commits, reviews, docs). the resulting weight list is pushed into a flowguard reward program, contributors are notified, and each claims their slice from their own wallet. no individual transfers, no spreadsheet of addresses.',
    audience: 'developer relations, community managers, ecosystem programs',
    outcomes: [
      'weights are auditable on chain',
      'no operator handling private contributor info',
      'unclaimed rewards roll into the next cycle',
    ],
    ctaLabel: 'see rewards',
    ctaPath: '/rewards',
  },
  {
    id: 'multi-milestone-grants',
    icon: HeartHandshake,
    category: 'distribute',
    title: 'multi-milestone grants',
    oneLiner: 'fund builders against milestones - release only after work lands.',
    scenario:
      'a foundation grants 80,000 usd to a team building a public-good indexer. the grant is split into 4 milestones at 20,000 each. each milestone has a deliverable and a reviewer. when the reviewer approves a milestone, the next tranche unlocks. the foundation can revoke the unspent balance at any milestone boundary if the project stalls.',
    audience: 'grant programs, foundations, ecosystem funds',
    outcomes: [
      'no upfront wire of the full grant',
      'reviewer authority is on chain, not in email',
      'clear cancellation point at every milestone',
    ],
    ctaLabel: 'see grants',
    ctaPath: '/grants-info',
  },
  {
    id: 'vote-locking',
    icon: Vote,
    category: 'govern',
    title: 'vote-locking governance',
    oneLiner: 'lock tokens to participate in a proposal - release after the vote resolves.',
    scenario:
      'a dao runs a proposal cycle every two weeks. token holders lock voting weight for the duration of a proposal window. votes are weighted by lock amount and time. once the proposal resolves, tokens unlock and return to the holder. no off-chain vote tally that can be disputed.',
    audience: 'daos, governance-active token projects, foundations',
    outcomes: [
      'voting weight is provable on chain',
      'no snapshot off-chain registry to trust',
      'proposal outcomes are bound to a settlement transaction',
    ],
    ctaLabel: 'see governance',
    ctaPath: '/governance-info',
  },
];

const CATEGORY_FILTERS: { id: 'all' | UseCase['category']; label: string; description: string }[] = [
  { id: 'all', label: 'all use cases', description: 'every flowguard workflow on one page.' },
  {
    id: 'distribute',
    label: 'distribute',
    description: 'one-to-many flows - vesting, airdrops, grants.',
  },
  {
    id: 'pay',
    label: 'pay',
    description: 'recurring payments, payroll, scheduled streams.',
  },
  {
    id: 'govern',
    label: 'govern',
    description: 'policy, signer thresholds, proposal-driven spend.',
  },
  {
    id: 'reward',
    label: 'reward',
    description: 'bounties, rewards, contribution-weighted distributions.',
  },
];

const PARTNERS = [
  {
    icon: Building2,
    title: 'for foundations',
    body: 'multi-milestone grants, transparent treasury policy, audit-friendly history.',
  },
  {
    icon: Briefcase,
    title: 'for project teams',
    body: 'vesting, payroll, runway management, and contributor rewards in one place.',
  },
  {
    icon: Users,
    title: 'for communities',
    body: 'airdrops, bounty programs, governance proposals, and reward distributions.',
  },
];

export default function UseCasesPage() {
  return (
    <main className="bg-background min-h-screen">
      <PageMeta
        title="Use Cases"
        description="Token vesting, recurring payroll, treasury policy, mass airdrops, bounties, rewards, grants, and on-chain governance - all on Bitcoin Cash."
        path="/use-cases"
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

      <section className="pt-32 pb-12 px-6 lg:px-12">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand300/10 border border-brand300/30 mb-6"
          >
            <Sparkles className="w-4 h-4 text-brand300" />
            <span className="text-sm font-medium text-brand300">use cases</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-display text-5xl md:text-7xl mb-6 text-textPrimary leading-tight"
          >
            one protocol,
            <br />
            <span className="text-brand300">eight common workflows</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-textSecondary mb-10 max-w-3xl mx-auto leading-relaxed"
          >
            flowguard composes covenants, streams, and receipts into a small set of treasury
            workflows that cover most of what real teams need to do with money. pick the one
            that fits your problem.
          </motion.p>
        </div>
      </section>

      <section className="px-6 lg:px-12 pb-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-wrap gap-3 justify-center">
            {CATEGORY_FILTERS.map((cat) => (
              <a
                key={cat.id}
                href={cat.id === 'all' ? '#cases' : `#cat-${cat.id}`}
                className="px-4 py-2 rounded-full border border-border bg-surface text-sm text-textSecondary hover:border-brand300 hover:text-brand300 transition-colors"
                title={cat.description}
              >
                {cat.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <section id="cases" className="py-12 px-6 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {USE_CASES.map((uc, index) => {
              const Icon = uc.icon;
              return (
                <motion.div
                  id={`cat-${uc.category}`}
                  key={uc.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: (index % 4) * 0.05 }}
                  className="group relative p-8 rounded-2xl border border-border bg-surface hover:border-brand300/40 transition-colors"
                >
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-12 h-12 rounded-2xl bg-brand300/10 border border-brand300/30 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-brand300" />
                    </div>
                    <span className="text-xs font-mono uppercase tracking-wider text-textMuted">
                      {uc.category}
                    </span>
                  </div>
                  <h2 className="font-display text-2xl text-textPrimary mb-2 leading-tight">
                    {uc.title}
                  </h2>
                  <p className="text-base text-brand300 mb-5 leading-relaxed">{uc.oneLiner}</p>
                  <p className="text-sm text-textSecondary leading-relaxed mb-5">{uc.scenario}</p>
                  <div className="mb-5 pb-5 border-b border-border">
                    <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-2">
                      for
                    </p>
                    <p className="text-sm text-textPrimary">{uc.audience}</p>
                  </div>
                  <div className="mb-6">
                    <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
                      outcomes
                    </p>
                    <ul className="space-y-2">
                      {uc.outcomes.map((o) => (
                        <li
                          key={o}
                          className="flex items-start gap-2 text-sm text-textSecondary leading-relaxed"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-brand300 mt-2 flex-shrink-0" />
                          {o}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Link
                    to={uc.ctaPath}
                    className="inline-flex items-center gap-2 text-sm font-medium text-brand300 hover:text-brand300/80 transition-colors"
                  >
                    {uc.ctaLabel}
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 px-6 lg:px-12 bg-surfaceAlt/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
              who flowguard is for
            </p>
            <h2 className="font-display text-3xl md:text-4xl text-textPrimary">
              three constituencies, one stack
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PARTNERS.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.title}
                  className="p-6 rounded-2xl border border-border bg-surface text-center"
                >
                  <div className="w-12 h-12 rounded-2xl bg-brand300/10 border border-brand300/30 flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-6 h-6 text-brand300" />
                  </div>
                  <h3 className="font-semibold text-textPrimary text-lg mb-2">{p.title}</h3>
                  <p className="text-sm text-textSecondary leading-relaxed">{p.body}</p>
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
            do not see your workflow yet?
          </h2>
          <p className="text-xl text-textSecondary mb-10 leading-relaxed">
            most treasury workflows compose from the same primitives. tell us yours - we will
            tell you which combination of streams, covenants, and receipts fits.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/help">
              <button className="group bg-primary text-white px-12 py-6 rounded-full text-lg font-bold hover:bg-primaryHover transition-all shadow-2xl flex items-center gap-3 mx-auto">
                Get in touch
                <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
              </button>
            </Link>
            <a href={APP_SITE_URL}>
              <button className="border-2 border-border text-textPrimary px-12 py-6 rounded-full text-lg font-bold hover:border-primary hover:bg-surfaceAlt/30 transition-all">
                Launch App
              </button>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
