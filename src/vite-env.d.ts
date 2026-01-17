/// <reference types="vite/client" />

// Buffer polyfill for browser
import { Buffer } from 'buffer';
declare global {
  interface Window {
    Buffer: typeof Buffer;
  }
  var globalThis: typeof global;
  var Buffer: typeof Buffer;
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_PRIVY_APP_ID: string
  readonly VITE_RECLAIM_APP_ID: string
  readonly VITE_RECLAIM_APP_SECRET: string
  readonly VITE_RECLAIM_PROVIDER_ID: string
  readonly VITE_MANTLE_CHAIN_ID: string
  readonly VITE_USDC_MANTLE: string
  readonly VITE_DEMO_USDC_ADDRESS?: string
  readonly VITE_INVOICE_REGISTRY_ADDRESS?: string
  readonly VITE_VAULT_ADDRESS?: string
  readonly VITE_ADVANCE_ENGINE_ADDRESS?: string
  readonly VITE_REPUTATION_ADDRESS?: string
  readonly VITE_SETTLEMENT_ROUTER_ADDRESS?: string
  readonly VITE_MANTLE_RPC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
