import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Wallet,
  Droplet,
  Coins,
  Gift,
  Sparkles,
  ExternalLink,
  PlayCircle,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { SolutionsDropdown } from '../components/ui/SolutionsDropdown';
import { ResourcesDropdown } from '../components/ui/ResourcesDropdown';
import { NoiseBackground } from '../components/ui/NoiseBackground';
import { PageMeta } from '../components/seo/PageMeta';
import { APP_SITE_URL, DOCS_SITE_URL } from '../utils/publicUrls';

// TODO(design): replace ScreenshotPlaceholder with actual product captures
// once a fresh chipnet flow has been recorded - see /public/screenshots/*.

const CHIPNET_WALLETS = [
  {
    name: 'cashonize',
    url: 'https://cashonize.com',
    detail: 'browser wallet with chipnet toggle. fastest path for first-time users.',
  },
  {
    name: 'paytaca',
    url: 'https://paytaca.com',
    detail: 'desktop and mobile wallet with full cashtokens support. switch to chipnet under settings.',
  },
];

const FAUCETS = [
  {
    name: 'chipnet faucet',
    url: 'https://chipnet.imaginary.cash',
    detail: 'fastest. paste your chipnet address, get test bch in under a minute.',
  },
  {
    name: 'tokenstork faucet',
    url: 'https://tokenstork.com',
    detail: 'also mints test cashtokens - useful for vesting and airdrop demos.',
  },
];

interface Step {
  index: string;
  icon: typeof Wallet;
  eyebrow: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  cta: { label: string; href: string; external?: boolean };
  screenshotCaption: string;
}

const STEPS: Step[] = [
  {
    index: '01',
    icon: Wallet,
    eyebrow: 'step one',
    title: 'get a chipnet wallet',
    paragraphs: [
      'chipnet is the bitcoin cash testnet flowguard runs on. you need a wallet that supports cashtokens and can be switched into chipnet mode. cashonize is the simplest because it runs in your browser with no install.',
      'open cashonize, create a wallet, and write the seed phrase down somewhere safe. then open the network selector and pick chipnet. the address line should change to a chipnet-prefixed address starting with bchtest.',
    ],
    bullets: [
      'do not reuse a mainnet seed',
      'do not send mainnet bch to a chipnet address',
      'expect to have a working wallet in under 3 minutes',
    ],
    cta: { label: 'Open Cashonize', href: 'https://cashonize.com', external: true },
    screenshotCaption: 'cashonize wallet showing the network selector set to chipnet',
  },
  {
    index: '02',
    icon: Droplet,
    eyebrow: 'step two',
    title: 'get test bch',
    paragraphs: [
      'every flowguard action costs miner fees. on chipnet those fees are paid in test bch with no monetary value. the chipnet faucet drips test bch on demand - paste your chipnet address and click request.',
      'for vesting and airdrop demos you will also want some test cashtokens. tokenstork will mint a small balance of a test token to your address so you have something to vest, drop, or stream.',
    ],
    bullets: [
      'one faucet drip is enough for several test workflows',
      'if a faucet is rate-limited, try the other one',
      'top up again at any point - there is no cost',
    ],
    cta: {
      label: 'Chipnet faucet',
      href: 'https://chipnet.imaginary.cash',
      external: true,
    },
    screenshotCaption: 'chipnet faucet ui after a successful drip, showing the transaction id',
  },
  {
    index: '03',
    icon: Coins,
    eyebrow: 'step three',
    title: 'walk through a vesting stream',
    paragraphs: [
      'open app.flowguard.cash and connect your chipnet wallet. pick personal workspace if you are exploring solo, or organization if you want to mirror a multi-signer flow. from the dashboard, click create vesting stream.',
      'choose a token (your test cashtoken or test bch), pick a recipient address, set a cliff (try 1 minute for the demo) and a release duration (try 10 minutes). sign the create transaction in your wallet. the vesting stream appears in the dashboard with a live unlocked-balance counter.',
    ],
    bullets: [
      'demo schedule unlocks visibly in real time',
      'recipient can claim from their own wallet',
      'cancel the stream at any time to see the refund path',
    ],
    cta: { label: 'Take me to streams', href: `${APP_SITE_URL}/streams/create`, external: true },
    screenshotCaption: 'flowguard create-stream form on chipnet with cliff and duration set',
  },
  {
    index: '04',
    icon: Gift,
    eyebrow: 'step four',
    title: 'walk through an airdrop',
    paragraphs: [
      'back on the dashboard, choose create airdrop. supply a recipient list - for the demo, paste your own chipnet address as recipient with a small allocation. set an expiry block. sign the create transaction. flowguard generates a public claim page you can share.',
      'open the claim page in a new browser tab, connect a different chipnet address, and claim the allocation. funds move into the claimant address with one transaction. the airdrop dashboard reflects the new claimed total within a few seconds.',
    ],
    bullets: [
      'claim page works on mobile and desktop',
      'unclaimed allocations return after expiry',
      'every claim is a signed user transaction',
    ],
    cta: {
      label: 'Take me to airdrops',
      href: `${APP_SITE_URL}/airdrops/create`,
      external: true,
    },
    screenshotCaption: 'flowguard airdrop claim page on chipnet with a connected wallet',
  },
];

