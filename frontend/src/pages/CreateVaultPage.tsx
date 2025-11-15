import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export default function CreateVaultPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    depositAmount: '',
    spendingCap: '',
    approvalThreshold: '2',
    signers: ['', '', ''],
    cycleDuration: '2592000', // 30 days in seconds
    unlockAmount: '',
    isPublic: false, // Default to private
  });

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSignerChange = (index: number, value: string) => {
    const newSigners = [...formData.signers];
    newSigners[index] = value;
    setFormData(prev => ({ ...prev, signers: newSigners }));
  };

  const handleNext = () => {
    if (step < 6) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = () => {
    // TODO: Submit vault creation
    console.log('Creating vault:', formData);
    // Navigate to vault detail page after creation
    // navigate(`/vaults/${newVaultId}`);
  };

  return (
    <div className="section-spacious">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link to="/vaults" className="text-[--color-primary] hover:underline">
            ← Back to Vaults
          </Link>
        </div>

        <h1 className="text-4xl font-bold mb-8 section-bold">Create Vault</h1>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex justify-between">
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <div key={s} className="flex-1 flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    s <= step ? 'bg-[--color-primary] text-white' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {s}
                </div>
                {s < 6 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      s < step ? 'bg-[--color-primary]' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <Card padding="lg">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold">Basic Information</h2>
              <div>
                <label className="block text-sm font-medium mb-2">Vault Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                  placeholder="e.g., DAO Treasury"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                  rows={4}
                  placeholder="Describe the purpose of this vault..."
                />
              </div>
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isPublic}
                    onChange={(e) => handleInputChange('isPublic', e.target.checked)}
                    className="w-5 h-5 text-green-500 border-gray-300 rounded focus:ring-2 focus:ring-green-500"
                  />
                  <div>
                    <span className="block text-sm font-medium">Make vault public</span>
                    <span className="block text-xs text-gray-600 mt-1">
                      Public vaults can be viewed by anyone, but only signers can create proposals and approve them.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Step 2: Deposit Amount */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold">Deposit Amount</h2>
              <div>
                <label className="block text-sm font-medium mb-2">Total Deposit (BCH)</label>
                <input
                  type="number"
                  value={formData.depositAmount}
                  onChange={(e) => handleInputChange('depositAmount', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                  placeholder="0.00"
                  step="0.01"
                />
                <p className="mt-2 text-sm text-gray-600">
                  This is the total amount of BCH you'll deposit into the vault.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Unlock Schedule */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold">Unlock Schedule</h2>
              <div>
                <label className="block text-sm font-medium mb-2">Cycle Duration (seconds)</label>
                <select
                  value={formData.cycleDuration}
                  onChange={(e) => handleInputChange('cycleDuration', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                >
                  <option value="604800">Weekly (7 days)</option>
                  <option value="2592000">Monthly (30 days)</option>
                  <option value="7776000">Quarterly (90 days)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Unlock Amount per Cycle (BCH)</label>
                <input
                  type="number"
                  value={formData.unlockAmount}
                  onChange={(e) => handleInputChange('unlockAmount', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                  placeholder="0.00"
                  step="0.01"
                />
              </div>
            </div>
          )}

          {/* Step 4: Signers and Threshold */}
          {step === 4 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold">Signers and Approval Threshold</h2>
              <div>
                <label className="block text-sm font-medium mb-2">Approval Threshold</label>
                <input
                  type="number"
                  value={formData.approvalThreshold}
                  onChange={(e) => handleInputChange('approvalThreshold', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                  min="1"
                  max="3"
                />
                <p className="mt-2 text-sm text-gray-600">
                  Number of signers required to approve a proposal (e.g., 2-of-3)
                </p>
              </div>
              <div className="space-y-4">
                <label className="block text-sm font-medium">Signer Addresses</label>
                {formData.signers.map((signer, index) => (
                  <input
                    key={index}
                    type="text"
                    value={signer}
                    onChange={(e) => handleSignerChange(index, e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                    placeholder={`Signer ${index + 1} address`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Spending Cap */}
          {step === 5 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold">Spending Cap (Optional)</h2>
              <div>
                <label className="block text-sm font-medium mb-2">Maximum Spending per Period (BCH)</label>
                <input
                  type="number"
                  value={formData.spendingCap}
                  onChange={(e) => handleInputChange('spendingCap', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
                  placeholder="Leave empty for no cap"
                  step="0.01"
                />
                <p className="mt-2 text-sm text-gray-600">
                  Optional: Set a maximum amount that can be spent per unlock period.
                </p>
              </div>
            </div>
          )}

          {/* Step 6: Review */}
          {step === 6 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold">Review and Confirm</h2>
              <div className="space-y-4">
                <div>
                  <span className="text-sm text-gray-600">Vault Name:</span>
                  <p className="font-semibold">{formData.name || 'Not set'}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Deposit Amount:</span>
                  <p className="font-semibold">{formData.depositAmount || '0'} BCH</p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Unlock Schedule:</span>
                  <p className="font-semibold">
                    {formData.unlockAmount || '0'} BCH every{' '}
                    {formData.cycleDuration === '604800'
                      ? 'week'
                      : formData.cycleDuration === '2592000'
                      ? 'month'
                      : 'quarter'}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Approval Threshold:</span>
                  <p className="font-semibold">
                    {formData.approvalThreshold}-of-{formData.signers.filter(s => s).length}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Spending Cap:</span>
                  <p className="font-semibold">
                    {formData.spendingCap || 'No cap'}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Visibility:</span>
                  <p className="font-semibold">
                    {formData.isPublic ? 'Public' : 'Private'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
            {step > 1 ? (
              <Button variant="outline" onClick={handleBack}>
                Back
              </Button>
            ) : (
              <div />
            )}
            {step < 6 ? (
              <Button onClick={handleNext}>Next</Button>
            ) : (
              <Button onClick={handleSubmit}>Create Vault</Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

