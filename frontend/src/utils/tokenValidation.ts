/**
 * Token Validation Utilities
 * Validates token categories exist on blockchain before allowing contract funding
 */

import { ElectrumNetworkProvider } from 'cashscript';

/**
 * Validates that a token category exists on the blockchain
 * by checking if the genesis UTXO (txid:0) exists
 *
 * @param tokenCategory - 32-byte hex token category ID (64 characters)
 * @param network - BCH network (chipnet or mainnet)
 * @returns true if token exists, false otherwise
 */
export async function validateTokenCategory(
  tokenCategory: string,
  network: 'chipnet' | 'mainnet' = 'chipnet'
): Promise<boolean> {
  try {
    // Validate format
    if (!tokenCategory || tokenCategory.length !== 64) {
      console.error('Invalid token category format: must be 64-char hex');
      return false;
    }

    // Check if it's valid hex
    if (!/^[0-9a-fA-F]{64}$/.test(tokenCategory)) {
      console.error('Invalid token category: not valid hex');
      return false;
    }

    const provider = new ElectrumNetworkProvider(network);

    // Token category is the genesis transaction ID
    // Try to get transaction data to verify it exists
    try {
      const txData = await provider.getRawTransaction(tokenCategory);

      if (!txData) {
        console.error(`Token category ${tokenCategory} not found on ${network}`);
        return false;
      }

      console.log(`Token category ${tokenCategory} verified on ${network}`);
      return true;
    } catch (error) {
      console.error(`Token category ${tokenCategory} not found on ${network}:`, error);
      return false;
    }
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
}

/**
 * Get token information from blockchain
 * Returns token details if available
 *
 * @param tokenCategory - 32-byte hex token category ID
 * @param network - BCH network
 * @returns Token info or null if not found
 */
export async function getTokenInfo(
  tokenCategory: string,
  network: 'chipnet' | 'mainnet' = 'chipnet'
): Promise<{
  category: string;
  exists: boolean;
  txData?: any;
} | null> {
  try {
    const provider = new ElectrumNetworkProvider(network);

    try {
      const txData = await provider.getRawTransaction(tokenCategory);

      if (!txData) {
        return {
          category: tokenCategory,
          exists: false,
        };
      }

      return {
        category: tokenCategory,
        exists: true,
        txData,
      };
    } catch (error) {
      return {
        category: tokenCategory,
        exists: false,
      };
    }
  } catch (error) {
    console.error('Failed to get token info:', error);
    return null;
  }
}
