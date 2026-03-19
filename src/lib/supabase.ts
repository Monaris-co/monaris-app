import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const anonClient = createClient(supabaseUrl, supabaseAnonKey)
let authClient: SupabaseClient | null = null
let authVersion = 0
const authListeners = new Set<() => void>()

export function setSupabaseAuth(token: string) {
  authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  })
  authVersion++
  authListeners.forEach(fn => fn())
}

export function clearSupabaseAuth() {
  authClient = null
  authVersion++
  authListeners.forEach(fn => fn())
}

export function isSupabaseAuthenticated(): boolean {
  return authClient !== null
}

export function getAuthVersion(): number {
  return authVersion
}

export function onAuthChange(listener: () => void): () => void {
  authListeners.add(listener)
  return () => { authListeners.delete(listener) }
}

/**
 * Proxy that transparently delegates to the authenticated client when available,
 * falling back to the anon client. All existing `supabase.from(...)` calls work
 * unchanged — the proxy swaps the underlying client as auth state changes.
 */
export const supabase: SupabaseClient = new Proxy(anonClient, {
  get(_target, prop) {
    const client = authClient || anonClient
    const value = (client as any)[prop]
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
})

export const isSupabaseConfigured = () =>
  supabaseUrl.length > 0 && supabaseAnonKey.length > 0
