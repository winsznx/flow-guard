import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useWallet } from '../hooks/useWallet';
import { createBudgetPlan, fetchVaults } from '../utils/api';
import { ChevronRight, AlertCircle } from 'lucide-react';

/**
 * Create Budget Plan Page
 *
 * Multi-step form to create scheduled releases (ScheduleUTXO):
 * - Recurring releases
 * - Linear vesting
 * - Step vesting
 */

type PlanType = 'RECURRING' | 'LINEAR_VESTING' | 'STEP_VESTING';

export default function CreateBudgetPlanPage() {
  const navigate = useNavigate();
  const wallet = useWallet();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vaults, setVaults] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    planName: '',
    planType: 'RECURRING' as PlanType,
    treasuryId: '',
    recipient: '',
    recipientLabel: '',
    totalAmount: '',
    intervalSeconds: '2592000', // 30 days default
    amountPerInterval: '',
    cliffSeconds: '',
    startDate: '',
  });

  // Load vaults on mount
  useEffect(() => {
    const loadVaults = async () => {
      try {
        const data = await fetchVaults(wallet.address || undefined);
        setVaults(data.all || []);
      } catch (err) {
        console.error('Failed to load vaults:', err);
      }
    };
    loadVaults();
  }, [wallet.address]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (step < 4) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (!wallet.address) {
      setError('Please connect your wallet first');
      return;
    }

    if (!formData.treasuryId) {
      setError('Please select a treasury');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const planData = {
        planName: formData.planName || undefined,
        planType: formData.planType,
        recipient: formData.recipient,
        recipientLabel: formData.recipientLabel || undefined,
        recipientName: formData.recipientLabel || undefined,
        totalAmount: parseFloat(formData.totalAmount),
        intervalSeconds: parseInt(formData.intervalSeconds),
        amountPerInterval: parseFloat(formData.amountPerInterval),
        cliffSeconds: formData.cliffSeconds ? parseInt(formData.cliffSeconds) : 0,
        startDate: formData.startDate
          ? Math.floor(new Date(formData.startDate).getTime() / 1000)
          : undefined,
      };

      // Validate
      if (planData.totalAmount <= 0) {
        throw new Error('Total amount must be greater than 0');
      }
      if (planData.amountPerInterval <= 0) {
        throw new Error('Amount per interval must be greater than 0');
      }
      if (!planData.recipient || !planData.recipient.includes(':')) {
        throw new Error('Please enter a valid BCH address (bitcoincash: or bchtest:)');
      }

      await createBudgetPlan(formData.treasuryId, planData, wallet);

      navigate('/budgets');
    } catch (err: any) {
      setError(err.message || 'Failed to create budget plan');
      setIsSubmitting(false);
    }
  };

  const getIntervalLabel = (seconds: string) => {
    const s = parseInt(seconds);
    if (s === 604800) return 'Weekly (7 days)';
    if (s === 2592000) return 'Monthly (30 days)';
    if (s === 7776000) return 'Quarterly (90 days)';
    if (s === 31536000) return 'Yearly (365 days)';
    return `Custom (${s / 86400} days)`;
  };

  return (
    <div className="py-8">
      <div className="max-w-3xl mx-auto px-6">
        {/* Back Button */}
        <div className="mb-8">
          <Link to="/budgets" className="text-sm font-mono text-textMuted hover:text-textPrimary transition-colors">
            ← Back to Budget Plans
          </Link>
        </div>

        {/* Header */}
        <h1 className="text-4xl md:text-5xl font-display mb-8 tracking-tight text-textPrimary">
          Create Budget Plan
        </h1>

        {error && (
          <div className="mb-8 p-4 bg-error/10 border border-error/30 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-mono text-sm text-error">{error}</p>
            </div>
          </div>
        )}

        {/* Progress Steps */}
        <div className="mb-12">
          <div className="flex justify-between items-center relative">
            {/* Connecting Line */}
            <div className="absolute left-0 top-1/2 w-full h-[1px] bg-border/30 -z-10" />

            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="bg-background px-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs border transition-colors duration-300 ${
                    s <= step
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-textMuted border-border'
                  }`}
                >
                  {s}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-3 text-center">
            <span className="text-[10px] uppercase tracking-widest text-textMuted">Type</span>
            <span className="text-[10px] uppercase tracking-widest text-textMuted">Details</span>
            <span className="text-[10px] uppercase tracking-widest text-textMuted">Schedule</span>
            <span className="text-[10px] uppercase tracking-widest text-textMuted">Review</span>
          </div>
        </div>

        <Card padding="xl" className="border-border/40 shadow-sm">
          {/* Step 1: Plan Type */}
          {step === 1 && (
            <div className="space-y-8">
              <h2 className="text-2xl font-display text-textPrimary">Select Plan Type</h2>

              <div className="space-y-4">
                {/* Recurring Release */}
                <label
                  className={`block p-6 border-2 rounded-xl cursor-pointer transition-all hover:border-accent/50 ${
                    formData.planType === 'RECURRING'
                      ? 'border-accent bg-accent/5'
                      : 'border-border/40 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="planType"
                    value="RECURRING"
                    checked={formData.planType === 'RECURRING'}
                    onChange={(e) => handleInputChange('planType', e.target.value)}
                    className="sr-only"
                  />
                  <div className="flex items-start gap-4">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-1 ${
                      formData.planType === 'RECURRING'
                        ? 'border-accent'
                        : 'border-border'
                    }`}>
                      {formData.planType === 'RECURRING' && (
                        <div className="w-3 h-3 rounded-full bg-accent" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-display text-xl text-textPrimary font-semibold mb-2">
                        Recurring Release
                      </h3>
                      <p className="text-sm font-mono text-textMuted leading-relaxed">
                        Regular payments on a fixed schedule (e.g., monthly salaries, operational costs)
                      </p>
                    </div>
                  </div>
                </label>

                {/* Linear Vesting */}
                <label
                  className={`block p-6 border-2 rounded-xl cursor-pointer transition-all hover:border-accent/50 ${
                    formData.planType === 'LINEAR_VESTING'
                      ? 'border-accent bg-accent/5'
                      : 'border-border/40 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="planType"
                    value="LINEAR_VESTING"
                    checked={formData.planType === 'LINEAR_VESTING'}
                    onChange={(e) => handleInputChange('planType', e.target.value)}
                    className="sr-only"
                  />
                  <div className="flex items-start gap-4">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-1 ${
                      formData.planType === 'LINEAR_VESTING'
                        ? 'border-accent'
                        : 'border-border'
                    }`}>
                      {formData.planType === 'LINEAR_VESTING' && (
                        <div className="w-3 h-3 rounded-full bg-accent" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-display text-xl text-textPrimary font-semibold mb-2">
                        Linear Vesting
                      </h3>
                      <p className="text-sm font-mono text-textMuted leading-relaxed">
                        Gradual unlock over time with optional cliff period (e.g., team tokens, grants)
                      </p>
                    </div>
                  </div>
                </label>

                {/* Step Vesting */}
                <label
                  className={`block p-6 border-2 rounded-xl cursor-pointer transition-all hover:border-accent/50 ${
                    formData.planType === 'STEP_VESTING'
                      ? 'border-accent bg-accent/5'
                      : 'border-border/40 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="planType"
                    value="STEP_VESTING"
                    checked={formData.planType === 'STEP_VESTING'}
                    onChange={(e) => handleInputChange('planType', e.target.value)}
                    className="sr-only"
                  />
                  <div className="flex items-start gap-4">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-1 ${
                      formData.planType === 'STEP_VESTING'
                        ? 'border-accent'
                        : 'border-border'
                    }`}>
                      {formData.planType === 'STEP_VESTING' && (
                        <div className="w-3 h-3 rounded-full bg-accent" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-display text-xl text-textPrimary font-semibold mb-2">
                        Step Vesting
                      </h3>
                      <p className="text-sm font-mono text-textMuted leading-relaxed">
                        Large chunks unlocked at milestone intervals (e.g., quarterly releases)
                      </p>
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Step 2: Plan Details */}
          {step === 2 && (
            <div className="space-y-8">
              <h2 className="text-2xl font-display text-textPrimary">Plan Details</h2>

              <div>
                <label className="block text-sm font-bold uppercase tracking-wide mb-3 text-textPrimary">
                  Plan Name
                </label>
                <input
                  type="text"
                  value={formData.planName}
                  onChange={(e) => handleInputChange('planName', e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-border rounded-lg focus:outline-none focus:border-primary transition-colors font-mono text-sm"
                  placeholder="e.g., Core Dev Salary"
                />
              </div>

              <div>
                <label className="block text-sm font-bold uppercase tracking-wide mb-3 text-textPrimary">
                  Source Treasury
                </label>
                <select
                  value={formData.treasuryId}
                  onChange={(e) => handleInputChange('treasuryId', e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-border rounded-lg focus:outline-none focus:border-primary transition-colors font-mono text-sm appearance-none"
                >
                  <option value="">Select a treasury...</option>
                  {vaults.map((vault) => (
                    <option key={vault.id} value={vault.vaultId}>
                      {vault.name || vault.vaultId} - {vault.balance ? (vault.balance / 100000000).toFixed(4) : '0.00'} BCH
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-textMuted font-mono">
                  Funds will be released from this treasury
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold uppercase tracking-wide mb-3 text-textPrimary">
                  Recipient Address
                </label>
                <input
                  type="text"
                  value={formData.recipient}
                  onChange={(e) => handleInputChange('recipient', e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-border rounded-lg focus:outline-none focus:border-primary transition-colors font-mono text-sm"
                  placeholder="bitcoincash:..."
                />
              </div>

              <div>
                <label className="block text-sm font-bold uppercase tracking-wide mb-3 text-textPrimary">
                  Recipient Label (Optional)
                </label>
                <input
                  type="text"
                  value={formData.recipientLabel}
                  onChange={(e) => handleInputChange('recipientLabel', e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-border rounded-lg focus:outline-none focus:border-primary transition-colors font-mono text-sm"
                  placeholder="e.g., Operations Team"
                />
              </div>
            </div>
          )}

          {/* Step 3: Schedule Configuration */}
          {step === 3 && (
            <div className="space-y-8">
              <h2 className="text-2xl font-display text-textPrimary">Schedule Configuration</h2>

              <div>
                <label className="block text-sm font-bold uppercase tracking-wide mb-3 text-textPrimary">
                  Total Amount
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={formData.totalAmount}
                    onChange={(e) => handleInputChange('totalAmount', e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-border rounded-lg focus:outline-none focus:border-primary transition-colors font-mono text-lg"
                    placeholder="0.00"
                    step="0.01"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-textMuted font-mono text-sm">
                    BCH
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold uppercase tracking-wide mb-3 text-textPrimary">
                  Release Interval
                </label>
                <select
                  value={formData.intervalSeconds}
                  onChange={(e) => handleInputChange('intervalSeconds', e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-border rounded-lg focus:outline-none focus:border-primary transition-colors font-mono text-sm appearance-none"
                >
                  <option value="604800">Weekly (7 days)</option>
                  <option value="2592000">Monthly (30 days)</option>
                  <option value="7776000">Quarterly (90 days)</option>
                  <option value="31536000">Yearly (365 days)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold uppercase tracking-wide mb-3 text-textPrimary">
                  Amount per Release
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={formData.amountPerInterval}
                    onChange={(e) => handleInputChange('amountPerInterval', e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-border rounded-lg focus:outline-none focus:border-primary transition-colors font-mono text-lg"
                    placeholder="0.00"
                    step="0.01"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-textMuted font-mono text-sm">
                    BCH
                  </span>
                </div>
              </div>

              {formData.planType === 'LINEAR_VESTING' && (
                <div>
                  <label className="block text-sm font-bold uppercase tracking-wide mb-3 text-textPrimary">
                    Cliff Period (Optional)
                  </label>
                  <select
                    value={formData.cliffSeconds}
                    onChange={(e) => handleInputChange('cliffSeconds', e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-border rounded-lg focus:outline-none focus:border-primary transition-colors font-mono text-sm appearance-none"
                  >
                    <option value="">No cliff</option>
                    <option value="2592000">1 month</option>
                    <option value="7776000">3 months</option>
                    <option value="15552000">6 months</option>
                    <option value="31536000">1 year</option>
                  </select>
                  <p className="mt-2 text-xs text-textMuted font-mono">
                    No funds unlock until cliff period ends
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Review & Submit */}
          {step === 4 && (
            <div className="space-y-8">
              <h2 className="text-2xl font-display text-textPrimary">Review Budget Plan</h2>

              <div className="bg-surfaceAlt rounded-lg p-6 border border-border/40 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wider font-mono text-textMuted mb-1">
                      Plan Type
                    </div>
                    <div className="text-sm font-semibold text-textPrimary">
                      {formData.planType === 'RECURRING' && 'Recurring Release'}
                      {formData.planType === 'LINEAR_VESTING' && 'Linear Vesting'}
                      {formData.planType === 'STEP_VESTING' && 'Step Vesting'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider font-mono text-textMuted mb-1">
                      Plan Name
                    </div>
                    <div className="text-sm font-semibold text-textPrimary">
                      {formData.planName || 'Unnamed Plan'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider font-mono text-textMuted mb-1">
                      Total Amount
                    </div>
                    <div className="text-sm font-semibold text-textPrimary">
                      {formData.totalAmount || '0'} BCH
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider font-mono text-textMuted mb-1">
                      Interval
                    </div>
                    <div className="text-sm font-semibold text-textPrimary">
                      {getIntervalLabel(formData.intervalSeconds)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider font-mono text-textMuted mb-1">
                      Per Release
                    </div>
                    <div className="text-sm font-semibold text-textPrimary">
                      {formData.amountPerInterval || '0'} BCH
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider font-mono text-textMuted mb-1">
                      Recipient
                    </div>
                    <div className="text-sm font-semibold text-textPrimary truncate font-mono">
                      {formData.recipient || 'Not set'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-accent/5 border border-accent/30 rounded-lg p-4">
                <p className="text-xs font-mono text-textMuted leading-relaxed">
                  <strong className="text-textPrimary">Note:</strong> Budget plans are enforced by smart contracts.
                  Once created, the schedule cannot be modified. Make sure all details are correct.
                </p>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-12 pt-8 border-t border-border/40">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={step === 1}
            >
              Back
            </Button>

            {step < 4 ? (
              <Button
                onClick={handleNext}
                className="gap-2"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating...' : 'Create Budget Plan'}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
