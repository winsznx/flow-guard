import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Shield,
  Lock,
  Mail,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Eye,
  ServerCog,
  KeyRound,
  ScrollText,
  Bug,
  GitPullRequest,
} from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { SolutionsDropdown } from '../components/ui/SolutionsDropdown';
import { NoiseBackground } from '../components/ui/NoiseBackground';
import { PageMeta } from '../components/seo/PageMeta';
import { APP_SITE_URL, DOCS_SITE_URL } from '../utils/publicUrls';

const SECURITY_EMAIL = 'security@flowguard.cash';
const SUPPORT_EMAIL = 'support@flowguard.cash';

const AUDIT_HEADLINES = [
  {
    label: 'advisories closed',
    value: '43',
    detail: 'every finding from the internal pre-mainnet review tracked to resolution.',
  },
  {
    label: 'open critical',
    value: '0',
    detail: 'no known unresolved critical or high severity findings against the production contracts.',
  },
  {
    label: 'external reviews',
    value: '2+',
    detail: 'community review and independent audit firms in flight before mainnet flip.',
  },
];

const THREAT_MODEL = [
  {
    icon: KeyRound,
    title: 'wallet-driven signing',
    body: 'every onchain action is signed by your wallet - paytaca, cashonize, or another bch wallet of your choice. flowguard never asks for your seed phrase, never asks for an export of your private key, and never broadcasts a transaction that you have not first signed in your own wallet.',
  },
  {
    icon: Lock,
    title: 'covenant-bound custody',
    body: 'funds live inside contract utxos with rules baked into the locking script. those rules cover schedule, beneficiary, claim authority, signer thresholds, and refund paths. they cannot be changed after creation - not by us, not by you, not by a future deploy of the contract.',
  },
  {
    icon: ServerCog,
    title: 'executor liveness boundary',
    body: 'a hosted executor watches schedules and posts unlock transactions so that recipients do not have to. the executor cannot redirect funds, cannot raise limits, and cannot bypass thresholds. the worst it can do is go offline - at which point any signer or recipient can run their own executor against the same covenant.',
  },
  {
    icon: Eye,
    title: 'indexer is read-only',
    body: 'the public indexer reads chain state and serves it back to the dashboard. it can be wrong, slow, or behind during a reorg, but it cannot move money. all sensitive state - balances, schedules, signers - is reconfirmed against the chain before a transaction is built.',
  },
  {
    icon: Shield,
    title: 'identity binding',
    body: 'session bearer tokens are bound to a wallet signature. tokens cannot be replayed against a different wallet, cannot be lifted from a logged-in tab and used on another origin, and expire on a fixed window even when the tab stays open.',
  },
];

const DISCLOSURE_POLICY = [
  {
    step: '1',
    title: 'report',
    body: `email ${SECURITY_EMAIL} with a description, a reproduction path, and any logs or transaction ids. do not file a public github issue. do not post on telegram or x.`,
  },
  {
    step: '2',
    title: 'acknowledge',
    body: 'we acknowledge receipt within 24 hours. within 72 hours we either confirm the issue, ask for more information, or explain why we are unable to reproduce.',
  },
  {
    step: '3',
    title: 'remediate',
    body: 'critical findings are patched on a private branch, reviewed by at least two contributors, and deployed before public disclosure. lower-severity findings ship on the regular release train.',
  },
  {
    step: '4',
    title: 'disclose',
    body: 'after a fix is shipped and migrated, we publish an advisory with credit to the reporter (unless anonymity is requested). disclosure timeline targets 90 days from receipt.',
  },
];

const BOUNTY_TIERS = [
  {
    severity: 'critical',
    color: 'text-red-600',
    border: 'border-red-200',
    bg: 'bg-red-50',
    range: 'up to USD 25,000',
    examples: 'loss of user funds, unauthorized signer addition, executor able to redirect a claim, covenant state corruption.',
  },
  {
    severity: 'high',
    color: 'text-orange-600',
    border: 'border-orange-200',
    bg: 'bg-orange-50',
    range: 'up to USD 7,500',
    examples: 'griefing that locks funds for longer than the schedule allows, session token replay across wallets, indexer poisoning that affects claim signing.',
  },
  {
    severity: 'medium',
    color: 'text-amber-700',
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    range: 'up to USD 1,500',
    examples: 'denial-of-service against the public api, privacy leaks of vault metadata, csrf in unauthenticated dashboard surfaces.',
  },
  {
    severity: 'low',
    color: 'text-textSecondary',
    border: 'border-border',
    bg: 'bg-surfaceAlt/40',
    range: 'up to USD 500',
    examples: 'misleading copy, accessibility regressions in signing flows, off-by-one in displayed amounts.',
  },
];

