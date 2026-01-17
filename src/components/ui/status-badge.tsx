import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      status: {
        issued: "bg-info/10 text-info border border-info/20",
        financed: "bg-status-financed/10 text-status-financed border border-status-financed/20",
        paid: "bg-warning/10 text-warning border border-warning/20",
        cleared: "bg-success/10 text-success border border-success/20",
        pending: "bg-muted text-muted-foreground border border-border",
        failed: "bg-destructive/10 text-destructive border border-destructive/20",
        verified: "bg-success/10 text-success border border-success/20",
        expired: "bg-muted text-muted-foreground border border-border",
      },
    },
    defaultVariants: {
      status: "pending",
    },
  }
)

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statusBadgeVariants> {
  dot?: boolean
}

const StatusBadge = React.forwardRef<HTMLDivElement, StatusBadgeProps>(
  ({ className, status, dot = true, children, ...props }, ref) => {
    return (
      <div
        className={cn(statusBadgeVariants({ status, className }))}
        ref={ref}
        {...props}
      >
        {dot && (
          <span className="relative flex h-2 w-2">
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-75",
                status === "issued" && "bg-info animate-ping",
                status === "financed" && "bg-status-financed animate-ping",
                status === "paid" && "bg-warning animate-ping",
                status === "cleared" && "bg-success",
                status === "pending" && "bg-muted-foreground",
                status === "failed" && "bg-destructive animate-ping",
                status === "verified" && "bg-success",
                status === "expired" && "bg-muted-foreground"
              )}
            />
            <span
              className={cn(
                "relative inline-flex rounded-full h-2 w-2",
                status === "issued" && "bg-info",
                status === "financed" && "bg-status-financed",
                status === "paid" && "bg-warning",
                status === "cleared" && "bg-success",
                status === "pending" && "bg-muted-foreground",
                status === "failed" && "bg-destructive",
                status === "verified" && "bg-success",
                status === "expired" && "bg-muted-foreground"
              )}
            />
          </span>
        )}
        {children}
      </div>
    )
  }
)
StatusBadge.displayName = "StatusBadge"

export { StatusBadge, statusBadgeVariants }
