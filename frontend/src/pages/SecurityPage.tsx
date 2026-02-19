import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Lock, Code2, Network, Eye, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { NoiseBackground } from '../components/ui/NoiseBackground';
import { SolutionsDropdown } from '../components/ui/SolutionsDropdown';

const fadeInUp = {
  initial: { opacity: 0, y: 60 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: 'easeOut' as const }
};

export default function SecurityPage() {
  return (
    <main className="bg-background min-h-screen">
      {/* Navigation */}
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
            <Link to="/security" className="text-sm font-medium text-primary">
              Security
            </Link>
            <a href="/#faq" className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors">FAQ</a>
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
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-6 lg:px-12">
        <div className="max-w-4xl mx-auto text-center">

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/30 mb-6"
          >
            <Shield className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-accent">Security Model</span>
          </motion.div>

          <motion.h1
            {...fadeInUp}
            className="font-display text-5xl md:text-7xl mb-6 text-textPrimary leading-tight"
          >
            How FlowGuard keeps your treasury secure
          </motion.h1>

          <motion.p
            {...fadeInUp}
            transition={{ delay: 0.1 }}
            className="text-xl text-textSecondary leading-relaxed"
          >
            FlowGuard uses Bitcoin Cash's native features to enforce spending rules without holding your funds.
            Here's how the security model works.
          </motion.p>
        </div>
      </section>

      {/* Core Principles */}
      <section className="py-16 px-6 lg:px-12 bg-surfaceAlt/20">
        <div className="max-w-7xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="font-display text-4xl text-center mb-12 text-textPrimary"
          >
            Three security principles
          </motion.h2>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Lock,
                title: 'You control the funds',
                description: 'FlowGuard never has access to your treasury. You hold the keys. Treasury rules are locked into the blockchain itself—not stored on our servers.',
              },
              {
                icon: Shield,
                title: "Rules can't be bypassed",
                description: 'Spending limits and approval requirements are enforced by the blockchain. No one can override them, not even the signers or FlowGuard.',
              },
              {
                icon: Eye,
                title: 'Everything is verifiable',
                description: 'All treasury activity is recorded on the blockchain. Anyone can audit approvals, payments, and unlocks without trusting FlowGuard.',
              },
            ].map((principle, index) => {
              const Icon = principle.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-surface border border-border rounded-2xl p-8 text-center"
                >
                  <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
                    <Icon className="w-8 h-8 text-accent" />
                  </div>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">{principle.title}</h3>
                  <p className="text-textSecondary leading-relaxed">{principle.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* What's Enforced On-Chain */}
      <section className="py-20 px-6 lg:px-12">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12"
          >
            <h2 className="font-display text-4xl mb-4 text-textPrimary">What's enforced by the blockchain</h2>
            <p className="text-xl text-textSecondary">
              These rules are part of the blockchain itself and cannot be bypassed
            </p>
          </motion.div>

          <div className="space-y-6">
            {[
              {
                icon: CheckCircle2,
                title: 'Spending limits',
                description: 'Monthly caps, per-recipient limits, and category budgets are checked automatically. Transactions that exceed limits are rejected by the blockchain.',
              },
              {
                icon: CheckCircle2,
                title: 'Approval requirements',
                description: 'If a proposal needs 3-of-5 approvals, the blockchain verifies all 3 signatures are present before allowing execution.',
              },
              {
                icon: CheckCircle2,
                title: 'Time-based locks',
                description: 'Funds locked with a timelock cannot be withdrawn early. The blockchain rejects any transaction that tries.',
              },
              {
                icon: CheckCircle2,
                title: 'Treasury state validation',
                description: 'Every transaction updates the treasury state (balance, spent this month, etc). The blockchain validates each state change.',
              },
              {
                icon: CheckCircle2,
                title: 'Vote commitments',
                description: "When voting with tokens, your vote is locked in. You can't change it or double-vote because the blockchain tracks it.",
              },
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  className="flex gap-4 p-6 bg-surface border border-border rounded-2xl"
                >
                  <Icon className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-lg font-semibold text-textPrimary mb-2">{item.title}</h3>
                    <p className="text-textSecondary leading-relaxed">{item.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* What's Off-Chain */}
      <section className="py-20 px-6 lg:px-12 bg-warning/5">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-warning/10 border border-warning/30 mb-4">
              <AlertCircle className="w-4 h-4 text-warning" />
              <span className="text-sm font-medium text-warning">Trust Required</span>
            </div>
            <h2 className="font-display text-4xl mb-4 text-textPrimary">What requires trust in FlowGuard</h2>
            <p className="text-xl text-textSecondary">
              These parts rely on off-chain services. They don't control your funds, but they provide convenience.
            </p>
          </motion.div>

          <div className="space-y-6">
            {[
              {
                icon: Network,
                title: 'Activity indexer',
                description: 'FlowGuard runs an indexer that reconstructs treasury state from the blockchain. This makes the UI fast. But you can run your own indexer to verify everything independently.',
                trust: 'You trust the data displayed in the UI, but can verify by running your own indexer',
              },
              {
                icon: Code2,
                title: 'Automatic executors',
                description: "Executor services watch for eligible transactions (expired timelocks, approved proposals) and broadcast them. They can't bypass rules, but they do provide liveness.",
                trust: 'You trust executors to broadcast transactions on time, but can always execute manually',
              },
              {
                icon: Network,
                title: 'Vote tallies for large groups',
                description: 'For votes with many participants, a trusted group tallies the results and commits them on-chain. Post-May 2026, this will be trustless using the Loops upgrade.',
                trust: 'You trust the tally attestors until Loops upgrade enables trustless counting',
              },
              {
                icon: Code2,
                title: 'Metadata storage',
                description: 'Proposal descriptions, treasury names, and other metadata are stored off-chain (IPFS or FlowGuard servers). Only the content hash goes on-chain.',
                trust: 'You trust FlowGuard to serve metadata, but the hash prevents tampering',
              },
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-surface border border-warning/30 rounded-2xl p-6"
                >
                  <div className="flex gap-4 mb-4">
                    <Icon className="w-6 h-6 text-warning flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-textPrimary mb-2">{item.title}</h3>
                      <p className="text-textSecondary leading-relaxed mb-3">{item.description}</p>
                      <div className="p-3 bg-warning/10 rounded-lg border border-warning/20">
                        <p className="text-sm text-textPrimary">
                          <strong>Trust assumption:</strong> {item.trust}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Key Limitation */}
      <section className="py-20 px-6 lg:px-12">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-surfaceAlt/50 border-2 border-border rounded-3xl p-10"
          >
            <div className="flex items-start gap-4 mb-6">
              <AlertCircle className="w-8 h-8 text-warning flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-2xl font-display font-bold text-textPrimary mb-4">
                  Important limitation: FlowGuard cannot auto-execute
                </h3>
                <p className="text-lg text-textSecondary leading-relaxed mb-4">
                  Bitcoin Cash uses a UTXO model, which means someone must construct and broadcast transactions.
                  The blockchain can't "wake up" and execute things on its own.
                </p>
                <p className="text-lg text-textSecondary leading-relaxed">
                  FlowGuard executor services provide liveness by monitoring and broadcasting eligible transactions.
                  But you can always execute manually if executors are offline. Executors cannot bypass any rules—they
                  can only trigger transactions that the blockchain has already approved.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      {/* CTA */}
      <section className="relative overflow-hidden py-24 px-6 lg:px-12 bg-accent/5">
        <NoiseBackground />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-4xl md:text-5xl mb-6 text-textPrimary">
              Ready to secure your treasury?
            </h2>
            <p className="text-xl text-textSecondary mb-10">
              Create a treasury with rules that enforce themselves
            </p>
            <Link to="/vaults">
              <button className="group bg-primary text-white px-12 py-6 rounded-full text-lg font-bold hover:bg-primaryHover transition-all shadow-2xl flex items-center gap-3 mx-auto">
                Launch App
                <ArrowLeft className="w-6 h-6 rotate-180 group-hover:translate-x-2 transition-transform" />
              </button>
            </Link>
          </motion.div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
