// Privy configuration — Arbitrum Mainnet only

const KNOWN_BAD_RPCS = ['pocket.network', 'llamarpc.com', '1rpc.io'];

function getChainRpcUrl(chainId: number): string {
  const envKey = `VITE_RPC_URL_${chainId}`;
  const envValue = import.meta.env[envKey];
  if (envValue && !KNOWN_BAD_RPCS.some(bad => envValue.includes(bad))) return envValue;

  const defaults: Record<number, string> = {
    42161: 'https://rpc.ankr.com/arbitrum',
    1: 'https://rpc.ankr.com/eth',
  };
  return defaults[chainId] || '';
}

const arbitrumMainnetChain = {
  id: 42161,
  name: 'Arbitrum One',
  nativeCurrency: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: [getChainRpcUrl(42161)],
    },
    public: {
      http: [getChainRpcUrl(42161)],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arbiscan',
      url: 'https://arbiscan.io',
    },
  },
  testnet: false,
};

export const supportedPrivyChains = [arbitrumMainnetChain];

export const privyConfig = {
  appId: import.meta.env.VITE_PRIVY_APP_ID || '',
  config: {
    appearance: {
      theme: 'light',
      accentColor: '#22c55e',
      logo: '/monar.png',
    },
    loginMethods: ['email', 'google'],
    embeddedWallets: {
      createOnLogin: 'all-users',
      requireUserPasswordOnCreate: false,
      noPromptOnSignature: true,
    },
    externalWallets: {
      coinbaseWallet: {
        connectionOptions: 'all',
      },
      walletConnect: {
        connectionOptions: 'all',
      },
      metamask: {
        connectionOptions: 'all',
      },
    },
    defaultChain: arbitrumMainnetChain,
    supportedChains: [arbitrumMainnetChain],
  },
}
