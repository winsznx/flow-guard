import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export default function CreateProposalPage() {
  const { id } = useParams<{ id: string }>();
  const [formData, setFormData] = useState({
    recipient: '',
    amount: '',
    reason: '',
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    // TODO: Submit proposal creation
    console.log('Creating proposal:', formData);
  };

  return (
    <div className="section-spacious">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link to={`/vaults/${id}`} className="text-[--color-primary] hover:underline">
            ← Back to Vault
          </Link>
        </div>

        <h1 className="text-4xl font-bold mb-8 section-bold">Create Proposal</h1>

        <Card padding="lg">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Recipient Address</label>
              <input
                type="text"
                value={formData.recipient}
                onChange={(e) => handleInputChange('recipient', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary font-mono"
                placeholder="0x..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Amount (BCH)</label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                placeholder="0.00"
                step="0.01"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Reason / Description</label>
              <textarea
                value={formData.reason}
                onChange={(e) => handleInputChange('reason', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                rows={4}
                placeholder="Describe the purpose of this payment..."
              />
            </div>

            <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
              <Link to={`/vaults/${id}`}>
                <Button variant="outline">Cancel</Button>
              </Link>
              <Button onClick={handleSubmit}>Create Proposal</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

