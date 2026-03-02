import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    wasm(),
    topLevelAwait(),
    react(),
    nodePolyfills({
      include: ['process', 'buffer', 'util', 'stream', 'events', 'assert', 'crypto', 'os', 'path'],
      globals: {
        process: true,
        Buffer: true,
        global: true,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@railgun-community/engine')) return 'railgun-engine';
          if (id.includes('@railgun-community/wallet')) return 'railgun-wallet';
          if (id.includes('@railgun-community/shared-models')) return 'railgun-shared';
          if (id.includes('snarkjs')) return 'snarkjs';
          if (id.includes('ethers')) return 'ethers';
          if (id.includes('@privy-io') || id.includes('wagmi') || id.includes('@wagmi') || id.includes('viem')) return 'web3-stack';
        },
      },
    },
    chunkSizeWarningLimit: 2000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: [
      '@railgun-community/poseidon-hash-wasm',
      '@railgun-community/curve25519-scalarmult-wasm',
    ],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  worker: {
    plugins: () => [wasm(), topLevelAwait()],
  },
});
