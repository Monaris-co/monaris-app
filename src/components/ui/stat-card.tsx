import * as React from "react"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  trend?: {
    value: number
    label: string
  }
  variant?: "default" | "primary" | "success" | "warning"
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, title, value, subtitle, icon: Icon, trend, variant = "default", ...props }, ref) => {
    const variantStyles = {
      default: {
        card: "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800",
        icon: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
        accent: ""
      },
      primary: {
        card: "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800",
        icon: "bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400",
        accent: "before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-blue-500 before:rounded-l-xl"
      },
      success: {
        card: "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800",
        icon: "bg-[#c8ff00]/10 dark:bg-[#c8ff00]/10 text-[#7cb518] dark:text-[#c8ff00]",
        accent: "before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-[#c8ff00] before:rounded-l-xl"
      },
      warning: {
        card: "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800",
        icon: "bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400",
        accent: "before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-amber-500 before:rounded-l-xl"
      }
    }

    const styles = variantStyles[variant]

    return (
      <div
        ref={ref}
        className={cn(
          "relative overflow-hidden rounded-2xl border p-6 transition-all duration-300 hover:shadow-lg",
          styles.card,
          styles.accent,
          className
        )}
        {...props}
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            <p className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{value}</p>
            {subtitle && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1.5 mt-2">
                <span
                  className={cn(
                    "inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full",
                    trend.value >= 0 
                      ? "bg-[#c8ff00]/10 text-[#7cb518] dark:bg-[#c8ff00]/10 dark:text-[#c8ff00]" 
                      : "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
                  )}
                >
                  {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}%
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{trend.label}</span>
              </div>
            )}
          </div>
          {Icon && (
            <div
              className={cn(
                "rounded-xl p-3",
                styles.icon
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>
      </div>
    )
  }
)
StatCard.displayName = "StatCard"

export { StatCard }
