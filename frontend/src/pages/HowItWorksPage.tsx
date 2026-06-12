import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Wallet,
  Lock,
  Boxes,
  Users,
  Receipt,
  Layers,
} from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { SolutionsDropdown } from '../components/ui/SolutionsDropdown';
import { ResourcesDropdown } from '../components/ui/ResourcesDropdown';
import { NoiseBackground } from '../components/ui/NoiseBackground';
import { PageMeta } from '../components/seo/PageMeta';
import { APP_SITE_URL, DOCS_SITE_URL } from '../utils/publicUrls';

interface Section {
  id: string;
  eyebrow: string;
  title: string;
  icon: typeof Wallet;
  paragraphs: string[];
  bullets: { label: string; detail: string }[];
}

const SECTIONS: Section[] = [
  {
    id: 'wallets-not-servers',
    eyebrow: '01 - custody',
    title: 'wallets, not servers',
    icon: Wallet,
    paragraphs: [
      'flowguard never holds your keys. every action that moves funds, depositing into a vault, creating a stream, claiming a payout, sweeping a refund, is a bitcoin cash transaction signed by your own wallet. we cannot reverse it. we cannot move funds without your signature. we cannot pause your stream because we disagree with you.',
      'the flowguard server exists to make this convenient. it indexes the chain, calculates schedules, hands you pre-built transactions to sign, and remembers your team. but the source of truth is the chain, and the source of authority is your wallet.',
    ],
    bullets: [
      {
        label: 'self-custody by default',
        detail: 'no seed phrases, no exports, no escrow accounts. your wallet is the only place a private key ever exists.',
      },
      {
        label: 'wallet-bound sessions',
        detail: 'session tokens are signed by your wallet on login. they cannot be replayed against a different address.',
      },
      {
        label: 'offline-safe',
        detail: 'if flowguard.cash goes dark, your funds are still claimable. the covenant rules live on bch, not on our server.',
      },
    ],
  },
  {
    id: 'covenants',
    eyebrow: '02 - rules on chain',
    title: 'covenants on-chain',
    icon: Lock,
    paragraphs: [
      'a flowguard vault is a covenant, a bitcoin cash utxo locked by a cashscript contract. the script encodes the rules of the workflow: who can spend, when they can spend, what fraction is unlocked, and what the refund path is. the rules are part of the address. once funds are sent to that address, the rules apply to every output that spends from it.',
      'this is fundamentally different from an eoa with a multisig wrapper. there is no off-chain ruleset that a malicious signer can ignore. the script must be satisfied for the spend to be mined at all. if your covenant says payouts unlock linearly over 18 months, then a spend that tries to take 100% on day one is invalid as a bitcoin cash transaction and miners will reject it.',
    ],
    bullets: [
      {
        label: 'rules baked into the address',
        detail: 'the locking script is the address. you cannot change one without changing the other.',
      },
      {
        label: 'no protocol kill switch',
        detail: 'we do not have an admin key, a pause flag, a migration hook, or a fee skim. there is nothing to compromise.',
      },
      {
        label: 'auditable bytecode',
        detail: 'every covenant template is open source. the bytecode you sign over is reproducible from the published source.',
      },
    ],
  },
  {
    id: 'mutable-nft-state',
    eyebrow: '03 - mutable state',
    title: 'mutable nft state',
    icon: Boxes,
    paragraphs: [
      'long-running workflows like vesting, streams, and grants need state that updates over time: how much has been claimed, what the next unlock height is, which recipients have been paid. on most chains that state lives in a contract storage slot. on bitcoin cash, cashtokens give us a different option: state lives on the utxo itself.',
      'flowguard parks a single anchor utxo per workflow. that utxo carries a non-fungible cashtoken with a small payload in its commitment field, the mutable state. every legal action on the workflow consumes the anchor utxo and produces a new one with updated state. the chain enforces a single, ordered history of state transitions without us having to lean on any off-chain ordering authority.',
    ],
    bullets: [
      {
        label: 'one anchor utxo per workflow',
        detail: 'a stream, a vault, a budget plan, each owns a single anchor whose history is the workflow history.',
      },
      {
        label: 'commitment-encoded payload',
        detail: 'state changes are compact: typically tens of bytes, not a contract-storage write.',
      },
      {
        label: 'no race conditions',
        detail: 'utxo consumption is atomic. two conflicting transitions cannot both be mined.',
      },
    ],
  },
  {
    id: 'authority-models',
    eyebrow: '04 - who can act',
    title: 'authority models',
    icon: Users,
    paragraphs: [
      'flowguard supports two authority models out of the box. the right choice depends on the trust profile of the workflow. a personal vesting schedule for a single founder is almost always creator-only. a treasury holding a daos working capital almost always wants co-signers.',
      'in either case, authority is a property of the covenant, encoded as a set of public keys in the locking script. you cannot add a signer after the fact without migrating to a new covenant. that is a deliberate constraint: a workflow whose signer set could change silently is a workflow whose security depends on a moderator, not on the chain.',
    ],
    bullets: [
      {
        label: 'creator-only',
        detail: 'a single signer authorizes all actions. simplest model. appropriate for personal savings, single-founder vesting, or self-paid streams.',
      },
      {
        label: 'm-of-n co-signers',
        detail: 'a threshold of signers must approve. appropriate for daos, multi-founder treasuries, and any workflow with shared accountability.',
      },
      {
        label: 'role-bound permissions',
        detail: 'some flows expose narrower roles, for example, a claimant whose only power is to take their own scheduled payout.',
      },
    ],
  },
  {
    id: 'receipts-bcmr',
    eyebrow: '05 - proof of position',
    title: 'receipt nfts and bcmr',
    icon: Receipt,
    paragraphs: [
      'when you become a recipient in a flowguard workflow, a vesting allocation, a payroll seat, an airdrop entry, a bounty winner, you receive a receipt nft. the receipt is a cashtokens nft that proves your position on chain. it lives in your wallet. it can be transferred (where the workflow allows). it is the artifact you present when you claim.',
      'the receipt is decorated with bcmr metadata so wallets render it with a real name, a workflow icon, and a description of what it represents. bcmr (bitcoin cash metadata registry) is an off-chain pointer that turns a token category id into a human-readable identity. flowguard publishes a signed registry per workflow so receipts show up correctly across every cashtokens-aware wallet.',
    ],
    bullets: [
      {
        label: 'self-sovereign proof',
        detail: 'no flowguard account is required to hold or transfer a receipt. it is a token in your wallet.',
      },
      {
        label: 'wallet-rendered identity',
        detail: 'bcmr maps category ids to icons and titles so a receipt is not just a hex blob.',
      },
      {
        label: 'composable',
        detail: 'receipt nfts can be used in other protocols as collateral, as voting weight, or as eligibility checks.',
      },
    ],
  },
];

