/**
 * RAILGUN Engine initialization and lifecycle management.
 *
 * CRITICAL architecture: two-phase init.
 *
 *  Phase 1 — ensureEngineStarted():
 *    Boots the RAILGUN engine (WASM, level-js DB, artifact store).
 *    Does NOT call loadProvider. Fast (~2-4s).
 *
 *  Phase 2 — loadProviderAndSync():
 *    Called AFTER the wallet is imported into the engine.
 *    Triggers quicksync (downloads events from subgraph) + RPC polling.
 *    The wallet MUST exist before this so quicksync finds its UTXOs.
 *
 *  Old flow (broken):  engine → loadProvider(quicksync) → import wallet → balance = 0
 *  New flow (correct):  engine → import wallet → loadProvider(quicksync) → balance = ✓
 */

import { Buffer } from 'buffer';
import type { PrivacyEngineStatus } from './types';

let engineStatus: PrivacyEngineStatus = 'uninitialized';
const statusListeners = new Set<(s: PrivacyEngineStatus) => void>();

function setStatus(s: PrivacyEngineStatus) {
  engineStatus = s;
  statusListeners.forEach((fn) => fn(s));
}

export function getEngineStatus(): PrivacyEngineStatus {
  return engineStatus;
}

export function onEngineStatusChange(cb: (s: PrivacyEngineStatus) => void) {
  statusListeners.add(cb);
  return () => {
    statusListeners.delete(cb);
  };
}

// ---- Cached module references (populated on first import) ----

let _walletModule: typeof import('@railgun-community/wallet') | null = null;
let _sharedModels: typeof import('@railgun-community/shared-models') | null = null;

export async function getWalletModule() {
  if (!_walletModule) _walletModule = await import('@railgun-community/wallet');
  return _walletModule;
}

export async function getSharedModels() {
  if (!_sharedModels) _sharedModels = await import('@railgun-community/shared-models');
  return _sharedModels;
}

// ---- Prefetch: start downloading heavy modules before user needs them ----

let prefetchStarted = false;

export function prefetchPrivacyModules(): void {
  if (prefetchStarted) return;
  prefetchStarted = true;

  Promise.all([
    import('@railgun-community/wallet'),
    import('@railgun-community/shared-models'),
    import('level-js'),
  ]).then(([w, s]) => {
    _walletModule = w;
    _sharedModels = s;
  }).catch(() => {
    prefetchStarted = false;
  });
}

// ---- Phase 1: Engine boot (no network loading) ----

let engineStartPromise: Promise<void> | null = null;
let _engineStarted = false;
let _proverInitialized = false;

/**
 * Initialize the Groth16 prover via snarkjs.
 * Idempotent — safe to call multiple times. MUST be called before any
 * proof generation (unshield, private transfer, POI proofs).
 */
