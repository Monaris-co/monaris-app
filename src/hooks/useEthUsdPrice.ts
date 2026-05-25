import { useEffect, useState } from "react";

const DEFAULT_ETH_PRICE_USD = 2500;

interface CoinbaseSpotResponse {
  data?: {
    amount?: string;
  };
}

export function useEthUsdPrice() {
  const [price, setPrice] = useState(DEFAULT_ETH_PRICE_USD);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPrice() {
      try {
        const response = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot");

        if (!response.ok) {
          throw new Error(`ETH price request failed with ${response.status}`);
        }

        const payload = (await response.json()) as CoinbaseSpotResponse;
        const amount = Number(payload.data?.amount || 0);

        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error("ETH price response was invalid.");
        }

        if (!cancelled) {
          setPrice(amount);
          setError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError
              : new Error("Failed to fetch ETH price."),
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchPrice();
    const interval = window.setInterval(() => {
      void fetchPrice();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return {
    price,
    isLoading,
    error,
  };
}
