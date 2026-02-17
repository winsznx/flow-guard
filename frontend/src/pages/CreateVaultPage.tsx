import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useWallet } from '../hooks/useWallet';
import { useTransactionConfirm } from '../hooks/useTransactionConfirm';
import { createVault, updateVaultBalance } from '../utils/api';
import { depositToVault } from '../utils/blockchain';

export default function CreateVaultPage() {
  const navigate = useNavigate();
  const wallet = useWallet();
  const { confirmTransaction, TransactionConfirmModal } = useTransactionConfirm();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [depositStatus, setDepositStatus] = useState<'idle' | 'creating' | 'depositing' | 'updating' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txid, setTxid] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    depositAmount: '',
    spendingCap: '',
    approvalThreshold: '2',
    signers: ['', '', ''],
    signerPubkeys: ['', '', ''], // NEW: Public keys for blockchain deployment
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

  const handlePubkeyChange = (index: number, value: string) => {
    const newPubkeys = [...formData.signerPubkeys];
    newPubkeys[index] = value;
    setFormData(prev => ({ ...prev, signerPubkeys: newPubkeys }));
  };

  // Auto-fill creator's address and public key in first signer slot
  const fillCreatorInfo = () => {
    if (wallet.address && wallet.publicKey) {
      const newSigners = [...formData.signers];
      const newPubkeys = [...formData.signerPubkeys];
      newSigners[0] = wallet.address;
      newPubkeys[0] = wallet.publicKey;
      setFormData(prev => ({
        ...prev,
        signers: newSigners,
        signerPubkeys: newPubkeys
      }));
    }
  };

  const handleNext = () => {
    if (step < 6) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (!wallet.address) {
      setError('Please connect your wallet first');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setDepositStatus('creating');
    setTxid(null);

    try {
      // Filter out empty signers and public keys
      const validSigners = formData.signers.filter(s => s.trim() !== '');
      const validPubkeys = formData.signerPubkeys.filter(pk => pk.trim() !== '');

      // Prepare vault data
      const vaultData = {
        name: formData.name || undefined,
        description: formData.description || undefined,
        totalDeposit: parseFloat(formData.depositAmount),
        spendingCap: formData.spendingCap ? parseFloat(formData.spendingCap) : 0,
        approvalThreshold: parseInt(formData.approvalThreshold),
        signers: validSigners,
        signerPubkeys: validPubkeys,
        cycleDuration: parseInt(formData.cycleDuration),
        unlockAmount: parseFloat(formData.unlockAmount),
        isPublic: formData.isPublic,
      };

      // Validate data
      if (vaultData.totalDeposit <= 0) {
        throw new Error('Deposit amount must be greater than 0');
      }
      if (vaultData.unlockAmount <= 0) {
        throw new Error('Unlock amount must be greater than 0');
      }

      // Validate deposit amount is reasonable
      // For chipnet, max 100 BCH is reasonable; for mainnet, max 1000 BCH
      const network = wallet.network || 'chipnet';
      const maxDeposit = network === 'mainnet' ? 1000 : 100;

      if (vaultData.totalDeposit > maxDeposit) {
        throw new Error(
          `Deposit amount (${vaultData.totalDeposit} BCH) exceeds the maximum allowed for ${network} (${maxDeposit} BCH). ` +
          `If you intended to enter satoshis, please convert: ${vaultData.totalDeposit} satoshis = ${(vaultData.totalDeposit / 100000000).toFixed(8)} BCH`
        );
      }

      // Warn if amount seems suspiciously large (whole number > 1000 might be satoshis)
      if (vaultData.totalDeposit >= 1000 && vaultData.totalDeposit === Math.floor(vaultData.totalDeposit)) {
        const possibleSatoshis = vaultData.totalDeposit;
        const possibleBCH = possibleSatoshis / 100000000;
        if (possibleBCH < maxDeposit) {
          throw new Error(
            `The deposit amount (${vaultData.totalDeposit}) seems unusually large. ` +
            `Did you mean to enter ${possibleBCH.toFixed(8)} BCH instead? ` +
            `If you entered satoshis, please convert to BCH (divide by 100,000,000).`
          );
        }
      }

      if (validSigners.length !== 3) {
        throw new Error('Exactly 3 signers are required for blockchain deployment');
      }
      if (validPubkeys.length !== 3) {
        throw new Error('Exactly 3 signer public keys are required for blockchain deployment');
      }
      if (validSigners.length < vaultData.approvalThreshold) {
        throw new Error('Number of signers must be at least the approval threshold');
      }

      // Validate wallet balance before proceeding
      if (wallet.balance) {
        const walletBalanceBCH = wallet.balance.bch || 0;
        const requiredAmount = vaultData.totalDeposit + 0.0001; // Add small buffer for fees

        if (walletBalanceBCH < requiredAmount) {
          throw new Error(
            `Insufficient balance. You have ${walletBalanceBCH.toFixed(4)} BCH, but need ${requiredAmount.toFixed(4)} BCH (including fees). ` +
            `Please check that you entered the deposit amount in BCH, not satoshis. ` +
            `If you entered satoshis, convert to BCH by dividing by 100,000,000.`
          );
        }
      }

      // Step 1: Create vault (deploy contract)
      setDepositStatus('creating');
      const newVault = await createVault(vaultData, wallet.address);

      if (!newVault.contractAddress) {
        throw new Error('Vault created but contract address not available. Please try again.');
      }

      // Step 2: Deposit funds to vault contract
      if (vaultData.totalDeposit > 0) {
        setDepositStatus('depositing');

        try {
          // Deposit BCH to the contract address
          // For mainnet.cash wallets, show confirmation dialog
          const depositTxid = await depositToVault(
            wallet,
            newVault.contractAddress,
            vaultData.totalDeposit,
            wallet.walletType === 'mainnet' ? confirmTransaction : undefined
          );

          setTxid(depositTxid);

          // Step 3: Update vault balance in database
          setDepositStatus('updating');
          await updateVaultBalance(
            newVault.id,
            depositTxid,
            vaultData.totalDeposit,
            wallet.address
          );

          setDepositStatus('success');

          // Small delay to show success message
          await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (depositError: any) {
          // If deposit fails, vault is still created but not funded
          // User can deposit later from vault detail page
          setDepositStatus('error');
          throw new Error(
            `Vault created successfully, but deposit failed: ${depositError.message}. ` +
            `You can deposit funds later from the vault detail page.`
          );
        }
      } else {
        setDepositStatus('success');
      }

      // Navigate to vault detail page
      navigate(`/vaults/${newVault.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create vault');
      setDepositStatus('error');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <TransactionConfirmModal />
      <div className="py-8">
        <div className="max-w-3xl mx-auto px-6">
          <div className="mb-8">
            <Link to="/vaults" className="text-sm font-mono text-textMuted hover:text-textPrimary transition-colors">
              ← Back to Vaults
            </Link>
          </div>

          <h1 className="text-4xl md:text-5xl font-display mb-8 tracking-tight">Create Vault</h1>

          {/* Error Display */}
          {error && (
            <div className="mb-8 p-4 bg-error/5 border border-error/20 rounded-lg">
              <p className="text-error font-mono text-sm">{error}</p>
            </div>
          )}

          {/* Deposit Status Display */}
          {isSubmitting && depositStatus !== 'idle' && (
            <div className="mb-8 p-6 bg-accent/5 border border-accent/20 rounded-lg">
              {depositStatus === 'creating' && (
                <div className="flex items-center gap-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-accent border-t-transparent"></div>
                  <p className="text-textPrimary font-mono text-sm">
                    Creating vault and deploying contract...
                  </p>
                </div>
              )}
              {depositStatus === 'depositing' && (
                <div className="flex items-center gap-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-accent border-t-transparent"></div>
                  <p className="text-textPrimary font-mono text-sm">
                    Depositing {formData.depositAmount} BCH to vault... Please confirm in wallet.
                  </p>
                </div>
              )}
              {depositStatus === 'updating' && (
                <div className="flex items-center gap-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-accent border-t-transparent"></div>
                  <p className="text-textPrimary font-mono text-sm">
                    Updating vault balance...
                  </p>
                </div>
              )}
              {depositStatus === 'success' && (
                <div className="flex items-center gap-4">
                  <div className="h-5 w-5 rounded-full bg-accent flex items-center justify-center">
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="text-textPrimary font-mono text-sm">
                    <p>Vault created and funded successfully!</p>
                    {txid && (
                      <span className="block text-xs mt-1 text-textMuted">
                        TX: <a
                          href={`https://chipnet.imaginary.cash/tx/${txid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-accent"
                        >
                          {txid.substring(0, 16)}...
                        </a>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Progress Steps */}
          <div className="mb-12">
            <div className="flex justify-between items-center relative">
              {/* Connecting Line */}
              <div className="absolute left-0 top-1/2 w-full h-[1px] bg-border/30 -z-10" />

              {[1, 2, 3, 4, 5, 6].map((s) => (
                <div key={s} className="bg-background px-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs border transition-colors duration-300 ${s <= step
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-textMuted border-border'
                      }`}
                  >
                    {s}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 px-1">
              <span className="text-[10px] uppercase tracking-widest text-textMuted">Basics</span>
              <span className="text-[10px] uppercase tracking-widest text-textMuted">Funds</span>
              <span className="text-[10px] uppercase tracking-widest text-textMuted">Schedule</span>
              <span className="text-[10px] uppercase tracking-widest text-textMuted">Signers</span>
              <span className="text-[10px] uppercase tracking-widest text-textMuted">Cap</span>
              <span className="text-[10px] uppercase tracking-widest text-textMuted">Review</span>
            </div>
          </div>

          <Card padding="xl" className="border-border/40 shadow-sm">
            {/* Step 1: Basic Info */}
            {step === 1 && (
              <div className="space-y-8">
                <h2 className="text-2xl font-display">Basic Information</h2>
                <div>
                  <label className="block text-sm font-bold uppercase tracking-wide mb-3">Vault Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-border rounded-lg focus:outline-none focus:border-primary transition-colors font-mono text-sm"
                    placeholder="e.g., DAO Treasury"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold uppercase tracking-wide mb-3">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-border rounded-lg focus:outline-none focus:border-primary transition-colors font-mono text-sm"
                    rows={4}
                    placeholder="Describe the purpose of this vault..."
                  />
                </div>
                <div>
                  <label className="flex items-center gap-4 cursor-pointer p-4 border border-border rounded-lg hover:bg-surfaceAlt transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.isPublic}
                      onChange={(e) => handleInputChange('isPublic', e.target.checked)}
                      className="w-5 h-5 text-accent border-border rounded focus:ring-accent"
                    />
                    <div>
                      <span className="block text-sm font-bold uppercase tracking-wide">Make vault public</span>
                      <span className="block text-xs text-textMuted mt-1">
                        Public vaults can be viewed by anyone, but only signers can create proposals and approve them.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Step 2: Deposit Amount */}
            {step === 2 && (
              <div className="space-y-8">
                <h2 className="text-2xl font-display">Deposit Amount</h2>
                <div>
                  <label className="block text-sm font-bold uppercase tracking-wide mb-3">Total Deposit (BCH)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formData.depositAmount}
                      onChange={(e) => handleInputChange('depositAmount', e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-border rounded-lg focus:outline-none focus:border-primary transition-colors font-mono text-lg"
                      placeholder="0.00"
                      step="0.01"
                      min="0.00001"
                      max={wallet.network === 'mainnet' ? 1000 : 100}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-textMuted font-mono text-sm">BCH</span>
                  </div>
                  <p className="mt-3 text-xs text-textMuted font-mono">
                    This is the total amount of BCH you'll deposit into the vault.
                    {wallet.network === 'chipnet' && (
                      <span className="block mt-1 text-warning">
                        ⚠️ Maximum {100} BCH for chipnet testing.
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Unlock Schedule */}
            {step === 3 && (
              <div className="space-y-8">
                <h2 className="text-2xl font-display">Unlock Schedule</h2>
                <div>
                  <label className="block text-sm font-bold uppercase tracking-wide mb-3">Cycle Duration</label>
                  <select
                    value={formData.cycleDuration}
                    onChange={(e) => handleInputChange('cycleDuration', e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-border rounded-lg focus:outline-none focus:border-primary transition-colors font-mono text-sm appearance-none"
                  >
                    <option value="604800">Weekly (7 days)</option>
                    <option value="2592000">Monthly (30 days)</option>
                    <option value="7776000">Quarterly (90 days)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold uppercase tracking-wide mb-3">Unlock Amount per Cycle</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formData.unlockAmount}
                      onChange={(e) => handleInputChange('unlockAmount', e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-border rounded-lg focus:outline-none focus:border-primary transition-colors font-mono text-lg"
                      placeholder="0.00"
                      step="0.01"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-textMuted font-mono text-sm">BCH</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Signers and Threshold */}
            {step === 4 && (
              <div className="space-y-8">
                <h2 className="text-2xl font-display">Signers & Threshold</h2>

                <div className="p-4 bg-accent/5 border border-accent/20 rounded-lg">
                  <p className="text-xs font-mono text-textMuted">
                    <strong className="text-textPrimary">BLOCKCHAIN DEPLOYMENT:</strong> Smart contract requires exactly 3 valid signer addresses and public keys.
                  </p>
                </div>

                {wallet.address && wallet.publicKey && (
                  <button
                    onClick={fillCreatorInfo}
                    type="button"
                    className="text-xs uppercase tracking-wider font-bold text-accent hover:text-accent-hover transition-colors"
                  >
                    + Auto-fill my wallet as Signer 1
                  </button>
                )}

                <div>
                  <label className="block text-sm font-bold uppercase tracking-wide mb-3">Approval Threshold</label>
                  <input
                    type="number"
                    value={formData.approvalThreshold}
                    onChange={(e) => handleInputChange('approvalThreshold', e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-border rounded-lg focus:outline-none focus:border-primary transition-colors font-mono text-sm"
                    min="1"
                    max="3"
                  />
                  <p className="mt-2 text-xs text-textMuted font-mono">
                    M-of-N required to approve proposals.
                  </p>
                </div>

                <div className="space-y-6">
                  <label className="block text-sm font-bold uppercase tracking-wide">Signers (3 Required)</label>
                  {formData.signers.map((signer, index) => (
                    <div key={index} className="space-y-3 p-6 border border-border rounded-lg bg-whiteAlt/50">
                      <div className="font-bold text-xs uppercase tracking-wider text-textMuted">
                        Signer {index + 1}
                      </div>
                      <input
                        type="text"
                        value={signer}
                        onChange={(e) => handleSignerChange(index, e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-border rounded focus:outline-none focus:border-primary font-mono text-xs"
                        placeholder="BCH Address (bitcoincash:...)"
                      />
                      <input
                        type="text"
                        value={formData.signerPubkeys[index]}
                        onChange={(e) => handlePubkeyChange(index, e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-border rounded focus:outline-none focus:border-primary font-mono text-xs"
                        placeholder="Public Key (hex)"
                      />
                      {formData.signerPubkeys[index] && (
                        <p className="text-[10px] font-mono flex items-center gap-2">
                          <span className="text-accent">✓ key provided</span>
                          {formData.signerPubkeys[index].length !== 66 && (
                            <span className="text-warning">⚠ Check length (66)</span>
                          )}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 5: Spending Cap */}
            {step === 5 && (
              <div className="space-y-8">
                <h2 className="text-2xl font-display">Spending Cap (Optional)</h2>
                <div>
                  <label className="block text-sm font-bold uppercase tracking-wide mb-3">Max Spend per Period</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formData.spendingCap}
                      onChange={(e) => handleInputChange('spendingCap', e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-border rounded-lg focus:outline-none focus:border-primary transition-colors font-mono text-lg"
                      placeholder="No Cap"
                      step="0.01"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-textMuted font-mono text-sm">BCH</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 6: Review */}
            {step === 6 && (
              <div className="space-y-8">
                <h2 className="text-2xl font-display">Confirm Deployment</h2>

                <div className="grid gap-6 md:grid-cols-2 font-mono text-sm border-t border-border pt-6">
                  <div>
                    <span className="text-xs uppercase text-textMuted block mb-1">Name</span>
                    <p className="font-bold">{formData.name || 'Untitled'}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase text-textMuted block mb-1">Deposit</span>
                    <p className="font-bold">{formData.depositAmount || '0'} BCH</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase text-textMuted block mb-1">Schedule</span>
                    <p className="font-bold">{formData.unlockAmount || '0'} BCH / {formData.cycleDuration === '604800' ? 'Week' : 'Month'}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase text-textMuted block mb-1">Threshold</span>
                    <p className="font-bold">{formData.approvalThreshold}-of-{formData.signers.filter(s => s).length}</p>
                  </div>
                </div>

                <div className="border-t border-border pt-6">
                  <span className="text-xs uppercase text-textMuted block mb-3">Signers</span>
                  <div className="space-y-2">
                    {formData.signers.filter(s => s).map((signer, index) => (
                      <div key={index} className="flex justify-between items-center text-xs font-mono p-2 bg-whiteAlt rounded">
                        <span className="truncate w-1/3">{signer}</span>
                        <span className="truncate w-1/3 text-textMuted">{formData.signerPubkeys[index] || '-'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-accent/5 border border-accent/20 rounded-lg">
                  <p className="text-xs font-mono text-textMuted">
                    <strong className="text-textPrimary">READY TO DEPLOY:</strong> Clicking "Deploy Vault" will initiate a blockchain transaction.
                  </p>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-12 pt-8 border-t border-border">
              {step > 1 ? (
                <Button variant="outline" onClick={handleBack} disabled={isSubmitting}>
                  BACK
                </Button>
              ) : (
                <div />
              )}

              {step < 6 ? (
                <Button onClick={handleNext}>NEXT STEP</Button>
              ) : (
                <Button onClick={handleSubmit} disabled={isSubmitting} variant="primary" className="shadow-lg shadow-accent/20">
                  {isSubmitting
                    ? 'PROCESSING...'
                    : 'DEPLOY VAULT'}
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

