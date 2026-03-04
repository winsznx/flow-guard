import { CheckCircle2, Circle, Clock, Sparkles, Calendar, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Footer } from '../components/layout/Footer';
import { PageMeta } from '../components/seo/PageMeta';

interface RoadmapItem {
  title: string;
  description: string;
  status: 'completed' | 'in-progress' | 'planned';
  quarter?: string;
  items: string[];
}

interface RoadmapPhase {
  phase: string;
  title: string;
  description: string;
  status: 'completed' | 'in-progress' | 'planned';
  items: RoadmapItem[];
}

const ROADMAP: RoadmapPhase[] = [
  {
    phase: 'Phase 1',
    title: 'Alpha Release',
    description: 'Core treasury functionality on Chipnet testnet',
    status: 'completed',
    items: [
      {
        title: 'Core Treasury Infrastructure',
        description: 'Basic treasury creation and management',
        status: 'completed',
        quarter: 'Q1 2026',
        items: [
          'Multi-signature wallet support',
          'Vault creation with signer thresholds and treasury policy controls',
          'Spending limit enforcement',
          'Activity explorer for transparency',
        ],
      },
      {
        title: 'Vesting & Payments',
        description: 'Automated payment scheduling',
        status: 'completed',
        quarter: 'Q1 2026',
        items: [
          'Linear, hybrid, milestone, tranche, and recurring schedule families',
          'One-time, recurring, and refillable payout flows',
          'Contract-backed claim, pause, transfer, and refill controls',
          'Activity history and stream lifecycle tracking',
        ],
      },
      {
        title: 'Governance Foundation',
        description: 'Basic proposal and voting system',
        status: 'completed',
        quarter: 'Q1 2026',
        items: [
          'Proposal creation and submission',
          'Multi-signature approval workflows',
          'Budget plan enforcement',
          'Airdrop distribution tool',
        ],
      },
    ],
  },
  {
    phase: 'Phase 2',
    title: 'Beta & Security Hardening',
    description: 'External audits and mainnet preparation',
    status: 'in-progress',
    items: [
      {
        title: 'Security Audits',
        description: 'Professional security review and hardening',
        status: 'in-progress',
        quarter: 'Q2 2026',
        items: [
          'Smart contract security audit',
          'Frontend security review',
          'Penetration testing',
          'Bug bounty program launch',
        ],
      },
      {
        title: 'Beta Testing Program',
        description: 'Community testing and feedback',
        status: 'planned',
        quarter: 'Q2 2026',
        items: [
          'Invite-only beta on Chipnet',
          'User feedback collection',
          'Performance optimization',
          'UX improvements based on feedback',
        ],
      },
      {
        title: 'Advanced Features',
        description: 'Enhanced treasury capabilities',
        status: 'planned',
        quarter: 'Q2 2026',
        items: [
          'Batch payment processing',
          'Advanced budget categories',
          'Custom approval workflows',
          'Treasury analytics dashboard',
        ],
      },
    ],
  },
  {
    phase: 'Phase 3',
    title: 'Mainnet Launch',
    description: 'Production deployment on Bitcoin Cash mainnet',
    status: 'planned',
    items: [
      {
        title: 'Mainnet Deployment',
        description: 'Launch on BCH mainnet',
        status: 'planned',
        quarter: 'Q3 2026',
        items: [
          'Smart contract deployment to mainnet',
          'Production infrastructure setup',
          'Monitoring and alerting systems',
          'Incident response procedures',
        ],
      },
      {
        title: 'Wallet Integrations',
        description: 'Support for major BCH wallets',
        status: 'planned',
        quarter: 'Q3 2026',
        items: [
          'Paytaca wallet integration (primary)',
          'Electron Cash support',
          'WalletConnect integration',
          'Mobile wallet optimization',
        ],
      },
      {
        title: 'Documentation & Support',
        description: 'Comprehensive user resources',
        status: 'planned',
        quarter: 'Q3 2026',
        items: [
          'Complete API documentation',
          'Video tutorials and guides',
          'Community support channels',
          'Developer SDK release',
        ],
      },
    ],
  },
  {
    phase: 'Phase 4',
    title: 'Layla Upgrade Features',
    description: 'Advanced capabilities leveraging May 2026 BCHN upgrade',
    status: 'planned',
    items: [
      {
        title: 'Advanced Covenant Features',
        description: 'Leverage new VM capabilities',
        status: 'planned',
        quarter: 'Q3 2026',
        items: [
          'Loops for unbounded iteration',
          'Functions for modular contract logic',
          'Bitwise operations for compact state',
          'P2SH32 for improved wallet UX',
        ],
      },
      {
        title: 'Trustless Vote Tallying',
        description: 'On-chain governance without trust assumptions',
        status: 'planned',
        quarter: 'Q3-Q4 2026',
        items: [
          'Fully on-chain vote counting',
          'Arbitrary M-of-N signature schemes',
          'Token-weighted voting',
          'Quadratic voting support',
        ],
      },
      {
        title: 'Advanced Treasury Types',
        description: 'Specialized treasury configurations',
        status: 'planned',
        quarter: 'Q4 2026',
        items: [
          'Broader contract-backed schedule families',
          'Conditional unlocks (oracle-based)',
          'Multi-token treasury support',
          'Cross-treasury transfers',
        ],
      },
    ],
  },
  {
    phase: 'Phase 5',
    title: 'Ecosystem Growth',
    description: 'Integrations, partnerships, and ecosystem expansion',
    status: 'planned',
    items: [
      {
        title: 'DeFi Integrations',
        description: 'Connect with BCH DeFi ecosystem',
        status: 'planned',
        quarter: 'Q4 2026',
        items: [
          'DEX integration for automated swaps',
          'Yield farming strategies',
          'Liquidity provision automation',
          'Cross-protocol composability',
        ],
      },
      {
        title: 'Enterprise Features',
        description: 'Tools for larger organizations',
        status: 'planned',
        quarter: 'Q4 2026 - Q1 2027',
        items: [
          'Role-based access control',
          'Compliance reporting tools',
          'Multi-treasury management',
          'White-label solutions',
        ],
      },
      {
        title: 'Developer Ecosystem',
        description: 'Enable third-party development',
        status: 'planned',
        quarter: 'Q1 2027',
        items: [
          'Plugin system for custom modules',
          'GraphQL API for integrations',
          'Webhook support for notifications',
          'Template marketplace',
        ],
      },
    ],
  },
];