interface Transition {
  step: string;
  stage: string;
  source: string;
  fn: string;
  summary: string;
  code: string[];
  before: { status: string; payload: string };
  after: { status: string; payload: string };
}

const TRANSITIONS: Transition[] = [
  {
    step: '01',
    stage: 'create',
    source: 'VaultCovenant.cash',
    fn: 'deploy',
    summary: 'covenant address derives from compiled bytecode. parameters become part of the script hash; no admin can mutate them later.',
    code: [
      'contract VaultCovenant(',
      '    bytes32 vaultId, int requiredApprovals,',
      '    bytes20 signer1Hash, ..., int periodCap',
      ')',
    ],
    before: { status: '(no utxo)', payload: 'address only' },
    after: { status: '0x00 ACTIVE', payload: 'period_id=0, spent=0' },
  },
  {
    step: '02',
    stage: 'fund',
    source: 'AirdropCovenant.cash',
    fn: 'claim',
    summary: 'first claim verifies the backend co-sig and clamps cumulative payout to the pool ceiling baked into the script.',
    code: [
      'require(hash160(claimAuthPubkey) == claimAuthorityHash);',
      'require(checkSig(claimAuthSig, claimAuthPubkey));',
      'require(newTotalClaimed <= totalPool);',
    ],
    before: { status: '0x00 ACTIVE', payload: 'total_claimed=0, count=0' },
    after: { status: '0x00 ACTIVE', payload: 'total_claimed+=amt, count+=1' },
  },
  {
    step: '03',
    stage: 'claim',
    source: 'VestingCovenant.cash',
    fn: 'claim',
    summary: 'recipient signature is checked against the commitment. cliff and proportional vesting math run inside the script before payout.',
    code: [
      'require(hash160(recipientPubkey) == recipient);',
      'require(checkSig(recipientSig, recipientPubkey));',
      'require(tx.locktime >= cliffTimestamp);',
    ],
    before: { status: '0x00 ACTIVE', payload: 'total_released=R' },
    after: { status: '0x00 / 0x03', payload: 'total_released=R+claimable' },
  },
  {
    step: '04',
    stage: 'pause',
    source: 'VestingCovenant.cash',
    fn: 'pause',
    summary: 'sender flips status to PAUSED and stamps tx.locktime as pause_start so resume can subtract paused time from the schedule.',
    code: [
      'require(hash160(senderPubkey) == senderHash);',
      'require((flagsByte & 0x01) == 0x01);',
      'require(status == 0);',
    ],
    before: { status: '0x00 ACTIVE', payload: 'pause_start=0' },
    after: { status: '0x01 PAUSED', payload: 'pause_start=tx.locktime' },
  },
  {
    step: '05',
    stage: 'close',
    source: 'VestingCovenant.cash',
    fn: 'complete',
    summary: 'permissionless cleanup after endTimestamp. unvested remainder returns to the recipient hash recorded in the commitment.',
    code: [
      'require(status == 0 || status == 1);',
      'require(tx.locktime >= endTimestamp);',
      'require(completeFee >= 0 && completeFee <= 2000);',
    ],
    before: { status: '0x00 / 0x01', payload: 'total_released < totalAmount' },
    after: { status: '(utxo spent)', payload: 'remainder paid to recipient' },
  },
];

