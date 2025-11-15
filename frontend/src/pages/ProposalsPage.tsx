import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';

// Mock data
const mockProposals = [
  {
    id: '1',
    vaultName: 'DAO Treasury',
    recipient: '0xabc...',
    amount: 2,
    reason: 'Monthly contributor payment',
    status: 'pending',
    approvals: 1,
    needed: 2,
    createdAt: '2025-01-15',
  },
  {
    id: '2',
    vaultName: 'Dev Team Budget',
    recipient: '0xdef...',
    amount: 1.5,
    reason: 'Infrastructure costs',
    status: 'approved',
    approvals: 2,
    needed: 2,
    createdAt: '2025-01-14',
  },
];

export default function ProposalsPage() {
  return (
    <div className="section-spacious">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 section-bold">Proposals</h1>

        {mockProposals.length === 0 ? (
          <Card padding="lg" className="text-center">
            <h2 className="text-2xl font-semibold mb-4">No proposals yet</h2>
            <p className="text-gray-600">
              Proposals will appear here when created
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {mockProposals.map((proposal) => (
              <Link key={proposal.id} to={`/proposals/${proposal.id}`}>
                <Card padding="lg" className="hover:shadow-lg transition-shadow cursor-pointer">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-semibold mb-1">{proposal.amount} BCH</h3>
                      <p className="text-gray-600">{proposal.reason}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        From: <span className="font-medium">{proposal.vaultName}</span>
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        proposal.status === 'approved'
                          ? 'bg-green-100 text-green-800'
                          : proposal.status === 'executed'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {proposal.status}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                    <div className="text-sm text-gray-600">
                      To: <span className="font-mono">{proposal.recipient}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-600">Approvals: </span>
                      <span className="font-semibold">
                        {proposal.approvals}/{proposal.needed}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {proposal.createdAt}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

