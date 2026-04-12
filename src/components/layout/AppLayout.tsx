import { Outlet } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { Topbar } from "./Topbar"
import { useState } from "react"
import { usePrivateWallet } from "@/hooks/usePrivateWallet"

function PrivateWalletAutoInit() {
  // Calling the hook ensures the RAILGUN wallet is created and persisted
  // to Supabase on /app login, so buyers can resolve the seller's 0zk address.
  usePrivateWallet();
  return null;
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <PrivateWalletAutoInit />
      <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
      <div className="md:pl-64 transition-all duration-300">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="min-h-[calc(100vh-4rem)] py-4 px-2 sm:px-4 md:px-6 lg:px-8">
          <div className="w-[90%] max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
