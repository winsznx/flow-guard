/**
 * CreateBountyPage
 *
 * Deploy a new BountyCovenant. Mirrors the canonical CreateStreamPage shape:
 *   - BCH vs FUNGIBLE_TOKEN toggle with three-layer + on-chain category validation
 *   - Two-slot authority model handled server-side; the creator wallet only
 *     signs the funding tx (handled on the detail page).
 *   - On submit: validate -> validate token on-chain -> POST /create -> navigate
 *     to /bounties/:id with { freshCreate: true } so the detail page auto-triggers
 *     the funding flow.
 *
 * Backend covenant note: each claim rewrites the 40-byte commitment serially,
 * so the practical ceiling per covenant is ~19 winners until the LIFT trick
 * ships. We warn the user in-form if they exceed BOUNTY_WINNER_RECOMMENDED_MAX.
 */

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  Coins,
  DollarSign,
  Target,
  Trophy,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { useWallet } from '../hooks/useWallet';
import { useNetwork } from '../hooks/useNetwork';
import { validateTokenCategory } from '../utils/tokenValidation';
import { createBounty, type CreateBountyInput } from '../services/bountyApi';

type TokenType = 'BCH' | 'FUNGIBLE_TOKEN';

interface FormData {
  title: string;
  description: string;
  tokenType: TokenType;
  tokenCategory: string;
  rewardPerWinner: string;
  maxWinners: string;
  startDate: string;
  endDate: string;
  cancelable: boolean;
}

type FormField = keyof FormData;
type FormErrors = Partial<Record<FormField, string>>;

const BOUNTY_WINNER_RECOMMENDED_MAX = 19;

const TOKEN_HEX_REGEX = /^[0-9a-fA-F]{64}$/;

