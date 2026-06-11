import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { useWallet } from '../hooks/useWallet';
import { authFetch } from '../utils/auth';
import { ChevronLeft, Gift, Users, DollarSign, Calendar, AlertCircle } from 'lucide-react';

type CampaignType = 'AIRDROP' | 'BOUNTY' | 'REWARD' | 'GRANT';

interface FormData {
  title: string;
  description: string;
  campaignType: CampaignType;
  tokenType: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  totalAmount: string;
  amountPerClaim: string;
  startDate: string;
  endDate: string;
  requireKyc: boolean;
  maxClaimsPerAddress: string;
}

export default function CreateAirdropPage() {
  const navigate = useNavigate();
  const wallet = useWallet();

  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    campaignType: 'AIRDROP',
    tokenType: 'BCH',
    totalAmount: '',
    amountPerClaim: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    requireKyc: false,
    maxClaimsPerAddress: '1',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isCreating, setIsCreating] = useState(false);

  const handleChange = (field: keyof FormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.title) {
      newErrors.title = 'Campaign title is required';
    }

    if (formData.tokenType === 'FUNGIBLE_TOKEN' && !formData.tokenCategory) {
      newErrors.tokenCategory = 'Token category ID is required for CashTokens';
    }

    if (!formData.totalAmount || parseFloat(formData.totalAmount) <= 0) {
      newErrors.totalAmount = 'Total amount must be greater than 0';
    }

    if (!formData.amountPerClaim || parseFloat(formData.amountPerClaim) <= 0) {
      newErrors.amountPerClaim = 'Amount per claim must be greater than 0';
    }

    if (parseFloat(formData.amountPerClaim) > parseFloat(formData.totalAmount)) {
      newErrors.amountPerClaim = 'Amount per claim cannot exceed total amount';
    }

    if (formData.endDate && new Date(formData.endDate) <= new Date(formData.startDate)) {
      newErrors.endDate = 'End date must be after start date';
    }

    if (!formData.maxClaimsPerAddress || parseInt(formData.maxClaimsPerAddress) < 1) {
      newErrors.maxClaimsPerAddress = 'Must allow at least 1 claim per address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;
    if (!wallet.isConnected || !wallet.address) {
      setErrors({ title: 'Please connect your wallet first.' });
      return;
    }
    if (!wallet.signCashScriptTransaction) {
      setErrors({ title: 'Connected wallet does not support CashScript transactions.' });
      return;
    }

    setIsCreating(true);

    try {
      const payload = {
        creator: wallet.address,
        title: formData.title,
        description: formData.description || undefined,
        campaignType: formData.campaignType,
        tokenType: formData.tokenType,
        tokenCategory: formData.tokenCategory,
        totalAmount: parseFloat(formData.totalAmount),
        amountPerClaim: parseFloat(formData.amountPerClaim),
        startDate: Math.floor(new Date(formData.startDate).getTime() / 1000),
        endDate: formData.endDate ? Math.floor(new Date(formData.endDate).getTime() / 1000) : undefined,
        requireKyc: formData.requireKyc,
        maxClaimsPerAddress: parseInt(formData.maxClaimsPerAddress),
      };

      const response = await authFetch('/api/airdrops/create', {
        wallet,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create campaign');
      }

      const result = await response.json();
      navigate(`/airdrops/${result.campaign.id}`, { state: { freshCreate: true } });
    } catch (error: any) {
      console.error('Failed to create campaign:', error);
      setErrors({ title: error.message || 'Failed to create campaign. Please try again.' });
    } finally {
      setIsCreating(false);
    }
  };

  const totalRecipients = formData.totalAmount && formData.amountPerClaim
    ? Math.floor(parseFloat(formData.totalAmount) / parseFloat(formData.amountPerClaim))
    : 0;

  return (
    <div className="px-4 py-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/airdrops')}
            className="inline-flex items-center gap-2 text-primary hover:text-primaryHover font-mono mb-4 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Airdrops
          </button>
          <h1 className="text-3xl font-display font-bold text-textPrimary mb-2 sm:text-4xl lg:text-5xl">
            Create Airdrop Campaign
          </h1>
          <p className="text-textMuted font-mono">
            Launch a mass distribution campaign for airdrops, bounties, rewards, or grants
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Campaign Info */}
          <Card padding="lg">
            <div className="space-y-4">
              <Input
                label="Campaign Title"
                placeholder="e.g., Community Airdrop Q1 2024"
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                error={errors.title}
                required
              />

              <Textarea
                label="Description (Optional)"
                placeholder="Describe your campaign, eligibility criteria, and purpose..."
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={3}
              />

              <Select
                label="Campaign Type"
                value={formData.campaignType}
                onChange={(e) => handleChange('campaignType', e.target.value as CampaignType)}
                options={[
                  { value: 'AIRDROP', label: 'Airdrop - General mass distribution' },
                  { value: 'BOUNTY', label: 'Bounty - Task completion rewards' },
                  { value: 'REWARD', label: 'Reward - Achievement-based distribution' },
                  { value: 'GRANT', label: 'Grant - Funding distribution' },
                ]}
              />
            </div>
          </Card>

          {/* Token Type */}
          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">Token Type</h3>
                <p className="text-sm text-textMuted font-mono mb-4">Choose what to distribute</p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => handleChange('tokenType', 'BCH')}
                    className={`min-w-0 p-4 border-2 rounded-xl transition-all ${
                      formData.tokenType === 'BCH'
                        ? 'border-accent bg-accent/5 shadow-lg'
                        : 'border-border hover:border-accent/50'
                    }`}
                  >
                    <div className="font-display font-bold text-lg text-textPrimary mb-1">Bitcoin Cash</div>
                    <div className="text-sm text-textMuted font-mono">Distribute BCH</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleChange('tokenType', 'FUNGIBLE_TOKEN')}
                    className={`min-w-0 p-4 border-2 rounded-xl transition-all ${
                      formData.tokenType === 'FUNGIBLE_TOKEN'
                        ? 'border-accent bg-accent/5 shadow-lg'
                        : 'border-border hover:border-accent/50'
                    }`}
                  >
                    <div className="font-display font-bold text-lg text-textPrimary mb-1">CashTokens</div>
                    <div className="text-sm text-textMuted font-mono">Distribute tokens</div>
                  </button>
                </div>

                {formData.tokenType === 'FUNGIBLE_TOKEN' && (
                  <div className="mt-4">
                    <Input
                      label="Token Category ID"
                      placeholder="e.g., a1b2c3d4e5f6..."
                      value={formData.tokenCategory || ''}
                      onChange={(e) => handleChange('tokenCategory', e.target.value)}
                      error={errors.tokenCategory}
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Distribution Settings */}
          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">Distribution Settings</h3>
                <p className="text-sm text-textMuted font-mono mb-4">Define total pool and claim amounts</p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label={`Total Pool (${formData.tokenType === 'BCH' ? 'BCH' : 'Tokens'})`}
                    type="number"
                    step="0.00000001"
                    placeholder="100.0"
                    value={formData.totalAmount}
                    onChange={(e) => handleChange('totalAmount', e.target.value)}
                    error={errors.totalAmount}
                    helpText="Total amount to distribute"
                    required
                  />

                  <Input
                    label={`Amount per Claim (${formData.tokenType === 'BCH' ? 'BCH' : 'Tokens'})`}
                    type="number"
                    step="0.00000001"
                    placeholder="0.1"
                    value={formData.amountPerClaim}
                    onChange={(e) => handleChange('amountPerClaim', e.target.value)}
                    error={errors.amountPerClaim}
                    helpText={totalRecipients > 0 ? `~${totalRecipients} possible recipients` : 'Amount each address can claim'}
                    required
                  />
                </div>

                {totalRecipients > 0 && (
                  <div className="mt-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2 text-sm font-mono text-primary">
                      <Users className="w-4 h-4" />
                      <span className="font-bold">
                        {totalRecipients} potential claims
                      </span>
                      <span className="text-textMuted">
                        ({formData.totalAmount} ÷ {formData.amountPerClaim})
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Duration */}
          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-6 h-6 text-secondary" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">Campaign Duration</h3>
                <p className="text-sm text-textMuted font-mono mb-4">Set campaign start and end dates</p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Start Date"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => handleChange('startDate', e.target.value)}
                    required
                  />

                  <Input
                    label="End Date (Optional)"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => handleChange('endDate', e.target.value)}
                    error={errors.endDate}
                    helpText="Leave empty for no expiration"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Claim Restrictions */}
          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4">Claim Restrictions</h3>

            <div className="space-y-4">
              <Input
                label="Max Claims per Address"
                type="number"
                min="1"
                value={formData.maxClaimsPerAddress}
                onChange={(e) => handleChange('maxClaimsPerAddress', e.target.value)}
                error={errors.maxClaimsPerAddress}
                helpText="Limit how many times one address can claim"
              />

              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-display font-bold text-textPrimary">Require KYC</h3>
                    <button
                      type="button"
                      onClick={() => handleChange('requireKyc', !formData.requireKyc)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        formData.requireKyc ? 'bg-accent' : 'bg-border'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          formData.requireKyc ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-sm text-textMuted font-mono">
                    {formData.requireKyc
                      ? 'Only verified addresses can claim'
                      : 'Anyone with the link can claim'}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Summary Box */}
          <Card padding="lg" className="bg-accent/5 border-accent/20">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
              <div>
                <h4 className="font-display font-bold text-textPrimary mb-2">Campaign Summary</h4>
                <div className="space-y-1 text-sm font-mono text-textMuted">
                  <p>
                    <span className="text-textPrimary font-bold">{formData.title || '[Campaign Title]'}</span>
                  </p>
                  <p>
                    Type: <span className="text-textPrimary font-bold">{formData.campaignType}</span>
                  </p>
                  <p>
                    Distribution: <span className="text-textPrimary font-bold">{formData.totalAmount || '0'} {formData.tokenType === 'BCH' ? 'BCH' : 'Tokens'}</span> total,{' '}
                    <span className="text-textPrimary font-bold">{formData.amountPerClaim || '0'}</span> per claim
                  </p>
                  <p>
                    Potential recipients: <span className="text-textPrimary font-bold">{totalRecipients}</span>
                  </p>
                  <p>
                    Max claims per address: <span className="text-textPrimary font-bold">{formData.maxClaimsPerAddress}</span>
                  </p>
                  <p className="pt-2 border-t border-border/40">
                    {formData.requireKyc ? (
                      <span className="text-accent">✓ KYC required for claims</span>
                    ) : (
                      <span className="text-primary">Public - anyone can claim</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse gap-4 pt-4 sm:flex-row">
            <Button type="button" variant="secondary" onClick={() => navigate('/airdrops')} disabled={isCreating} className="w-full flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating} className="w-full flex-1">
              {isCreating ? 'Creating Campaign...' : 'Create Campaign'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
