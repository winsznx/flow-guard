import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  HelpCircle,
  Wallet,
  Shield,
  Coins,
  FileText,
  Search,
  Sparkles,
} from 'lucide-react';
import { Footer } from '../components/layout/Footer';
import { Input } from '../components/ui/Input';
import { SolutionsDropdown } from '../components/ui/SolutionsDropdown';
import { ResourcesDropdown } from '../components/ui/ResourcesDropdown';
import { PageMeta } from '../components/seo/PageMeta';
import { APP_SITE_URL, DOCS_SITE_URL } from '../utils/publicUrls';

interface FaqItem {
  q: string;
  a: string | string[];
}

interface FaqCategory {
  id: string;
  label: string;
  icon: typeof HelpCircle;
  intro: string;
  items: FaqItem[];
}

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: 'about',
    label: 'about flowguard',
    icon: HelpCircle,
    intro: 'what flowguard is, who it is for, and what kind of problems it tries to solve.',
    items: [
      {
        q: 'what is flowguard?',
        a: [
          'flowguard is a non-custodial treasury and payment layer for bitcoin cash. it lets teams and individuals lock funds into onchain rules that enforce themselves: vesting schedules, recurring payouts, spending caps, multi-signer approvals, distribution programs, and governance.',
          'we do not hold your keys. we do not move funds on your behalf. every state change happens through a bitcoin cash transaction that you (or a permitted signer) authorize from your own wallet.',
        ],
      },
      {
        q: 'who is flowguard for?',
        a: [
          'projects with a vesting cliff and a token holder list. daos with a shared treasury and approval requirements. employers paying contractors on a recurring schedule. teams running airdrops, bounties, rewards, or grants programs. solo operators who want their own savings or runway to follow a rule.',
          'if you have a pool of bch or cashtokens and the rules for how it should move are clearer than the people moving it, flowguard is for you.',
        ],
      },
      {
        q: 'why bitcoin cash and not ethereum or solana?',
        a: [
          'bitcoin cash gives us cheap settlement (sub-cent fees in practice), native scripting through cashscript, and a token standard (cashtokens) that lives at the utxo layer rather than as a smart-contract abstraction. that combination keeps custody decoupled from any single application contract.',
          'we are also drawn to a long-term floor on transaction fees. treasury workflows should not become unaffordable because a memecoin gets popular on the same chain.',
        ],
      },
    ],
  },
  {
    id: 'bch-cashtokens',
    label: 'bitcoin cash + cashtokens',
    icon: Coins,
    intro: 'a short primer on the network and token model flowguard sits on top of.',
    items: [
      {
        q: 'what is bitcoin cash?',
        a: [
          'bitcoin cash (bch) is a proof-of-work chain that forked from bitcoin in 2017. it kept utxos and added larger blocks and a richer scripting surface. for our purposes, bch gives us cheap, final settlement that can be programmed with cashscript.',
        ],
      },
      {
        q: 'what are cashtokens?',
        a: [
          'cashtokens are the native fungible and non-fungible token standard on bch, activated in 2023. unlike erc-20 or spl, cashtokens are not a contract on the chain - they are a property of the underlying utxo. that means a token output can carry both an amount and a piece of mutable nft state.',
          'flowguard uses cashtokens for receipt nfts (proof of a position in a stream or distribution), for distributing project tokens through vesting and airdrops, and for tracking covenant state on a single anchor utxo.',
        ],
      },
      {
        q: 'do i need a separate wallet for cashtokens?',
        a: [
          'any cashtokens-aware wallet works. paytaca and cashonize support the standard. legacy bch wallets that have not been updated for cashtokens may show the bch side correctly but ignore token outputs - do not use one for flowguard.',
        ],
      },
    ],
  },
  {
    id: 'wallets',
    label: 'wallets',
    icon: Wallet,
    intro: 'which wallets work, how to choose, and how recovery is handled.',
    items: [
      {
        q: 'which wallets does flowguard support?',
        a: [
          'paytaca is our recommended desktop and mobile wallet. cashonize works for browser-based flows. any wallet that supports cashtokens and can sign psbt-style transactions for bch will work, but the in-app flows are tuned for paytaca and cashonize.',
        ],
      },
      {
        q: 'i do not have a wallet yet. where do i start?',
        a: [
          'install paytaca from the chrome web store or your phone app store. write down the recovery phrase on paper. send a small amount of bch to your address from an exchange. then come back to flowguard and click launch app - the connect modal will detect your wallet.',
        ],
      },
      {
        q: 'what if i lose my wallet?',
        a: [
          'your recovery phrase is the only path back to the funds. flowguard cannot recover a wallet. if you can restore the seed phrase to a new device, your access to flowguard restores with it - your vaults, streams, receipts, and signatures are all keyed to your wallet address.',
          'we treat this seriously: every important page in the app surfaces the address that authority is bound to, and signature requests show the destination of any transaction you are approving.',
        ],
      },
      {
        q: 'can i recover lost cashtokens?',
        a: [
          'tokens that landed in a wallet address whose seed you no longer hold are gone. tokens that landed inside a flowguard vault or covenant are still controlled by the rules of that covenant - if the rule lets the right signer (or any signer) sweep them, they can still be reached. always test recipient addresses before sending tokens in volume.',
        ],
      },
      {
        q: 'can i use a hardware wallet?',
        a: [
          'paytaca supports a few hardware paths today, and ledger support for cashtokens is improving but still limited. for high-value treasuries we recommend a multi-signer setup where at least one signer is on a hardware device, rather than relying on a single hardware signature for everything.',
        ],
      },
    ],
  },
  {
    id: 'fees',
    label: 'fees',
    icon: Coins,
    intro: 'what flowguard costs and what miners cost.',
    items: [
      {
        q: 'does flowguard charge a fee?',
        a: [
          'no. flowguard does not take a percentage, a flat fee, or a spread on any transaction. the protocol is zero-fee.',
        ],
      },
      {
        q: 'what do i actually pay?',
        a: [
          'bch miner fees. these are paid in satoshis directly to whoever mines the block. a typical claim, deposit, or distribution transaction is somewhere between a few hundred and a few thousand satoshis - small fractions of a cent.',
          'for batch operations like an airdrop with thousands of recipients, you pay miner fees per output, which still ends up well below the cost of doing the same thing on most other chains.',
        ],
      },
      {
        q: 'who pays miner fees when funds are claimed?',
        a: [
          'by default, the claimer pays - same model as ethereum, where the receiver pays gas to take a transfer. for some flows (airdrops with a high recipient count, payroll for employees who do not hold bch), the creator can front the miner fees through a sponsor pattern. see the docs for the current state of fee fronting.',
        ],
      },
    ],
  },
  {
    id: 'security',
    label: 'safety',
    icon: Shield,
    intro: 'how custody works and what assumptions you need to make about flowguard, miners, and the network.',
    items: [
      {
        q: 'is my money safe?',
        a: [
          'your money is safe to the extent that bitcoin cash is safe, the cashscript covenant code is correct, and the signers you authorized are honest. flowguard cannot take your funds - we never have the keys.',
          'we publish our audit history, our remediation log, and the threat model on the security page. read it before locking large amounts.',
        ],
      },
      {
        q: 'what happens if flowguard the company disappears?',
        a: [
          'every vault, stream, and distribution is an onchain covenant. it does not need our backend to keep working. you can interact with your covenants from any cashtokens-aware wallet that can construct the right transaction, and the contract source is open. the website is a convenience layer, not a custodian.',
        ],
      },
      {
        q: 'what is the role of the off-chain executor?',
        a: [
          'some flows (timed claims, batched distributions, indexer-driven notifications) are served by a hosted executor. the executor cannot move funds it does not have permission to move - its role is liveness, not custody. if it is offline, you can still claim manually or run your own.',
        ],
      },
      {
        q: 'what happens during a chain reorg?',
        a: [
          'flowguard waits for a sensible number of confirmations before treating a state change as final in the ui. if the chain reorgs deeper than that, the indexer rewinds and re-derives state from the new tip. funds are never at risk from a reorg, only the displayed status.',
        ],
      },
    ],
  },
  {
    id: 'vesting',
    label: 'vesting math',
    icon: FileText,
    intro: 'how the onchain math works for streams and unlocks.',
    items: [
      {
        q: 'how does the onchain vesting math work?',
        a: [
          'each stream has a start time, a duration, a cliff, and a release shape (linear, stepped, exponential). when a claim transaction is built, the covenant computes the maximum claimable amount as a function of the current block timestamp and the schedule constants stored on the anchor utxo. anything beyond that maximum is rejected by the script.',
          'because the math runs inside the covenant, it does not rely on the ui being honest. an attacker who modifies the frontend cannot trick the contract into releasing more than the schedule allows.',
        ],
      },
      {
        q: 'what timestamps does the covenant use?',
        a: [
          'we use the median-time-past (mtp) of the current block, the same value used by bitcoin script timelocks. mtp is monotonically increasing across the chain, which is exactly what a vesting schedule needs.',
        ],
      },
      {
        q: 'can a stream be cancelled?',
        a: [
          'only if the creator opted in to a cancellable shape when they deployed it. cancellable streams revert their unvested balance back to the creator on cancel. irrevocable streams cannot be cancelled by anyone, including the creator - which is the right choice for investor unlocks and payroll commitments.',
        ],
      },
    ],
  },
  {
    id: 'surfaces',
    label: 'product surfaces',
    icon: Sparkles,
    intro: 'how vesting, airdrops, bounties, rewards, and grants differ.',
    items: [
      {
        q: 'what is the difference between vesting, airdrops, bounties, rewards, and grants?',
        a: [
          'vesting: a continuous or stepped release of an amount to a specific recipient over time. used for team unlocks, investor unlocks, payroll.',
          'airdrops: a distribution where many wallets can each claim a fixed (or merkle-proof-keyed) amount. used for go-to-market and user activation.',
          'bounties: a public posting where one or more contributors can claim a payout for completing a task. resolved by the creator or a delegated reviewer.',
          'rewards: a programmatic distribution to a list of recipients based on offchain data (leaderboard, referral graph, contribution score). similar to airdrops but typically recurring.',
          'grants: a milestone-gated payout where each tranche releases only after a reviewer attests that the milestone was met. used by daos funding builders.',
        ],
      },
      {
        q: 'can i combine these?',
        a: [
          'yes. a project doing a fair launch might run a token-sale vesting program for early backers, an airdrop for early users, a bounty program for documentation contributors, and a grant for an integration partner - all from the same dao treasury.',
        ],
      },
    ],
  },
  {
    id: 'receipts',
    label: 'receipts + bcmr',
    icon: FileText,
    intro: 'how receipt nfts and bcmr metadata fit into the model.',
    items: [
      {
        q: 'what is a receipt nft?',
        a: [
          'when you participate in a flowguard surface (open a stream, deposit into a vault, claim an airdrop position), the covenant mints a cashtokens nft to your wallet. that nft is the receipt. holding it is what proves you have a claim on the underlying funds.',
          'receipts can be transferred. if you sell or move a receipt nft, the new holder inherits the claim. this is how secondary markets for vested positions are possible without any extra contract logic.',
        ],
      },
      {
        q: 'what is bcmr?',
        a: [
          'bcmr (bitcoin cash metadata registry) is the standard for attaching name, ticker, icon, and other metadata to cashtokens. flowguard publishes bcmr entries for every receipt nft series it issues so wallets show meaningful labels instead of raw category ids.',
        ],
      },
      {
        q: 'what does the receipt nft contain?',
        a: [
          'the immutable category id identifies the issuing covenant. the mutable nft commitment stores schedule constants (start, duration, total amount) and a position index. wallets show this through bcmr; the covenant reads it to validate claims.',
        ],
      },
    ],
  },
];

