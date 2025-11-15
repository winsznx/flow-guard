import { useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { addSigner } from '../../utils/api';

interface AddSignerModalProps {
  vaultId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddSignerModal: React.FC<AddSignerModalProps> = ({
  vaultId,
  onClose,
  onSuccess,
}) => {
  const [signerAddress, setSignerAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mock user address - will be replaced with wallet integration
  const userAddress = '0x1234567890123456789012345678901234567890';

  const validateAddress = (address: string): boolean => {
    // Basic validation - should be a valid BCH address format
    // This is a placeholder - actual validation depends on address format
    return address.length > 0 && address.length <= 50;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateAddress(signerAddress)) {
      setError('Please enter a valid signer address');
      return;
    }

    try {
      setLoading(true);
      await addSigner(vaultId, signerAddress, userAddress);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to add signer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card padding="lg" className="max-w-md w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Add Signer</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M18 6L6 18M6 6L18 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Signer Address</label>
            <input
              type="text"
              value={signerAddress}
              onChange={(e) => setSignerAddress(e.target.value)}
              placeholder="Enter BCH address"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              disabled={loading}
              required
            />
            <p className="mt-2 text-xs text-gray-600">
              Enter the BCH address of the signer you want to add to this vault.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Adding...' : 'Add Signer'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

