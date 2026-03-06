export { PRIVATE_PAYMENTS_ENABLED, getPrivacyConfig, SUPPORTED_PRIVATE_TOKENS } from './config';
export type { SupportedPrivateToken } from './config';

export { ensureEngineReady, ensureEngineStarted, loadProviderAndSync, isProviderLoaded, getEngineStatus, onEngineStatusChange, prefetchPrivacyModules, triggerMerkleScans, getWalletModule, getSharedModels, refreshPOIsForWallet, getBucketBreakdown, ensureProverInitialized, fullPrivacyReset } from './engine';

export {
  createPrivateWallet,
  loadPrivateWallet,
  hasPrivateWallet,
  resolvePrivateAddress,
} from './wallet';

export {
  buildShieldTransaction,
  buildUnshieldTransaction,
  buildPrivateTransfer,
  getPrivateBalances,
  getSpendableBalances,
  triggerBalanceScan,
} from './transactions';

export type {
  PrivateWalletInfo,
  PrivateWalletRecord,
  PrivateBalance,
  ShieldRequest,
  UnshieldRequest,
  PrivateTransferRequest,
  PrivatePaymentResult,
  ProofProgressCallback,
  PrivacyEngineStatus,
  PrivacyConfig,
} from './types';
