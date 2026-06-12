import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Wallet,
  Bell,
  LogOut,
  Copy,
  Check,
  Info,
  ShieldCheck,
  Plug,
  Globe,
} from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { PageMeta } from '../components/seo/PageMeta';
import { useWallet } from '../hooks/useWallet';
import { useWalletModal } from '../hooks/useWalletModal';
import { useNetwork } from '../hooks/useNetwork';
import { APP_SITE_URL } from '../utils/publicUrls';

function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  const head = address.slice(0, 10);
  const tail = address.slice(-6);
  return `${head}...${tail}`;
}

function networkLabel(network: string): string {
  if (network === 'mainnet') return 'BCH Mainnet';
  if (network === 'chipnet') return 'BCH Chipnet';
  if (network === 'testnet') return 'BCH Testnet';
  return network;
}

function walletProviderLabel(walletType: string | null): string {
  if (!walletType) return 'unknown';
  const normalized = walletType.toLowerCase();
  if (normalized.includes('paytaca')) return 'Paytaca';
  if (normalized.includes('cashonize')) return 'Cashonize';
  if (normalized.includes('walletconnect')) return 'WalletConnect';
  if (normalized.includes('wizardconnect')) return 'WizardConnect';
  return walletType;
}

interface CopyButtonProps {
  value: string;
  label: string;
}

function CopyButton({ value, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-surface hover:bg-surfaceAlt/50 transition-colors text-xs font-mono text-textSecondary hover:text-textPrimary"
      aria-label={`copy ${label}`}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-brand300" />
          copied
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          copy
        </>
      )}
    </button>
  );
}

function PageChrome({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-background min-h-screen">
      <PageMeta
        title="Account Settings"
        description="Your FlowGuard wallet identity, network preferences, and session controls."
        path="/settings"
      />

      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/30 h-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 h-full flex justify-between items-center">
          <Link to="/">
            <img src="/assets/flow-green.png" alt="FlowGuard" className="h-8 object-contain" />
          </Link>
          <div className="hidden md:flex items-center space-x-10">
            <a
              href={APP_SITE_URL}
              className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors"
            >
              Dashboard
            </a>
            <Link
              to="/help"
              className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors"
            >
              Help
            </Link>
            <Link
              to="/security"
              className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors"
            >
              Security
            </Link>
          </div>
        </div>
      </nav>

      {children}

      <Footer />
    </main>
  );
}

