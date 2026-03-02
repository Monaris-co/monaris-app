/**
 * React hook for querying private (shielded) token balances.
 *
 * Tracks TWO balance dimensions:
 *  - TOTAL: sum of all buckets (Spendable + ShieldPending + etc.)
 *  - SPENDABLE: only the Spendable bucket (what can be unshielded/transferred)
 *
 * On Arbitrum with POI v3, freshly shielded funds sit in ShieldPending
 * for a few minutes until POI validation completes. During this time,
 * total > spendable. The UI shows both so the user isn't confused.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useChainId } from 'wagmi';
import { usePrivacyStore } from '@/lib/privacy/store';
import { getPrivateBalances, getSpendableBalances, triggerBalanceScan, PRIVATE_PAYMENTS_ENABLED, refreshPOIsForWallet, getBucketBreakdown } from '@/lib/privacy';
import { getContractAddress } from '@/lib/contracts';
import { formatUnits } from 'viem';
import type { PrivateBalance } from '@/lib/privacy';

const AUTO_REFRESH_MS = 30_000;
const POI_RETRY_MS = 15_000;

function getNetworkName(): string {
  return 'Arbitrum';
}

export function usePrivateBalance() {
  const chainId = useChainId();
  const { wallet, walletLoadedInEngine, balances, isSyncing, lastSyncAt, setBalances, setIsSyncing, setLastSyncAt } =
    usePrivacyStore();
  const hasDoneInitialSync = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Spendable balances (only the Spendable bucket)
  const [spendableUsdc, setSpendableUsdc] = useState(0);
  const [spendableUsdt, setSpendableUsdt] = useState(0);

  const readBalances = useCallback(async () => {
    if (!wallet) return;

    try {
      const networkName = getNetworkName();
      const usdcAddress = getContractAddress('DemoUSDC', chainId)?.toLowerCase() || '';
      const usdtAddress = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9';

      const tokenAddresses = [usdcAddress, usdtAddress].filter(Boolean);

      // Fetch total (all buckets) and spendable in parallel
      const [rawBalances, rawSpendable] = await Promise.all([
        getPrivateBalances(wallet.id, networkName, tokenAddresses),
        getSpendableBalances(wallet.id, networkName, tokenAddresses),
      ]);

      const parsed: PrivateBalance[] = [];

      if (usdcAddress && rawBalances[usdcAddress]) {
        const formatted = parseFloat(formatUnits(rawBalances[usdcAddress], 6));
        parsed.push({
          tokenAddress: usdcAddress,
          symbol: 'USDC',
          decimals: 6,
          balance: rawBalances[usdcAddress],
          balanceFormatted: formatted,
        });
      }

      if (rawBalances[usdtAddress]) {
        const formatted = parseFloat(formatUnits(rawBalances[usdtAddress], 6));
        parsed.push({
          tokenAddress: usdtAddress,
          symbol: 'USDT',
          decimals: 6,
          balance: rawBalances[usdtAddress],
          balanceFormatted: formatted,
        });
      }

      // Update spendable amounts
      const spUsdc = usdcAddress && rawSpendable[usdcAddress]
        ? parseFloat(formatUnits(rawSpendable[usdcAddress], 6))
        : 0;
      const spUsdt = rawSpendable[usdtAddress]
        ? parseFloat(formatUnits(rawSpendable[usdtAddress], 6))
        : 0;

      setSpendableUsdc(spUsdc);
      setSpendableUsdt(spUsdt);

      if (parsed.length > 0) {
        const totalStr = parsed.map(p => `${p.symbol}: $${p.balanceFormatted.toFixed(2)}`).join(', ');
        console.log(`[usePrivateBalance] Total: ${totalStr} | Spendable USDC: $${spUsdc.toFixed(2)}`);
      }

      setBalances(parsed);
      setLastSyncAt(Date.now());
    } catch (err) {
      console.error('[usePrivateBalance] Read failed:', err);
    }
  }, [wallet, chainId]);

  const refreshBalances = useCallback(async () => {
    if (!wallet) return;
    setIsSyncing(true);
    try {
      await triggerBalanceScan(wallet.id, chainId);
      await readBalances();
    } catch (err) {
      console.error('[usePrivateBalance] Full rescan failed:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [wallet, chainId, readBalances]);

  useEffect(() => {
    if (!PRIVATE_PAYMENTS_ENABLED || !wallet || !walletLoadedInEngine) return;

    if (!hasDoneInitialSync.current) {
      hasDoneInitialSync.current = true;
      setIsSyncing(true);
      readBalances().finally(() => setIsSyncing(false));

      const retryDelays = [3_000, 8_000, 15_000, 25_000, 40_000, 60_000, 90_000, 120_000];
      const timers = retryDelays.map(delay =>
        setTimeout(() => readBalances(), delay),
      );
      return () => timers.forEach(clearTimeout);
    }
  }, [wallet?.id, walletLoadedInEngine]);

  useEffect(() => {
    hasDoneInitialSync.current = false;
  }, [wallet?.id]);

  useEffect(() => {
    const handler = () => {
      if (walletLoadedInEngine) {
        readBalances();
      }
    };
    window.addEventListener('railgun-balance-update', handler);
    return () => window.removeEventListener('railgun-balance-update', handler);
  }, [readBalances, walletLoadedInEngine]);

  useEffect(() => {
    if (!walletLoadedInEngine || !wallet) return;

    pollTimerRef.current = setInterval(() => {
      readBalances();
    }, AUTO_REFRESH_MS);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [walletLoadedInEngine, wallet?.id, readBalances]);

  const privateUsdcBalance =
    balances.find((b) => b.symbol === 'USDC')?.balanceFormatted ?? 0;
  const privateUsdtBalance =
    balances.find((b) => b.symbol === 'USDT')?.balanceFormatted ?? 0;
  const totalPrivateBalance = privateUsdcBalance + privateUsdtBalance;
  const totalSpendableBalance = spendableUsdc + spendableUsdt;
  const hasPendingFunds = totalPrivateBalance > 0 && totalSpendableBalance < totalPrivateBalance;

  // When pending funds detected, aggressively retry POI refresh to move ShieldPending -> Spendable
  const poiRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const poiAttemptRef = useRef(0);

  useEffect(() => {
    if (!hasPendingFunds || !wallet || !walletLoadedInEngine) {
      if (poiRetryRef.current) {
        clearInterval(poiRetryRef.current);
        poiRetryRef.current = null;
        poiAttemptRef.current = 0;
      }
      return;
    }

    // Immediate POI refresh + bucket diagnostic on first detection
    if (poiAttemptRef.current === 0) {
      console.log('[usePrivateBalance] Pending funds detected — running POI refresh + bucket diagnostics');
      getBucketBreakdown(wallet.id);
      refreshPOIsForWallet(wallet.id).then(() => {
        readBalances();
      });
      poiAttemptRef.current = 1;
    }

    poiRetryRef.current = setInterval(async () => {
      poiAttemptRef.current += 1;
      console.log(`[usePrivateBalance] POI retry #${poiAttemptRef.current} for pending funds...`);
      try {
        await refreshPOIsForWallet(wallet.id);
        await readBalances();
      } catch { /* logged inside */ }
    }, POI_RETRY_MS);

    return () => {
      if (poiRetryRef.current) {
        clearInterval(poiRetryRef.current);
        poiRetryRef.current = null;
      }
    };
  }, [hasPendingFunds, wallet?.id, walletLoadedInEngine]);

  return {
    balances,
    privateUsdcBalance,
    privateUsdtBalance,
    totalPrivateBalance,
    spendableUsdc,
    spendableUsdt,
    totalSpendableBalance,
    hasPendingFunds,
    isSyncing,
    lastSyncAt,
    refreshBalances,
    readBalances,
    isEnabled: PRIVATE_PAYMENTS_ENABLED,
  };
}