export async function ensureProverInitialized(): Promise<void> {
  // Always re-initialize to ensure diagnostic wrapper is applied after HMR
  // (module-level _proverInitialized survives HMR but the wrapper code changes)

  const walletModule = await getWalletModule();

  let snarkjs: any;
  try {
    snarkjs = await import('snarkjs');
  } catch (err: any) {
    console.error('[RAILGUN] Failed to load snarkjs:', err?.message);
    return;
  }

  if (!snarkjs?.groth16) {
    console.error('[RAILGUN] snarkjs loaded but groth16 not found. Keys:', Object.keys(snarkjs));
    return;
  }

  console.log('[RAILGUN] snarkjs groth16 loaded. Has fullProve:', !!snarkjs.groth16.fullProve, 'Has verify:', !!snarkjs.groth16.verify);

  // Wrap snarkjs.groth16 to intercept fullProve and verify calls for diagnostics
  const originalFullProve = snarkjs.groth16.fullProve.bind(snarkjs.groth16);
  const originalVerify = snarkjs.groth16.verify?.bind(snarkjs.groth16);

  const diagnosticGroth16 = {
    ...snarkjs.groth16,
    fullProve: async (...args: any[]) => {
      console.log('[SNARK] fullProve called. WASM type:', typeof args[1], args[1] instanceof Uint8Array ? `Uint8Array(${args[1].byteLength})` : '', 'ZKEY type:', typeof args[2], args[2] instanceof Uint8Array ? `Uint8Array(${args[2].byteLength})` : '');
      const start = Date.now();
      const result = await originalFullProve(...args);
      const elapsed = Date.now() - start;
      console.log('[SNARK] fullProve completed in', elapsed, 'ms. Has proof:', !!result?.proof, 'Has publicSignals:', !!result?.publicSignals, 'publicSignals count:', result?.publicSignals?.length);
      if (result?.proof) {
        console.log('[SNARK] proof.pi_a length:', result.proof.pi_a?.length, 'pi_b length:', result.proof.pi_b?.length, 'pi_c length:', result.proof.pi_c?.length);
      }
      // Run local verify if we have the vkey (3rd arg is zkey, not vkey — vkey comes from artifacts)
      return result;
    },
    verify: originalVerify ? async (...args: any[]) => {
      console.log('[SNARK] verify called. vkey type:', typeof args[0], 'publicSignals count:', args[1]?.length, 'proof pi_a:', args[2]?.pi_a?.slice(0, 2));
      try {
        const result = await originalVerify(...args);
        console.log('[SNARK] verify result:', result);
        return result;
      } catch (verifyErr: any) {
        console.error('[SNARK] verify threw error:', verifyErr?.message);
        throw verifyErr;
      }
    } : undefined,
  };

  // Try getProver() first (canonical path used by SDK internally)
  try {
    const prover = walletModule.getProver();
    if (prover.groth16) {
      _proverInitialized = true;
      console.log('[RAILGUN] Prover already has groth16 set. Has verify:', !!prover.groth16.verify);
      return;
    }
    if (typeof prover.setSnarkJSGroth16 === 'function') {
      prover.setSnarkJSGroth16(diagnosticGroth16 as any);
      _proverInitialized = true;
      console.log('[RAILGUN] Groth16 prover initialized via getProver(). Has verify:', !!prover.groth16?.verify);
      return;
    }
    console.error('[RAILGUN] prover.setSnarkJSGroth16 is not a function. Keys:', Object.keys(prover));
  } catch (err: any) {
    console.warn('[RAILGUN] getProver() path failed:', err?.message);
  }

  // Fallback: try getEngine().prover
  try {
    const engine = walletModule.getEngine();
    if (engine?.prover) {
      if (engine.prover.groth16) {
        _proverInitialized = true;
        return;
      }
      engine.prover.setSnarkJSGroth16(diagnosticGroth16 as any);
      _proverInitialized = true;
      console.log('[RAILGUN] Groth16 prover initialized via getEngine().prover');
      return;
    }
  } catch (err: any) {
    console.error('[RAILGUN] getEngine().prover path failed:', err?.message);
  }

  console.error('[RAILGUN] All prover initialization paths exhausted — proof generation will fail');
}

/**
 * Clear the SDK's in-memory artifact cache so next proof generation
 * re-reads from the artifact store (IndexedDB). Prevents stale cached
 * artifacts from being used.
 */
export async function clearArtifactMemoryCache(): Promise<void> {
  try {
    const walletModule = await getWalletModule();
    if (typeof (walletModule as any).clearArtifactCache === 'function') {
      (walletModule as any).clearArtifactCache();
      console.log('[RAILGUN] In-memory artifact cache cleared');
    }
  } catch (err: any) {
    console.warn('[RAILGUN] Could not clear artifact cache:', err?.message);
  }
}

/**
 * Phase 1: Start the RAILGUN engine without loading any network.
 * This is fast (~2-4s) and only does WASM + DB initialization.
 * Call loadProviderAndSync() separately after the wallet is imported.
 */
export async function ensureEngineStarted(): Promise<void> {
  if (_engineStarted) return;
  if (engineStartPromise) return engineStartPromise;

  engineStartPromise = doEngineStart();
  return engineStartPromise;
}

// Backward compat alias — old code calls ensureEngineReady()
export const ensureEngineReady = ensureEngineStarted;

