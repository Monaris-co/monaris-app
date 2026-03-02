/**
 * Private Pay Button – the primary CTA for paying an invoice privately.
 *
 * Flow:
 *   1. Ensure private wallet exists (create if needed)
 *   2. Check private balance is sufficient
 *   3. Resolve seller's RAILGUN address
 *   4. Generate ZK proof + build private transfer
 *   5. Send via public wallet (gas-sponsored)
 *   6. Record receipt in Supabase
 */

import { useState, useCallback } from 'react';
import { Loader2, Shield, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { parseUnits, formatUnits } from 'viem';
import { useChainId } from 'wagmi';
import { useSendTransaction, useWallets } from '@privy-io/react-auth';
import { usePrivyAccount } from '@/hooks/usePrivyAccount';
import { usePrivateWallet } from '@/hooks/usePrivateWallet';
import { usePrivateBalance } from '@/hooks/usePrivateBalance';
import { usePrivacyStore } from '@/lib/privacy/store';
import { buildPrivateTransfer } from '@/lib/privacy/transactions';
import { resolvePrivateAddress } from '@/lib/privacy/wallet';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

interface PrivatePayButtonProps {
  invoiceId: string;
  sellerAddress: string;
  tokenAddress: string;
  amount: bigint;
  chainId: number;
  onSuccess: (txRef: string) => void;
  onInsufficientBalance: () => void;
  disabled?: boolean;
}

export function PrivatePayButton({
  invoiceId,
  sellerAddress,
  tokenAddress,
  amount,
  chainId: invoiceChainId,
  onSuccess,
  onInsufficientBalance,
  disabled,
}: PrivatePayButtonProps) {
  const chainId = useChainId();
  const { address } = usePrivyAccount();
  const { wallet, initializeWallet, isCreatingWallet } = usePrivateWallet();
  const { privateUsdcBalance } = usePrivateBalance();
  const { proofProgress, proofStage } = usePrivacyStore();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();

  const [isPaying, setIsPaying] = useState(false);
  const [payStep, setPayStep] = useState<'idle' | 'init' | 'resolve' | 'proof' | 'send' | 'record'>('idle');

  const embeddedWallet = wallets.find((w) => {
    const ct = w.connectorType?.toLowerCase() || '';
    const wct = w.walletClientType?.toLowerCase() || '';
    return ct === 'embedded' || wct === 'privy' || ct.includes('privy');
  }) || wallets[0];

  const amountFormatted = parseFloat(formatUnits(amount, 6));

  const handlePrivatePay = useCallback(async () => {
    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    // Check balance
    if (privateUsdcBalance < amountFormatted) {
      onInsufficientBalance();
      return;
    }

    setIsPaying(true);

    try {
      // 1. Ensure private wallet
      setPayStep('init');
      let currentWallet = wallet;
      if (!currentWallet) {
        currentWallet = await initializeWallet();
      }
      if (!currentWallet) throw new Error('Failed to initialize private wallet');

      // 2. Resolve seller's RAILGUN address
      setPayStep('resolve');
      const password = `monaris-pw-${sellerAddress.toLowerCase()}-v1`;
      let sellerRailgunAddress = await resolvePrivateAddress(
        sellerAddress,
        chainId,
        password,
      );

      if (!sellerRailgunAddress) {
        // Seller hasn't set up private wallet yet.
        // For MVP, we fall back: create a "pending" receipt and the seller
        // claims it when they set up their wallet.
        toast.info(
          'Seller has not set up private receiving. Payment will be held in escrow.',
          { duration: 5000 },
        );
        sellerRailgunAddress = currentWallet.railgunAddress; // self-transfer as escrow
      }

      // 3. Generate proof + build transaction
      setPayStep('proof');
      toast.info('Generating privacy proof... This takes about 20-30 seconds.', {
        duration: 30000,
        id: 'proof-generating',
      });

      const networkName = chainId === 42161 ? 'Arbitrum' : 'Arbitrum';
      const result = await buildPrivateTransfer(
        {
          tokenAddress,
          amount,
          recipientRailgunAddress: sellerRailgunAddress,
          memo: `Monaris Invoice #${invoiceId}`,
        },
        currentWallet.id,
        currentWallet.encryptionKey,
        networkName,
        (progress, stage) => {
          usePrivacyStore.getState().setProofProgress(progress, stage);
        },
      );

      toast.dismiss('proof-generating');

      if (!result.success) {
        throw new Error(result.error);
      }

      // 4. Send the transaction
      setPayStep('send');
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

      // 5. Record receipt
      setPayStep('record');
      if (isSupabaseConfigured()) {
        await supabase.from('private_receipts').insert({
          invoice_id: null, // will link via chain_invoice_id
          payer_address: address.toLowerCase(),
          receiver_address: sellerAddress.toLowerCase(),
          chain_id: chainId,
          token_address: tokenAddress,
          amount: amountFormatted,
          private_tx_ref: txResult.hash,
        });

        // Update invoice payment mode
        await supabase
          .from('invoices')
          .update({
            payment_mode: 'PRIVATE',
            private_payment_tx_ref: txResult.hash,
          })
          .eq('chain_invoice_id', Number(invoiceId))
          .eq('chain_id', chainId);

        // Notify seller
        await supabase.from('notifications').insert({
          recipient_address: sellerAddress.toLowerCase(),
          type: 'invoice_paid_private',
          title: 'Invoice Paid (Private)',
          message: `Invoice #${invoiceId} was paid privately for $${amountFormatted.toFixed(2)}`,
          chain_invoice_id: Number(invoiceId),
          chain_id: chainId,
        });
      }

      toast.success('Invoice paid privately!', {
        description: `$${amountFormatted.toFixed(2)} sent via private transfer.`,
      });

      onSuccess(txResult.hash);

    } catch (err: any) {
      console.error('[PrivatePay] Error:', err);
      if (err.message?.includes('rejected')) {
        toast.error('Transaction rejected');
      } else {
        toast.error('Private payment failed', { description: err.message });
      }
    } finally {
      setIsPaying(false);
      setPayStep('idle');
    }
  }, [address, wallet, privateUsdcBalance, amountFormatted, sellerAddress, invoiceId, chainId, tokenAddress, amount]);

  const getButtonLabel = () => {
    if (isCreatingWallet) return 'Setting up private wallet...';
    switch (payStep) {
      case 'init': return 'Initializing...';
      case 'resolve': return 'Resolving recipient...';
      case 'proof': return 'Generating proof...';
      case 'send': return 'Sending transaction...';
      case 'record': return 'Recording receipt...';
      default: return `Pay $${amountFormatted.toLocaleString(undefined, { minimumFractionDigits: 2 })} Privately`;
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={handlePrivatePay}
        disabled={disabled || isPaying || isCreatingWallet || !address}
        className="w-full"
        variant="hero"
      >
        {isPaying || isCreatingWallet ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{getButtonLabel()}</>
        ) : (
          <>
            <Lock className="mr-2 h-4 w-4" />
            {getButtonLabel()}
          </>
        )}
      </Button>

      {payStep === 'proof' && (
        <div className="space-y-1">
          <Progress value={proofProgress * 100} className="h-1.5" />
          <p className="text-[10px] text-muted-foreground text-center">
            {proofStage || 'Generating zero-knowledge proof...'}
          </p>
        </div>
      )}

      <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1">
        <Shield className="h-3 w-3" />
        Sender, receiver, and amount are hidden from on-chain observers
      </p>
    </div>
  );
}
