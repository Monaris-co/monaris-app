/**
 * Private wallet management – create, encrypt/decrypt, persist.
 *
 * Each Monaris user gets one RAILGUN wallet per chain.  The wallet
 * mnemonic is encrypted with a key derived from the user's password
 * (or a Privy-stored secret) via AES-GCM before being stored in
 * Supabase.  Raw keys NEVER leave the browser unencrypted.
 */

import { supabase, isSupabaseConfigured } from '../supabase';
import { ensureEngineReady } from './engine';
import type { PrivateWalletInfo, PrivateWalletRecord } from './types';

// ---------- Encryption helpers (Web Crypto API) ----------

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptBlob(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext),
  );
  const combined = new Uint8Array(salt.length + iv.length + new Uint8Array(ciphertext).length);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptBlob(encoded: string, password: string): Promise<string> {
  const raw = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const salt = raw.slice(0, 16);
  const iv = raw.slice(16, 28);
  const ciphertext = raw.slice(28);
  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(decrypted);
}

// ---------- Wallet CRUD ----------

/**
 * Create a brand-new RAILGUN wallet and persist it (encrypted) to
 * Supabase.  Returns the wallet info needed for further operations.
 */
export async function createPrivateWallet(
  userAddress: string,
  chainId: number,
  encryptionPassword: string,
): Promise<PrivateWalletInfo> {
  await ensureEngineReady();

  const { createRailgunWallet } = await import('@railgun-community/wallet');

  const mnemonic = await generateBip39Mnemonic();

  // Get the current block number so the SDK only scans from HERE forward.
  // Without this, the SDK scans from RAILGUN's deployment block (~56M on Arbitrum)
  // which means scanning 380M+ blocks and takes forever.
  // IMPORTANT: keys must be NetworkName strings (e.g. "Arbitrum"), NOT chain IDs.
  const creationBlock = await getCurrentBlockNumber(chainId);
  const networkName = chainIdToNetworkName(chainId);
  const creationBlockNumbers: Record<string, number> = creationBlock && networkName
    ? { [networkName]: creationBlock }
    : {};

  console.log(`[PrivateWallet] Creating wallet with creationBlock: ${creationBlock ?? 'none'} for network: ${networkName}`);

  const walletInfo = await createRailgunWallet(
    encryptionPassword,
    mnemonic,
    creationBlockNumbers,
  );

  if (!walletInfo) {
    throw new Error('Failed to create RAILGUN wallet');
  }

  // Encrypt the mnemonic + creation block before storing
  const encryptedBlob = await encryptBlob(
    JSON.stringify({ mnemonic, creationBlock: creationBlock ?? null }),
    encryptionPassword,
  );

  const fingerprint = walletInfo.railgunAddress.slice(0, 10);

  if (isSupabaseConfigured()) {
    try {
      // SAFETY: only INSERT if no blob exists. Never overwrite an existing
      // blob — doing so would destroy the original mnemonic and lock the
      // user out of previously shielded funds.
      const { data: existing } = await supabase
        .from('user_private_wallets')
        .select('id')
        .eq('user_address', userAddress.toLowerCase())
        .eq('chain_id', chainId)
        .maybeSingle();

      if (existing) {
        console.log('[PrivateWallet] Blob already exists in Supabase, NOT overwriting');
      } else {
        await supabase.from('user_private_wallets').insert({
          user_address: userAddress.toLowerCase(),
          chain_id: chainId,
          encrypted_wallet_blob: encryptedBlob,
          wallet_fingerprint: fingerprint,
          updated_at: new Date().toISOString(),
        });
        console.log('[PrivateWallet] New wallet blob saved to Supabase');
      }
    } catch (err) {
      console.warn('[PrivateWallet] Could not persist wallet to Supabase (table may not exist):', err);
    }
  }

  return {
    id: walletInfo.id,
    railgunAddress: walletInfo.railgunAddress,
    encryptionKey: encryptionPassword,
  };
}

/**
 * Load an existing RAILGUN wallet from Supabase encrypted blob.
 */