async function doEngineStart(): Promise<void> {
  try {
    setStatus('initializing');

    const [walletModule, sharedModels, levelJsModule] = await Promise.all([
      getWalletModule(),
      getSharedModels(),
      import('level-js'),
    ]);

    const {
      startRailgunEngine,
      setLoggers,
      setOnBalanceUpdateCallback,
      setOnUTXOMerkletreeScanCallback,
      setOnTXIDMerkletreeScanCallback,
    } = walletModule;

    setLoggers(
      (msg: string) => console.log('[RAILGUN]', msg),
      (error: string) => console.error('[RAILGUN]', error),
    );

    const leveljs = levelJsModule.default;
    const db = leveljs('monarisrailgundb');

    const shouldDebug = import.meta.env.DEV;

    let idbHandle: IDBDatabase | null = null;
    const getIdb = async () => {
      if (!idbHandle) idbHandle = await openArtifactDB();
      return idbHandle;
    };

    const artifactStore = {
      get: async (path: string): Promise<string | Buffer | null> => {
        try {
          const db2 = await getIdb();
          const tx = db2.transaction('artifacts', 'readonly');
          const store = tx.objectStore('artifacts');
          const req = store.get(path);
          return new Promise((resolve) => {
            req.onsuccess = () => {
              let data: unknown = req.result?.data ?? null;
              // IndexedDB structured-clone returns Uint8Array; SDK expects Buffer for binary artifacts.
              // Returning Buffer ensures snarkjs gets correct circuit data and proofs verify on-chain.
              if (data != null && data instanceof Uint8Array) {
                data = Buffer.from(data);
              }
              const type = data === null ? 'null' : Buffer.isBuffer(data) ? 'Buffer' : typeof data;
              const size =
                data == null ? 0 : Buffer.isBuffer(data) ? data.byteLength : (data as string).length;
              console.log(`[ArtifactStore] get("${path}"): ${type}, size=${size}`);
              resolve(data as string | Buffer | null);
            };
            req.onerror = () => resolve(null);
          });
        } catch {
          return null;
        }
      },
      store: async (_dir: string, path: string, item: string | Uint8Array): Promise<void> => {
        try {
          const type = item instanceof Uint8Array ? 'Uint8Array' : typeof item;
          const size = item instanceof Uint8Array ? item.byteLength : item.length;
          console.log(`[ArtifactStore] store("${path}"): ${type}, size=${size}`);
          const db2 = await getIdb();
          const tx = db2.transaction('artifacts', 'readwrite');
          const store = tx.objectStore('artifacts');
          store.put({ key: path, data: item });
        } catch (err: any) {
          console.error(`[ArtifactStore] store failed:`, err?.message);
        }
      },
      exists: async (path: string): Promise<boolean> => {
        try {
          const db2 = await getIdb();
          const tx = db2.transaction('artifacts', 'readonly');
          const store = tx.objectStore('artifacts');
          const req = store.get(path);
          return new Promise((resolve) => {
            req.onsuccess = () => {
              const found = req.result?.data != null;
              console.log(`[ArtifactStore] exists("${path}"): ${found}`);
              resolve(found);
            };
            req.onerror = () => resolve(false);
          });
        } catch {
          return false;
        }
      },
    };

    setStatus('loading-artifacts');

    const poiNodeURLs = ['https://ppoi-agg.horsewithsixlegs.xyz'];

    await startRailgunEngine(
      'monarispay',
      db,
      shouldDebug,
      artifactStore,
      false,
      false,
      poiNodeURLs,
      [],
    );

    await ensureProverInitialized();

    // Register balance callback so we catch updates during quicksync
    setOnBalanceUpdateCallback((balancesEvent: any) => {
      console.log('[RAILGUN] Balance update event:', {
        walletID: balancesEvent?.railgunWalletID,
        bucket: balancesEvent?.balanceBucket,
        erc20Count: balancesEvent?.erc20Amounts?.length,
        erc20Amounts: balancesEvent?.erc20Amounts?.map((a: any) => ({
          token: a.tokenAddress?.slice(0, 10),
          amount: a.amount?.toString(),
        })),
      });
      window.dispatchEvent(new CustomEvent('railgun-balance-update'));
    });

    // Register scan progress callbacks for visibility
    try {
      setOnUTXOMerkletreeScanCallback((event: any) => {
        console.log(`[RAILGUN] UTXO scan: ${event?.scanStatus} ${Math.round((event?.progress ?? 0) * 100)}%`);
      });
      setOnTXIDMerkletreeScanCallback((event: any) => {
        console.log(`[RAILGUN] TXID scan: ${event?.scanStatus} ${Math.round((event?.progress ?? 0) * 100)}%`);
      });
    } catch {
      // Scan callbacks might not be available in all SDK versions
    }

    _engineStarted = true;
    console.log('[RAILGUN] Engine started (no network loaded yet)');
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error('[RAILGUN] Engine start failed:', msg);
    setStatus('error');
    engineStartPromise = null;
    throw err;
  }
}

// ---- Phase 2: Load provider + trigger quicksync ----

let _providerLoaded = false;
let _providerLoadPromise: Promise<void> | null = null;

/**
 * Phase 2: Load the network provider and trigger quicksync + RPC scan.
 * The wallet MUST be imported into the engine BEFORE calling this,
 * so quicksync can match UTXOs to the wallet's viewing key.
 */
