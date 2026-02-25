import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { usePrivyAccount } from './usePrivyAccount'

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

export function useNotifications() {
  const { address } = usePrivyAccount()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const normalizedAddress = address?.toLowerCase()

  const fetchNotifications = useCallback(async () => {
    if (!normalizedAddress || !isSupabaseConfigured()) return
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_address', normalizedAddress)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('Error fetching notifications:', error)
        return
      }
      setNotifications(data || [])
      setUnreadCount(data?.filter(n => !n.is_read).length || 0)
    } finally {
      setIsLoading(false)
    }
  }, [normalizedAddress])

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!isSupabaseConfigured()) return
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)

    setNotifications(prev =>
      prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
    )
    setUnreadCount(prev => Math.max(0, prev - 1))
  }, [])

  const markAllAsRead = useCallback(async () => {
    if (!normalizedAddress || !isSupabaseConfigured()) return
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_address', normalizedAddress)
      .eq('is_read', false)

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }, [normalizedAddress])

  // Fetch on mount / address change
  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // Supabase Realtime subscription
  useEffect(() => {
    if (!normalizedAddress || !isSupabaseConfigured()) return

    const channel = supabase
      .channel(`notifications:${normalizedAddress}`)
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
          setNotifications(prev => [newNotification, ...prev])
          setUnreadCount(prev => prev + 1)
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [normalizedAddress])

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  }
}
