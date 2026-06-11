/**
 * CreateRewardPage
 *
 * A → Z create wizard for a new Reward campaign. Mirrors the CreateStreamPage
 * shape (the gold-standard create flow) and pulls back the BCH ↔ CashTokens
 * toggle with a three-layer + on-chain validateTokenCategory check.
 *
 * Flow:
 *   1. Local-form validation (required fields, numeric bounds, FT format).
 *   2. Wallet connection + signer guards.
 *   3. (FT mode) await validateTokenCategory(category, network) - on-chain
 *      genesis tx check.
 *   4. POST /api/rewards/create with x-user-address header.
 *   5. Navigate to /rewards/:id with { freshCreate: true } so the detail page
 *      auto-prompts for funding.
 */

import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Award,
  Calendar,
  ChevronLeft,
  Coins,
  DollarSign,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { useWallet } from '../hooks/useWallet';
import { useNetwork } from '../hooks/useNetwork';
import { validateTokenCategory } from '../utils/tokenValidation';
import { createReward } from '../services/rewardApi';
import type { CreateRewardInput, RewardCategory } from '../services/rewardApi';

type RewardTokenType = 'BCH' | 'FUNGIBLE_TOKEN';

interface FormData {
  title: string;
  description: string;
  rewardCategory: RewardCategory;
  tokenType: RewardTokenType;
  tokenCategory: string;
  totalPool: string;
  maxRewardAmount: string;
  startDate: string;
  endDate: string;
  vaultId: string;
}

type FormField = keyof FormData;
type FormErrors = Partial<Record<FormField, string>>;

const HEX_64 = /^[0-9a-fA-F]{64}$/;

const REWARD_CATEGORY_OPTIONS: ReadonlyArray<{ value: RewardCategory; label: string }> = [
  { value: 'CUSTOM', label: 'Custom - Flexible distribution program' },
  { value: 'ACHIEVEMENT', label: 'Achievement - Milestone or accomplishment rewards' },
  { value: 'REFERRAL', label: 'Referral - Invite/conversion rewards' },
  { value: 'LOYALTY', label: 'Loyalty - Tenure or recurring engagement' },
];

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Create page for Reward campaigns. Lazy-loaded by App.tsx in Phase 3.
 */