export async function loadPrivateWallet(
  userAddress: string,
  chainId: number,
  encryptionPassword: string,
): Promise<PrivateWalletInfo | null> {
  await ensureEngineReady();

  if (!isSupabaseConfigured()) return null;

  let data: any = null;
  try {
    const result = await supabase
      .from('user_private_wallets')
      .select('encrypted_wallet_blob')
      .eq('user_address', userAddress.toLowerCase())
      .eq('chain_id', chainId)
      .maybeSingle();
    data = result.data;
  } catch {
    return null;
  }

  if (!data?.encrypted_wallet_blob) return null;

  try {
    const decrypted = await decryptBlob(
      data.encrypted_wallet_blob,
      encryptionPassword,
    );
    const parsed = JSON.parse(decrypted);
    const { mnemonic, creationBlock } = parsed;

    const { createRailgunWallet } = await import('@railgun-community/wallet');

    const networkName = chainIdToNetworkName(chainId);
    const creationBlockNumbers: Record<string, number> = creationBlock && networkName
      ? { [networkName]: creationBlock }
      : {};

    console.log(`[PrivateWallet] Loading wallet with creationBlock: ${creationBlock ?? 'none'} for network: ${networkName}`);

    const walletInfo = await createRailgunWallet(
      encryptionPassword,
      mnemonic,
      creationBlockNumbers,
    );

    if (!walletInfo) return null;

    return {
      id: walletInfo.id,
      railgunAddress: walletInfo.railgunAddress,
      encryptionKey: encryptionPassword,
    };
  } catch (err) {
    console.error('[PrivateWallet] Failed to load wallet:', err);
    return null;
  }
}

/**
 * Check if a private wallet exists for this user + chain.
 * Returns false gracefully if the table doesn't exist yet (migration not run).
 */
export async function hasPrivateWallet(
  userAddress: string,
  chainId: number,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    const { data, error } = await supabase
      .from('user_private_wallets')
      .select('id')
      .eq('user_address', userAddress.toLowerCase())
      .eq('chain_id', chainId)
      .maybeSingle();

    if (error) {
      // Table may not exist yet (404) — treat as "no wallet"
      console.warn('[PrivateWallet] hasPrivateWallet check failed (table may not exist):', error.message);
      return false;
    }

    return !!data;
  } catch {
    return false;
  }
}

/**
 * Get the RAILGUN address for a given Monaris user (for resolving
 * payment recipients without exposing the 0zk address in UI).
 */
export async function resolvePrivateAddress(
  userAddress: string,
  chainId: number,
  encryptionPassword: string,
): Promise<string | null> {
  const wallet = await loadPrivateWallet(userAddress, chainId, encryptionPassword);
  return wallet?.railgunAddress ?? null;
}

// ---------- Mnemonic generation ----------

async function generateBip39Mnemonic(): Promise<string> {
  const { ethers } = await import('ethers');
  const wallet = ethers.Wallet.createRandom();
  if (!wallet.mnemonic) throw new Error('Failed to generate mnemonic');
  return wallet.mnemonic.phrase;
}

// ---------- Block number helper ----------

async function getCurrentBlockNumber(chainId: number): Promise<number | null> {
  const rpcUrl = import.meta.env[`VITE_RPC_URL_${chainId}`]
    || 'https://1rpc.io/arb';

  try {
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    });
    const data = await resp.json();
    return parseInt(data.result, 16);
  } catch (err) {
    console.warn('[PrivateWallet] Could not fetch block number:', err);
    return null;
  }
}

/**
 * Map chain ID to RAILGUN NetworkName string.
 * The SDK's creationBlockNumbers keys must be NetworkName values, not chain IDs.
 */
function chainIdToNetworkName(chainId: number): string | null {
  const map: Record<number, string> = {
    1: 'Ethereum',
    56: 'BNB_Chain',
    137: 'Polygon',
    42161: 'Arbitrum',
    11155111: 'Ethereum_Sepolia',
  };
  return map[chainId] ?? null;
}
