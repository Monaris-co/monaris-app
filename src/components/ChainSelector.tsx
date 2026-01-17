import { Network } from 'lucide-react';

/**
 * ChainSelector - Shows the current network (Arbitrum One only)
 * No dropdown - just a static display since we only support Arbitrum Mainnet
 */
export function ChainSelector() {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border/50 bg-secondary/30 text-sm">
      <Network className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium">Arbitrum One</span>
    </div>
  );
}