export async function loadProviderAndSync(): Promise<void> {
  if (_providerLoaded) return;
  if (_providerLoadPromise) return _providerLoadPromise;

  _providerLoadPromise = doLoadProvider();
  return _providerLoadPromise;
}

async function doLoadProvider(): Promise<void> {
  try {
    await ensureEngineStarted();

    const walletModule = await getWalletModule();
    const sharedModels = await getSharedModels();
    const { loadProvider } = walletModule;
    const { NetworkName } = sharedModels;

    const chainId = Number(import.meta.env.VITE_DEFAULT_CHAIN_ID || '42161');
    const networkName =
      chainId === 42161 ? NetworkName.Arbitrum : NetworkName.Arbitrum;

    const RELIABLE_RPCS = [
      'https://1rpc.io/arb',
      'https://rpc.ankr.com/arbitrum',
      'https://arbitrum.drpc.org',
    ];

    const customRpc = import.meta.env[`VITE_RPC_URL_${chainId}`];
    const isCustomRpcReliable = customRpc
      && !customRpc.includes('pocket.network')
      && !customRpc.includes('llamarpc')
      && RELIABLE_RPCS.every(r => r !== customRpc);

    const providers = [
      ...(isCustomRpcReliable ? [{ provider: customRpc, priority: 1, weight: 2, maxLogsPerBatch: 100, stallTimeout: 2000 }] : []),
      { provider: RELIABLE_RPCS[0], priority: isCustomRpcReliable ? 2 : 1, weight: 2, maxLogsPerBatch: 100, stallTimeout: 2000 },
      { provider: RELIABLE_RPCS[1], priority: isCustomRpcReliable ? 3 : 2, weight: 1, maxLogsPerBatch: 100, stallTimeout: 2500 },
      { provider: RELIABLE_RPCS[2], priority: isCustomRpcReliable ? 4 : 3, weight: 1, maxLogsPerBatch: 100, stallTimeout: 2500 },
    ];

    const fallbackProviders = {
      chainId,
      providers,
    };

    setStatus('syncing');
    console.log('[RAILGUN] Loading provider + starting quicksync...');

    await loadProvider(fallbackProviders, networkName, 8_000);

    _providerLoaded = true;
    setStatus('ready');
    console.log('[RAILGUN] Engine fully ready (provider loaded, quicksync started)');
  } catch (err: any) {
    console.error('[RAILGUN] loadProvider failed:', err?.message);
    _providerLoadPromise = null;
    // Still mark as ready so the UI isn't stuck — balances will be retried
    setStatus('ready');
  }
}

// ---- Utilities ----

export async function triggerMerkleScans(walletIds: string[]): Promise<void> {
  if (!_providerLoaded) {
    console.log('[RAILGUN] Provider not loaded, attempting to load before scan...');
    try {
      await loadProviderAndSync();
    } catch (err: any) {
      console.warn('[RAILGUN] Cannot load provider for scan:', err?.message);
      return;
    }
  }
  if (!_providerLoaded) return;

  try {
    const walletModule = await getWalletModule();
    const chainId = Number(import.meta.env.VITE_DEFAULT_CHAIN_ID || '42161');
    const chain = { type: 0, id: chainId };

    await walletModule.rescanFullUTXOMerkletreesAndWallets(chain, walletIds);
    console.log('[RAILGUN] Merkle tree scan complete');
  } catch (err: any) {
    console.warn('[RAILGUN] Merkle scan failed, trying refreshBalances:', err?.message);
    try {
      const walletModule = await getWalletModule();
      const chainId = Number(import.meta.env.VITE_DEFAULT_CHAIN_ID || '42161');
      const chain = { type: 0, id: chainId };
      await walletModule.refreshBalances(chain, walletIds);
    } catch (err2: any) {
      console.warn('[RAILGUN] refreshBalances also failed:', err2?.message);
    }
  }
}

/**
 * Trigger POI proof generation + refresh for a wallet.
 * On POI-required networks (Arbitrum), shielded funds sit in ShieldPending
 * until the wallet generates a Proof of Innocence and submits it to the
 * POI aggregator. This function kicks that process.
 */