function EmptyState() {
  const { openModal } = useWalletModal();
  return (
    <>
      <section className="pt-32 pb-8 px-6 lg:px-12">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-2">
            account
          </p>
          <h1 className="font-display text-3xl md:text-4xl text-textPrimary mb-3">
            Account Settings
          </h1>
          <p className="text-base text-textSecondary leading-relaxed max-w-2xl">
            Your wallet is your identity on FlowGuard. Connect one to view and manage your account.
          </p>
        </div>
      </section>

      <section className="pb-24 px-6 lg:px-12">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-dashed border-border bg-surface px-8 py-14 flex flex-col items-center text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-brand300/10 border border-brand300/30 flex items-center justify-center mb-5">
              <Plug className="w-6 h-6 text-brand300" />
            </div>
            <h2 className="font-display text-xl text-textPrimary mb-2">
              Connect a wallet to view settings
            </h2>
            <p className="text-sm text-textSecondary max-w-md leading-relaxed mb-6">
              FlowGuard stores no email or password. Your wallet signature is the only credential, so there is nothing to show until you connect one.
            </p>
            <button
              type="button"
              onClick={openModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-white text-sm font-medium hover:bg-primaryHover transition-colors"
            >
              <Wallet className="w-4 h-4" />
              Connect Wallet
            </button>
          </motion.div>
        </div>
      </section>
    </>
  );
}

interface ConnectedViewProps {
  address: string;
  walletType: string | null;
  network: string;
  envNetwork: string;
  onDisconnect: () => void;
}

function ConnectedView({
  address,
  walletType,
  network,
  envNetwork,
  onDisconnect,
}: ConnectedViewProps) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const truncated = truncateAddress(address);
  const provider = walletProviderLabel(walletType);
  const netLabel = networkLabel(network);
  const envNetLabel = networkLabel(envNetwork);

  return (
    <>
      <section className="pt-32 pb-8 px-6 lg:px-12">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-2">
            account
          </p>
          <h1 className="font-display text-3xl md:text-4xl text-textPrimary mb-3">
            Account Settings
          </h1>
          <p className="text-base text-textSecondary leading-relaxed max-w-2xl">
            Signed in as <span className="font-mono text-textPrimary">{truncated}</span> on {netLabel}.
          </p>
        </div>
      </section>

      <section className="pb-8 px-6 lg:px-12">
        <div className="max-w-3xl mx-auto space-y-6">
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl border border-border bg-surface overflow-hidden"
          >
            <div className="px-6 pt-6 pb-5 border-b border-border">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand300/30 to-brand300/5 border border-brand300/30 flex items-center justify-center flex-shrink-0">
                    <Wallet className="w-5 h-5 text-brand300" />
                  </div>
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wider text-textMuted">
                      connected wallet
                    </p>
                    <p className="font-mono text-lg text-textPrimary mt-1 break-all">
                      {truncated}
                    </p>
                    <p className="text-xs text-textMuted mt-1">via {provider}</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand300/10 border border-brand300/30 text-xs font-medium text-brand300 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand300 animate-pulse" />
                  {netLabel}
                </span>
              </div>
            </div>
            <div className="px-6 py-4 bg-surfaceAlt/30 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <p className="font-mono text-xs text-textSecondary break-all">{address}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <CopyButton value={address} label="wallet address" />
                <button
                  type="button"
                  onClick={onDisconnect}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-surface hover:bg-surfaceAlt/50 transition-colors text-xs font-medium text-textSecondary hover:text-textPrimary"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  disconnect
                </button>
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl border border-border bg-surface overflow-hidden"
          >
            <header className="px-6 py-5 border-b border-border flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-brand300/10 border border-brand300/30 flex items-center justify-center flex-shrink-0">
                <Globe className="w-5 h-5 text-brand300" />
              </div>
              <div className="flex-1">
                <h2 className="font-display text-xl text-textPrimary leading-tight">
                  Network Preferences
                </h2>
                <p className="text-sm text-textSecondary mt-1 leading-relaxed">
                  FlowGuard is locked to one network per build. Your wallet must match.
                </p>
              </div>
            </header>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-1">
                    active network
                  </p>
                  <p className="text-sm text-textPrimary font-medium">{envNetLabel}</p>
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onMouseEnter={() => setTooltipOpen(true)}
                    onMouseLeave={() => setTooltipOpen(false)}
                    onFocus={() => setTooltipOpen(true)}
                    onBlur={() => setTooltipOpen(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-medium text-textSecondary hover:text-textPrimary transition-colors"
                    aria-describedby="network-tooltip"
                  >
                    <Info className="w-3.5 h-3.5" />
                    how to change
                  </button>
                  {tooltipOpen && (
                    <div
                      id="network-tooltip"
                      role="tooltip"
                      className="absolute right-0 top-full mt-2 w-72 p-3 rounded-lg border border-border bg-surface shadow-lg z-10 text-xs text-textSecondary leading-relaxed"
                    >
                      Set the <span className="font-mono text-textPrimary">VITE_BCH_NETWORK</span> environment variable to <span className="font-mono text-textPrimary">mainnet</span> or <span className="font-mono text-textPrimary">chipnet</span> and redeploy. The network cannot be toggled at runtime.
                    </div>
                  )}
                </div>
              </div>
              {network !== envNetwork && (
                <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/60 flex items-start gap-2 text-xs text-amber-800 leading-relaxed">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p>
                    Your wallet reports <span className="font-mono">{networkLabel(network)}</span> but this build expects <span className="font-mono">{envNetLabel}</span>. Switch network in your wallet to avoid signing against the wrong chain.
                  </p>
                </div>
              )}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl border border-border bg-surface overflow-hidden"
          >
            <header className="px-6 py-5 border-b border-border flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-surfaceAlt/60 border border-border flex items-center justify-center flex-shrink-0">
                <Bell className="w-5 h-5 text-textSecondary" />
              </div>
              <div className="flex-1 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl text-textPrimary leading-tight">
                    Notification Preferences
                  </h2>
                  <p className="text-sm text-textSecondary mt-1 leading-relaxed">
                    Email and webhook alerts for claim windows, threshold breaches, and signer activity.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surfaceAlt/60 border border-border text-[10px] font-mono uppercase tracking-wider text-textMuted whitespace-nowrap">
                  Coming with v1.1
                </span>
              </div>
            </header>
            <div className="px-6 py-5">
              <p className="text-sm text-textSecondary leading-relaxed">
                Notification routing depends on the workspace identity service shipping in the next release. Until then, watch the in-app activity feed for state changes.
              </p>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl border border-border bg-surface overflow-hidden"
          >
            <header className="px-6 py-5 border-b border-border flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-brand300/10 border border-brand300/30 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-5 h-5 text-brand300" />
              </div>
              <div className="flex-1">
                <h2 className="font-display text-xl text-textPrimary leading-tight">
                  Data and Privacy
                </h2>
                <p className="text-sm text-textSecondary mt-1 leading-relaxed">
                  Sign out of this browser. Your covenants, streams, and receipts on chain are not affected.
                </p>
              </div>
            </header>
            <div className="px-6 py-5 space-y-4">
              {confirmDisconnect ? (
                <div className="p-4 rounded-xl border border-border bg-surfaceAlt/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-sm text-textPrimary">
                    Disconnect <span className="font-mono">{truncated}</span> from this browser?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDisconnect(false)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border text-xs font-medium text-textPrimary hover:bg-surfaceAlt/40 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={onDisconnect}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary text-white text-xs font-medium hover:bg-primaryHover transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Yes, disconnect
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-border text-sm font-medium text-textPrimary hover:bg-surfaceAlt/40 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out / disconnect wallet
                </button>
              )}
            </div>
          </motion.section>
        </div>
      </section>
    </>
  );
}

export default function SettingsPage() {
  const wallet = useWallet();
  const envNetwork = useNetwork();

  const handleDisconnect = () => {
    void wallet.disconnect();
  };

  return (
    <PageChrome>
      {wallet.isConnected && wallet.address ? (
        <ConnectedView
          address={wallet.address}
          walletType={wallet.walletType}
          network={wallet.network}
          envNetwork={envNetwork}
          onDisconnect={handleDisconnect}
        />
      ) : (
        <EmptyState />
      )}
    </PageChrome>
  );
}
