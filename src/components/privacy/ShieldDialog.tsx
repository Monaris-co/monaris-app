import { useState, useCallback } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { parseUnits, encodeFunctionData, getAddress, createPublicClient, http, fallback } from 'viem';
import { arbitrum } from 'viem/chains';
import { useChainId, useWaitForTransactionReceipt } from 'wagmi';
import { useSendTransaction, useWallets } from '@privy-io/react-auth';
import { usePrivyAccount } from '@/hooks/usePrivyAccount';
import { useTokenBalance } from '@/hooks/useTokenBalance';
import { useChainAddresses } from '@/hooks/useChainAddresses';
import { usePrivateWallet } from '@/hooks/usePrivateWallet';
import { usePrivateBalance } from '@/hooks/usePrivateBalance';
import { buildShieldTransaction } from '@/lib/privacy/transactions';
import { RAILGUN_PROXY_CONTRACTS } from '@/lib/privacy/config';
import { getUSDCABI } from '@/lib/abis';
import type { SupportedPrivateToken } from '@/lib/privacy/config';

interface ShieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ShieldStep = 'input' | 'approve' | 'shield' | 'confirming' | 'done';

function UsdcIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path d="M20.5 18.2c0-2-1.2-2.7-3.5-3-.7-.1-1.4-.2-2-.4-.6-.2-.9-.5-.9-1 0-.6.5-1 1.3-1 .7 0 1.2.3 1.4.8.1.2.2.3.4.3h1c.2 0 .4-.2.3-.4-.2-1-1-1.8-2-2v-1c0-.2-.2-.4-.4-.4h-.8c-.2 0-.4.2-.4.4v1c-1.3.2-2.2 1.2-2.2 2.4 0 1.8 1.1 2.6 3.5 2.9.8.1 1.3.3 1.9.5.5.3.7.6.7 1.1 0 .7-.6 1.2-1.5 1.2-.9 0-1.5-.4-1.7-1-.1-.2-.2-.3-.4-.3h-1c-.2 0-.4.2-.3.4.3 1.1 1.1 1.9 2.4 2.1v1c0 .2.2.4.4.4h.8c.2 0 .4-.2.4-.4v-1c1.4-.2 2.3-1.2 2.3-2.6z" fill="white" />
      <path d="M13.1 24.3c-4.6-1.6-7-6.7-5.4-11.3 .8-2.3 2.6-4.1 4.9-4.9.2-.1.3-.3.3-.5v-.9c0-.2-.1-.4-.3-.3-.1 0-.2 0-.2.1-5.3 1.7-8.2 7.3-6.5 12.6 1 3.2 3.5 5.7 6.7 6.7.2.1.4 0 .5-.2 0-.1.1-.2.1-.2v-.9c-.1-.1-.2-.3-.1-.2zM19.1 6.6c-.2-.1-.4 0-.5.2 0 .1-.1.2-.1.2v.9c0 .2.2.4.4.5 4.6 1.6 7 6.7 5.4 11.3-.8 2.3-2.6 4.1-4.9 4.9-.2.1-.3.3-.3.5v.9c0 .2.1.4.3.3.1 0 .2 0 .2-.1 5.3-1.7 8.2-7.3 6.5-12.6-1-3.1-3.5-5.6-6.7-6.7-.1-.2-.2-.2-.3-.3z" fill="white" />
    </svg>
  );
}

function UsdtIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#26A17B" />
      <path d="M17.9 17.9v0c-.1 0-.8.1-2 .1-1 0-1.7 0-2-.1v0c-3.4-.2-6-1-6-1.9s2.6-1.7 6-1.9v3c.3 0 1 .1 2 .1 1.2 0 1.8-.1 2-.1v-3c3.4.2 5.9.9 5.9 1.9s-2.5 1.7-5.9 1.9zm0-4.1v-2.7h4.7V8H9.5v3.1h4.6v2.7c-3.8.2-6.7 1.1-6.7 2.3s2.9 2.1 6.7 2.3V25h3.8v-6.6c3.8-.2 6.6-1.1 6.6-2.3s-2.8-2.1-6.6-2.3z" fill="white" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="14" rx="3" />
      <path d="M2 10h20" />
      <path d="M16 14h.01" />
      <path d="M6 6V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function ShieldDialog({ open, onOpenChange }: ShieldDialogProps) {
  const chainId = useChainId();
  const { address } = usePrivyAccount();
  const addresses = useChainAddresses();
  const { balance: publicUsdcBalance } = useTokenBalance();
  const { initializeWallet, wallet, isCreatingWallet } = usePrivateWallet();
  const { refreshBalances } = usePrivateBalance();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const usdcABI = getUSDCABI(chainId);

  const [token, setToken] = useState<SupportedPrivateToken>('USDC');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<ShieldStep>('input');
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    query: { enabled: !!txHash },
  });

  const embeddedWallet = wallets.find((w) => {
    const ct = w.connectorType?.toLowerCase() || '';
    const wct = w.walletClientType?.toLowerCase() || '';
    return ct === 'embedded' || wct === 'privy' || ct.includes('privy');
  }) || wallets[0];

  const rawProxy = RAILGUN_PROXY_CONTRACTS[chainId];
  const proxyAddress = rawProxy ? getAddress(rawProxy) : undefined;
  const tokenAddress = addresses.DemoUSDC;

  const handleShield = useCallback(async () => {
    if (!address || !tokenAddress || !proxyAddress || !amount) return;
    setIsProcessing(true);

    // Retry helper for transient Privy RPC failures (AbortError, 502, etc.)
    const sendTxWithRetry = async (tx: any, opts: any, retries = 2): Promise<any> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await sendTransaction(tx, opts);
        } catch (err: any) {
          const msg = err?.message || '';
          const isTransient =
            err?.name === 'AbortError' ||
            msg.includes('abort') ||
            msg.includes('502') ||
            msg.includes('Bad Gateway') ||
            msg.includes('HTTP request failed');
          if (isTransient && attempt < retries) {
            console.warn(`[Shield] Transient error on attempt ${attempt + 1}, retrying in ${(attempt + 1) * 1500}ms...`);
            await new Promise((r) => setTimeout(r, (attempt + 1) * 1500));
            continue;
          }
          throw err;
        }
      }
    };

    try {
      let currentWallet = wallet;
      if (!currentWallet) {
        toast.info('Setting up your private wallet...', { duration: 5000 });
        currentWallet = await initializeWallet();
      }

      const amountBigInt = parseUnits(amount, 6);

      setStep('approve');
      const approveData = encodeFunctionData({
        abi: usdcABI,
        functionName: 'approve',
        args: [proxyAddress as `0x${string}`, amountBigInt],
      });

      const isGasSponsored = chainId === 421614 || chainId === 42161;
      const sendOpts = {
        address: embeddedWallet?.address || address,
        sponsor: isGasSponsored,
        uiOptions: { showWalletUIs: false },
      };

      // Do NOT pass explicit gas — let Privy's AA bundler estimate it.
      // Hardcoded gas values cause UserOperation simulation failures.
      const approveResult = await sendTxWithRetry(
        { to: tokenAddress as `0x${string}`, data: approveData, value: 0n, chainId },
        sendOpts as any,
      );

      const publicClient = createPublicClient({
        chain: arbitrum,
        transport: fallback([
          http('https://arbitrum.drpc.org'),
          http('https://arb-pokt.nodies.app'),
          http('https://rpc.ankr.com/arbitrum'),
        ]),
      });
      await publicClient.waitForTransactionReceipt({ hash: approveResult.hash as `0x${string}`, confirmations: 1 });

      setStep('shield');
      const networkName = chainId === 42161 ? 'Arbitrum' : 'Arbitrum';
      const shieldTx = await buildShieldTransaction(
        { tokenAddress, amount: amountBigInt, fromAddress: currentWallet!.railgunAddress },
        networkName,
      );

      const shieldResult = await sendTxWithRetry(
        { to: shieldTx.to as `0x${string}`, data: shieldTx.data as `0x${string}`, value: shieldTx.value, chainId },
        sendOpts as any,
      );

      setTxHash(shieldResult.hash);
      setStep('confirming');
    } catch (err: any) {
      console.error('[Shield] Error:', err);
      const msg = err?.message || '';
      toast.error(
        msg.includes('rejected') ? 'Transaction rejected' :
          msg.includes('insufficient') || msg.includes('exceeds') ? 'Insufficient balance' :
            'Shield failed — please try again',
      );
      setStep('input');
    } finally {
      setIsProcessing(false);
    }
  }, [address, tokenAddress, proxyAddress, amount, wallet, chainId, embeddedWallet]);

  if (isSuccess && step === 'confirming') {
    setStep('done');
    toast.success('Funds shielded successfully!');
    setTimeout(() => refreshBalances(), 5000);
    setTimeout(() => refreshBalances(), 15000);
    setTimeout(() => refreshBalances(), 30000);
  }

  const resetDialog = () => { setAmount(''); setStep('input'); setTxHash(null); setIsProcessing(false); };

  const parsedAmount = parseFloat(amount) || 0;
  const isDisabled = !amount || parsedAmount <= 0 || parsedAmount > publicUsdcBalance || isProcessing || isConfirming || isCreatingWallet;
  const stepLabel = step === 'approve' ? 'Approving token...' : step === 'shield' ? 'Shielding funds...' : step === 'confirming' ? 'Confirming on-chain...' : isCreatingWallet ? 'Setting up wallet...' : '';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetDialog(); onOpenChange(v); }}>
      <DialogContent className="w-[calc(100vw-32px)] sm:w-full sm:max-w-[440px] p-0 overflow-hidden border border-[#2a2a2a] dark:border-[#2a2a2a] rounded-[24px] bg-white dark:bg-[#111111] shadow-[0px_32px_64px_-16px_rgba(0,0,0,0.35)]">

        {step === 'done' ? (
          <div className="p-8 text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#ddf9e4] flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-[#22c55e]" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-[#1a1a1a] dark:text-white">Funds Shielded!</h3>
              <p className="text-sm text-[#888] mt-2">
                {amount} USDC is now in your private balance.<br />
                Balance may take a moment to update.
              </p>
            </div>
            <button
              onClick={() => { resetDialog(); onOpenChange(false); }}
              className="w-full py-3.5 rounded-xl bg-[#c8ff00] hover:bg-[#b8ef00] text-[#1a1a1a] font-semibold text-sm transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 pt-5 pb-3 border-b border-[#1a1a1a]/10 dark:border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 text-white rounded-[12px] bg-gradient-to-br from-[#1a1a1a] to-[#333] flex items-center justify-center shadow-sm">
                  <ShieldIcon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-[#1a1a1a] dark:text-white tracking-tight">Shield Funds</h2>
                  <p className="text-[11px] text-[#999]">Move to private balance</p>
                </div>
              </div>
            </div>

            <div className="px-4 pb-4 pt-4 space-y-4 overflow-y-auto max-h-[80vh] sm:max-h-[calc(85vh-76px)]">
              {!(isProcessing || isConfirming) ? (
                <>
                  {/* Token + Amount card */}
                  <div className="rounded-2xl border-2 border-[#1a1a1a]/10 dark:border-[#333] bg-[#fafafa] dark:bg-[#151515] overflow-hidden">
                    {/* Token header row */}
                    <div className="flex items-center justify-between px-4 pt-4 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-white dark:bg-[#1a1a1a] border-2 border-[#1a1a1a]/8 dark:border-[#333] flex items-center justify-center shadow-sm">
                          <UsdcIcon className="w-7 h-7" />
                        </div>
                        <div>
                          <span className="block text-[15px] font-bold text-[#1a1a1a] dark:text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>USDC</span>
                          <span className="block text-[11px] text-[#999] font-medium">USD Coin · Arbitrum</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="block text-[15px] font-bold text-[#1a1a1a] dark:text-white" style={{ fontFamily: "'SF Mono', 'Fira Code', monospace" }}>{publicUsdcBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span className="block text-[11px] text-[#999] font-medium">Available</span>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="mx-4 h-px bg-[#1a1a1a]/8 dark:bg-[#333]" />

                    {/* Amount input area */}
                    <div className="p-4 space-y-3">
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          disabled={isProcessing || isConfirming}
                          className="w-full bg-white dark:bg-[#1a1a1a] border-2 border-[#1a1a1a]/10 dark:border-[#333] focus:border-[#1a1a1a] dark:focus:border-[#c8ff00] rounded-xl px-4 py-4 text-2xl font-bold text-[#1a1a1a] dark:text-white placeholder:text-[#d1d1d1] dark:placeholder:text-[#444] outline-none transition-colors disabled:opacity-50" style={{ fontFamily: "'SF Mono', 'Fira Code', monospace" }}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-[#f0f0f0] dark:bg-[#222] px-2.5 py-1.5 rounded-lg">
                          <UsdcIcon className="w-4 h-4" />
                          <span className="text-xs font-bold text-[#555] dark:text-[#aaa]">USDC</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {[0.25, 0.5, 0.75, 1].map((pct) => (
                          <button
                            key={pct}
                            onClick={() => setAmount((publicUsdcBalance * pct).toFixed(2))}
                            disabled={publicUsdcBalance === 0}
                            className="flex-1 py-2 rounded-lg border-2 border-[#1a1a1a]/8 dark:border-[#333] bg-white dark:bg-[#1a1a1a] text-[11px] font-bold text-[#666] dark:text-[#888] hover:border-[#1a1a1a] dark:hover:border-[#c8ff00] hover:text-[#1a1a1a] dark:hover:text-[#c8ff00] transition-all disabled:opacity-30"
                          >
                            {pct === 1 ? 'MAX' : `${pct * 100}%`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Flow indicator */}
                  <div className="flex items-center justify-center gap-3 py-1">
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#e0e0e0] dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a]">
                      <WalletIcon className="h-4 w-4 text-[#999]" />
                      <span className="text-[12px] font-semibold text-[#666] dark:text-[#888]">Public</span>
                    </div>
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#c8ff00] shadow-[0_2px_8px_rgba(200,255,0,0.3)]">
                      <svg className="w-4 h-4 text-[#1a1a1a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#c8ff00]/40 bg-[#c8ff00]/8">
                      <ShieldIcon className="h-4 w-4 text-[#7cb518]" />
                      <span className="text-[12px] font-semibold text-[#7cb518]">Private</span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl border border-[#e0e0e0] dark:border-[#2a2a2a] bg-[#fafafa] dark:bg-[#151515]">
                    <svg className="h-4 w-4 text-[#999] mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                    <p className="text-[11px] text-[#888] leading-relaxed">
                      The deposit is visible on-chain. Transfers within the pool are fully private.
                    </p>
                  </div>

                </>
              ) : (
                <div className="py-2 space-y-8 animate-in fade-in zoom-in-95 duration-500">
                  <div className="text-center space-y-2">
                    <p className="text-[16px] font-bold text-[#1a1a1a] dark:text-white">
                      {stepLabel}
                    </p>
                    <p className="text-[12px] text-[#888]">
                      Shielding {amount} USDC to private wallet
                    </p>
                  </div>

                  {/* Enhanced 3D Cryptographic Core Visual */}
                  <div className="relative w-48 h-48 mx-auto my-6" style={{ perspective: '1000px' }}>
                    {/* Ambient Grid Glow */}
                    <div className="absolute inset-0 bg-[#c8ff00]/10 blur-3xl rounded-full mix-blend-screen animate-pulse" />

                    {/* Outer Orbiting Data Ring */}
                    <div className="absolute inset-0 rounded-full border border-[rgba(200,255,0,0.15)] dark:border-[rgba(200,255,0,0.1)] animate-[spin_8s_linear_infinite]" style={{ transformStyle: 'preserve-3d', transform: 'rotateX(60deg) rotateY(10deg)' }}>
                      <div className="absolute top-0 left-1/2 w-2 h-2 -ml-1 bg-[#c8ff00] rounded-full shadow-[0_0_12px_#c8ff00] animate-[ping_2s_ease-in-out_infinite]" />
                      <div className="absolute bottom-0 right-1/4 w-1.5 h-1.5 -mb-0.5 bg-[#c8ff00] rounded-full shadow-[0_0_8px_#c8ff00]" />
                    </div>

                    {/* Middle Dash Ring */}
                    <div className="absolute inset-3 rounded-full border-[2.5px] border-dashed border-[#c8ff00]/30 animate-[spin_5s_linear_infinite_reverse]" style={{ transformStyle: 'preserve-3d', transform: 'rotateX(55deg) rotateY(-10deg) translateZ(10px)' }} />

                    {/* Inner Solid Ring */}
                    <div className="absolute inset-7 rounded-full border-[2px] border-[#c8ff00]/50 animate-[spin_3s_linear_infinite]" style={{ transformStyle: 'preserve-3d', transform: 'rotateX(45deg) rotateY(5deg) translateZ(20px)' }}>
                      <div className="absolute bottom-0 left-1/2 w-4 h-[2.5px] -ml-2 bg-[#c8ff00] shadow-[0_0_10px_#c8ff00]" />
                    </div>

                    {/* Floating Core Layer */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ transformStyle: 'preserve-3d', transform: 'translateZ(40px)' }}>
                      <div className="relative w-[72px] h-[72px] animate-[bounce_4s_ease-in-out_infinite]">
                        {/* Internal Core Glow */}
                        <div className="absolute inset-0 bg-[#c8ff00] blur-xl opacity-50 animate-[pulse_3s_ease-in-out_infinite]" />

                        {/* 3D Glass Block */}
                        <div className="absolute inset-0 rounded-[1.2rem] bg-gradient-to-tr from-[#9acd00] via-[#c8ff00] to-[#e4ff66] shadow-[inset_1px_1px_3px_rgba(255,255,255,0.7),0_12px_30px_-5px_rgba(200,255,0,0.5)] flex items-center justify-center transform -rotate-12 hover:rotate-0 hover:scale-105 transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] border border-white/40 dark:border-white/20 backdrop-blur-md">
                          {step === 'confirming' ? (
                            <Loader2 className="h-9 w-9 text-[#1a1a1a] drop-shadow-[0_2px_2px_rgba(255,255,255,0.25)] animate-[spin_6s_linear_infinite]" />
                          ) : (
                            <ShieldIcon className="h-9 w-9 text-black rotate-12 drop-shadow-[0_2px_2px_rgba(255,255,255,0.25)] transition-transform duration-700 hover:rotate-0" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Floating Tech Particles */}
                    <div className="absolute top-1/4 left-1/4 w-1.5 h-1.5 rounded-full bg-[#c8ff00] animate-[ping_3s_ease-in-out_infinite] opacity-80" />
                    <div className="absolute bottom-1/4 right-[20%] w-2 h-2 rounded-full bg-[#c8ff00] animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_8px_#c8ff00]" style={{ animationDelay: '1s' }} />
                    <div className="absolute top-1/2 right-2 w-1 h-1 rounded-full bg-white opacity-60 animate-[ping_4s_ease-in-out_infinite]" style={{ animationDelay: '0.5s' }} />
                  </div>

                  {/* Steps List */}
                  <div className="space-y-1.5 px-2">
                    {[
                      { id: 'approve', label: 'Approve Token', sublabel: 'Granting deposit permission' },
                      { id: 'shield', label: 'Shield Funds', sublabel: 'Transferring to RAILGUN proxy' },
                      { id: 'confirming', label: 'Confirming', sublabel: 'Awaiting network finality' }
                    ].map((ps) => {
                      const stepOrder = ['input', 'approve', 'shield', 'confirming'];
                      const currentIdx = stepOrder.indexOf(step);
                      const currentRealIdx = currentIdx === 0 && isProcessing ? 1 : currentIdx; // map input->approve visually if processing started
                      const psIdx = stepOrder.indexOf(ps.id);

                      const isActive = psIdx === currentRealIdx;
                      const isDone = psIdx < currentRealIdx;

                      return (
                        <div
                          key={ps.id}
                          className={`flex items-start gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${isActive
                            ? 'bg-[#c8ff00]/10 border border-[#c8ff00]/30'
                            : isDone
                              ? 'bg-[#f0fdf4] dark:bg-[#22c55e]/5 border border-[#22c55e]/20'
                              : 'bg-transparent border border-transparent opacity-40'
                            }`}
                        >
                          <div className="mt-0.5 flex-shrink-0">
                            {isDone ? (
                              <div className="w-5 h-5 rounded-full bg-[#22c55e] flex items-center justify-center shadow-sm">
                                <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                              </div>
                            ) : isActive ? (
                              <div className="w-5 h-5 rounded-full border-2 border-[#c8ff00] border-t-[#c8ff00]/20 animate-spin" />
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2 border-[#d1d1d1] dark:border-[#444]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className={`block text-[13px] font-bold ${isActive ? 'text-[#1a1a1a] dark:text-white' :
                              isDone ? 'text-[#22c55e]' :
                                'text-[#999]'
                              }`}>{ps.label}</span>
                            <span className={`block text-[11px] mt-0.5 ${isActive ? 'text-[#888]' : isDone ? 'text-[#22c55e]/60' : 'text-[#ccc] dark:text-[#555]'
                              }`}>{ps.sublabel}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Action button - Pinned at bottom outside scroll area */}
            {!(isProcessing || isConfirming) && (
              <div className="px-4 pb-4 pt-1 shrink-0 bg-white dark:bg-[#0a0a0a]">
                <button
                  onClick={handleShield}
                  disabled={isDisabled}
                  className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl bg-[#c8ff00] hover:bg-[#bbee00] text-[#1a1a1a] font-bold text-[14px] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_4px_16px_rgba(200,255,0,0.25)] hover:shadow-[0_4px_24px_rgba(200,255,0,0.4)]"
                >
                  <ShieldIcon className="h-[18px] w-[18px]" />
                  Shield {parsedAmount > 0 ? amount : '0'} USDC
                </button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