const WHY_DEMO_FIRST = [
  {
    icon: ShieldCheck,
    title: 'no money at risk',
    body: 'test bch and test cashtokens have no monetary value. you cannot accidentally lose real funds while exploring.',
  },
  {
    icon: Clock,
    title: 'short cycle times',
    body: 'set a 1-minute cliff and a 5-minute release window. flows that take months in production happen in real time on chipnet.',
  },
  {
    icon: Sparkles,
    title: 'identical surface',
    body: 'the dashboard, the wallet flow, the claim pages are identical to mainnet. nothing you learn here is wasted when you switch.',
  },
];

interface ScreenshotPlaceholderProps {
  caption: string;
  index: number;
}

function ScreenshotPlaceholder({ caption, index }: ScreenshotPlaceholderProps) {
  const tones = [
    'from-brand300/15 to-accent/10',
    'from-accent/15 to-brand300/10',
    'from-primary/10 to-brand300/15',
    'from-brand300/10 to-primary/10',
  ];
  const tone = tones[index % tones.length];
  return (
    <div
      className={`relative aspect-video rounded-2xl border border-border bg-gradient-to-br ${tone} flex flex-col items-center justify-center overflow-hidden`}
      role="img"
      aria-label={caption}
    >
      <NoiseBackground />
      <div className="relative z-10 text-center px-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-surface border border-border mb-4">
          <PlayCircle className="w-6 h-6 text-brand300" />
        </div>
        <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-2">
          screenshot
        </p>
        <p className="text-sm text-textSecondary leading-relaxed max-w-md">{caption}</p>
      </div>
    </div>
  );
}

