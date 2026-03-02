import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

const STORAGE_KEY = 'monaris_invite_verified';

function getValidCodes(): string[] {
  const raw = import.meta.env.VITE_INVITE_CODES || '';
  if (!raw.trim()) return [];
  return raw
    .split(',')
    .map((c: string) => c.trim().toUpperCase())
    .filter(Boolean);
}

function isAlreadyVerified(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

interface InviteGateProps {
  children: React.ReactNode;
}

export function InviteGate({ children }: InviteGateProps) {
  const validCodes = getValidCodes();

  // If no codes are configured, skip the gate entirely
  if (validCodes.length === 0) return <>{children}</>;

  const [verified, setVerified] = useState(isAlreadyVerified);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!verified) inputRef.current?.focus();
  }, [verified]);

  if (verified) return <>{children}</>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const entered = code.trim().toUpperCase();
    if (!entered) {
      setError('Please enter an invite code');
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      return;
    }

    if (validCodes.includes(entered)) {
      setSuccess(true);
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch {}
      setTimeout(() => setVerified(true), 800);
    } else {
      setError('Invalid invite code');
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      setCode('');
      inputRef.current?.focus();
    }
  };

  return (
    <AnimatePresence>
      {!verified && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0a] overflow-hidden"
        >
          {/* Ambient glow effects */}
          <div className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full bg-[#c8ff00]/8 blur-[120px] pointer-events-none" />
          <div className="absolute -bottom-32 -left-32 h-[350px] w-[350px] rounded-full bg-[#c8ff00]/5 blur-[100px] pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-white/[0.015] blur-[80px] pointer-events-none" />

          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
              backgroundSize: '60px 60px',
            }}
          />

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative w-full max-w-md mx-4"
          >
            {/* Card */}
            <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-8 shadow-2xl">
              {/* Top accent line */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-24 bg-gradient-to-r from-transparent via-[#c8ff00]/50 to-transparent" />

              {/* Title */}
              <div className="text-center mb-6">
                <h1 className="text-xl font-semibold text-white mb-2">
                  {success ? 'Welcome to Monaris' : 'MonarisEarly Access Only'}
                </h1>
                <p className="text-sm text-white/50 leading-relaxed">
                  {success
                    ? 'Your access has been verified'
                    : 'Monaris is currently invite-only. Enter your invite code to continue.'}
                </p>
              </div>

              {/* Form */}
              {!success && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <motion.div
                    animate={shaking ? { x: [-8, 8, -6, 6, -3, 3, 0] } : {}}
                    transition={{ duration: 0.4 }}
                  >
                    <input
                      ref={inputRef}
                      type="text"
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value.toUpperCase());
                        setError('');
                      }}
                      placeholder="Enter invite code"
                      spellCheck={false}
                      autoComplete="off"
                      className={`
                        w-full h-12 px-4 rounded-xl text-sm font-mono tracking-widest text-center
                        bg-white/[0.05] border text-white placeholder-white/25
                        focus:outline-none focus:ring-2 focus:ring-[#c8ff00]/30 focus:border-[#c8ff00]/40
                        transition-all duration-200
                        ${error ? 'border-red-500/50 focus:ring-red-500/20' : 'border-white/[0.08]'}
                      `}
                    />
                  </motion.div>

                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs text-red-400 text-center"
                    >
                      {error}
                    </motion.p>
                  )}

                  <button
                    type="submit"
                    className="
                      w-full h-12 rounded-xl text-sm font-semibold
                      bg-[#c8ff00] text-black
                      hover:bg-[#d4ff33] active:bg-[#b8ef00]
                      transition-all duration-200
                      flex items-center justify-center gap-2
                      shadow-[0_0_20px_rgba(200,255,0,0.15)]
                      hover:shadow-[0_0_30px_rgba(200,255,0,0.25)]
                    "
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              )}

              {success && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-center"
                >
                  <div className="h-1 w-16 rounded-full bg-[#c8ff00]/30 overflow-hidden">
                    <motion.div
                      initial={{ x: '-100%' }}
                      animate={{ x: '100%' }}
                      transition={{ duration: 0.8, ease: 'easeInOut' }}
                      className="h-full w-full bg-[#c8ff00]"
                    />
                  </div>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-center gap-1.5 mt-6 text-xs text-white/25">
              <Sparkles className="h-3 w-3" />
              <span>Powered by Monaris Protocol</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
