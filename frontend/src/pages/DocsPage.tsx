import { Card } from '../components/ui/Card';
import { Shield, Lock, Clock, Users, Code, Zap, BookOpen, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-background)] border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="flex items-center gap-2 mb-6">
            <BookOpen className="w-8 h-8 text-[#4b6e48]" />
            <span className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
              Documentation
            </span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 text-[var(--color-text-primary)]">
            FlowGuard Documentation
          </h1>
          <p className="text-xl md:text-2xl text-[var(--color-text-secondary)] max-w-3xl">
            Everything you need to know about managing your treasury with on-chain covenants,
            multi-signature approvals, and automated unlock schedules.
          </p>
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 mb-16">
        <div className="grid md:grid-cols-3 gap-6">
          <a href="#getting-started" className="block group">
            <Card hover padding="lg" className="h-full border-2 border-transparent group-hover:border-[#4b6e48] transition-colors">
              <Zap className="w-10 h-10 text-[#4b6e48] mb-4" />
              <h3 className="text-xl font-bold mb-2 text-[var(--color-text-primary)]">Quick Start</h3>
              <p className="text-[var(--color-text-secondary)]">Get up and running in minutes</p>
            </Card>
          </a>
          <a href="#guides" className="block group">
            <Card hover padding="lg" className="h-full border-2 border-transparent group-hover:border-[#b2ac88] transition-colors">
              <Users className="w-10 h-10 text-[#b2ac88] mb-4" />
              <h3 className="text-xl font-bold mb-2 text-[var(--color-text-primary)]">User Guides</h3>
              <p className="text-[var(--color-text-secondary)]">Step-by-step tutorials</p>
            </Card>
          </a>
          <a href="#technical" className="block group">
            <Card hover padding="lg" className="h-full border-2 border-transparent group-hover:border-[#898989] transition-colors">
              <Code className="w-10 h-10 text-[#898989] mb-4" />
              <h3 className="text-xl font-bold mb-2 text-[var(--color-text-primary)]">Technical Docs</h3>
              <p className="text-[var(--color-text-secondary)]">Architecture and contracts</p>
            </Card>
          </a>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="space-y-16">

          {/* Getting Started */}
          <section id="getting-started">
            <h2 className="text-4xl font-bold mb-8 text-[var(--color-text-primary)] border-b-2 border-[#4b6e48] pb-4">
              Getting Started
            </h2>

            <Card padding="xl" className="mb-8">
              <h3 className="text-2xl font-semibold mb-4 text-[var(--color-text-primary)] flex items-center gap-3">
                <Shield className="w-7 h-7 text-[#4b6e48]" />
                What is FlowGuard?
              </h3>
              <p className="text-[var(--color-text-secondary)] mb-6 text-lg leading-relaxed">
                FlowGuard is an on-chain treasury management system built on Bitcoin Cash using Layla CHIPs.
                It enables organizations to manage treasuries with recurring budget releases, role-based approval
                workflows, and spending guardrails — all enforced by on-chain covenants without relying on
                centralized backends or third-party custodians.
              </p>

              <div className="bg-[var(--color-surface-alt)] rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <h4 className="font-bold text-lg mb-4 text-[var(--color-text-primary)]">Key Features</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-[#b2ac88] flex-shrink-0 mt-1" />
                    <div>
                      <div className="font-semibold text-[var(--color-text-primary)]">Recurring Unlock Schedules</div>
                      <div className="text-sm text-[var(--color-text-secondary)]">Automated budget releases using Loop covenants</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Users className="w-5 h-5 text-[#4b6e48] flex-shrink-0 mt-1" />
                    <div>
                      <div className="font-semibold text-[var(--color-text-primary)]">Multi-Signature Approval</div>
                      <div className="text-sm text-[var(--color-text-secondary)]">Configurable M-of-N signer thresholds</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-[#898989] flex-shrink-0 mt-1" />
                    <div>
                      <div className="font-semibold text-[var(--color-text-primary)]">Spending Guardrails</div>
                      <div className="text-sm text-[var(--color-text-secondary)]">On-chain limits prevent treasury misuse</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Lock className="w-5 h-5 text-[#b2ac88] flex-shrink-0 mt-1" />
                    <div>
                      <div className="font-semibold text-[var(--color-text-primary)]">Non-Custodial</div>
                      <div className="text-sm text-[var(--color-text-secondary)]">You maintain full control of keys</div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card padding="xl">
              <h3 className="text-2xl font-semibold mb-6 text-[var(--color-text-primary)]">Prerequisites</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-[#4b6e48] flex-shrink-0 mt-1" />
                  <div>
                    <div className="font-semibold text-[var(--color-text-primary)]">BCH Wallet</div>
                    <div className="text-[var(--color-text-secondary)]">
                      Install Paytaca or Badger wallet extension. FlowGuard supports any wallet that
                      implements the <code className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">window.bitcoincash</code> or <code className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">window.paytaca</code> API.
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-[#4b6e48] flex-shrink-0 mt-1" />
                  <div>
                    <div className="font-semibold text-[var(--color-text-primary)]">Chipnet BCH</div>
                    <div className="text-[var(--color-text-secondary)]">
                      Get testnet BCH from the <a href="https://tbch.googol.cash/" target="_blank" rel="noopener noreferrer" className="text-[#4b6e48] hover:underline">Chipnet Faucet</a>.
                      You'll need BCH for vault creation and transaction fees.
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-[#4b6e48] flex-shrink-0 mt-1" />
                  <div>
                    <div className="font-semibold text-[var(--color-text-primary)]">Team Coordination</div>
                    <div className="text-[var(--color-text-secondary)]">
                      Gather BCH addresses from all proposed signers. Each signer needs their own wallet.
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </section>

          {/* User Guides */}
          <section id="guides">
            <h2 className="text-4xl font-bold mb-8 text-[var(--color-text-primary)] border-b-2 border-[#b2ac88] pb-4">
              User Guides
            </h2>

            <div className="space-y-8">
              <Card padding="xl">
                <h3 className="text-2xl font-semibold mb-6 text-[var(--color-text-primary)] flex items-center gap-3">
                  <ArrowRight className="w-6 h-6 text-[#b2ac88]" />
                  Creating Your First Vault
                </h3>
                <ol className="space-y-6">
                  <li className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-[#b2ac88] rounded-full flex items-center justify-center text-white font-bold">
                      1
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-lg mb-2 text-[var(--color-text-primary)]">Connect Your Wallet</div>
                      <p className="text-[var(--color-text-secondary)]">
                        Click "Connect Wallet" in the header and select your BCH wallet extension.
                        Approve the connection when prompted.
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-[#b2ac88] rounded-full flex items-center justify-center text-white font-bold">
                      2
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-lg mb-2 text-[var(--color-text-primary)]">Navigate to Create Vault</div>
                      <p className="text-[var(--color-text-secondary)]">
                        From the dashboard, click "Create Vault" or navigate to <code className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">/vaults/create</code>
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-[#b2ac88] rounded-full flex items-center justify-center text-white font-bold">
                      3
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-lg mb-2 text-[var(--color-text-primary)]">Enter Basic Information</div>
                      <p className="text-[var(--color-text-secondary)] mb-3">
                        Provide a descriptive name and purpose for your vault:
                      </p>
                      <div className="bg-[var(--color-surface-alt)] rounded p-4 border border-gray-200 dark:border-gray-700">
                        <div className="text-sm text-[var(--color-text-secondary)]">
                          <strong className="text-[var(--color-text-primary)]">Name:</strong> "Q1 2025 Development Budget"<br/>
                          <strong className="text-[var(--color-text-primary)]">Description:</strong> "Monthly development stipends for core contributors"
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-[#b2ac88] rounded-full flex items-center justify-center text-white font-bold">
                      4
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-lg mb-2 text-[var(--color-text-primary)]">Configure Deposit & Schedule</div>
                      <p className="text-[var(--color-text-secondary)] mb-3">
                        Set initial deposit amount and recurring unlock schedule:
                      </p>
                      <div className="bg-[var(--color-surface-alt)] rounded p-4 border border-gray-200 dark:border-gray-700 text-sm">
                        <div className="text-[var(--color-text-secondary)] space-y-2">
                          <div><strong className="text-[var(--color-text-primary)]">Deposit:</strong> 10 BCH</div>
                          <div><strong className="text-[var(--color-text-primary)]">Unlock Frequency:</strong> Monthly (every 30 days)</div>
                          <div><strong className="text-[var(--color-text-primary)]">Amount per Unlock:</strong> 2 BCH</div>
                          <div><strong className="text-[var(--color-text-primary)]">Total Cycles:</strong> 5 months</div>
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-[#b2ac88] rounded-full flex items-center justify-center text-white font-bold">
                      5
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-lg mb-2 text-[var(--color-text-primary)]">Add Signers</div>
                      <p className="text-[var(--color-text-secondary)] mb-3">
                        Add BCH addresses of authorized signers and set approval threshold:
                      </p>
                      <div className="bg-[var(--color-surface-alt)] rounded p-4 border border-gray-200 dark:border-gray-700 text-sm">
                        <div className="text-[var(--color-text-secondary)] space-y-2">
                          <div><strong className="text-[var(--color-text-primary)]">Signers:</strong> 3 addresses</div>
                          <div><strong className="text-[var(--color-text-primary)]">Threshold:</strong> 2-of-3 (any 2 signers must approve)</div>
                        </div>
                      </div>
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-[#b2ac88] rounded-full flex items-center justify-center text-white font-bold">
                      6
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-lg mb-2 text-[var(--color-text-primary)]">Set Spending Caps (Optional)</div>
                      <p className="text-[var(--color-text-secondary)]">
                        Add optional spending limits per proposal or per period to prevent misuse.
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-[#b2ac88] rounded-full flex items-center justify-center text-white font-bold">
                      7
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-lg mb-2 text-[var(--color-text-primary)]">Review and Confirm</div>
                      <p className="text-[var(--color-text-secondary)]">
                        Review all parameters, then sign the transaction with your wallet. The vault
                        will be created on-chain and funds locked in the covenant.
                      </p>
                    </div>
                  </li>
                </ol>
              </Card>

              <Card padding="xl">
                <h3 className="text-2xl font-semibold mb-6 text-[var(--color-text-primary)] flex items-center gap-3">
                  <ArrowRight className="w-6 h-6 text-[#4b6e48]" />
                  Creating and Approving Proposals
                </h3>

                <div className="mb-8">
                  <h4 className="text-xl font-semibold mb-4 text-[var(--color-text-primary)]">What are Proposals?</h4>
                  <p className="text-[var(--color-text-secondary)] leading-relaxed">
                    Proposals are spending requests that withdraw funds from an unlocked vault balance.
                    Each proposal requires approval from the configured number of signers (e.g., 2-of-3)
                    before it can be executed.
                  </p>
                </div>

                <div className="mb-8">
                  <h4 className="text-xl font-semibold mb-4 text-[var(--color-text-primary)]">Creating a Proposal</h4>
                  <ol className="space-y-4">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-bold text-[#4b6e48]">1.</span>
                      <div>
                        <span className="font-semibold text-[var(--color-text-primary)]">Navigate to vault details</span>
                        <span className="text-[var(--color-text-secondary)]"> and click "Create Proposal"</span>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-bold text-[#4b6e48]">2.</span>
                      <div>
                        <span className="font-semibold text-[var(--color-text-primary)]">Enter recipient BCH address</span>
                        <span className="text-[var(--color-text-secondary)]"> (must be valid cashaddr format)</span>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-bold text-[#4b6e48]">3.</span>
                      <div>
                        <span className="font-semibold text-[var(--color-text-primary)]">Specify amount in BCH</span>
                        <span className="text-[var(--color-text-secondary)]"> (cannot exceed unlocked balance)</span>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-bold text-[#4b6e48]">4.</span>
                      <div>
                        <span className="font-semibold text-[var(--color-text-primary)]">Add description/reason</span>
                        <span className="text-[var(--color-text-secondary)]"> for the spending request</span>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-bold text-[#4b6e48]">5.</span>
                      <div>
                        <span className="font-semibold text-[var(--color-text-primary)]">Submit and sign</span>
                        <span className="text-[var(--color-text-secondary)]"> the proposal transaction</span>
                      </div>
                    </li>
                  </ol>
                </div>

                <div>
                  <h4 className="text-xl font-semibold mb-4 text-[var(--color-text-primary)]">Approving a Proposal</h4>
                  <p className="text-[var(--color-text-secondary)] mb-4 leading-relaxed">
                    Signers can review pending proposals on the vault details page. To approve:
                  </p>
                  <ol className="space-y-4">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-bold text-[#898989]">1.</span>
                      <div className="text-[var(--color-text-secondary)]">
                        Review proposal details (recipient, amount, reason)
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-bold text-[#898989]">2.</span>
                      <div className="text-[var(--color-text-secondary)]">
                        Click "Approve" if you agree with the spending request
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-bold text-[#898989]">3.</span>
                      <div className="text-[var(--color-text-secondary)]">
                        Sign the approval transaction with your wallet
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 font-bold text-[#898989]">4.</span>
                      <div className="text-[var(--color-text-secondary)]">
                        Once threshold is met (e.g., 2-of-3), proposal can be executed
                      </div>
                    </li>
                  </ol>
                </div>

                <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-5">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" />
                    <div className="text-sm text-blue-800 dark:text-blue-300">
                      <strong>Important:</strong> Once a proposal reaches the required approval threshold,
                      any signer can execute it to broadcast the payout transaction on-chain. Execution
                      is immediate and irreversible.
                    </div>
                  </div>
                </div>
              </Card>

              <Card padding="xl">
                <h3 className="text-2xl font-semibold mb-6 text-[var(--color-text-primary)] flex items-center gap-3">
                  <ArrowRight className="w-6 h-6 text-[#898989]" />
                  Managing Your Vault
                </h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-semibold mb-3 text-[var(--color-text-primary)]">Monitoring Balance</h4>
                    <p className="text-[var(--color-text-secondary)]">
                      Track your vault's total balance, locked balance, and unlocked balance from the vault
                      details page. Locked funds automatically unlock according to your configured schedule.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold mb-3 text-[var(--color-text-primary)]">Viewing History</h4>
                    <p className="text-[var(--color-text-secondary)]">
                      See complete history of all proposals, approvals, and payouts. Every action is
                      recorded on-chain with timestamps and transaction IDs.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold mb-3 text-[var(--color-text-primary)]">Adding Signers</h4>
                    <p className="text-[var(--color-text-secondary)]">
                      To add new signers, create a proposal to update the vault configuration. This
                      requires approval from existing signers according to the current threshold.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </section>

          {/* Technical Documentation */}
          <section id="technical">
            <h2 className="text-4xl font-bold mb-8 text-[var(--color-text-primary)] border-b-2 border-[#898989] pb-4">
              Technical Documentation
            </h2>

            <div className="space-y-8">
              <Card padding="xl">
                <h3 className="text-2xl font-semibold mb-6 text-[var(--color-text-primary)]">Architecture Overview</h3>
                <p className="text-[var(--color-text-secondary)] mb-6 leading-relaxed">
                  FlowGuard is built as a full-stack application with on-chain Bitcoin Cash covenants
                  as the source of truth. The architecture consists of three main layers:
                </p>
                <div className="space-y-6">
                  <div className="border-l-4 border-[#4b6e48] pl-6">
                    <h4 className="font-bold text-lg mb-2 text-[var(--color-text-primary)]">On-Chain Layer (Contracts)</h4>
                    <p className="text-[var(--color-text-secondary)]">
                      CashScript covenants deployed on BCH chipnet. These contracts enforce all treasury
                      rules, including unlock schedules, approval thresholds, and spending limits. The
                      contracts are non-custodial and immutable once deployed.
                    </p>
                  </div>
                  <div className="border-l-4 border-[#b2ac88] pl-6">
                    <h4 className="font-bold text-lg mb-2 text-[var(--color-text-primary)]">Backend API (Node.js + SQLite)</h4>
                    <p className="text-[var(--color-text-secondary)]">
                      Optional indexing layer that monitors on-chain activity and provides query APIs.
                      The backend does not control funds or enforce rules — it only mirrors on-chain state
                      for faster UX.
                    </p>
                  </div>
                  <div className="border-l-4 border-[#898989] pl-6">
                    <h4 className="font-bold text-lg mb-2 text-[var(--color-text-primary)]">Frontend (React + TypeScript)</h4>
                    <p className="text-[var(--color-text-secondary)]">
                      User interface for wallet connection, vault creation, proposal management, and
                      transaction signing. Communicates directly with user wallets via browser extensions.
                    </p>
                  </div>
                </div>
              </Card>

              <Card padding="xl">
                <h3 className="text-2xl font-semibold mb-6 text-[var(--color-text-primary)]">Layla CHIPs Technology</h3>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    📅 <strong>CHIP Activation Schedule:</strong> All Layla CHIPs activate on Chipnet November 15, 2025 and Mainnet May 15, 2026.
                    FlowGuard currently runs FlowGuardDemo.cash (basic multisig) on chipnet, with advanced CHIP contracts ready to deploy on activation.
                  </p>
                </div>
                <p className="text-[var(--color-text-secondary)] mb-6 leading-relaxed">
                  FlowGuard demonstrates mastery of all four Cash Improvement Proposals (CHIPs):
                </p>
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-[#4b6e48] rounded-lg flex items-center justify-center">
                        <Clock className="w-6 h-6 text-white" />
                      </div>
                      <h4 className="font-bold text-lg text-[var(--color-text-primary)]">Loops (CHIP-2024-05)</h4>
                    </div>
                    <p className="text-[var(--color-text-secondary)] pl-[52px]">
                      Enables recurring covenant execution. Vaults use Loops to automatically unlock
                      budget tranches on a fixed schedule (e.g., monthly releases). Each loop iteration
                      updates the on-chain state and makes more funds available for spending.
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-[#b2ac88] rounded-lg flex items-center justify-center">
                        <Shield className="w-6 h-6 text-white" />
                      </div>
                      <h4 className="font-bold text-lg text-[var(--color-text-primary)]">P2S (Pay-to-Script)</h4>
                    </div>
                    <p className="text-[var(--color-text-secondary)] pl-[52px]">
                      Allows direct covenant outputs without P2SH wrapping. Reduces transaction size
                      and makes covenant logic more transparent. All FlowGuard vaults use P2S for
                      efficient on-chain enforcement.
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-[#898989] rounded-lg flex items-center justify-center">
                        <Code className="w-6 h-6 text-white" />
                      </div>
                      <h4 className="font-bold text-lg text-[var(--color-text-primary)]">Bitwise Operations</h4>
                    </div>
                    <p className="text-[var(--color-text-secondary)] pl-[52px]">
                      New opcodes for efficient bit manipulation. FlowGuard uses bitwise ops to encode
                      vault state (approval flags, unlock counters) compactly, minimizing on-chain data.
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-[#4b6e48] rounded-lg flex items-center justify-center">
                        <Zap className="w-6 h-6 text-white" />
                      </div>
                      <h4 className="font-bold text-lg text-[var(--color-text-primary)]">Functions</h4>
                    </div>
                    <p className="text-[var(--color-text-secondary)] pl-[52px]">
                      Reusable contract functions for modular logic. Permission checks, signature
                      verification, and spending limits are implemented as functions to reduce code
                      duplication and improve auditability.
                    </p>
                  </div>
                </div>
              </Card>

              <Card padding="xl">
                <h3 className="text-2xl font-semibold mb-6 text-[var(--color-text-primary)]">Security Model</h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="font-bold text-lg mb-3 text-[var(--color-text-primary)]">Non-Custodial Design</h4>
                    <p className="text-[var(--color-text-secondary)] mb-3 leading-relaxed">
                      FlowGuard never takes custody of your funds. All BCH is locked in on-chain covenants
                      that only you and your signers can unlock. The FlowGuard team cannot access, freeze,
                      or modify your treasury.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-lg mb-3 text-[var(--color-text-primary)]">Multi-Signature Approval</h4>
                    <p className="text-[var(--color-text-secondary)] mb-3 leading-relaxed">
                      Proposals require M-of-N signer approvals. This prevents any single signer from
                      unilaterally draining the treasury. Even if one signer's key is compromised,
                      funds remain safe.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-lg mb-3 text-[var(--color-text-primary)]">On-Chain Enforcement</h4>
                    <p className="text-[var(--color-text-secondary)] mb-3 leading-relaxed">
                      All rules (unlock schedules, spending caps, approval thresholds) are enforced by
                      covenant scripts. No backend service can override these rules — they are
                      mathematically guaranteed by Bitcoin Cash consensus.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-lg mb-3 text-[var(--color-text-primary)]">Open Source</h4>
                    <p className="text-[var(--color-text-secondary)] leading-relaxed">
                      All contract code is open source and auditable. You can verify exactly what logic
                      controls your treasury by reading the CashScript source code.
                    </p>
                  </div>
                </div>
              </Card>

              <Card padding="xl">
                <h3 className="text-2xl font-semibold mb-6 text-[var(--color-text-primary)]">API Reference</h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="font-mono text-sm font-bold mb-2 text-[var(--color-text-primary)]">GET /api/vaults</h4>
                    <p className="text-[var(--color-text-secondary)] mb-2">Retrieve list of vaults, optionally filtered by creator address.</p>
                    <div className="bg-gray-900 text-gray-100 rounded p-4 text-sm overflow-x-auto">
                      <code>curl https://flowguard-backend.fly.dev/api/vaults?creator=bitcoincash:...</code>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-mono text-sm font-bold mb-2 text-[var(--color-text-primary)]">GET /api/vaults/:id</h4>
                    <p className="text-[var(--color-text-secondary)] mb-2">Get detailed information about a specific vault including balance and signers.</p>
                  </div>
                  <div>
                    <h4 className="font-mono text-sm font-bold mb-2 text-[var(--color-text-primary)]">POST /api/vaults</h4>
                    <p className="text-[var(--color-text-secondary)] mb-2">Create a new vault (requires wallet signature).</p>
                  </div>
                  <div>
                    <h4 className="font-mono text-sm font-bold mb-2 text-[var(--color-text-primary)]">GET /api/vaults/:id/proposals</h4>
                    <p className="text-[var(--color-text-secondary)] mb-2">List all proposals for a vault.</p>
                  </div>
                  <div>
                    <h4 className="font-mono text-sm font-bold mb-2 text-[var(--color-text-primary)]">POST /api/vaults/:id/proposals</h4>
                    <p className="text-[var(--color-text-secondary)] mb-2">Create a spending proposal (requires signer signature).</p>
                  </div>
                  <div>
                    <h4 className="font-mono text-sm font-bold mb-2 text-[var(--color-text-primary)]">POST /api/proposals/:id/approve</h4>
                    <p className="text-[var(--color-text-secondary)] mb-2">Approve a proposal (requires signer signature).</p>
                  </div>
                </div>
              </Card>

              <Card padding="xl" className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800">
                <div className="flex gap-4">
                  <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <div>
                    <h3 className="text-xl font-bold mb-3 text-amber-900 dark:text-amber-100">
                      Testnet Notice
                    </h3>
                    <p className="text-amber-800 dark:text-amber-200 leading-relaxed">
                      FlowGuard is currently deployed on Bitcoin Cash chipnet (testnet). Do not use
                      real funds. While the underlying technology (Layla CHIPs) is production-ready,
                      FlowGuard contracts have not been formally audited. Use at your own risk.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </section>

          {/* FAQs */}
          <section>
            <h2 className="text-4xl font-bold mb-8 text-[var(--color-text-primary)] border-b-2 border-[#4b6e48] pb-4">
              Frequently Asked Questions
            </h2>
            <div className="space-y-6">
              <Card padding="lg">
                <h3 className="font-bold text-lg mb-2 text-[var(--color-text-primary)]">
                  Can I change signers after creating a vault?
                </h3>
                <p className="text-[var(--color-text-secondary)]">
                  Not in the current version. Signers are set at vault creation and cannot be modified.
                  To change signers, you would need to create a new vault and migrate funds.
                </p>
              </Card>
              <Card padding="lg">
                <h3 className="font-bold text-lg mb-2 text-[var(--color-text-primary)]">
                  What happens if I lose access to my wallet?
                </h3>
                <p className="text-[var(--color-text-secondary)]">
                  If you're one of multiple signers, the remaining signers can still approve proposals
                  as long as the threshold is met. If you're the only signer or threshold can't be met,
                  funds remain locked. Always maintain secure backups of your wallet seed phrase.
                </p>
              </Card>
              <Card padding="lg">
                <h3 className="font-bold text-lg mb-2 text-[var(--color-text-primary)]">
                  How much do transactions cost?
                </h3>
                <p className="text-[var(--color-text-secondary)]">
                  BCH transaction fees are typically less than $0.01 USD. Each vault creation, proposal,
                  and approval requires a small fee paid to miners.
                </p>
              </Card>
              <Card padding="lg">
                <h3 className="font-bold text-lg mb-2 text-[var(--color-text-primary)]">
                  Is my data private?
                </h3>
                <p className="text-[var(--color-text-secondary)]">
                  All vault data is stored on the public Bitcoin Cash blockchain. Anyone can view vault
                  balances, proposals, and transaction history by inspecting on-chain data. FlowGuard
                  does not provide privacy features — use it for transparent treasuries only.
                </p>
              </Card>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