export async function refreshPOIsForWallet(walletId: string): Promise<void> {
  if (!_providerLoaded) {
    console.log('[RAILGUN-POI] Provider not loaded, attempting to load...');
    try {
      await loadProviderAndSync();
    } catch (err: any) {
      console.warn('[RAILGUN-POI] Cannot load provider for POI refresh:', err?.message);
      return;
    }
  }
  if (!_providerLoaded) {
    console.warn('[RAILGUN-POI] Provider still not loaded after retry, skipping POI refresh');
    return;
  }

  try {
    const walletModule = await getWalletModule();
    const sharedModels = await getSharedModels();
    const { NetworkName, TXIDVersion } = sharedModels;

    const chainId = Number(import.meta.env.VITE_DEFAULT_CHAIN_ID || '42161');
    const networkName = chainId === 42161 ? NetworkName.Arbitrum : NetworkName.Arbitrum;

    console.log('[RAILGUN-POI] Generating POI proofs for wallet...');
    await walletModule.generatePOIsForWallet(networkName, walletId);
    console.log('[RAILGUN-POI] POI proof generation complete');

    console.log('[RAILGUN-POI] Refreshing receive POIs...');
    await walletModule.refreshReceivePOIsForWallet(
      TXIDVersion.V2_PoseidonMerkle,
      networkName,
      walletId,
    );
    console.log('[RAILGUN-POI] Receive POI refresh complete');
  } catch (err: any) {
    console.warn('[RAILGUN-POI] POI refresh failed:', err?.message);
  }
}

/**
 * Get detailed bucket breakdown for diagnostics.
 * Returns which bucket each token's balance is in.
 */
export async function getBucketBreakdown(
  walletId: string,
): Promise<Record<string, Record<string, string>>> {
  const result: Record<string, Record<string, string>> = {};

  try {
    const walletModule = await getWalletModule();
    const sharedModels = await getSharedModels();
    const { TXIDVersion, NETWORK_CONFIG, NetworkName, RailgunWalletBalanceBucket } = sharedModels;

    const chainId = Number(import.meta.env.VITE_DEFAULT_CHAIN_ID || '42161');
    const networkName = chainId === 42161 ? NetworkName.Arbitrum : NetworkName.Arbitrum;
    const chain = NETWORK_CONFIG[networkName as keyof typeof NETWORK_CONFIG]?.chain;
    if (!chain) return result;

    const wallet = walletModule.walletForID(walletId);
    if (typeof wallet.getTokenBalancesByBucket !== 'function') return result;

    const bucketBalances = await wallet.getTokenBalancesByBucket(
      TXIDVersion.V2_PoseidonMerkle,
      chain,
    );

    const bucketNames = Object.values(RailgunWalletBalanceBucket) as string[];

    for (const bucketName of bucketNames) {
      const tokenBalances = bucketBalances?.[bucketName];
      if (!tokenBalances) continue;

      const erc20Amounts = walletModule.getSerializedERC20Balances(tokenBalances);
      for (const erc20 of erc20Amounts) {
        const addr = erc20.tokenAddress?.toLowerCase();
        if (addr && erc20.amount > 0n) {
          if (!result[addr]) result[addr] = {};
          result[addr][bucketName] = erc20.amount.toString();
        }
      }
    }

    // Log a summary
    for (const [addr, buckets] of Object.entries(result)) {
      for (const [bucket, amount] of Object.entries(buckets)) {
        console.log(`[RAILGUN-POI] ${addr.slice(0, 10)}... in "${bucket}": ${amount}`);
      }
    }

    if (Object.keys(result).length === 0) {
      console.log('[RAILGUN-POI] No non-zero balances found in any bucket');
    }
  } catch (err: any) {
    console.warn('[RAILGUN-POI] Bucket breakdown failed:', err?.message);
  }

  return result;
}

// IndexedDB helper — opened once and reused
let _artifactDbPromise: Promise<IDBDatabase> | null = null;

const ARTIFACT_DB_NAME = 'monaris-railgun-artifacts';
const ARTIFACT_DB_VERSION = 4; // bump: wallet SDK 10.4.1 uses new IPFS artifacts (QmUsmnK4) matching on-chain vkeys

function openArtifactDB(): Promise<IDBDatabase> {
  if (_artifactDbPromise) return _artifactDbPromise;
  _artifactDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(ARTIFACT_DB_NAME, ARTIFACT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Delete old store if it exists (may have corrupt data from old interface)
      if (db.objectStoreNames.contains('artifacts')) {
        db.deleteObjectStore('artifacts');
      }
      db.createObjectStore('artifacts', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      _artifactDbPromise = null;
      reject(request.error);
    };
  });
  return _artifactDbPromise;
}
