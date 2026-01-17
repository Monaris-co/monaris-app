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
        <main className="min-h-[calc(100vh-4rem)] p-4 md:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
