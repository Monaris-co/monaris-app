import { useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Copy, Check, Loader2, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { parseUnits, getAddress, isAddress, createPublicClient, http, fallback } from 'viem';
import { arbitrum } from 'viem/chains';
import { useChainId } from 'wagmi';
import { usePrivyAccount } from '@/hooks/usePrivyAccount';
import { usePrivateWallet } from '@/hooks/usePrivateWallet';
import { usePrivateBalance } from '@/hooks/usePrivateBalance';
import { usePrivacyStore } from '@/lib/privacy/store';
import { getPrivacyConfig } from '@/lib/privacy/config';
import { buildUnshieldTransaction } from '@/lib/privacy/transactions';
import { useSendTransaction, useWallets } from '@privy-io/react-auth';
import type { SupportedPrivateToken } from '@/lib/privacy/config';

interface UnshieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type UnshieldStep = 'input' | 'proving' | 'verifying' | 'sending' | 'done';

interface SnarkProofData {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  publicSignals: string[];
  proofTime: number;
  circuit: string;
}

function UsdcIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path d="M20.5 18.2c0-2-1.2-2.7-3.5-3-.7-.1-1.4-.2-2-.4-.6-.2-.9-.5-.9-1 0-.6.5-1 1.3-1 .7 0 1.2.3 1.4.8.1.2.2.3.4.3h1c.2 0 .4-.2.3-.4-.2-1-1-1.8-2-2v-1c0-.2-.2-.4-.4-.4h-.8c-.2 0-.4.2-.4.4v1c-1.3.2-2.2 1.2-2.2 2.4 0 1.8 1.1 2.6 3.5 2.9.8.1 1.3.3 1.9.5.5.3.7.6.7 1.1 0 .7-.6 1.2-1.5 1.2-.9 0-1.5-.4-1.7-1-.1-.2-.2-.3-.4-.3h-1c-.2 0-.4.2-.3.4.3 1.1 1.1 1.9 2.4 2.1v1c0 .2.2.4.4.4h.8c.2 0 .4-.2.4-.4v-1c1.4-.2 2.3-1.2 2.3-2.6z" fill="white" />
      <path d="M13.1 24.3c-4.6-1.6-7-6.7-5.4-11.3 .8-2.3 2.6-4.1 4.9-4.9.2-.1.3-.3.3-.5v-.9c0-.2-.1-.4-.3-.3-.1 0-.2 0-.2.1-5.3 1.7-8.2 7.3-6.5 12.6 1 3.2 3.5 5.7 6.7 6.7.2.1.4 0 .5-.2 0-.1.1-.2.1-.2v-.9c-.1-.1-.2-.3-.1-.2zM19.1 6.6c-.2-.1-.4 0-.5.2 0 .1-.1.2-.1.2v.9c0 .2.2.4.4.5 4.6 1.6 7 6.7 5.4 11.3-.8 2.3-2.6 4.1-4.9 4.9-.2.1-.3.3-.3.5v.9c0 .2.1.4.3.3.1 0 .2 0 .2-.1 5.3-1.7 8.2-7.3 6.5-12.6-1-3.1-3.5-5.6-6.7-6.7-.1-.2-.2-.2-.3-.3z" fill="white" />
    </svg>
  );
}

function EthIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#627EEA" />
      <path d="M16.498 4v8.87l7.497 3.35L16.498 4z" fill="white" fillOpacity="0.6" />
      <path d="M16.498 4L9 16.22l7.498-3.35V4z" fill="white" />
      <path d="M16.498 21.968v6.027L24 17.616l-7.502 4.352z" fill="white" fillOpacity="0.6" />
      <path d="M16.498 27.995v-6.028L9 17.616l7.498 10.379z" fill="white" />
      <path d="M16.498 20.573l7.497-4.353-7.497-3.348v7.701z" fill="white" fillOpacity="0.2" />
      <path d="M9 16.22l7.498 4.353v-7.701L9 16.22z" fill="white" fillOpacity="0.6" />
    </svg>
  );
}

function UsmtPlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#1a1a1a" />
      <circle cx="16" cy="16" r="14.5" stroke="#c8ff00" strokeWidth="1" />
      <text x="16" y="18" textAnchor="middle" fill="#c8ff00" fontSize="9" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">U+</text>
    </svg>
  );
}

type TokenOption = {
  id: string;
  symbol: string;
  name: string;
  network: string;
  icon: React.ComponentType<{ className?: string }>;
  decimals: number;
  enabled: boolean;
  comingSoon?: boolean;
};

const TOKEN_OPTIONS: TokenOption[] = [
  { id: 'USDC', symbol: 'USDC', name: 'USD Coin', network: 'Arbitrum', icon: UsdcIcon, decimals: 6, enabled: true },
  { id: 'ETH', symbol: 'ETH', name: 'Ethereum', network: 'Arbitrum', icon: EthIcon, decimals: 18, enabled: true },
  { id: 'USMT+', symbol: 'USMT+', name: 'USMT Plus', network: 'Arbitrum', icon: UsmtPlusIcon, decimals: 18, enabled: false, comingSoon: true },
];

function LockShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <rect x="9" y="11" width="6" height="5" rx="1" />
      <path d="M10.5 11V9a1.5 1.5 0 0 1 3 0v2" />
    </svg>
  );
}

function WithdrawIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="m8 11 4 4 4-4" />
      <rect x="4" y="19" width="16" height="2" rx="1" />
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

function ZkProofIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function truncateHash(s: string, front = 8, back = 6): string {
  if (s.length <= front + back + 3) return s;
  return `${s.slice(0, front)}...${s.slice(-back)}`;
}

