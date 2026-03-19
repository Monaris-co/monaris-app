import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { usePrivyAccount } from '@/hooks/usePrivyAccount'
import { setSupabaseAuth, clearSupabaseAuth, isSupabaseConfigured } from '@/lib/supabase'

interface SupabaseAuthContextValue {
  isReady: boolean
}

const SupabaseAuthContext = createContext<SupabaseAuthContextValue>({ isReady: false })

export function useSupabaseReady() {
  return useContext(SupabaseAuthContext).isReady
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || ''

type ExchangeResult =
  | { ok: true; token: string; expires_in: number }
  | { ok: false; fatalConfig?: boolean }

let loggedJwtSecretHint = false

async function exchangePrivyToken(
  privyToken: string,
  walletAddress: string,
  appId: string,
): Promise<ExchangeResult> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/privy-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        privy_token: privyToken,
        wallet_address: walletAddress,
        app_id: appId,
      }),
    })
    const text = await res.text().catch(() => '')
    if (!res.ok) {
      console.error('[SupabaseAuth] Edge function error:', res.status, text)
      try {
        const body = JSON.parse(text) as { code?: string; hint?: string; error?: string }
        if (body.code === 'missing_jwt_secret' && body.hint) {
          if (!loggedJwtSecretHint) {
            loggedJwtSecretHint = true
            console.error(
              '\n%c[Monaris] Supabase Edge Function is missing JWT signing secret',
              'color:#ef4444;font-weight:bold;font-size:12px',
            )
            console.error(
              '%cSet Edge secret SUPABASE_JWT_SECRET (Dashboard) or JWT_SECRET (CLI). supabase CLI blocks SUPABASE_* names.',
              'color:#f97316',
            )
            console.error(body.hint)
          }
          return { ok: false, fatalConfig: true }
        }
      } catch {
        /* not JSON */
      }
      return { ok: false }
    }
    const data = JSON.parse(text) as { token?: string; expires_in?: number }
    if (!data?.token) return { ok: false }
    return { ok: true, token: data.token, expires_in: data.expires_in ?? 3600 }
  } catch (err) {
    console.error('[SupabaseAuth] Network error calling privy-auth:', err)
    return { ok: false }
  }
}

export function SupabaseAuthProvider({ children, appId }: { children: React.ReactNode; appId?: string }) {
  const { authenticated, ready, getAccessToken } = usePrivy()
  const { address } = usePrivyAccount()
  const [isReady, setIsReady] = useState(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const exchangingRef = useRef(false)
  const lastAddressRef = useRef<string | null>(null)
  const retryCount = useRef(0)

  const resolvedAppId = appId || PRIVY_APP_ID

  const doExchange = useCallback(async () => {
    if (!authenticated || !address || !isSupabaseConfigured() || exchangingRef.current) return
    exchangingRef.current = true
    try {
      const privyToken = await getAccessToken()
      if (!privyToken) {
        console.warn('[SupabaseAuth] No Privy token, retry', retryCount.current + 1)
        if (retryCount.current < 4) {
          retryCount.current++
          retryTimer.current = setTimeout(() => {
            exchangingRef.current = false
            doExchange()
          }, 1500 * retryCount.current)
        }
        return
      }

      const result = await exchangePrivyToken(privyToken, address, resolvedAppId)
      if (!result.ok) {
        if (result.fatalConfig) {
          // Retrying won't help until SUPABASE_JWT_SECRET is set on the Edge Function
          return
        }
        console.warn('[SupabaseAuth] No token from edge function, retry', retryCount.current + 1)
        if (retryCount.current < 4) {
          retryCount.current++
          retryTimer.current = setTimeout(() => {
            exchangingRef.current = false
            doExchange()
          }, 2000 * retryCount.current)
        }
        return
      }

      retryCount.current = 0
      setSupabaseAuth(result.token)
      lastAddressRef.current = address
      setIsReady(true)
      console.log('[SupabaseAuth] Authenticated for', address.slice(0, 10))

      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      const refreshMs = result.expires_in * 0.8 * 1000
      refreshTimer.current = setTimeout(() => {
        exchangingRef.current = false
        doExchange()
      }, refreshMs)
    } catch (err) {
      console.error('[SupabaseAuth] Exchange failed:', err)
    } finally {
      exchangingRef.current = false
    }
  }, [authenticated, address, getAccessToken, resolvedAppId])

  useEffect(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current)
    retryCount.current = 0

    if (ready && authenticated && address) {
      if (lastAddressRef.current !== address) {
        setIsReady(false)
        clearSupabaseAuth()
      }
      doExchange()
    } else {
      clearSupabaseAuth()
      setIsReady(false)
      lastAddressRef.current = null
    }
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [ready, authenticated, address, doExchange])

  return (
    <SupabaseAuthContext.Provider value={{ isReady }}>
      {children}
    </SupabaseAuthContext.Provider>
  )
}
