import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { fetchVault, fetchProposals, approveProposal } from '../utils/api';
import { approveProposalOnChain, executePayoutOnChain, unlockCycleOnChain, getExplorerTxUrl } from '../utils/blockchain';
import { AddSignerModal } from '../components/vaults/AddSignerModal';
import { useWallet } from '../hooks/useWallet';
import { useNetwork } from '../hooks/useNetwork';
import { CheckCircle, DollarSign, Unlock, ExternalLink, ChevronLeft, Wallet, Shield, FileText, Clock, ArrowUpRight, ArrowDownLeft, Activity, Zap, Users } from 'lucide-react';

export default function VaultDetailPage() {
  const { id } = useParams<{ id: string }>();
  const wallet = useWallet();
  const network = useNetwork();
  const [vault, setVault] = useState<any>(null);
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddSignerModal, setShowAddSignerModal] = useState(false);
  const [approvingProposalId, setApprovingProposalId] = useState<string | null>(null);
  const [executingProposalId, setExecutingProposalId] = useState<string | null>(null);
  const [unlockingCycle, setUnlockingCycle] = useState<number | null>(null);
  const [eligibleCycles, setEligibleCycles] = useState<number[]>([]);
  const [currentCycle, setCurrentCycle] = useState<number>(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  const loadTransactions = async () => {
    if (!id || !vault?.contractAddress) return;
    try {
      setLoadingTransactions(true);
      const response = await fetch(`/api/vaults/${id}/transactions`);
      if (response.ok) {
        const data = await response.json();
        setTransactions(data.transactions || []);
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    const loadVault = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const vaultData = await fetchVault(id, wallet.address || undefined);
        setVault(vaultData);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load vault');
      } finally {
        setLoading(false);
      }
    };

    loadVault();
  }, [id, wallet.address]);

  useEffect(() => {
    const loadProposals = async () => {
      if (!id) return;
      try {
        setLoadingProposals(true);
        const proposalsData = await fetchProposals(id);
        setProposals(proposalsData);
      } catch (err: any) {
        console.error('Failed to load proposals:', err);
      } finally {
        setLoadingProposals(false);
      }
    };

    loadProposals();
  }, [id]);

  useEffect(() => {
    const loadEligibleCycles = async () => {
      if (!id || !vault?.contractAddress) return;
      try {
        const response = await fetch(`/api/vaults/${id}/cycles/eligible`);
        if (response.ok) {
          const data = await response.json();
          setEligibleCycles(data.eligibleCycles || []);
          setCurrentCycle(data.currentCycle || 0);
        }
      } catch (err) {
        console.error('Failed to load eligible cycles:', err);
      }
    };

    loadEligibleCycles();
  }, [id, vault?.contractAddress]);

  useEffect(() => {
    loadTransactions();
  }, [id, vault?.contractAddress]);

  // Reload transactions after successful operations
  useEffect(() => {
    if (id && (approvingProposalId === null && executingProposalId === null && unlockingCycle === null)) {
      loadTransactions();
    }
  }, [id, approvingProposalId, executingProposalId, unlockingCycle]);

  const role = vault?.role || 'viewer';
  const isCreator = role === 'creator';
  const isSigner = role === 'signer' || isCreator;
  const canInteract = isSigner; // Can create proposals and approve

  const handleApproveProposal = async (proposalId: string) => {
    if (!wallet.address) {
      alert('WARNING: Please connect your wallet to approve proposals');
      return;
    }

    try {
      setApprovingProposalId(proposalId);

      // Try on-chain approval if vault has contract address and wallet is connected
      if (vault?.contractAddress && wallet.isConnected && wallet.publicKey) {
        try {
          console.log('Attempting on-chain approval...');
          const txid = await approveProposalOnChain(
            wallet,
            proposalId,
            wallet.publicKey,
            {
              vaultId: id,
              proposalId,
            }
          );
          console.log('On-chain approval successful, txid:', txid);
          alert(`SUCCESS: Approval Successful!\n\nYour signature has been broadcast to the BCH blockchain.\n\nTransaction ID: ${txid}\n\nView on explorer: ${getExplorerTxUrl(txid, network)}`);
        } catch (onChainError: any) {
          console.warn('On-chain approval failed, falling back to database:', onChainError);
          // Fallback to database approval
          await approveProposal(proposalId, wallet.address);
          alert('SUCCESS: Approval recorded in database.\n\nNOTE: On-chain transaction failed. Approval saved locally.');
        }
      } else {
        // No contract address or wallet not fully connected - use database approval
        await approveProposal(proposalId, wallet.address);
        alert(
          'SUCCESS: Approval recorded in FlowGuard database only.\n\n' +
          'No blockchain transaction was created for this approval. ' +
          'Use on-chain approvals when you are ready to exercise full covenant security.'
        );
      }

      // Reload proposals
      if (id) {
        const proposalsData = await fetchProposals(id);
        setProposals(proposalsData);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to approve proposal';
      // Provide more specific error messages for common covenant validation failures
      let userFriendlyMsg = errorMsg;
      if (errorMsg.includes('not pending') || errorMsg.includes('state')) {
        userFriendlyMsg = 'Proposal state validation failed. The proposal may have already been approved or executed on-chain.';
      } else if (errorMsg.includes('Signer not authorized') || errorMsg.includes('not authorized')) {
        userFriendlyMsg = 'You are not authorized to approve this proposal. Only designated signers can approve proposals.';
      } else if (errorMsg.includes('network') || errorMsg.includes('connection')) {
        userFriendlyMsg = 'Network connection error. Please check your internet connection and try again.';
      }
      alert(`ERROR: Approval Failed\n\n${userFriendlyMsg}\n\nPlease try again or contact support if the issue persists.`);
    } finally {
      setApprovingProposalId(null);
    }
  };

  const handleExecutePayout = async (proposalId: string) => {
    if (!wallet.address) {
      alert('WARNING: Please connect your wallet to execute payouts');
      return;
    }

    if (!vault?.contractAddress) {
      alert('ERROR: Cannot execute payout\n\nThis vault does not have an on-chain contract address.');
      return;
    }

    if (!wallet.isConnected || !wallet.publicKey) {
      alert('WARNING: Wallet not fully connected\n\nPlease reconnect your wallet and try again.');
      return;
    }

    // Confirm with user before executing
    const confirmed = confirm(
      'EXECUTE PAYOUT?\n\n' +
      'This will broadcast a multi-signature transaction to the BCH blockchain.\n\n' +
      `• ${vault.approvalThreshold} signers must sign this transaction\n` +
      '• Funds will be sent from the contract to the recipient\n' +
      '• This action cannot be undone\n\n' +
      'Do you want to continue?'
    );

    if (!confirmed) {
      return;
    }

    try {
      setExecutingProposalId(proposalId);
      console.log('Attempting on-chain payout execution...');

      const proposal = proposals.find(p => p.id === proposalId);
      const txid = await executePayoutOnChain(wallet, proposalId, {
        vaultId: id,
        proposalId,
        amount: proposal?.amount,
        toAddress: proposal?.recipient,
      });

      console.log('On-chain payout execution successful, txid:', txid);
      alert(
        `SUCCESS: Payout Executed Successfully!\n\n` +
        `Funds have been sent from the vault contract to the recipient.\n\n` +
        `Transaction ID: ${txid}\n\n` +
        `View on explorer: ${getExplorerTxUrl(txid, network)}`
      );

      // Reload proposals to show updated status
      if (id) {
        const proposalsData = await fetchProposals(id);
        setProposals(proposalsData);
      }

      // Reload vault to show updated balance
      if (id) {
        const vaultData = await fetchVault(id, wallet.address || undefined);
        setVault(vaultData);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to execute payout';
      console.error('Payout execution failed:', err);
      // Provide more specific error messages for covenant validation failures
      let userFriendlyMsg = errorMsg;
      if (errorMsg.includes('not approved') || errorMsg.includes('state')) {
        userFriendlyMsg = 'Proposal state validation failed. The proposal must be approved on-chain before execution.';
      } else if (errorMsg.includes('threshold') || errorMsg.includes('signatures')) {
        userFriendlyMsg = `Insufficient signatures. This payout requires ${vault.approvalThreshold} signer approvals.`;
      } else if (errorMsg.includes('spending cap') || errorMsg.includes('exceeds')) {
        userFriendlyMsg = 'Amount exceeds the vault spending cap. Please adjust the proposal amount.';
      } else if (errorMsg.includes('network') || errorMsg.includes('connection')) {
        userFriendlyMsg = 'Network connection error. Please check your internet connection and try again.';
      }
      alert(
        `ERROR: Payout Execution Failed\n\n` +
        `${userFriendlyMsg}\n\n` +
        `Possible reasons:\n` +
        `• Insufficient approvals (requires ${vault.approvalThreshold} signers)\n` +
        `• Proposal not approved on-chain\n` +
        `• Wallet signature rejected\n` +
        `• Network error\n\n` +
        `Please check the proposal status and try again.`
      );
    } finally {
      setExecutingProposalId(null);
    }
  };

  const handleUnlockCycle = async (cycleNumber: number) => {
    if (!wallet.address) {
      alert('WARNING: Please connect your wallet to unlock cycles');
      return;
    }

    if (!vault?.contractAddress) {
      alert('ERROR: Cannot unlock cycle\n\nThis vault does not have an on-chain contract address.');
      return;
    }

    if (!wallet.isConnected || !wallet.publicKey) {
      alert('WARNING: Wallet not fully connected\n\nPlease reconnect your wallet and try again.');
      return;
    }

    if (!id) {
      alert('ERROR: Invalid vault ID');
      return;
    }

    // Confirm with user before unlocking
    const confirmed = confirm(
      'UNLOCK CYCLE?\n\n' +
      'This will broadcast a multi-signature transaction to the BCH blockchain.\n\n' +
      `• Cycle #${cycleNumber} will be unlocked\n` +
      `• ${vault.unlockAmount || 0} BCH will become available\n` +
      `• ${vault.approvalThreshold} signers must sign this transaction\n` +
      '• This action cannot be undone\n\n' +
      'Do you want to continue?'
    );

    if (!confirmed) {
      return;
    }

    try {
      setUnlockingCycle(cycleNumber);
      console.log('Attempting on-chain cycle unlock...');

      const txid = await unlockCycleOnChain(wallet, id, cycleNumber, wallet.publicKey, {
        vaultId: id,
        amount: vault?.unlockAmount,
      });

      console.log('On-chain cycle unlock successful, txid:', txid);
      alert(
        `SUCCESS: Cycle Unlocked Successfully!\n\n` +
        `Cycle #${cycleNumber} has been unlocked on the blockchain.\n` +
        `${vault.unlockAmount || 0} BCH is now available for spending.\n\n` +
        `Transaction ID: ${txid}\n\n` +
        `View on explorer: ${getExplorerTxUrl(txid, network)}`
      );

      // Reload vault to show updated balance and cycles
      if (id) {
        const vaultData = await fetchVault(id, wallet.address || undefined);
        setVault(vaultData);

        // Reload eligible cycles
        const response = await fetch(`/api/vaults/${id}/cycles/eligible`);
        if (response.ok) {
          const data = await response.json();
          setEligibleCycles(data.eligibleCycles || []);
          setCurrentCycle(data.currentCycle || 0);
        }
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to unlock cycle';
      console.error('Cycle unlock failed:', err);
      // Provide more specific error messages for covenant validation failures
      let userFriendlyMsg = errorMsg;
      if (errorMsg.includes('cannot be unlocked') || errorMsg.includes('not eligible')) {
        userFriendlyMsg = `Cycle #${cycleNumber} is not yet eligible for unlock. Cycles unlock based on the vault's cycle duration.`;
      } else if (errorMsg.includes('state') || errorMsg.includes('already unlocked')) {
        userFriendlyMsg = 'Cycle state validation failed. This cycle may have already been unlocked on-chain.';
      } else if (errorMsg.includes('Signer not authorized') || errorMsg.includes('not authorized')) {
        userFriendlyMsg = 'You are not authorized to unlock cycles. Only designated signers can unlock cycles.';
      } else if (errorMsg.includes('network') || errorMsg.includes('connection')) {
        userFriendlyMsg = 'Network connection error. Please check your internet connection and try again.';
      }
      alert(
        `ERROR: Cycle Unlock Failed\n\n` +
        `${userFriendlyMsg}\n\n` +
        `Possible reasons:\n` +
        `• Cycle not yet eligible for unlock (check cycle duration)\n` +
        `• Cycle already unlocked on-chain\n` +
        `• Insufficient signer approvals\n` +
        `• Wallet signature rejected\n` +
        `• Network error\n\n` +
        `Please check the cycle status and try again.`
      );
    } finally {
      setUnlockingCycle(null);
    }
  };

  if (loading) {
    return (
      <div className="py-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center py-16">Loading vault...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <div className="max-w-7xl mx-auto px-6">
          <Card padding="lg" className="text-center py-16 border-2 border-red-200 bg-red-50">
            <h2 className="text-2xl font-semibold mb-4 text-red-800">Error loading vault</h2>
            <p className="text-red-600 mb-4">{error}</p>
            <Link to="/vaults">
              <Button>Back to Vaults</Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="py-8">
        <div className="max-w-7xl mx-auto px-6">
          <Card padding="lg" className="text-center py-16">
            <h2 className="text-2xl font-semibold mb-4">Vault not found</h2>
            <Link to="/vaults">
              <Button>Back to Vaults</Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  // Calculate unlocked/locked amounts
  const unlocked = vault.unlockAmount || 0;
  const locked = (vault.totalDeposit || 0) - unlocked;

  return (
    <div className="py-6 md:py-8">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="mb-6 md:mb-8">
          <Link to="/vaults" className="text-textMuted hover:text-textPrimary font-mono text-sm flex items-center gap-2">
            <ChevronLeft className="w-4 h-4" />
            Back to Vaults
          </Link>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start mb-8 md:mb-10 lg:mb-12 gap-4 md:gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 md:gap-3 lg:gap-4 mb-3">
              <h1 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-display font-bold text-textPrimary">
                {vault.name || vault.vaultId || `Vault ${vault.id?.slice(0, 8)}`}
              </h1>
              <span
                className={`inline-flex items-center px-3 py-1 text-xs font-mono uppercase bg-black text-white border border-border`}
              >
                {role === 'creator' ? 'Creator' : role === 'signer' ? 'Signer' : 'Viewer'}
              </span>
              {vault.isPublic && (
                <span className="inline-flex items-center px-3 py-1 bg-white text-textPrimary border border-border text-xs font-mono uppercase">
                  Public
                </span>
              )}
            </div>
            {vault.description && <p className="text-textMuted text-sm md:text-base lg:text-lg max-w-2xl">{vault.description}</p>}
          </div>
          <div className="flex gap-3">
            {isCreator && (
              <Button variant="outline" onClick={() => setShowAddSignerModal(true)}>
                + Add Signer
              </Button>
            )}
            {canInteract && (
              <>
                <Link to={`/vaults/${id}/create-stream`}>
                  <Button variant="outline" className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Create Stream
                  </Button>
                </Link>
                <Link to={`/vaults/${id}/batch-create`}>
                  <Button variant="outline" className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Batch Streams
                  </Button>
                </Link>
                <Link to={`/vaults/${id}/proposals/create`}>
                  <Button>Create Proposal</Button>
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8 md:mb-10 lg:mb-12">
          <Card padding="md" className="relative overflow-hidden group">
            <div className="relative z-10 transition-transform duration-300 group-hover:-translate-y-1">
              <h3 className="font-mono text-xs uppercase text-textMuted mb-2 tracking-wider">Total Deposit</h3>
              <p className="font-display text-2xl md:text-3xl lg:text-4xl text-textPrimary">{vault.totalDeposit || 0} <span className="text-sm md:text-base lg:text-lg text-textMuted">BCH</span></p>
            </div>
            <div className="absolute -right-6 -bottom-6 text-border z-0 group-hover:scale-110 transition-transform duration-500">
              <DollarSign className="w-16 h-16 md:w-24 md:h-24 lg:w-32 lg:h-32" />
            </div>
          </Card>

          <Card padding="md" className="relative overflow-hidden group">
            <div className="relative z-10 transition-transform duration-300 group-hover:-translate-y-1">
              <h3 className="font-mono text-xs uppercase text-textMuted mb-2 tracking-wider">On-Chain Balance</h3>
              <div className="flex items-baseline gap-2">
                <p className="font-display text-2xl md:text-3xl lg:text-4xl text-accent">
                  {vault.balance !== undefined ? (vault.balance / 100000000).toFixed(8) : '0.00000000'}
                </p>
                <span className="text-sm md:text-base lg:text-lg text-textMuted font-display">BCH</span>
              </div>
              <p className="text-xs font-mono text-textMuted mt-2 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
                Live Sync
              </p>
            </div>
            <div className="absolute -right-6 -bottom-6 text-accent/10 z-0 group-hover:scale-110 transition-transform duration-500">
              <Wallet className="w-16 h-16 md:w-24 md:h-24 lg:w-32 lg:h-32" />
            </div>
          </Card>

          <Card padding="md" className="relative overflow-hidden group">
            <div className="relative z-10 transition-transform duration-300 group-hover:-translate-y-1">
              <h3 className="font-mono text-xs uppercase text-textMuted mb-2 tracking-wider">Locked Funds</h3>
              <p className="font-display text-4xl text-textPrimary">{locked.toFixed(2)} <span className="text-lg text-textMuted">BCH</span></p>
            </div>
            <div className="absolute -right-6 -bottom-6 text-border z-0 group-hover:scale-110 transition-transform duration-500">
              <Shield className="w-16 h-16 md:w-24 md:h-24 lg:w-32 lg:h-32" />
            </div>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 md:gap-8 mb-8 md:mb-10 lg:mb-12">
          {/* Main Content Column */}
          <div className="lg:col-span-2 space-y-6 md:space-y-8">

            {/* Active Proposals */}
            <section>
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h2 className="font-display text-xl md:text-2xl text-textPrimary">Active Proposals</h2>
              </div>

              {!canInteract ? (
                <Card padding="lg" className="bg-whiteAlt border-dashed border-border">
                  <p className="text-textMuted font-mono text-center py-8">
                    Strict access control. Only signers can view proposals.
                  </p>
                </Card>
              ) : loadingProposals ? (
                <div className="space-y-4">
                  {[1, 2].map(i => (
                    <div key={i} className="h-48 bg-surfaceAlt rounded-xl animate-pulse"></div>
                  ))}
                </div>
              ) : proposals.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border rounded-xl">
                  <p className="text-textMuted font-mono mb-4">No active proposals in queue</p>
                  <Link to={`/vaults/${id}/proposals/create`}>
                    <Button variant="outline" size="sm">Create First Proposal</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {proposals.map((proposal) => (
                    <Card key={proposal.id} padding="lg" className="group hover:border-accent/50 transition-colors">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-display text-xl text-textPrimary">{proposal.amount} BCH</h3>
                            <p className="text-sm font-mono text-textMuted">Proposal #{proposal.id.slice(0, 4)}</p>
                          </div>
                        </div>
                        <span
                          className={`font-mono text-xs uppercase px-3 py-1 border ${proposal.status === 'approved'
                            ? 'bg-accent text-white border-accent'
                            : proposal.status === 'executed'
                              ? 'bg-black text-white border-black'
                              : 'bg-white text-textMuted border-border'
                            }`}
                        >
                          {proposal.status}
                        </span>
                      </div>

                      <p className="text-textPrimary mb-6 p-4 bg-whiteAlt rounded-lg font-medium border border-border">
                        "{proposal.reason}"
                      </p>

                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="p-3 border border-border rounded-lg">
                          <span className="block text-xs font-mono text-textMuted uppercase mb-1">Recipient</span>
                          <span className="font-mono text-sm text-textPrimary break-all">{proposal.recipient.slice(0, 12)}...{proposal.recipient.slice(-6)}</span>
                        </div>
                        <div className="p-3 border border-border rounded-lg">
                          <span className="block text-xs font-mono text-textMuted uppercase mb-1">Approvals</span>
                          <div className="flex items-center gap-2">
                            <span className="font-display text-lg text-textPrimary">
                              {proposal.approvalCount || 0}/{vault.approvalThreshold || 0}
                            </span>
                            <div className="flex-1 h-1.5 bg-surfaceAlt rounded-full overflow-hidden">
                              <div
                                className="h-full bg-accent transition-all duration-500"
                                style={{ width: `${Math.min(((proposal.approvalCount || 0) / (vault.approvalThreshold || 1)) * 100, 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {proposal.status === 'pending' && (
                        <Button
                          className="w-full"
                          variant="outline"
                          onClick={() => handleApproveProposal(proposal.id)}
                          disabled={approvingProposalId === proposal.id}
                        >
                          {approvingProposalId === proposal.id ? 'Broadcasting Signature...' : 'Approve Proposal'}
                        </Button>
                      )}
                      {proposal.status === 'approved' && vault?.contractAddress && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-green-600 font-mono bg-green-50 p-2 rounded justify-center">
                            <CheckCircle className="w-4 h-4" />
                            Threshold Met - Ready for Execution
                          </div>
                          <Button
                            className="w-full"
                            onClick={() => handleExecutePayout(proposal.id)}
                            disabled={executingProposalId === proposal.id}
                          >
                            {executingProposalId === proposal.id ? 'Executing Payout...' : 'Execute Payout'}
                          </Button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* Transaction History */}
            {vault?.contractAddress && (
              <section>
                <h2 className="font-display text-2xl text-textPrimary mb-6">History</h2>
                <Card padding="none" className="overflow-hidden">
                  {loadingTransactions ? (
                    <div className="p-8 text-center text-textMuted font-mono">Loading history...</div>
                  ) : transactions.length === 0 ? (
                    <div className="p-12 text-center">
                      <Clock className="w-8 h-8 text-textMuted mx-auto mb-3 opacity-50" />
                      <p className="text-textMuted font-mono">No on-chain activity yet.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-black/5">
                      {transactions.map((tx: any) => (
                        <div key={tx.id} className="p-4 hover:bg-whiteAlt transition-colors flex items-center justify-between group">
                          <div className="flex items-center gap-4">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.txType === 'payout' ? 'bg-red-50 text-red-600' :
                              tx.txType === 'deposit' ? 'bg-green-50 text-green-600' : 'bg-surfaceAlt text-textSecondary'
                              }`}>
                              {tx.txType === 'payout' ? <ArrowUpRight className="w-4 h-4" /> :
                                tx.txType === 'deposit' ? <ArrowDownLeft className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                            </div>
                            <div>
                              <p className="font-mono text-sm text-textPrimary font-semibold uppercase">{tx.txType}</p>
                              <p className="text-xs text-textMuted font-mono">
                                {tx.createdAt && new Date(tx.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-sm text-textPrimary">{tx.amount ? `${tx.amount} BCH` : '-'}</p>
                            <a
                              href={getExplorerTxUrl(tx.txHash, network)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-accent opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 justify-end hover:underline"
                            >
                              View <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </section>
            )}
          </div>

          {/* Sidebar Column */}
          <div className="space-y-6">
            <Card padding="lg">
              <h3 className="font-display text-lg text-textPrimary mb-4 border-b border-border pb-4">Vault Details</h3>
              <dl className="space-y-4">
                {vault.contractAddress && (
                  <div>
                    <dt className="text-xs font-mono text-textMuted uppercase mb-1">Contract</dt>
                    <dd className="font-mono text-xs text-accent break-all bg-accent/5 p-2 rounded border border-accent/10">
                      {vault.contractAddress}
                    </dd>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-xs font-mono text-textMuted uppercase mb-1">Threshold</dt>
                    <dd className="font-display text-xl text-textPrimary">{vault.approvalThreshold}/{vault.signers?.length || 0}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-mono text-textMuted uppercase mb-1">Unlock</dt>
                    <dd className="font-display text-xl text-textPrimary">{vault.unlockAmount || 0} <span className="text-sm text-textMuted">BCH</span></dd>
                  </div>
                </div>
                <div>
                  <dt className="text-xs font-mono text-textMuted uppercase mb-1">Cycle</dt>
                  <dd className="font-mono text-sm text-textPrimary border border-border rounded px-2 py-1 inline-block">
                    {vault.cycleDuration === 604800 ? 'Weekly' :
                      vault.cycleDuration === 2592000 ? 'Monthly' :
                        `${vault.cycleDuration}s`}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card padding="lg">
              <div className="flex items-center justify-between mb-4 border-b border-border pb-4">
                <h3 className="font-display text-lg text-textPrimary">Signers</h3>
                <span className="font-mono text-xs text-textMuted">{vault.signers?.length || 0} Active</span>
              </div>
              <ul className="space-y-3">
                {vault.signers?.map((signer: string, idx: number) => (
                  <li key={idx} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-surfaceAlt flex items-center justify-center text-textPrimary font-mono text-xs">
                      {idx + 1}
                    </div>
                    <div className="overflow-hidden">
                      <p className="font-mono text-xs text-textPrimary truncate w-full">{signer}</p>
                      {signer.toLowerCase() === vault.creator?.toLowerCase() && (
                        <span className="text-[10px] uppercase font-bold text-accent tracking-wider">Creator</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Unlock Cycles Widget */}
            {vault?.contractAddress && canInteract && (
              <Card padding="lg" className="border-accent/20 bg-accent/5">
                <h3 className="font-display text-lg text-textPrimary mb-2">Unlock Cycles</h3>
                <p className="text-sm text-textMuted mb-4">Current Cycle: <span className="font-mono font-bold">#{currentCycle}</span></p>

                {eligibleCycles.length > 0 ? (
                  <div className="space-y-2">
                    {eligibleCycles.map(cycle => (
                      <Button key={cycle} className="w-full justify-between group" onClick={() => handleUnlockCycle(cycle)} disabled={unlockingCycle === cycle}>
                        <span>Cycle #{cycle}</span>
                        {unlockingCycle === cycle ? <span className="animate-spin">⌛</span> : <Unlock className="w-4 h-4 opacity-50 group-hover:opacity-100" />}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-mono text-textMuted text-center py-4 border border-dashed border-border rounded">
                    No cycles eligible yet
                  </p>
                )}
              </Card>
            )}
          </div>
        </div>

        {/* Add Signer Modal */}
        {showAddSignerModal && id && (
          <AddSignerModal
            vaultId={id}
            onClose={() => setShowAddSignerModal(false)}
            onSuccess={() => {
              setShowAddSignerModal(false);
              fetchVault(id, wallet.address || undefined).then(setVault).catch(console.error);
            }}
          />
        )}
      </div>
    </div>
  );
}
