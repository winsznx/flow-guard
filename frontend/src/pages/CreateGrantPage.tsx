/**
 * CreateGrantPage - Milestone-based grant deployment wizard.
 *
 * Modeled on CreateStreamPage (the canonical create flow), including the
 * three-layer FT validation chain:
 *   1. presence check in `validate()`
 *   2. 64-char hex format check in `validate()`
 *   3. on-chain genesis-tx existence check via `validateTokenCategory()`
 *
 * On submit:
 *   POST /api/grants/create → deploys the GrantCovenant + seeds milestones
 *   navigate(`/grants/:id`, { state: { freshCreate: true } }) → the detail
 *   page picks up the freshCreate signal and surfaces the funding CTA.
 *
 * The funding round-trip (wallet sign + backend broadcast) lives on the
 * detail page via `fundGrantContract` so a refresh mid-flow does not orphan
 * the grant record.
 */

import { useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Award,
  ChevronLeft,
  DollarSign,
  ListChecks,
  Plus,
  Target,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { useWallet } from '../hooks/useWallet';
import { useNetwork } from '../hooks/useNetwork';
import { createGrant } from '../services/grantApi';
import type { CreateGrantInput, CreateGrantMilestoneInput } from '../services/grantApi';
import { validateTokenCategory } from '../utils/tokenValidation';

type TokenType = 'BCH' | 'FUNGIBLE_TOKEN';

interface MilestoneDraft {
  id: string;
  title: string;
  description: string;
}

interface FormData {
  title: string;
  description: string;
  recipient: string;
  tokenType: TokenType;
  tokenCategory: string;
  amountPerMilestone: string;
  milestonesTotal: string;
  cancelable: boolean;
  transferable: boolean;
}

type FormField = keyof FormData | 'milestones';

const HEX_64_PATTERN = /^[0-9a-fA-F]{64}$/;

function createMilestoneDraft(index: number): MilestoneDraft {
  return {
    id: `milestone-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: `Milestone ${index}`,
    description: '',
  };
}

function toFiniteFloat(input: string): number {
  const parsed = Number.parseFloat(input);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toFiniteInt(input: string): number {
  const parsed = Number.parseInt(input, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Wizard for deploying a milestone-based grant. The page does not directly
 * sign the funding transaction - it only persists the grant record and hands
 * off to GrantDetailPage where the wallet round-trip happens.
 */
export default function CreateGrantPage() {
  const navigate = useNavigate();
  const wallet = useWallet();
  const network = useNetwork();

  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    recipient: '',
    tokenType: 'BCH',
    tokenCategory: '',
    amountPerMilestone: '',
    milestonesTotal: '3',
    cancelable: true,
    transferable: false,
  });

  const [milestones, setMilestones] = useState<MilestoneDraft[]>(() => [
    createMilestoneDraft(1),
    createMilestoneDraft(2),
    createMilestoneDraft(3),
  ]);

  const [errors, setErrors] = useState<Partial<Record<FormField, string>>>({});
  const [isCreating, setIsCreating] = useState(false);

  const milestonesTotalNumber = toFiniteInt(formData.milestonesTotal);
  const amountPerMilestoneNumber = toFiniteFloat(formData.amountPerMilestone);

  const totalAmountValue = useMemo(() => {
    if (milestonesTotalNumber <= 0 || amountPerMilestoneNumber <= 0) return 0;
    return milestonesTotalNumber * amountPerMilestoneNumber;
  }, [milestonesTotalNumber, amountPerMilestoneNumber]);

  const handleChange = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleMilestoneChange = (id: string, field: 'title' | 'description', value: string) => {
    setMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
    if (errors.milestones) {
      setErrors((prev) => ({ ...prev, milestones: undefined }));
    }
  };

  const addMilestone = () => {
    setMilestones((prev) => {
      const next = [...prev, createMilestoneDraft(prev.length + 1)];
      setFormData((current) => ({ ...current, milestonesTotal: String(next.length) }));
      return next;
    });
  };

  const removeMilestone = (id: string) => {
    setMilestones((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((m) => m.id !== id);
      setFormData((current) => ({ ...current, milestonesTotal: String(next.length) }));
      return next;
    });
  };

  const validate = (): boolean => {
    const nextErrors: Partial<Record<FormField, string>> = {};

    if (!formData.title.trim()) {
      nextErrors.title = 'A short grant title is required';
    }

    if (!formData.recipient.trim()) {
      nextErrors.recipient = 'Recipient address is required';
    } else if (!/^(bitcoincash:|bchtest:|bchreg:)?[qp][a-z0-9]{38,}$/i.test(formData.recipient.trim())) {
      nextErrors.recipient = 'Recipient must be a valid BCH cash address';
    }

    if (amountPerMilestoneNumber <= 0) {
      nextErrors.amountPerMilestone = 'Amount per milestone must be greater than 0';
    }

    if (milestonesTotalNumber < 1) {
      nextErrors.milestonesTotal = 'At least one milestone is required';
    } else if (milestonesTotalNumber > 255) {
      nextErrors.milestonesTotal = 'Milestone count must be 255 or fewer';
    } else if (milestonesTotalNumber !== milestones.length) {
      nextErrors.milestones = 'Milestone entries do not match the milestone count above';
    }

    if (milestones.length === 0) {
      nextErrors.milestones = 'Add at least one milestone';
    }

    if (formData.tokenType === 'FUNGIBLE_TOKEN') {
      const category = formData.tokenCategory.trim();
      if (!category) {
        nextErrors.tokenCategory = 'Token category ID is required for CashTokens grants';
      } else if (category.length !== 64) {
        nextErrors.tokenCategory = 'Token category ID must be exactly 64 hex characters';
      } else if (!HEX_64_PATTERN.test(category)) {
        nextErrors.tokenCategory = 'Token category ID must be valid hex';
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreating) return;
    if (!validate()) return;

    if (!wallet.isConnected || !wallet.address) {
      setErrors({ recipient: 'Please connect a wallet before creating a grant.' });
      return;
    }
    if (!wallet.signCashScriptTransaction) {
      setErrors({ recipient: 'Connected wallet does not support CashScript transactions.' });
      return;
    }

    setIsCreating(true);

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
        console.error('Token validation failed:', validationError);
        setErrors({
          tokenCategory: 'Failed to validate token category. Please try again.',
        });
        setIsCreating(false);
        return;
      }
    }

    try {
      const milestonesInput: CreateGrantMilestoneInput[] = milestones.map((draft) => ({
        title: draft.title.trim() || undefined,
        description: draft.description.trim() || undefined,
      }));

      const payload: CreateGrantInput = {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        recipient: formData.recipient.trim(),
        tokenType: formData.tokenType,
        tokenCategory: formData.tokenType === 'FUNGIBLE_TOKEN' ? formData.tokenCategory.trim() : undefined,
        milestonesTotal: milestonesTotalNumber,
        amountPerMilestone: amountPerMilestoneNumber,
        totalAmount: totalAmountValue,
        cancelable: formData.cancelable,
        transferable: formData.transferable,
        milestones: milestonesInput,
      };

      const result = await createGrant(payload, wallet.address);
      const grantId = result.grant?.id;
      if (!grantId) {
        throw new Error('Grant created but no id returned by the API');
      }

      navigate(`/grants/${grantId}`, { state: { freshCreate: true } });
    } catch (error: unknown) {
      console.error('Failed to create grant:', error);
      const message = error instanceof Error ? error.message : 'Failed to create grant. Please try again.';
      setErrors({ recipient: message });
    } finally {
      setIsCreating(false);
    }
  };

  const tokenLabel = formData.tokenType === 'BCH' ? 'BCH' : 'Tokens';

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 md:mb-8">
          <button
            type="button"
            onClick={() => navigate('/grants')}
            className="inline-flex items-center gap-2 text-primary hover:text-primaryHover font-mono mb-4 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Grants
          </button>
          <h1 className="text-3xl font-display font-bold text-textPrimary mb-2 sm:text-4xl lg:text-5xl">
            Create Grant Program
          </h1>
          <p className="text-textMuted font-mono">
            Fund a recipient in fixed milestone tranches. Releases are creator-authorized and
            co-signed by the backend so neither party can withdraw alone.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Identity */}
          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Award className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">Grant Details</h3>
                <p className="text-sm text-textMuted font-mono mb-4">
                  Name the program and describe what the milestones will achieve.
                </p>

                <div className="space-y-4">
                  <Input
                    label="Grant title"
                    placeholder="e.g., Q2 Research Grant - Privacy Tooling"
                    value={formData.title}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('title', e.target.value)}
                    error={errors.title}
                    required
                  />
                  <Textarea
                    label="Description (optional)"
                    placeholder="What is being funded, how will milestones be evaluated, what is the timeline..."
                    value={formData.description}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => handleChange('description', e.target.value)}
                    rows={3}
                  />
                  <Input
                    label="Recipient address"
                    placeholder="bitcoincash:q..."
                    value={formData.recipient}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('recipient', e.target.value)}
                    error={errors.recipient}
                    helpText="Tranches are paid to this P2PKH address. The recipient can later hand the grant off via Transfer if transferable is enabled."
                    required
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Asset */}
          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">Asset</h3>
                <p className="text-sm text-textMuted font-mono mb-4">Pay milestones in BCH or in a CashTokens fungible token.</p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => handleChange('tokenType', 'BCH')}
                    className={`min-w-0 p-4 border-2 rounded-xl transition-all text-left ${
                      formData.tokenType === 'BCH'
                        ? 'border-accent bg-accent/5 shadow-sm'
                        : 'border-border hover:border-accent/40'
                    }`}
                  >
                    <div className="font-display font-bold text-lg text-textPrimary mb-1">Bitcoin Cash</div>
                    <div className="text-sm text-textMuted font-mono">Pay milestone tranches in BCH satoshis.</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleChange('tokenType', 'FUNGIBLE_TOKEN')}
                    className={`min-w-0 p-4 border-2 rounded-xl transition-all text-left ${
                      formData.tokenType === 'FUNGIBLE_TOKEN'
                        ? 'border-accent bg-accent/5 shadow-sm'
                        : 'border-border hover:border-accent/40'
                    }`}
                  >
                    <div className="font-display font-bold text-lg text-textPrimary mb-1">CashTokens</div>
                    <div className="text-sm text-textMuted font-mono">Pay milestone tranches in a fungible token.</div>
                  </button>
                </div>

                {formData.tokenType === 'FUNGIBLE_TOKEN' && (
                  <div className="mt-4">
                    <Input
                      label="Token category ID"
                      placeholder="64-char hex (genesis transaction id)"
                      value={formData.tokenCategory}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('tokenCategory', e.target.value)}
                      error={errors.tokenCategory}
                      helpText="The funding wallet must already control a minting NFT for this category."
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Milestone economics */}
          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Target className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">Milestone economics</h3>
                <p className="text-sm text-textMuted font-mono mb-4">
                  Tranches are fixed by the covenant - every release pays exactly `amount per milestone`.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label={`Amount per milestone (${tokenLabel})`}
                    type="number"
                    step={formData.tokenType === 'BCH' ? '0.00000001' : '1'}
                    min="0"
                    placeholder={formData.tokenType === 'BCH' ? '0.10' : '1000'}
                    value={formData.amountPerMilestone}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('amountPerMilestone', e.target.value)}
                    error={errors.amountPerMilestone}
                    required
                  />
                  <Input
                    label="Number of milestones"
                    type="number"
                    step="1"
                    min="1"
                    max="255"
                    placeholder="3"
                    value={formData.milestonesTotal}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const next = e.target.value;
                      handleChange('milestonesTotal', next);
                      const count = toFiniteInt(next);
                      if (count > 0 && count <= 255) {
                        setMilestones((prev) => {
                          if (prev.length === count) return prev;
                          if (prev.length < count) {
                            const additions: MilestoneDraft[] = [];
                            for (let i = prev.length + 1; i <= count; i += 1) {
                              additions.push(createMilestoneDraft(i));
                            }
                            return [...prev, ...additions];
                          }
                          return prev.slice(0, count);
                        });
                      }
                    }}
                    error={errors.milestonesTotal}
                    helpText="1 to 255 milestones supported on-chain."
                    required
                  />
                </div>

                <div className="mt-4 p-4 rounded-lg border border-border bg-surfaceAlt">
                  <p className="text-xs font-mono uppercase tracking-wide text-textMuted mb-1">Total locked at funding</p>
                  <p className="text-lg md:text-xl font-display font-bold text-textPrimary">
                    {totalAmountValue.toFixed(formData.tokenType === 'BCH' ? 4 : 0)} {tokenLabel}
                  </p>
                  <p className="text-xs font-mono text-textMuted mt-1">
                    {milestonesTotalNumber} × {amountPerMilestoneNumber} {tokenLabel}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Milestone definitions */}
          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                <ListChecks className="w-6 h-6 text-secondary" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h3 className="text-xl font-display font-bold text-textPrimary">Milestone plan</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addMilestone}
                    disabled={milestones.length >= 255}
                    className="flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Add milestone
                  </Button>
                </div>
                <p className="text-sm text-textMuted font-mono mb-4">
                  Describe what each milestone delivers. Titles and descriptions are stored off-chain; on-chain only the index matters.
                </p>

                {errors.milestones && (
                  <div className="mb-3 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm text-primary font-mono">
                    {errors.milestones}
                  </div>
                )}

                <div className="space-y-3">
                  {milestones.map((milestone, index) => (
                    <div key={milestone.id} className="rounded-xl border border-border bg-surface p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="text-xs font-mono uppercase tracking-wide text-textMuted">
                            Milestone {index + 1}
                          </p>
                          <p className="text-xs font-mono text-textMuted">
                            Releases {amountPerMilestoneNumber.toFixed(formData.tokenType === 'BCH' ? 4 : 0)} {tokenLabel}
                          </p>
                        </div>
                        {milestones.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMilestone(milestone.id)}
                            className="inline-flex items-center gap-1 text-xs font-mono text-textMuted hover:text-primary transition-colors"
                            aria-label={`Remove milestone ${index + 1}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        <Input
                          label="Title"
                          placeholder={`Milestone ${index + 1}`}
                          value={milestone.title}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            handleMilestoneChange(milestone.id, 'title', e.target.value)
                          }
                        />
                        <Textarea
                          label="Description (optional)"
                          placeholder="Acceptance criteria, deliverables, due date..."
                          value={milestone.description}
                          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                            handleMilestoneChange(milestone.id, 'description', e.target.value)
                          }
                          rows={2}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Flags */}
          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4">Controls</h3>

            <div className="space-y-4">
              <ToggleRow
                label="Cancelable"
                description={
                  formData.cancelable
                    ? 'Creator can pause or cancel the grant. Unreleased funds refund to the authority address.'
                    : 'Once funded, the grant runs to completion. No pause, no cancel.'
                }
                value={formData.cancelable}
                onChange={(next) => handleChange('cancelable', next)}
              />
              <ToggleRow
                label="Transferable"
                description={
                  formData.transferable
                    ? 'Current recipient can hand the grant to a new recipient at any time.'
                    : 'Recipient is fixed at creation. No transfer path.'
                }
                value={formData.transferable}
                onChange={(next) => handleChange('transferable', next)}
              />
            </div>
          </Card>

          {/* Summary */}
          <Card padding="lg" className="border-accent/30 bg-accent/5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Users className="w-6 h-6 text-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-display font-bold text-textPrimary mb-3">Review</h4>
                <div className="space-y-1 text-sm font-mono text-textMuted">
                  <p>
                    <span className="text-textPrimary font-bold">{formData.title || '[Grant title]'}</span>
                  </p>
                  <p>
                    Asset:{' '}
                    <span className="text-textPrimary font-bold">
                      {formData.tokenType === 'BCH' ? 'BCH' : 'CashTokens'}
                    </span>
                    {formData.tokenType === 'FUNGIBLE_TOKEN' && formData.tokenCategory && (
                      <span className="text-textPrimary"> · {formData.tokenCategory.slice(0, 10)}…{formData.tokenCategory.slice(-8)}</span>
                    )}
                  </p>
                  <p>
                    Schedule:{' '}
                    <span className="text-textPrimary font-bold">
                      {milestonesTotalNumber} milestone{milestonesTotalNumber === 1 ? '' : 's'}
                    </span>{' '}
                    × {amountPerMilestoneNumber.toFixed(formData.tokenType === 'BCH' ? 4 : 0)} {tokenLabel}
                  </p>
                  <p>
                    Total locked at funding:{' '}
                    <span className="text-textPrimary font-bold">
                      {totalAmountValue.toFixed(formData.tokenType === 'BCH' ? 4 : 0)} {tokenLabel}
                    </span>
                  </p>
                  <p className="pt-2 border-t border-border/40">
                    {formData.cancelable ? (
                      <span className="text-accent">Cancelable</span>
                    ) : (
                      <span className="text-textMuted">Non-cancelable</span>
                    )}
                    {' · '}
                    {formData.transferable ? (
                      <span className="text-accent">Transferable</span>
                    ) : (
                      <span className="text-textMuted">Non-transferable</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {errors.recipient && (
            <Card padding="lg" className="border border-primary/40 bg-primary/5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                <p className="text-sm text-primary font-mono">{errors.recipient}</p>
              </div>
            </Card>
          )}

          <div className="flex flex-col-reverse gap-4 pt-4 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/grants')}
              disabled={isCreating}
              className="w-full flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating} loading={isCreating} className="w-full flex-1">
              {isCreating ? 'Creating Grant…' : 'Create Grant'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  value: boolean;
  onChange: (next: boolean) => void;
}

function ToggleRow({ label, description, value, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <h4 className="text-lg font-display font-bold text-textPrimary">{label}</h4>
        <p className="text-sm text-textMuted font-mono">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
          value ? 'bg-accent' : 'bg-border'
        }`}
        aria-pressed={value}
        aria-label={label}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
