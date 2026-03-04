/**
 * Private Pay Button – shields buyer's public USDC directly into
 * the seller's RAILGUN 0zk address, preserving seller privacy.
 *
 * Flow:
 *   1. Resolve seller's RAILGUN 0zk address from Supabase
 *   2. Approve USDC for RAILGUN proxy contract
 *   3. Build + send shield transaction to seller's 0zk
 *   4. Record receipt in Supabase
 *
 * Gas is sponsored via Privy AA for embedded wallet users.
 */

import { useState, useCallback } from 'react';
import { Loader2, Shield, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { formatUnits, encodeFunctionData, getAddress, createPublicClient, http, fallback } from 'viem';
import { arbitrum } from 'viem/chains';
import { useSendTransaction, useWallets } from '@privy-io/react-auth';
import { usePrivyAccount } from '@/hooks/usePrivyAccount';
import { buildShieldTransaction } from '@/lib/privacy/transactions';
import { resolvePrivateAddress, deriveWalletPassword } from '@/lib/privacy/wallet';
import { ensureEngineReady, getWalletModule, getSharedModels } from '@/lib/privacy/engine';
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
  const { address } = usePrivyAccount();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();

  const [isPaying, setIsPaying] = useState(false);
  const [payStep, setPayStep] = useState<'idle' | 'resolve' | 'approve' | 'shield' | 'send' | 'record'>('idle');

  const embeddedWallet = wallets.find((w) => {
    const ct = w.connectorType?.toLowerCase() || '';
    const wct = w.walletClientType?.toLowerCase() || '';
    return ct === 'embedded' || wct === 'privy' || ct.includes('privy');
  }) || wallets[0];

  const amountFormatted = parseFloat(formatUnits(amount, 6));
  const isGasSponsored = invoiceChainId === 421614 || invoiceChainId === 42161;
  const isEmbedded = embeddedWallet?.connectorType?.toLowerCase() === 'embedded' ||
                     embeddedWallet?.walletClientType?.toLowerCase() === 'privy';
  const canSponsor = isGasSponsored && isEmbedded;

  const handlePrivatePay = useCallback(async () => {
    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    setIsPaying(true);
    const senderAddr = embeddedWallet?.address || address;

    try {
      // 1. Resolve seller's RAILGUN 0zk address
      setPayStep('resolve');
      const sellerPassword = await deriveWalletPassword(sellerAddress);
      const sellerRailgunAddress = await resolvePrivateAddress(
        sellerAddress,
        invoiceChainId,
        sellerPassword,
      );

      if (!sellerRailgunAddress) {
        toast.error('Seller has not set up private receiving yet. Please try again later or pay publicly.');
        return;
      }

      // 2. Init RAILGUN engine (needed for populateShield + contract addresses)
      await ensureEngineReady();
      const walletModule = await getWalletModule();
      const sharedModels = await getSharedModels();

      const proxyAddress = walletModule.getRailgunSmartWalletContractAddress(
        sharedModels.TXIDVersion.V2_PoseidonMerkle,
        invoiceChainId,
      );
      if (!proxyAddress) throw new Error('RAILGUN proxy contract not found for this chain');

      const tokenAddr = getAddress(tokenAddress);

      // 3. Approve USDC for RAILGUN proxy
      setPayStep('approve');
      toast.info('Approving USDC for private payment...', { id: 'private-pay-progress' });

      const approveData = encodeFunctionData({
        abi: [{
          name: 'approve', type: 'function',
          inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
          outputs: [{ name: '', type: 'bool' }],
        }],
        functionName: 'approve',
        args: [proxyAddress as `0x${string}`, amount],
      });

      const approveResult = await sendTransaction(
        { to: tokenAddr, data: approveData, value: 0n, chainId: invoiceChainId, gas: 100000n },
        { address: senderAddr, sponsor: canSponsor, uiOptions: { showWalletUIs: false } } as any,
      );

      // Wait for approve confirmation
      const publicClient = createPublicClient({
        chain: arbitrum,
        transport: fallback([
          http('https://rpc.ankr.com/arbitrum'),
          http('https://arbitrum.drpc.org'),
        ]),
      });
      await publicClient.waitForTransactionReceipt({
        hash: approveResult.hash as `0x${string}`,
        confirmations: 1,
      });

      // 4. Build + send shield transaction to seller's 0zk
      setPayStep('shield');
      toast.info('Shielding funds to seller\'s private wallet...', { id: 'private-pay-progress' });

      const shieldTx = await buildShieldTransaction(
        {
          tokenAddress: tokenAddr,
          amount,
          fromAddress: sellerRailgunAddress,
          recipientRailgunAddress: sellerRailgunAddress,
        },
        'Arbitrum',
      );

      setPayStep('send');
      const txResult = await sendTransaction(
        {
          to: shieldTx.to as `0x${string}`,
          data: shieldTx.data as `0x${string}`,
          value: shieldTx.value,
          chainId: invoiceChainId,
          gas: 500000n,
        },
        { address: senderAddr, sponsor: canSponsor, uiOptions: { showWalletUIs: false } } as any,
      );

      toast.dismiss('private-pay-progress');

      // 5. Record receipt in Supabase
      setPayStep('record');
      if (isSupabaseConfigured()) {
        await supabase.from('private_receipts').insert({
          invoice_id: null,
          payer_address: address.toLowerCase(),
          receiver_address: sellerAddress.toLowerCase(),
          chain_id: invoiceChainId,
          token_address: tokenAddress,
          amount: amountFormatted,
          private_tx_ref: txResult.hash,
        });

        await supabase
          .from('invoices')
          .update({ payment_mode: 'PRIVATE', private_payment_tx_ref: txResult.hash })
          .eq('chain_invoice_id', Number(invoiceId))
          .eq('chain_id', invoiceChainId);

        await supabase.from('notifications').insert({
          recipient_address: sellerAddress.toLowerCase(),
          type: 'invoice_paid_private',
          title: 'Invoice Paid (Private)',
          message: `Invoice #${invoiceId} was paid privately for $${amountFormatted.toFixed(2)}`,
          chain_invoice_id: Number(invoiceId),
          chain_id: invoiceChainId,
        });
      }

      toast.success('Invoice paid privately!', {
        description: `$${amountFormatted.toFixed(2)} shielded to seller's private wallet.`,
      });

      onSuccess(txResult.hash);

    } catch (err: any) {
      console.error('[PrivatePay] Error:', err);
      toast.dismiss('private-pay-progress');
      if (err.message?.includes('rejected')) {
        toast.error('Transaction rejected');
      } else {
        toast.error('Private payment failed', { description: err.message });
      }
    } finally {
      setIsPaying(false);
      setPayStep('idle');
    }
  }, [address, sellerAddress, invoiceId, invoiceChainId, tokenAddress, amount, amountFormatted, canSponsor]);

  const getButtonLabel = () => {
    switch (payStep) {
      case 'resolve': return 'Resolving recipient...';
      case 'approve': return 'Approving USDC...';
      case 'shield': return 'Shielding to seller...';
      case 'send': return 'Sending transaction...';
      case 'record': return 'Recording receipt...';
      default: return `Pay $${amountFormatted.toLocaleString(undefined, { minimumFractionDigits: 2 })} Privately`;
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={handlePrivatePay}
        disabled={disabled || isPaying || !address}
        className="w-full"
        variant="hero"
      >
        {isPaying ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{getButtonLabel()}</>
        ) : (
          <>
            <Lock className="mr-2 h-4 w-4" />
            {getButtonLabel()}
          </>
        )}
      </Button>

      {!isEmbedded && (
        <p className="text-[10px] text-center text-amber-500/80">
          Use an embedded wallet (email/Google login) for gas-free transactions
        </p>
      )}

      <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1">
        <Shield className="h-3 w-3" />
        Seller receives funds privately — hidden from on-chain observers
      </p>
    </div>
  );
}
