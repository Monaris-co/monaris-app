import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const zeroExApiKey = env.VITE_ZEROX_API_KEY;

  return {
    server: {
      host: "::",
      port: 8080,
      proxy: {
        "/api/0x": {
          target: "https://api.0x.org",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/0x/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("0x-version", "v2");
              if (zeroExApiKey) {
                proxyReq.setHeader("0x-api-key", zeroExApiKey);
              }
            });
          },
        },
      },
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
  };
});
