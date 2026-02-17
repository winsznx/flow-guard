import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, PieChart, Shield, AlertCircle, TrendingDown, Lock, Check } from 'lucide-react';
import { Footer } from '../../components/layout/Footer';
import { SolutionsDropdown } from '../../components/ui/SolutionsDropdown';

export default function BudgetingPage() {
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
            <Link to="/developers" className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors">
              Developers
            </Link>
            <Link to="/security" className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors">
              Security
            </Link>
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
            <PieChart className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-accent">Treasury Budgeting</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-display text-5xl md:text-7xl mb-6 text-textPrimary leading-tight"
          >
            Set spending limits that enforce themselves
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-textSecondary mb-10 max-w-3xl mx-auto"
          >
            Define monthly spending caps by category or recipient. Require multiple approvals for large expenses.
            Budget rules can't be bypassed—they're locked into the blockchain.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link to="/budgets/create">
              <button className="group bg-primary text-white px-8 py-4 rounded-full text-base font-semibold hover:bg-primaryHover transition-all shadow-2xl hover:shadow-accent/20 flex items-center gap-3">
                Create Budget Plan
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
            <Link to="/docs/budgeting">
              <button className="border-2 border-border text-textPrimary px-8 py-4 rounded-full text-base font-semibold hover:border-primary hover:bg-surfaceAlt/30 transition-all">
                See Budget Examples
              </button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Value Props - Vertical Scroll Experience */}
      <section className="relative bg-surfaceAlt/30 overflow-hidden">
        <div className="py-12 md:py-20">
          {[
            { icon: Shield, title: 'Monthly spending caps', description: 'Set a maximum that can be spent each month.', detail: 'Overspending is blocked automatically.' },
            { icon: Lock, title: 'Recipient limits', description: 'Cap how much any single recipient can receive per month.', detail: 'Prevents concentration risk.' },
            { icon: AlertCircle, title: 'Category budgets', description: 'Allocate amounts to Marketing, Development, Operations, etc.', detail: 'Track spending by category.' },
            { icon: Check, title: 'Approval requirements', description: 'Large expenses need multiple approvals before execution.', detail: 'You set the threshold.' },
            { icon: TrendingDown, title: "Track what's left", description: "See how much of this month's budget has been spent.", detail: "Know what's available before spending." },
            { icon: PieChart, title: "Rules can't be bypassed", description: 'Budget limits are enforced by the blockchain.', detail: 'No one can override them, not even signers.' },
          ].map((item, index) => {
            const Icon = item.icon;
            const isEven = index % 2 === 0;
            return (
              <motion.div key={index} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, margin: "-15%" }} transition={{ duration: 1, ease: "easeOut" }} className="relative py-8 md:py-16">
                <motion.div initial={{ y: 60 }} whileInView={{ y: 0 }} viewport={{ once: true, margin: "-15%" }} transition={{ duration: 1.2, ease: "easeOut" }} className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-30" style={{ transform: `translateY(${index * 3}%)` }} />
                <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12">
                  <div className={`flex flex-col ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'} gap-8 md:gap-16 items-center`}>
                    <motion.div initial={{ opacity: 0, x: isEven ? -40 : 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-15%" }} transition={{ duration: 1, delay: 0.2, ease: "easeOut" }} className="flex items-center gap-6 md:gap-8 flex-shrink-0">
                      <div className="relative"><div className="absolute inset-0 bg-accent/20 blur-xl rounded-full" /><div className="relative w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-surface border-2 border-border flex items-center justify-center"><Icon className="w-8 h-8 md:w-10 md:h-10 text-accent" /></div></div>
                      <div className="text-6xl md:text-7xl font-display text-accent/10 select-none">{String(index + 1).padStart(2, '0')}</div>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, x: isEven ? 40 : -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-15%" }} transition={{ duration: 1, delay: 0.4, ease: "easeOut" }} className="flex-1 space-y-3 md:space-y-4">
                      <h3 className="font-display text-3xl md:text-4xl text-textPrimary leading-tight">{item.title}</h3>
                      <p className="text-lg md:text-xl text-textSecondary leading-relaxed">{item.description}</p>
                      <p className="text-base md:text-lg text-textMuted leading-relaxed border-l-4 border-accent/30 pl-4 md:pl-6">{item.detail}</p>
                    </motion.div>
                  </div>
                </div>
                {index < 5 && <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/30 to-transparent" />}
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-20 px-6 lg:px-12">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-4xl text-center mb-12 text-textPrimary">Common use cases</h2>
          <div className="space-y-6">
            {[
              {
                title: 'Department budgets',
                description: 'Give each department a monthly budget. Marketing gets $10k, Development gets $20k, etc.',
              },
              {
                title: 'Spending caps',
                description: 'Limit total monthly spending to $50k. Prevents treasury drain during market downturns.',
              },
              {
                title: 'Vendor limits',
                description: 'Cap how much each vendor can be paid per month. Useful for managing contractor costs.',
              },
            ].map((useCase, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 border-l-4 border-accent bg-surfaceAlt/50 rounded-r-xl"
              >
                <h3 className="text-xl font-semibold text-textPrimary mb-2">{useCase.title}</h3>
                <p className="text-textSecondary">{useCase.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 lg:px-12 bg-accent/5">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-display text-4xl md:text-5xl mb-6 text-textPrimary">
            Ready to control treasury spending?
          </h2>
          <p className="text-xl text-textSecondary mb-10">
            Set up your first budget plan in minutes
          </p>
          <Link to="/budgets/create">
            <button className="group bg-primary text-white px-12 py-6 rounded-full text-lg font-bold hover:bg-primaryHover transition-all shadow-2xl flex items-center gap-3 mx-auto">
              Create Budget Plan
              <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
            </button>
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}
