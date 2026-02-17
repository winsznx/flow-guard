import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      // Include polyfills for crypto, buffer, stream, etc.
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Manual fallback for WalletConnect process shim
      'vite-plugin-node-polyfills/shims/process': 'vite-plugin-node-polyfills/shims/process',
      process: 'vite-plugin-node-polyfills/shims/process',
    },
  },
  build: {
    target: 'esnext', // Support top-level await
    rollupOptions: {
      output: {
        format: 'es',
      },
      // Tell Rollup to ignore polyfill shim imports - the plugin will handle them
      external: (id) => {
        return id.includes('vite-plugin-node-polyfills/shims');
      },
    },
  },
  optimizeDeps: {
    include: ['mainnet-js'],
    esbuildOptions: {
      target: 'esnext', // Support top-level await in dependencies
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
