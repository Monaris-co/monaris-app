import { Link, useLocation } from "react-router-dom"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  FileText,
  Banknote,
  Vault,
  Award,
  ShieldCheck,
  Settings,
  Sparkles,
  ArrowUpRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"

const navigation = [
  { name: "Dashboard", href: "/app", icon: LayoutDashboard },
  { name: "Invoices", href: "/app/invoices", icon: FileText },
  { name: "Financing", href: "/app/financing", icon: Banknote },
  { name: "Funding Pool", href: "/app/vault", icon: Vault },
  { name: "Reputation", href: "/app/reputation", icon: Award },
  { name: "Proofs", href: "/app/proofs", icon: ShieldCheck },
  { name: "Settings", href: "/app/settings", icon: Settings },
]

interface SidebarContentProps {
  collapsed?: boolean
  onNavigate?: () => void
}

function SidebarContent({ collapsed = false, onNavigate }: SidebarContentProps) {
  const location = useLocation()

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex h-20 items-center px-6">
        <Link to="/" className="flex items-center gap-3" onClick={() => onNavigate?.()}>
          {!collapsed ? (
            <div className="flex items-center gap-2">
              <img src="/monar.png" alt="Monaris" className="w-10 h-10 rounded-xl" />
              <span className="text-xl font-semibold text-gray-900 dark:text-white">Monaris</span>
            </div>
          ) : (
            <img src="/monar.png" alt="Monaris" className="w-10 h-10 rounded-xl" />
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href || 
            (item.href !== '/app' && location.pathname.startsWith(item.href))
          return (
            <Link
              key={item.name}
              to={item.href}
              onClick={() => onNavigate?.()}
              className={cn(
                "w-full flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-[#c8ff00]/25 text-[#1a1a1a] dark:bg-[#c8ff00]/20 dark:text-[#c8ff00]"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-white"
              )}
            >
              <item.icon className={cn(
                "h-5 w-5 shrink-0",
                isActive ? "text-[#7cb518] dark:text-[#c8ff00]" : ""
              )} />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Promo Card at Bottom */}
      {!collapsed && (
        <div className="p-4 mt-auto">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 p-5 border border-gray-200 dark:border-gray-700">
            {/* Decorative elements */}
            <div className="absolute top-3 right-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-[#c8ff00]/60"></div>
                <div className="w-2 h-2 rounded-full bg-[#a8df00]/60"></div>
              </div>
            </div>
            
            {/* Icon */}
            <div className="mb-4">
              <div className="w-12 h-12 rounded-xl bg-white dark:bg-gray-700 shadow-sm flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-[#7cb518]" />
              </div>
            </div>
            
            {/* Content */}
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
              Unlock higher financing limits with verified proofs
            </p>
            
            {/* CTA Button */}
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full bg-[#c8ff00] hover:bg-[#b8ef00] text-black border-0 font-medium rounded-xl"
              asChild
            >
              <Link to="/app/proofs">
                Get Verified
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

interface SidebarProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function Sidebar({ open, onOpenChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const isMobile = useIsMobile()

  // Mobile: Render as Sheet
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-[280px] p-0 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <SidebarContent onNavigate={() => onOpenChange?.(false)} />
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop: Render as fixed sidebar
  return (
    <aside
      className={cn(
        "hidden md:flex fixed left-0 top-0 z-40 h-screen flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 transition-all duration-300",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      <SidebarContent collapsed={collapsed} />
    </aside>
  )
}
