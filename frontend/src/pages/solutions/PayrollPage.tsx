import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Users, Calendar, Clock, Pause, DollarSign, Check } from 'lucide-react';
import { Footer } from '../../components/layout/Footer';
import { SolutionsDropdown } from '../../components/ui/SolutionsDropdown';
import { NoiseBackground } from '../../components/ui/NoiseBackground';
import { PageMeta } from '../../components/seo/PageMeta';

export default function PayrollPage() {
  return (
    <main className="bg-background min-h-screen">
      <PageMeta
        title="Payroll"
        description="Run BCH and CashToken payroll with fixed recurring schedules, refillable runway controls, and treasury-linked visibility."
        path="/payroll"
      />
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
            <a href="https://docs.flowguard.cash" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors">
              Developers
            </a>
            <a href="https://docs.flowguard.cash/security" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors">
              Security
            </a>
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
            <Users className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-accent">Recurring Payroll</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-display text-5xl md:text-7xl mb-6 text-textPrimary leading-tight"
          >
            Pay your team automatically, every time
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-textSecondary mb-10 max-w-3xl mx-auto"
          >
            Set up monthly, weekly, or custom payment schedules. Payments execute on time without manual approval.
            Everyone sees upcoming payments before they happen.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link to="/app">
              <button className="group bg-primary text-white px-8 py-4 rounded-full text-base font-semibold hover:bg-primaryHover transition-all shadow-2xl hover:shadow-accent/20 flex items-center gap-3">
                Launch App
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
            <a href="https://docs.flowguard.cash/concepts/recurring-payments" target="_blank" rel="noopener noreferrer">
              <button className="border-2 border-border text-textPrimary px-8 py-4 rounded-full text-base font-semibold hover:border-primary hover:bg-surfaceAlt/30 transition-all">
                Learn About Recurring Payments
              </button>
            </a>
          </motion.div>
        </div>
      </section>

      {/* Value Props - Vertical Scroll Experience */}
      <section className="relative bg-surfaceAlt/30 overflow-hidden">
        <div className="py-12 md:py-20">
          {[
            {
              icon: Clock,
              title: 'Payments on schedule',
              description: 'Set monthly, weekly, or custom intervals.',
              detail: 'Payments happen automatically when the date arrives.',
            },
            {
              icon: Check,
              title: 'No manual transfers',
              description: 'Skip the spreadsheet and calendar reminders.',
              detail: 'Payments execute themselves on the right day.',
            },
            {
              icon: Calendar,
              title: 'Preview upcoming payments',
              description: 'Everyone sees the next payment date and amount before it happens.',
              detail: 'No surprises.',
            },
            {
              icon: Pause,
              title: 'Pause or cancel anytime',
              description: 'Stop payments immediately if needed.',
              detail: 'Resume later or cancel permanently.',
            },
            {
              icon: DollarSign,
              title: 'Works with BCH and tokens',
              description: 'Pay in BCH or CashTokens.',
              detail: 'Same interface, same automation.',
            },
            {
              icon: Users,
              title: 'Multiple recipients',
              description: 'Pay your whole team from one treasury.',
              detail: 'Each person gets their own payment schedule.',
            },
          ].map((item, index) => {
            const Icon = item.icon;
            const isEven = index % 2 === 0;

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-15%" }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="relative py-8 md:py-16"
              >
                <motion.div
                  initial={{ y: 60 }}
                  whileInView={{ y: 0 }}
                  viewport={{ once: true, margin: "-15%" }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                  className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-30"
                  style={{ transform: `translateY(${index * 3}%)` }}
                />

                <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12">
                  <div className={`flex flex-col ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'} gap-8 md:gap-16 items-center`}>
                    <motion.div
                      initial={{ opacity: 0, x: isEven ? -40 : 40 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: "-15%" }}
                      transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
                      className="flex items-center gap-6 md:gap-8 flex-shrink-0"
                    >
                      <div className="relative">
                        <div className="absolute inset-0 bg-accent/20 blur-xl rounded-full" />
                        <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-surface border-2 border-border flex items-center justify-center">
                          <Icon className="w-8 h-8 md:w-10 md:h-10 text-accent" />
                        </div>
                      </div>
                      <div className="text-6xl md:text-7xl font-display text-accent/10 select-none">
                        {String(index + 1).padStart(2, '0')}
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: isEven ? 40 : -40 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: "-15%" }}
                      transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
                      className="flex-1 space-y-3 md:space-y-4"
                    >
                      <h3 className="font-display text-3xl md:text-4xl text-textPrimary leading-tight">
                        {item.title}
                      </h3>
                      <p className="text-lg md:text-xl text-textSecondary leading-relaxed">
                        {item.description}
                      </p>
                      <p className="text-base md:text-lg text-textMuted leading-relaxed border-l-4 border-accent/30 pl-4 md:pl-6">
                        {item.detail}
                      </p>
                    </motion.div>
                  </div>
                </div>

                {index < 5 && (
                  <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/30 to-transparent" />
                )}
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
                title: 'Core team salaries',
                description: 'Pay full-time contributors monthly. Set the amount once, forget about it.',
              },
              {
                title: 'Contractor payments',
                description: 'Weekly or bi-weekly payments for contractors. Cancel when the project ends.',
              },
              {
                title: 'Service subscriptions',
                description: 'Pay for hosting, tools, or infrastructure monthly without manual invoicing.',
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
      {/* CTA */}
      <section className="relative overflow-hidden py-24 px-6 lg:px-12 bg-accent/5">
        <NoiseBackground />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <h2 className="font-display text-4xl md:text-5xl mb-6 text-textPrimary">
            Ready to automate payroll?
          </h2>
          <p className="text-xl text-textSecondary mb-10">
            Set up your first recurring payment in minutes
          </p>
          <Link to="/payments/create">
            <button className="group bg-primary text-white px-12 py-6 rounded-full text-lg font-bold hover:bg-primaryHover transition-all shadow-2xl flex items-center gap-3 mx-auto">
              Set Up Payroll
              <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
            </button>
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}
