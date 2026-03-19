import { useEffect, useState, useCallback, useRef } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  supabase,
  supabaseAnon,
  isSupabaseConfigured,
  isSupabaseAuthenticated,
} from '@/lib/supabase'
import { usePrivyAccount } from './usePrivyAccount'
import { useSupabaseAuthVersion } from './useSupabaseAuthVersion'
import { supabaseQueryWithRetry, withTimeout } from '@/lib/supabase-query-retry'

export interface Notification {
  id: string
  recipient_address: string
  type: string
  title: string
  message: string
  invoice_id: string | null
  chain_invoice_id: number | null
  chain_id: number | null
  is_read: boolean
  created_at: string
}

const NOTIFICATION_COLUMNS =
  'id, recipient_address, type, title, message, invoice_id, chain_invoice_id, chain_id, is_read, created_at'

const FETCH_TIMEOUT_MS = 14_000

function notificationListQuery(client: SupabaseClient, normalizedAddress: string) {
  return client
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .eq('recipient_address', normalizedAddress)
    .neq('type', 'dismissed')
    .order('created_at', { ascending: false })
    .limit(50)
}

function looksLikeRlsOrAuth(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false
  const m = `${err.message || ''} ${err.code || ''}`.toLowerCase()
  return (
    m.includes('permission') ||
    m.includes('rls') ||
    m.includes('row-level') ||
    m.includes('jwt') ||
    m.includes('unauthorized') ||
    err.code === '42501' ||
    err.code === 'PGRST301'
  )
}

export function useNotifications() {
  const { address } = usePrivyAccount()
  const { ready: privyReady } = usePrivy()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const fetchGenRef = useRef(0)
  /** Always decrement in finally — avoids stuck "Loading" when overlapping fetches (e.g. authVersion). */
  const inFlightRef = useRef(0)

  const normalizedAddress = address?.toLowerCase()
  const authVersion = useSupabaseAuthVersion()

  const fetchNotifications = useCallback(async () => {
    if (!normalizedAddress || !isSupabaseConfigured()) return
    if (!privyReady) return

    const gen = ++fetchGenRef.current
    inFlightRef.current += 1
    setIsLoading(true)
    setFetchError(null)

    const applyResult = (
      data: Notification[] | null,
      error: { message: string; code?: string } | null,
    ) => {
      if (gen !== fetchGenRef.current) return
      if (error) {
        console.error('Error fetching notifications:', error)
        setFetchError(error.message || 'Could not load notifications')
        return
      }
      setNotifications(data || [])
      setUnreadCount(data?.filter(n => !n.is_read).length || 0)
    }

    try {
      let { data, error } = await supabaseQueryWithRetry('notifications', () =>
        withTimeout(
          notificationListQuery(supabase, normalizedAddress),
          FETCH_TIMEOUT_MS,
          'Notifications',
        ),
      )

      if (error && looksLikeRlsOrAuth(error)) {
        const second = await supabaseQueryWithRetry('notifications-anon-fallback', () =>
          withTimeout(
            notificationListQuery(supabaseAnon, normalizedAddress),
            FETCH_TIMEOUT_MS,
            'Notifications',
          ),
        )
        data = second.data as Notification[] | null
        error = second.error
      }

      applyResult((data as Notification[]) || [], error)
    } catch (e) {
      if (gen !== fetchGenRef.current) return
      console.error('Error fetching notifications:', e)
      setFetchError(e instanceof Error ? e.message : 'Could not load notifications')
    } finally {
      inFlightRef.current = Math.max(0, inFlightRef.current - 1)
      if (inFlightRef.current === 0) setIsLoading(false)
    }
  }, [normalizedAddress, privyReady, authVersion])

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!isSupabaseConfigured() || !privyReady) return
      const addr = normalizedAddress || ''
      const run = (c: SupabaseClient) =>
        c
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notificationId)
          .eq('recipient_address', addr)
      try {
        let { error } = await run(supabase)
        if (error && looksLikeRlsOrAuth(error)) {
          const r = await run(supabaseAnon)
          error = r.error
        }
        if (error) throw error
        setNotifications(prev =>
          prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n)),
        )
        setUnreadCount(prev => Math.max(0, prev - 1))
      } catch (e) {
        console.error('markAsRead failed:', e)
      }
    },
    [privyReady, normalizedAddress],
  )

  const dismissNotification = useCallback(
    async (notificationId: string) => {
      if (!isSupabaseConfigured() || !privyReady) return
      const addr = normalizedAddress || ''
      const run = (c: SupabaseClient) =>
        c
          .from('notifications')
          .update({ is_read: true, type: 'dismissed' })
          .eq('id', notificationId)
          .eq('recipient_address', addr)
      try {
        let { error } = await run(supabase)
        if (error && looksLikeRlsOrAuth(error)) {
          const r = await run(supabaseAnon)
          error = r.error
        }
        if (error) throw error
        setNotifications(prev => prev.filter(n => n.id !== notificationId))
        setUnreadCount(prev => Math.max(0, prev - 1))
      } catch (e) {
        console.error('dismissNotification failed:', e)
      }
    },
    [privyReady, normalizedAddress],
  )

  const markAllAsRead = useCallback(async () => {
    if (!normalizedAddress || !isSupabaseConfigured() || !privyReady) return
    const run = (c: SupabaseClient) =>
      c
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_address', normalizedAddress)
        .eq('is_read', false)
    try {
      let { error } = await run(supabase)
      if (error && looksLikeRlsOrAuth(error)) {
        const r = await run(supabaseAnon)
        error = r.error
      }
      if (error) throw error
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch (e) {
      console.error('markAllAsRead failed:', e)
    }
  }, [normalizedAddress, privyReady])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    if (!normalizedAddress || !isSupabaseConfigured() || !privyReady) return
    const id = window.setInterval(fetchNotifications, 45_000)
    return () => window.clearInterval(id)
  }, [normalizedAddress, privyReady, fetchNotifications])

  useEffect(() => {
    if (!normalizedAddress || !isSupabaseConfigured()) return

    const rtClient = isSupabaseAuthenticated() ? supabase : supabaseAnon
    const channel = rtClient
      .channel(`notifications-rt:${normalizedAddress}:${authVersion}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_address=eq.${normalizedAddress}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification
          if (newNotification.type === 'dismissed') return
          setNotifications(prev => {
            if (prev.some(n => n.id === newNotification.id)) return prev
            return [newNotification, ...prev]
          })
          setUnreadCount(prev => prev + (newNotification.is_read ? 0 : 1))
        },
      )
      .subscribe()

    channelRef.current = channel
    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [normalizedAddress, authVersion])

  return {
    notifications,
    unreadCount,
    isLoading,
    fetchError,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    refetch: fetchNotifications,
  }
}
