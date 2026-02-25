import { useState, useRef, useEffect } from 'react'
import { Bell, CheckCheck, FileText, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNotifications, Notification } from '@/hooks/useNotifications'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getPayLink(n: Notification): string | null {
  if (n.chain_invoice_id != null && n.chain_id != null) {
    return `/pay/${n.chain_id}/${n.chain_invoice_id}`
  }
  return null
}

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const prevUnreadRef = useRef(unreadCount)

  // Show toast on new realtime notification
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current && notifications.length > 0) {
      const latest = notifications[0]
      if (latest && !latest.is_read) {
        const payLink = getPayLink(latest)
        toast.info(latest.title, {
          description: latest.message,
          duration: 8000,
          action: payLink
            ? {
                label: 'Pay Now',
                onClick: () => window.open(payLink, '_blank'),
              }
            : undefined,
        })
      }
    }
    prevUnreadRef.current = unreadCount
  }, [unreadCount, notifications, navigate])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleNotificationClick = async (n: Notification) => {
    if (!n.is_read) await markAsRead(n.id)
    const payLink = getPayLink(n)
    if (payLink) {
      setOpen(false)
      window.open(payLink, '_blank')
    } else {
      setOpen(false)
      navigate('/app/invoices')
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        onClick={() => setOpen(prev => !prev)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                No notifications yet
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-b border-gray-50 dark:border-gray-800/50 last:border-0 ${
                    !n.is_read ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''
                  }`}
                >
                  <div className={`mt-0.5 flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                    !n.is_read
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                  }`}>
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${!n.is_read ? 'font-semibold text-gray-900 dark:text-white' : 'font-medium text-gray-600 dark:text-gray-300'}`}>
                        {n.title}
                      </p>
                      <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                      {n.message}
                    </p>
                    {getPayLink(n) && (
                      <span className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <ExternalLink className="h-3 w-3" />
                        Pay Now
                      </span>
                    )}
                  </div>
                  {!n.is_read && (
                    <div className="mt-2 flex-shrink-0 h-2 w-2 rounded-full bg-emerald-500" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
