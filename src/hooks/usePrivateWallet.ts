/**
 * React hook for managing the user's RAILGUN private wallet.
 *
 * WALLET IDENTITY: The RAILGUN mnemonic is derived DETERMINISTICALLY
 * from the user's Privy embedded wallet via signMessage. This means:
 *  - Same user -> same signature -> same mnemonic -> same RAILGUN wallet
 *  - If the Supabase blob is lost, the wallet can be re-derived
 *  - There is NEVER a second wallet created for the same user
 *
 * INIT ORDER (critical for quicksync):
 *  1. Boot engine (no network)
 *  2. Import/create wallet into engine
 *  3. Load provider -> quicksync finds UTXOs for this wallet
 */

import { useCallback, useEffect, useRef } from 'react';
import { useChainId } from 'wagmi';
import { useWallets } from '@privy-io/react-auth';
import { usePrivyAccount } from './usePrivyAccount';
import { usePrivacyStore } from '@/lib/privacy/store';
import {
  PRIVATE_PAYMENTS_ENABLED,
  ensureEngineStarted,
  loadProviderAndSync,
  onEngineStatusChange,
  refreshPOIsForWallet,
  triggerMerkleScans,
} from '@/lib/privacy';
import { getWalletModule } from '@/lib/privacy/engine';
import { deriveWalletPassword } from '@/lib/privacy/wallet';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const SEED_MESSAGE = 'Monaris Private Wallet Derivation v1';

// Session-level cache: once we derive the mnemonic for an address,
// we never call personal_sign again in this page session.
const _mnemonicCache = new Map<string, string>();

// Lock to prevent concurrent wallet init (which would race on personal_sign)
let _initLock: Promise<void> | null = null;

async function deriveDeterministicMnemonic(signature: string): Promise<string> {
  const { ethers } = await import('ethers');
  const entropy = ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(signature)));
  const mnemonic = ethers.Mnemonic.fromEntropy(entropy.slice(0, 16));
  return mnemonic.phrase;
}

let globalInitAddress: string | null = null;

