import SignClient from '@walletconnect/sign-client';
import type { SessionTypes } from '@walletconnect/types';
import { CodedError } from '../copy/errors';
import { WALLET_PROMPTS } from '../copy/wallets';

// One SignClient per page. WalletConnect Core is a page-wide singleton backed by
// one IndexedDB store, so a second SignClient.init attaches a second engine and
// its listeners to the same relayer. Connectors are recreated on every connect
// and restore, so the client has to outlive them.
let signClientPromise: Promise<SignClient> | null = null;

export function getSignClient(projectId: string): Promise<SignClient> {
  if (!signClientPromise) {
    signClientPromise = SignClient.init({
      projectId,
      metadata: {
        name: 'FlowGuard',
        description: WALLET_PROMPTS.appDescription,
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.svg`],
      },
    }).catch((error: unknown) => {
      signClientPromise = null;
      throw error;
    });
  }
  return signClientPromise;
}

/** The pairing ended on FlowGuard's side: the person closed the dialog, or it timed out. */
export function isAbandonedPairing(error: unknown): boolean {
  return error instanceof CodedError && (error.code === 'PAIRING_CANCELLED' || error.code === 'PAIRING_TIMEOUT');
}

/**
 * Ends a pairing nobody is waiting for. Without this the proposal stays live, and a
 * wallet that approves after the dialog closed leaves a session in the shared store
 * that the next connect or restore would pick up as if the person had chosen it.
 */
export function abandonPairing(client: SignClient, uri: string, approval: Promise<SessionTypes.Struct>): void {
  const pairingTopic = /^wc:([^@]+)@/.exec(uri)?.[1];
  if (pairingTopic) {
    client.core.pairing.disconnect({ topic: pairingTopic }).catch((error: unknown) => {
      console.warn('[WalletConnect] Could not end the abandoned pairing:', error);
    });
  }
  approval
    .then((session) => client.disconnect({
      topic: session.topic,
      reason: { code: 6000, message: WALLET_PROMPTS.disconnected },
    }))
    .catch((error: unknown) => console.debug('[WalletConnect] Abandoned pairing ended without a session:', error));
}
