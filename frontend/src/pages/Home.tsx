import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Lock, Vote, Zap, CheckCircle2, ArrowRight, Database, Clock, Coins, Users, PieChart, Gift, Eye, Menu, X, ChevronDown } from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { SolutionsDropdown } from '../components/ui/SolutionsDropdown';
import { ResourcesDropdown } from '../components/ui/ResourcesDropdown';
import { MobileMenu } from '../components/layout/MobileMenu';
import Hero3D from '../components/hero/Hero3D';
import { NoiseBackground } from '../components/ui/NoiseBackground';

const fadeInUp = {
  initial: { opacity: 0, y: 60 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: 'easeOut' as const }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

export default function Home() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number>(0);

  return (
    <main className="bg-background min-h-screen">
      <MobileMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/30 h-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 h-full flex justify-between items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Link to="/">
              <img
                src="/assets/flow-green.png"
                alt="FlowGuard"
                className="h-8 object-contain"
              />
            </Link>
          </motion.div>
          <div className="hidden md:flex items-center space-x-10">
            <SolutionsDropdown />
            <Link to="/developers" className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors">
              Developers
            </Link>
            <a href="#security" className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors">Security</a>
            <ResourcesDropdown />
            <Link to="/vaults">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-primary text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-primaryHover transition-all shadow-lg hover:shadow-xl"
              >
                Launch App
              </motion.button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-textPrimary hover:bg-surfaceAlt rounded-lg transition-colors relative z-50"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </nav>

      <section className="pt-24 md:pt-28 lg:pt-32 pb-8 md:pb-10 px-4 md:px-6 lg:px-12 bg-surface overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div className="flex flex-col">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surfaceAlt/50 border border-border mb-6 w-fit"
              >
                <span className="w-2 h-2 rounded-full bg-brand300 animate-pulse" />
                <span className="text-xs font-mono text-textSecondary">v0.2.0-alpha · Chipnet</span>
              </motion.div>

              <motion.h1
                {...fadeInUp}
                className="font-display text-4xl md:text-5xl lg:text-6xl leading-[0.95] mb-4 text-textPrimary"
              >
                Where Logic
                <br />
                <span className="text-brand300">Becomes Law</span>
              </motion.h1>

              <motion.p
                {...fadeInUp}
                transition={{ delay: 0.1, duration: 0.6 }}
                className="text-lg md:text-xl text-textSecondary mb-6 leading-relaxed"
              >
                The Protocol for Guaranteed, Permissionless Fund Movement on BCH.
              </motion.p>

              <motion.div
                {...fadeInUp}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10"
              >
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-surface border border-border">
                  <CheckCircle2 className="w-5 h-5 text-brand300 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-textPrimary mb-1 text-sm">Rules enforced Onchain</p>
                    <p className="text-xs text-textSecondary">Spending limits and release conditions cannot be overridden</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-surface border border-border">
                  <CheckCircle2 className="w-5 h-5 text-brand300 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-textPrimary mb-1 text-sm">Time-locked by default</p>
                    <p className="text-xs text-textSecondary">Funds unlock only when the time conditions are met</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                {...fadeInUp}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="flex flex-col sm:flex-row gap-4"
              >
                <Link to="/vaults">
                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    className="group bg-primary text-white px-8 py-4 rounded-full text-base font-semibold hover:bg-primaryHover transition-all shadow-2xl hover:shadow-brand300/20 flex items-center gap-3"
                  >
                    Launch App
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </motion.button>
                </Link>
                <a
                  href="#features"
                  onClick={(e) => {
                    e.preventDefault();
                    document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    className="border-2 border-border text-textPrimary px-8 py-4 rounded-full text-base font-semibold hover:border-primary hover:bg-surfaceAlt/30 transition-all"
                  >
                    See Payment Flows
                  </motion.button>
                </a>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.2 }}
              className="w-full h-[400px] lg:h-[600px]"
            >
              <Hero3D />
            </motion.div>
          </div>
        </div>
      </section>


      <section className="py-6 md:py-8 px-4 md:px-6 border-y border-border/30 bg-surfaceAlt/20 mt-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="flex flex-wrap justify-center md:justify-between items-center gap-6 md:gap-8"
          >
            {['You Control the Funds', 'Built on Bitcoin Cash', 'Publicly Verifiable', 'CashTokens Support', 'Open Source'].map((item, i) => (
              <motion.span
                key={item}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-xs font-mono uppercase tracking-wider text-textMuted"
              >
                {item}
              </motion.span>
            ))}
          </motion.div>
        </div>
      </section>

      <section id="problem" className="py-16 md:py-20 lg:py-24 px-4 md:px-6 lg:px-12 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              <h2 className="font-display text-5xl mb-8 text-textPrimary leading-tight">
                The problem with manual treasury management
              </h2>
              <div className="space-y-6 text-lg text-textSecondary">
                <p>
                  Traditional multisig wallets require manual coordination for every payment.
                  Budgets are tracked in spreadsheets. Spending caps aren't enforced—they're just guidelines.
                </p>
                <p>
                  Every payment requires manual coordination. Budget tracking is error-prone.
                  There's no automatic audit trail. Trust is social, not technical.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="relative"
            >
              <div className="bg-surfaceAlt/30 border border-border rounded-3xl p-10">
                <h3 className="font-display text-4xl mb-6 text-textPrimary">FlowGuard automates this</h3>
                <div className="space-y-6 text-lg text-textSecondary">
                  <p>
                    Set the rules once, and the blockchain enforces them automatically.
                    Spending caps that can't be exceeded. Approval requirements that can't be bypassed.
                  </p>
                  <p>
                    Payments happen on schedule without manual intervention. All activity is publicly visible.
                    Rules are locked in—no one can change them, not even the signers.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section id="features" className="pt-12 md:pt-16 lg:pt-20 pb-16 md:pb-20 lg:pb-24 px-4 md:px-6 lg:px-12 bg-surfaceAlt/10">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10 md:mb-12 lg:mb-16"
          >
            <h2 className="font-display text-3xl md:text-5xl lg:text-6xl mb-4 md:mb-6 text-textPrimary">What FlowGuard Can Do</h2>
            <p className="text-base md:text-lg lg:text-xl text-textSecondary max-w-3xl mx-auto">
              Complete treasury management with automated controls, governance, and transparency
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:auto-rows-fr"
          >
            {/* Treasury Management - Large Feature */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="lg:col-span-2 lg:row-span-2 bg-white border border-border rounded-2xl p-5 md:p-6 lg:p-8 hover:border-primary/50 transition-all duration-300 group"
            >
              <div className="h-full flex flex-col">
                <div className="w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 mb-4 md:mb-5 lg:mb-6">
                  <img src="/assets/features/treasury.png" alt="Treasury" className="w-full h-full object-contain" />
                </div>
                <h3 className="font-display text-lg md:text-xl lg:text-2xl mb-2 md:mb-3 lg:mb-4 text-textPrimary">Treasury Management</h3>
                <p className="text-sm md:text-base text-textSecondary leading-relaxed mb-4 md:mb-5 lg:mb-6 lg:flex-grow">
                  Create and manage multiple treasuries with customizable rules. Set spending limits, approval workflows, and automated controls. Full transparency with on-chain activity tracking.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-textSecondary">
                    <CheckCircle2 className="w-4 h-4 mr-2 text-accent" />
                    Multi-signature security
                  </div>
                  <div className="flex items-center text-sm text-textSecondary">
                    <CheckCircle2 className="w-4 h-4 mr-2 text-accent" />
                    Spending limits & controls
                  </div>
                  <div className="flex items-center text-sm text-textSecondary">
                    <CheckCircle2 className="w-4 h-4 mr-2 text-accent" />
                    Real-time activity tracking
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Vesting */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-white border border-border rounded-2xl p-4 md:p-5 lg:p-6 hover:border-primary/50 transition-all duration-300 group"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 mb-3 md:mb-4">
                <img src="/assets/features/vesting.png" alt="Vesting" className="w-full h-full object-contain" />
              </div>
              <h3 className="font-display text-base md:text-lg lg:text-xl mb-2 md:mb-3 text-textPrimary">Vesting</h3>
              <p className="text-xs md:text-sm text-textSecondary leading-relaxed">
                Set up token vesting schedules with customizable cliffs and unlock periods. Automated distribution on schedule.
              </p>
            </motion.div>

            {/* Payments */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="bg-white border border-border rounded-2xl p-4 md:p-5 lg:p-6 hover:border-primary/50 transition-all duration-300 group"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 mb-3 md:mb-4">
                <img src="/assets/features/payments.png" alt="Payments" className="w-full h-full object-contain" />
              </div>
              <h3 className="font-display text-base md:text-lg lg:text-xl mb-2 md:mb-3 text-textPrimary">Payments</h3>
              <p className="text-xs md:text-sm text-textSecondary leading-relaxed">
                Execute one-time or recurring payments with automated scheduling. No manual intervention required.
              </p>
            </motion.div>

            {/* Proposals */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="bg-white border border-border rounded-2xl p-4 md:p-5 lg:p-6 hover:border-primary/50 transition-all duration-300 group"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 mb-3 md:mb-4">
                <img src="/assets/features/proposals.png" alt="Proposals" className="w-full h-full object-contain" />
              </div>
              <h3 className="font-display text-base md:text-lg lg:text-xl mb-2 md:mb-3 text-textPrimary">Proposals</h3>
              <p className="text-xs md:text-sm text-textSecondary leading-relaxed">
                Create and vote on treasury proposals. Transparent decision-making with configurable approval thresholds.
              </p>
            </motion.div>

            {/* Budget Plans */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
              className="bg-white border border-border rounded-2xl p-4 md:p-5 lg:p-6 hover:border-primary/50 transition-all duration-300 group"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 mb-3 md:mb-4">
                <img src="/assets/features/budget.png" alt="Budget Plans" className="w-full h-full object-contain" />
              </div>
              <h3 className="font-display text-base md:text-lg lg:text-xl mb-2 md:mb-3 text-textPrimary">Budget Plans</h3>
              <p className="text-xs md:text-sm text-textSecondary leading-relaxed">
                Define spending budgets by category, time period, or recipient. Automatic enforcement prevents overspending.
              </p>
            </motion.div>

            {/* Explorer - Wide Feature */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.6 }}
              className="lg:col-span-2 bg-white border border-border rounded-2xl p-4 md:p-5 lg:p-6 hover:border-primary/50 transition-all duration-300 group"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 mb-3 md:mb-4">
                <img src="/assets/features/explorer.png" alt="Activity Explorer" className="w-full h-full object-contain" />
              </div>
              <h3 className="font-display text-base md:text-lg lg:text-xl mb-2 md:mb-3 text-textPrimary">Activity Explorer</h3>
              <p className="text-xs md:text-sm text-textSecondary leading-relaxed">
                Track all treasury activity in real-time. View approvals, payments, unlocks, and governance actions. Complete transparency with blockchain verification.
              </p>
            </motion.div>

            {/* Governance */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.7 }}
              className="bg-white border border-border rounded-2xl p-4 md:p-5 lg:p-6 hover:border-primary/50 transition-all duration-300 group"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 mb-3 md:mb-4">
                <img src="/assets/features/governance.png" alt="Governance" className="w-full h-full object-contain" />
              </div>
              <h3 className="font-display text-base md:text-lg lg:text-xl mb-2 md:mb-3 text-textPrimary">Governance</h3>
              <p className="text-xs md:text-sm text-textSecondary leading-relaxed">
                On-chain governance with configurable voting rules. Democratic decision-making for treasury management.
              </p>
            </motion.div>

            {/* Airdrops */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.8 }}
              className="bg-white border border-border rounded-2xl p-4 md:p-5 lg:p-6 hover:border-primary/50 transition-all duration-300 group"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 mb-3 md:mb-4">
                <img src="/assets/features/airdrops.png" alt="Airdrops" className="w-full h-full object-contain" />
              </div>
              <h3 className="font-display text-base md:text-lg lg:text-xl mb-2 md:mb-3 text-textPrimary">Airdrops</h3>
              <p className="text-xs md:text-sm text-textSecondary leading-relaxed">
                Distribute tokens to multiple recipients efficiently. Batch processing with automated execution.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section className="py-16 md:py-20 lg:py-24 px-4 md:px-6 lg:px-12 bg-surface">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-6xl mb-6 text-textPrimary">How FlowGuard Works</h2>
            <p className="text-xl text-textSecondary max-w-3xl mx-auto">
              Four simple steps to automate your treasury
            </p>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { num: '01', title: 'Create Treasury', desc: 'Set who can approve spending, what the limits are, and how funds unlock. Add initial funds to get started.' },
              { num: '02', title: 'Set Up Schedules', desc: 'Define budgets, vesting, or recurring payments. Set the amounts and timing for each.' },
              { num: '03', title: 'Approve Proposals', desc: 'Large expenses require multiple approvals. You choose how many signers need to approve.' },
              { num: '04', title: 'Funds Release', desc: 'Payments happen on schedule or when approvals are met. Rules are checked automatically.' }
            ].map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative group"
              >
                <div className="relative p-8 rounded-3xl border border-border hover:border-brand300/50 transition-all hover:bg-surfaceAlt/10">
                  <div className="text-7xl font-display text-brand300/20 mb-6">{step.num}</div>
                  <h3 className="font-display text-2xl mb-4 text-textPrimary">{step.title}</h3>
                  <p className="text-textSecondary leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="security" className="pt-12 md:pt-16 lg:pt-20 pb-16 md:pb-20 lg:pb-24 px-6 lg:px-12 bg-surfaceAlt/10">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-6xl mb-6 text-textPrimary">Built on Bitcoin Cash</h2>
            <p className="text-xl text-textSecondary max-w-3xl mx-auto">
              FlowGuard uses native Bitcoin Cash features to enforce treasury rules
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-3 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-surface border border-border rounded-3xl p-8 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-brand300/20 flex items-center justify-center mx-auto mb-6">
                <Shield className="w-8 h-8 text-brand300" />
              </div>
              <h3 className="font-display text-2xl text-textPrimary mb-4">Rules locked into the blockchain</h3>
              <p className="text-textSecondary">Spending rules are part of the blockchain itself. They can't be bypassed or changed after creation.</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-surface border border-border rounded-3xl p-8 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-brand300/20 flex items-center justify-center mx-auto mb-6">
                <Lock className="w-8 h-8 text-brand300" />
              </div>
              <h3 className="font-display text-2xl text-textPrimary mb-4">You control the funds</h3>
              <p className="text-textSecondary">FlowGuard doesn't have access to your treasury. No third party controls your funds.</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="bg-surface border border-border rounded-3xl p-8 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-brand300/20 flex items-center justify-center mx-auto mb-6">
                <Eye className="w-8 h-8 text-brand300" />
              </div>
              <h3 className="font-display text-2xl text-textPrimary mb-4">All activity is publicly verifiable</h3>
              <p className="text-textSecondary">Every approval, payment, and unlock is recorded on the blockchain for anyone to audit.</p>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mt-12"
          >
            <Link to="/security">
              <button className="text-primary hover:text-primaryHover font-semibold inline-flex items-center gap-2 group">
                Learn more about security
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Removed detailed security model - moved to /security page */}

      {/* KEEP: Old security section for reference, can delete after /security page is created */}
      {/* <section id="security-old" className="hidden">
        <div className="grid lg:grid-cols-2 gap-12">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-surface border border-border rounded-3xl p-10"
            >
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-full bg-brand300/20 flex items-center justify-center">
                  <Code2 className="w-6 h-6 text-brand300" />
                </div>
                <h3 className="font-display text-3xl text-textPrimary">On-Chain Enforcement</h3>
              </div>
              <ul className="space-y-4">
                {[
                  'Spending guardrails validated by covenant logic',
                  'M-of-N signature verification in script',
                  'Timelock enforcement via CLTV/CSV primitives',
                  'Treasury state transitions validated by protocol',
                  'Token-weighted vote commitments enforced'
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-brand300 mt-0.5 flex-shrink-0" />
                    <span className="text-textSecondary">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-warning/5 border border-warning/30 rounded-3xl p-10"
            >
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center">
                  <Network className="w-6 h-6 text-warning" />
                </div>
                <h3 className="font-display text-3xl text-textPrimary">Off-Chain Services</h3>
              </div>
              <ul className="space-y-4 mb-6">
                {[
                  'Indexer reconstructs state (verifiable by validators)',
                  'Executors provide liveness (economic incentive)',
                  'Vote tallies for large sets use M-of-N attestation',
                  'Metadata storage (IPFS or centralized with hash verification)'
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                    <span className="text-textSecondary">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="p-4 bg-warning/10 rounded-2xl border border-warning/30">
                <p className="text-sm text-textPrimary font-medium">
                  FlowGuard cannot auto-execute. The UTXO model requires off-chain transaction construction and broadcasting.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section> */}

      <section className="py-16 md:py-20 lg:py-24 px-4 md:px-6 lg:px-12 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="border-2 border-warning/40 bg-warning/5 p-10 rounded-3xl">
                <div className="flex items-center gap-3 mb-6">
                  <span className="w-3 h-3 rounded-full bg-warning animate-pulse" />
                  <h3 className="text-warning text-sm font-mono uppercase tracking-wider">Deployment Status</h3>
                </div>
                <p className="font-display text-4xl mb-6 text-textPrimary">Alpha Integration Phase</p>
                <p className="text-textSecondary leading-relaxed">
                  Basic multisig and guardrails operational on Chipnet. Advanced features (governance tallying, arbitrary M-of-N)
                  scheduled for <strong className="text-textPrimary">May 15, 2026</strong> following BCHN Layla upgrade.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="font-display text-5xl mb-8 text-textPrimary leading-tight">
                Engineered for Layla CHIPs
              </h2>
              <p className="text-lg text-textSecondary mb-8 leading-relaxed">
                FlowGuard uses modular covenants for efficient state encoding and predictable execution.
                Post-May 2026, Loops, Functions, and Bitwise CHIPs enable trustless vote tallying and arbitrary M-of-N.
              </p>
              <div className="space-y-3 font-mono text-sm text-textMuted">
                <div className="flex items-center gap-3">
                  <span className="text-brand300">→</span>
                  <span>Loops for unbounded iteration</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-brand300">→</span>
                  <span>Functions for modular contract logic</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-brand300">→</span>
                  <span>Bitwise for compact state encoding</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-brand300">→</span>
                  <span>P2S for improved wallet UX</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section id="faq" className="pt-12 md:pt-16 lg:pt-20 pb-16 md:pb-20 lg:pb-24 px-6 lg:px-12 bg-surfaceAlt/10">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-6xl mb-6 text-textPrimary">Frequently asked questions</h2>
          </motion.div>

          <div className="space-y-3">
            {[
              {
                q: 'Who controls the funds?',
                a: "You do. FlowGuard doesn't hold your keys or have access to treasury funds. You set the rules, and the blockchain enforces them—no middleman."
              },
              {
                q: 'Do payments happen automatically?',
                a: 'Yes and no. Payments unlock automatically when the schedule allows, but someone (you or an executor service) must broadcast the transaction to the network. Think of it like a time-locked safe—it opens on time, but someone still needs to take the funds out.'
              },
              {
                q: 'Can spending rules be changed after creation?',
                a: 'No. Once a treasury is created with specific rules, those rules are permanent. This prevents anyone from changing the limits or bypassing approvals later.'
              },
              {
                q: 'What happens if a signer loses access?',
                a: 'If you set up a 3-of-5 multisig, you can lose 2 signers and still operate. Choose your approval threshold carefully based on your security needs.'
              },
              {
                q: 'Is this production-ready?',
                a: 'FlowGuard is in alpha on Chipnet (BCH test network). Mainnet launch planned after external audits and beta testing. Use at your own risk.'
              },
              {
                q: 'How do I get started?',
                a: 'Connect a BCH wallet (Paytaca recommended), create a treasury with your spending rules, then set up vesting, payroll, or budget plans as needed.'
              }
            ].map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className={`bg-surface border rounded-2xl overflow-hidden transition-colors ${openFaq === i ? 'border-brand300/60' : 'border-border hover:border-brand300/30'
                  }`}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                  className="w-full flex items-center justify-between gap-4 px-8 py-6 text-left"
                >
                  <span className={`font-display text-xl transition-colors ${openFaq === i ? 'text-brand300' : 'text-textPrimary'
                    }`}>{faq.q}</span>
                  <motion.div
                    animate={{ rotate: openFaq === i ? 180 : 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex-shrink-0"
                  >
                    <ChevronDown className={`w-5 h-5 transition-colors ${openFaq === i ? 'text-brand300' : 'text-textMuted'
                      }`} />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {openFaq === i && (
                    <motion.div
                      key="answer"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <p className="px-8 pb-6 text-textSecondary leading-relaxed">{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28 lg:py-32 px-4 md:px-6 lg:px-12 relative overflow-hidden border-t border-border/30 bg-[#F1F3E0]">
        <NoiseBackground />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-5xl md:text-6xl mb-6 leading-tight text-textPrimary">
              Ready to enforce your treasury on-chain?
            </h2>
            <p className="text-xl mb-10 text-textSecondary leading-relaxed max-w-2xl mx-auto">
              Deploy your first non-custodial treasury with predictable budget automation
            </p>
            <Link to="/vaults">
              <motion.button
                whileHover={{ scale: 1.05, y: -4 }}
                whileTap={{ scale: 0.95 }}
                className="group bg-primary text-white px-12 py-6 rounded-full text-lg font-bold hover:bg-primaryHover transition-all shadow-2xl flex items-center gap-3 mx-auto"
              >
                Launch App
                <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
              </motion.button>
            </Link>
          </motion.div>
        </div>
      </section>

      <Footer />
    </main >
  );
}

