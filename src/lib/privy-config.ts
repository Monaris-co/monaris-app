// Privy configuration for multichain support

// Helper to get RPC URL from environment or use defaults
function getChainRpcUrl(chainId: number): string {
  const envKey = `VITE_RPC_URL_${chainId}`;
  const envValue = import.meta.env[envKey];
  
  if (envValue) return envValue;
  
  // Default RPC URLs
  const defaults: Record<number, string> = {
    5003: 'https://rpc.sepolia.mantle.xyz',
    5000: 'https://rpc.mantle.xyz',
    421614: 'https://arbitrum-sepolia-rpc.publicnode.com', // Public RPC without CORS issues
    42161: 'https://arb-mainnet.g.alchemy.com/v2/Ttr4Yy-wi3x955XdNdqAFgPopLH47Owl', // Alchemy RPC - reliable
    11155111: 'https://rpc.sepolia.org',
    1: 'https://eth.llamarpc.com',
  };
  
  return defaults[chainId] || '';
}

// Chain configurations for Privy
const mantleSepoliaChain = {
  id: 5003,
  name: 'Mantle Sepolia Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Mantle',
    symbol: 'MNT',
  },
  rpcUrls: {
    default: {
      http: [getChainRpcUrl(5003)],
      webSocket: ['wss://mantle-sepolia.g.alchemy.com/v2/H2xLs5teY1MdED6Fe0lSX'],
    },
    public: {
      http: [getChainRpcUrl(5003)],
      webSocket: ['wss://mantle-sepolia.g.alchemy.com/v2/H2xLs5teY1MdED6Fe0lSX'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Mantle Explorer',
      url: 'https://explorer.testnet.mantle.xyz',
    },
  },
  testnet: true,
};

const arbitrumSepoliaChain = {
  id: 421614,
  name: 'Arbitrum Sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: [getChainRpcUrl(421614)],
    },
    public: {
      http: [getChainRpcUrl(421614)],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arbitrum Explorer',
      url: 'https://sepolia-explorer.arbitrum.io',
    },
  },
  testnet: true,
};

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
      name: 'Arbitrum Explorer',
      url: 'https://explorer.arbitrum.io',
    },
  },
  testnet: false,
};

const ethereumSepoliaChain = {
  id: 11155111,
  name: 'Ethereum Sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: [getChainRpcUrl(11155111)],
    },
    public: {
      http: [getChainRpcUrl(11155111)],
    },
  },
  blockExplorers: {
    default: {
      name: 'Etherscan',
      url: 'https://sepolia.etherscan.io',
    },
  },
  testnet: true,
};

const ethereumMainnetChain = {
  id: 1,
  name: 'Ethereum',
  nativeCurrency: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: [getChainRpcUrl(1)],
    },
    public: {
      http: [getChainRpcUrl(1)],
    },
  },
  blockExplorers: {
    default: {
      name: 'Etherscan',
      url: 'https://etherscan.io',
    },
  },
  testnet: false,
};

// All supported chains
export const supportedPrivyChains = [
  mantleSepoliaChain,
  arbitrumSepoliaChain,
  arbitrumMainnetChain,
  ethereumSepoliaChain,
  ethereumMainnetChain,
];

// Get default chain from environment or use Arbitrum Mainnet
const getDefaultChain = () => {
  const defaultChainId = parseInt(import.meta.env.VITE_DEFAULT_CHAIN_ID || '42161'); // Default to Arbitrum Mainnet
  const chain = supportedPrivyChains.find((c) => c.id === defaultChainId);
  return chain || arbitrumMainnetChain; // Fallback to Arbitrum Mainnet if not found
};

export const privyConfig = {
  appId: import.meta.env.VITE_PRIVY_APP_ID || '',
  config: {
    appearance: {
      theme: 'light',
      accentColor: '#22c55e', // Green theme to match Monaris branding
      logo: '/monar.png', // Monaris logo
    },
    loginMethods: ['email'], // Email-only login
    embeddedWallets: {
      // Create embedded wallet on email/social login
      ethereum: {
        createOnLogin: 'all-users', // Create embedded wallet for ALL users on login
      },
      requireUserPasswordOnCreate: false,
      noPromptOnSignature: true, // CRITICAL: Disable transaction prompts for embedded wallets - transactions sign automatically
    },
    // Allow external wallets (MetaMask, etc.)
    externalWallets: {
      coinbaseWallet: {
        connectionOptions: 'all', // Allow both smart wallets and direct connections
      },
      walletConnect: {
        connectionOptions: 'all', // Allow both smart wallets and direct connections
      },
      metamask: {
        connectionOptions: 'all', // Allow MetaMask connections
      },
    },
    // Chain configuration - Multichain support
    // Note: Make sure all chains are enabled in your Privy dashboard
    // IMPORTANT: Add http://localhost:8080 to allowed origins in Privy dashboard to fix origin mismatch
    defaultChain: getDefaultChain(),
    supportedChains: supportedPrivyChains,
  },
}

