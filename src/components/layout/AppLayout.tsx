import { Outlet } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { Topbar } from "./Topbar"
import { useState } from "react"
import { usePrivateWalletWithOptions } from "@/hooks/usePrivateWallet"
import { CashDialog } from "@/components/layout/CashDialog"
import { usePrivy } from "@privy-io/react-auth"
import { toast } from "sonner"

function PrivateWalletAutoInit() {
  usePrivateWalletWithOptions({ syncProvider: false })
  return null
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [cashDialogOpen, setCashDialogOpen] = useState(false)
  const { ready, authenticated, login } = usePrivy()

  const handleCashClick = async () => {
    if (!authenticated) {
      if (!ready) return

      try {
        await login()
      } catch (error) {
        console.error("Login error:", error)
        toast.error("Failed to open login modal", {
          description: error instanceof Error ? error.message : "Check console for details",
        })
      }

      return
    }

    setCashDialogOpen(true)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <PrivateWalletAutoInit />
      <CashDialog open={cashDialogOpen} onOpenChange={setCashDialogOpen} />
      <Sidebar
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        onCashClick={handleCashClick}
      />
      <div className="md:pl-64 transition-all duration-300">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          onCashClick={handleCashClick}
        />
        <main className="min-h-[calc(100vh-4rem)] px-4 py-4 sm:px-6 md:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
