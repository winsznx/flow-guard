import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { AnimatedBackgroundBoxes } from '../components/ui/AnimatedBackgroundBoxes';

export default function Home() {
  return (
    <main className="section-spacious">
      {/* Hero Section - Safe.global inspired design */}
      <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
        {/* Animated background boxes */}
        <AnimatedBackgroundBoxes boxCount={18} changeInterval={4000} />
        
        {/* Hero content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Metric text */}
          <p className="text-sm md:text-base text-gray-500 uppercase tracking-wider mb-6">
            10K+ Daily Transactions
          </p>
          
          {/* Main headline */}
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 section-bold text-gray-900 leading-tight">
            Multisig security for your onchain assets
          </h1>
          
          {/* Supporting text */}
          <p className="text-xl md:text-2xl text-gray-600 mb-10 max-w-3xl mx-auto">
            The most trusted treasury management infrastructure. Modular, programmable and battle-tested.
          </p>
          
          {/* CTA Button */}
          <div className="flex justify-center gap-4">
            <Link to="/vaults/create">
              <Button size="lg" className="text-lg px-8 py-4">
                Launch App →
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="mb-16 mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 section-bold">
            All the functionality you need in one place
          </h2>
          <p className="text-lg text-gray-600 text-center mb-12 max-w-3xl mx-auto">
            FlowGuard is an on-chain treasury management system that lets BCH-native teams unlock automated, trustless treasury operations. We provide all of the tools you need to manage your treasury, from recurring budget releases to multi-party approval to spending guardrails.
          </p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <h3 className="font-semibold text-lg mb-2">Recurring Budgets</h3>
              <p className="text-gray-600 text-sm">
                Automated periodic disbursements using on-chain Loops
              </p>
            </Card>
            <Card>
              <h3 className="font-semibold text-lg mb-2">Multi-Signature Approval</h3>
              <p className="text-gray-600 text-sm">
                Role-based approval system with configurable thresholds
              </p>
            </Card>
            <Card>
              <h3 className="font-semibold text-lg mb-2">Spending Guardrails</h3>
              <p className="text-gray-600 text-sm">
                On-chain rules to prevent misuse and enforce limits
              </p>
            </Card>
            <Card>
              <h3 className="font-semibold text-lg mb-2">On-Chain Transparency</h3>
              <p className="text-gray-600 text-sm">
                All treasury operations visible and auditable on-chain
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="text-center mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card padding="lg" className="bg-[--color-primary] text-white">
            <h2 className="text-3xl font-bold mb-4">Grow your treasury today.</h2>
            <Link to="/vaults/create">
              <Button variant="secondary" size="lg">Get started</Button>
            </Link>
          </Card>
        </div>
      </section>
    </main>
  );
}