export default function DemoPage() {
  return (
    <main className="bg-background min-h-screen">
      <PageMeta
        title="Try FlowGuard on Chipnet"
        description="Walk through vesting and airdrops with zero real-funds risk. Get a chipnet wallet, drip test BCH from the faucet, and create your first stream in minutes."
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

      <section className="pt-32 pb-16 px-6 lg:px-12">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand300/10 border border-brand300/30 mb-6"
          >
            <PlayCircle className="w-4 h-4 text-brand300" />
            <span className="text-sm font-medium text-brand300">try it without real funds</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-display text-5xl md:text-7xl mb-6 text-textPrimary leading-tight"
          >
            try flowguard on chipnet
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-textSecondary mb-10 max-w-3xl mx-auto leading-relaxed"
          >
            chipnet is the bitcoin cash testnet. everything works exactly like mainnet except
            the funds are not worth money. spin up a wallet, drip a faucet, and walk through
            vesting and airdrops in under 15 minutes.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <a href="#step-01">
              <button className="group bg-primary text-white px-8 py-4 rounded-full text-base font-semibold hover:bg-primaryHover transition-all shadow-2xl hover:shadow-brand300/20 flex items-center gap-3">
                Start the walkthrough
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </a>
            <a href={APP_SITE_URL}>
              <button className="border-2 border-border text-textPrimary px-8 py-4 rounded-full text-base font-semibold hover:border-primary hover:bg-surfaceAlt/30 transition-all">
                Skip - launch app
              </button>
            </a>
          </motion.div>
        </div>
      </section>

      <section className="py-16 px-6 lg:px-12 bg-surfaceAlt/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
              why a demo first
            </p>
            <h2 className="font-display text-3xl md:text-4xl text-textPrimary">
              what chipnet is good for
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {WHY_DEMO_FIRST.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="p-6 rounded-2xl border border-border bg-surface"
                >
                  <div className="w-12 h-12 rounded-2xl bg-brand300/10 border border-brand300/30 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-brand300" />
                  </div>
                  <h3 className="font-semibold text-textPrimary text-lg mb-2">{item.title}</h3>
                  <p className="text-sm text-textSecondary leading-relaxed">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const isEven = idx % 2 === 0;
        return (
          <section
            key={step.index}
            id={`step-${step.index}`}
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
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-mono uppercase tracking-wider text-textMuted">
                      {step.eyebrow}
                    </span>
                    <span className="text-xs font-mono text-brand300">/ {step.index}</span>
                  </div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-brand300/10 border border-brand300/30 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-brand300" />
                    </div>
                    <h2 className="font-display text-3xl md:text-4xl text-textPrimary">
                      {step.title}
                    </h2>
                  </div>
                  <div className="space-y-4 mb-6">
                    {step.paragraphs.map((p) => (
                      <p key={p.slice(0, 24)} className="text-base text-textSecondary leading-relaxed">
                        {p}
                      </p>
                    ))}
                  </div>
                  {step.bullets && (
                    <ul className="space-y-2 mb-6">
                      {step.bullets.map((b) => (
                        <li
                          key={b}
                          className="flex items-start gap-2 text-sm text-textSecondary leading-relaxed"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-brand300 mt-2 flex-shrink-0" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                  <a
                    href={step.cta.href}
                    target={step.cta.external ? '_blank' : undefined}
                    rel={step.cta.external ? 'noopener noreferrer' : undefined}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-brand300/10 border border-brand300/30 text-brand300 text-sm font-medium hover:bg-brand300/20 transition-colors"
                  >
                    {step.cta.label}
                    {step.cta.external ? (
                      <ExternalLink className="w-4 h-4" />
                    ) : (
                      <ArrowRight className="w-4 h-4" />
                    )}
                  </a>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: isEven ? 40 : -40 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                >
                  <ScreenshotPlaceholder caption={step.screenshotCaption} index={idx} />
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
              wallets and faucets
            </p>
            <h2 className="font-display text-3xl md:text-4xl text-textPrimary">
              quick links to everything you need
            </h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="font-display text-2xl text-textPrimary mb-4">chipnet wallets</h3>
              <div className="space-y-3">
                {CHIPNET_WALLETS.map((w) => (
                  <a
                    key={w.name}
                    href={w.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-5 rounded-2xl border border-border bg-surface hover:border-brand300/40 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-textPrimary">{w.name}</p>
                      <ExternalLink className="w-4 h-4 text-textMuted" />
                    </div>
                    <p className="text-sm text-textSecondary leading-relaxed">{w.detail}</p>
                  </a>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-display text-2xl text-textPrimary mb-4">faucets</h3>
              <div className="space-y-3">
                {FAUCETS.map((f) => (
                  <a
                    key={f.name}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-5 rounded-2xl border border-border bg-surface hover:border-brand300/40 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-textPrimary">{f.name}</p>
                      <ExternalLink className="w-4 h-4 text-textMuted" />
                    </div>
                    <p className="text-sm text-textSecondary leading-relaxed">{f.detail}</p>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-24 px-6 lg:px-12 bg-brand300/5">
        <NoiseBackground />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <h2 className="font-display text-4xl md:text-5xl mb-6 text-textPrimary">
            done with the demo? move to real funds
          </h2>
          <p className="text-xl text-textSecondary mb-10 leading-relaxed">
            mainnet uses the same dashboard, the same wallet flow, the same covenant rules. the
            only difference is the value of the satoshis you sign over.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href={APP_SITE_URL}>
              <button className="group bg-primary text-white px-12 py-6 rounded-full text-lg font-bold hover:bg-primaryHover transition-all shadow-2xl flex items-center gap-3 mx-auto">
                Launch App
                <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
              </button>
            </a>
            <Link to="/security">
              <button className="border-2 border-border text-textPrimary px-12 py-6 rounded-full text-lg font-bold hover:border-primary hover:bg-surfaceAlt/30 transition-all">
                Read the security model
              </button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
