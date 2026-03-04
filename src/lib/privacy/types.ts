export interface PrivateWalletInfo {
  id: string;
  railgunAddress: string; // 0zk... address (never shown in UI)
  encryptionKey: string;
}

export interface PrivateWalletRecord {
  id: string;
  user_address: string;
  chain_id: number;
  encrypted_wallet_blob: string;
  wallet_fingerprint: string;
  created_at: string;
  updated_at: string;
}

export interface PrivateBalance {
  tokenAddress: string;
  symbol: string;
  decimals: number;
  balance: bigint;
  balanceFormatted: number;
}

export interface ShieldRequest {
  tokenAddress: string;
  amount: bigint;
  fromAddress: string; // RAILGUN 0zk address (shield recipient when no explicit recipient)
  recipientRailgunAddress?: string; // if set, shield directly to this 0zk address instead of fromAddress
}

export interface UnshieldRequest {
  tokenAddress: string;
  amount: bigint;
  toAddress: string; // public 0x address
}

export interface PrivateTransferRequest {
  tokenAddress: string;
  amount: bigint;
  recipientRailgunAddress: string;
  memo?: string;
}

export interface PrivatePaymentResult {
  success: boolean;
  txHash?: string;
  error?: string;
  proofTime?: number;
  transaction?: {
    to: string;
    data: string;
    value: bigint;
    gasEstimate?: bigint;
  };
}

export type ProofProgressCallback = (progress: number, stage: string) => void;

export type PrivacyEngineStatus =
  | 'uninitialized'
  | 'initializing'
  | 'loading-artifacts'
  | 'syncing'
  | 'ready'
  | 'error';

export interface PrivacyConfig {
  enabled: boolean;
  chainId: number;
  rpcUrl: string;
  usdcAddress: string;
  usdtAddress?: string;
}
