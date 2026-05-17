import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// vite-plugin-node-polyfills was removed (audit follow-up).
// It dragged the unfixable elliptic CVE-2025-14505 into our supply chain
// via crypto-browserify > browserify-sign > elliptic. Our runtime signing
// flows go through @bitauth/libauth's WASM secp256k1, not elliptic.
//
// In its place: a small explicit polyfill loaded at app entry
// (frontend/src/polyfills.ts) that pulls in only the `buffer` package and
// assigns `globalThis.Buffer` so mainnet-js / cashscript find what they
// need. The full Node-stdlib chain is no longer bundled.

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Any `import ... from 'buffer'` in our deps now resolves to the npm
      // `buffer` package directly (no shimmed crypto-browserify wrapper).
      buffer: 'buffer/',
    },
  },
  define: {
    // mainnet-js etc. reference `process.env.NODE_ENV` at module top level.
    // Vite handles `import.meta.env.MODE`, but Node-style `process.env` reads
    // need an explicit string substitution.
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    // The Buffer global is materialised by polyfills.ts at runtime; the
    // bundler still wants to see something here so dead-code-elimination
    // doesn't drop it.
    global: 'globalThis',
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        format: 'es',
      },
    },
  },
  optimizeDeps: {
    include: ['mainnet-js', 'buffer'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
