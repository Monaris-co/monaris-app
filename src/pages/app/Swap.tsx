import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRightLeft,
  ArrowUpRight,
  Clock3,
  Loader2,
  Info,
  Wallet,
} from "lucide-react";
import {
  encodeFunctionData,
  formatUnits,
  isAddress,
  parseUnits,
  zeroAddress,
} from "viem";
import { useChainId, usePublicClient, useSwitchChain } from "wagmi";
import { usePrivy, useSendTransaction, useWallets } from "@privy-io/react-auth";
import { toast } from "sonner";
import { usePrivyAccount } from "@/hooks/usePrivyAccount";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ERC20ABI } from "@/lib/abis";
import {
  ACROSS_API_KEY,
  ACROSS_INTEGRATOR_ID,
  ACROSS_ORIGIN_CHAIN_ID,
  type AcrossChain,
  type AcrossDepositStatus,
  type AcrossQuote,
  type AcrossToken,
  fetchAcrossChains,
  fetchAcrossDepositStatus,
  fetchAcrossQuote,
  fetchAcrossTokens,
  formatAcrossAmount,
  isAcrossEvmChain,
} from "@/lib/across";
import { walletSupportedChains } from "@/lib/wallet-chains";
import {
  fetchZeroExQuote,
  type ZeroExQuote,
  ZEROX_API_KEY,
  ZEROX_NATIVE_TOKEN_ADDRESS,
} from "@/lib/zeroex";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

const TOKEN_PRIORITY: Record<string, number> = {
  USDC: 0,
  USDT: 1,
  DAI: 2,
  ETH: 3,
  WETH: 4,
  WBTC: 5,
  ACX: 6,
};

const GAS_SPONSORED_CHAIN_IDS = new Set([5003, 421614, 11155111, 42161]);
const ZEROX_ROUTE_CHAIN_IDS = new Set([42161]);

function sortTokens(tokens: AcrossToken[]) {
  return [...tokens].sort((a, b) => {
    const aPriority = TOKEN_PRIORITY[a.symbol] ?? 99;
    const bPriority = TOKEN_PRIORITY[b.symbol] ?? 99;

    if (aPriority !== bPriority) return aPriority - bPriority;
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return a.name.localeCompare(b.name);
  });
}

function getTxUrl(chain: AcrossChain | undefined, hash: string | undefined) {
  if (!chain?.explorerUrl || !hash) return "";
  return `${chain.explorerUrl.replace(/\/$/, "")}/tx/${hash}`;
}

function getStatusTone(status: string | undefined) {
  switch (status) {
    case "confirmed":
    case "filled":
      return "text-[#0f9d58] bg-[#ddf9e4]";
    case "pending":
    case "slowFillRequested":
      return "text-[#197bbd] bg-[#e4f0ff]";
    case "expired":
    case "refunded":
      return "text-[#b65d00] bg-[#fff1dd]";
    default:
      return "text-[#6b7280] bg-[#f3f4f6]";
  }
}

function estimateTxFeeWei(
  tx: {
    gas?: string;
    maxFeePerGas?: string;
  },
  fallbackGasPrice?: bigint,
) {
  try {
    const gas = tx.gas ? BigInt(tx.gas) : 0n;
    const gasPrice = tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : fallbackGasPrice ?? 0n;

    if (gas <= 0n || gasPrice <= 0n) return 0n;
    return gas * gasPrice;
  } catch {
    return 0n;
  }
}

function formatUsd(value: number | string | undefined, fallback = "--") {
  const normalized = typeof value === "string" ? Number(value) : value;
  if (!normalized || !Number.isFinite(normalized)) return fallback;
  return `~ $${normalized.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: normalized >= 100 ? 2 : 4,
  })}`;
}

