// Separate Privy configuration for Payment page (/pay)
// This uses a different Privy app to handle buyer payments independently
// 
// Features enabled:
// - Wallet login (MetaMask, WalletConnect, Coinbase, Rainbow)
// - Email login
// - Google login  
// - Embedded wallets for all users
// - Gas sponsorship (configure in Privy dashboard)

// Payment page Privy App ID (separate from main app)
export const PAYMENT_PRIVY_APP_ID = 'cmkhjjrfu00xci60cenylo2s5';

// WalletConnect Cloud Project ID for payment page
// Get yours at: https://cloud.walletconnect.com/
export const WALLETCONNECT_PROJECT_ID = '502d1ca774d0698fb6875db2c5d94873';

// RPC URL for Arbitrum Mainnet
export const ARBITRUM_RPC_URL = 'https://arbitrum-one-rpc.publicnode.com';

// USDC contract address on Arbitrum Mainnet
export const ARBITRUM_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