function todayIso(): string {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

function isoDateToUnixSeconds(value: string): number | undefined {
  if (!value) return undefined;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return undefined;
  return Math.floor(ts / 1000);
}

/**
 * Create-bounty wizard. Replicates the FT/BCH toggle and on-chain category
 * validation pattern from CreateStreamPage so deployments cannot be created
 * against a non-existent token category.
 */
export default function CreateBountyPage() {
  const navigate = useNavigate();
  const wallet = useWallet();
  const network = useNetwork();

  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    tokenType: 'BCH',
    tokenCategory: '',
    rewardPerWinner: '',
    maxWinners: '1',
    startDate: todayIso(),
    endDate: '',
    cancelable: true,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isCreating, setIsCreating] = useState(false);

  const rewardValue = useMemo(() => {
    const parsed = Number.parseFloat(formData.rewardPerWinner);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [formData.rewardPerWinner]);

  const maxWinnersValue = useMemo(() => {
    const parsed = Number.parseInt(formData.maxWinners, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [formData.maxWinners]);

  const totalPoolValue = useMemo(() => rewardValue * maxWinnersValue, [rewardValue, maxWinnersValue]);

  const winnerCapWarning = useMemo(() => {
    if (maxWinnersValue > BOUNTY_WINNER_RECOMMENDED_MAX) {
      return `Each claim rewrites the on-chain commitment. The practical safe ceiling today is ~${BOUNTY_WINNER_RECOMMENDED_MAX} winners per covenant - split this into multiple bounties or contact the FlowGuard team for high-cap LIFT support.`;
    }
    return null;
  }, [maxWinnersValue]);

  const handleChange = <K extends FormField>(field: K, value: FormData[K]): void => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = (): boolean => {
    const nextErrors: FormErrors = {};

    if (!formData.title.trim()) {
      nextErrors.title = 'Bounty title is required';
    }

    if (formData.tokenType === 'FUNGIBLE_TOKEN') {
      if (!formData.tokenCategory) {
        nextErrors.tokenCategory = 'Token category ID is required for CashTokens';
      } else if (formData.tokenCategory.length !== 64) {
        nextErrors.tokenCategory = 'Token category must be 64 characters (32-byte hex)';
      } else if (!TOKEN_HEX_REGEX.test(formData.tokenCategory)) {
        nextErrors.tokenCategory = 'Token category must be valid hex';
      }
    }

    if (!formData.rewardPerWinner || rewardValue <= 0) {
      nextErrors.rewardPerWinner = 'Reward per winner must be greater than 0';
    }

    if (!formData.maxWinners || maxWinnersValue <= 0 || !Number.isInteger(maxWinnersValue)) {
      nextErrors.maxWinners = 'Max winners must be a positive whole number';
    }

    if (formData.endDate && formData.startDate && new Date(formData.endDate) <= new Date(formData.startDate)) {
      nextErrors.endDate = 'End date must be after start date';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!validate()) return;

    if (!wallet.isConnected || !wallet.address) {
      setErrors({ title: 'Please connect a wallet before deploying a bounty.' });
      return;
    }
    if (!wallet.signCashScriptTransaction) {
      setErrors({ title: 'Connected wallet does not support CashScript transactions.' });
      return;
    }

    setIsCreating(true);

    if (formData.tokenType === 'FUNGIBLE_TOKEN' && formData.tokenCategory) {
      try {
        const isValid = await validateTokenCategory(formData.tokenCategory, network);
        if (!isValid) {
          setErrors({ tokenCategory: 'Token category not found on blockchain. Please verify the token exists.' });
          setIsCreating(false);
          return;
        }
      } catch (validationError) {
        console.error('Token validation failed:', validationError);
        setErrors({ tokenCategory: 'Failed to validate token category. Please try again.' });
        setIsCreating(false);
        return;
      }
    }

    try {
      const payload: CreateBountyInput = {
        creator: wallet.address,
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        tokenType: formData.tokenType,
        tokenCategory: formData.tokenType === 'FUNGIBLE_TOKEN' ? formData.tokenCategory : undefined,
        rewardPerWinner: rewardValue,
        maxWinners: maxWinnersValue,
        startDate: isoDateToUnixSeconds(formData.startDate),
        endDate: formData.endDate ? isoDateToUnixSeconds(formData.endDate) : undefined,
      };

      const result = await createBounty(payload, wallet.address);
      const bountyId = result?.campaign?.id;
      if (!bountyId) {
        throw new Error('Backend did not return a bounty id.');
      }

      navigate(`/bounties/${bountyId}`, { state: { freshCreate: true } });
    } catch (error) {
      console.error('Failed to create bounty:', error);
      const message = error instanceof Error ? error.message : 'Failed to create bounty. Please try again.';
      setErrors({ title: message });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="px-4 py-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            type="button"
            onClick={() => navigate('/bounties')}
            className="inline-flex items-center gap-2 text-primary hover:text-primaryHover font-mono mb-4 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Bounties
          </button>
          <h1 className="text-3xl font-display font-bold text-textPrimary mb-2 sm:text-4xl lg:text-5xl">
            Create Bounty
          </h1>
          <p className="text-textMuted font-mono">
            Lock a fixed prize pool on-chain. Pay the first N winners a fixed reward each.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Bounty info */}
          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">Bounty Details</h3>
                <p className="text-sm text-textMuted font-mono mb-4">Title, brief, and submission context</p>

                <div className="space-y-4">
                  <Input
                    label="Bounty Title"
                    placeholder="e.g., Reproduce a CashScript covenant edge case"
                    value={formData.title}
                    onChange={(event) => handleChange('title', event.target.value)}
                    error={errors.title}
                    required
                  />

                  <Textarea
                    label="Description (optional)"
                    placeholder="Describe what counts as a valid submission, the proof format, and how winners will be selected."
                    value={formData.description}
                    onChange={(event) => handleChange('description', event.target.value)}
                    rows={4}
                    helpText="Submissions are handled off-chain by you (the creator). The covenant only verifies the on-chain payout."
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
                <p className="text-sm text-textMuted font-mono mb-4">Pay winners in BCH or a CashTokens FT</p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => handleChange('tokenType', 'BCH')}
                    className={`min-w-0 p-4 border-2 rounded-xl text-left transition-all ${
                      formData.tokenType === 'BCH'
                        ? 'border-accent bg-accent/5 shadow-sm'
                        : 'border-border hover:border-accent/40'
                    }`}
                  >
                    <div className="font-display font-bold text-lg text-textPrimary mb-1">Bitcoin Cash</div>
                    <div className="text-sm text-textMuted font-mono">Reward winners in native BCH</div>
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
                    <div className="font-display font-bold text-lg text-textPrimary mb-1">CashTokens</div>
                    <div className="text-sm text-textMuted font-mono">Reward winners with a fungible token</div>
                  </button>
                </div>

                {formData.tokenType === 'FUNGIBLE_TOKEN' && (
                  <div className="mt-4">
                    <Input
                      label="Token Category ID"
                      placeholder="64-character hex token category"
                      value={formData.tokenCategory}
                      onChange={(event) => handleChange('tokenCategory', event.target.value.trim())}
                      error={errors.tokenCategory}
                      helpText="The funding wallet must already control a minting NFT for this category."
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Prize structure */}
          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                <Target className="w-6 h-6 text-secondary" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">Prize Structure</h3>
                <p className="text-sm text-textMuted font-mono mb-4">
                  Every winner receives the same fixed reward
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label={`Reward per Winner (${formData.tokenType === 'BCH' ? 'BCH' : 'Tokens'})`}
                    type="number"
                    step={formData.tokenType === 'BCH' ? '0.00000001' : '1'}
                    min="0"
                    placeholder={formData.tokenType === 'BCH' ? '0.5' : '100'}
                    value={formData.rewardPerWinner}
                    onChange={(event) => handleChange('rewardPerWinner', event.target.value)}
                    error={errors.rewardPerWinner}
                    helpText="Fixed per-winner prize. Cannot be changed after deployment."
                    required
                  />

                  <Input
                    label="Max Winners"
                    type="number"
                    step="1"
                    min="1"
                    placeholder="3"
                    value={formData.maxWinners}
                    onChange={(event) => handleChange('maxWinners', event.target.value)}
                    error={errors.maxWinners}
                    helpText={
                      totalPoolValue > 0
                        ? `Total pool: ${totalPoolValue} ${formData.tokenType === 'BCH' ? 'BCH' : 'tokens'}`
                        : 'How many prizes the bounty pays out'
                    }
                    required
                  />
                </div>

                {winnerCapWarning && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-secondary/40 bg-secondary/5 p-3">
                    <AlertCircle className="mt-0.5 w-4 h-4 text-secondary flex-shrink-0" />
                    <p className="text-xs font-mono text-textPrimary leading-relaxed">{winnerCapWarning}</p>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Submission window */}
          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">Submission Window</h3>
                <p className="text-sm text-textMuted font-mono mb-4">
                  The covenant rejects claims outside this window
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Start Date"
                    type="date"
                    value={formData.startDate}
                    onChange={(event) => handleChange('startDate', event.target.value)}
                    helpText="Earliest moment a winner can be paid out"
                  />

                  <Input
                    label="End Date (optional)"
                    type="date"
                    value={formData.endDate}
                    onChange={(event) => handleChange('endDate', event.target.value)}
                    error={errors.endDate}
                    helpText="Leave empty for no deadline"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Cancelable toggle */}
          <Card padding="lg">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-display font-bold text-textPrimary">Allow Pause / Cancel</h3>
                  <button
                    type="button"
                    onClick={() => handleChange('cancelable', !formData.cancelable)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.cancelable ? 'bg-accent' : 'bg-border'
                    }`}
                    aria-label="Toggle cancelable"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.cancelable ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-sm text-textMuted font-mono">
                  {formData.cancelable
                    ? 'You can pause or cancel this bounty after deployment. Refunds go to your wallet only.'
                    : 'This bounty will be immutable. Use with caution - no pause or cancel will be possible.'}
                </p>
              </div>
            </div>
          </Card>

          {/* Summary */}
          <Card padding="lg" className="border-accent/30 bg-accent/5">
            <div className="flex items-start gap-4">
              <DollarSign className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
              <div className="min-w-0 flex-1">
                <h4 className="font-display font-bold text-textPrimary mb-2">Bounty Summary</h4>
                <div className="space-y-1 text-sm font-mono text-textMuted">
                  <p>
                    <span className="text-textPrimary font-bold">{formData.title || '[Bounty Title]'}</span>
                  </p>
                  <p>
                    Reward:{' '}
                    <span className="text-textPrimary font-bold">
                      {rewardValue || 0} {formData.tokenType === 'BCH' ? 'BCH' : 'tokens'}
                    </span>{' '}
                    × <span className="text-textPrimary font-bold">{maxWinnersValue || 0}</span> winners
                  </p>
                  <p>
                    Total pool:{' '}
                    <span className="text-textPrimary font-bold">
                      {totalPoolValue || 0} {formData.tokenType === 'BCH' ? 'BCH' : 'tokens'}
                    </span>
                  </p>
                  <p>
                    Window:{' '}
                    <span className="text-textPrimary font-bold">
                      {formData.startDate || 'now'}
                    </span>{' '}
                    →{' '}
                    <span className="text-textPrimary font-bold">{formData.endDate || 'no deadline'}</span>
                  </p>
                  <p className="pt-2 border-t border-border/40">
                    {formData.cancelable ? (
                      <span className="text-accent">Pause and cancel enabled</span>
                    ) : (
                      <span className="text-primary">Immutable - no pause or cancel</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Actions */}
          <div className="flex flex-col-reverse gap-4 pt-4 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/bounties')}
              disabled={isCreating}
              className="w-full flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating} className="w-full flex-1">
              {isCreating ? 'Deploying Bounty...' : 'Deploy Bounty'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
