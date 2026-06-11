import { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Home,
  Search,
  Compass,
  BookOpen,
  LifeBuoy,
  ShieldCheck,
  Sparkles,
  Layers,
  Wallet,
  Coins,
  Vote,
  Gift,
  Activity,
} from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { NoiseBackground } from '../components/ui/NoiseBackground';
import { PageMeta } from '../components/seo/PageMeta';
import { APP_SITE_URL, DOCS_SITE_URL, EXPLORER_SITE_URL } from '../utils/publicUrls';

interface SuggestedLink {
  icon: typeof Home;
  label: string;
  detail: string;
  to: string;
  external?: boolean;
}

const TOP_DESTINATIONS: SuggestedLink[] = [
  {
    icon: Home,
    label: 'home',
    detail: 'the main flowguard marketing page.',
    to: '/',
  },
  {
    icon: Sparkles,
    label: 'use cases',
    detail: 'every workflow flowguard supports on one page.',
    to: '/use-cases',
  },
  {
    icon: Layers,
    label: 'how it works',
    detail: 'covenants, receipts, and the trust model.',
    to: '/how-it-works',
  },
  {
    icon: Coins,
    label: 'pricing',
    detail: 'zero fees, written down.',
    to: '/pricing',
  },
  {
    icon: ShieldCheck,
    label: 'security',
    detail: 'audit summary, threat model, disclosure.',
    to: '/security',
  },
  {
    icon: LifeBuoy,
    label: 'help center',
    detail: 'support channels, troubleshooting, faq.',
    to: '/help',
  },
  {
    icon: BookOpen,
    label: 'documentation',
    detail: 'concepts, guides, and api reference.',
    to: DOCS_SITE_URL,
    external: true,
  },
  {
    icon: Activity,
    label: 'status',
    detail: 'are payments processing? is the indexer caught up?',
    to: '/status',
  },
];

const PRODUCT_SHORTCUTS: SuggestedLink[] = [
  { icon: Wallet, label: 'vaults', detail: 'treasury vaults with policy.', to: '/vesting' },
  { icon: Coins, label: 'streams', detail: 'vesting and payroll.', to: '/payroll' },
  { icon: Gift, label: 'airdrops', detail: 'mass distributions.', to: '/use-cases#cat-distribute' },
  { icon: Vote, label: 'governance', detail: 'proposals and approvals.', to: '/governance-info' },
];

export default function NotFoundPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const attemptedPath = useMemo(() => {
    if (!location.pathname || location.pathname === '/') return '/';
    return location.pathname;
  }, [location.pathname]);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    const isAddress = /^(bitcoincash:|bchtest:)?q[a-z0-9]{41}$/i.test(trimmed);
    const isTxLike = /^[a-f0-9]{32,}$/i.test(trimmed);
    if (isAddress || isTxLike) {
      window.location.href = `${EXPLORER_SITE_URL}/search?q=${encodeURIComponent(trimmed)}`;
      return;
    }
    navigate(`/use-cases?search=${encodeURIComponent(trimmed)}`);
  };

  return (
    <main className="bg-background min-h-screen flex flex-col">
      <PageMeta
        title="Page Not Found"
        description="The page you are looking for does not exist on FlowGuard."
        path="/404"
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
            <Link
              to="/use-cases"
              className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors"
            >
              Use cases
            </Link>
            <Link
              to="/help"
              className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors"
            >
              Help
            </Link>
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

      <section className="relative pt-32 pb-12 px-6 lg:px-12 overflow-hidden flex-1">
        <NoiseBackground />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand300/10 border border-brand300/30 mb-8"
          >
            <Compass className="w-4 h-4 text-brand300" />
            <span className="text-sm font-medium text-brand300">404 - page not found</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-display text-6xl md:text-8xl mb-6 text-textPrimary leading-none"
          >
            this page is not here
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-textSecondary mb-3 leading-relaxed"
          >
            we could not find anything at this url. it may have moved, the link may be wrong, or
            it may never have existed.
          </motion.p>

          {attemptedPath !== '/' && (
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-xs font-mono text-textMuted mb-8"
            >
              attempted path:{' '}
              <span
                className="text-textSecondary inline-block max-w-full align-bottom truncate"
                title={attemptedPath}
              >
                {attemptedPath}
              </span>
            </motion.p>
          )}

          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            onSubmit={handleSearchSubmit}
            className="max-w-xl mx-auto mb-10"
          >
            <div className="flex items-center gap-2 p-2 rounded-2xl border border-border bg-surface">
              <Search className="w-5 h-5 text-textMuted ml-3 flex-shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="search a tx id, address, or page name"
                className="flex-1 bg-transparent text-sm text-textPrimary placeholder:text-textMuted focus:outline-none px-2 py-2"
                aria-label="search flowguard"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primaryHover transition-colors"
              >
                Search
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-textMuted mt-3 text-center font-mono">
              addresses and transaction ids route to the explorer. everything else searches the site.
            </p>
          </motion.form>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link to="/">
              <button className="group bg-primary text-white px-8 py-4 rounded-full text-base font-semibold hover:bg-primaryHover transition-all shadow-2xl hover:shadow-brand300/20 flex items-center gap-3">
                <Home className="w-5 h-5" />
                Back to home
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
            <Link to="/help">
              <button className="border-2 border-border text-textPrimary px-8 py-4 rounded-full text-base font-semibold hover:border-primary hover:bg-surfaceAlt/30 transition-all">
                Get help
              </button>
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="py-16 px-6 lg:px-12 bg-surfaceAlt/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
              where you might have meant to go
            </p>
            <h2 className="font-display text-2xl sm:text-3xl text-textPrimary">
              top destinations
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {TOP_DESTINATIONS.map((d) => {
              const Icon = d.icon;
              const body = (
                <>
                  <div className="w-10 h-10 rounded-xl bg-brand300/10 border border-brand300/30 flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5 text-brand300" />
                  </div>
                  <p className="font-medium text-textPrimary text-sm mb-1">{d.label}</p>
                  <p className="text-xs text-textSecondary leading-relaxed">{d.detail}</p>
                </>
              );
              return d.external ? (
                <a
                  key={d.label}
                  href={d.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4 rounded-2xl border border-border bg-surface hover:border-brand300/40 transition-colors"
                >
                  {body}
                </a>
              ) : (
                <Link
                  key={d.label}
                  to={d.to}
                  className="block p-4 rounded-2xl border border-border bg-surface hover:border-brand300/40 transition-colors"
                >
                  {body}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 px-6 lg:px-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
              product shortcuts
            </p>
            <h2 className="font-display text-2xl sm:text-3xl text-textPrimary">
              jump straight to a workflow
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {PRODUCT_SHORTCUTS.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.label}
                  to={s.to}
                  className="block p-4 rounded-2xl border border-border bg-surface hover:border-brand300/40 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-brand300/10 border border-brand300/30 flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5 text-brand300" />
                  </div>
                  <p className="font-medium text-textPrimary text-sm mb-1">{s.label}</p>
                  <p className="text-xs text-textSecondary leading-relaxed">{s.detail}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
