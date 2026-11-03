/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_BCH_NETWORK?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_ENABLE_WIZARDCONNECT?: string;
  readonly VITE_ENABLE_OPTN?: string;
  /** An https URL of a test network build. When set, /demo links to it. */
  readonly VITE_TEST_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