function answerText(a: string | string[]): string {
  return Array.isArray(a) ? a.join(' ') : a;
}

function itemMatches(item: FaqItem, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    item.q.toLowerCase().includes(needle) ||
    answerText(item.a).toLowerCase().includes(needle)
  );
}

export default function FaqPage() {
  const [query, setQuery] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string>(FAQ_CATEGORIES[0].id);
  const [openItems, setOpenItems] = useState<Record<string, number>>({
    [FAQ_CATEGORIES[0].id]: 0,
  });

  const filteredCategories = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return FAQ_CATEGORIES;
    return FAQ_CATEGORIES
      .map((cat) => ({ ...cat, items: cat.items.filter((it) => itemMatches(it, trimmed)) }))
      .filter((cat) => cat.items.length > 0);
  }, [query]);

  const totalMatches = useMemo(
    () => filteredCategories.reduce((acc, c) => acc + c.items.length, 0),
    [filteredCategories],
  );

  const current = useMemo(() => {
    if (filteredCategories.length === 0) return null;
    return (
      filteredCategories.find((c) => c.id === activeCategory) ?? filteredCategories[0]
    );
  }, [filteredCategories, activeCategory]);

  function toggle(categoryId: string, idx: number) {
    setOpenItems((prev) => ({
      ...prev,
      [categoryId]: prev[categoryId] === idx ? -1 : idx,
    }));
  }

  return (
    <main className="bg-background min-h-screen">
      <PageMeta
        title="FAQ"
        description="Answers to the most common questions about FlowGuard, Bitcoin Cash, CashTokens, wallets, fees, security, and on-chain vesting."
        path="/faq"
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
            <ResourcesDropdown />
            <a href={APP_SITE_URL}>
              <button className="bg-primary text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-primaryHover transition-all shadow-lg hover:shadow-xl">
                Launch App
              </button>
            </a>
          </div>
        </div>
      </nav>

      <section className="pt-28 pb-6 px-6 lg:px-12">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surfaceAlt/50 border border-border mb-4">
            <HelpCircle className="w-3.5 h-3.5 text-brand300" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-textSecondary">
              help center
            </span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl mb-3 text-textPrimary leading-tight">
            frequently asked questions
          </h1>
          <p className="text-base text-textSecondary max-w-3xl">
            everything you might want to ask before locking real money into an onchain rule.
            search across every topic, or browse by category.
          </p>
        </div>
      </section>

      <div className="sticky top-20 z-40 bg-background/90 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-4xl mx-auto px-6 lg:px-12 py-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted pointer-events-none z-10" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search every question and answer..."
              aria-label="search faq"
              className="pl-11"
            />
          </div>
          {query.trim() && totalMatches > 0 && (
            <p className="mt-2 text-xs font-mono text-textMuted">
              {totalMatches} match{totalMatches === 1 ? '' : 'es'} across {filteredCategories.length} categor{filteredCategories.length === 1 ? 'y' : 'ies'}
            </p>
          )}
        </div>
      </div>

      <section className="px-6 lg:px-12 pt-10 pb-20">
        <div className="max-w-6xl mx-auto">
          {current === null ? (
            <div className="max-w-2xl mx-auto text-center border border-border rounded-2xl bg-surface px-8 py-16">
              <Search className="w-8 h-8 text-textMuted mx-auto mb-4" />
              <p className="font-display text-xl text-textPrimary mb-2">
                no questions match "{query.trim()}"
              </p>
              <p className="text-sm text-textSecondary">
                try a shorter keyword, or clear the search to browse by category.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-10">
              <aside className="lg:sticky lg:top-44 lg:self-start">
                <p className="text-xs font-mono uppercase tracking-wider text-textMuted mb-4">
                  categories
                </p>
                <nav className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible">
                  {filteredCategories.map((cat) => {
                    const Icon = cat.icon;
                    const active = cat.id === current.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left text-sm transition-colors whitespace-nowrap ${
                          active
                            ? 'border-brand300/60 bg-brand300/10 text-textPrimary'
                            : 'border-border bg-surface text-textSecondary hover:text-textPrimary hover:border-brand300/30'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 ${active ? 'text-brand300' : 'text-textMuted'}`}
                        />
                        <span className="flex-1">{cat.label}</span>
                        <span className="text-[10px] font-mono text-textMuted">
                          {cat.items.length}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </aside>

              <div>
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="mb-6"
                >
                  <h2 className="font-display text-2xl sm:text-3xl text-textPrimary mb-2">{current.label}</h2>
                  <p className="text-textSecondary">{current.intro}</p>
                </motion.div>

                <div className="space-y-3">
                  {current.items.map((item, idx) => {
                    const isOpen = openItems[current.id] === idx;
                    return (
                      <motion.div
                        key={`${current.id}-${idx}-${item.q}`}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        className={`bg-surface border rounded-2xl overflow-hidden transition-colors ${
                          isOpen ? 'border-brand300/60' : 'border-border hover:border-brand300/30'
                        }`}
                      >
                        <button
                          onClick={() => toggle(current.id, idx)}
                          className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                        >
                          <span
                            className={`font-display text-lg transition-colors ${
                              isOpen ? 'text-brand300' : 'text-textPrimary'
                            }`}
                          >
                            {item.q}
                          </span>
                          <motion.div
                            animate={{ rotate: isOpen ? 180 : 0 }}
                            transition={{ duration: 0.25 }}
                            className="shrink-0"
                          >
                            <ChevronDown
                              className={`w-5 h-5 transition-colors ${
                                isOpen ? 'text-brand300' : 'text-textMuted'
                              }`}
                            />
                          </motion.div>
                        </button>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              key="answer"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.28, ease: 'easeInOut' }}
                              className="overflow-hidden"
                            >
                              <div className="px-6 pb-6 space-y-3 text-textSecondary leading-relaxed">
                                {Array.isArray(item.a) ? (
                                  item.a.map((p, pi) => <p key={pi}>{p}</p>)
                                ) : (
                                  <p>{item.a}</p>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
