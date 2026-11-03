export type LegalPageKey = 'terms' | 'privacy' | 'disclaimer';

export type LegalPageCopy = {
  title: string;
  description: string;
  updated: string;
  summary: [string, string, string];
};

export const LEGAL_PAGES: Record<LegalPageKey, LegalPageCopy> = {
  terms: {
    title: 'Terms of use',
    description: 'The rules for using FlowGuard. Start with the short summary.',
    updated: 'Mar 4, 2026',
    summary: [
      'You approve every transaction in your own wallet, and you are responsible for what you approve.',
      "FlowGuard never holds your keys and can't reverse a transaction once it's sent.",
      'FlowGuard is provided as is, without warranties. Nothing here is legal, tax or investment advice.',
    ],
  },
  privacy: {
    title: 'Privacy',
    description: 'What FlowGuard stores about you, and why.',
    updated: 'Mar 4, 2026',
    summary: [
      'We process your wallet address, the setups you create and standard server logs to run FlowGuard.',
      'Everything recorded on Bitcoin Cash is public, and we can\'t make it private or delete it.',
      'Some choices are stored in your browser, and you can clear them at any time.',
    ],
  },
  disclaimer: {
    title: 'Risk disclaimer',
    description: 'The risks of using contracts on Bitcoin Cash, in plain words.',
    updated: 'Mar 4, 2026',
    summary: [
      'Software, wallets and networks can fail, even after review and testing.',
      'BCH and token prices can move a lot, and FlowGuard does not protect you from losses.',
      'Check every amount, address and date in your wallet before you approve.',
    ],
  },
};