const STATUS_CONFIG = {
  completed: {
    icon: CheckCircle2,
    color: 'text-success',
    bg: 'bg-success/10',
    border: 'border-success/30',
    label: 'Completed',
  },
  'in-progress': {
    icon: Clock,
    color: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    label: 'In Progress',
  },
  planned: {
    icon: Circle,
    color: 'text-textMuted',
    bg: 'bg-surfaceAlt',
    border: 'border-border',
    label: 'Planned',
  },
};

export default function RoadmapPage() {
  return (
    <main className="bg-background min-h-screen">
      <PageMeta
        title="Roadmap"
        description="Track FlowGuard milestones across treasury infrastructure, stream schedules, governance, security hardening, and mainnet preparation."
        path="/roadmap"
      />
      {/* Hero */}
      <section className="pt-32 pb-16 px-6 lg:px-12 bg-surface border-b border-border">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 mb-6">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-primary">Building the Future</span>
          </div>
          <h1 className="font-display text-5xl md:text-6xl font-bold text-textPrimary mb-6">
            Roadmap
          </h1>
          <p className="text-xl text-textSecondary max-w-2xl mx-auto">
            The product and protocol milestones that move FlowGuard from a BCH treasury tool into a
            broader operating layer for on-chain finance
          </p>
        </div>
      </section>

      {/* Current Status Banner */}
      <section className="py-8 px-6 lg:px-12 bg-primary/5 border-b border-primary/20">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <Clock className="w-6 h-6 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-textPrimary">
                  Current Phase: Beta & Security Hardening
                </div>
                <div className="text-sm text-textSecondary">
                  Deepening treasury, stream, and governance operations before mainnet
                </div>
              </div>
            </div>
            <Link
              to="/changelog"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primaryHover transition-colors"
            >
              View Changelog
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Roadmap Timeline */}
      <section className="py-16 px-6 lg:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="space-y-16">
            {ROADMAP.map((phase, phaseIndex) => {
              const StatusIcon = STATUS_CONFIG[phase.status].icon;

              return (
                <div key={phase.phase} className="relative">
                  {/* Phase Header */}
                  <div className="flex items-start gap-6 mb-8">
                    <div className="flex-shrink-0">
                      <div
                        className={`w-16 h-16 rounded-2xl ${STATUS_CONFIG[phase.status].bg} border ${STATUS_CONFIG[phase.status].border} flex items-center justify-center`}
                      >
                        <StatusIcon className={`w-8 h-8 ${STATUS_CONFIG[phase.status].color}`} />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <h2 className="font-display text-3xl font-bold text-textPrimary">
                          {phase.phase}: {phase.title}
                        </h2>
                        <span
                          className={`px-3 py-1 text-xs font-semibold rounded-full border ${STATUS_CONFIG[phase.status].bg} ${STATUS_CONFIG[phase.status].color} ${STATUS_CONFIG[phase.status].border}`}
                        >
                          {STATUS_CONFIG[phase.status].label}
                        </span>
                      </div>
                      <p className="text-lg text-textSecondary">{phase.description}</p>
                    </div>
                  </div>

                  {/* Phase Items */}
                  <div className="ml-8 pl-8 border-l-2 border-border space-y-8">
                    {phase.items.map((item, itemIndex) => {
                      const ItemIcon = STATUS_CONFIG[item.status].icon;

                      return (
                        <div key={itemIndex} className="relative">
                          {/* Timeline dot */}
                          <div
                            className={`absolute -left-[37px] top-6 w-4 h-4 rounded-full border-2 ${STATUS_CONFIG[item.status].bg} ${STATUS_CONFIG[item.status].border}`}
                          />

                          <div className="bg-surface border border-border rounded-xl p-6 hover:border-primary/30 transition-colors">
                            <div className="flex items-start gap-4 mb-4">
                              <div
                                className={`flex-shrink-0 w-10 h-10 rounded-lg ${STATUS_CONFIG[item.status].bg} border ${STATUS_CONFIG[item.status].border} flex items-center justify-center`}
                              >
                                <ItemIcon
                                  className={`w-5 h-5 ${STATUS_CONFIG[item.status].color}`}
                                />
                              </div>
                              <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-3 mb-1">
                                  <h3 className="font-display text-xl font-semibold text-textPrimary">
                                    {item.title}
                                  </h3>
                                  {item.quarter && (
                                    <div className="flex items-center gap-1 text-xs text-textMuted">
                                      <Calendar className="w-3 h-3" />
                                      {item.quarter}
                                    </div>
                                  )}
                                </div>
                                <p className="text-textSecondary mb-4">{item.description}</p>
                                <ul className="space-y-2">
                                  {item.items.map((subItem, subIndex) => (
                                    <li
                                      key={subIndex}
                                      className="flex items-start gap-2 text-sm text-textSecondary"
                                    >
                                      <CheckCircle2
                                        className={`w-4 h-4 mt-0.5 flex-shrink-0 ${item.status === 'completed' ? 'text-success' : 'text-textMuted'}`}
                                      />
                                      <span>{subItem}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Connector to next phase */}
                  {phaseIndex < ROADMAP.length - 1 && (
                    <div className="ml-8 pl-8 border-l-2 border-border h-8" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-6 lg:px-12 bg-surface border-t border-border">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-textPrimary mb-4">
            Want to Shape the Future?
          </h2>
          <p className="text-lg text-textSecondary mb-8 max-w-2xl mx-auto">
            Join our community to provide feedback, request features, and help build the future of
            treasury automation on Bitcoin Cash.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="https://discord.gg/flowguard"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primaryHover transition-colors"
            >
              Join Discord
            </a>
            <a
              href="https://github.com/winsznx/flow-guard/discussions"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-surface border border-border text-textPrimary rounded-lg font-semibold hover:bg-surfaceAlt transition-colors"
            >
              GitHub Discussions
            </a>
            <Link
              to="/updates"
              className="px-6 py-3 bg-surface border border-border text-textPrimary rounded-lg font-semibold hover:bg-surfaceAlt transition-colors"
            >
              Read Updates
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
