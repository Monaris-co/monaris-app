export const ZEROX_API_BASE_URL =
  import.meta.env.VITE_ZEROX_API_BASE_URL || "/api/0x";

export const ZEROX_API_KEY = import.meta.env.VITE_ZEROX_API_KEY || "";
export const ZEROX_NATIVE_TOKEN_ADDRESS =
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export interface ZeroExQuoteTransaction {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface ZeroExQuote {
  allowanceTarget?: `0x${string}`;
  buyAmount: string;
  buyToken: `0x${string}`;
  sellAmount: string;
  sellToken: `0x${string}`;
  minBuyAmount?: string;
  fees?: {
    gasFee?: {
      amount?: string;
      token?: string;
      type?: string;
    } | null;
    zeroExFee?: {
      amount?: string;
      token?: string;
      type?: string;
    } | null;
    integratorFee?: {
      amount?: string;
      token?: string;
      type?: string;
    } | null;
  };
  issues?: {
    allowance?: {
      actual?: string;
      spender?: `0x${string}`;
    } | null;
    balance?: {
      token?: string;
      actual?: string;
      expected?: string;
    } | null;
    simulationIncomplete?: boolean;
    invalidSourcesPassed?: string[];
  };
  route?: {
    fills?: Array<{
      source?: string;
      proportionBps?: string;
    }>;
  };
  transaction: ZeroExQuoteTransaction;
}

interface ZeroExQuoteParams {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  taker: string;
  recipient?: string;
}

function getZeroExHeaders() {
  return {
    "0x-api-key": ZEROX_API_KEY,
    "0x-version": "v2",
  };
}

function isJsonResponse(contentType: string | null) {
  return !!contentType && contentType.toLowerCase().includes("application/json");
}

export async function fetchZeroExQuote(params: ZeroExQuoteParams) {
  const search = new URLSearchParams({
    chainId: String(params.chainId),
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
    taker: params.taker,
  });

  if (params.recipient) search.set("recipient", params.recipient);

  const response = await fetch(
    `${ZEROX_API_BASE_URL}/swap/allowance-holder/quote?${search.toString()}`,
    ZEROX_API_BASE_URL.startsWith("/")
      ? undefined
      : {
          headers: getZeroExHeaders(),
        },
  );

  const contentType = response.headers.get("content-type");

  if (!response.ok) {
    const raw = await response.text();
    let message = raw || `0x request failed with ${response.status}`;

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      message =
        typeof parsed.reason === "string"
          ? parsed.reason
          : typeof parsed.message === "string"
            ? parsed.message
            : raw;
    } catch {}

    throw new Error(message);
  }

  if (!isJsonResponse(contentType)) {
    const raw = await response.text();
    const looksLikeHtml = /^\s*</.test(raw);
    throw new Error(
      looksLikeHtml
        ? "Swap quote proxy returned HTML instead of JSON. Check the /api/0x production route."
        : "Swap quote response was not valid JSON.",
    );
  }

  try {
    return (await response.json()) as ZeroExQuote;
  } catch {
    throw new Error("Swap quote response was not valid JSON.");
  }
}
