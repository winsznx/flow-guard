export type Network = 'chipnet' | 'mainnet';

/**
 * The BCH network this build talks to, from VITE_BCH_NETWORK. Anything else falls back to
 * chipnet so a misconfigured build can't touch real money. Safe at module scope.
 */
export function getConfiguredNetwork(): Network {
  const network = import.meta.env.VITE_BCH_NETWORK as Network | undefined;
  return network === 'mainnet' || network === 'chipnet' ? network : 'chipnet';
}

export function useNetwork(): Network {
  return getConfiguredNetwork();
}
