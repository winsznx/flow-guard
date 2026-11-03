import { WalletType } from '../types/wallet';
import { MOMENTS } from './common';

export type WalletEntry = {
  name: string;
  line: string;
  getUrl?: string;
  getLabel?: string;
};

/** The one place wallet names and picker lines are written. The picker, menus and Settings read it. */
export const WALLETS: Record<WalletType, WalletEntry> = {
  [WalletType.PAYTACA]: {
    name: 'Paytaca',
    line: 'Browser extension or phone app. Scan a QR code to connect.',
    getUrl: 'https://www.paytaca.com',
    getLabel: 'Get Paytaca',
  },
  [WalletType.CASHONIZE]: {
    name: 'Cashonize',
    line: 'Web or phone wallet. Scan a QR code, or open the link in Cashonize.',
    getUrl: 'https://cashonize.com',
    getLabel: 'Get Cashonize',
  },
  [WalletType.WALLETCONNECT]: {
    name: 'WalletConnect',
    line: 'Scan a QR code with your wallet app.',
  },
  [WalletType.OPTN]: {
    name: 'OPTN',
    line: 'Scan a QR code with the OPTN app. OPTN uses the first address in your wallet for every FlowGuard action.',
    getUrl: 'https://www.optnlabs.com/',
    getLabel: 'Get OPTN',
  },
  [WalletType.WIZARDCONNECT]: {
    name: 'WizardConnect',
    line: 'Scan a QR code with the Paytaca phone app.',
    getUrl: 'https://www.paytaca.com',
    getLabel: 'Get Paytaca',
  },
};

/** Picker row for the WalletConnect option that isn't Paytaca. */
export const OTHER_PHONE_WALLETS: WalletEntry = {
  name: 'Zapit, Selene and other phone wallets',
  line: 'Scan a QR code with your wallet app.',
};

export const UNKNOWN_WALLET_NAME = 'Unknown wallet';

/** Text FlowGuard sends to the wallet app (VOICE_AND_COPY.md 3.14). */
export const WALLET_PROMPTS = {
  appDescription: 'FlowGuard: pay people and share money on Bitcoin Cash',
  fund: 'Approve this payment from FlowGuard',
  transaction: 'Approve this FlowGuard transaction',
  signInMessage: 'Sign in to FlowGuard. This is free and moves no money.',
  signInProof: "Sign in to FlowGuard. This proves the wallet is yours. It's never sent to the network and moves no money.",
  disconnected: 'Disconnected from FlowGuard',
  replaced: 'Replaced by a newer FlowGuard session',
} as const;

/** Shown in the app just before the wallet asks for a sign-in. */
export const SIGN_IN_NOTICE = {
  title: 'Sign in to FlowGuard',
  line: "Your wallet will ask you to sign in. It's free and moves no money.",
} as const;

export const PAIRING = {
  closeLabel: 'Close and stop connecting',
  copyFailed: "Couldn't copy. Select the link and copy it.",
  linkLabel: 'Connection link',
  qrLoading: 'Drawing the QR code',
  qrFailed: "Couldn't draw the QR code. Copy the link instead.",
  cashonize: {
    title: 'Connect Cashonize',
    line: 'Scan this QR code with the Cashonize app, or open the link in Cashonize on the web.',
    qrCaption: 'QR code to connect Cashonize',
    steps: ['Open Cashonize on your phone.', 'Tap the scan button.', 'Scan this QR code.'],
    openLabel: 'Open in Cashonize',
    missing: "Don't have it yet?",
  },
  walletconnect: {
    title: 'Connect your wallet',
    line: 'Scan this QR code with Paytaca, Zapit, Selene or another WalletConnect wallet.',
    qrCaption: 'QR code to connect your wallet',
    openLabel: 'Open in your wallet app',
  },
  optn: {
    title: 'Connect OPTN',
    line: 'Scan this QR code with the OPTN app. OPTN uses the first address in your wallet.',
    qrCaption: 'QR code to connect OPTN',
    openLabel: 'Open in OPTN',
  },
  wizardconnect: {
    title: 'Connect with WizardConnect',
    line: 'In the Paytaca app, open Apps, then WizardConnect, and scan this QR code.',
    qrCaption: 'QR code to connect with WizardConnect',
    beta: 'Beta. Works with the Paytaca phone app only for now.',
  },
} as const;

/** Titles of the transaction toast, one per action. The toast line says whether it's confirmed. */
export const TX_NOTICES = {
  sent: MOMENTS.transactionSent,
  walletReady: 'Wallet ready',
  requestCreated: 'Spending request created',
  requestApproved: 'Spending request approved',
  paymentSent: 'Payment sent',
  vaultDeposit: 'Deposit sent',
  streamFunded: 'Stream funded',
  streamsFunded: 'Streams funded',
  streamClaimed: 'Claimed from stream',
  streamCancelled: 'Stream cancelled',
  streamPaused: 'Stream paused',
  streamResumed: 'Stream resumed',
  streamFundsAdded: 'Funds added to stream',
  streamRecipientChanged: 'Stream recipient changed',
  paymentFunded: 'Recurring payment funded',
  paymentClaimed: 'Payment claimed',
  paymentPaused: 'Recurring payment paused',
  paymentResumed: 'Recurring payment resumed',
  paymentCancelled: 'Recurring payment cancelled',
  airdropFunded: 'Airdrop funded',
  airdropClaimed: 'Airdrop claimed',
  airdropPaused: 'Airdrop paused',
  airdropResumed: 'Airdrop resumed',
  airdropCancelled: 'Airdrop cancelled',
  budgetFunded: 'Budget plan funded',
  budgetReleased: 'Budget plan release sent',
  budgetPaused: 'Budget plan paused',
  budgetResumed: 'Budget plan resumed',
  budgetCancelled: 'Budget plan cancelled',
  rewardFunded: 'Reward program funded',
  rewardSent: 'Reward sent',
  rewardPaused: 'Reward program paused',
  rewardResumed: 'Reward program resumed',
  rewardCancelled: 'Reward program cancelled',
  grantFunded: 'Grant funded',
  grantMilestoneReleased: 'Milestone released',
  grantPaused: 'Grant paused',
  grantResumed: 'Grant resumed',
  grantCancelled: 'Grant cancelled',
  grantRecipientChanged: 'Grant recipient changed',
  bountyFunded: 'Bounty funded',
  bountyWinnerPaid: 'Winner paid',
  bountyPaused: 'Bounty paused',
  bountyResumed: 'Bounty resumed',
  bountyCancelled: 'Bounty cancelled',
} as const;
