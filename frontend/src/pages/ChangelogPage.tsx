import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Calendar,
  Package,
  AlertCircle,
  CheckCircle2,
  Wrench,
  Shield,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { PageMeta } from '../components/seo/PageMeta';

interface ChangelogEntry {
  version: string;
  date: string;
  status: 'alpha' | 'beta' | 'rc' | 'stable';
  network: 'chipnet' | 'mainnet';
  breaking: boolean;
  highlights: string[];
  added?: string[];
  changed?: string[];
  fixed?: string[];
  security?: string[];
  migration?: string;
  links: {
    repo?: string;
    compare?: string;
    demo?: string;
    docs?: string;
  };
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.2.0-alpha',
    date: '2026-02-15',
    status: 'alpha',
    network: 'chipnet',
    breaking: false,
    highlights: [
      'Initial alpha release on Chipnet',
      'Treasury, stream, and payout flows on Chipnet',
      'Contract-backed schedule families with automated claims',
      'Multi-signature approval workflows',
    ],
    added: [
      'Vault creation with signer thresholds and treasury policy controls',
      'Stream creation across linear, hybrid, milestone, tranche, and recurring schedules',
      'Payment scheduling for one-time, recurring, and refillable recurring payouts',
      'Multi-signature wallet support',
      'Activity explorer for public transparency',
      'Budget plan creation and enforcement',
      'Proposal system for governance',
      'Airdrop distribution tool',
    ],
    changed: [
      'Updated UI to use Sage design system',
      'Improved mobile responsiveness across all pages',
      'Enhanced wallet connection flow',
    ],
    fixed: [
      'Fixed stream detail page rendering issues',
      'Resolved wallet disconnection edge cases',
      'Corrected timezone handling for scheduled payments',
    ],
    links: {
      repo: 'https://github.com/winsznx/flow-guard',
      docs: '/docs',
    },
  },
  {
    version: '0.1.0-alpha',
    date: '2026-02-01',
    status: 'alpha',
    network: 'chipnet',
    breaking: true,
    highlights: [
      'Initial proof-of-concept release',
      'Basic treasury functionality',
      'Simple vesting schedules',
    ],
    added: [
      'Basic treasury creation',
      'Simple vesting contracts',
      'Wallet connection (Paytaca)',
      'Explorer view for public activity',
    ],
    migration: 'This is the initial release. No migration needed.',
    links: {
      repo: 'https://github.com/winsznx/flow-guard',
    },
  },
];

const STATUS_STYLES = {
  alpha: 'bg-warning/10 text-warning border-warning/30',
  beta: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  rc: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
  stable: 'bg-success/10 text-success border-success/30',
};

const NETWORK_STYLES = {
  chipnet: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
  mainnet: 'bg-primary/10 text-primary border-primary/30',
};

