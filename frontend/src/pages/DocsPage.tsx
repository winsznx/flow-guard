import { Card } from '../components/ui/Card';

export default function DocsPage() {
  return (
    <div className="section-spacious">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 section-bold">Documentation</h1>

        <div className="space-y-8">
          <Card padding="lg">
            <h2 className="text-2xl font-semibold mb-4">Getting Started</h2>
            <p className="text-gray-600 mb-4">
              FlowGuard is an on-chain treasury management system for BCH-native teams. It enables
              recurring budget releases, role-based approval, and spending guardrails — all enforced
              on-chain.
            </p>
            <h3 className="text-xl font-semibold mt-6 mb-3">Key Features</h3>
            <ul className="list-disc list-inside space-y-2 text-gray-600">
              <li>Recurring unlock schedules using Loops</li>
              <li>Multi-signature approval system</li>
              <li>Spending caps and guardrails</li>
              <li>On-chain transparency</li>
              <li>Non-custodial fund management</li>
            </ul>
          </Card>

          <Card padding="lg">
            <h2 className="text-2xl font-semibold mb-4">Creating a Vault</h2>
            <ol className="list-decimal list-inside space-y-3 text-gray-600">
              <li>Click "Create Vault" from the dashboard</li>
              <li>Enter basic information (name, description)</li>
              <li>Set your deposit amount</li>
              <li>Configure unlock schedule (weekly, monthly, etc.)</li>
              <li>Add signers and set approval threshold</li>
              <li>Optionally set spending caps</li>
              <li>Review and confirm</li>
            </ol>
          </Card>

          <Card padding="lg">
            <h2 className="text-2xl font-semibold mb-4">Creating Proposals</h2>
            <p className="text-gray-600 mb-4">
              Once funds are unlocked, you can create spending proposals. Proposals require
              approval from the configured number of signers before they can be executed.
            </p>
            <h3 className="text-xl font-semibold mt-6 mb-3">Proposal Process</h3>
            <ol className="list-decimal list-inside space-y-2 text-gray-600">
              <li>Create a proposal with recipient address, amount, and reason</li>
              <li>Signers review and approve the proposal</li>
              <li>Once threshold is met, proposal can be executed</li>
              <li>Funds are transferred on-chain via P2S covenant</li>
            </ol>
          </Card>

          <Card padding="lg">
            <h2 className="text-2xl font-semibold mb-4">Technical Details</h2>
            <p className="text-gray-600 mb-4">
              FlowGuard uses Layla CHIPs (Cash Improvement Proposals) for BCH:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-600">
              <li><strong>Loops:</strong> Recurring unlock cycles</li>
              <li><strong>P2S:</strong> Pay-to-Script covenant enforcement</li>
              <li><strong>Bitwise:</strong> Compact state encoding</li>
              <li><strong>Functions:</strong> Reusable permission checks</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

