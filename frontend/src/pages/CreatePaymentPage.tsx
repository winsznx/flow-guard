import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { useWallet } from '../hooks/useWallet';
import { authFetch } from '../utils/auth';
import { ChevronLeft, Repeat, Calendar, DollarSign, AlertCircle } from 'lucide-react';

type PaymentInterval = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';

interface FormData {
  recipient: string;
  recipientName: string;
  tokenType: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  amountPerPeriod: string;
  interval: PaymentInterval;
  startDate: string;
  endDate: string;
  pausable: boolean;
  description: string;
}

export default function CreatePaymentPage() {
  const navigate = useNavigate();
  const wallet = useWallet();

  const [formData, setFormData] = useState<FormData>({
    recipient: '',
    recipientName: '',
    tokenType: 'BCH',
    amountPerPeriod: '',
    interval: 'MONTHLY',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    pausable: true,
    description: '',
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
    const isValidCashAddr = (addr: string) =>
      addr.startsWith('bitcoincash:') || addr.startsWith('bchtest:');

    if (!formData.recipient) {
      newErrors.recipient = 'Recipient address is required';
    } else if (!isValidCashAddr(formData.recipient)) {
      newErrors.recipient = 'Must be a valid BCH address (bitcoincash:... or bchtest:...)';
    }

    if (formData.tokenType === 'FUNGIBLE_TOKEN' && !formData.tokenCategory) {
      newErrors.tokenCategory = 'Token category ID is required for CashTokens';
    }

    if (!formData.amountPerPeriod || parseFloat(formData.amountPerPeriod) <= 0) {
      newErrors.amountPerPeriod = 'Amount must be greater than 0';
    }

    if (formData.endDate && new Date(formData.endDate) <= new Date(formData.startDate)) {
      newErrors.endDate = 'End date must be after start date';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;
    if (!wallet.isConnected || !wallet.address) {
      setErrors({ recipient: 'Please connect your wallet first.' });
      return;
    }
    if (!wallet.signCashScriptTransaction) {
      setErrors({ recipient: 'Connected wallet does not support CashScript transactions.' });
      return;
    }

    setIsCreating(true);

    try {
      const payload = {
        sender: wallet.address,
        recipient: formData.recipient,
        recipientName: formData.recipientName || undefined,
        tokenType: formData.tokenType,
        tokenCategory: formData.tokenCategory,
        amountPerPeriod: parseFloat(formData.amountPerPeriod),
        interval: formData.interval,
        startDate: Math.floor(new Date(formData.startDate).getTime() / 1000),
        endDate: formData.endDate ? Math.floor(new Date(formData.endDate).getTime() / 1000) : undefined,
        pausable: formData.pausable,
        description: formData.description,
      };

      const response = await authFetch('/api/payments/create', {
        wallet,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create payment');
      }

      const result = await response.json();
      navigate(`/payments/${result.payment.id}`, { state: { freshCreate: true } });
    } catch (error: any) {
      console.error('Failed to create payment:', error);
      setErrors({ recipient: error.message || 'Failed to create payment. Please try again.' });
    } finally {
      setIsCreating(false);
    }
  };

  const getIntervalLabel = (interval: PaymentInterval) => {
    switch (interval) {
      case 'DAILY': return 'day';
      case 'WEEKLY': return 'week';
      case 'BIWEEKLY': return '2 weeks';
      case 'MONTHLY': return 'month';
      case 'YEARLY': return 'year';
    }
  };

  const INTERVAL_SECONDS: Record<PaymentInterval, number> = {
    DAILY: 86400,
    WEEKLY: 604800,
    BIWEEKLY: 1209600,
    MONTHLY: 2592000,
    YEARLY: 31536000,
  };

  const getEstimatedPeriods = (): number => {
    if (formData.endDate && formData.startDate) {
      const start = new Date(formData.startDate).getTime() / 1000;
      const end = new Date(formData.endDate).getTime() / 1000;
      const intervalSec = INTERVAL_SECONDS[formData.interval];
      if (end > start && intervalSec > 0) {
        return Math.max(1, Math.ceil((end - start) / intervalSec));
      }
    }
    return 12;
  };

  const estimatedPeriods = getEstimatedPeriods();
  const amountNum = parseFloat(formData.amountPerPeriod) || 0;
  const totalDeposit = amountNum * estimatedPeriods;

  return (
    <div className="px-4 py-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/payments')}
            className="inline-flex items-center gap-2 text-primary hover:text-primaryHover font-mono mb-4 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Payments
          </button>
          <h1 className="text-3xl font-display font-bold text-textPrimary mb-2 sm:text-4xl lg:text-5xl">
            Create Recurring Payment
          </h1>
          <p className="text-textMuted font-mono">
            Set up automatic recurring payments for salaries, subscriptions, or allowances
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Token Type */}
          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">Token Type</h3>
                <p className="text-sm text-textMuted font-mono mb-4">Choose the asset for recurring payments</p>

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
                    <div className="text-sm text-textMuted font-mono">Pay in BCH</div>
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
                    <div className="text-sm text-textMuted font-mono">Pay in tokens</div>
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

          {/* Recipient */}
          <Card padding="lg">
            <div className="space-y-4">
              <Input
                label="Recipient Address"
                placeholder="bitcoincash:qr2x3uy3..."
                value={formData.recipient}
                onChange={(e) => handleChange('recipient', e.target.value)}
                error={errors.recipient}
                helpText="The BCH address that will receive recurring payments"
                required
              />
              <Input
                label="Recipient Name (Optional)"
                placeholder="e.g., John Doe"
                value={formData.recipientName}
                onChange={(e) => handleChange('recipientName', e.target.value)}
                helpText="Display name for easier tracking"
              />
            </div>
          </Card>

          {/* Payment Schedule */}
          <Card padding="lg">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Repeat className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">Payment Schedule</h3>
                <p className="text-sm text-textMuted font-mono mb-4">Define amount and frequency</p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label={`Amount per Payment (${formData.tokenType === 'BCH' ? 'BCH' : 'Tokens'})`}
                    type="number"
                    step="0.00000001"
                    placeholder="1.5"
                    value={formData.amountPerPeriod}
                    onChange={(e) => handleChange('amountPerPeriod', e.target.value)}
                    error={errors.amountPerPeriod}
                    required
                  />

                  <Select
                    label="Payment Interval"
                    value={formData.interval}
                    onChange={(e) => handleChange('interval', e.target.value as PaymentInterval)}
                    options={[
                      { value: 'DAILY', label: 'Daily' },
                      { value: 'WEEKLY', label: 'Weekly' },
                      { value: 'BIWEEKLY', label: 'Bi-weekly (every 2 weeks)' },
                      { value: 'MONTHLY', label: 'Monthly' },
                      { value: 'YEARLY', label: 'Yearly' },
                    ]}
                  />
                </div>
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
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">Duration</h3>
                <p className="text-sm text-textMuted font-mono mb-4">Set start and end dates</p>

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
                    helpText="Leave empty for ongoing payments"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Pausable Toggle */}
          <Card padding="lg">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-display font-bold text-textPrimary">Pausable Payments</h3>
                  <button
                    type="button"
                    onClick={() => handleChange('pausable', !formData.pausable)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.pausable ? 'bg-accent' : 'bg-border'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.pausable ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-sm text-textMuted font-mono">
                  {formData.pausable
                    ? 'You can pause and resume this payment stream at any time'
                    : 'Payment stream cannot be paused once started'}
                </p>
              </div>
            </div>
          </Card>

          {/* Description */}
          <Card padding="lg">
            <Textarea
              label="Description (Optional)"
              placeholder="e.g., 'Monthly salary for contractor John Doe' or 'Annual subscription for service XYZ'"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
              helpText="Add context about this recurring payment"
            />
          </Card>

          {/* Summary Box */}
          <Card padding="lg" className="bg-accent/5 border-accent/20">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
              <div>
                <h4 className="font-display font-bold text-textPrimary mb-2">Payment Summary</h4>
                <div className="space-y-1 text-sm font-mono text-textMuted">
                  <p>
                    <span className="text-textPrimary font-bold">{formData.amountPerPeriod || '0'} {formData.tokenType === 'BCH' ? 'BCH' : 'Tokens'}</span> will be paid per{' '}
                    <span className="text-textPrimary font-bold">{getIntervalLabel(formData.interval)}</span>
                  </p>
                  <p>
                    To <span className="text-textPrimary font-bold">{formData.recipientName || formData.recipient || '[recipient]'}</span>
                  </p>
                  <p>
                    Starting <span className="text-textPrimary font-bold">{formData.startDate || '[date]'}</span>
                    {formData.endDate && (
                      <> until <span className="text-textPrimary font-bold">{formData.endDate}</span> ({estimatedPeriods} payment{estimatedPeriods !== 1 ? 's' : ''})</>
                    )}
                    {!formData.endDate && <> - no end date (funds {estimatedPeriods} periods upfront)</>}
                  </p>
                  <p className="pt-2 border-t border-border/40 text-base">
                    Wallet deposit required:{' '}
                    <span className="text-textPrimary font-bold">
                      {amountNum > 0 ? totalDeposit.toFixed(8) : '0'} {formData.tokenType === 'BCH' ? 'BCH' : 'Tokens'}
                    </span>
                    <span className="text-xs ml-1">({estimatedPeriods} × {formData.amountPerPeriod || '0'})</span>
                  </p>
                  <p className="pt-1">
                    {formData.pausable ? (
                      <span className="text-accent">✓ Can be paused/resumed at any time</span>
                    ) : (
                      <span className="text-error">✗ Cannot be paused once started</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse gap-4 pt-4 sm:flex-row">
            <Button type="button" variant="secondary" onClick={() => navigate('/payments')} disabled={isCreating} className="w-full flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating} className="w-full flex-1">
              {isCreating ? 'Creating Payment...' : 'Create Recurring Payment'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
