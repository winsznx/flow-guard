import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  ChevronDown,
  Mail,
  Send,
  Twitter,
  Github,
  Youtube,
  BookOpen,
  Activity,
  Wallet,
  AlertTriangle,
  RefreshCw,
  FileQuestion,
  ShieldQuestion,
  LifeBuoy,
} from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { SolutionsDropdown } from '../components/ui/SolutionsDropdown';
import { ResourcesDropdown } from '../components/ui/ResourcesDropdown';
import { NoiseBackground } from '../components/ui/NoiseBackground';
import { PageMeta } from '../components/seo/PageMeta';
import { APP_SITE_URL, DOCS_SITE_URL } from '../utils/publicUrls';

const SUPPORT_EMAIL = 'support@flowguard.cash';
const SECURITY_EMAIL = 'security@flowguard.cash';

// TODO(product): confirm canonical handles for telegram, x, youtube, github before launch.
// these placeholder links should be updated by phase 3 if any url has changed.

interface ChannelCard {
  icon: typeof Mail;
  title: string;
  detail: string;
  cta: { label: string; href: string };
  responseTime: string;
}

const CHANNELS: ChannelCard[] = [
  {
    icon: Mail,
    title: 'email support',
    detail:
      'for account questions, billing-not-applicable questions, integration help, and general triage. attach a wallet address and the transaction id if relevant.',
    cta: { label: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
    responseTime: 'within 1 business day',
  },
  {
    icon: ShieldQuestion,
    title: 'security disclosure',
    detail:
      'for any potential vulnerability, exposed data, or unsafe behaviour. do not file public issues. coordinate with us first.',
    cta: { label: SECURITY_EMAIL, href: `mailto:${SECURITY_EMAIL}` },
    responseTime: 'within 24 hours',
  },
  {
    icon: Send,
    title: 'telegram community',
    detail:
      'general chat, build-in-public threads, and the fastest path to a quick answer from the team or other operators.',
    cta: { label: 't.me/flowguard_cash', href: 'https://t.me/flowguard_cash' },
    responseTime: 'minutes during waking hours',
  },
  {
    icon: Twitter,
    title: 'x (twitter)',
    detail:
      'shipping updates, postmortems, and protocol news. dm is open but slower than email or telegram for triage.',
    cta: { label: '@flowguard_cash', href: 'https://x.com/flowguard_cash' },
    responseTime: 'best effort',
  },
];

interface ResourceCard {
  icon: typeof BookOpen;
  title: string;
  detail: string;
  href: string;
  external: boolean;
}

const RESOURCES: ResourceCard[] = [
  {
    icon: BookOpen,
    title: 'documentation',
    detail: 'concepts, guides, api reference, sdk reference. start here for anything technical.',
    href: DOCS_SITE_URL,
    external: true,
  },
  {
    icon: Activity,
    title: 'system status',
    detail: 'is the executor online? is the indexer caught up? real-time component health.',
    href: '/status',
    external: false,
  },
  {
    icon: FileQuestion,
    title: 'frequently asked',
    detail: 'short answers to the most common questions about flowguard, bch, and cashtokens.',
    href: '/faq',
    external: false,
  },
  {
    icon: Github,
    title: 'github',
    detail: 'open source contracts, indexer, dashboard, and sdks. issues and prs welcome.',
    href: 'https://github.com/flowguard',
    external: true,
  },
  {
    icon: Youtube,
    title: 'youtube',
    detail: 'walkthrough videos, recorded office hours, conference talks.',
    href: 'https://youtube.com/@flowguard',
    external: true,
  },
  {
    icon: Wallet,
    title: 'wallet help',
    detail: 'setting up paytaca or cashonize, switching networks, getting test bch.',
    href: '/demo',
    external: false,
  },
];

interface Troubleshoot {
  icon: typeof AlertTriangle;
  symptom: string;
  diagnose: string[];
  fix: string[];
}

const TROUBLESHOOTING: Troubleshoot[] = [
  {
    icon: Wallet,
    symptom: 'my wallet will not connect',
    diagnose: [
      'wallet extension is installed but disabled in the browser',
      'wallet is on mainnet and the dashboard is on chipnet (or vice versa)',
      'a previous session is still locked in the browser storage',
      'pop-up was blocked by the browser',
    ],
    fix: [
      'open the wallet extension and confirm it is unlocked',
      'switch the wallet network to match the dashboard banner',
      'in the connect modal, click "reset session" and try again',
      'allow pop-ups for flowguard.cash and reload',
    ],
  },
  {
    icon: RefreshCw,
    symptom: 'signature request never appears',
    diagnose: [
      'wallet pop-up was blocked',
      'wallet is locked and waiting for a passphrase',
      'browser is intercepting the request because of an extension conflict',
    ],
    fix: [
      'click the wallet extension icon - the pending request is usually queued there',
      'unlock the wallet, retry the action',
      'disable other web3 wallet extensions and reload',
    ],
  },
  {
    icon: AlertTriangle,
    symptom: 'transaction broadcast failed',
    diagnose: [
      'wallet does not have enough bch for miner fees',
      'a competing utxo was just spent - the transaction references stale state',
      'cashtokens are missing from the wallet output set because the wallet version is old',
    ],
    fix: [
      'fund the wallet with a small amount of bch (a few thousand sats is plenty)',
      'refresh the dashboard, rebuild the transaction, and resign',
      'update paytaca or cashonize to the latest version',
    ],
  },
  {
    icon: ShieldQuestion,
    symptom: 'i was logged out unexpectedly',
    diagnose: [
      'session bearer expired (we expire on a fixed window)',
      'wallet address changed in the wallet (multi-account wallet)',
      'browser cleared local storage',
    ],
    fix: [
      'click connect again - a new session signature will issue',
      'select the address that owns the workspace and reconnect',
      'check that your browser is not blocking site storage for flowguard.cash',
    ],
  },
  {
    icon: RefreshCw,
    symptom: 'a stream balance looks wrong on the dashboard',
    diagnose: [
      'indexer is behind the chain head (rare, usually a few seconds during reorgs)',
      'a manual claim happened in another tab',
      'the dashboard cache is stale',
    ],
    fix: [
      'check /status for indexer lag',
      'click refresh on the stream detail page',
      'verify the actual on-chain state by looking up the utxo on the explorer',
    ],
  },
  {
    icon: AlertTriangle,
    symptom: 'i sent funds to the wrong covenant address',
    diagnose: [
      'covenant addresses look similar across workflows. the only difference is the locking script.',
      'if you signed the transaction in your wallet, it has been broadcast.',
    ],
    fix: [
      'every covenant address has a defined refund path - emailing support@flowguard.cash with the transaction id will get you a recovery analysis.',
      'if the covenant rules permit a sweep, we can guide you through it. if they do not, the funds may be stuck.',
      'do not rebroadcast or attempt a manual transaction without us - that risks a permanent lock.',
    ],
  },
];

interface FaqShortItem {
  q: string;
  a: string;
}

const QUICK_QUESTIONS: FaqShortItem[] = [
  {
    q: 'is flowguard available on mainnet?',
    a: 'see the banner at the top of the marketing site for the current network. when we flip to mainnet, every page will reflect it.',
  },
  {
    q: 'do i need a flowguard account?',
    a: 'no. your wallet is your account. you sign in with a wallet signature. there is no email/password.',
  },
  {
    q: 'i cannot find my workspace',
    a: 'workspaces are bound to wallet addresses. connect with the wallet that created the workspace. if you suspect a wallet was switched, check the wallet address shown next to the workspace selector.',
  },
  {
    q: 'where do i see the audit report?',
    a: 'see the security page for the audit summary and timeline. external audit pdfs and hashes are linked there as they land.',
  },
];

export default function HelpPage() {
  const [openTroubleshoot, setOpenTroubleshoot] = useState<number | null>(0);

  return (
    <main className="bg-background min-h-screen">
      <PageMeta
        title="Help and Support"
        description="Reach FlowGuard support, browse the community channels, find documentation, check the status page, and walk through common troubleshooting steps."
        path="/help"
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
            <LifeBuoy className="w-4 h-4 text-brand300" />
            <span className="text-sm font-medium text-brand300">help center</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-display text-5xl md:text-7xl mb-6 text-textPrimary leading-tight"
          >
            we are here when you need us
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-textSecondary mb-10 max-w-3xl mx-auto leading-relaxed"
          >
            a small team answers every message. start with the troubleshooting list below - most
            issues resolve there. if it does not help, email support or jump into telegram.
          </motion.p>
        </div>
      </section>

      <section className="py-12 px-6 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
              get in touch
            </p>
            <h2 className="font-display text-3xl md:text-4xl text-textPrimary">
              channels, ordered by speed
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {CHANNELS.map((c) => {
              const Icon = c.icon;
              return (
                <a
                  key={c.title}
                  href={c.cta.href}
                  target={c.cta.href.startsWith('http') ? '_blank' : undefined}
                  rel={c.cta.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="group p-6 rounded-2xl border border-border bg-surface hover:border-brand300/40 transition-colors block"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-2xl bg-brand300/10 border border-brand300/30 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-brand300" />
                    </div>
                    <h3 className="font-semibold text-textPrimary text-lg">{c.title}</h3>
                  </div>
                  <p className="text-sm text-textSecondary leading-relaxed mb-4">{c.detail}</p>
                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <span className="text-sm font-mono text-brand300">{c.cta.label}</span>
                    <span className="text-xs font-mono uppercase tracking-wider text-textMuted">
                      {c.responseTime}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 px-6 lg:px-12 bg-surfaceAlt/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
              self-serve
            </p>
            <h2 className="font-display text-3xl md:text-4xl text-textPrimary">
              before you write to us
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {RESOURCES.map((r) => {
              const Icon = r.icon;
              const body = (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-brand300/10 border border-brand300/30 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-brand300" />
                    </div>
                    <p className="font-semibold text-textPrimary">{r.title}</p>
                  </div>
                  <p className="text-sm text-textSecondary leading-relaxed">{r.detail}</p>
                </>
              );
              return r.external ? (
                <a
                  key={r.title}
                  href={r.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-5 rounded-2xl border border-border bg-surface hover:border-brand300/40 transition-colors"
                >
                  {body}
                </a>
              ) : (
                <Link
                  key={r.title}
                  to={r.href}
                  className="block p-5 rounded-2xl border border-border bg-surface hover:border-brand300/40 transition-colors"
                >
                  {body}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 px-6 lg:px-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
              troubleshooting
            </p>
            <h2 className="font-display text-3xl md:text-4xl text-textPrimary">
              the things that actually go wrong
            </h2>
            <p className="text-base text-textSecondary mt-3 max-w-2xl mx-auto leading-relaxed">
              click a symptom for likely causes and the fix that usually resolves it.
            </p>
          </div>
          <div className="space-y-3">
            {TROUBLESHOOTING.map((t, index) => {
              const isOpen = openTroubleshoot === index;
              const Icon = t.icon;
              return (
                <div
                  key={t.symptom}
                  className="rounded-2xl border border-border bg-surface overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenTroubleshoot(isOpen ? null : index)}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-surfaceAlt/40 transition-colors"
                    aria-expanded={isOpen}
                  >
                    <div className="w-10 h-10 rounded-xl bg-brand300/10 border border-brand300/30 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-brand300" />
                    </div>
                    <p className="flex-1 font-medium text-textPrimary">{t.symptom}</p>
                    <ChevronDown
                      className={`w-5 h-5 text-textMuted transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-border pt-4">
                          <div>
                            <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
                              likely causes
                            </p>
                            <ul className="space-y-2">
                              {t.diagnose.map((d) => (
                                <li
                                  key={d}
                                  className="flex items-start gap-2 text-sm text-textSecondary leading-relaxed"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-textMuted mt-2 flex-shrink-0" />
                                  {d}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
                              what to do
                            </p>
                            <ul className="space-y-2">
                              {t.fix.map((f) => (
                                <li
                                  key={f}
                                  className="flex items-start gap-2 text-sm text-textSecondary leading-relaxed"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-brand300 mt-2 flex-shrink-0" />
                                  {f}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
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
              quick answers
            </p>
            <h2 className="font-display text-3xl md:text-4xl text-textPrimary">
              questions we get every week
            </h2>
          </div>
          <div className="space-y-3">
            {QUICK_QUESTIONS.map((q) => (
              <div
                key={q.q}
                className="p-5 rounded-2xl border border-border bg-surface"
              >
                <p className="font-medium text-textPrimary mb-2">{q.q}</p>
                <p className="text-sm text-textSecondary leading-relaxed">{q.a}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link
              to="/faq"
              className="inline-flex items-center gap-2 text-sm font-medium text-brand300 hover:text-brand300/80 transition-colors"
            >
              see all faq
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-24 px-6 lg:px-12 bg-brand300/5">
        <NoiseBackground />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <Mail className="w-10 h-10 text-brand300 mx-auto mb-6" />
          <h2 className="font-display text-4xl md:text-5xl mb-6 text-textPrimary">
            still stuck? we read every email
          </h2>
          <p className="text-xl text-textSecondary mb-10 leading-relaxed">
            for non-urgent questions, email is best. for time-sensitive issues - a stuck claim,
            a missing distribution - telegram is faster.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href={`mailto:${SUPPORT_EMAIL}`}>
              <button className="group bg-primary text-white px-12 py-6 rounded-full text-lg font-bold hover:bg-primaryHover transition-all shadow-2xl flex items-center gap-3 mx-auto">
                Email support
                <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
              </button>
            </a>
            <a
              href="https://t.me/flowguard_cash"
              target="_blank"
              rel="noopener noreferrer"
            >
              <button className="border-2 border-border text-textPrimary px-12 py-6 rounded-full text-lg font-bold hover:border-primary hover:bg-surfaceAlt/30 transition-all">
                Join telegram
              </button>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
