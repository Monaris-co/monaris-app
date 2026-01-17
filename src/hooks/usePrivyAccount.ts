import { useEffect } from 'react';
import { useAccount as useWagmiAccount } from 'wagmi';
import { useWallets, usePrivy } from '@privy-io/react-auth';

/**
 * Hook that ensures we use Privy embedded wallet instead of MetaMask
 * This wraps useAccount and forces the embedded wallet to be active
 */
export function usePrivyAccount() {
  const { wallets, setActiveWallet } = useWallets();
  const { authenticated, user } = usePrivy();
  const wagmiAccount = useWagmiAccount();

  // Find embedded wallet
  const embeddedWallet = wallets.find(w => {
    const ct = w.connectorType?.toLowerCase() || '';
    const wct = w.walletClientType?.toLowerCase() || '';
    return ct === 'embedded' || 
           wct === 'privy' ||
           ct.includes('privy') ||
           ct.includes('embedded');
  });

  // Check if user logged in with email/social (not just wallet)
  const loggedInWithEmail = user?.linkedAccounts?.some((acc: any) => 
    ['email', 'sms', 'google_oauth', 'twitter_oauth', 'github_oauth'].includes(acc.type)
  ) || false;

  // Force embedded wallet to be active if:
  // 1. User logged in with email/social AND
  // 2. Embedded wallet exists AND
  // 3. Current active wallet is NOT the embedded wallet
  useEffect(() => {
    if (authenticated && loggedInWithEmail && embeddedWallet && setActiveWallet) {
      const currentAddress = wagmiAccount.address?.toLowerCase();
      const embeddedAddress = embeddedWallet.address?.toLowerCase();
      
      // If current wallet is not the embedded wallet, switch to it
      if (currentAddress && embeddedAddress && currentAddress !== embeddedAddress) {
        console.log('🔄 Switching to embedded wallet:', embeddedAddress);
        setActiveWallet(embeddedWallet);
      } else if (!currentAddress && embeddedAddress) {
        // No wallet active, but embedded wallet exists - activate it
        console.log('✅ Activating embedded wallet:', embeddedAddress);
        setActiveWallet(embeddedWallet);
      }
    }
  }, [authenticated, loggedInWithEmail, embeddedWallet, wagmiAccount.address, setActiveWallet]);

  // Find external wallet (MetaMask, etc.)
  const externalWallet = wallets.find(w => {
    const ct = w.connectorType?.toLowerCase() || '';
    const wct = w.walletClientType?.toLowerCase() || '';
    return ct === 'injected' || 
           wct === 'metamask' ||
           ct.includes('injected') ||
           wct.includes('metamask');
  });

  // If user has connected an external wallet (like MetaMask), use it
  // This allows MetaMask to work properly when explicitly connected
  if (authenticated && externalWallet?.address && wagmiAccount.address?.toLowerCase() === externalWallet.address.toLowerCase()) {
    return wagmiAccount;
  }

  // Return the embedded wallet address if available and user logged in with email
  // Otherwise fall back to Wagmi account (which may be external wallet)
  if (authenticated && loggedInWithEmail && embeddedWallet?.address) {
    // Only use embedded wallet if wagmiAccount is not an external wallet
    // or if wagmiAccount address matches embedded wallet
    if (!wagmiAccount.address || wagmiAccount.address.toLowerCase() === embeddedWallet.address.toLowerCase()) {
      return {
        ...wagmiAccount,
        address: embeddedWallet.address as `0x${string}`,
        isConnected: true,
        isConnecting: false,
        isDisconnected: false,
      };
    }
  }

  return wagmiAccount;
}

