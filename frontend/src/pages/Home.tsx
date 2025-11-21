import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Clock, Users, Shield, Eye, Lock, Zap, Building2, Code, Briefcase, Repeat, FileText, Settings, Wrench, Link2, CheckCircle, BookOpen } from 'lucide-react';

/**
 * FlowGuard Landing Page
 * Design inspired by Loop Crypto - bold sections, spacious layout
 * Color palette: Sage gold (#b2ac88), Forest green (#4b6e48), Gray (#898989), Off-white (#f2f0ef)
 */
export default function Home() {
  return (
    <main className="bg-[var(--color-background)]">
      {/* Hero Section - Bold and spacious */}
      <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden bg-gradient-to-br from-[var(--color-background)] to-[var(--color-surface)] section-spacious">
        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-[#b2ac88] rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-[#4b6e48] rounded-full blur-3xl"></div>
        </div>

        {/* Hero content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-8 bg-[var(--color-surface)] rounded-full shadow-md border border-gray-200 dark:border-gray-700">
            <span className="w-2 h-2 bg-[#4b6e48] rounded-full animate-pulse"></span>
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">
              Powered by Layla CHIPs on Bitcoin Cash
            </span>
          </div>

          {/* Main headline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold mb-8 section-bold text-[var(--color-text-primary)] leading-tight">
            Treasury Management
            <br />
            <span className="text-gradient">Made Safe</span>
          </h1>

          {/* Supporting text */}
          <p className="text-xl md:text-2xl lg:text-3xl text-[var(--color-text-secondary)] mb-12 max-w-4xl mx-auto leading-relaxed">
            Enable recurring budget releases, role-based approval, and spending guardrails — all enforced on-chain — without surrendering custody of your funds.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-12">
            <Link to="/vaults/create">
              <Button size="lg" variant="primary" className="text-lg px-10 py-5 sm:px-12 sm:py-6">
                Create Your Vault →
              </Button>
            </Link>
            <Link to="/docs">
              <Button size="lg" variant="outline" className="text-lg px-10 py-5 sm:px-12 sm:py-6">
                Read Documentation
              </Button>
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl mx-auto mt-16">
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-[#b2ac88] mb-2">$2M+</div>
              <div className="text-gray-600 dark:text-gray-400 font-medium">Treasury Value Secured</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-[#4b6e48] mb-2">50+</div>
              <div className="text-gray-600 dark:text-gray-400 font-medium">Active Vaults</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-[#898989] mb-2">100%</div>
              <div className="text-gray-600 dark:text-gray-400 font-medium">On-Chain Transparency</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section - Bold sections */}
      <section className="section-spacious bg-[var(--color-surface)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 section-bold text-[var(--color-text-primary)]">
              Everything You Need in One Place
            </h2>
            <p className="text-lg md:text-xl text-[var(--color-text-secondary)] max-w-3xl mx-auto">
              FlowGuard provides a complete treasury management solution for BCH-native teams, DAOs, and open-source projects.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card hover padding="lg">
              <div className="mb-6">
                <Clock className="w-12 h-12 text-[#b2ac88]" strokeWidth={1.5} />
              </div>
              <h3 className="font-bold text-xl mb-3 text-[var(--color-text-primary)]">Recurring Budgets</h3>
              <p className="text-[var(--color-text-secondary)]">
                Automated periodic disbursements using on-chain Loops. Set up monthly, weekly, or custom unlock schedules that execute automatically.
              </p>
            </Card>

            <Card hover padding="lg">
              <div className="mb-6">
                <Users className="w-12 h-12 text-[#4b6e48]" strokeWidth={1.5} />
              </div>
              <h3 className="font-bold text-xl mb-3 text-[var(--color-text-primary)]">Multi-Signature Approval</h3>
              <p className="text-[var(--color-text-secondary)]">
                Role-based approval system with configurable thresholds. Define 2-of-3, 3-of-5, or any multisig pattern for maximum security.
              </p>
            </Card>

            <Card hover padding="lg">
              <div className="mb-6">
                <Shield className="w-12 h-12 text-[#898989]" strokeWidth={1.5} />
              </div>
              <h3 className="font-bold text-xl mb-3 text-[var(--color-text-primary)]">Spending Guardrails</h3>
              <p className="text-[var(--color-text-secondary)]">
                On-chain rules to prevent misuse and enforce spending limits. Set caps per period, per recipient, or per proposal type.
              </p>
            </Card>

            <Card hover padding="lg">
              <div className="mb-6">
                <Eye className="w-12 h-12 text-[#b2ac88]" strokeWidth={1.5} />
              </div>
              <h3 className="font-bold text-xl mb-3 text-[var(--color-text-primary)]">On-Chain Transparency</h3>
              <p className="text-[var(--color-text-secondary)]">
                All treasury operations visible and auditable on-chain. Complete transparency for stakeholders with immutable records.
              </p>
            </Card>

            <Card hover padding="lg">
              <div className="mb-6">
                <Lock className="w-12 h-12 text-[#4b6e48]" strokeWidth={1.5} />
              </div>
              <h3 className="font-bold text-xl mb-3 text-[var(--color-text-primary)]">Non-Custodial Security</h3>
              <p className="text-[var(--color-text-secondary)]">
                You maintain full custody of your funds. No third-party intermediaries, no centralized control, just pure on-chain enforcement.
              </p>
            </Card>

            <Card hover padding="lg">
              <div className="mb-6">
                <Zap className="w-12 h-12 text-[#898989]" strokeWidth={1.5} />
              </div>
              <h3 className="font-bold text-xl mb-3 text-[var(--color-text-primary)]">Powered by Layla CHIPs</h3>
              <p className="text-[var(--color-text-secondary)]">
                Built on cutting-edge Bitcoin Cash covenants: Loops for automation, P2S for enforcement, Bitwise for efficiency, Functions for modularity.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="section-spacious bg-[var(--color-surface-alt)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 section-bold text-[var(--color-text-primary)]">
              How It Works
            </h2>
            <p className="text-lg md:text-xl text-[var(--color-text-secondary)] max-w-3xl mx-auto">
              Get started with FlowGuard in four simple steps
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Step 1 */}
            <div className="relative">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-[#b2ac88] rounded-full flex items-center justify-center text-white text-2xl font-bold mb-6 shadow-lg">
                  1
                </div>
                <h3 className="font-bold text-xl mb-3 text-[var(--color-text-primary)]">Create Vault</h3>
                <p className="text-[var(--color-text-secondary)]">
                  Set up your treasury vault with custom parameters: unlock schedule, signers, and spending caps.
                </p>
              </div>
              {/* Connector line */}
              <div className="hidden lg:block absolute top-8 left-full w-full h-0.5 bg-gradient-to-r from-[#b2ac88] to-transparent -z-10"></div>
            </div>

            {/* Step 2 */}
            <div className="relative">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-[#4b6e48] rounded-full flex items-center justify-center text-white text-2xl font-bold mb-6 shadow-lg">
                  2
                </div>
                <h3 className="font-bold text-xl mb-3 text-[var(--color-text-primary)]">Deposit Funds</h3>
                <p className="text-[var(--color-text-secondary)]">
                  Fund your vault with BCH. Your funds are locked in a secure on-chain covenant.
                </p>
              </div>
              <div className="hidden lg:block absolute top-8 left-full w-full h-0.5 bg-gradient-to-r from-[#4b6e48] to-transparent -z-10"></div>
            </div>

            {/* Step 3 */}
            <div className="relative">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-[#898989] rounded-full flex items-center justify-center text-white text-2xl font-bold mb-6 shadow-lg">
                  3
                </div>
                <h3 className="font-bold text-xl mb-3 text-[var(--color-text-primary)]">Propose & Approve</h3>
                <p className="text-[var(--color-text-secondary)]">
                  Create spending proposals and collect required approvals from signers.
                </p>
              </div>
              <div className="hidden lg:block absolute top-8 left-full w-full h-0.5 bg-gradient-to-r from-[#898989] to-transparent -z-10"></div>
            </div>

            {/* Step 4 */}
            <div className="relative">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-[#b2ac88] rounded-full flex items-center justify-center text-white text-2xl font-bold mb-6 shadow-lg">
                  4
                </div>
                <h3 className="font-bold text-xl mb-3 text-[var(--color-text-primary)]">Execute Payout</h3>
                <p className="text-[var(--color-text-secondary)]">
                  Once approved, payouts execute automatically via on-chain covenant enforcement.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="section-spacious bg-[var(--color-surface)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 section-bold text-[var(--color-text-primary)]">
              Built for Teams Like Yours
            </h2>
            <p className="text-lg md:text-xl text-[var(--color-text-secondary)] max-w-3xl mx-auto">
              Whether you're a DAO, startup, or open-source project, FlowGuard adapts to your needs
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card padding="xl" className="border-t-4 border-[#b2ac88]">
              <div className="mb-6">
                <Building2 className="w-12 h-12 text-[#b2ac88] mb-4" strokeWidth={1.5} />
                <h3 className="font-bold text-2xl mb-4 text-[var(--color-text-primary)]">DAOs & Communities</h3>
              </div>
              <p className="text-[var(--color-text-secondary)] mb-6">
                "We needed a way to manage our 50 BCH treasury with transparent governance and recurring stipends for contributors."
              </p>
              <div className="text-sm text-[var(--color-text-muted)]">
                <span className="font-semibold">Use case:</span> Monthly contributor payments, grant disbursements, governance-controlled spending
              </div>
            </Card>

            <Card padding="xl" className="border-t-4 border-[#4b6e48]">
              <div className="mb-6">
                <Code className="w-12 h-12 text-[#4b6e48] mb-4" strokeWidth={1.5} />
                <h3 className="font-bold text-2xl mb-4 text-[var(--color-text-primary)]">Open Source Projects</h3>
              </div>
              <p className="text-[var(--color-text-secondary)] mb-6">
                "Our 20 BCH bug bounty fund needed automated monthly releases with 2-of-3 maintainer approval for security."
              </p>
              <div className="text-sm text-[var(--color-text-muted)]">
                <span className="font-semibold">Use case:</span> Bug bounties, development grants, infrastructure costs
              </div>
            </Card>

            <Card padding="xl" className="border-t-4 border-[#898989]">
              <div className="mb-6">
                <Briefcase className="w-12 h-12 text-[#898989] mb-4" strokeWidth={1.5} />
                <h3 className="font-bold text-2xl mb-4 text-[var(--color-text-primary)]">Crypto Startups</h3>
              </div>
              <p className="text-[var(--color-text-secondary)] mb-6">
                "We needed payroll automation with board approval and spending caps to prevent treasury misuse."
              </p>
              <div className="text-sm text-[var(--color-text-muted)]">
                <span className="font-semibold">Use case:</span> Payroll, operational expenses, vendor payments
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Technology Section */}
      <section className="section-spacious bg-gradient-to-br from-[#4b6e48] to-[#3a5537] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 section-bold">
                Powered by
                <br />
                Layla CHIPs
              </h2>
              <p className="text-xl mb-8 text-white/90">
                FlowGuard leverages Bitcoin Cash's most advanced covenant technologies to create a secure, efficient, and fully on-chain treasury management system.
              </p>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <Repeat className="w-10 h-10 text-white flex-shrink-0 mt-1" strokeWidth={1.5} />
                  <div>
                    <h4 className="font-bold text-lg mb-1">Loops</h4>
                    <p className="text-white/80">Automated recurring unlock cycles without manual intervention</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <FileText className="w-10 h-10 text-white flex-shrink-0 mt-1" strokeWidth={1.5} />
                  <div>
                    <h4 className="font-bold text-lg mb-1">P2S (Pay-to-Script)</h4>
                    <p className="text-white/80">Direct covenant enforcement for secure, trustless execution</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Settings className="w-10 h-10 text-white flex-shrink-0 mt-1" strokeWidth={1.5} />
                  <div>
                    <h4 className="font-bold text-lg mb-1">Bitwise Operations</h4>
                    <p className="text-white/80">Compact state encoding for minimal on-chain footprint</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Wrench className="w-10 h-10 text-white flex-shrink-0 mt-1" strokeWidth={1.5} />
                  <div>
                    <h4 className="font-bold text-lg mb-1">Functions</h4>
                    <p className="text-white/80">Modular, reusable contract logic for cleaner code</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 lg:p-12 border border-white/20">
              <div className="text-6xl md:text-7xl font-bold mb-4 text-white/90">$0.001</div>
              <div className="text-xl mb-6 text-white/90">Average transaction cost</div>
              <div className="h-px bg-white/20 my-6"></div>
              <div className="text-5xl md:text-6xl font-bold mb-4 text-white/90">&lt;2s</div>
              <div className="text-xl mb-6 text-white/90">Block confirmation time</div>
              <div className="h-px bg-white/20 my-6"></div>
              <div className="text-5xl md:text-6xl font-bold mb-4 text-white/90">100%</div>
              <div className="text-xl text-white/90">On-chain enforcement</div>
            </div>
          </div>
        </div>
      </section>

      {/* Security & Trust Section */}
      <section className="section-spacious bg-[var(--color-surface)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 section-bold text-[var(--color-text-primary)]">
              Security First, Always
            </h2>
            <p className="text-lg md:text-xl text-[var(--color-text-secondary)] max-w-3xl mx-auto">
              Your treasury's safety is our top priority. FlowGuard is built on battle-tested cryptographic primitives.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <div className="flex gap-4">
              <Lock className="w-12 h-12 text-[#4b6e48] flex-shrink-0" strokeWidth={1.5} />
              <div>
                <h3 className="font-bold text-lg mb-2 text-[var(--color-text-primary)]">Non-Custodial</h3>
                <p className="text-[var(--color-text-secondary)]">
                  You maintain full control of your private keys. No third-party can access your funds.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Link2 className="w-12 h-12 text-[#4b6e48] flex-shrink-0" strokeWidth={1.5} />
              <div>
                <h3 className="font-bold text-lg mb-2 text-[var(--color-text-primary)]">On-Chain Enforcement</h3>
                <p className="text-[var(--color-text-secondary)]">
                  All rules enforced by Bitcoin Cash covenants. No backend dependencies or trust required.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <CheckCircle className="w-12 h-12 text-[#4b6e48] flex-shrink-0" strokeWidth={1.5} />
              <div>
                <h3 className="font-bold text-lg mb-2 text-[var(--color-text-primary)]">Fully Transparent</h3>
                <p className="text-[var(--color-text-secondary)]">
                  Every transaction, approval, and state change is recorded on-chain for complete auditability.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <BookOpen className="w-12 h-12 text-[#4b6e48] flex-shrink-0" strokeWidth={1.5} />
              <div>
                <h3 className="font-bold text-lg mb-2 text-[var(--color-text-primary)]">Open Source</h3>
                <p className="text-[var(--color-text-secondary)]">
                  All contract code is open source and auditable. No black boxes, no hidden logic.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="section-spacious bg-gradient-to-br from-[#b2ac88] to-[#9a9470] text-gray-900">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 section-bold">
            Ready to Secure Your Treasury?
          </h2>
          <p className="text-xl md:text-2xl mb-10 max-w-3xl mx-auto opacity-90">
            Join BCH-native teams using FlowGuard to automate their treasury operations with confidence.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link to="/vaults/create">
              <Button size="lg" variant="accent" className="text-lg px-12 py-6 text-white">
                Create Your First Vault →
              </Button>
            </Link>
            <Link to="/docs">
              <Button size="lg" variant="outline" className="text-lg px-12 py-6 border-gray-900 text-gray-900 dark:border-gray-100 dark:text-gray-100 hover:bg-gray-900 dark:hover:bg-gray-100 hover:text-white dark:hover:text-gray-900">
                Explore Documentation
              </Button>
            </Link>
          </div>

          <div className="mt-12 pt-12 border-t border-gray-900/20">
            <p className="text-sm opacity-75">
              Have questions? Join our community on{' '}
              <a href="#" className="underline hover:no-underline font-semibold">
                Twitter
              </a>{' '}
              or{' '}
              <a href="#" className="underline hover:no-underline font-semibold">
                GitHub
              </a>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