export function usePrivateWallet() {
  const { address } = usePrivyAccount();
  const chainId = useChainId();
  const { wallets } = useWallets();
  const store = usePrivacyStore();
  const abortRef = useRef(false);

  const embeddedWallet = wallets.find((w) => {
    const ct = w.connectorType?.toLowerCase() || '';
    const wct = w.walletClientType?.toLowerCase() || '';
    return ct === 'embedded' || wct === 'privy' || ct.includes('privy');
  });

  useEffect(() => {
    const unsub = onEngineStatusChange((status) => {
      store.setEngineStatus(status);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!PRIVATE_PAYMENTS_ENABLED || !address || !embeddedWallet) return;
    if (globalInitAddress === address) return;

    globalInitAddress = address;
    abortRef.current = false;

    const run = async () => {
      // Acquire lock — prevents concurrent init (HMR, strict mode, etc.)
      if (_initLock) {
        try { await _initLock; } catch { /* ignore */ }
        if (globalInitAddress !== address) return;
      }

      let releaseLock: () => void;
      _initLock = new Promise<void>((resolve) => { releaseLock = resolve; });

      try {
        await doInit(address, chainId, embeddedWallet, store, abortRef);
      } finally {
        releaseLock!();
        _initLock = null;
      }
    };

    run();
    return () => { abortRef.current = true; };
  }, [address, chainId, embeddedWallet?.address]);

  useEffect(() => {
    return () => {
      if (globalInitAddress) globalInitAddress = null;
      store.setWalletLoadedInEngine(false);
    };
  }, [address]);

  const initializeWallet = useCallback(async () => {
    if (!address) throw new Error('No wallet connected');
    if (store.wallet && store.walletLoadedInEngine) return store.wallet;
    return store.wallet;
  }, [address, store.wallet, store.walletLoadedInEngine]);

  return {
    wallet: store.wallet,
    engineStatus: store.engineStatus,
    isCreatingWallet: store.isCreatingWallet,
    isReady: store.engineStatus === 'ready' && !!store.wallet && store.walletLoadedInEngine,
    isEnabled: PRIVATE_PAYMENTS_ENABLED,
    initializeWallet,
  };
}

// The actual init logic extracted so it can be lock-guarded
async function doInit(
  address: string,
  chainId: number,
  embeddedWallet: any,
  store: ReturnType<typeof usePrivacyStore>,
  abortRef: React.MutableRefObject<boolean>,
) {
  // Phase 1: Boot engine + derive password in parallel
  const [, password] = await Promise.all([
    ensureEngineStarted(),
    deriveWalletPassword(address),
  ]);
  if (abortRef.current) return;

  // Phase 2: Get deterministic mnemonic (cached per session)
  let mnemonic = _mnemonicCache.get(address.toLowerCase());
  if (!mnemonic) {
    try {
      const provider = await embeddedWallet.getEthereumProvider();
      const hexMsg = `0x${Array.from(new TextEncoder().encode(SEED_MESSAGE)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
      const sig = await provider.request({
        method: 'personal_sign',
        params: [hexMsg, address],
      }) as string;
      mnemonic = await deriveDeterministicMnemonic(sig);
      _mnemonicCache.set(address.toLowerCase(), mnemonic);
      console.log('[usePrivateWallet] Deterministic mnemonic derived & cached');
    } catch (err: any) {
      console.error('[usePrivateWallet] Failed to sign seed message:', err?.message);
      return;
    }
  } else {
    console.log('[usePrivateWallet] Using cached mnemonic (no signature needed)');
  }
  if (abortRef.current) return;

  // Phase 3: Import wallet into engine
  try {
    const walletModule = await getWalletModule();
    const walletInfo = await walletModule.createRailgunWallet(password, mnemonic, {});

    if (!walletInfo) {
      console.error('[usePrivateWallet] createRailgunWallet returned null');
      return;
    }

    store.setWallet({
      id: walletInfo.id,
      railgunAddress: walletInfo.railgunAddress,
      encryptionKey: password,
    });
    store.setWalletLoadedInEngine(true);
    console.log('[usePrivateWallet] Wallet loaded:', walletInfo.id.slice(0, 12) + '...');

    // Persist to Supabase in background (fire-and-forget)
    persistBlobIfNew(address, chainId, mnemonic, password, walletInfo.railgunAddress);
  } catch (err: any) {
    console.error('[usePrivateWallet] Wallet import failed:', err?.message);
    return;
  }
  if (abortRef.current) return;

  // Phase 4: Load provider + quicksync
  console.log('[usePrivateWallet] Loading provider + quicksync...');
  try {
    await loadProviderAndSync();
    console.log('[usePrivateWallet] Provider loaded, quicksync running');
  } catch (err: any) {
    console.warn('[usePrivateWallet] loadProviderAndSync failed:', err?.message);
  }
  if (abortRef.current) return;

  // Phase 5: Wait for quicksync to settle, then run full POI pipeline.
  // The quicksync downloads UTXO events from the subgraph but needs a few
  // seconds to process them. Running POI immediately would find no UTXOs.
  const walletId = store.wallet?.id;
  if (walletId) {
    console.log('[usePrivateWallet] Waiting for quicksync to settle...');
    await new Promise(r => setTimeout(r, 5_000));
    if (abortRef.current) return;

    // Full UTXO rescan ensures merkle tree is completely caught up,
    // preventing TXID/UTXO desync that leads to MissingExternalPOI.
    console.log('[usePrivateWallet] Running full UTXO rescan...');
    try {
      await triggerMerkleScans([walletId]);
    } catch (err: any) {
      console.warn('[usePrivateWallet] Full rescan failed:', err?.message);
    }
    if (abortRef.current) return;

    console.log('[usePrivateWallet] Running POI pipeline...');
    try {
      await refreshPOIsForWallet(walletId);
      console.log('[usePrivateWallet] POI pipeline complete');
      window.dispatchEvent(new CustomEvent('railgun-balance-update'));
    } catch (err: any) {
      console.warn('[usePrivateWallet] POI pipeline failed:', err?.message);
    }

    // Second POI pass after 30s — aggregator may need time to validate external POIs
    if (!abortRef.current) {
      setTimeout(async () => {
        if (abortRef.current) return;
        console.log('[usePrivateWallet] Second POI pass (delayed)...');
        try {
          await refreshPOIsForWallet(walletId);
          window.dispatchEvent(new CustomEvent('railgun-balance-update'));
        } catch { /* logged inside */ }
      }, 30_000);
    }
  }
}

// ---- Helpers ----

async function persistBlobIfNew(
  userAddress: string,
  chainId: number,
  mnemonic: string,
  password: string,
  railgunAddress: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { data: existing } = await supabase
      .from('user_private_wallets')
      .select('id')
      .eq('user_address', userAddress.toLowerCase())
      .eq('chain_id', chainId)
      .maybeSingle();

    if (existing) return;

    const encryptedBlob = await encryptBlobRaw(
      JSON.stringify({ mnemonic, derivation: 'deterministic-v1' }),
      password,
    );
    await supabase.from('user_private_wallets').insert({
      user_address: userAddress.toLowerCase(),
      chain_id: chainId,
      encrypted_wallet_blob: encryptedBlob,
      wallet_fingerprint: railgunAddress.slice(0, 10),
      updated_at: new Date().toISOString(),
    });
  } catch { /* best-effort */ }
}

async function encryptBlobRaw(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  const combined = new Uint8Array(salt.length + iv.length + new Uint8Array(ciphertext).length);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return btoa(String.fromCharCode(...combined));
}
