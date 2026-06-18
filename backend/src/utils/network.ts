export type BchNetwork = 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

export function resolveBchNetwork(): BchNetwork {
  const raw = (process.env.BCH_NETWORK || process.env.NETWORK || '').trim().toLowerCase();
  if (raw === 'mainnet') return 'mainnet';
  if (raw === 'testnet3') return 'testnet3';
  if (raw === 'testnet4') return 'testnet4';
  return 'chipnet';
}