function numericAmount(value: string | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isNativeAcrossToken(token: AcrossToken | null | undefined) {
  if (!token) return false;

  const normalizedAddress = token.address.toLowerCase();
  return (
    normalizedAddress === zeroAddress ||
    normalizedAddress === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  );
}

function normalizeZeroExTokenAddress(token: AcrossToken) {
  return isNativeAcrossToken(token) ? ZEROX_NATIVE_TOKEN_ADDRESS : token.address;
}

function getAmountClass(value: string | undefined) {
  const normalized = (value || "0").replace(/[^0-9.]/g, "");
  const length = normalized.length;

  if (length >= 14) {
    return "text-[clamp(1.05rem,2.2vw,1.95rem)] tracking-[-0.065em]";
  }

  if (length >= 12) {
    return "text-[clamp(1.15rem,2.5vw,2.15rem)] tracking-[-0.065em]";
  }

  if (length >= 10) {
    return "text-[clamp(1.3rem,3vw,2.45rem)] tracking-[-0.06em]";
  }

  if (length >= 8) {
    return "text-[clamp(1.55rem,3.8vw,2.95rem)] tracking-[-0.055em]";
  }

  return "text-[clamp(1.9rem,5vw,3.55rem)] tracking-[-0.045em]";
}

function TokenLogo({
  label,
  src,
  size = "md",
}: {
  label: string;
  src?: string;
  size?: "sm" | "md";
}) {
  const dimension = size === "sm" ? "h-6 w-6" : "h-10 w-10";

  if (src) {
    return (
      <img
        src={src}
        alt={label}
        className={`${dimension} rounded-full border border-black/5 object-cover bg-white`}
      />
    );
  }

  return (
    <div
      className={`${dimension} rounded-full bg-[#ecffc7] text-[#1a1a1a] flex items-center justify-center text-xs font-semibold uppercase`}
    >
      {label.slice(0, 2)}
    </div>
  );
}

export default function Swap() {
  const { address } = usePrivyAccount();
  const { login } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [originChainId, setOriginChainId] = useState(() =>
    walletSupportedChains.some((chain) => chain.id === currentChainId)
      ? currentChainId
      : ACROSS_ORIGIN_CHAIN_ID,
  );
  const publicClient = usePublicClient({ chainId: originChainId });

  const [chains, setChains] = useState<AcrossChain[]>([]);
  const [tokens, setTokens] = useState<AcrossToken[]>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [amount, setAmount] = useState("100");
  const [recipient, setRecipient] = useState("");
  const [recipientTouched, setRecipientTouched] = useState(false);
  const [inputTokenAddress, setInputTokenAddress] = useState("");
  const [destinationChainId, setDestinationChainId] = useState<number>(8453);
  const [outputTokenAddress, setOutputTokenAddress] = useState("");

  const [quote, setQuote] = useState<AcrossQuote | null>(null);
  const [sameChainQuote, setSameChainQuote] = useState<ZeroExQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [inputTokenBalanceRaw, setInputTokenBalanceRaw] = useState<bigint | null>(null);
  const [isLoadingInputTokenBalance, setIsLoadingInputTokenBalance] = useState(false);

  const [swapHash, setSwapHash] = useState<`0x${string}` | null>(null);
  const [depositStatus, setDepositStatus] = useState<AcrossDepositStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isTrackingStatus, setIsTrackingStatus] = useState(false);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      setIsBootstrapping(true);
      setLoadError(null);

      try {
        const [chainsResponse, tokensResponse] = await Promise.all([
          fetchAcrossChains(),
          fetchAcrossTokens(),
        ]);

        if (!active) return;

        setChains(chainsResponse);
        setTokens(tokensResponse);
      } catch (error) {
        if (!active) return;
        const message =
          error instanceof Error ? error.message : "Failed to load Across routes.";
        setLoadError(message);
      } finally {
        if (active) setIsBootstrapping(false);
      }
    }

    bootstrap();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (address && !recipientTouched) {
      setRecipient(address);
    }
  }, [address, recipientTouched]);

  const chainById = useMemo(
    () => new Map(chains.map((chain) => [chain.chainId, chain])),
    [chains],
  );

  const supportedOriginChainIds = useMemo(
    () => new Set(walletSupportedChains.map((chain) => chain.id)),
    [],
  );

  const originChains = useMemo(
    () =>
      chains
        .filter(
          (chain) =>
            supportedOriginChainIds.has(chain.chainId) && isAcrossEvmChain(chain.chainId),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [chains, supportedOriginChainIds],
  );

  useEffect(() => {
    if (!originChains.length) return;

    const selectedOriginStillValid = originChains.some(
      (chain) => chain.chainId === originChainId,
    );

    if (selectedOriginStillValid) return;

    const preferredOrigin =
      originChains.find((chain) => chain.chainId === currentChainId) ??
      originChains.find((chain) => chain.chainId === ACROSS_ORIGIN_CHAIN_ID) ??
      originChains[0];

    setOriginChainId(preferredOrigin.chainId);
  }, [currentChainId, originChainId, originChains]);

  const originChain = chainById.get(originChainId);
  const isSameChainRoute = originChainId === destinationChainId;
  const isSameChainSwapSupported = ZEROX_ROUTE_CHAIN_IDS.has(originChainId);
  const destinationChains = useMemo(
    () =>
      chains
        .filter((chain) => isAcrossEvmChain(chain.chainId))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [chains],
  );

  const originTokens = useMemo(
    () => sortTokens(tokens.filter((token) => token.chainId === originChainId)),
    [originChainId, tokens],
  );

  const destinationTokens = useMemo(
    () => sortTokens(tokens.filter((token) => token.chainId === destinationChainId)),
    [tokens, destinationChainId],
  );

  const selectedInputToken = useMemo(
    () => originTokens.find((token) => token.address === inputTokenAddress) ?? null,
    [originTokens, inputTokenAddress],
  );

  const selectedOutputToken = useMemo(
    () => destinationTokens.find((token) => token.address === outputTokenAddress) ?? null,
    [destinationTokens, outputTokenAddress],
  );

  const selectedDestinationChain = chainById.get(destinationChainId);

  useEffect(() => {
    let active = true;
    let intervalId: number | undefined;

    async function loadInputTokenBalance() {
      if (!address || !selectedInputToken || !publicClient) {
        if (active) {
          setInputTokenBalanceRaw(null);
          setIsLoadingInputTokenBalance(false);
        }
        return;
      }

      setIsLoadingInputTokenBalance(true);

      try {
        const nextBalance = isNativeAcrossToken(selectedInputToken)
          ? await publicClient.getBalance({
              address: address as `0x${string}`,
            })
          : await publicClient.readContract({
              address: selectedInputToken.address as `0x${string}`,
              abi: ERC20ABI,
              functionName: "balanceOf",
              args: [address as `0x${string}`],
            });

        if (!active) return;
        setInputTokenBalanceRaw(nextBalance);
      } catch {
        if (!active) return;
        setInputTokenBalanceRaw(null);
      } finally {
        if (active) setIsLoadingInputTokenBalance(false);
      }
    }

    void loadInputTokenBalance();
    intervalId = window.setInterval(() => {
      void loadInputTokenBalance();
    }, 30000);

    return () => {
      active = false;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [address, publicClient, selectedInputToken]);

  useEffect(() => {
    if (!originTokens.length) {
      setInputTokenAddress("");
      return;
    }

    const selectedStillValid = originTokens.some(
      (token) => token.address === inputTokenAddress,
    );

    if (selectedStillValid) return;

    const preferredInput =
      originTokens.find((token) => token.symbol === "USDC") ?? originTokens[0];

    setInputTokenAddress(preferredInput.address);
  }, [originTokens, inputTokenAddress]);

  useEffect(() => {
    if (!destinationChains.length) return;

    const destinationStillValid = destinationChains.some(
      (chain) => chain.chainId === destinationChainId,
    );

    if (destinationStillValid) return;

    const preferredChain =
      destinationChains.find((chain) => chain.chainId === 8453) ?? destinationChains[0];
    setDestinationChainId(preferredChain.chainId);
  }, [destinationChains, destinationChainId]);

  useEffect(() => {
    if (!destinationTokens.length) {
      setOutputTokenAddress("");
      return;
    }

    const selectedStillValid = destinationTokens.some(
      (token) => token.address === outputTokenAddress,
    );

    if (selectedStillValid) return;

    const matchingSymbol = selectedInputToken
      ? destinationTokens.find((token) => token.symbol === selectedInputToken.symbol)
      : null;

    const preferredOutput = isSameChainRoute
      ? destinationTokens.find(
          (token) =>
            token.address !== selectedInputToken?.address &&
            (token.symbol === "ETH" || token.symbol === "WETH"),
        ) ??
        destinationTokens.find((token) => token.address !== selectedInputToken?.address) ??
        destinationTokens[0]
      : matchingSymbol ??
        destinationTokens.find((token) => token.symbol === "USDC") ??
        destinationTokens[0];

    setOutputTokenAddress(preferredOutput.address);
  }, [destinationTokens, isSameChainRoute, outputTokenAddress, selectedInputToken]);

  useEffect(() => {
    setQuote(null);
    setSameChainQuote(null);
    setQuoteError(null);
    setSwapHash(null);
    setDepositStatus(null);
    setStatusError(null);
  }, [
    amount,
    destinationChainId,
    inputTokenAddress,
    originChainId,
    outputTokenAddress,
    recipient,
  ]);

  const connectedWallet =
    wallets.find((wallet) => {
      const connectorType = wallet.connectorType?.toLowerCase() || "";
      const walletClientType = wallet.walletClientType?.toLowerCase() || "";

      return (
        connectorType === "embedded" ||
        walletClientType === "privy" ||
        connectorType.includes("privy") ||
        connectorType.includes("embedded")
      );
    }) ?? wallets[0];

  const isEmbeddedWallet =
    connectedWallet?.connectorType?.toLowerCase() === "embedded" ||
    connectedWallet?.walletClientType?.toLowerCase() === "privy";

  const isOnOriginChain = currentChainId === originChainId;
  const originChainSupportsSponsorship = GAS_SPONSORED_CHAIN_IDS.has(originChainId);
  const hasQuote = isSameChainRoute ? Boolean(sameChainQuote) : Boolean(quote);
  const activeEngineLabel = isSameChainRoute ? "0x" : "Across";

  const quotePreview = useMemo(() => {
    if (isSameChainRoute) {
      if (!sameChainQuote || !selectedInputToken || !selectedOutputToken) return null;

      return {
        inputAmount: formatAcrossAmount(
          sameChainQuote.sellAmount,
          selectedInputToken.decimals,
        ),
        outputAmount: formatAcrossAmount(
          sameChainQuote.buyAmount,
          selectedOutputToken.decimals,
        ),
        minOutputAmount: formatAcrossAmount(
          sameChainQuote.minBuyAmount || sameChainQuote.buyAmount,
          selectedOutputToken.decimals,
        ),
        bridgeFee: "0",
        balanceActual: formatAcrossAmount(
          sameChainQuote.issues?.balance?.actual,
          selectedInputToken.decimals,
        ),
        balanceExpected: formatAcrossAmount(
          sameChainQuote.issues?.balance?.expected,
          selectedInputToken.decimals,
        ),
        allowanceActual: formatAcrossAmount(
          sameChainQuote.issues?.allowance?.actual,
          selectedInputToken.decimals,
        ),
        allowanceExpected: formatAcrossAmount(
          sameChainQuote.sellAmount,
          selectedInputToken.decimals,
        ),
      };
    }

    if (!quote || !selectedInputToken || !selectedOutputToken) return null;

    return {
      inputAmount: formatAcrossAmount(
        quote.inputAmount || quote.steps?.bridge?.inputAmount,
        selectedInputToken.decimals,
      ),
      outputAmount: formatAcrossAmount(
        quote.expectedOutputAmount || quote.steps?.bridge?.outputAmount,
        selectedOutputToken.decimals,
      ),
      minOutputAmount: formatAcrossAmount(
        quote.minOutputAmount,
        selectedOutputToken.decimals,
      ),
      bridgeFee: formatAcrossAmount(
        quote.steps?.bridge?.fees?.amount,
        selectedInputToken.decimals,
      ),
      balanceActual: formatAcrossAmount(
        quote.checks?.balance?.actual,
        selectedInputToken.decimals,
      ),
      balanceExpected: formatAcrossAmount(
        quote.checks?.balance?.expected,
        selectedInputToken.decimals,
      ),
      allowanceActual: formatAcrossAmount(
        quote.checks?.allowance?.actual,
        selectedInputToken.decimals,
      ),
      allowanceExpected: formatAcrossAmount(
        quote.checks?.allowance?.expected,
        selectedInputToken.decimals,
      ),
    };
  }, [isSameChainRoute, quote, sameChainQuote, selectedInputToken, selectedOutputToken]);

  const quoteExpiry = useMemo(() => {
    if (isSameChainRoute) return null;
    if (!quote?.quoteExpiryTimestamp) return null;
    return new Date(quote.quoteExpiryTimestamp * 1000).toLocaleTimeString();
  }, [isSameChainRoute, quote]);

  const inputTokenBalanceDisplay = useMemo(() => {
    if (!selectedInputToken || inputTokenBalanceRaw === null) return "--";
    return formatAcrossAmount(inputTokenBalanceRaw, selectedInputToken.decimals);
  }, [inputTokenBalanceRaw, selectedInputToken]);

  const sellUsd = useMemo(() => {
    if (!selectedInputToken?.priceUsd) return undefined;
    return numericAmount(amount) * Number(selectedInputToken.priceUsd);
  }, [amount, selectedInputToken?.priceUsd]);

  const buyUsd = useMemo(() => {
    if (!quotePreview?.outputAmount || !selectedOutputToken?.priceUsd) return undefined;
    return numericAmount(quotePreview.outputAmount.replace(/,/g, "")) * Number(selectedOutputToken.priceUsd);
  }, [quotePreview?.outputAmount, selectedOutputToken?.priceUsd]);

  const routeSummary = useMemo(() => {
    if (!quotePreview || !selectedInputToken || !selectedOutputToken) {
      return {
        routeLabel: activeEngineLabel,
        fill: "--",
        minimumReceived: "--",
        rate: "--",
        networkFee: "--",
      };
    }

    const input = numericAmount(quotePreview.inputAmount.replace(/,/g, ""));
    const output = numericAmount(quotePreview.outputAmount.replace(/,/g, ""));

    if (isSameChainRoute && sameChainQuote) {
      const gasPrice = sameChainQuote.transaction.gasPrice
        ? BigInt(sameChainQuote.transaction.gasPrice)
        : 0n;
      const gas = sameChainQuote.transaction.gas ? BigInt(sameChainQuote.transaction.gas) : 0n;
      const estimatedGasFee =
        gas > 0n && gasPrice > 0n
          ? `~ ${Number(formatUnits(gas * gasPrice, 18)).toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })} ETH`
          : "--";

      const routeSource =
        sameChainQuote.route?.fills?.[0]?.source || sameChainQuote.fees?.zeroExFee?.type;

      return {
        routeLabel: "0x",
        fill: routeSource ? `${routeSource}` : "Same chain",
        minimumReceived: `${quotePreview.minOutputAmount} ${selectedOutputToken.symbol}`,
        rate:
          input > 0 && output > 0
            ? `1 ${selectedInputToken.symbol} = ${(output / input).toLocaleString(undefined, {
                maximumFractionDigits: 6,
              })} ${selectedOutputToken.symbol}`
            : "--",
        networkFee: estimatedGasFee,
      };
    }

    if (!quote) {
      return {
        routeLabel: activeEngineLabel,
        fill: "--",
        minimumReceived: "--",
        rate: "--",
        networkFee: "--",
      };
    }

    const feeUsd = quote.fees?.originGas?.amountUsd || quote.fees?.total?.amountUsd;

    return {
      routeLabel: quote.crossSwapType === "bridgeableToBridgeable" ? "Best Rate" : "Across Route",
      fill: quote.expectedFillTime ? `~ ${quote.expectedFillTime}s` : "--",
      minimumReceived: `${quotePreview.minOutputAmount} ${selectedOutputToken.symbol}`,
      rate:
        input > 0 && output > 0
          ? `1 ${selectedInputToken.symbol} = ${(output / input).toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })} ${selectedOutputToken.symbol}`
          : "--",
      networkFee: feeUsd
        ? formatUsd(feeUsd)
        : `${quotePreview.bridgeFee} ${selectedInputToken.symbol}`,
    };
  }, [activeEngineLabel, isSameChainRoute, quote, quotePreview, sameChainQuote, selectedInputToken, selectedOutputToken]);

  const routeDisabledReason = useMemo(() => {
    if (!address) return "Connect your wallet to request a live quote.";
    if (!originChain) return "Select an origin chain.";
    if (!selectedInputToken || !selectedOutputToken || !selectedDestinationChain) {
      return "Pick the origin, destination, and token pair.";
    }
    if (isSameChainRoute && !isSameChainSwapSupported) {
      return "Same-chain swaps are currently enabled on Arbitrum only.";
    }
    if (isSameChainRoute && !ZEROX_API_KEY) {
      return "Set VITE_ZEROX_API_KEY to request same-chain quotes.";
    }
    if (
      isSameChainRoute &&
      selectedInputToken.address.toLowerCase() === selectedOutputToken.address.toLowerCase()
    ) {
      return "Choose a different buy token for a same-chain swap.";
    }
    if (!amount || Number(amount) <= 0) return "Enter a valid amount.";
    if (!recipient || !isAddress(recipient)) return "Recipient must be a valid EVM address.";
    return null;
  }, [
    address,
    amount,
    isSameChainRoute,
    isSameChainSwapSupported,
    originChain,
    recipient,
    selectedDestinationChain,
    selectedInputToken,
    selectedOutputToken,
  ]);

  const executeDisabledReason = useMemo(() => {
    if (isSameChainRoute) {
      if (!sameChainQuote?.transaction) return "Request a live quote before executing.";
    } else if (!quote?.swapTx) {
      return "Request a live quote before executing.";
    }
    if (!connectedWallet) return "Connect a wallet to execute this route.";
    if (!originChain) return "Select an origin chain.";
    return null;
  }, [connectedWallet, isSameChainRoute, originChain, quote?.swapTx, sameChainQuote?.transaction]);

  const nonSponsoredGasWarning = useMemo(() => {
    const activeTx = isSameChainRoute ? sameChainQuote?.transaction : quote?.swapTx;
    if (!activeTx || !originChain || !isEmbeddedWallet || originChainSupportsSponsorship) {
      return null;
    }

    const swapFeeWei = estimateTxFeeWei(
      isSameChainRoute
        ? {
            gas: sameChainQuote?.transaction.gas,
            maxFeePerGas:
              sameChainQuote?.transaction.maxFeePerGas || sameChainQuote?.transaction.gasPrice,
          }
        : quote!.swapTx,
    );
    const approvalFeeWei =
      (isSameChainRoute
        ? sameChainQuote?.issues?.allowance?.spender && selectedInputToken && !isNativeAcrossToken(selectedInputToken)
          ? estimateTxFeeWei({
              gas: sameChainQuote.transaction.gas,
              maxFeePerGas:
                sameChainQuote.transaction.maxFeePerGas || sameChainQuote.transaction.gasPrice,
            }) / 2n
          : 0n
        : quote?.approvalTxns?.reduce((sum, tx) => sum + estimateTxFeeWei(tx), 0n) ?? 0n);
    const estimatedFeeWei = swapFeeWei + approvalFeeWei;

    if (estimatedFeeWei <= 0n) {
      return `Gas sponsorship is not enabled on ${originChain.name}. Keep some native gas token in this wallet to execute the swap.`;
    }

    const estimatedFee = Number(formatUnits(estimatedFeeWei, 18)).toLocaleString(undefined, {
      maximumFractionDigits: 6,
    });

    return `Gas sponsorship is not enabled on ${originChain.name}. Keep at least ~${estimatedFee} native gas token in this wallet to execute the swap.`;
  }, [isEmbeddedWallet, isSameChainRoute, originChain, originChainSupportsSponsorship, quote, sameChainQuote, selectedInputToken]);

  async function handleFetchQuote() {
    if (routeDisabledReason || !selectedInputToken || !selectedOutputToken || !address) {
      if (!address) login();
      return;
    }

    let parsedAmount: bigint;

    try {
      parsedAmount = parseUnits(amount, selectedInputToken.decimals);
    } catch {
      setQuoteError("Amount format is invalid for the selected token.");
      return;
    }

    setIsFetchingQuote(true);
    setQuoteError(null);

    try {
      if (isSameChainRoute) {
        const nextQuote = await fetchZeroExQuote({
          chainId: originChainId,
          sellToken: normalizeZeroExTokenAddress(selectedInputToken),
          buyToken: normalizeZeroExTokenAddress(selectedOutputToken),
          sellAmount: parsedAmount.toString(),
          taker: address,
          recipient,
        });

        setSameChainQuote(nextQuote);
        toast.success("0x quote ready", {
          description: `Monaris found the best same-chain route on ${originChain?.name || "Arbitrum"}.`,
        });
      } else {
        const nextQuote = await fetchAcrossQuote({
          amount: parsedAmount.toString(),
          inputToken: selectedInputToken.address,
          outputToken: selectedOutputToken.address,
          originChainId,
          destinationChainId,
          depositor: address,
          recipient,
          refundAddress: address,
        });

        setQuote(nextQuote);
        toast.success("Across quote ready", {
          description: `Expected fill in about ${nextQuote.expectedFillTime ?? 2}s.`,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : isSameChainRoute
            ? "Unable to build a 0x quote."
            : "Unable to build an Across quote.";
      setQuoteError(message);
      toast.error("Quote failed", { description: message });
    } finally {
      setIsFetchingQuote(false);
    }
  }

  async function handleExecuteSwap() {
    if (!quotePreview || !publicClient || !connectedWallet || !originChain) {
      return;
    }

    if (isSameChainRoute && !sameChainQuote?.transaction) {
      return;
    }

    if (!isSameChainRoute && !quote?.swapTx) {
      return;
    }

    setIsExecuting(true);
    setStatusError(null);
    setDepositStatus(null);
    setSwapHash(null);

    try {
      if (!isOnOriginChain) {
        toast.info("Switching origin network", {
          description: `Monaris is switching your wallet to ${originChain.name} before submission.`,
          id: "across-swap-progress",
        });

        await Promise.resolve(switchChain({ chainId: originChainId }));
      }

      const senderAddress = connectedWallet.address || address;
      const fallbackGasPrice = await publicClient.getGasPrice();

      if (isEmbeddedWallet && !originChainSupportsSponsorship) {
        const nativeBalance = await publicClient.getBalance({
          address: senderAddress as `0x${string}`,
        });

        const approvalFeeWei = isSameChainRoute
          ? sameChainQuote?.issues?.allowance?.spender && selectedInputToken && !isNativeAcrossToken(selectedInputToken)
            ? estimateTxFeeWei(
                {
                  gas: sameChainQuote.transaction.gas,
                  maxFeePerGas:
                    sameChainQuote.transaction.maxFeePerGas ||
                    sameChainQuote.transaction.gasPrice,
                },
                fallbackGasPrice,
              ) / 2n
            : 0n
          : quote?.approvalTxns?.reduce(
              (sum, tx) => sum + estimateTxFeeWei(tx, fallbackGasPrice),
              0n,
            ) ?? 0n;
        const swapFeeWei = estimateTxFeeWei(
          isSameChainRoute
            ? {
                gas: sameChainQuote!.transaction.gas,
                maxFeePerGas:
                  sameChainQuote!.transaction.maxFeePerGas ||
                  sameChainQuote!.transaction.gasPrice,
              }
            : quote!.swapTx,
          fallbackGasPrice,
        );
        const requiredNativeWei = approvalFeeWei + swapFeeWei;

        if (requiredNativeWei > 0n && nativeBalance < requiredNativeWei) {
          const requiredNative = Number(
            formatUnits(requiredNativeWei, 18),
          ).toLocaleString(undefined, {
            maximumFractionDigits: 6,
          });
          const currentNative = Number(
            formatUnits(nativeBalance, 18),
          ).toLocaleString(undefined, {
            maximumFractionDigits: 6,
          });

          throw new Error(
            `Insufficient ${originChain.name} gas. This route needs about ${requiredNative} native token for network fees, but this wallet has ${currentNative}.`,
          );
        }
      }

      if (isSameChainRoute && sameChainQuote?.issues?.allowance?.spender && selectedInputToken && !isNativeAcrossToken(selectedInputToken)) {
        const allowanceActual = BigInt(sameChainQuote.issues.allowance.actual || "0");
        const sellAmount = BigInt(sameChainQuote.sellAmount);

        if (allowanceActual < sellAmount) {
          toast.info("Submitting token approval", {
            description: "Monaris is approving the 0x allowance target first.",
            id: "across-swap-progress",
          });

          const approvalResult = await sendTransaction(
            {
              to: selectedInputToken.address as `0x${string}`,
              data: encodeFunctionData({
                abi: ERC20ABI,
                functionName: "approve",
                args: [sameChainQuote.issues.allowance.spender, sellAmount],
              }),
              value: 0n,
              chainId: originChainId,
            },
            {
              address: senderAddress,
              sponsor: Boolean(isEmbeddedWallet && GAS_SPONSORED_CHAIN_IDS.has(originChainId)),
              uiOptions: { showWalletUIs: false },
            } as any,
          );

          await publicClient.waitForTransactionReceipt({
            hash: approvalResult.hash as `0x${string}`,
            confirmations: 1,
          });
        }
      } else if (quote?.approvalTxns?.length) {
        toast.info("Submitting token approval", {
          description: "Monaris is sending the Across approval transaction first.",
          id: "across-swap-progress",
        });

        for (const approvalTx of quote.approvalTxns) {
          const sponsor = Boolean(
            isEmbeddedWallet && GAS_SPONSORED_CHAIN_IDS.has(approvalTx.chainId),
          );

          const approvalResult = await sendTransaction(
            {
              to: approvalTx.to,
              data: approvalTx.data,
              value: approvalTx.value ? BigInt(approvalTx.value) : 0n,
              chainId: approvalTx.chainId,
              ...(approvalTx.gas && approvalTx.gas !== "0"
                ? { gas: BigInt(approvalTx.gas) }
                : {}),
            },
            {
              address: senderAddress,
              sponsor,
              uiOptions: { showWalletUIs: false },
            } as any,
          );

          await publicClient.waitForTransactionReceipt({
            hash: approvalResult.hash as `0x${string}`,
            confirmations: 1,
          });
        }
      }

      toast.info(isSameChainRoute ? "Sending 0x swap" : "Sending Across swap", {
        description: isSameChainRoute
          ? `Your same-chain swap is being submitted on ${originChain.name}.`
          : `Your bridge transaction is being submitted on ${originChain.name}.`,
        id: "across-swap-progress",
      });

      const sponsor = Boolean(
        isEmbeddedWallet &&
          GAS_SPONSORED_CHAIN_IDS.has(
            isSameChainRoute ? originChainId : quote!.swapTx.chainId,
          ),
      );

      const executionTx = isSameChainRoute
        ? sameChainQuote!.transaction
        : quote!.swapTx;

      const swapResult = await sendTransaction(
        {
          to: executionTx.to,
          data: executionTx.data,
          value: executionTx.value ? BigInt(executionTx.value) : 0n,
          chainId: isSameChainRoute ? originChainId : executionTx.chainId,
          ...(executionTx.gas && executionTx.gas !== "0"
            ? { gas: BigInt(executionTx.gas) }
            : {}),
          ...(executionTx.gasPrice && executionTx.gasPrice !== "0"
            ? { gasPrice: BigInt(executionTx.gasPrice) }
            : {}),
          ...(executionTx.maxFeePerGas && executionTx.maxFeePerGas !== "0"
            ? { maxFeePerGas: BigInt(executionTx.maxFeePerGas) }
            : {}),
          ...(executionTx.maxPriorityFeePerGas &&
          executionTx.maxPriorityFeePerGas !== "0"
            ? { maxPriorityFeePerGas: BigInt(executionTx.maxPriorityFeePerGas) }
            : {}),
        },
        {
          address: senderAddress,
          sponsor,
          uiOptions: { showWalletUIs: false },
        } as any,
      );

      setSwapHash(swapResult.hash as `0x${string}`);
      setDepositStatus({
        status: "pending",
        depositTxnRef: swapResult.hash,
        originChainId,
        destinationChainId,
      });

      await publicClient.waitForTransactionReceipt({
        hash: swapResult.hash as `0x${string}`,
        confirmations: 1,
      });

      if (isSameChainRoute) {
        setDepositStatus({
          status: "confirmed",
          depositTxnRef: swapResult.hash,
          originChainId,
          destinationChainId,
        });
      }

      toast.success(isSameChainRoute ? "Swap confirmed" : "Swap submitted", {
        id: "across-swap-progress",
        description: isSameChainRoute
          ? "The same-chain swap confirmed on Arbitrum."
          : "Origin confirmation landed. Monaris is now tracking the fill.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : isSameChainRoute
            ? "0x swap execution failed."
            : "Across swap execution failed.";
      toast.error("Swap failed", {
        id: "across-swap-progress",
        description: message,
      });
      setStatusError(message);
    } finally {
      setIsExecuting(false);
    }
  }

  useEffect(() => {
    if (!swapHash || isSameChainRoute) return;

    let cancelled = false;
    let timeoutId: number | undefined;

    async function pollStatus() {
      if (cancelled) return;

      setIsTrackingStatus(true);

      try {
        const nextStatus = await fetchAcrossDepositStatus(swapHash);
        if (cancelled) return;

        setDepositStatus(nextStatus);
        setStatusError(null);

        if (
          nextStatus.status === "pending" ||
          nextStatus.status === "slowFillRequested"
        ) {
          timeoutId = window.setTimeout(pollStatus, 10000);
        }
      } catch (error) {
        if (cancelled) return;

        const message =
          error instanceof Error ? error.message : "Unable to track Across deposit.";
        setStatusError(message);
        timeoutId = window.setTimeout(pollStatus, 10000);
      } finally {
        if (!cancelled) setIsTrackingStatus(false);
      }
    }

    pollStatus();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [isSameChainRoute, swapHash]);

  function handlePrimaryAction() {
    if (!hasQuote) {
      void handleFetchQuote();
      return;
    }

    void handleExecuteSwap();
  }

  function handleMaxAmount() {
    if (inputTokenBalanceRaw !== null && selectedInputToken) {
      setAmount(formatUnits(inputTokenBalanceRaw, selectedInputToken.decimals));
    }
  }

  function handleFlipTokens() {
    if (!selectedOutputToken || !destinationTokens.length) return;

    const mirroredOutput =
      destinationTokens.find((token) => token.symbol === selectedInputToken?.symbol) ??
      selectedOutputToken;

    setOutputTokenAddress(mirroredOutput.address);
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="min-h-[calc(100vh-8rem)]"
    >
      <motion.div
        variants={item}
        className="mx-auto max-w-3xl rounded-[36px] bg-[radial-gradient(circle_at_top,#f4ffd9_0%,#f9fbf5_18%,#ffffff_56%)] p-4 sm:p-8"
      >
        <div className="mb-8 flex items-center justify-center gap-3">
          <button className="rounded-full border border-[#e8ebdf] bg-white px-6 py-3 text-lg font-semibold text-[#1a1a1a] shadow-[0px_6px_14px_rgba(0,0,0,0.05)]">
            Swap
          </button>
          <button className="rounded-full px-4 py-3 text-lg font-medium text-[#1a1a1a]/65">
            Send
          </button>
          <button className="rounded-full px-4 py-3 text-lg font-medium text-[#1a1a1a]/65">
            Buy
          </button>
        </div>

        <div className="mx-auto max-w-[620px]">
          {loadError ? (
            <div className="mb-4 rounded-[24px] border border-[#ffd9d9] bg-white px-5 py-4 text-sm text-[#b42318]">
              {loadError}
            </div>
          ) : null}

          {quoteError ? (
            <div className="mb-4 rounded-[24px] border border-[#ffd9d9] bg-white px-5 py-4 text-sm text-[#b42318]">
              {quoteError}
            </div>
          ) : null}

          {statusError ? (
            <div className="mb-4 rounded-[24px] border border-[#fff1dd] bg-[#fffaf1] px-5 py-4 text-sm text-[#9a6700]">
              {statusError}
            </div>
          ) : null}

          <div className="rounded-[34px] border border-[#ecefe4] bg-white px-5 py-5 shadow-[0px_30px_60px_rgba(20,20,20,0.08)] sm:px-6">
            <div className="rounded-[30px] border border-[#ecefe4] bg-[#fcfdf9] p-5 sm:p-6">
              <div className="text-sm font-medium uppercase tracking-[0.12em] text-[#929885]">
                Sell
              </div>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <TokenLogo
                      label={selectedInputToken?.symbol || "USDC"}
                      src={selectedInputToken?.logoUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <Select
                        value={inputTokenAddress}
                        onValueChange={setInputTokenAddress}
                        disabled={isBootstrapping || !originTokens.length}
                      >
                        <SelectTrigger className="h-auto w-full min-w-0 border-0 bg-transparent px-0 py-0 text-left text-[18px] font-semibold text-[#141414] shadow-none ring-0 ring-offset-0 hover:bg-transparent focus:ring-2 focus:ring-[#d8ef9f] focus:ring-offset-2 focus:ring-offset-white [&>span]:block [&>span]:truncate">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate">
                              {selectedInputToken?.symbol || "Select token"}
                            </span>
                          </div>
                        </SelectTrigger>
                        <SelectContent className="max-h-[320px] rounded-[24px] border border-[#dfe5d2] bg-white p-2 shadow-[0px_24px_60px_rgba(20,20,20,0.18)]">
                          {originTokens.map((token) => (
                            <SelectItem
                              key={`${token.chainId}-${token.address}`}
                              value={token.address}
                              className="rounded-[18px] py-3 pl-9 pr-3 text-[#141414] focus:bg-[#f5fbe7] focus:text-[#141414]"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <TokenLogo
                                  label={token.symbol}
                                  src={token.logoUrl}
                                  size="sm"
                                />
                                <div className="min-w-0">
                                  <div className="truncate font-semibold">{token.symbol}</div>
                                  <div className="truncate text-xs text-[#7a7f73]">
                                    {token.name}
                                  </div>
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#7a7f73]">
                        <TokenLogo label={originChain?.name || "Arbitrum"} src={originChain?.logoUrl} size="sm" />
                        <span>{originChain?.name || "Arbitrum"}</span>
                        <span>•</span>
                        <span>
                          {isLoadingInputTokenBalance
                            ? "Loading..."
                            : `${inputTokenBalanceDisplay} ${selectedInputToken?.symbol || ""}`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 max-w-full flex-1 sm:max-w-[280px]">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className={`block w-full min-w-0 overflow-hidden bg-transparent pr-1 text-right font-semibold leading-[0.92] text-[#111111] outline-none tabular-nums ${getAmountClass(amount)}`}
                    placeholder="0"
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={handleMaxAmount}
                      className="rounded-full border border-[#e6e8e1] px-3 py-1 text-[11px] font-semibold text-[#575d52] transition hover:bg-[#f8faf3]"
                    >
                      MAX
                    </button>
                    <div className="truncate text-right text-sm text-[#656b60] sm:text-base">
                      {formatUsd(sellUsd)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-10 my-[-18px] flex justify-center">
              <button
                type="button"
                onClick={handleFlipTokens}
                className="flex h-14 w-14 items-center justify-center rounded-full border border-[#eef0e8] bg-white shadow-[0px_10px_24px_rgba(0,0,0,0.08)]"
              >
                <ArrowRightLeft className="h-6 w-6 rotate-90 text-[#161616]" />
              </button>
            </div>

            <div className="rounded-[30px] border border-[#ecefe4] bg-[#fcfdf9] p-5 sm:p-6">
              <div className="text-sm font-medium uppercase tracking-[0.12em] text-[#929885]">
                Buy
              </div>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <TokenLogo
                      label={selectedOutputToken?.symbol || "USDC"}
                      src={selectedOutputToken?.logoUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <Select
                        value={outputTokenAddress}
                        onValueChange={setOutputTokenAddress}
                        disabled={isBootstrapping || !destinationTokens.length}
                      >
                        <SelectTrigger className="h-auto w-full min-w-0 border-0 bg-transparent px-0 py-0 text-left text-[18px] font-semibold text-[#141414] shadow-none ring-0 ring-offset-0 hover:bg-transparent focus:ring-2 focus:ring-[#d8ef9f] focus:ring-offset-2 focus:ring-offset-white [&>span]:block [&>span]:truncate">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate">
                              {selectedOutputToken?.symbol || "Select token"}
                            </span>
                          </div>
                        </SelectTrigger>
                        <SelectContent className="max-h-[320px] rounded-[24px] border border-[#dfe5d2] bg-white p-2 shadow-[0px_24px_60px_rgba(20,20,20,0.18)]">
                          {destinationTokens.map((token) => (
                            <SelectItem
                              key={`${token.chainId}-${token.address}`}
                              value={token.address}
                              className="rounded-[18px] py-3 pl-9 pr-3 text-[#141414] focus:bg-[#f5fbe7] focus:text-[#141414]"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <TokenLogo
                                  label={token.symbol}
                                  src={token.logoUrl}
                                  size="sm"
                                />
                                <div className="min-w-0">
                                  <div className="truncate font-semibold">{token.symbol}</div>
                                  <div className="truncate text-xs text-[#7a7f73]">
                                    {token.name}
                                  </div>
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#7a7f73]">
                        <TokenLogo
                          label={selectedDestinationChain?.name || "Chain"}
                          src={selectedDestinationChain?.logoUrl}
                          size="sm"
                        />
                        <Select
                          value={String(destinationChainId)}
                          onValueChange={(value) => setDestinationChainId(Number(value))}
                          disabled={isBootstrapping || !destinationChains.length}
                        >
                          <SelectTrigger className="h-auto w-auto min-w-0 border-0 bg-transparent px-0 py-0 font-medium text-[#7a7f73] shadow-none ring-0 ring-offset-0 hover:bg-transparent focus:ring-2 focus:ring-[#d8ef9f] focus:ring-offset-2 focus:ring-offset-white [&>span]:block [&>span]:truncate">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate">
                                {selectedDestinationChain?.name || "Select chain"}
                              </span>
                            </div>
                          </SelectTrigger>
                          <SelectContent className="max-h-[320px] rounded-[24px] border border-[#dfe5d2] bg-white p-2 shadow-[0px_24px_60px_rgba(20,20,20,0.18)]">
                            {destinationChains.map((chain) => (
                              <SelectItem
                                key={chain.chainId}
                                value={String(chain.chainId)}
                                className="rounded-[18px] py-3 pl-9 pr-3 text-[#141414] focus:bg-[#f5fbe7] focus:text-[#141414]"
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <TokenLogo
                                    label={chain.name}
                                    src={chain.logoUrl}
                                    size="sm"
                                  />
                                  <div className="truncate font-semibold">{chain.name}</div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 max-w-full flex-1 sm:max-w-[280px]">
                  <div
                    className={`block w-full min-w-0 overflow-hidden pr-1 text-right font-semibold leading-[0.92] text-[#111111] tabular-nums ${getAmountClass(
                      quotePreview?.outputAmount,
                    )}`}
                  >
                    {quotePreview?.outputAmount || "0"}
                  </div>
                  <div className="mt-3 truncate text-right text-sm text-[#656b60] sm:text-base">
                    {formatUsd(buyUsd)}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[24px] border border-[#edf0e7] bg-[#fbfcf7] px-4 py-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b917e]">
                Recipient
              </div>
              <input
                type="text"
                value={recipient}
                onChange={(event) => {
                  setRecipientTouched(true);
                  setRecipient(event.target.value);
                }}
                className="w-full bg-transparent text-sm font-medium text-[#171717] outline-none"
                placeholder="0x..."
              />
            </div>

            <div className="mt-6 space-y-4 px-2">
              <div className="flex items-center justify-between gap-4 text-[15px] text-[#5f6558]">
                <div className="flex items-center gap-2">
                  <span>Route</span>
                  <Info className="h-4 w-4 text-[#a5ab9c]" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-[#dff8ea] px-3 py-1 text-sm font-semibold text-[#16824f]">
                    {routeSummary.routeLabel}
                  </div>
                  <span>{routeSummary.fill}</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 text-[15px] text-[#5f6558]">
                <div className="flex items-center gap-2">
                  <span>Minimum Received</span>
                  <Info className="h-4 w-4 text-[#a5ab9c]" />
                </div>
                <span>{routeSummary.minimumReceived}</span>
              </div>

              <div className="flex items-center justify-between gap-4 text-[15px] text-[#5f6558]">
                <div className="flex items-center gap-2">
                  <span>Rate</span>
                  <Info className="h-4 w-4 text-[#a5ab9c]" />
                </div>
                <span>{routeSummary.rate}</span>
              </div>

              <div className="flex items-center justify-between gap-4 text-[15px] text-[#5f6558]">
                <div className="flex items-center gap-2">
                  <span>Network Fee</span>
                  <Info className="h-4 w-4 text-[#a5ab9c]" />
                </div>
                <span>{routeSummary.networkFee}</span>
              </div>
            </div>

            {(!isSameChainRoute && (!ACROSS_API_KEY || !ACROSS_INTEGRATOR_ID)) ||
            (isSameChainRoute && !ZEROX_API_KEY) ? (
              <div className="mt-5 rounded-[22px] border border-[#f0ecd7] bg-[#fffdf6] px-4 py-3 text-sm text-[#8a6a17]">
                Local mode active
              </div>
            ) : null}

            {!routeDisabledReason && !isOnOriginChain && originChain ? (
              <div className="mt-4 rounded-[22px] border border-[#ddeafb] bg-[#f6fbff] px-4 py-3 text-sm text-[#28689f]">
                Switch wallet to {originChain.name} to continue
              </div>
            ) : null}

            {!routeDisabledReason &&
            isEmbeddedWallet &&
            originChain &&
            !originChainSupportsSponsorship ? (
              <div className="mt-4 rounded-[22px] border border-[#f6e9cf] bg-[#fffaf1] px-4 py-3 text-sm text-[#9a6700]">
                {nonSponsoredGasWarning ||
                  `Gas sponsorship is not enabled on ${originChain.name}. Keep some native gas token in this wallet to execute the swap.`}
              </div>
            ) : null}

            <button
              onClick={handlePrimaryAction}
              disabled={
                !address
                  ? false
                  : !hasQuote
                    ? Boolean(routeDisabledReason) || isFetchingQuote || isBootstrapping
                    : isExecuting || Boolean(executeDisabledReason)
              }
              className="mt-6 inline-flex h-16 w-full items-center justify-center rounded-[22px] bg-[#171717] text-xl font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {!address ? (
                <span className="inline-flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Connect
                </span>
              ) : isFetchingQuote ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Quoting
                </span>
              ) : isExecuting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Swapping
                </span>
              ) : hasQuote ? (
                "Swap"
              ) : (
                "Get Quote"
              )}
            </button>

            {(routeDisabledReason || executeDisabledReason) && address ? (
              <p className="mt-3 text-center text-sm text-[#8d9386]">
                {hasQuote ? executeDisabledReason : routeDisabledReason}
              </p>
            ) : null}

            {(hasQuote || swapHash) && (
              <div className="mt-6 rounded-[24px] border border-[#ecefe4] bg-[#fbfcf8] px-4 py-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#202020]">
                    <Clock3 className="h-4 w-4 text-[#7cb518]" />
                    Status
                  </div>
                  <div className="flex items-center gap-2">
                    {quoteExpiry ? (
                      <span className="text-xs text-[#8d9386]">Quote {quoteExpiry}</span>
                    ) : null}
                    {depositStatus?.status ? (
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusTone(
                          depositStatus.status,
                        )}`}
                      >
                        {depositStatus.status}
                      </span>
                    ) : null}
                  </div>
                </div>

                {swapHash ? (
                  <div className="space-y-2 text-sm">
                    <a
                      href={getTxUrl(originChain, swapHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-[#1f6fb0]"
                    >
                      <span className="truncate">{swapHash}</span>
                      <ArrowUpRight className="h-4 w-4 shrink-0" />
                    </a>
                    {depositStatus?.fillTxnRef ? (
                      <a
                        href={getTxUrl(
                          chainById.get(depositStatus.destinationChainId || destinationChainId),
                          depositStatus.fillTxnRef,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-[#1f6fb0]"
                      >
                        <span className="truncate">{depositStatus.fillTxnRef}</span>
                        <ArrowUpRight className="h-4 w-4 shrink-0" />
                      </a>
                    ) : null}
                    {isTrackingStatus ? (
                      <div className="flex items-center gap-2 px-1 text-[#647a56]">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Tracking fill
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-sm text-[#8d9386]">Quote ready</div>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
