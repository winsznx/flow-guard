/**
 * Network detection hook
 * Returns the current BCH network from environment variables
 */

export type Network = 'chipnet' | 'mainnet';

/**
 * Get the current BCH network
 * Reads from VITE_BCH_NETWORK environment variable
 * Defaults to 'chipnet' for safety
 */
export function useNetwork(): Network {
  const network = import.meta.env.VITE_BCH_NETWORK as Network | undefined;

  // Validate network value
  if (network && (network === 'chipnet' || network === 'mainnet')) {
    return network;
  }

  // Default to chipnet for development safety
  return 'chipnet';
}
