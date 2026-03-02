/**
 * Privacy transactions – shield, unshield, private transfer, balance queries.
 *
 * Uses cached module references from engine.ts to avoid repeated dynamic
 * imports. Balance queries run token fetches in parallel.
 */

import { ensureEngineReady, getWalletModule, getSharedModels, ensureProverInitialized, clearArtifactMemoryCache } from './engine';
import type {
  ShieldRequest,
  UnshieldRequest,
  PrivateTransferRequest,
  PrivatePaymentResult,
  ProofProgressCallback,
} from './types';

// ---------- Shield (public → private) ----------

export async function buildShieldTransaction(
  req: ShieldRequest,
  networkName: string,
): Promise<{ to: string; data: string; value: bigint }> {
  await ensureEngineReady();

  const walletModule = await getWalletModule();
  const sharedModels = await getSharedModels();

  const shieldERC20Recipients = [
    {
      tokenAddress: req.tokenAddress,
      amount: req.amount,
      recipientAddress: req.fromAddress,
    },
  ];

  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const shieldPrivateKey = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  const { transaction } = await walletModule.populateShield(
    sharedModels.TXIDVersion.V2_PoseidonMerkle,
    networkName as any,
    shieldPrivateKey,
    shieldERC20Recipients,
    [],
  );

  return {
    to: transaction.to as string,
    data: transaction.data as string,
    value: BigInt(transaction.value?.toString() || '0'),
  };
}

// ---------- Unshield (private → public) ----------

// SDK uses a single global proof cache; concurrent prove+populate can overwrite each other.
let unshieldMutex: Promise<void> = Promise.resolve();