export default function HowItWorksPage() {
  return (
    <main className="bg-background min-h-screen">
      <PageMeta
        title="How FlowGuard Works"
        description="The covenant lifecycle, custody model, mutable NFT state, authority modes, and receipt NFTs that make FlowGuard a self-custodial treasury layer on Bitcoin Cash."
        path="/how-it-works"
      />

      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/30 h-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 h-full flex justify-between items-center">
          <Link to="/">
            <img src="/assets/flow-green.png" alt="FlowGuard" className="h-8 object-contain" />
          </Link>
          <div className="hidden md:flex items-center space-x-10">
            <Link
              to="/"
              className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors"
            >
              Home
            </Link>
            <SolutionsDropdown />
            <a
              href={DOCS_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors"
            >
              Developers
            </a>
            <Link
              to="/security"
              className="text-sm font-medium text-textSecondary hover:text-textPrimary transition-colors"
            >
              Security
            </Link>
            <ResourcesDropdown />
            <a href={APP_SITE_URL}>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-primary text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-primaryHover transition-all shadow-lg hover:shadow-xl"
              >
                Launch App
              </motion.button>
            </a>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-12 px-6 lg:px-12">
        <div className="max-w-3xl mx-auto text-center">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs font-mono uppercase tracking-[0.2em] text-brand300 mb-4"
          >
            covenant lifecycle / require() by require()
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="font-display text-4xl md:text-6xl mb-5 text-textPrimary leading-[1.05]"
          >
            how a flowguard covenant moves through its five states
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-base md:text-lg text-textSecondary leading-relaxed"
          >
            each transition is enforced by literal require() lines in our cashscript and recorded as a byte-level edit to the anchor nft commitment.
          </motion.p>
        </div>
      </section>

      <section className="pb-20 px-6 lg:px-12">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl border border-border bg-surface/60 divide-y divide-border overflow-hidden">
            {TRANSITIONS.map((t, idx) => (
              <motion.article
                key={t.step}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4, delay: idx * 0.04 }}
                className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-6 lg:gap-10 p-6 lg:p-8"
              >
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-mono text-textMuted tracking-widest">{t.step}</span>
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-brand300">
                      {t.fn}()
                    </span>
                  </div>
                  <h3 className="font-display text-2xl md:text-3xl text-textPrimary lowercase mb-2">
                    {t.stage}
                  </h3>
                  <p className="text-xs font-mono text-textMuted mb-4">
                    {t.source}
                  </p>
                  <p className="text-sm text-textSecondary leading-relaxed">{t.summary}</p>
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-background/80 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surfaceAlt/40">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-textMuted">
                        require()
                      </span>
                      <span className="text-[10px] font-mono text-textMuted">
                        cashscript
                      </span>
                    </div>
                    <pre className="font-mono text-[12.5px] leading-relaxed text-textPrimary px-4 py-3 overflow-x-auto">
                      {t.code.map((line, i) => (
                        <div key={i} className="whitespace-pre">
                          <span className="text-textMuted select-none mr-3">{String(i + 1).padStart(2, '0')}</span>
                          <span>{line}</span>
                        </div>
                      ))}
                    </pre>
                  </div>

                  <div className="rounded-lg border border-border bg-background/80 overflow-hidden">
                    <div className="grid grid-cols-[64px_1fr_1.4fr] text-[10px] font-mono uppercase tracking-wider text-textMuted bg-surfaceAlt/40 border-b border-border">
                      <div className="px-3 py-2">state</div>
                      <div className="px-3 py-2 border-l border-border">status byte</div>
                      <div className="px-3 py-2 border-l border-border">commitment payload</div>
                    </div>
                    <div className="grid grid-cols-[64px_1fr_1.4fr] text-xs font-mono text-textSecondary border-b border-border">
                      <div className="px-3 py-3 text-textMuted">before</div>
                      <div className="px-3 py-3 border-l border-border text-textPrimary">{t.before.status}</div>
                      <div className="px-3 py-3 border-l border-border">{t.before.payload}</div>
                    </div>
                    <div className="grid grid-cols-[64px_1fr_1.4fr] text-xs font-mono text-textSecondary">
                      <div className="px-3 py-3 text-brand300">after</div>
                      <div className="px-3 py-3 border-l border-border text-textPrimary">{t.after.status}</div>
                      <div className="px-3 py-3 border-l border-border">{t.after.payload}</div>
                    </div>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>

          <p className="text-xs font-mono text-textMuted mt-6 text-center">
            source: contracts/core/streaming/VestingCovenant.cash, distribution/AirdropCovenant.cash, treasury/VaultCovenant.cash
          </p>
        </div>
      </section>

      {SECTIONS.map((section, idx) => {
        const Icon = section.icon;
        const isEven = idx % 2 === 0;
        return (
          <section
            key={section.id}
            id={section.id}
            className={`py-20 px-6 lg:px-12 ${isEven ? '' : 'bg-surfaceAlt/30'}`}
          >
            <div className="max-w-4xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-3">
                  {section.eyebrow}
                </p>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-brand300/10 border border-brand300/30 flex items-center justify-center">
                    <Icon className="w-6 h-6 text-brand300" />
                  </div>
                  <h2 className="font-display text-3xl md:text-4xl text-textPrimary">
                    {section.title}
                  </h2>
                </div>
                <div className="space-y-4 mb-8">
                  {section.paragraphs.map((p) => (
                    <p key={p.slice(0, 24)} className="text-base text-textSecondary leading-relaxed">
                      {p}
                    </p>
                  ))}
                </div>
                <div className="space-y-3">
                  {section.bullets.map((b) => (
                    <div
                      key={b.label}
                      className="p-4 rounded-xl border border-border bg-surface"
                    >
                      <p className="font-mono text-xs uppercase tracking-wider text-brand300 mb-1">
                        {b.label}
                      </p>
                      <p className="text-sm text-textSecondary leading-relaxed">{b.detail}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </section>
        );
      })}

      <section className="relative overflow-hidden py-24 px-6 lg:px-12 bg-brand300/5">
        <NoiseBackground />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <h2 className="font-display text-4xl md:text-5xl mb-6 text-textPrimary">
            ready to put a rule on your treasury?
          </h2>
          <p className="text-xl text-textSecondary mb-10 leading-relaxed">
            launch the app, connect your wallet, and create your first covenant. you keep the
            keys. we hand you the tools.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href={APP_SITE_URL}>
              <button className="group bg-primary text-white px-12 py-6 rounded-full text-lg font-bold hover:bg-primaryHover transition-all shadow-2xl flex items-center gap-3 mx-auto">
                Launch App
                <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
              </button>
            </a>
            <a
              href={`${DOCS_SITE_URL}/concepts`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <button className="border-2 border-border text-textPrimary px-12 py-6 rounded-full text-lg font-bold hover:border-primary hover:bg-surfaceAlt/30 transition-all">
                Read the docs
              </button>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
