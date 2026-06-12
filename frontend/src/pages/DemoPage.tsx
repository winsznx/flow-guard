import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Wallet,
  Search,
  Coins,
  ExternalLink,
  Droplet,
} from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { SolutionsDropdown } from '../components/ui/SolutionsDropdown';
import { ResourcesDropdown } from '../components/ui/ResourcesDropdown';
import { PageMeta } from '../components/seo/PageMeta';
import {
  APP_SITE_URL,
  DOCS_SITE_URL,
  EXPLORER_SITE_URL,
} from '../utils/publicUrls';

interface DemoStep {
  index: string;
  icon: typeof Wallet;
  title: string;
  body: string;
  primary: { label: string; href: string; external?: boolean };
  secondary?: { label: string; href: string; external?: boolean };
}

const DEMO_STEPS: DemoStep[] = [
  {
    index: '01',
    icon: Wallet,
    title: 'Connect a chipnet wallet',
    body: 'Open the app, click Connect, pick Cashonize or Paytaca, and switch the wallet to chipnet. No mainnet funds touched.',
    primary: { label: 'Launch app', href: APP_SITE_URL, external: true },
    secondary: { label: 'Wallet setup', href: '#wallets' },
  },
  {
    index: '02',
    icon: Search,
    title: 'Open the Explorer',
    body: 'Browse live streams, vesting schedules, and airdrop claims on chipnet. Search any address to see its FlowGuard activity.',
    primary: { label: 'Open Explorer', href: EXPLORER_SITE_URL, external: true },
    secondary: {
      label: 'Sample stream',
      href: `${EXPLORER_SITE_URL}/streams`,
      external: true,
    },
  },
  {
    index: '03',
    icon: Coins,
    title: 'Create a test stream',
    body: 'Pick a token, set a 1-minute cliff and a 10-minute release, sign once, watch the unlocked balance tick up in real time.',
    primary: {
      label: 'Create stream',
      href: `${APP_SITE_URL}/streams/create`,
      external: true,
    },
    secondary: {
      label: 'Create airdrop',
      href: `${APP_SITE_URL}/airdrops/create`,
      external: true,
    },
  },
];

const CHIPNET_WALLETS = [
  {
    name: 'Cashonize',
    url: 'https://cashonize.com',
    detail: 'Browser wallet. Toggle chipnet under network settings. Fastest path for a first run.',
  },
  {
    name: 'Paytaca',
    url: 'https://paytaca.com',
    detail: 'Desktop and mobile. Full CashTokens support. Switch to chipnet under settings.',
  },
];

const FAUCETS = [
  {
    name: 'Chipnet faucet',
    url: 'https://chipnet.imaginary.cash',
    detail: 'Paste your chipnet address, get test BCH in under a minute.',
  },
  {
    name: 'TokenStork',
    url: 'https://tokenstork.com',
    detail: 'Mints test CashTokens, useful for vesting and airdrop runs.',
  },
];

export default function DemoPage() {
  return (
    <main className="bg-background min-h-screen">
      <PageMeta
        title="Try FlowGuard now"
        description="Connect a chipnet wallet, open the Explorer, and create a test stream. Interactive demo with deep links into the live app."
        path="/demo"
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
        <div className="max-w-3xl mx-auto text-center">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs font-mono uppercase tracking-[0.2em] text-brand300 mb-4"
          >
            Interactive demo
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="font-display text-5xl md:text-6xl mb-5 text-textPrimary leading-tight"
          >
            Try FlowGuard now
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-textSecondary leading-relaxed"
          >
            Three deep links into the live chipnet app. No screenshots, no walkthrough video,
            just the real product running on test BCH.
          </motion.p>
        </div>
      </section>

      <section className="pb-20 px-6 lg:px-12">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-6 text-center">
            What you can try
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {DEMO_STEPS.map((step, idx) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.08, duration: 0.5 }}
                  className="relative p-6 rounded-2xl border border-border bg-surface flex flex-col"
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className="w-11 h-11 rounded-xl bg-brand300/10 border border-brand300/30 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-brand300" />
                    </div>
                    <span className="text-xs font-mono text-textMuted">{step.index}</span>
                  </div>
                  <h3 className="font-display text-xl text-textPrimary mb-2">{step.title}</h3>
                  <p className="text-sm text-textSecondary leading-relaxed mb-6 flex-1">
                    {step.body}
                  </p>
                  <div className="flex flex-col gap-2">
                    {step.primary.external ? (
                      <a
                        href={step.primary.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-between gap-2 px-4 py-2.5 rounded-full bg-primary text-white text-sm font-medium hover:bg-primaryHover transition-colors"
                      >
                        {step.primary.label}
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    ) : (
                      <Link
                        to={step.primary.href}
                        className="inline-flex items-center justify-between gap-2 px-4 py-2.5 rounded-full bg-primary text-white text-sm font-medium hover:bg-primaryHover transition-colors"
                      >
                        {step.primary.label}
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    )}
                    {step.secondary &&
                      (step.secondary.external ? (
                        <a
                          href={step.secondary.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-between gap-2 px-4 py-2 text-xs font-medium text-textSecondary hover:text-textPrimary transition-colors"
                        >
                          {step.secondary.label}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <a
                          href={step.secondary.href}
                          className="inline-flex items-center justify-between gap-2 px-4 py-2 text-xs font-medium text-textSecondary hover:text-textPrimary transition-colors"
                        >
                          {step.secondary.label}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </a>
                      ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="wallets" className="py-16 px-6 lg:px-12 bg-surfaceAlt/30 border-y border-border/40">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-2">
                Setup
              </p>
              <h2 className="font-display text-3xl text-textPrimary">
                Need a chipnet wallet?
              </h2>
            </div>
            <p className="text-sm text-textSecondary max-w-md leading-relaxed">
              Install one of the wallets below, switch it to chipnet, then top up with the faucet.
              Test BCH is free and has no monetary value.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {CHIPNET_WALLETS.map((w) => (
              <a
                key={w.name}
                href={w.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block p-5 rounded-2xl border border-border bg-surface hover:border-brand300/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-brand300" />
                    <p className="font-semibold text-textPrimary">{w.name}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-textMuted group-hover:text-brand300 transition-colors" />
                </div>
                <p className="text-sm text-textSecondary leading-relaxed">{w.detail}</p>
              </a>
            ))}
          </div>

          <div className="flex items-start gap-3 p-5 rounded-2xl border border-brand300/20 bg-brand300/5">
            <Droplet className="w-5 h-5 text-brand300 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-textPrimary mb-3 leading-relaxed">
                Once your wallet is on chipnet, drip free test BCH from a faucet and you are ready
                to stream.
              </p>
              <div className="flex flex-wrap gap-2">
                {FAUCETS.map((f) => (
                  <a
                    key={f.name}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border text-xs font-medium text-textPrimary hover:border-brand300/50 transition-colors"
                    title={f.detail}
                  >
                    {f.name}
                    <ExternalLink className="w-3 h-3 text-textMuted" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
