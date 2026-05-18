import { formatUnits } from "viem";

export const ACROSS_API_BASE_URL =
  import.meta.env.VITE_ACROSS_API_BASE_URL || "https://app.across.to/api";

export const ACROSS_API_KEY = import.meta.env.VITE_ACROSS_API_KEY || "";
export const ACROSS_INTEGRATOR_ID =
  import.meta.env.VITE_ACROSS_INTEGRATOR_ID || "";
export const ACROSS_APP_FEE = import.meta.env.VITE_ACROSS_APP_FEE || "";
export const ACROSS_APP_FEE_RECIPIENT =
  import.meta.env.VITE_ACROSS_APP_FEE_RECIPIENT || "";

export const ACROSS_ORIGIN_CHAIN_ID = 42161;
export const ACROSS_NON_EVM_CHAIN_IDS = new Set([34268394551451, 1337, 2337]);

export interface AcrossChain {
  chainId: number;
  name: string;
  publicRpcUrl: string;
  explorerUrl: string;
  logoUrl?: string;
}

export interface AcrossToken {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoUrl?: string;
  priceUsd?: string;
}

export interface AcrossQuoteCheck {
  token: string;
  spender?: string;
  actual: string;
  expected: string;
}

export interface AcrossQuoteTransaction {
  chainId: number;
  to: `0x${string}`;
  data: `0x${string}`;
  value?: string;
  gas?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface AcrossQuote {
  id?: string;
  crossSwapType: string;
  amountType: string;
  checks?: {
    allowance?: AcrossQuoteCheck;
    balance?: AcrossQuoteCheck;
  };
  approvalTxns?: AcrossQuoteTransaction[];
  steps?: {
    bridge?: {
      inputAmount: string;
      outputAmount: string;
      provider?: string;
      tokenIn?: AcrossToken;
      tokenOut?: AcrossToken;
      fees?: {
        amount: string;
        pct: string;
      };
    };
  };
  fees?: {
    total?: {
      amount: string;
      amountUsd?: string;
      pct?: string;
      details?: Record<string, unknown>;
    };
    totalMax?: {
      amount: string;
      amountUsd?: string;
      pct?: string;
      details?: Record<string, unknown>;
    };
    originGas?: {
      amount: string;
      amountUsd?: string;
    };
  };
  inputToken: AcrossToken;
  outputToken: AcrossToken;
  inputAmount: string;
  maxInputAmount: string;
  expectedOutputAmount: string;
  minOutputAmount: string;
  expectedFillTime?: number;
  quoteExpiryTimestamp?: number;
  swapTx?: AcrossQuoteTransaction & {
    ecosystem?: string;
    simulationSuccess?: boolean;
  };
}

export interface AcrossDepositStatus {
  status: string;
  fillTxnRef?: string;
  depositTxnRef?: string;
  depositRefundTxnRef?: string;
  destinationChainId?: number;
  originChainId?: number;
  depositId?: number;
  actionsSucceeded?: boolean;
}

interface AcrossQuoteParams {
  amount: string;
  inputToken: string;
  outputToken: string;
  originChainId: number;
  destinationChainId: number;
  depositor: string;
  recipient?: string;
  refundAddress?: string;
}

function getAcrossHeaders() {
  return ACROSS_API_KEY
    ? {
        Authorization: `Bearer ${ACROSS_API_KEY}`,
      }
    : undefined;
}

async function acrossFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${ACROSS_API_BASE_URL}${path}`, {
    headers: getAcrossHeaders(),
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = raw || `Across request failed with ${response.status}`;

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      message =
        typeof parsed.message === "string"
          ? parsed.message
          : typeof parsed.error === "string"
            ? parsed.error
            : raw;
    } catch {}

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export function isAcrossEvmChain(chainId: number) {
  return !ACROSS_NON_EVM_CHAIN_IDS.has(chainId);
}

export function formatAcrossAmount(
  amount: string | bigint | number | undefined,
  decimals: number,
  maximumFractionDigits = 6,
) {
  if (amount === undefined) return "0";

  try {
    const normalized =
      typeof amount === "bigint" ? amount : BigInt(String(amount || 0));

    return Number(
      formatUnits(normalized, decimals),
    ).toLocaleString(undefined, {
      maximumFractionDigits,
      minimumFractionDigits: 0,
    });
  } catch {
    return "0";
  }
}

export async function fetchAcrossChains() {
  return acrossFetch<AcrossChain[]>("/swap/chains");
}

export async function fetchAcrossTokens() {
  return acrossFetch<AcrossToken[]>("/swap/tokens");
}

export async function fetchAcrossQuote(params: AcrossQuoteParams) {
  const search = new URLSearchParams({
    tradeType: "exactInput",
    slippage: "auto",
    amount: params.amount,
    inputToken: params.inputToken,
    outputToken: params.outputToken,
    originChainId: String(params.originChainId),
    destinationChainId: String(params.destinationChainId),
    depositor: params.depositor,
  });

  if (params.recipient) search.set("recipient", params.recipient);
  if (params.refundAddress) search.set("refundAddress", params.refundAddress);
  if (ACROSS_INTEGRATOR_ID) search.set("integratorId", ACROSS_INTEGRATOR_ID);

  if (ACROSS_APP_FEE && ACROSS_APP_FEE_RECIPIENT) {
    search.set("appFee", ACROSS_APP_FEE);
    search.set("appFeeRecipient", ACROSS_APP_FEE_RECIPIENT);
  }

  return acrossFetch<AcrossQuote>(`/swap/approval?${search.toString()}`);
}

export async function fetchAcrossDepositStatus(depositTxnRef: string) {
  const search = new URLSearchParams({ depositTxnRef });
  return acrossFetch<AcrossDepositStatus>(`/deposit/status?${search.toString()}`);
}
