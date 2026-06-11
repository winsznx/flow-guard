import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { useWallet } from '../hooks/useWallet';
import { createProposal } from '../utils/api';
import { createProposalOnChain } from '../utils/blockchain';
import { ChevronLeft, Send, AlertCircle } from 'lucide-react';

export default function CreateProposalPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const wallet = useWallet();
  const [formData, setFormData] = useState({
    recipient: '',
    amount: '',
    reason: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidBchAddress = (value: string): boolean => {
    const addr = value.trim();
    if (!addr) return false;
    // Basic BCH cashaddr validation for now – expect chipnet or mainnet prefix
    if (addr.startsWith('bchtest:') || addr.startsWith('bitcoincash:')) {
      return true;
    }
    return false;
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!wallet.address) {
      setError('Please connect your wallet first');
      return;
    }

    if (!id) {
      setError('Vault ID is missing');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Normalize inputs
      const recipient = formData.recipient.trim();
      const amountValue = parseFloat(formData.amount);

      // Validate form
      if (!isValidBchAddress(recipient)) {
        throw new Error('Recipient must be a valid BCH cash address (e.g. bchtest:qq...)');
      }
      if (!formData.amount || Number.isNaN(amountValue) || amountValue <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      if (!formData.reason.trim()) {
        throw new Error('Reason is required');
      }

      // Create proposal via API
      const proposalData = {
        recipient,
        amount: amountValue,
        reason: formData.reason.trim(),
      };

      const createdProposal = await createProposal(id, proposalData, wallet);

      if (!wallet.signCashScriptTransaction) {
        throw new Error(
          'Connected wallet does not support CashScript signing. ' +
          'Use Cashonize or a WalletConnect-compatible signer to create proposals on-chain.',
        );
      }

      await createProposalOnChain(
        wallet,
        createdProposal.id,
        wallet.publicKey || '',
        {
          vaultId: id,
          proposalId: createdProposal.id,
          amount: amountValue,
          toAddress: recipient,
        },
      );

      // Navigate back to vault detail page
      navigate(`/vaults/${id}`);
    } catch (err: any) {
      // Provide more specific error messages for common failures
      let errorMsg = err.message || 'Failed to create proposal';
      if (errorMsg.includes('exceeds spending cap') || errorMsg.includes('spending cap')) {
        errorMsg = 'Amount exceeds the vault spending cap. Please reduce the proposal amount.';
      } else if (errorMsg.includes('already exists') || errorMsg.includes('proposal ID')) {
        errorMsg = 'A proposal with this ID already exists. Please wait for the current proposal to be processed.';
      } else if (errorMsg.includes('network') || errorMsg.includes('connection')) {
        errorMsg = 'Network connection error. Please check your internet connection and try again.';
      }
      setError(errorMsg);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            to={`/vaults/${id}`}
            className="inline-flex items-center gap-2 text-primary hover:text-primaryHover font-mono mb-4 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Treasury
          </Link>
          <h1 className="text-3xl font-display font-bold text-textPrimary mb-2 sm:text-4xl lg:text-5xl">Create Proposal</h1>
          <p className="text-textMuted font-mono">
            Submit a payment proposal for multi-sig approval
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Card padding="lg" className="mb-6 bg-error/5 border-error/20">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
              <p className="text-error font-mono text-sm">{error}</p>
            </div>
          </Card>
        )}

        {/* Form */}
        <Card padding="lg">
          <div className="space-y-6">
            {/* Recipient Address */}
            <div>
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Send className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-display font-bold text-textPrimary mb-1">
                    Recipient
                  </h3>
                  <p className="text-sm text-textMuted font-mono mb-4">
                    BCH address that will receive the funds
                  </p>
                  <Input
                    type="text"
                    value={formData.recipient}
                    onChange={(e) => handleInputChange('recipient', e.target.value)}
                    placeholder="bitcoincash:qr2x3uy3... or bchtest:qq..."
                    helpText="Must be a valid Bitcoin Cash address"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Amount */}
            <div className="pt-6 border-t border-border">
              <Input
                label="Amount (BCH)"
                type="number"
                value={formData.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                placeholder="0.00"
                step="0.00000001"
                helpText="Must not exceed vault spending cap"
                required
              />
            </div>

            {/* Reason */}
            <div className="pt-6 border-t border-border">
              <Textarea
                label="Reason / Description"
                value={formData.reason}
                onChange={(e) => handleInputChange('reason', e.target.value)}
                rows={4}
                placeholder="e.g., 'Q1 2024 contractor payment for backend development'"
                helpText="Explain the purpose of this payment for other signers"
                required
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-6 border-t border-border">
              <Link to={`/vaults/${id}`} className="flex-1">
                <Button variant="outline" disabled={isSubmitting} className="w-full">
                  Cancel
                </Button>
              </Link>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? 'Creating Proposal...' : 'Create Proposal'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