export default function ChangelogPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  const filteredChangelog = useMemo(() => {
    return CHANGELOG.filter((entry) => {
      if (!searchQuery) return true;

      const query = searchQuery.toLowerCase();
      return (
        entry.version.toLowerCase().includes(query) ||
        entry.highlights.some((h) => h.toLowerCase().includes(query)) ||
        entry.added?.some((a) => a.toLowerCase().includes(query)) ||
        entry.changed?.some((c) => c.toLowerCase().includes(query)) ||
        entry.fixed?.some((f) => f.toLowerCase().includes(query))
      );
    });
  }, [searchQuery]);

  return (
    <main className="bg-background min-h-screen">
      <PageMeta
        title="Changelog"
        description="Track FlowGuard releases, contract-backed feature changes, fixes, and production readiness work across the app."
        path="/changelog"
      />
      {/* Hero */}
      <section className="pt-32 pb-16 px-6 lg:px-12 bg-surface border-b border-border">
        <div className="max-w-4xl mx-auto">
          <div className="text-center">
            <h1 className="font-display text-5xl md:text-6xl font-bold text-textPrimary mb-6">
              Changelog
            </h1>
            <p className="text-xl text-textSecondary max-w-2xl mx-auto">
              Track all FlowGuard releases, features, and improvements
            </p>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6 lg:px-12 py-16">
        <div className="grid lg:grid-cols-4 gap-12">
          {/* Sidebar - Desktop */}
          <aside className="hidden lg:block lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              <div>
                <h3 className="font-semibold text-textPrimary mb-3">Versions</h3>
                <nav className="space-y-2">
                  {CHANGELOG.map((entry) => (
                    <a
                      key={entry.version}
                      href={`#${entry.version}`}
                      className="block text-sm text-textSecondary hover:text-textPrimary transition-colors py-1"
                    >
                      {entry.version}
                    </a>
                  ))}
                </nav>
              </div>

              <div>
                <h3 className="font-semibold text-textPrimary mb-3">Filter by</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => setSelectedSection(null)}
                    className={`block w-full text-left text-sm py-1 transition-colors ${
                      !selectedSection
                        ? 'text-primary font-medium'
                        : 'text-textSecondary hover:text-textPrimary'
                    }`}
                  >
                    All Changes
                  </button>
                  <button
                    onClick={() => setSelectedSection('added')}
                    className={`block w-full text-left text-sm py-1 transition-colors ${
                      selectedSection === 'added'
                        ? 'text-primary font-medium'
                        : 'text-textSecondary hover:text-textPrimary'
                    }`}
                  >
                    Added
                  </button>
                  <button
                    onClick={() => setSelectedSection('changed')}
                    className={`block w-full text-left text-sm py-1 transition-colors ${
                      selectedSection === 'changed'
                        ? 'text-primary font-medium'
                        : 'text-textSecondary hover:text-textPrimary'
                    }`}
                  >
                    Changed
                  </button>
                  <button
                    onClick={() => setSelectedSection('fixed')}
                    className={`block w-full text-left text-sm py-1 transition-colors ${
                      selectedSection === 'fixed'
                        ? 'text-primary font-medium'
                        : 'text-textSecondary hover:text-textPrimary'
                    }`}
                  >
                    Fixed
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Search */}
            <div className="mb-8">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-textMuted" />
                <input
                  type="text"
                  placeholder="Search changelog..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-textPrimary"
                />
              </div>
            </div>

            {/* Changelog Entries */}
            <div className="space-y-12">
              {filteredChangelog.map((entry) => (
                <div
                  key={entry.version}
                  id={entry.version}
                  className="scroll-mt-24 bg-surface border border-border rounded-2xl p-8"
                >
                  {/* Version Header */}
                  <div className="mb-6">
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      <h2 className="font-display text-3xl font-bold text-textPrimary">
                        {entry.version}
                      </h2>
                      <span
                        className={`px-3 py-1 text-xs font-semibold rounded-full border ${STATUS_STYLES[entry.status]}`}
                      >
                        {entry.status.toUpperCase()}
                      </span>
                      <span
                        className={`px-3 py-1 text-xs font-semibold rounded-full border ${NETWORK_STYLES[entry.network]}`}
                      >
                        {entry.network.toUpperCase()}
                      </span>
                      {entry.breaking && (
                        <span className="px-3 py-1 text-xs font-semibold rounded-full border bg-error/10 text-error border-error/30">
                          BREAKING
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-textMuted">
                      <Calendar className="w-4 h-4" />
                      {new Date(entry.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </div>
                  </div>

                  {/* Highlights */}
                  {entry.highlights.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-5 h-5 text-primary" />
                        <h3 className="font-semibold text-textPrimary">Highlights</h3>
                      </div>
                      <ul className="space-y-2">
                        {entry.highlights.map((item, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                            <span className="text-textSecondary">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Added */}
                  {entry.added &&
                    entry.added.length > 0 &&
                    (!selectedSection || selectedSection === 'added') && (
                      <div className="mb-6">
                        <div className="flex items-center gap-2 mb-3">
                          <Package className="w-5 h-5 text-success" />
                          <h3 className="font-semibold text-textPrimary">Added</h3>
                        </div>
                        <ul className="space-y-2">
                          {entry.added.map((item, i) => (
                            <li key={i} className="flex items-start gap-3">
                              <span className="text-success mt-1">+</span>
                              <span className="text-textSecondary">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {/* Changed */}
                  {entry.changed &&
                    entry.changed.length > 0 &&
                    (!selectedSection || selectedSection === 'changed') && (
                      <div className="mb-6">
                        <div className="flex items-center gap-2 mb-3">
                          <Wrench className="w-5 h-5 text-warning" />
                          <h3 className="font-semibold text-textPrimary">Changed</h3>
                        </div>
                        <ul className="space-y-2">
                          {entry.changed.map((item, i) => (
                            <li key={i} className="flex items-start gap-3">
                              <span className="text-warning mt-1">~</span>
                              <span className="text-textSecondary">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {/* Fixed */}
                  {entry.fixed &&
                    entry.fixed.length > 0 &&
                    (!selectedSection || selectedSection === 'fixed') && (
                      <div className="mb-6">
                        <div className="flex items-center gap-2 mb-3">
                          <CheckCircle2 className="w-5 h-5 text-primary" />
                          <h3 className="font-semibold text-textPrimary">Fixed</h3>
                        </div>
                        <ul className="space-y-2">
                          {entry.fixed.map((item, i) => (
                            <li key={i} className="flex items-start gap-3">
                              <span className="text-primary mt-1">✓</span>
                              <span className="text-textSecondary">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {/* Security */}
                  {entry.security && entry.security.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <Shield className="w-5 h-5 text-error" />
                        <h3 className="font-semibold text-textPrimary">Security</h3>
                      </div>
                      <ul className="space-y-2">
                        {entry.security.map((item, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-error mt-0.5 flex-shrink-0" />
                            <span className="text-textSecondary">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Migration Notes */}
                  {entry.migration && (
                    <div className="mb-6 p-4 bg-warning/5 border border-warning/20 rounded-lg">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                        <div>
                          <h4 className="font-semibold text-textPrimary mb-2">Migration Notes</h4>
                          <p className="text-sm text-textSecondary">{entry.migration}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Links */}
                  <div className="flex flex-wrap gap-3 pt-4 border-t border-border">
                    {entry.links.repo && (
                      <a
                        href={entry.links.repo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:text-primaryHover"
                      >
                        View on GitHub →
                      </a>
                    )}
                    {entry.links.docs && (
                      <a
                        href={entry.links.docs}
                        className="text-sm text-primary hover:text-primaryHover"
                      >
                        Documentation →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {filteredChangelog.length === 0 && (
              <div className="text-center py-16">
                <p className="text-textSecondary text-lg">
                  No changelog entries found matching your search.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