export async function buildUnshieldTransaction(
  req: UnshieldRequest,
  railgunWalletId: string,
  encryptionKey: string,
  networkName: string,
  onProgress?: ProofProgressCallback,
): Promise<PrivatePaymentResult> {
  await ensureEngineReady();

  // Refresh Merkle tree / balances so proof is built against latest on-chain state.
  // Stale tree state causes "Invalid Snark Proof" (root no longer accepted by contract).
  const chainId = networkName === 'Arbitrum' ? 42161 : 421614;
  await triggerBalanceScan(railgunWalletId, chainId);

  const wallet = await getWalletModule();
  const { TXIDVersion } = await getSharedModels();

  const erc20AmountRecipients = [
    {
      tokenAddress: req.tokenAddress,
      amount: req.amount,
      recipientAddress: req.toAddress,
    },
  ];

  await ensureProverInitialized();

  // Force fresh artifact load from IndexedDB (prevents stale in-memory cache)
  await clearArtifactMemoryCache();

  const proofStart = Date.now();

  const prev = unshieldMutex;
  let resolveMutex: () => void;
  unshieldMutex = new Promise<void>((r) => { resolveMutex = r; });
  await prev;

  try {
    console.log('[Unshield] Starting proof generation for', {
      token: req.tokenAddress.slice(0, 10),
      amount: req.amount.toString(),
      to: req.toAddress.slice(0, 10),
      network: networkName,
      walletId: railgunWalletId.slice(0, 12),
    });

    const { gasEstimate } = await wallet.gasEstimateForUnprovenUnshield(
      TXIDVersion.V2_PoseidonMerkle,
      networkName as any,
      railgunWalletId,
      encryptionKey,
      erc20AmountRecipients,
      [],
      { evmGasType: 2, maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 100_000_000n, gasEstimate: 0n },
      undefined,
      true,
    );

    console.log('[Unshield] Gas estimate obtained:', gasEstimate.toString());

    await wallet.generateUnshieldProof(
      TXIDVersion.V2_PoseidonMerkle,
      networkName as any,
      railgunWalletId,
      encryptionKey,
      erc20AmountRecipients,
      [],
      undefined,
      true,
      0n,
      (progress: number) => {
        onProgress?.(progress, 'Generating unshield proof');
      },
    );

    const gasDetails = {
      evmGasType: 2 as const,
      maxFeePerGas: 1_000_000_000n,
      maxPriorityFeePerGas: 100_000_000n,
      gasEstimate,
    };

    const { transaction } = await wallet.populateProvedUnshield(
      TXIDVersion.V2_PoseidonMerkle,
      networkName as any,
      railgunWalletId,
      erc20AmountRecipients,
      [],
      undefined,
      true,
      0n,
      gasDetails,
    );

    console.log('[Unshield] Transaction populated:', {
      to: transaction.to,
      dataLength: transaction.data?.length,
      dataPrefix: transaction.data?.slice(0, 10),
      value: transaction.value?.toString(),
      from: (transaction as any).from,
      chainId: (transaction as any).chainId?.toString(),
    });

    return {
      success: true,
      txHash: transaction.to,
      proofTime: Date.now() - proofStart,
      transaction: {
        to: transaction.to,
        data: transaction.data,
        value: BigInt(transaction.value ?? 0),
        gasEstimate: gasEstimate + 150_000n,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unshield failed',
      proofTime: Date.now() - proofStart,
    };
  } finally {
    resolveMutex!();
  }
}

// ---------- Private transfer (private → private) ----------

export async function buildPrivateTransfer(
  req: PrivateTransferRequest,
  railgunWalletId: string,
  encryptionKey: string,
  networkName: string,
  onProgress?: ProofProgressCallback,
): Promise<PrivatePaymentResult> {
  await ensureEngineReady();

  const wallet = await getWalletModule();
  const { TXIDVersion } = await getSharedModels();

  await ensureProverInitialized();

  const erc20AmountRecipients = [
    {
      tokenAddress: req.tokenAddress,
      amount: req.amount,
      recipientAddress: req.recipientRailgunAddress,
    },
  ];

  const proofStart = Date.now();

  try {
    const { gasEstimate } = await wallet.gasEstimateForUnprovenTransfer(
      TXIDVersion.V2_PoseidonMerkle,
      networkName as any,
      railgunWalletId,
      encryptionKey,
      req.memo,
      erc20AmountRecipients,
      [],
      { evmGasType: 2, maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 100_000_000n, gasEstimate: 0n },
      undefined,
      true,
    );

    onProgress?.(0.1, 'Estimated gas');

    await wallet.generateTransferProof(
      TXIDVersion.V2_PoseidonMerkle,
      networkName as any,
      railgunWalletId,
      encryptionKey,
      true,
      req.memo,
      erc20AmountRecipients,
      [],
      undefined,
      true,
      0n,
      (progress: number) => {
        onProgress?.(0.1 + progress * 0.8, 'Generating transfer proof');
      },
    );

    onProgress?.(0.9, 'Proof complete, building transaction');

    const gasDetails = {
      evmGasType: 2 as const,
      maxFeePerGas: 1_000_000_000n,
      maxPriorityFeePerGas: 100_000_000n,
      gasEstimate,
    };

    const { transaction } = await wallet.populateProvedTransfer(
      TXIDVersion.V2_PoseidonMerkle,
      networkName as any,
      railgunWalletId,
      true,
      req.memo,
      erc20AmountRecipients,
      [],
      undefined,
      true,
      0n,
      gasDetails,
    );

    onProgress?.(1.0, 'Transaction ready');

    return {
      success: true,
      txHash: transaction.to,
      proofTime: Date.now() - proofStart,
      transaction: {
        to: transaction.to,
        data: transaction.data,
        value: BigInt(transaction.value ?? 0),
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Private transfer failed',
      proofTime: Date.now() - proofStart,
    };
  }
}

// ---------- Balance query ----------

let _scanInProgress = false;
let _scanPromise: Promise<void> | null = null;

/**
 * Trigger a balance scan for a given wallet + chain.
 * Guarded by a mutex — if a scan is already running, callers wait for it.
 * Uses refreshBalances (lightweight) first; falls back to full rescan only
 * if refreshBalances returns without populating data.
 */
export async function triggerBalanceScan(
  railgunWalletId: string,
  chainId: number,
): Promise<void> {
  if (_scanInProgress) {
    console.log('[PrivateBalance] Scan already in progress, waiting for completion');
    if (_scanPromise) await _scanPromise;
    return;
  }

  await ensureEngineReady();

  const walletModule = await getWalletModule();

  try {
    walletModule.walletForID(railgunWalletId);
  } catch {
    console.warn('[PrivateBalance] Wallet not in engine yet, skipping scan');
    return;
  }

  _scanInProgress = true;
  const chain = { type: 0, id: chainId };

  _scanPromise = (async () => {
    try {
      await walletModule.refreshBalances(chain, [railgunWalletId]);
    } catch (err: any) {
      console.warn('[PrivateBalance] refreshBalances failed, trying full rescan:', err?.message);
      try {
        await walletModule.rescanFullUTXOMerkletreesAndWallets(chain, [railgunWalletId]);
      } catch (err2: any) {
        console.warn('[PrivateBalance] Full rescan also failed:', err2?.message);
      }
    } finally {
      _scanInProgress = false;
      _scanPromise = null;
    }
  })();

  await _scanPromise;
}

/**
 * Get shielded balances for a wallet across known tokens.
 * On POI-required networks (Arbitrum), balances are stored in buckets
 * (Spendable, ShieldPending, MissingInternalPOI, etc.).
 * Returns both total and spendable amounts so the UI can distinguish.
 */
export async function getPrivateBalances(
  railgunWalletId: string,
  networkName: string,
  tokenAddresses: string[],
): Promise<Record<string, bigint>> {
  await ensureEngineReady();

  const walletModule = await getWalletModule();
  const sharedModels = await getSharedModels();
  const { TXIDVersion, NETWORK_CONFIG, RailgunWalletBalanceBucket } = sharedModels;

  let wallet: any;
  try {
    wallet = walletModule.walletForID(railgunWalletId);
  } catch {
    console.warn('[PrivateBalance] Wallet not yet loaded in engine, returning cached/zero balances');
    const empty: Record<string, bigint> = {};
    for (const addr of tokenAddresses) empty[addr.toLowerCase()] = 0n;
    return empty;
  }

  const chain = NETWORK_CONFIG[networkName as keyof typeof NETWORK_CONFIG]?.chain;
  if (!chain) {
    console.warn(`[PrivateBalance] No chain config for network ${networkName}`);
    const empty: Record<string, bigint> = {};
    for (const addr of tokenAddresses) empty[addr.toLowerCase()] = 0n;
    return empty;
  }

  const result: Record<string, bigint> = {};
  for (const addr of tokenAddresses) result[addr.toLowerCase()] = 0n;

  // Strategy 1: Try getTokenBalancesByBucket (POI-required networks like Arbitrum)
  // This gives us balances grouped by bucket — we sum all non-Spent buckets
  try {
    if (typeof wallet.getTokenBalancesByBucket === 'function') {
      const bucketBalances = await wallet.getTokenBalancesByBucket(
        TXIDVersion.V2_PoseidonMerkle,
        chain,
      );

      const bucketNames = Object.values(RailgunWalletBalanceBucket) as string[];
      let foundAny = false;

      for (const bucketName of bucketNames) {
        if (bucketName === 'Spent') continue;
        const tokenBalances = bucketBalances?.[bucketName];
        if (!tokenBalances) continue;

        const erc20Amounts = walletModule.getSerializedERC20Balances(tokenBalances);
        for (const erc20 of erc20Amounts) {
          const addr = erc20.tokenAddress?.toLowerCase();
          if (addr && result[addr] !== undefined && erc20.amount > 0n) {
            console.log(`[PrivateBalance] ${addr.slice(0, 10)}... bucket "${bucketName}": ${erc20.amount.toString()}`);
            result[addr] += erc20.amount;
            foundAny = true;
          }
        }
      }

      if (foundAny) {
        for (const addr of tokenAddresses) {
          console.log(`[PrivateBalance] TOTAL ${addr.slice(0, 10)}...: ${result[addr.toLowerCase()].toString()}`);
        }
        return result;
      }
    }
  } catch (err: any) {
    console.warn('[PrivateBalance] getTokenBalancesByBucket failed:', err?.message);
  }

  // Strategy 2: Direct getTokenBalances (non-POI networks or fallback)
  try {
    const allBalances = await wallet.getTokenBalances(
      TXIDVersion.V2_PoseidonMerkle,
      chain,
      false,
    );
    const erc20Amounts = walletModule.getSerializedERC20Balances(allBalances);
    console.log(`[PrivateBalance] getTokenBalances returned ${erc20Amounts.length} tokens`);

    for (const erc20 of erc20Amounts) {
      const addr = erc20.tokenAddress?.toLowerCase();
      if (addr && result[addr] !== undefined) {
        console.log(`[PrivateBalance] ${addr.slice(0, 10)}... = ${erc20.amount?.toString()}`);
        result[addr] = erc20.amount ?? 0n;
      }
    }
  } catch (err: any) {
    console.warn('[PrivateBalance] getTokenBalances failed:', err?.message);

    // Strategy 3: Fallback to balanceForERC20Token per token
    for (const tokenAddress of tokenAddresses) {
      try {
        const bal = await walletModule.balanceForERC20Token(
          TXIDVersion.V2_PoseidonMerkle,
          wallet,
          networkName as any,
          tokenAddress,
          false,
        );
        console.log(`[PrivateBalance] balanceForERC20Token(${tokenAddress.slice(0, 10)}..., onlySpendable=false): ${bal?.toString()}`);
        result[tokenAddress.toLowerCase()] = bal ?? 0n;
      } catch (err2: any) {
        console.warn(`[PrivateBalance] balanceForERC20Token failed for ${tokenAddress}:`, err2?.message);
      }
    }
  }

  return result;
}

/**
 * Get ONLY the spendable balance for each token.
 * This is what the SDK uses for unshield/transfer eligibility.
 * Funds in ShieldPending, MissingInternalPOI, etc. are NOT spendable.
 */
export async function getSpendableBalances(
  railgunWalletId: string,
  networkName: string,
  tokenAddresses: string[],
): Promise<Record<string, bigint>> {
  await ensureEngineReady();

  const walletModule = await getWalletModule();
  const sharedModels = await getSharedModels();
  const { TXIDVersion, NETWORK_CONFIG, RailgunWalletBalanceBucket } = sharedModels;

  const result: Record<string, bigint> = {};
  for (const addr of tokenAddresses) result[addr.toLowerCase()] = 0n;

  let wallet: any;
  try {
    wallet = walletModule.walletForID(railgunWalletId);
  } catch {
    return result;
  }

  const chain = NETWORK_CONFIG[networkName as keyof typeof NETWORK_CONFIG]?.chain;
  if (!chain) return result;

  try {
    if (typeof wallet.getTokenBalancesByBucket === 'function') {
      const bucketBalances = await wallet.getTokenBalancesByBucket(
        TXIDVersion.V2_PoseidonMerkle,
        chain,
      );

      const spendableBucket = bucketBalances?.[RailgunWalletBalanceBucket?.Spendable ?? 'Spendable'];
      if (spendableBucket) {
        const erc20Amounts = walletModule.getSerializedERC20Balances(spendableBucket);
        for (const erc20 of erc20Amounts) {
          const addr = erc20.tokenAddress?.toLowerCase();
          if (addr && result[addr] !== undefined && erc20.amount > 0n) {
            result[addr] = erc20.amount;
          }
        }
      }
      return result;
    }
  } catch { /* fall through */ }

  // Fallback: getTokenBalances with onlySpendable=true
  try {
    const allBalances = await wallet.getTokenBalances(
      TXIDVersion.V2_PoseidonMerkle,
      chain,
      true,
    );
    const erc20Amounts = walletModule.getSerializedERC20Balances(allBalances);
    for (const erc20 of erc20Amounts) {
      const addr = erc20.tokenAddress?.toLowerCase();
      if (addr && result[addr] !== undefined) {
        result[addr] = erc20.amount ?? 0n;
      }
    }
  } catch { /* best effort */ }

  return result;
}
