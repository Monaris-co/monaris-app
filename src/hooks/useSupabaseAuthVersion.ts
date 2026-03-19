import { useSyncExternalStore } from 'react'
import { getAuthVersion, onAuthChange } from '@/lib/supabase'

/**
 * Returns a version number that increments every time Supabase auth state changes.
 * Include in dependency arrays of data-fetching effects/callbacks to auto-refetch
 * when the user authenticates or logs out.
 */
export function useSupabaseAuthVersion(): number {
  return useSyncExternalStore(onAuthChange, getAuthVersion, getAuthVersion)
}
