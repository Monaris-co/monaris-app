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
const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || ''

async function exchangePrivyToken(
  privyToken: string,
  walletAddress: string,
  appId: string,
): Promise<{ token: string; expires_in: number } | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/privy-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        privy_token: privyToken,
        wallet_address: walletAddress,
        app_id: appId,
      }),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export function SupabaseAuthProvider({ children, appId }: { children: React.ReactNode; appId?: string }) {
  const { authenticated, getAccessToken } = usePrivy()
  const { address } = usePrivyAccount()
  const [isReady, setIsReady] = useState(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const exchangingRef = useRef(false)
  const lastAddressRef = useRef<string | null>(null)

  const resolvedAppId = appId || PRIVY_APP_ID

  const doExchange = useCallback(async () => {
    if (!authenticated || !address || !isSupabaseConfigured() || exchangingRef.current) return
    exchangingRef.current = true
    try {
      const privyToken = await getAccessToken()
      if (!privyToken) {
        clearSupabaseAuth()
        setIsReady(false)
        return
      }

      const result = await exchangePrivyToken(privyToken, address, resolvedAppId)
      if (!result?.token) {
        clearSupabaseAuth()
        setIsReady(false)
        return
      }

      setSupabaseAuth(result.token)
      lastAddressRef.current = address
      setIsReady(true)

      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      const refreshMs = (result.expires_in || 3600) * 0.8 * 1000
      refreshTimer.current = setTimeout(() => {
        exchangingRef.current = false
        doExchange()
      }, refreshMs)
    } catch (err) {
      console.error('[SupabaseAuth] Exchange failed:', err)
      clearSupabaseAuth()
      setIsReady(false)
    } finally {
      exchangingRef.current = false
    }
  }, [authenticated, address, getAccessToken, resolvedAppId])

  useEffect(() => {
    if (authenticated && address) {
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
    }
  }, [authenticated, address, doExchange])

  return (
    <SupabaseAuthContext.Provider value={{ isReady }}>
      {children}
    </SupabaseAuthContext.Provider>
  )
}