const TIMELINE = [
  {
    date: '2026-03',
    title: 'internal pre-mainnet review complete',
    body: 'all 43 advisories tracked in the internal remediation log closed. identity-binding hardening (advisory C-01) landed. executor scope frozen.',
  },
  {
    date: '2026-02',
    title: 'covenant freeze',
    body: 'production covenant bytecode locked. no semantic changes will ship to the on-chain layer without an explicit migration and a new deploy.',
  },
  {
    date: '2026-01',
    title: 'community review window opened',
    body: 'contracts, indexer, and executor reference implementations published with reproducible build instructions for external review.',
  },
  {
    date: '2025-11',
    title: 'first end-to-end testnet',
    body: 'full chipnet rehearsal of vesting, payroll, airdrops, bounties, rewards, grants, and governance - every flow signed off against a checklist.',
  },
];

export default function SecurityPage() {
  return (
    <main className="bg-background min-h-screen">
      <PageMeta
        title="Security"
        description="FlowGuard's security model, audit summary, threat model, responsible disclosure policy, and bug bounty program."
        path="/security"
      />

      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/30 h-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 h-full flex justify-between items-center">
          <Link to="/">
            <img src="/assets/flow-green.png" alt="FlowGuard" className="h-8 object-contain" />
          </Link>
          <div className="hidden md:flex items-center space-x-10">
            <Link to="/" className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors">
              Home
            </Link>
            <SolutionsDropdown />
            <a href={DOCS_SITE_URL} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors">
              Developers
            </a>
            <Link to="/security" className="text-sm font-medium text-textPrimary">
              Security
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

      <section className="pt-32 pb-12 px-6 lg:px-12">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand300/10 border border-brand300/30 mb-6"
          >
            <Shield className="w-4 h-4 text-brand300" />
            <span className="text-sm font-medium text-brand300">security at flowguard</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-display text-5xl md:text-7xl mb-6 text-textPrimary leading-tight"
          >
            non-custodial by design. audited before mainnet.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-textSecondary mb-10 max-w-3xl leading-relaxed"
          >
            this page is the single source of truth for how flowguard handles your money. read the
            threat model, find the disclosure address, and check the bounty scope before reporting.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <a href={`mailto:${SECURITY_EMAIL}`}>
              <button className="group bg-primary text-white px-8 py-4 rounded-full text-base font-semibold hover:bg-primaryHover transition-all shadow-2xl flex items-center gap-3">
                <Mail className="w-5 h-5" />
                report a vulnerability
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </a>
            <a href={`${DOCS_SITE_URL}/security`} target="_blank" rel="noopener noreferrer">
              <button className="border-2 border-border text-textPrimary px-8 py-4 rounded-full text-base font-semibold hover:border-primary hover:bg-surfaceAlt/30 transition-all">
                read the full docs
              </button>
            </a>
          </motion.div>
        </div>
      </section>

      <section className="py-16 px-6 lg:px-12 bg-surfaceAlt/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-3xl md:text-4xl text-textPrimary mb-3">
            audit summary
          </h2>
          <p className="text-textSecondary mb-10 max-w-3xl">
            flowguard went through an internal pre-mainnet review that produced 43 advisories
            against the contracts, indexer, executor, and dashboard. every advisory is tracked to a
            commit and a deploy. the headline numbers below come straight from that log.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {AUDIT_HEADLINES.map((item) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="bg-surface border border-border rounded-2xl p-6"
              >
                <p className="text-3xl sm:text-4xl lg:text-5xl font-display text-brand300 mb-2">{item.value}</p>
                <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
                  {item.label}
                </p>
                <p className="text-sm text-textSecondary leading-relaxed">{item.detail}</p>
              </motion.div>
            ))}
          </div>

          <div className="bg-surface border border-border rounded-2xl p-6 md:p-8">
            <div className="flex items-start gap-4 mb-4">
              <FileText className="w-6 h-6 text-brand300 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-display text-2xl text-textPrimary mb-2">
                  what the review covered
                </h3>
                <p className="text-textSecondary leading-relaxed">
                  covenant bytecode (vault, stream, airdrop, bounty, reward, grant, governance),
                  the off-chain executor responsible for posting unlock transactions, the indexer
                  that powers the dashboard, the dashboard itself (session model, signing surface,
                  csrf posture), and the deploy pipeline that ships them.
                </p>
              </div>
            </div>
            <div className="border-t border-border pt-4 mt-4">
              <p className="text-sm font-mono uppercase tracking-wider text-textMuted mb-3">
                items explicitly out of scope
              </p>
              <ul className="space-y-2 text-textSecondary text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-textMuted mt-1">→</span>
                  <span>third-party wallets (paytaca, cashonize) - please report wallet bugs to those teams directly.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-textMuted mt-1">→</span>
                  <span>bitcoin cash protocol-level issues - these go to the bch development community.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-textMuted mt-1">→</span>
                  <span>physical / social engineering attacks against flowguard team members.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 lg:px-12">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-3xl md:text-4xl text-textPrimary mb-3">
            threat model
          </h2>
          <p className="text-textSecondary mb-10 max-w-3xl">
            five boundaries define what flowguard does and does not protect against. read them in
            order - they are listed from the strongest guarantee to the weakest.
          </p>

          <div className="space-y-4">
            {THREAT_MODEL.map((item, idx) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-surface border border-border rounded-2xl p-6 md:p-8 hover:border-brand300/40 transition-colors"
                >
                  <div className="flex items-start gap-5">
                    <div className="w-12 h-12 rounded-xl bg-brand300/10 border border-brand300/30 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6 text-brand300" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-display text-2xl text-textPrimary mb-2">
                        {item.title}
                      </h3>
                      <p className="text-textSecondary leading-relaxed">{item.body}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 px-6 lg:px-12 bg-surfaceAlt/30">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <ScrollText className="w-7 h-7 text-brand300" />
            <h2 className="font-display text-3xl md:text-4xl text-textPrimary">
              responsible disclosure
            </h2>
          </div>
          <p className="text-textSecondary mb-10 max-w-3xl">
            we ask the security community to report findings privately first. this gives us time to
            patch and migrate before a vulnerability becomes a loss event for someone holding
            funds in flowguard.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
            {DISCLOSURE_POLICY.map((item) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="bg-surface border border-border rounded-2xl p-6"
              >
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="text-3xl sm:text-4xl font-display text-brand300/30">{item.step}</span>
                  <h3 className="font-display text-xl text-textPrimary">{item.title}</h3>
                </div>
                <p className="text-textSecondary text-sm leading-relaxed">{item.body}</p>
              </motion.div>
            ))}
          </div>

          <div className="bg-brand300/5 border border-brand300/30 rounded-2xl p-6 md:p-8">
            <h3 className="font-display text-xl text-textPrimary mb-4">safe harbor</h3>
            <p className="text-textSecondary leading-relaxed mb-4">
              security research conducted in good faith against flowguard infrastructure is
              authorized. this includes finding and reporting vulnerabilities in our smart contracts,
              executor, indexer, and dashboard. we will not pursue legal action against researchers
              who:
            </p>
            <ul className="space-y-2 text-textSecondary">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-brand300 flex-shrink-0 mt-0.5" />
                <span>make a good-faith effort to avoid privacy violations and disruption to other users.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-brand300 flex-shrink-0 mt-0.5" />
                <span>only interact with accounts they own or have explicit permission to access.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-brand300 flex-shrink-0 mt-0.5" />
                <span>report findings through the disclosure channel below before public release.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-brand300 flex-shrink-0 mt-0.5" />
                <span>do not exfiltrate user data beyond what is needed to demonstrate the issue.</span>
              </li>
            </ul>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            <a href={`mailto:${SECURITY_EMAIL}`} className="block bg-surface border border-border rounded-2xl p-6 hover:border-brand300/40 transition-colors">
              <Mail className="w-6 h-6 text-brand300 mb-3" />
              <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-1">
                vulnerability reports
              </p>
              <p className="font-mono text-textPrimary">{SECURITY_EMAIL}</p>
            </a>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="block bg-surface border border-border rounded-2xl p-6 hover:border-brand300/40 transition-colors">
              <AlertTriangle className="w-6 h-6 text-amber-600 mb-3" />
              <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-1">
                user-impacting incidents
              </p>
              <p className="font-mono text-textPrimary">{SUPPORT_EMAIL}</p>
            </a>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 lg:px-12">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <Bug className="w-7 h-7 text-brand300" />
            <h2 className="font-display text-3xl md:text-4xl text-textPrimary">bug bounty</h2>
          </div>
          <p className="text-textSecondary mb-10 max-w-3xl">
            we reward security researchers who report valid vulnerabilities through the disclosure
            channel above. payouts are in bch at the spot rate at the time of payout, capped at the
            usd-equivalent ranges below. bounty tiers are guidance - final award is at our
            discretion based on severity, exploitability, and the quality of the report.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
            {BOUNTY_TIERS.map((tier) => (
              <motion.div
                key={tier.severity}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className={`${tier.bg} ${tier.border} border rounded-2xl p-6`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-mono uppercase tracking-wider ${tier.color}`}>
                    {tier.severity}
                  </span>
                  <span className={`font-display text-xl ${tier.color}`}>{tier.range}</span>
                </div>
                <p className="text-sm text-textSecondary leading-relaxed">{tier.examples}</p>
              </motion.div>
            ))}
          </div>

          <div className="bg-surfaceAlt/40 border border-border rounded-2xl p-6 md:p-8">
            <h3 className="font-display text-xl text-textPrimary mb-4">what is in scope</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-textSecondary">
              <div>
                <p className="font-mono uppercase tracking-wider text-textMuted text-xs mb-2">
                  contracts
                </p>
                <ul className="space-y-1">
                  <li>→ vault covenants</li>
                  <li>→ stream covenants</li>
                  <li>→ airdrop / bounty / reward / grant covenants</li>
                  <li>→ governance covenants</li>
                </ul>
              </div>
              <div>
                <p className="font-mono uppercase tracking-wider text-textMuted text-xs mb-2">
                  services
                </p>
                <ul className="space-y-1">
                  <li>→ flowguard.cash, app.flowguard.cash, explorer.flowguard.cash</li>
                  <li>→ public api endpoints</li>
                  <li>→ executor (signed transaction posting only)</li>
                  <li>→ indexer state derivation</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 lg:px-12 bg-surfaceAlt/30">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <GitPullRequest className="w-7 h-7 text-brand300" />
            <h2 className="font-display text-3xl md:text-4xl text-textPrimary">latest reports</h2>
          </div>
          <p className="text-textSecondary mb-10 max-w-3xl">
            material security work tracked in reverse chronological order. each entry corresponds to
            a public commit or release tag and can be traced to a closed advisory in the internal
            remediation log.
          </p>

          <ol className="relative border-l-2 border-border ml-3">
            {TIMELINE.map((item, idx) => (
              <motion.li
                key={item.date}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.05 }}
                className="mb-8 ml-8"
              >
                <span className="absolute -left-3 flex items-center justify-center w-6 h-6 bg-brand300 rounded-full ring-4 ring-background">
                  <span className="w-2 h-2 bg-white rounded-full" />
                </span>
                <p className="font-mono text-xs uppercase tracking-wider text-textMuted mb-2">
                  {item.date}
                </p>
                <h3 className="font-display text-xl text-textPrimary mb-2">{item.title}</h3>
                <p className="text-textSecondary text-sm leading-relaxed">{item.body}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-20 md:py-28 px-6 lg:px-12 relative overflow-hidden border-t border-border/30 bg-[#F1F3E0]">
        <NoiseBackground />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="font-display text-4xl md:text-6xl mb-6 text-textPrimary">
            see something? send it our way.
          </h2>
          <p className="text-xl mb-10 text-textSecondary max-w-2xl mx-auto">
            we read every report. expect a response in under 24 hours.
          </p>
          <a href={`mailto:${SECURITY_EMAIL}`}>
            <motion.button
              whileHover={{ scale: 1.05, y: -4 }}
              whileTap={{ scale: 0.95 }}
              className="group bg-primary text-white px-12 py-6 rounded-full text-lg font-bold hover:bg-primaryHover transition-all shadow-2xl flex items-center gap-3 mx-auto"
            >
              <Mail className="w-6 h-6" />
              {SECURITY_EMAIL}
            </motion.button>
          </a>
        </div>
      </section>

      <Footer />
    </main>
  );
}
