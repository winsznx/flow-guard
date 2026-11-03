// useNetwork only reads a build-time constant and calls no React hook, so it's safe at module scope.
import { useNetwork as readConfiguredNetwork, type Network } from '../hooks/useNetwork';

export const BUILD_NETWORK: Network = readConfiguredNetwork();

const TEST_BUILD: Record<Network, boolean> = { mainnet: false, chipnet: true };

export const IS_TEST_BUILD = TEST_BUILD[BUILD_NETWORK];

const NAME: Record<Network, { inSentence: string; sentenceStart: string; adjective: string }> = {
  mainnet: { inSentence: 'Bitcoin Cash', sentenceStart: 'Bitcoin Cash', adjective: 'Bitcoin Cash' },
  chipnet: { inSentence: 'the test network', sentenceStart: 'The test network', adjective: 'test network' },
};

export const NETWORK_NAME = NAME[BUILD_NETWORK].inSentence;
export const NETWORK_NAME_START = NAME[BUILD_NETWORK].sentenceStart;
export const NETWORK_ADJECTIVE = NAME[BUILD_NETWORK].adjective;

export const NETWORK_LABEL: Record<Network, string> = {
  mainnet: 'Bitcoin Cash',
  chipnet: 'Test network',
};

export const NETWORK_HINT: Record<Network, string> = {
  mainnet: 'Payments here use real BCH.',
  chipnet: 'A practice version of Bitcoin Cash. Its coins have no value.',
};

export const EXPLORER_NAME: Record<Network, string> = {
  mainnet: 'Blockchair',
  chipnet: 'Chaingraph',
};

export function viewOnExplorer(network: Network): string {
  return `View on ${EXPLORER_NAME[network]}`;
}

export function connectGatePurpose(what: string): string {
  return `Connect a ${NETWORK_ADJECTIVE} wallet to see ${what}.`;
}

export type AddressErrors = { notAnAddress: string; otherNetwork: string };

export const ADDRESS_ERRORS: Record<Network, AddressErrors> = {
  mainnet: {
    notAnAddress: "This isn't a Bitcoin Cash address. It should start with bitcoincash:",
    otherNetwork: 'This is a test network address. Use a Bitcoin Cash address.',
  },
  chipnet: {
    notAnAddress: "This isn't a test network address. It should start with bchtest:",
    otherNetwork: 'This is a Bitcoin Cash address. On the test network, use a test network address.',
  },
};

/** Address problems that read the same on every network. */
export const ADDRESS_KIND_ERRORS = {
  bitcoin: 'This looks like a Bitcoin address. FlowGuard needs a Bitcoin Cash address.',
  p2pkhOnly: "Use a regular wallet address. Contract addresses can't receive these streams.",
  tokenAware: 'Use a token-ready address. Most wallets show it under Receive tokens.',
} as const;

export const NETWORK_COPY = {
  runsOn: `FlowGuard runs on ${NETWORK_NAME}.`,
  connectExplainer: `FlowGuard runs on ${NETWORK_NAME}. You approve every payment in your own wallet.`,
  connectFact: IS_TEST_BUILD ? 'Its coins have no value.' : 'Transactions use real BCH.',
  claimExplainer: `Connect a ${NETWORK_ADJECTIVE} wallet to claim it.`,
  sampleDataBanner: `Sample data. Nothing in this workspace is on ${NETWORK_NAME} yet.`,
  explorerExplainer: `See FlowGuard activity on ${NETWORK_NAME}. Anyone can check it.`,
  addressNotValid: ADDRESS_ERRORS[BUILD_NETWORK].notAnAddress,
  addressOtherNetwork: ADDRESS_ERRORS[BUILD_NETWORK].otherNetwork,
} as const;

export function addressErrors(network: Network): AddressErrors {
  return ADDRESS_ERRORS[network];
}
