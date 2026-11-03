/**
 * One term per concept. `avoid` holds always-banned variants, read by the copy lint.
 * `avoidInContext` holds variants banned only under the bracketed condition; reviewers
 * check those by hand, because a plain string match would flag correct uses.
 */
import { IS_TEST_BUILD } from './network';

export type GlossaryHelp = { path: string; label: string };

export type GlossaryEntry = {
  use: string;
  firstMention?: string;
  /** Where TermHint's popover links for more. The label says where it goes. */
  help?: GlossaryHelp;
  avoid: readonly string[];
  avoidInContext: readonly string[];
};

export type GlossaryKey =
  | 'vault'
  | 'sharedFunds'
  | 'stream'
  | 'vesting'
  | 'payroll'
  | 'recurringPayment'
  | 'batch'
  | 'payManyPeople'
  | 'schedule'
  | 'scheduleChoices'
  | 'waitingPeriod'
  | 'release'
  | 'scheduleExamples'
  | 'spendingRequest'
  | 'budgetPlan'
  | 'spendingRules'
  | 'airdrop'
  | 'pool'
  | 'share'
  | 'claimLink'
  | 'bounty'
  | 'winner'
  | 'submission'
  | 'proofCode'
  | 'rewardProgram'
  | 'grant'
  | 'project'
  | 'milestone'
  | 'workspace'
  | 'organization'
  | 'personal'
  | 'member'
  | 'role'
  | 'listedUnderVault'
  | 'moneyOut'
  | 'explorer'
  | 'recipient'
  | 'sender'
  | 'signer'
  | 'signersRequired'
  | 'claim'
  | 'released'
  | 'readyToClaim'
  | 'releasedSoFar'
  | 'notReleasedYet'
  | 'fund'
  | 'lock'
  | 'addFunds'
  | 'deposit'
  | 'releaseMilestone'
  | 'sendPayment'
  | 'approve'
  | 'cancel'
  | 'pause'
  | 'changeRecipient'
  | 'approveInWallet'
  | 'signIn'
  | 'disconnect'
  | 'currency'
  | 'network'
  | 'testNetwork'
  | 'networkFee'
  | 'flowguardFee'
  | 'token'
  | 'tokenId'
  | 'receipt'
  | 'contract'
  | 'tokenPermission'
  | 'wallet'
  | 'address'
  | 'publicKey'
  | 'transaction'
  | 'servers'
  | 'whoCanMoveTheMoney'
  | 'proofList'
  | 'formatFamily'
  | 'linkingService'
  | 'qrCode'
  | 'beta'
  | 'sampleData'
  | 'openApp'
  | 'shareLink';

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  vault: {
    use: 'vault',
    firstMention: 'Shared money behind several approvals. It moves only when enough of its signers approve.',
    help: { path: '/security', label: 'Who can move the money' },
    avoid: ['treasury', 'treasury vault', 'multisig', 'multi-signer wallet', 'team money'],
    avoidInContext: ['safe (as a name for a vault)'],
  },
  sharedFunds: {
    use: 'shared funds',
    firstMention: 'Everything a team holds across its vaults.',
    avoid: ['treasury', 'treasuries'],
    avoidInContext: [],
  },
  stream: {
    use: 'stream',
    firstMention: "Money released bit by bit over time. The person you pay claims each part as it's released.",
    help: { path: '/how-it-works', label: 'How FlowGuard works' },
    avoid: ['vesting stream', 'payout stream', 'flow', 'stream shape'],
    avoidInContext: ['schedule (as the object)'],
  },
  vesting: {
    use: 'vesting',
    firstMention: 'Paying out tokens or BCH bit by bit, usually to a team member or investor.',
    avoid: ['vest', 'vested'],
    avoidInContext: ['vesting schedule (as an object)', 'vesting (as an app object, app nav item or status)'],
  },
  payroll: {
    use: 'payroll',
    firstMention: 'Paying your team on a schedule. In the app you set it up with "Pay many people".',
    avoid: ['payroll batch', 'payroll run', 'launch payroll'],
    avoidInContext: ['payroll (as an app object or button)'],
  },
  recurringPayment: {
    use: 'recurring payment',
    firstMention: 'The same amount on a fixed schedule, like every week or every 30 days. The person you pay claims each payment.',
    avoid: ['payment rail', 'payout stream', 'open-ended recurring stream', 'regular payments'],
    avoidInContext: ['payments (alone, when unclear)'],
  },
  batch: {
    use: 'batch',
    firstMention: 'Many streams set up in one go, one for each person.',
    avoid: ['batch run', 'payroll batch', 'lane', 'policy-approved batch'],
    avoidInContext: [],
  },
  payManyPeople: {
    use: 'pay many people',
    avoid: ['launch payroll batch', 'new batch run'],
    avoidInContext: [],
  },
  schedule: {
    use: 'schedule',
    firstMention: 'When the money is released and how much each time.',
    avoid: ['shape', 'cadence', 'stream shape', 'curve'],
    avoidInContext: [],
  },
  scheduleChoices: {
    use: 'All at once on a date, Evenly over time, Same amount each time. More schedules: Nothing until a date, then evenly; Part now, the rest over time; Custom dates',
    avoid: ['Equal steps', 'Regular payments', 'linear', 'hybrid', 'stepped', 'upfront', 'tranche schedule'],
    avoidInContext: ['step (as a schedule name)'],
  },
  waitingPeriod: {
    use: 'waiting period',
    firstMention: 'Time at the start when nothing is released.',
    avoid: ['cliff', 'start delay'],
    avoidInContext: [],
  },
  release: {
    use: 'release',
    firstMention: 'One amount that becomes ready to claim at a set time.',
    avoid: ['tranche', 'checkpoint', 'cycle'],
    avoidInContext: ['milestone (in streams)', 'period (alone)'],
  },
  scheduleExamples: {
    use: 'schedule examples',
    avoid: ['stream shapes', 'shape gallery'],
    avoidInContext: ['templates (alone)'],
  },
  spendingRequest: {
    use: 'spending request',
    firstMention: 'A payment from a vault that waits until enough signers approve it.',
    avoid: ['payout request', 'governance', 'governance proposal', 'treasury governance'],
    avoidInContext: ['motion (except the system setting "reduced motion")', 'proposal (in vault context)', 'request (alone)'],
  },
  budgetPlan: {
    use: 'budget plan',
    firstMention: 'Money from your wallet, released on a schedule you set and listed under a vault.',
    avoid: ['allowance'],
    avoidInContext: ['budget (alone)', 'Budget Plans (Title Case)'],
  },
  spendingRules: {
    use: 'spending rules',
    firstMention: "Limits you set for how much can leave a vault. In beta they're a plan only and aren't enforced.",
    avoid: ['policy', 'treasury policy', 'guardrails', 'lanes', 'routing'],
    avoidInContext: [],
  },
  airdrop: {
    use: 'airdrop',
    firstMention: 'BCH or tokens that many people can claim from one funded pool.',
    avoid: ['campaign', 'airdrop campaign', 'distribution', 'drop', 'token drop'],
    avoidInContext: [],
  },
  pool: {
    use: 'pool',
    firstMention: 'The money you put in once. Each claim or reward is paid out of it.',
    avoid: ['treasury', 'reserve'],
    avoidInContext: ['vault (for an airdrop)'],
  },
  share: {
    use: 'share',
    firstMention: 'The amount one wallet can claim from an airdrop. Each wallet can claim one share.',
    avoid: ['allocation', 'slot', 'entitlement'],
    avoidInContext: [],
  },
  claimLink: {
    use: 'claim link',
    firstMention:
      'A link you share so people find your airdrop. Anyone can claim, once per wallet, even without the link, because open airdrops are listed on FlowGuard.',
    avoid: ['campaign link', 'distribution link'],
    avoidInContext: [],
  },
  bounty: {
    use: 'bounty',
    firstMention: 'A prize locked up front and paid to each winner when the work is done.',
    avoid: ['bounty campaign', 'task', 'contest'],
    avoidInContext: [],
  },
  winner: {
    use: 'winner',
    firstMention: 'The person the sender picked to receive the prize.',
    avoid: [],
    avoidInContext: [],
  },
  submission: {
    use: 'submission',
    firstMention: 'Work someone sends in for a bounty. The sender reads it and picks the winners.',
    avoid: ['entry'],
    avoidInContext: ['proof (alone)'],
  },
  proofCode: {
    use: 'proof code',
    firstMention: 'A short code made from your work, so you can show later which work you sent.',
    avoid: ['sha256', 'digest', 'checksum'],
    avoidInContext: ['hash (alone)'],
  },
  rewardProgram: {
    use: 'reward program (object), reward (one payment)',
    firstMention:
      "A fund you use to pay people for things they did, like referrals or contributions. The sender sends each reward. There's nothing to claim.",
    avoid: ['reward campaign', 'tip', 'incentive batch'],
    avoidInContext: [],
  },
  grant: {
    use: 'grant',
    firstMention: 'Money promised to a project and released in steps as each milestone is done.',
    avoid: ['grant program', 'grant stream', 'distribution'],
    avoidInContext: [],
  },
  project: {
    use: 'project',
    avoid: ['grantee', 'applicant'],
    avoidInContext: [],
  },
  milestone: {
    use: 'milestone',
    firstMention: "One piece of work and the amount paid when it's done.",
    avoid: ['tranche', 'checkpoint'],
    avoidInContext: [],
  },
  workspace: {
    use: 'workspace',
    firstMention: 'Where you work in FlowGuard: Personal for your own money, Organization for a team.',
    avoid: ['mode', 'user mode', 'DAO mode', 'command center'],
    avoidInContext: [],
  },
  organization: {
    use: 'Organization (beta)',
    firstMention: "A shared space for a team's vaults and people. It shows sample data while in beta.",
    avoid: ['DAO', 'DAO mode', 'DAO (Beta)', 'DAO Beta', 'command center', 'multi-signer workspace'],
    avoidInContext: [],
  },
  personal: {
    use: 'Personal',
    firstMention: 'Your own streams, payments and vaults.',
    avoid: ['user mode'],
    avoidInContext: ['User (as the workspace name)'],
  },
  member: {
    use: 'member',
    avoid: ['approver'],
    avoidInContext: ['member (for vault approval)'],
  },
  role: {
    use: 'role',
    avoid: [],
    avoidInContext: [],
  },
  listedUnderVault: {
    use: 'listed under a vault, vault streams (the Organization page name)',
    firstMention: "A stream that shows on a vault's page. The money still comes from your wallet.",
    avoid: ['paid from the vault', 'vault-funded'],
    avoidInContext: [],
  },
  moneyOut: {
    use: 'money out',
    avoid: ['outflow', 'burn', 'spend rate'],
    avoidInContext: [],
  },
  explorer: {
    use: 'Explorer',
    firstMention: 'See FlowGuard activity on Bitcoin Cash. Anyone can check it.',
    avoid: ['activity feed', 'stream activity'],
    avoidInContext: ["block explorer (for FlowGuard's page)"],
  },
  recipient: {
    use: 'recipient',
    firstMention: 'The person who gets the money and claims it in their own wallet.',
    avoid: ['beneficiary', 'receiver', 'payee'],
    avoidInContext: [],
  },
  sender: {
    use: 'sender',
    firstMention: 'The wallet that set this up and put the money in.',
    avoid: ['creator', 'funder', 'payer', 'owner', 'issuer', 'sponsor'],
    avoidInContext: [],
  },
  signer: {
    use: 'signer',
    firstMention: 'A person whose wallet must approve payments from a vault.',
    avoid: ['keyholder', 'cosigner', 'approver'],
    avoidInContext: ['member (for vault approval)'],
  },
  signersRequired: {
    use: '2 of 3 signers must approve (always the numbers)',
    avoid: ['threshold', 'quorum', 'm-of-n'],
    avoidInContext: [],
  },
  claim: {
    use: 'claim',
    firstMention: "Move money that's ready into your wallet.",
    avoid: ['withdraw', 'collect', 'redeem'],
    avoidInContext: ["release (as the recipient's verb)"],
  },
  released: {
    use: 'released, is released',
    firstMention: 'Ready for the person you pay to claim. Until they claim it, it stays in the contract.',
    avoid: ['unlock', 'unlocked', 'vest', 'vested'],
    avoidInContext: ['vesting (as a verb)'],
  },
  readyToClaim: {
    use: 'ready to claim',
    firstMention: 'Released and waiting for you to claim it into your wallet.',
    avoid: ['claimable', 'withdrawable', 'vested balance'],
    avoidInContext: ['available (alone)'],
  },
  releasedSoFar: {
    use: 'released so far',
    avoid: ['vested'],
    avoidInContext: [],
  },
  notReleasedYet: {
    use: 'Not released yet (status pills), still to come (amounts, tiles and legends)',
    avoid: ['locked funds', 'unvested', 'not ready yet'],
    avoidInContext: ['later (as a label)'],
  },
  fund: {
    use: 'fund',
    firstMention: 'Send the money into the contract so the schedule can begin.',
    avoid: ['deploy', 'launch', 'initialize', 'activate'],
    avoidInContext: [],
  },
  lock: {
    use: 'lock, locked in a contract (in sentences only; buttons say Fund)',
    firstMention: 'Funding locks the money in a contract. It leaves only by the rules you set.',
    help: { path: '/security', label: 'Who can move the money' },
    avoid: ['freeze', 'stake'],
    avoidInContext: ['escrow (alone)'],
  },
  addFunds: {
    use: 'add funds',
    avoid: ['refill', 'top up', 'extend runway'],
    avoidInContext: [],
  },
  deposit: {
    use: 'deposit (vaults only)',
    avoid: ['top up'],
    avoidInContext: ['fund (for vaults)'],
  },
  releaseMilestone: {
    use: 'release a milestone',
    avoid: ['unlock milestone', 'pay tranche'],
    avoidInContext: [],
  },
  sendPayment: {
    use: 'send payment',
    avoid: ['execute', 'execute payout', 'execute request'],
    avoidInContext: [],
  },
  approve: {
    use: 'approve',
    firstMention: 'Say yes to a payment from a vault with your own wallet.',
    avoid: ['co-sign'],
    avoidInContext: ['sign (alone)'],
  },
  cancel: {
    use: 'cancel',
    firstMention: 'Ends it now. Money not yet released goes back to the sender.',
    avoid: ['revoke', 'terminate'],
    avoidInContext: ['stop (as the cancel action)', 'close (as a contract action)'],
  },
  pause: {
    use: 'pause, resume',
    firstMention: "Stops claims for now. Nothing moves until it's resumed.",
    avoid: ['hold', 'on hold', 'freeze', 'frozen'],
    avoidInContext: [],
  },
  changeRecipient: {
    use: 'change recipient',
    avoid: ['transfer', 'transfer stream'],
    avoidInContext: [],
  },
  approveInWallet: {
    use: 'approve in your wallet',
    avoid: ['sign the transaction', 'confirm transaction', 'broadcast'],
    avoidInContext: [],
  },
  signIn: {
    use: 'sign in',
    firstMention: "Your wallet signs a short message to prove it's yours. It's free and moves no money.",
    avoid: ['SIWX', 'authenticate', 'verify wallet ownership'],
    avoidInContext: [],
  },
  disconnect: {
    use: 'disconnect',
    avoid: ['sign out', 'log out'],
    avoidInContext: [],
  },
  currency: {
    use: 'BCH (Bitcoin Cash once per marketing page)',
    avoid: ['sats', 'satoshis'],
    avoidInContext: ['bitcoin (alone)'],
  },
  network: {
    use: 'Bitcoin Cash (on a test build, NETWORK_NAME from src/copy/network.ts)',
    firstMention: IS_TEST_BUILD
      ? 'A practice version of Bitcoin Cash. Its coins have no value.'
      : 'Payments here use real BCH.',
    avoid: ['mainnet', 'main net', 'BCH mainnet', 'on-chain', 'on chain', 'onchain', 'off-chain', 'blockchain'],
    avoidInContext: [],
  },
  testNetwork: {
    use: 'test network',
    firstMention: 'A practice version of Bitcoin Cash. Its coins have no value.',
    avoid: ['chipnet', 'testnet'],
    avoidInContext: [],
  },
  networkFee: {
    use: 'network fee',
    firstMention:
      'A small amount paid to the Bitcoin Cash network for each transaction, usually less than 0.0001 BCH.',
    avoid: ['gas', 'miner fee', 'transaction fee', 'sats', 'sat per byte'],
    avoidInContext: [],
  },
  flowguardFee: {
    use: 'FlowGuard adds no fee',
    avoid: ['protocol fee', 'zero-fee protocol'],
    avoidInContext: [],
  },
  token: {
    use: 'token',
    firstMention: "A coin created on Bitcoin Cash, like a project's token.",
    avoid: ['FT', 'fungible token'],
    avoidInContext: ['CashToken (in the app; CashTokens once on marketing pages is fine)'],
  },
  tokenId: {
    use: 'token ID',
    firstMention: 'The long code that identifies a token. You can copy it from your wallet.',
    avoid: ['category', 'category ID', 'CT prefix'],
    avoidInContext: [],
  },
  receipt: {
    use: 'receipt',
    firstMention: 'A token sent to your wallet as proof that something happened.',
    avoid: ['NFT', 'receipt NFT', 'state NFT', 'badge', 'mutable NFT'],
    avoidInContext: [],
  },
  contract: {
    use: 'contract',
    firstMention: 'Code on Bitcoin Cash that holds the money and only lets it move by the rules you set.',
    avoid: [
      'covenant',
      'CashScript covenant',
      'smart contract',
      'UTXO',
      'P2PKH',
      'P2SH',
      'P2SH32',
      'primitive',
      'primitives',
      'artifact',
      'oracle',
    ],
    avoidInContext: [],
  },
  tokenPermission: {
    use: "don't mention; if a form needs it, permission to create this token",
    avoid: ['mint authority', 'minting NFT', 'minting baton'],
    avoidInContext: [],
  },
  wallet: {
    use: 'wallet',
    firstMention: 'The app that holds your money and approves transactions, such as Paytaca or Cashonize.',
    avoid: ['account'],
    avoidInContext: ['signer (for the wallet)', 'extension (alone)'],
  },
  address: {
    use: 'address',
    firstMention: 'The code that starts with bitcoincash: where you receive money.',
    avoid: ['account', 'cashaddr'],
    avoidInContext: [],
  },
  publicKey: {
    use: 'public key',
    firstMention: "A code from a signer's wallet that lets the vault check their approvals.",
    avoid: ['pubkey', 'xpub'],
    avoidInContext: [],
  },
  transaction: {
    use: 'transaction',
    firstMention: 'A payment or change recorded on Bitcoin Cash. Your wallet approves each one.',
    avoid: ['tx', 'txid', 'tx hash', 'block'],
    avoidInContext: ['hash (alone)'],
  },
  servers: {
    use: "FlowGuard's servers",
    avoid: ['backend', 'indexer', 'executor', 'relayer'],
    avoidInContext: ['API (outside the developer links, such as "API reference")'],
  },
  whoCanMoveTheMoney: {
    use: 'Who can move the money (headings and cards)',
    avoid: ['custody model', 'authority mode', 'who can move this money'],
    avoidInContext: ['non-custodial (as a slogan)'],
  },
  proofList: {
    use: "don't mention",
    avoid: ['Merkle', 'Merkle proof', 'Merkle root', 'commitment', 'NFT commitment'],
    avoidInContext: [],
  },
  formatFamily: {
    use: "don't mention",
    avoid: ['CashScript', 'BCMR', 'PSBT', 'WalletConnect v2'],
    avoidInContext: [],
  },
  linkingService: {
    use: 'the service that links your wallet to FlowGuard',
    avoid: ['relay', 'relay server', 'wallet connection service', 'bridge'],
    avoidInContext: [],
  },
  qrCode: {
    use: 'QR code',
    firstMention: 'A square code you scan with your phone wallet to connect it.',
    avoid: ['pairing code', 'pairing URI'],
    avoidInContext: ['code (alone)'],
  },
  beta: {
    use: 'beta',
    firstMention: 'Still being tested. It may change, and some parts may not work yet.',
    avoid: ['alpha', 'preview'],
    avoidInContext: [],
  },
  sampleData: {
    use: 'sample data',
    firstMention: 'Made-up names and amounts that show how a page will look. None of it is on Bitcoin Cash.',
    avoid: ['demo data', 'seed data'],
    avoidInContext: ['live (for sample)'],
  },
  openApp: {
    use: 'open app',
    avoid: ['launch app', 'enter app', 'go to dashboard'],
    avoidInContext: [],
  },
  shareLink: {
    use: 'share link',
    avoid: [],
    avoidInContext: [],
  },
};

export function firstMention(term: GlossaryKey): string | undefined {
  return GLOSSARY[term].firstMention;
}

export function glossaryHelp(term: GlossaryKey): GlossaryHelp | undefined {
  return GLOSSARY[term].help;
}

export const ALWAYS_BANNED: readonly string[] = Array.from(
  new Set(Object.values(GLOSSARY).flatMap((entry) => entry.avoid)),
);
