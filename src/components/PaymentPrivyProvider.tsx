import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider as PrivyWagmiProvider, createConfig } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, fallback } from 'viem';
import { arbitrum } from 'viem/chains';
import { 
  PAYMENT_PRIVY_APP_ID,
  WALLETCONNECT_PROJECT_ID,
} from '@/lib/payment-privy-config';

// Create a separate QueryClient for payment page
const paymentQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10000,
      retry: 2,
    },
  },
});

// Arbitrum Mainnet chain config for payment
const arbitrumMainnet = {
  id: 42161,
  name: 'Arbitrum One',
  nativeCurrency: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://arb1.arbitrum.io/rpc'],
    },
    public: {
      http: ['https://arb1.arbitrum.io/rpc'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arbiscan',
      url: 'https://arbiscan.io',
    },
  },
  testnet: false,
} as const;

// Create Privy wagmi config for payment page
// This enables gas sponsorship through Privy
const paymentWagmiConfig = createConfig({
  chains: [arbitrum],
  transports: {
    [arbitrum.id]: fallback([
      http('https://arb1.arbitrum.io/rpc'),
      http('https://arbitrum-one-rpc.publicnode.com'),
      http('https://1rpc.io/arb'),
      http('https://rpc.ankr.com/arbitrum'),
    ], { rank: true }),
  },
});

// Privy config for payment page with all features
const paymentPrivyConfigOptions = {
  appearance: {
    theme: 'light' as const,
    accentColor: '#c8ff00', // Monaris lime green branding
    logo: '/monar.png', // Monaris logo
    // WalletConnect QR shows directly as a top-level option for mobile wallet scanning
    walletList: ['wallet_connect_qr', 'metamask', 'coinbase_wallet', 'rainbow', 'detected_ethereum_wallets'],
    showWalletLoginFirst: true, // Show wallet options prominently for buyers
  },
  // Multiple login methods for buyers - wallet first for payments
  loginMethods: ['wallet', 'email', 'google'] as const,
  // Embedded wallets for all users
  embeddedWallets: {
    createOnLogin: 'all-users' as const, // Create embedded wallet for ALL users
    requireUserPasswordOnCreate: false,
    noPromptOnSignature: true, // Auto-sign for smoother UX
  },
  // External wallet options - enable all wallet connection methods
  externalWallets: {
    coinbaseWallet: {
      connectionOptions: 'all' as const,
    },
    // WalletConnect v2 - enables QR code scanning and deep linking to 300+ wallets
    walletConnect: {
      enabled: true,
    },
    metamask: {
      connectionOptions: 'all' as const,
    },
    rainbow: {
      connectionOptions: 'all' as const,
    },
    phantom: {
      connectionOptions: 'all' as const,
    },
    zerion: {
      connectionOptions: 'all' as const,
    },
  },
  // WalletConnect Cloud Project ID - REQUIRED for WalletConnect QR to work
  walletConnectCloudProjectId: WALLETCONNECT_PROJECT_ID,
  // Chain configuration - Arbitrum Mainnet only
  defaultChain: arbitrumMainnet,
  supportedChains: [arbitrumMainnet],
};

interface PaymentPrivyProviderProps {
  children: React.ReactNode;
}

export function PaymentPrivyProvider({ children }: PaymentPrivyProviderProps) {
  // IMPORTANT: QueryClientProvider must wrap PrivyProvider and WagmiProvider
  // because @privy-io/wagmi internally uses react-query hooks
  return (
    <QueryClientProvider client={paymentQueryClient}>
      <PrivyProvider
        appId={PAYMENT_PRIVY_APP_ID}
        config={paymentPrivyConfigOptions}
      >
        <PrivyWagmiProvider config={paymentWagmiConfig}>
          {children}
        </PrivyWagmiProvider>
      </PrivyProvider>
    </QueryClientProvider>
  );
}
