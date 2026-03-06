import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, ArrowRight, Loader2, Copy, CheckCircle2, Sparkles, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

const STORAGE_KEY = 'pace_premium_unlocked';
const PAYMENT_ADDRESS = '247qzSwrZY4543YSUGb1drxDmqw8zoemTVd1iqhaY4cX';
const PAYMENT_AMOUNT_SOL = 1; // Example amount

function isPremiumUnlocked(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

interface PremiumGateProps {
    children: React.ReactNode;
}

export function PremiumGate({ children }: PremiumGateProps) {
    const [unlocked, setUnlocked] = useState(isPremiumUnlocked);
    const [isVerifying, setIsVerifying] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showQR, setShowQR] = useState(false);
    const [reference, setReference] = useState<any>(null);

    useEffect(() => {
        // Prevent scrolling when gate is open
        if (!unlocked) {
            document.body.style.overflow = 'hidden';
            // Dynamically import @solana/web3.js to generate a unique tracking reference
            import('@solana/web3.js').then(({ Keypair }) => {
                if (!reference) setReference(Keypair.generate().publicKey);
            }).catch(console.error);
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [unlocked]);

    if (unlocked) return <>{children}</>;

    const handleCopy = () => {
        navigator.clipboard.writeText(PAYMENT_ADDRESS);
        setCopied(true);
        toast.success('Payment address copied!');
        setTimeout(() => setCopied(false), 2000);
    };

    const handleVerify = async () => {
        setIsVerifying(true);

        try {
            if (!reference) throw new Error("Reference not initialized");
            const { Connection } = await import('@solana/web3.js');
            // Use Solana mainnet directly (or replace with your own RPC)
            const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

            // Find any transactions that pinged our unique reference key
            const signatures = await connection.getSignaturesForAddress(reference, { limit: 1 });

            if (signatures.length > 0) {
                setUnlocked(true);
                try {
                    localStorage.setItem(STORAGE_KEY, 'true');
                } catch { }

                toast.success('Payment verified!', {
                    description: 'Welcome to PACE Premium. Your account has been upgraded.',
                });
            } else {
                toast.error('Payment not detected', {
                    description: 'Please ensure the transaction has been sent and confirmed on the Solana network.'
                });
            }
        } catch (err) {
            console.error("Verification error:", err);
            toast.error('Verification failed', {
                description: 'Failed to verify. Ensure the transaction is confirmed.'
            });
        } finally {
            setIsVerifying(false);
        }
    };

    const solanaPayUrl = `solana:${PAYMENT_ADDRESS}?amount=${PAYMENT_AMOUNT_SOL}&label=PACE%20Premium${reference ? `&reference=${reference.toBase58()}` : ''}`;

    return (
        <AnimatePresence>
            {!unlocked && (
                <>
                    {/* Blurred Background */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md"
                    />

                    {/* Modal Container */}
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -20 }}
                            transition={{ duration: 0.4, type: "spring", bounce: 0.3 }}
                            className="relative w-full max-w-md bg-white dark:bg-[#111111] rounded-[32px] shadow-2xl overflow-hidden border border-[#e8e8e8] dark:border-[#2a2a2a]"
                        >
                            {/* Premium Header Gradient */}
                            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-br from-[#c8ff00]/40 via-[#c8ff00]/10 to-transparent pointer-events-none" />

                            <div className="relative p-8 pt-10 text-center">
                                {/* Crown Icon */}
                                <div className="mx-auto w-16 h-16 bg-[#c8ff00]/20 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(200,255,0,0.3)]">
                                    <Crown className="w-8 h-8 text-[#98c200] dark:text-[#c8ff00]" />
                                </div>

                                <h1 className="text-2xl font-bold text-[#1a1a1a] dark:text-white mb-2">
                                    PACE Premium
                                </h1>
                                <p className="text-sm text-[#666] dark:text-[#aaa] mb-8 leading-relaxed">
                                    You've reached the dashboard! To continue exploring and unlock all advanced protocol features, upgrade to PACE Premium.
                                </p>

                                {/* Amount to Pay */}
                                <div className="mb-6 inline-flex items-baseline gap-2">
                                    <span className="text-4xl font-bold text-[#1a1a1a] dark:text-white">{PAYMENT_AMOUNT_SOL}</span>
                                    <span className="text-lg font-semibold text-[#888]">SOL</span>
                                </div>

                                {/* Main Action Buttons */}
                                {!showQR ? (
                                    <div className="space-y-4">
                                        <button
                                            onClick={() => setShowQR(true)}
                                            className="w-full h-14 bg-[#c8ff00] hover:bg-[#b8ef00] text-[#1a1a1a] rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all shadow-[0_8px_20px_rgba(200,255,0,0.25)] hover:shadow-[0_8px_25px_rgba(200,255,0,0.35)] hover:-translate-y-0.5 active:translate-y-0"
                                        >
                                            Buy Now
                                            <ArrowRight className="w-5 h-5" />
                                        </button>

                                        <a
                                            href={solanaPayUrl}
                                            className="w-full h-14 bg-[#f5f5f5] dark:bg-[#1a1a1a] hover:bg-[#eaeaea] dark:hover:bg-[#222] text-[#1a1a1a] dark:text-white rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-all border border-[#e8e8e8] dark:border-[#333]"
                                        >
                                            Pay with Solana Wallet
                                        </a>
                                    </div>
                                ) : (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        className="space-y-6"
                                    >
                                        {/* QR Code */}
                                        <div className="bg-white p-4 rounded-[20px] shadow-sm inline-block border border-[#eee]">
                                            <QRCodeSVG
                                                value={solanaPayUrl}
                                                size={180}
                                                fgColor="#1a1a1a"
                                                bgColor="#ffffff"
                                                level="H"
                                                imageSettings={{
                                                    src: "https://cryptologos.cc/logos/solana-sol-logo.png",
                                                    x: undefined,
                                                    y: undefined,
                                                    height: 40,
                                                    width: 40,
                                                    excavate: true,
                                                }}
                                            />
                                        </div>

                                        {/* Address Box */}
                                        <div className="bg-[#f9f9f9] dark:bg-[#1a1a1a] border border-[#eee] dark:border-[#333] rounded-xl p-3 flex items-center justify-between gap-3 text-left">
                                            <div className="overflow-hidden">
                                                <p className="text-[10px] font-bold text-[#888] uppercase tracking-wider mb-1">Payment Address</p>
                                                <p className="text-xs font-mono text-[#1a1a1a] dark:text-white truncate">
                                                    {PAYMENT_ADDRESS}
                                                </p>
                                            </div>
                                            <button
                                                onClick={handleCopy}
                                                className="p-2.5 rounded-lg bg-white dark:bg-[#222] hover:bg-[#f0f0f0] dark:hover:bg-[#333] transition-colors shrink-0 shadow-sm border border-[#e8e8e8] dark:border-[#444]"
                                            >
                                                {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-[#666] dark:text-[#aaa]" />}
                                            </button>
                                        </div>

                                        <button
                                            onClick={handleVerify}
                                            disabled={isVerifying}
                                            className="w-full h-14 bg-[#c8ff00] hover:bg-[#b8ef00] text-[#1a1a1a] rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all shadow-[0_8px_20px_rgba(200,255,0,0.2)] disabled:opacity-70 disabled:cursor-not-allowed"
                                        >
                                            {isVerifying ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    Verifying on-chain...
                                                </>
                                            ) : (
                                                'I have completed the payment'
                                            )}
                                        </button>

                                        <button
                                            onClick={() => setShowQR(false)}
                                            className="text-sm text-[#888] hover:text-[#1a1a1a] dark:hover:text-white transition-colors"
                                        >
                                            Back
                                        </button>
                                    </motion.div>
                                )}

                                <div className="mt-8 pt-6 border-t border-[#f0f0f0] dark:border-[#222] flex items-center justify-center gap-1.5 text-xs text-[#999]">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>Powered by Solana Pay</span>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