export default function CreateRewardPage() {
  const navigate = useNavigate();
  const wallet = useWallet();
  const network = useNetwork();

  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    rewardCategory: 'CUSTOM',
    tokenType: 'BCH',
    tokenCategory: '',
    totalPool: '',
    maxRewardAmount: '',
    startDate: todayIso(),
    endDate: '',
    vaultId: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isCreating, setIsCreating] = useState(false);

  const handleChange = <K extends FormField>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const onTextChange = (field: FormField) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      handleChange(field, e.target.value as FormData[typeof field]);

  const totalPoolNumber = useMemo(() => Number.parseFloat(formData.totalPool) || 0, [formData.totalPool]);
  const maxRewardNumber = useMemo(() => Number.parseFloat(formData.maxRewardAmount) || 0, [formData.maxRewardAmount]);

  const minRecipients = useMemo(() => {
    if (totalPoolNumber <= 0 || maxRewardNumber <= 0) return 0;
    return Math.max(1, Math.floor(totalPoolNumber / maxRewardNumber));
  }, [maxRewardNumber, totalPoolNumber]);

  const assetLabel = formData.tokenType === 'BCH' ? 'BCH' : 'tokens';

  const validate = (): boolean => {
    const next: FormErrors = {};

    if (!formData.title.trim()) {
      next.title = 'Campaign title is required.';
    }

    if (formData.tokenType === 'FUNGIBLE_TOKEN') {
      const category = formData.tokenCategory.trim();
      if (!category) {
        next.tokenCategory = 'Token category ID is required for CashToken rewards.';
      } else if (category.length !== 64) {
        next.tokenCategory = 'Token category must be exactly 64 hex characters.';
      } else if (!HEX_64.test(category)) {
        next.tokenCategory = 'Token category must be a valid 64-character hex string.';
      }
    }

    if (!formData.totalPool || totalPoolNumber <= 0) {
      next.totalPool = 'Total pool must be greater than 0.';
    }

    if (!formData.maxRewardAmount || maxRewardNumber <= 0) {
      next.maxRewardAmount = 'Max reward amount must be greater than 0.';
    } else if (totalPoolNumber > 0 && maxRewardNumber > totalPoolNumber) {
      next.maxRewardAmount = 'Max reward cannot exceed total pool.';
    }

    if (formData.endDate && formData.startDate && new Date(formData.endDate) <= new Date(formData.startDate)) {
      next.endDate = 'End date must be after start date.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    if (!wallet.isConnected || !wallet.address) {
      setErrors({ title: 'Please connect a wallet before deploying a reward contract.' });
      return;
    }
    if (!wallet.signCashScriptTransaction) {
      setErrors({ title: 'Connected wallet does not support CashScript transactions.' });
      return;
    }

    setIsCreating(true);

    try {
      if (formData.tokenType === 'FUNGIBLE_TOKEN') {
        try {
          const isValid = await validateTokenCategory(formData.tokenCategory.trim(), network);
          if (!isValid) {
            setErrors({
              tokenCategory: 'Token category not found on blockchain. Please verify the token exists.',
            });
            setIsCreating(false);
            return;
          }
        } catch (validationError) {
          // eslint-disable-next-line no-console
          console.error('[CreateRewardPage] Token validation failed:', validationError);
          setErrors({
            tokenCategory: 'Failed to validate token category. Please try again.',
          });
          setIsCreating(false);
          return;
        }
      }

      const startSeconds = formData.startDate
        ? Math.floor(new Date(formData.startDate).getTime() / 1000)
        : undefined;
      const endSeconds = formData.endDate
        ? Math.floor(new Date(formData.endDate).getTime() / 1000)
        : undefined;

      const payload: CreateRewardInput = {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        rewardCategory: formData.rewardCategory,
        tokenType: formData.tokenType,
        tokenCategory:
          formData.tokenType === 'FUNGIBLE_TOKEN' ? formData.tokenCategory.trim() : undefined,
        totalPool: totalPoolNumber,
        maxRewardAmount: maxRewardNumber,
        startDate: startSeconds,
        endDate: endSeconds,
        vaultId: formData.vaultId.trim() || undefined,
      };

      const result = await createReward(payload, wallet.address);
      const rewardId = result.campaign?.id;
      if (!rewardId) {
        throw new Error('Reward created but the campaign id is missing from the response.');
      }

      navigate(`/rewards/${rewardId}`, { state: { freshCreate: true } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create reward campaign.';
      // eslint-disable-next-line no-console
      console.error('[CreateRewardPage] Create failed:', error);
      setErrors({ title: message });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <button
            type="button"
            onClick={() => navigate('/rewards')}
            className="inline-flex items-center gap-2 text-primary hover:text-primaryHover font-mono mb-4 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Rewards
          </button>
          <h1 className="text-3xl font-display font-bold text-textPrimary mb-2 sm:text-4xl lg:text-5xl">
            Create Reward Campaign
          </h1>
          <p className="text-textMuted font-mono">
            Deploy a variable-amount reward covenant for achievements, referrals, loyalty, or
            custom incentive programs.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Campaign basics */}
          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">
                  Campaign Details
                </h3>
                <p className="text-sm text-textMuted font-mono mb-4">
                  Give your reward program a clear name and category.
                </p>

                <div className="space-y-4">
                  <Input
                    label="Campaign Title"
                    placeholder="e.g., Q1 Contributor Rewards"
                    value={formData.title}
                    onChange={onTextChange('title')}
                    error={errors.title}
                    required
                  />

                  <Textarea
                    label="Description (Optional)"
                    placeholder="Describe the reward program, eligibility, and how rewards will be granted..."
                    value={formData.description}
                    onChange={onTextChange('description')}
                    rows={3}
                  />

                  <Select
                    label="Reward Category"
                    value={formData.rewardCategory}
                    onChange={(e) => handleChange('rewardCategory', e.target.value as RewardCategory)}
                    options={REWARD_CATEGORY_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Token type */}
          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Coins className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">Reward Asset</h3>
                <p className="text-sm text-textMuted font-mono mb-4">
                  Choose whether rewards are paid out in BCH or a CashToken.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => handleChange('tokenType', 'BCH')}
                    className={`min-w-0 p-4 border-2 rounded-xl text-left transition-all ${
                      formData.tokenType === 'BCH'
                        ? 'border-accent bg-accent/5 shadow-sm'
                        : 'border-border hover:border-accent/40'
                    }`}
                  >
                    <div className="font-display font-bold text-lg text-textPrimary mb-1">
                      Bitcoin Cash
                    </div>
                    <div className="text-sm text-textMuted font-mono">
                      Pay rewards directly in BCH satoshis.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleChange('tokenType', 'FUNGIBLE_TOKEN')}
                    className={`min-w-0 p-4 border-2 rounded-xl text-left transition-all ${
                      formData.tokenType === 'FUNGIBLE_TOKEN'
                        ? 'border-accent bg-accent/5 shadow-sm'
                        : 'border-border hover:border-accent/40'
                    }`}
                  >
                    <div className="font-display font-bold text-lg text-textPrimary mb-1">
                      CashTokens
                    </div>
                    <div className="text-sm text-textMuted font-mono">
                      Pay rewards in a fungible token category.
                    </div>
                  </button>
                </div>

                {formData.tokenType === 'FUNGIBLE_TOKEN' && (
                  <div className="mt-4">
                    <Input
                      label="Token Category ID"
                      placeholder="64-character hex genesis txid"
                      value={formData.tokenCategory}
                      onChange={onTextChange('tokenCategory')}
                      error={errors.tokenCategory}
                      helpText="The funding wallet must already control a minting NFT for this category."
                      required
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Pool & per-reward cap */}
          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-6 h-6 text-secondary" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">
                  Pool & Caps
                </h3>
                <p className="text-sm text-textMuted font-mono mb-4">
                  Total budget plus the maximum any single reward can pay out.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label={`Total Pool (${assetLabel})`}
                    type="number"
                    step={formData.tokenType === 'BCH' ? '0.00000001' : '1'}
                    min="0"
                    placeholder={formData.tokenType === 'BCH' ? '10.0' : '10000'}
                    value={formData.totalPool}
                    onChange={onTextChange('totalPool')}
                    error={errors.totalPool}
                    helpText="Locked into the covenant at funding."
                    required
                  />

                  <Input
                    label={`Max Reward / Distribution (${assetLabel})`}
                    type="number"
                    step={formData.tokenType === 'BCH' ? '0.00000001' : '1'}
                    min="0"
                    placeholder={formData.tokenType === 'BCH' ? '0.5' : '500'}
                    value={formData.maxRewardAmount}
                    onChange={onTextChange('maxRewardAmount')}
                    error={errors.maxRewardAmount}
                    helpText={
                      minRecipients > 0
                        ? `Supports at least ${minRecipients} max-sized reward${minRecipients === 1 ? '' : 's'}.`
                        : 'Upper bound enforced by the covenant.'
                    }
                    required
                  />
                </div>

                {minRecipients > 0 && (
                  <div className="mt-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2 text-sm font-mono text-primary">
                      <Users className="w-4 h-4" />
                      <span className="font-bold">{minRecipients}</span>
                      <span className="text-textMuted">
                        max-sized rewards possible ({formData.totalPool} ÷ {formData.maxRewardAmount})
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Schedule */}
          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">Schedule</h3>
                <p className="text-sm text-textMuted font-mono mb-4">
                  Optional open/close window. Leave end date empty for an open-ended program.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Start Date"
                    type="date"
                    value={formData.startDate}
                    onChange={onTextChange('startDate')}
                    helpText="Leave today for immediate availability."
                  />

                  <Input
                    label="End Date (Optional)"
                    type="date"
                    value={formData.endDate}
                    onChange={onTextChange('endDate')}
                    error={errors.endDate}
                    helpText="Leave empty for no expiration."
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Vault link */}
          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Award className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">
                  Vault Link (Optional)
                </h3>
                <p className="text-sm text-textMuted font-mono mb-4">
                  Anchor this reward to a treasury vault. Leave empty for a standalone program.
                </p>

                <Input
                  label="Vault ID"
                  placeholder="uuid of a vault you signed in to"
                  value={formData.vaultId}
                  onChange={onTextChange('vaultId')}
                  helpText="Optional. Backend will derive a standalone vault id if omitted."
                />
              </div>
            </div>
          </Card>

          {/* Summary review */}
          <Card padding="lg" className="border-accent/30 bg-accent/5">
            <div className="flex items-start gap-4">
              <Sparkles className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h4 className="font-display font-bold text-textPrimary mb-2">
                  Review Before Deploying
                </h4>
                <div className="space-y-1 text-sm font-mono text-textMuted">
                  <p>
                    <span className="text-textPrimary font-bold">
                      {formData.title || '[Campaign Title]'}
                    </span>{' '}
                    - {formData.rewardCategory}
                  </p>
                  <p>
                    Pool:{' '}
                    <span className="text-textPrimary font-bold">
                      {formData.totalPool || '0'} {assetLabel}
                    </span>{' '}
                    • Max reward:{' '}
                    <span className="text-textPrimary font-bold">
                      {formData.maxRewardAmount || '0'} {assetLabel}
                    </span>
                  </p>
                  <p>
                    Window:{' '}
                    <span className="text-textPrimary font-bold">
                      {formData.startDate || 'today'}
                    </span>{' '}
                    →{' '}
                    <span className="text-textPrimary font-bold">
                      {formData.endDate || 'open-ended'}
                    </span>
                  </p>
                  {formData.tokenType === 'FUNGIBLE_TOKEN' && formData.tokenCategory && (
                    <p className="break-all">
                      Token category:{' '}
                      <span className="text-textPrimary">
                        {formData.tokenCategory.slice(0, 16)}…{formData.tokenCategory.slice(-12)}
                      </span>
                    </p>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs font-mono text-textMuted">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>
                    After creation you will sign the funding transaction from the campaign page to
                    activate distributions.
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Footer */}
          <div className="flex flex-col-reverse gap-4 pt-4 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/rewards')}
              disabled={isCreating}
              className="w-full flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isCreating}
              loading={isCreating}
              className="w-full flex-1"
            >
              {isCreating ? 'Deploying Reward Contract…' : 'Create Reward Campaign'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
