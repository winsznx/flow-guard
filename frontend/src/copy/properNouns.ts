export const PROPER_NOUNS = [
  'FlowGuard',
  'Bitcoin Cash',
  'BCH',
  'CashTokens',
  'Paytaca',
  'Cashonize',
  'Zapit',
  'Selene',
  'OPTN',
  'WalletConnect',
  'WizardConnect',
  'GitHub',
  'YouTube',
  'Telegram',
  'Blockchair',
  'Chaingraph',
  'CSV',
  'Explorer',
  'Personal',
  'Organization',
] as const;

export const ALL_CAPS_ALLOWED = ['ID', 'QR', 'VPN', 'AM', 'PM', 'USD', 'CSV', 'BCH', 'OPTN', 'SDK', 'API'] as const;

export const SAMPLE_PEOPLE = ['Sam', 'Maya', 'Ade'] as const;

export type ProperNoun = (typeof PROPER_NOUNS)[number];
