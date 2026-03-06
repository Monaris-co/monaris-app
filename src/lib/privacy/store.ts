/**
 * Zustand store for privacy-related state.
 *
 * Keeps engine status, wallet info, and balances in a single
 * reactive store so any component can subscribe to changes.
 *
 * Wallet info and balances are persisted to localStorage so the
 * UI can render instantly on reload while the engine boots in the background.
 */

import { create } from 'zustand';
import type { PrivacyEngineStatus, PrivateWalletInfo, PrivateBalance } from './types';

const WALLET_CACHE_KEY = 'monaris_pw_cache';
const BALANCE_CACHE_KEY = 'monaris_pb_cache';

function loadCachedWallet(): PrivateWalletInfo | null {
  try {
    const raw = localStorage.getItem(WALLET_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function loadCachedBalances(): { balances: PrivateBalance[]; lastSyncAt: number | null } {
  try {
    const raw = localStorage.getItem(BALANCE_CACHE_KEY);
    if (!raw) return { balances: [], lastSyncAt: null };
    const parsed = JSON.parse(raw);
    return {
      balances: (parsed.balances || []).map((b: any) => ({
        ...b,
        balance: BigInt(b.balance),
      })),
      lastSyncAt: parsed.lastSyncAt || null,
    };
  } catch { return { balances: [], lastSyncAt: null }; }
}

function persistWallet(wallet: PrivateWalletInfo | null) {
  try {
    if (wallet) localStorage.setItem(WALLET_CACHE_KEY, JSON.stringify(wallet));
    else localStorage.removeItem(WALLET_CACHE_KEY);
  } catch { /* quota/private mode */ }
}

function persistBalances(balances: PrivateBalance[], lastSyncAt: number | null) {
  try {
    localStorage.setItem(BALANCE_CACHE_KEY, JSON.stringify({
      balances: balances.map((b) => ({ ...b, balance: b.balance.toString() })),
      lastSyncAt,
    }));
  } catch { /* quota/private mode */ }
}

const cachedWallet = loadCachedWallet();
const cachedBalances = loadCachedBalances();

export type PoiStatus = 'idle' | 'retrying' | 'stuck' | 'resolved';

interface PrivacyState {
  engineStatus: PrivacyEngineStatus;
  wallet: PrivateWalletInfo | null;
  walletLoadedInEngine: boolean;
  balances: PrivateBalance[];
  isCreatingWallet: boolean;
  isSyncing: boolean;
  lastSyncAt: number | null;
  proofProgress: number;
  proofStage: string;
  poiAttempts: number;
  poiStatus: PoiStatus;
  stuckSince: number | null;

  setEngineStatus: (status: PrivacyEngineStatus) => void;
  setWallet: (wallet: PrivateWalletInfo | null) => void;
  setWalletLoadedInEngine: (v: boolean) => void;
  setBalances: (balances: PrivateBalance[]) => void;
  setIsCreatingWallet: (v: boolean) => void;
  setIsSyncing: (v: boolean) => void;
  setLastSyncAt: (t: number) => void;
  setProofProgress: (progress: number, stage: string) => void;
  setPoiStatus: (status: PoiStatus, attempts?: number) => void;
  reset: () => void;
}

export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  engineStatus: 'uninitialized',
  wallet: cachedWallet,
  walletLoadedInEngine: false,
  balances: cachedBalances.balances,
  isCreatingWallet: false,
  isSyncing: false,
  lastSyncAt: cachedBalances.lastSyncAt,
  proofProgress: 0,
  proofStage: '',
  poiAttempts: 0,
  poiStatus: 'idle' as PoiStatus,
  stuckSince: null,

  setEngineStatus: (status) => set({ engineStatus: status }),
  setWallet: (wallet) => {
    persistWallet(wallet);
    set({ wallet });
  },
  setWalletLoadedInEngine: (v) => set({ walletLoadedInEngine: v }),
  setBalances: (balances) => {
    const { lastSyncAt } = get();
    persistBalances(balances, lastSyncAt);
    set({ balances });
  },
  setIsCreatingWallet: (v) => set({ isCreatingWallet: v }),
  setIsSyncing: (v) => set({ isSyncing: v }),
  setLastSyncAt: (t) => {
    const { balances } = get();
    persistBalances(balances, t);
    set({ lastSyncAt: t });
  },
  setProofProgress: (progress, stage) => set({ proofProgress: progress, proofStage: stage }),
  setPoiStatus: (status, attempts) => {
    const updates: Partial<PrivacyState> = { poiStatus: status };
    if (attempts !== undefined) updates.poiAttempts = attempts;
    if (status === 'stuck' && !get().stuckSince) updates.stuckSince = Date.now();
    if (status === 'resolved' || status === 'idle') updates.stuckSince = null;
    set(updates);
  },
  reset: () => {
    persistWallet(null);
    persistBalances([], null);
    set({
      engineStatus: 'uninitialized',
      wallet: null,
      walletLoadedInEngine: false,
      balances: [],
      isCreatingWallet: false,
      isSyncing: false,
      lastSyncAt: null,
      proofProgress: 0,
      proofStage: '',
      poiAttempts: 0,
      poiStatus: 'idle',
      stuckSince: null,
    });
  },
}));
