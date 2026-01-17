import { useEffect } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { toast } from 'sonner'

export function PrivyErrorHandler() {
  const { ready, error } = usePrivy()

  useEffect(() => {
    if (error) {
      console.error('Privy error:', error)
      
      // Check for origin mismatch
      if (error.message?.includes('origin') || 
          error.message?.includes('Origin') || 
          error.message?.includes('not allowed') ||
          error?.code === 403) {
        const currentOrigin = window.location.origin
        toast.error(
          "Origin Not Allowed",
          {
            description: `Add ${currentOrigin} to allowed origins in Privy dashboard at dashboard.privy.io`,
            duration: 15000,
            action: {
              label: "Open Dashboard",
              onClick: () => window.open('https://dashboard.privy.io', '_blank')
            }
          }
        )
        // Store in localStorage to prevent repeated toasts
        localStorage.setItem('privy:origin-error', currentOrigin)
      } else {
        toast.error("Privy Error", {
          description: error.message || "An error occurred with Privy",
        })
      }
    }
  }, [error])

  // Show warning if not ready after delay
  useEffect(() => {
    if (!ready) {
      const timer = setTimeout(() => {
        const currentOrigin = window.location.origin
        const storedOrigin = localStorage.getItem('privy:origin-error')
        
        // Only show warning if we haven't already shown an error
        if (!storedOrigin) {
          console.warn('Privy is taking longer than expected to initialize')
          console.warn(`Current origin: ${currentOrigin}`)
          console.warn('Make sure this origin is added to Privy dashboard allowed origins')
        }
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [ready])

  return null
}

