import { Outlet } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { Topbar } from "./Topbar"
import { useState } from "react"

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
      <div className="md:pl-64 transition-all duration-300">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="min-h-[calc(100vh-4rem)] pl-1 pr-2 py-4 sm:pl-2 sm:pr-3 md:px-4 lg:px-6">
          <div className="w-full max-w-7xl sm:mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
