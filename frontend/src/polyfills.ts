/**
 * Browser polyfills for Node-style globals.
 *
 * Replaces `vite-plugin-node-polyfills`, which dragged the elliptic
 * CVE-2025-14505 into the bundle through crypto-browserify. This module ships
 * only the `Buffer` global (consumed by `mainnet-js` and `cashscript`
 * internals when they decode hex into binary) and a minimal `process` shim.
 *
 * This file MUST be imported at the very top of `main.tsx` so the globals
 * are present before any other module evaluates.
 */

import { Buffer } from 'buffer';

declare global {
  // eslint-disable-next-line no-var
  var Buffer: typeof import('buffer').Buffer;
}

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}

// Some libraries probe `process.env.NODE_ENV` at runtime even though Vite
// normally inlines those reads at build time. A skeleton process object
// covers the runtime-probe case without dragging in node-style EventEmitter
// / Stream shims. We assign through `unknown` to side-step the @types/node
// `Process` type that wants a full Node.js Process surface.
const globalAny = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
if (typeof globalAny.process === 'undefined') {
  globalAny.process = {
    env: {
      NODE_ENV: import.meta.env.MODE,
    },
  };
}
