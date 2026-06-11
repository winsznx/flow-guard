import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Wallet,
  Bell,
  Download,
  Trash2,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Copy,
  Check,
  Mail,
  Webhook,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { PageMeta } from '../components/seo/PageMeta';
import { APP_SITE_URL, DOCS_SITE_URL } from '../utils/publicUrls';

// TODO(integration): wire the real wallet context, session bearer expiry, and
// notification preference store before phase 3 ships. this page currently uses
// placeholder values so the layout is reviewable independent of the wallet hooks.

const PLACEHOLDER_WALLET = {
  address: 'bitcoincash:qzh4...examplev9q',
  shortAddress: 'qzh4...v9q',
  network: 'chipnet',
  connectedAt: '2026-06-09 14:22 utc',
  walletProvider: 'paytaca',
};

const PLACEHOLDER_SESSION = {
  issuedAt: '2026-06-09 14:22 utc',
  expiresAt: '2026-06-16 14:22 utc',
  scope: 'workspace:read workspace:write',
};

interface SettingsSectionProps {
  title: string;
  description: string;
  icon: typeof Wallet;
  children: React.ReactNode;
  tone?: 'default' | 'danger';
}

function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
  tone = 'default',
}: SettingsSectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={`rounded-2xl border ${
        tone === 'danger' ? 'border-red-200 bg-red-50/40' : 'border-border bg-surface'
      } overflow-hidden`}
    >
      <header className="px-6 py-5 border-b border-border flex items-start gap-4">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            tone === 'danger'
              ? 'bg-red-100 border border-red-200'
              : 'bg-brand300/10 border border-brand300/30'
          }`}
        >
          <Icon
            className={`w-5 h-5 ${tone === 'danger' ? 'text-red-600' : 'text-brand300'}`}
          />
        </div>
        <div className="flex-1">
          <h2 className="font-display text-xl text-textPrimary leading-tight">{title}</h2>
          <p className="text-sm text-textSecondary mt-1 leading-relaxed">{description}</p>
        </div>
      </header>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </motion.section>
  );
}

interface KeyValueRowProps {
  label: string;
  value: string;
  copyable?: boolean;
  mono?: boolean;
}

function KeyValueRow({ label, value, copyable = false, mono = false }: KeyValueRowProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-b-0">
      <p className="text-xs font-mono uppercase tracking-wider text-textMuted pt-1">{label}</p>
      <div className="flex items-center gap-2 max-w-[60%]">
        <p
          className={`text-sm text-textPrimary text-right break-all ${mono ? 'font-mono' : ''}`}
        >
          {value}
        </p>
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-md hover:bg-surfaceAlt/50 transition-colors text-textMuted hover:text-textPrimary"
            aria-label={`copy ${label}`}
          >
            {copied ? <Check className="w-4 h-4 text-brand300" /> : <Copy className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

interface NotificationToggleProps {
  label: string;
  description: string;
  defaultChecked?: boolean;
  icon: typeof Mail;
  disabled?: boolean;
}

function NotificationToggle({
  label,
  description,
  defaultChecked = false,
  icon: Icon,
  disabled = false,
}: NotificationToggleProps) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-b-0">
      <div className="flex items-start gap-3 flex-1">
        <div className="w-9 h-9 rounded-lg bg-surfaceAlt/40 border border-border flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-textSecondary" />
        </div>
        <div>
          <p className="text-sm font-medium text-textPrimary">{label}</p>
          <p className="text-xs text-textSecondary mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && setChecked((v) => !v)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors mt-1 ${
          checked ? 'bg-brand300' : 'bg-surfaceAlt/80'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleClearLocalState = () => {
    if (typeof window === 'undefined') return;
    window.localStorage.clear();
    window.sessionStorage.clear();
    setConfirmDelete(false);
    window.location.href = '/';
  };

  return (
    <main className="bg-background min-h-screen">
      <PageMeta
        title="Settings"
        description="Manage your FlowGuard connected wallet, session, notification preferences, and local workspace state."
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

      <section className="pt-32 pb-12 px-6 lg:px-12">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-2">
            account
          </p>
          <h1 className="font-display text-4xl md:text-5xl text-textPrimary mb-3">settings</h1>
          <p className="text-base text-textSecondary leading-relaxed max-w-2xl">
            manage your wallet connection, session, notification preferences, and local
            workspace state. flowguard stores no email or password - your wallet is your identity.
          </p>
        </div>
      </section>

      <section className="py-8 px-6 lg:px-12">
        <div className="max-w-3xl mx-auto space-y-6">
          <SettingsSection
            title="connected wallet"
            description="this is the wallet flowguard uses to sign every action. switching the wallet means switching identities."
            icon={Wallet}
          >
            <KeyValueRow
              label="address"
              value={PLACEHOLDER_WALLET.address}
              copyable
              mono
            />
            <KeyValueRow label="short" value={PLACEHOLDER_WALLET.shortAddress} mono />
            <KeyValueRow label="network" value={PLACEHOLDER_WALLET.network} />
            <KeyValueRow label="wallet" value={PLACEHOLDER_WALLET.walletProvider} />
            <KeyValueRow label="connected" value={PLACEHOLDER_WALLET.connectedAt} mono />
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-border text-sm font-medium text-textPrimary hover:bg-surfaceAlt/40 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Switch wallet
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-border text-sm font-medium text-textPrimary hover:bg-surfaceAlt/40 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Disconnect
              </button>
            </div>
          </SettingsSection>

          <SettingsSection
            title="session"
            description="session tokens are signed by your wallet and expire on a fixed window. they cannot be replayed against another address."
            icon={ShieldCheck}
          >
            <KeyValueRow label="issued" value={PLACEHOLDER_SESSION.issuedAt} mono />
            <KeyValueRow label="expires" value={PLACEHOLDER_SESSION.expiresAt} mono />
            <KeyValueRow label="scope" value={PLACEHOLDER_SESSION.scope} mono />
            <div className="p-4 rounded-xl bg-surfaceAlt/40 border border-border flex items-start gap-3">
              <Clock className="w-5 h-5 text-brand300 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-textSecondary leading-relaxed">
                if your session expires, you will be prompted to sign a new bearer message on
                your next action. funds and covenants are not affected - only dashboard access.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-primary text-white text-sm font-medium hover:bg-primaryHover transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Re-sign session
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-border text-sm font-medium text-textPrimary hover:bg-surfaceAlt/40 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </SettingsSection>

          <SettingsSection
            title="notifications"
            description="choose how flowguard should alert you about claim windows, threshold breaches, and signer activity."
            icon={Bell}
          >
            <NotificationToggle
              label="email - stream claim ready"
              description="send an email when a vesting tranche or payroll unlock is available to claim."
              icon={Mail}
              defaultChecked
            />
            <NotificationToggle
              label="email - threshold breach"
              description="alert when a budget plan, signer threshold, or rate limit is hit."
              icon={Mail}
              defaultChecked
            />
            <NotificationToggle
              label="email - signer approval requested"
              description="ping when another signer needs your approval on a co-signed action."
              icon={Mail}
            />
            <NotificationToggle
              label="webhook - workflow events"
              description="post a json payload to your endpoint for every workflow state change. configure in the integrations panel."
              icon={Webhook}
              disabled
            />
            <div className="pt-3">
              <p className="text-xs text-textMuted font-mono">
                email destination defaults to none. add a verified email under integrations to
                start receiving alerts.
              </p>
            </div>
          </SettingsSection>

          <SettingsSection
            title="data export"
            description="export your workspace data. flowguard stores no personal info beyond what you opt in to share - wallet address, optional email, and audit history."
            icon={Download}
          >
            <div className="p-4 rounded-xl bg-surfaceAlt/40 border border-border flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-brand300 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-textSecondary leading-relaxed">
                your covenants, streams, and receipts live on chain - you can always export them
                from the explorer. the dashboard export covers our derived state: workspace
                membership, signer aliases, notification preferences, and audit log.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-primary text-white text-sm font-medium hover:bg-primaryHover transition-colors"
              >
                <Download className="w-4 h-4" />
                Download workspace json
              </button>
              <a
                href={`${DOCS_SITE_URL}/legal/data-export`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-border text-sm font-medium text-textPrimary hover:bg-surfaceAlt/40 transition-colors"
              >
                Request gdpr export
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </SettingsSection>

          <SettingsSection
            title="danger zone"
            description="clear local state and sign out. this removes nothing on chain - your covenants, receipts, and balances stay intact."
            icon={ShieldAlert}
            tone="danger"
          >
            <div className="p-4 rounded-xl bg-red-50/60 border border-red-200 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700">what this actually does</p>
                <ul className="mt-2 space-y-1 text-sm text-red-700/90">
                  <li> -  clears your local browser storage for flowguard</li>
                  <li> -  removes any cached workspace selection</li>
                  <li> -  signs you out of the dashboard</li>
                  <li> -  does not delete any on-chain covenant or receipt</li>
                  <li> -  does not delete any notification email on file (use data export first)</li>
                </ul>
              </div>
            </div>
            {confirmDelete ? (
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClearLocalState}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Yes, clear and sign out
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-border text-sm font-medium text-textPrimary hover:bg-surfaceAlt/40 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-red-300 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear local state
                </button>
              </div>
            )}
          </SettingsSection>
        </div>
      </section>

      <section className="py-16 px-6 lg:px-12">
        <div className="max-w-3xl mx-auto p-6 rounded-2xl border border-border bg-surfaceAlt/30 flex items-start gap-4">
          <ShieldCheck className="w-6 h-6 text-brand300 mt-1 flex-shrink-0" />
          <div>
            <p className="font-semibold text-textPrimary mb-2">need to change something else?</p>
            <p className="text-sm text-textSecondary leading-relaxed mb-3">
              workspace-level changes - adding signers, rotating roles, changing approval
              thresholds - live in the workspace settings inside the dashboard, not on this
              account page.
            </p>
            <Link
              to="/help"
              className="inline-flex items-center gap-2 text-sm font-medium text-brand300 hover:text-brand300/80 transition-colors"
            >
              See the help center
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
