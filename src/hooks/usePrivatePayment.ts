/**
 * Hook that orchestrates the entire private invoice payment flow:
 *   1. Verify invoice status
 *   2. Ensure private wallet exists
 *   3. Check private balance
 *   4. Resolve recipient
 *   5. Build private transfer (generate proof)
 *   6. Send transaction
 *   7. Record receipt + update invoice + notify seller
 */

import { useState, useCallback } from 'react';
import { useChainId } from 'wagmi';
import { useSendTransaction, useWallets } from '@privy-io/react-auth';
import { usePrivyAccount } from './usePrivyAccount';
import { usePrivateWallet } from './usePrivateWallet';
import { usePrivateBalance } from './usePrivateBalance';
import { usePrivacyStore } from '@/lib/privacy/store';
import { buildPrivateTransfer } from '@/lib/privacy/transactions';
import { resolvePrivateAddress } from '@/lib/privacy/wallet';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { formatUnits } from 'viem';
import { toast } from 'sonner';

export type PrivatePayStep =
  | 'idle'
  | 'initializing'
  | 'resolving'
  | 'proving'
  | 'sending'
  | 'recording'
  | 'done'
  | 'error';

interface UsePrivatePaymentOptions {
  invoiceId: string;
  sellerAddress: string;
  tokenAddress: string;
  amount: bigint;
}

export function usePrivatePayment(opts: UsePrivatePaymentOptions) {
  const chainId = useChainId();
  const { address } = usePrivyAccount();
  const { wallet, initializeWallet } = usePrivateWallet();
  const { privateUsdcBalance, refreshBalances } = usePrivateBalance();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();

  const [step, setStep] = useState<PrivatePayStep>('idle');
  const [txRef, setTxRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountFormatted = parseFloat(formatUnits(opts.amount, 6));

  const embeddedWallet = wallets.find((w) => {
    const ct = w.connectorType?.toLowerCase() || '';
    const wct = w.walletClientType?.toLowerCase() || '';
    return ct === 'embedded' || wct === 'privy' || ct.includes('privy');
  }) || wallets[0];

  const execute = useCallback(async () => {
    if (!address) throw new Error('Wallet not connected');

    setStep('initializing');
    setError(null);

    try {
      // 1. Ensure private wallet
      let currentWallet = wallet;
      if (!currentWallet) {
        currentWallet = await initializeWallet();
      }
      if (!currentWallet) throw new Error('Failed to create private wallet');

      // 2. Check balance
      if (privateUsdcBalance < amountFormatted) {
        setStep('error');
        setError('insufficient_balance');
        return { success: false, error: 'insufficient_balance' };
      }

      // 3. Resolve recipient RAILGUN address
      setStep('resolving');
      const password = `monaris-pw-${opts.sellerAddress.toLowerCase()}-v1`;
      let recipientAddress = await resolvePrivateAddress(
        opts.sellerAddress,
        chainId,
        password,
      );

      // Fallback: self-escrow if seller has no private wallet
      if (!recipientAddress) {
        recipientAddress = currentWallet.railgunAddress;
      }

      // 4. Generate proof + build private transfer
      setStep('proving');
      const networkName = chainId === 42161 ? 'Arbitrum' : 'Arbitrum';

      const result = await buildPrivateTransfer(
        {
          tokenAddress: opts.tokenAddress,
          amount: opts.amount,
          recipientRailgunAddress: recipientAddress,
          memo: `Monaris Invoice #${opts.invoiceId}`,
        },
        currentWallet.id,
        currentWallet.encryptionKey,
        networkName,
        (progress, stage) => {
          usePrivacyStore.getState().setProofProgress(progress, stage);
        },
      );

      if (!result.success) throw new Error(result.error);

      // 5. Send transaction
      setStep('sending');
      const isGasSponsored = chainId === 421614 || chainId === 42161;
      const txResult = await sendTransaction(
        {
          to: result.txHash as `0x${string}`,
          data: '0x' as `0x${string}`,
          value: 0n,
          chainId,
        },
        {
          address: embeddedWallet?.address || address,
          sponsor: isGasSponsored,
          uiOptions: { showWalletUIs: false },
        } as any,
      );

      setTxRef(txResult.hash);

      // 6. Record receipt
      setStep('recording');
      if (isSupabaseConfigured()) {
        await Promise.all([
          supabase.from('private_receipts').insert({
            payer_address: address.toLowerCase(),
            receiver_address: opts.sellerAddress.toLowerCase(),
            chain_id: chainId,
            token_address: opts.tokenAddress,
            amount: amountFormatted,
            private_tx_ref: txResult.hash,
          }),
          supabase
            .from('invoices')
            .update({
              payment_mode: 'PRIVATE',
              private_payment_tx_ref: txResult.hash,
              payment_completed_at: new Date().toISOString(),
            })
            .eq('chain_invoice_id', Number(opts.invoiceId))
            .eq('chain_id', chainId),
          supabase.from('notifications').insert({
            recipient_address: opts.sellerAddress.toLowerCase(),
            type: 'invoice_paid_private',
            title: 'Invoice Paid (Private)',
            message: `Invoice #${opts.invoiceId} was paid privately for $${amountFormatted.toFixed(2)}`,
            chain_invoice_id: Number(opts.invoiceId),
            chain_id: chainId,
          }),
        ]);
      }

      setStep('done');
      refreshBalances();
      return { success: true, txRef: txResult.hash };

    } catch (err: any) {
      console.error('[PrivatePayment]', err);
      setStep('error');
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [address, wallet, privateUsdcBalance, amountFormatted, opts, chainId, embeddedWallet]);

  const reset = useCallback(() => {
    setStep('idle');
    setTxRef(null);
    setError(null);
  }, []);

  return {
    step,
    txRef,
    error,
    isInProgress: !['idle', 'done', 'error'].includes(step),
    execute,
    reset,
  };
}
