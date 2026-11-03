import { APP_PATHS, CLOSING_FACTS, MARKETING_COPY, MARKETING_PATHS, appLink } from './solutions/shared';

function configuredTestAppUrl(): string | null {
  const value: unknown = import.meta.env.VITE_TEST_APP_URL;
  return typeof value === 'string' && value.startsWith('https://') ? value : null;
}

/** Set only when a test network build of the app is deployed. Without it the page never mentions the test network. */
export const TEST_APP_URL = configuredTestAppUrl();

export const DEMO_HERO = {
  eyebrow: 'Try it',
  headline: 'Try it with',
  accent: 'a small amount',
  lead: 'Send a small amount of BCH to yourself on a short schedule, watch it release, then cancel it and get the rest back.',
  primary: { label: 'Create stream', href: appLink(APP_PATHS.createStream) },
  secondary: { label: 'See the steps', href: '#steps' },
  note: MARKETING_COPY.whatYouNeed,
};

export const DEMO_NEEDS = {
  eyebrow: 'Before you start',
  title: 'What you need',
  items: [
    {
      title: 'A Bitcoin Cash wallet',
      body: 'Paytaca or Cashonize, or another wallet that connects with WalletConnect.',
    },
    {
      title: 'A little BCH',
      body: 'Enough for the amount you stream to yourself, plus about 0.002 BCH. Funding puts a little extra BCH in the contract to pay the network fee on each claim.',
    },
    {
      title: 'A day, on and off',
      body: 'The stream releases over 1 day. Money becomes ready to claim about 2 hours after the schedule reaches it, because the network needs that time before it accepts the claim. So you come back later for the claim.',
    },
  ],
  realMoney: {
    title: 'This uses real BCH',
    body: "The stream goes to your own address, so the money comes back to you. You spend only the network fees, and what's left of the extra BCH for fees comes back when you cancel.",
  },
  getWallet: { label: 'Get a wallet', href: '/faq#no-wallet-yet' },
};

export const TEST_NETWORK_NOTICE = {
  title: 'Rather use coins with no value?',
  body: 'There is a version of the app on the test network, a practice version of Bitcoin Cash. Its coins have no value.',
  action: 'Open the test network app',
};

export type DemoStep = { title: string; body: string; action?: { label: string; href: string } };

export const DEMO_STEPS = {
  id: 'steps',
  eyebrow: 'Four steps',
  title: 'Send a stream to yourself',
  steps: [
    {
      title: 'Connect your wallet',
      body: 'Open the app and select Connect wallet. Approve the sign-in in your wallet. It moves no money.',
      action: { label: MARKETING_COPY.openApp, href: appLink(APP_PATHS.home) },
    },
    {
      title: 'Create a stream to yourself',
      body: 'Use your own address as the recipient, pick a small amount and release it evenly over 1 day. Allow cancelling, then approve one transaction to fund it.',
      action: { label: 'Create stream', href: appLink(APP_PATHS.createStream) },
    },
    {
      title: 'Watch it release and claim',
      body: 'Open the stream. The released amount goes up as time passes. Money becomes ready to claim about 2 hours after the schedule reaches it, because the network needs that time before it accepts the claim. Come back after a few hours, claim what is ready and approve the claim in your wallet.',
    },
    {
      title: 'Cancel and get the rest back',
      body: "Cancel the stream before the day is over. You keep what's already released as the recipient, and the rest comes back to your wallet as the sender.",
    },
  ] satisfies DemoStep[],
};

export const DEMO_CLOSING = {
  headline: 'Ready for',
  accent: 'the real thing?',
  lead: 'Once you have seen a stream release and cancel, set one up for someone else the same way.',
  primary: { label: MARKETING_COPY.openApp, href: appLink(APP_PATHS.home) },
  secondary: { label: 'How it works', href: MARKETING_PATHS.howItWorks },
  facts: CLOSING_FACTS,
};
