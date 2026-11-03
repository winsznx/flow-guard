import { NETWORK_ADJECTIVE } from './network';

export { sameWallet } from '../utils/address';

export const CLAIM_PAGE = {
  documentTitle: 'Claim',
  metaDescription: "There's a share of an airdrop you can claim. Open the link and connect a wallet to claim it.",
  whatIsFlowGuard: 'What is FlowGuard?',
  opening: 'Opening your claim link',
  eyebrow: 'You can claim a share',
  title: (amount: string) => `${amount} is waiting for you`,
  titleUnknown: 'You have something to claim',
  from: (sender: string) => `From ${sender}`,
  connect: 'Connect wallet to claim',
  needWallet: `You need a ${NETWORK_ADJECTIVE} wallet.`,
  getWallet: 'Get a wallet',
  openAirdrop: 'See the airdrop',
  facts: {
    once: 'Each wallet can claim once',
    fee: 'The network fee is paid from the airdrop, not your wallet',
    cosign: "Each claim also needs FlowGuard's server to approve it",
  },
  factsLabel: 'Good to know',
  errors: {
    notFound: "We couldn't find this link. Check that you copied all of it.",
    failed: "This link didn't open. Check your connection and try again.",
    goHome: 'Go to Home',
  },
  claimedNext: 'It shows in your wallet in a moment.',
} as const;