function ProofDetailsPanel({ proof, onClose }: { proof: SnarkProofData; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (label: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const fullProofJson = JSON.stringify({
    protocol: 'groth16',
    curve: 'bn128',
    pi_a: proof.pi_a,
    pi_b: proof.pi_b,
    pi_c: proof.pi_c,
    publicSignals: proof.publicSignals,
  }, null, 2);

  return (
    <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between pb-0.5">
        <span className="text-[9px] font-bold text-[#888] uppercase tracking-wider">Zero-Knowledge Witness</span>
        <button
          onClick={() => copyToClipboard('full', fullProofJson)}
          className="flex items-center gap-1.5 px-1.5 py-1 rounded text-[9px] font-bold text-[#666] dark:text-[#888] hover:bg-[#f0f0f0] dark:hover:bg-[#222] transition-colors border border-transparent hover:border-[#e0e0e0] dark:hover:border-[#333]"
        >
          {copied === 'full' ? <Check className="h-2.5 w-2.5 text-[#22c55e]" /> : <Copy className="h-2.5 w-2.5" />}
          {copied === 'full' ? 'Copied' : 'Copy JSON'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div className="flex items-center justify-between px-2 py-1.5 rounded bg-white dark:bg-[#1a1a1a] border border-[#e8e8e8] dark:border-[#2a2a2a]">
          <span className="text-[9px] font-bold text-[#999] uppercase tracking-wider">Protocol</span>
          <span className="text-[10px] font-bold text-[#1a1a1a] dark:text-white">Groth16</span>
        </div>
        <div className="flex items-center justify-between px-2 py-1.5 rounded bg-white dark:bg-[#1a1a1a] border border-[#e8e8e8] dark:border-[#2a2a2a]">
          <span className="text-[9px] font-bold text-[#999] uppercase tracking-wider">Curve</span>
          <span className="text-[10px] font-bold text-[#1a1a1a] dark:text-white">BN128</span>
        </div>
        <div className="flex items-center justify-between px-2 py-1.5 rounded bg-white dark:bg-[#1a1a1a] border border-[#e8e8e8] dark:border-[#2a2a2a]">
          <span className="text-[9px] font-bold text-[#999] uppercase tracking-wider">Circuit</span>
          <span className="text-[10px] font-bold text-[#1a1a1a] dark:text-white truncate max-w-[50px]">{proof.circuit}</span>
        </div>
        <div className="flex items-center justify-between px-2 py-1.5 rounded bg-white dark:bg-[#1a1a1a] border border-[#e8e8e8] dark:border-[#2a2a2a]">
          <span className="text-[9px] font-bold text-[#999] uppercase tracking-wider">Time</span>
          <span className="text-[10px] font-bold text-[#1a1a1a] dark:text-white">{(proof.proofTime / 1000).toFixed(1)}s</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {[
          { label: 'π_A (G1)', value: proof.pi_a.slice(0, 2).map(v => truncateHash(v)).join(', '), raw: proof.pi_a.join('\n') },
          { label: 'π_B (G2)', value: proof.pi_b.flat().slice(0, 2).map(v => truncateHash(v)).join(', '), raw: proof.pi_b.flat().join('\n') },
          { label: 'π_C (G1)', value: proof.pi_c.slice(0, 2).map(v => truncateHash(v)).join(', '), raw: proof.pi_c.join('\n') },
        ].map(({ label, value, raw }) => (
          <div key={label} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-white dark:bg-[#1a1a1a] border border-[#e8e8e8] dark:border-[#2a2a2a]">
            <div className="flex items-center flex-1 gap-2 min-w-0">
              <span className="text-[9px] font-bold text-[#999] uppercase tracking-wider shrink-0">{label}</span>
              <span className="text-[9px] font-mono text-[#555] dark:text-[#aaa] truncate">{value}</span>
            </div>
            <button
              onClick={() => copyToClipboard(label, raw)}
              className="p-1 rounded hover:bg-[#f5f5f5] dark:hover:bg-[#222] transition-colors flex-shrink-0"
            >
              {copied === label ? <Check className="h-3 w-3 text-[#22c55e]" /> : <Copy className="h-3 w-3 text-[#bbb]" />}
            </button>
          </div>
        ))}
      </div>

      <div className="px-2 py-1.5 rounded bg-white dark:bg-[#1a1a1a] border border-[#e8e8e8] dark:border-[#2a2a2a] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold text-[#999] uppercase tracking-wider">Public Signals</span>
          <span className="px-1 py-0.5 rounded bg-[#f0f0f0] dark:bg-[#333] text-[8px] font-bold text-[#1a1a1a] dark:text-white">{proof.publicSignals.length} INPUTS</span>
        </div>
        <div className="flex gap-2 items-center min-w-0">
          {proof.publicSignals.length > 0 && (
            <span className="text-[9px] font-mono text-[#555] dark:text-[#aaa] truncate">{truncateHash(proof.publicSignals[0], 6, 6)}</span>
          )}
          {proof.publicSignals.length > 1 && (
            <span className="text-[9px] font-mono text-[#999]">+{proof.publicSignals.length - 1}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function UnshieldDialog({ open, onOpenChange }: UnshieldDialogProps) {
  const chainId = useChainId();
  const { address } = usePrivyAccount();
  const { wallet } = usePrivateWallet();
  const { privateUsdcBalance, privateUsdtBalance, spendableUsdc, spendableUsdt, hasPendingFunds, refreshBalances } = usePrivateBalance();
  const { proofProgress, proofStage } = usePrivacyStore();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();

  const [token, setToken] = useState<SupportedPrivateToken>('USDC');
  const [selectedTokenId, setSelectedTokenId] = useState('USDC');
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<UnshieldStep>('input');
  const [isProcessing, setIsProcessing] = useState(false);
  const [proofData, setProofData] = useState<SnarkProofData | null>(null);
  const [showProofDetails, setShowProofDetails] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [recipientMode, setRecipientMode] = useState<'self' | 'other'>('self');
  const [customRecipient, setCustomRecipient] = useState('');

  const selectedToken = TOKEN_OPTIONS.find(t => t.id === selectedTokenId) || TOKEN_OPTIONS[0];
  const TokenIcon = selectedToken.icon;
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTokenDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTokenDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTokenDropdown]);

  const isValidCustomAddress = customRecipient.length > 0 && isAddress(customRecipient);
  const isSendingToOther = recipientMode === 'other';
  const resolvedRecipient = isSendingToOther ? customRecipient : address;

  const embeddedWallet = wallets.find((w) => {
    const ct = w.connectorType?.toLowerCase() || '';
    const wct = w.walletClientType?.toLowerCase() || '';
    return ct === 'embedded' || wct === 'privy' || ct.includes('privy');
  }) || wallets[0];

  const currentBalance = selectedTokenId === 'USDC' ? privateUsdcBalance : selectedTokenId === 'ETH' ? 0 : privateUsdtBalance;
  const currentSpendable = selectedTokenId === 'USDC' ? spendableUsdc : selectedTokenId === 'ETH' ? 0 : spendableUsdt;
  const isPending = currentBalance > 0 && currentSpendable < currentBalance;

  const handleUnshield = useCallback(async () => {
    if (!address || !wallet || !amount || !resolvedRecipient) return;
    if (isSendingToOther && !isValidCustomAddress) {
      toast.error('Invalid recipient address');
      return;
    }

    const parsedAmt = parseFloat(amount) || 0;
    if (parsedAmt <= 0) return;
    if (parsedAmt > currentSpendable) {
      if (isPending) {
        toast.error('Funds are still pending', {
          description: `${currentBalance.toFixed(2)} ${selectedToken.symbol} shielded, but only ${currentSpendable.toFixed(2)} is spendable. Wait a few minutes for POI validation.`,
        });
      } else {
        toast.error('Insufficient spendable balance', {
          description: `You have ${currentSpendable.toFixed(2)} ${selectedToken.symbol} spendable.`,
        });
      }
      return;
    }

    setIsProcessing(true);
    setStep('proving');
    setProofData(null);
    setShowProofDetails(false);

    try {
      if (chainId !== 42161) {
        throw new Error('Unshield is currently supported only on Arbitrum mainnet.');
      }

      const privacyConfig = getPrivacyConfig(chainId);
      if (!privacyConfig.enabled) {
        throw new Error('Privacy unshielding is not enabled on this network.');
      }

      const amountBigInt = parseUnits(amount, 6);
      const networkName = 'Arbitrum';
      const tokenAddress = getAddress(privacyConfig.usdcAddress);
      const recipientAddress = getAddress(resolvedRecipient);

      const proofStart = Date.now();

      // Retry up to 3 times — the IPFS artifact download can timeout on first
      // attempt but succeeds quickly on retry since partially cached in IndexedDB.
      let result: Awaited<ReturnType<typeof buildUnshieldTransaction>> | undefined;
      const MAX_BUILD_RETRIES = 3;
      for (let attempt = 1; attempt <= MAX_BUILD_RETRIES; attempt++) {
        result = await buildUnshieldTransaction(
          { tokenAddress, amount: amountBigInt, toAddress: recipientAddress },
          wallet.id,
          wallet.encryptionKey,
          networkName,
          (progress, stage) => {
            usePrivacyStore.getState().setProofProgress(progress, stage);
          },
        );
        if (result.success && result.transaction) break;
        const isArtifactTimeout = result.error?.includes('Timed out downloading artifact');
        if (!isArtifactTimeout || attempt === MAX_BUILD_RETRIES) break;
        console.warn(`[Unshield] Artifact download timed out, retry ${attempt}/${MAX_BUILD_RETRIES}...`);
      }

      if (!result?.success || !result.transaction) throw new Error(result?.error || 'Transaction build failed');

      const proofTime = result.proofTime || (Date.now() - proofStart);

      const extractProofElements = (data: string) => {
        const hex = data.startsWith('0x') ? data.slice(2) : data;
        const word = (offset: number) => '0x' + hex.slice(offset * 2, (offset + 32) * 2);
        // Groth16 proof elements are encoded after the function selector (4 bytes)
        // and ABI-encoded struct. Extract 8 x uint256 words starting after initial offset.
        const base = 4 + 32 * 4; // skip selector + initial ABI offset words
        return {
          pi_a: [word(base), word(base + 32)],
          pi_b: [[word(base + 64), word(base + 96)], [word(base + 128), word(base + 160)]],
          pi_c: [word(base + 192), word(base + 224)],
          publicSignals: [word(base + 256), word(base + 288), word(base + 320)].filter(s => s.length > 4),
        };
      };

      const proofElements = result.transaction.data
        ? extractProofElements(result.transaction.data)
        : { pi_a: [], pi_b: [[], []], pi_c: [], publicSignals: [] };

      setProofData({
        ...proofElements,
        proofTime,
        circuit: '2x2 PoseidonMerkle',
      });

      console.log('[Unshield] Proof generated successfully. Data length:', result.transaction.data?.length, 'Gas estimate:', result.transaction.gasEstimate?.toString());

      setStep('verifying');

      const publicClient = createPublicClient({
        chain: arbitrum,
        transport: fallback([
          http('https://arbitrum.drpc.org'),
          http('https://arb-pokt.nodies.app'),
          http('https://rpc.ankr.com/arbitrum'),
        ]),
      });
      try {
        await publicClient.call({
          account: address as `0x${string}`,
          to: result.transaction.to as `0x${string}`,
          data: result.transaction.data as `0x${string}`,
          gas: 5_000_000n,
        });
        console.log('[Unshield] eth_call pre-check PASSED — proof is valid on-chain');
      } catch (simErr: any) {
        const reason = simErr?.cause?.reason || simErr?.shortMessage || simErr?.message || '';
        console.error('[Unshield] eth_call pre-check FAILED:', reason);
        if (reason.includes('Invalid Snark Proof')) {
          throw new Error('Proof verification failed on-chain. Please clear site data (Application \u2192 Storage \u2192 Clear) and try again.');
        }
      }

      setStep('sending');

      const targetWallet = embeddedWallet || wallets[0];
      if (!targetWallet) throw new Error('No wallet available');

      const txRequest = {
        to: result.transaction.to as `0x${string}`,
        data: result.transaction.data as `0x${string}`,
        value: 0n,
        chainId,
        gas: result.transaction.gasEstimate ? result.transaction.gasEstimate + 500_000n : 3_000_000n,
      };

      console.log('[Unshield] Sending via Privy sendTransaction. Gas:', txRequest.gas.toString(), 'Wallet:', targetWallet.address);

      const { hash } = await sendTransaction(txRequest, {
        address: targetWallet.address,
        sponsor: true,
        uiOptions: { showWalletUIs: false },
      } as any);

      console.log('[Unshield] Transaction sent! Hash:', hash);
      setTxHash(hash);
      setStep('done');
      refreshBalances();
      toast.success(isSendingToOther ? 'Private payment sent!' : 'Funds unshielded!', {
        description: isSendingToOther
          ? `${amount} ${selectedToken.symbol} sent privately to ${resolvedRecipient?.slice(0, 6)}...${resolvedRecipient?.slice(-4)}`
          : `${amount} ${selectedToken.symbol} returned to your public wallet.`,
      });
    } catch (err: any) {
      console.error('[Unshield] Error:', err);
      const msg = err?.message || '';
      const userMsg = msg.includes('balance too low') || msg.includes('Balance: 0')
        ? 'No spendable private balance. Shield funds first, then wait for sync to complete.'
        : msg;
      toast.error('Unshield failed', { description: userMsg });
      setStep('input');
    } finally {
      setIsProcessing(false);
    }
  }, [address, wallet, amount, chainId, embeddedWallet, currentBalance, currentSpendable, isPending, sendTransaction, refreshBalances, resolvedRecipient, isSendingToOther, isValidCustomAddress]);

  const resetDialog = () => {
    setAmount('');
    setStep('input');
    setIsProcessing(false);
    setProofData(null);
    setShowProofDetails(false);
    setTxHash(null);
    setRecipientMode('self');
    setCustomRecipient('');
    setSelectedTokenId('USDC');
    setShowTokenDropdown(false);
  };

  const parsedAmount = parseFloat(amount) || 0;
  const hasValidRecipient = recipientMode === 'self' || isValidCustomAddress;
  const isDisabled = !amount || !wallet || parsedAmount <= 0 || parsedAmount > currentSpendable || isProcessing || !hasValidRecipient;

  const provingSteps = [
    { id: 'proving', label: 'Generating Groth16 SNARK Proof', sublabel: 'Computing zero-knowledge witness & proof on BN128 curve' },
    { id: 'verifying', label: 'Verifying Proof On-Chain', sublabel: 'Simulating transact() via eth_call pre-check' },
    { id: 'sending', label: 'Broadcasting Transaction', sublabel: 'Submitting via gas-sponsored UserOperation' },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetDialog(); onOpenChange(v); }}>
      <DialogContent className="w-[calc(100vw-32px)] sm:w-full sm:max-w-[440px] p-0 overflow-hidden border border-[#2a2a2a] dark:border-[#2a2a2a] rounded-[24px] bg-white dark:bg-[#111111] shadow-[0px_32px_64px_-16px_rgba(0,0,0,0.35)]">

        {step === 'done' ? (
          <div className="p-5 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-[#c8ff00] to-[#b8ef00] flex items-center justify-center shadow-[0_4px_12px_rgba(200,255,0,0.3)]">
              <CheckCircle2 className="h-6 w-6 text-[#1a1a1a]" />
            </div>

            <div className="bg-[#fafafa] dark:bg-[#151515] border border-[#e0e0e0] dark:border-[#2a2a2a] rounded-[16px] overflow-hidden shadow-sm">
              <div className="p-4">
                <h3 className="text-[16px] font-bold text-[#1a1a1a] dark:text-white pb-2 border-b border-[#e0e0e0] dark:border-[#2a2a2a]">
                  {isSendingToOther ? 'Private Payment Sent' : 'Funds Unshielded'}
                </h3>
                <div className="pt-3 pb-0">
                  <div className="text-[24px] font-bold text-[#1a1a1a] dark:text-white tracking-tight leading-none text-center flex justify-center items-baseline gap-1.5">
                    {amount} <span className="text-[#c8ff00] text-[16px]">{selectedToken.symbol}</span>
                  </div>
                  <p className="text-[12px] text-[#888] mt-1.5">
                    {isSendingToOther
                      ? <>sent securely to <span className="font-mono text-[#1a1a1a] dark:text-[#ccc]">{customRecipient.slice(0, 6)}...{customRecipient.slice(-4)}</span></>
                      : <>withdrawn safely to public wallet</>
                    }
                  </p>
                </div>
              </div>

              {proofData && (
                <div className="border-t border-[#e0e0e0] dark:border-[#2a2a2a] bg-white dark:bg-[#111]">
                  <button
                    onClick={() => setShowProofDetails(!showProofDetails)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#fafafa] dark:hover:bg-[#1a1a1a] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <ZkProofIcon className={`h-3.5 w-3.5 ${showProofDetails ? 'text-[#c8ff00]' : 'text-[#888] dark:text-[#666]'}`} />
                      <span className={`text-[12px] font-bold ${showProofDetails ? 'text-[#1a1a1a] dark:text-white' : 'text-[#666] dark:text-[#aaa]'}`}>View SNARK Proof</span>
                    </div>
                    {showProofDetails ? <ChevronUp className="h-3.5 w-3.5 text-[#1a1a1a] dark:text-white" /> : <ChevronDown className="h-3.5 w-3.5 text-[#888]" />}
                  </button>
                  {showProofDetails && (
                    <div className="px-3 pb-3 text-left border-t border-[#e0e0e0] dark:border-[#2a2a2a] pt-3">
                      <ProofDetailsPanel proof={proofData} onClose={() => setShowProofDetails(false)} />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2.5 pt-0.5">
              {txHash && (
                <a
                  href={`https://arbiscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] font-bold text-[#c8ff00] hover:underline"
                >
                  View on Arbiscan <span className="text-[14px]">&rarr;</span>
                </a>
              )}

              <button
                onClick={() => { resetDialog(); onOpenChange(false); }}
                className="w-full py-3 rounded-xl bg-[#c8ff00] hover:bg-[#b8ef00] text-[#1a1a1a] font-bold text-[14px] shadow-[0_4px_12px_rgba(200,255,0,0.15)] transition-all"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 pt-5 pb-3 border-b border-[#1a1a1a]/10 dark:border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 text-white rounded-[12px] bg-gradient-to-br from-[#1a1a1a] to-[#333] flex items-center justify-center shadow-sm">
                  <WithdrawIcon className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-[#1a1a1a] dark:text-white tracking-tight">Send {selectedToken.symbol}</h2>
                  <p className="text-[11px] text-[#999]">Transfer to any wallet address</p>
                </div>
              </div>
            </div>

            <div className="px-4 pb-4 pt-3 space-y-3 overflow-y-auto max-h-[80vh] sm:max-h-[calc(85vh-76px)]">
              {/* Empty / pending balance notice */}
              {currentSpendable === 0 && step === 'input' && (
                <div className="flex items-start gap-3 py-3 px-3 rounded-2xl border-2 border-dashed border-[#e0e0e0] dark:border-[#333] bg-[#fafafa] dark:bg-[#151515]">
                  <div className="w-10 h-10 shrink-0 rounded-xl bg-[#c8ff00]/15 flex items-center justify-center">
                    <LockShieldIcon className="h-5 w-5 text-[#7cb518]" />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col items-start text-left">
                    {isPending ? (
                      <>
                        <div className="flex items-center justify-between w-full">
                          <p className="text-[13px] font-bold text-[#1a1a1a] dark:text-white">Funds pending</p>
                          <button
                            onClick={() => refreshBalances()}
                            className="px-2 py-1 rounded bg-[#c8ff00]/10 text-[10px] font-bold text-[#7cb518] hover:bg-[#c8ff00]/20 transition-colors"
                          >
                            Refresh
                          </button>
                        </div>
                        <p className="text-[11px] text-[#888] mt-1 leading-relaxed pr-2">
                          {currentBalance.toFixed(2)} shielded but awaiting POI scan (~2m).
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-[13px] font-bold text-[#1a1a1a] dark:text-white mt-0.5">No shielded balance</p>
                        <p className="text-[11px] text-[#888] mt-0.5">Shield tokens first to withdraw.</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Token + Amount card (hidden during processing) */}
              {step === 'input' && (
                <>
                  <div className="rounded-2xl border-2 border-[#1a1a1a]/10 dark:border-[#333] bg-[#fafafa] dark:bg-[#151515] overflow-visible">
                    {/* Token selector header */}
                    <div className="relative" ref={dropdownRef}>
                      <button
                        type="button"
                        onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                        className="w-full flex items-center justify-between px-3 pt-3 pb-2.5 hover:bg-[#f5f5f5] dark:hover:bg-[#1a1a1a] transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-white dark:bg-[#1a1a1a] border border-[#1a1a1a]/8 dark:border-[#333] flex items-center justify-center shadow-sm">
                            <TokenIcon className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[14px] font-bold text-[#1a1a1a] dark:text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>{selectedToken.symbol}</span>
                              <ChevronDown className={`h-3 w-3 text-[#999] transition-transform duration-200 ${showTokenDropdown ? 'rotate-180' : ''}`} />
                            </div>
                            <span className="block text-[10px] text-[#999] font-medium">{selectedToken.name} · {selectedToken.network}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="block text-[14px] font-bold text-[#1a1a1a] dark:text-white" style={{ fontFamily: "'SF Mono', 'Fira Code', monospace" }}>{currentSpendable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          <span className="block text-[10px] text-[#999] font-medium">Available</span>
                          {isPending && (
                            <span className="block text-[9px] text-[#7cb518] font-medium mt-0.5">
                              +{(currentBalance - currentSpendable).toFixed(2)} pending
                            </span>
                          )}
                        </div>
                      </button>

                      {/* Dropdown */}
                      {showTokenDropdown && (
                        <div className="absolute left-0 right-0 top-full z-50 mx-3 mt-1 rounded-xl border border-[#e0e0e0] dark:border-[#2a2a2a] bg-white dark:bg-[#151515] shadow-[0_8px_24px_rgba(0,0,0,0.12)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                          {TOKEN_OPTIONS.map((tk) => {
                            const TkIcon = tk.icon;
                            const isSelected = tk.id === selectedTokenId;
                            const tkBalance = tk.id === 'USDC' ? spendableUsdc : tk.id === 'ETH' ? 0 : spendableUsdt;
                            return (
                              <button
                                key={tk.id}
                                type="button"
                                disabled={!tk.enabled}
                                onClick={() => {
                                  if (!tk.enabled) return;
                                  setSelectedTokenId(tk.id);
                                  setToken(tk.id === 'USDC' ? 'USDC' : 'USDT');
                                  setAmount('');
                                  setShowTokenDropdown(false);
                                }}
                                className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${!tk.enabled
                                  ? 'opacity-50 cursor-not-allowed'
                                  : isSelected
                                    ? 'bg-[#c8ff00]/10'
                                    : 'hover:bg-[#f5f5f5] dark:hover:bg-[#1a1a1a]'
                                  }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-full bg-white dark:bg-[#1a1a1a] border border-[#e8e8e8] dark:border-[#333] flex items-center justify-center">
                                    <TkIcon className="w-6 h-6" />
                                  </div>
                                  <div className="text-left">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[13px] font-bold text-[#1a1a1a] dark:text-white">{tk.symbol}</span>
                                      {tk.comingSoon && (
                                        <span className="px-1.5 py-0.5 rounded-md bg-[#c8ff00]/20 text-[8px] font-bold text-[#7cb518] uppercase tracking-wide">Soon</span>
                                      )}
                                      {isSelected && (
                                        <Check className="h-3.5 w-3.5 text-[#7cb518]" />
                                      )}
                                    </div>
                                    <span className="block text-[10px] text-[#999] font-medium">{tk.name} · {tk.network}</span>
                                  </div>
                                </div>
                                <span className="text-[13px] font-bold text-[#1a1a1a] dark:text-white" style={{ fontFamily: "'SF Mono', 'Fira Code', monospace" }}>
                                  {tkBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="mx-4 h-px bg-[#1a1a1a]/8 dark:bg-[#333]" />

                    {/* Amount input */}
                    <div className="p-3 space-y-2.5">
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          disabled={isProcessing}
                          className="w-full bg-white dark:bg-[#1a1a1a] border border-[#1a1a1a]/10 dark:border-[#333] focus:border-[#1a1a1a] dark:focus:border-[#c8ff00] rounded-[10px] px-3.5 py-3 text-xl font-bold text-[#1a1a1a] dark:text-white placeholder:text-[#d1d1d1] dark:placeholder:text-[#444] outline-none transition-colors disabled:opacity-50" style={{ fontFamily: "'SF Mono', 'Fira Code', monospace" }}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-[#f0f0f0] dark:bg-[#222] px-2 py-1 rounded-md">
                          <TokenIcon className="w-3.5 h-3.5" />
                          <span className="text-[11px] font-bold text-[#555] dark:text-[#aaa]">{selectedToken.symbol}</span>
                        </div>
                      </div>

                      <div className="flex gap-1.5">
                        {[0.25, 0.5, 0.75, 1].map((pct) => (
                          <button
                            key={pct}
                            onClick={() => setAmount((currentSpendable * pct).toFixed(selectedTokenId === 'ETH' ? 6 : 2))}
                            disabled={currentSpendable === 0}
                            className="flex-1 py-1.5 rounded-md border border-[#1a1a1a]/8 dark:border-[#333] bg-white dark:bg-[#1a1a1a] text-[10px] font-bold text-[#666] dark:text-[#888] hover:border-[#1a1a1a] dark:hover:border-[#c8ff00] hover:text-[#1a1a1a] dark:hover:text-[#c8ff00] transition-all disabled:opacity-30"
                          >
                            {pct === 1 ? 'MAX' : `${pct * 100}%`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Recipient selector */}
                  <div className="rounded-xl border border-[#1a1a1a]/10 dark:border-[#333] bg-[#fafafa] dark:bg-[#151515] overflow-hidden">
                    <div className="px-3 pt-3 pb-2.5">
                      <span className="block text-[10px] font-bold text-[#999] uppercase tracking-wider mb-2">Send to</span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => { setRecipientMode('self'); setCustomRecipient(''); }}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[10px] border text-[11px] font-bold transition-all ${recipientMode === 'self'
                            ? 'border-[#c8ff00] bg-[#c8ff00]/10 text-[#1a1a1a] dark:text-white'
                            : 'border-[#1a1a1a]/8 dark:border-[#333] bg-white dark:bg-[#1a1a1a] text-[#888] hover:border-[#1a1a1a]/20 dark:hover:border-[#555]'
                            }`}
                        >
                          <WalletIcon className="h-3 w-3" />
                          My Wallet
                        </button>
                        <button
                          onClick={() => setRecipientMode('other')}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[10px] border text-[11px] font-bold transition-all ${recipientMode === 'other'
                            ? 'border-[#c8ff00] bg-[#c8ff00]/10 text-[#1a1a1a] dark:text-white'
                            : 'border-[#1a1a1a]/8 dark:border-[#333] bg-white dark:bg-[#1a1a1a] text-[#888] hover:border-[#1a1a1a]/20 dark:hover:border-[#555]'
                            }`}
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
                          Other Address
                        </button>
                      </div>
                    </div>

                    {recipientMode === 'self' && address && (
                      <div className="mx-4 mb-3.5 px-3 py-2.5 rounded-lg bg-white dark:bg-[#1a1a1a] border border-[#e8e8e8] dark:border-[#2a2a2a]">
                        <span className="block text-[9px] font-bold text-[#999] uppercase tracking-wider">Connected Wallet</span>
                        <span className="block text-[11px] font-mono text-[#555] dark:text-[#aaa] mt-0.5">{address.slice(0, 8)}...{address.slice(-6)}</span>
                      </div>
                    )}

                    {recipientMode === 'other' && (
                      <div className="mx-3 mb-3 space-y-1.5">
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="0x..."
                            value={customRecipient}
                            onChange={(e) => setCustomRecipient(e.target.value.trim())}
                            className={`w-full bg-white dark:bg-[#1a1a1a] border rounded-[10px] px-3 py-2 text-[12px] font-mono text-[#1a1a1a] dark:text-white placeholder:text-[#ccc] dark:placeholder:text-[#444] outline-none transition-colors ${customRecipient.length > 0 && !isValidCustomAddress
                              ? 'border-red-400 focus:border-red-500'
                              : isValidCustomAddress
                                ? 'border-[#22c55e]/50 focus:border-[#22c55e]'
                                : 'border-[#1a1a1a]/10 dark:border-[#333] focus:border-[#c8ff00]'
                              }`}
                          />
                          {isValidCustomAddress && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <Check className="h-4 w-4 text-[#22c55e]" />
                            </div>
                          )}
                        </div>
                        {customRecipient.length > 0 && !isValidCustomAddress && (
                          <p className="text-[10px] text-red-500 font-medium px-1">Enter a valid Ethereum address (0x...)</p>
                        )}
                        {isValidCustomAddress && (
                          <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-[#c8ff00]/8 border border-[#c8ff00]/20">
                            <LockShieldIcon className="h-3.5 w-3.5 text-[#7cb518] mt-0.5 flex-shrink-0" />
                            <p className="text-[10px] text-[#7cb518] leading-relaxed font-medium">
                              Sender-private — Funds arrive from the private pool.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Flow indicator */}
                  <div className="flex items-center justify-center gap-1.5 py-0">
                    <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#c8ff00]/40 bg-[#c8ff00]/8">
                      <LockShieldIcon className="h-3 w-3 text-[#7cb518]" />
                      <span className="text-[10px] font-semibold text-[#7cb518]">Private</span>
                    </div>
                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[#c8ff00] shadow-[0_2px_8px_rgba(200,255,0,0.3)] shrink-0">
                      <svg className="w-3 h-3 text-[#1a1a1a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#e0e0e0] dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] min-w-0">
                      {isSendingToOther ? (
                        <>
                          <svg className="h-3 w-3 text-[#999] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                          <span className="text-[10px] font-semibold text-[#666] dark:text-[#888] truncate">
                            {isValidCustomAddress ? `${customRecipient.slice(0, 6)}...` : 'Recipient'}
                          </span>
                        </>
                      ) : (
                        <>
                          <WalletIcon className="h-3 w-3 text-[#999] shrink-0" />
                          <span className="text-[10px] font-semibold text-[#666] dark:text-[#888]">My Wallet</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg border border-[#e0e0e0] dark:border-[#2a2a2a] bg-[#fafafa] dark:bg-[#151515]">
                    <svg className="h-3 w-3 text-[#999] mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                    <p className="text-[9px] text-[#888] leading-relaxed">
                      {isSendingToOther
                        ? 'Funds are sent from the privacy pool. The recipient sees the amount but not the sender.'
                        : 'Unshielding generates a SNARK proof to withdraw privately. Amount becomes visible on-chain.'}
                    </p>
                  </div>
                </>
              )}

              {/* SNARK Proof Generation Progress */}
              {/* SNARK Proof Generation Progress */}
              {(step === 'proving' || step === 'verifying' || step === 'sending') && (
                <div className="py-2 space-y-8 animate-in fade-in zoom-in-95 duration-500">
                  <div className="text-center space-y-2">
                    <p className="text-[16px] font-bold text-[#1a1a1a] dark:text-white">
                      {step === 'proving' ? 'Generating SNARK Proof' : step === 'verifying' ? 'Verifying Proof On-Chain' : 'Broadcasting Transaction'}
                    </p>
                    <p className="text-[12px] text-[#888]">
                      {isSendingToOther
                        ? <>Sending {amount} {selectedToken.symbol} privately to <span className="font-mono">{customRecipient.slice(0, 6)}...{customRecipient.slice(-4)}</span></>
                        : <>Withdrawing {amount} {selectedToken.symbol} to public wallet</>}
                    </p>
                  </div>

                  {/* Enhanced 3D ZK Proof Visual */}
                  <div className="relative w-48 h-48 mx-auto my-6" style={{ perspective: '1200px' }}>
                    {/* Background Ambient Glow */}
                    <div className="absolute inset-0 bg-[#c8ff00]/10 blur-3xl rounded-full mix-blend-screen animate-pulse" />

                    {/* Outer Orbiting Data Ring */}
                    <div className="absolute inset-0 rounded-full border border-[rgba(200,255,0,0.15)] animate-[spin_10s_linear_infinite]" style={{ transformStyle: 'preserve-3d', transform: 'rotateX(70deg) rotateY(15deg)' }}>
                      <div className="absolute top-0 left-1/2 w-2 h-2 -ml-1 bg-[#c8ff00] rounded-full shadow-[0_0_12px_#c8ff00] animate-[ping_2s_ease-in-out_infinite]" />
                      <div className="absolute bottom-0 right-1/4 w-1.5 h-1.5 -mb-0.5 bg-[#c8ff00] rounded-full shadow-[0_0_8px_#c8ff00]" />
                    </div>

                    {/* Middle Processing Ring */}
                    <div className="absolute inset-3 rounded-full border-[2.5px] border-dashed border-[#c8ff00]/30 animate-[spin_6s_linear_infinite_reverse]" style={{ transformStyle: 'preserve-3d', transform: 'rotateX(60deg) rotateY(-15deg) translateZ(15px)' }} />

                    {/* Inner Geometry Ring */}
                    <div className="absolute inset-7 rounded-full border-[2px] border-[#c8ff00]/50 animate-[spin_4s_linear_infinite]" style={{ transformStyle: 'preserve-3d', transform: 'rotateX(45deg) rotateY(10deg) translateZ(25px)' }}>
                      <div className="absolute bottom-0 left-1/2 w-4 h-[2.5px] -ml-2 bg-[#c8ff00] shadow-[0_0_10px_#c8ff00]" />
                    </div>

                    {/* Floating ZK Core Layer */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ transformStyle: 'preserve-3d', transform: 'translateZ(50px)' }}>
                      <div className="relative w-[72px] h-[72px] animate-[bounce_4s_ease-in-out_infinite]">
                        {/* 3D Glass Block */}
                        <div className="absolute inset-0 rounded-[1.2rem] bg-[#111] shadow-[inset_1px_1px_3px_rgba(255,255,255,0.1),0_12px_30px_-5px_rgba(200,255,0,0.3)] flex items-center justify-center transform -rotate-12 hover:rotate-0 hover:scale-105 transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] border border-[#c8ff00]/40">
                          {step === 'sending' ? (
                            <Loader2 className="h-9 w-9 text-[#c8ff00] drop-shadow-[0_2px_2px_rgba(0,0,0,0.25)] animate-[spin_6s_linear_infinite]" />
                          ) : (
                            <ZkProofIcon className="h-9 w-9 text-[#c8ff00] rotate-12 drop-shadow-[0_2px_2px_rgba(0,0,0,0.25)] transition-transform duration-700 hover:rotate-0" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Floating Tech Particles */}
                    <div className="absolute top-1/4 left-1/4 w-1.5 h-1.5 rounded-full bg-[#c8ff00] animate-[ping_3s_ease-in-out_infinite] opacity-80" />
                    <div className="absolute bottom-1/4 right-[20%] w-2 h-2 rounded-full bg-[#c8ff00] animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_8px_#c8ff00]" style={{ animationDelay: '1s' }} />
                  </div>

                  <div className="space-y-1.5 px-2">
                    {provingSteps.map((ps, i) => {
                      const stepOrder = ['proving', 'verifying', 'sending'];
                      const currentIdx = stepOrder.indexOf(step);
                      const psIdx = stepOrder.indexOf(ps.id);
                      const isActive = ps.id === step;
                      const isDone = psIdx < currentIdx;

                      return (
                        <div
                          key={ps.id}
                          className={`flex items-start gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${isActive
                            ? 'bg-[#c8ff00]/10 border border-[#c8ff00]/30'
                            : isDone
                              ? 'bg-[#c8ff00]/5 border border-[#c8ff00]/20'
                              : 'bg-transparent border border-transparent opacity-40'
                            }`}
                        >
                          <div className="mt-0.5 flex-shrink-0">
                            {isDone ? (
                              <div className="w-5 h-5 rounded-full bg-[#c8ff00] flex items-center justify-center shadow-sm">
                                <svg className="w-3.5 h-3.5 text-[#1a1a1a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                              </div>
                            ) : isActive ? (
                              <div className="w-5 h-5 rounded-full border-2 border-[#c8ff00] border-t-[#c8ff00]/20 animate-spin" />
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2 border-[#d1d1d1] dark:border-[#444]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className={`block text-[13px] font-bold ${isActive ? 'text-[#1a1a1a] dark:text-white' :
                              isDone ? 'text-[#1a1a1a] dark:text-white' :
                                'text-[#999]'
                              }`}>{ps.label}</span>
                            <span className={`block text-[11px] mt-0.5 ${isActive ? 'text-[#888]' : isDone ? 'text-[#666] dark:text-[#aaa]' : 'text-[#ccc] dark:text-[#555]'
                              }`}>{ps.sublabel}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {step === 'proving' && (
                    <div className="px-1">
                      <div className="w-full h-1.5 rounded-full bg-[#e8e8e8] dark:bg-[#222] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#c8ff00] to-[#a8df00] transition-all duration-500 ease-out"
                          style={{ width: `${Math.max(5, (proofProgress || 0) * 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-[#999] mt-1.5 text-center">
                        {proofStage || 'Computing zero-knowledge witness...'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action button - Pinned at bottom outside scroll area */}
            {step === 'input' && (
              <div className="px-4 pb-3 pt-0 shrink-0 bg-white dark:bg-[#0a0a0a]">
                <button
                  onClick={handleUnshield}
                  disabled={isDisabled}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#c8ff00] hover:bg-[#bbee00] text-[#1a1a1a] font-bold text-[13px] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_4px_12px_rgba(200,255,0,0.2)] hover:shadow-[0_4px_20px_rgba(200,255,0,0.4)]"
                >
                  {isSendingToOther ? (
                    <>
                      <LockShieldIcon className="h-[18px] w-[18px]" />
                      Send {parsedAmount > 0 ? amount : '0'} {selectedToken.symbol} Privately
                    </>
                  ) : (
                    <>
                      <WithdrawIcon className="h-[18px] w-[18px]" />
                      Withdraw {parsedAmount > 0 ? amount : '0'} {selectedToken.symbol}
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
