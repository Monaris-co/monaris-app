import { useState, useEffect, useCallback } from 'react';
import { useWatchContractEvent, usePublicClient, useChainId } from 'wagmi';
import { usePrivyAccount } from './usePrivyAccount';
import { useChainAddresses } from './useChainAddresses';
import { InvoiceRegistryABI, AdvanceEngineABI, VaultABI, SettlementRouterABI, StakingABI, DemoUSDCABI } from '@/lib/abis';
import { formatUnits, formatEther, parseEventLogs } from 'viem';
import { useSellerInvoicesWithData, Invoice } from './useInvoice';

export interface Activity {
  id: string;
  type: 'invoice_created' | 'invoice_paid' | 'invoice_cleared' | 'advance_received' | 'advance_repaid' | 'vault_deposit' | 'vault_withdraw' | 'stake' | 'unstake' | 'usdc_transfer' | 'mnt_transfer';
  title: string;
  description: string;
  amount: number | null;
  direction: 'in' | 'out' | null;
  timestamp: number;
  txHash: string;
  blockNumber: bigint;
}

// localStorage key helper
const getStorageKey = (address: string) => `monaris_activities_${address.toLowerCase()}`;

// Helper to save activities to localStorage
const saveActivitiesToStorage = (address: string, activities: Activity[]) => {
  try {
    if (!address || typeof window === 'undefined') return;
    
    const storageKey = getStorageKey(address);
    // Serialize activities (convert bigint to string)
    const serialized = activities.map(activity => ({
      ...activity,
      blockNumber: activity.blockNumber.toString(),
    }));
    
    localStorage.setItem(storageKey, JSON.stringify(serialized));
    console.log('💾 Saved', activities.length, 'activities to localStorage');
  } catch (error) {
    console.error('❌ Error saving activities to localStorage:', error);
  }
};

// Helper to load activities from localStorage
const loadActivitiesFromStorage = (address: string): Activity[] => {
  try {
    if (!address || typeof window === 'undefined') return [];
    
    const storageKey = getStorageKey(address);
    const stored = localStorage.getItem(storageKey);
    if (!stored) return [];
    
    const parsed = JSON.parse(stored) as any[];
    // Deserialize activities (convert string back to bigint)
    const activities: Activity[] = parsed.map(activity => ({
      ...activity,
      blockNumber: BigInt(activity.blockNumber),
    }));
    
    console.log('📂 Loaded', activities.length, 'activities from localStorage');
    return activities;
  } catch (error) {
    console.error('❌ Error loading activities from localStorage:', error);
    return [];
  }
};

export function useActivity() {
  const { address } = usePrivyAccount();
  const chainId = useChainId();
  const addresses = useChainAddresses();
  const publicClient = usePublicClient({ chainId });
  const { invoices } = useSellerInvoicesWithData(address);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Helper to add activity and save to localStorage
  const addActivity = useCallback((activity: Activity) => {
    setActivities((prev) => {
      // Avoid duplicates by checking id (txHash + logIndex if available)
      const exists = prev.some((a) => a.id === activity.id);
      if (exists) return prev;
      
      // Add to beginning and sort by timestamp (newest first)
      const updated = [activity, ...prev];
      const sorted = updated.sort((a, b) => b.timestamp - a.timestamp);
      
      // Save to localStorage
      if (address) {
        saveActivitiesToStorage(address, sorted);
      }
      
      return sorted;
    });
  }, [address]);

  // Watch InvoiceCreated events
  useWatchContractEvent({
    address: addresses.InvoiceRegistry as `0x${string}`,
    abi: InvoiceRegistryABI,
    eventName: 'InvoiceCreated',
    chainId,
    onLogs(logs) {
      logs.forEach((log) => {
        const { invoiceId, seller, buyer, amount } = (log as any).args;
        if (seller?.toLowerCase() === address?.toLowerCase() || buyer?.toLowerCase() === address?.toLowerCase()) {
          addActivity({
            id: `invoice-created-${invoiceId}-${log.transactionHash}-${log.logIndex}`,
            type: 'invoice_created',
            title: `Invoice INV-${invoiceId.toString().padStart(3, '0')} Created`,
            description: seller?.toLowerCase() === address?.toLowerCase() 
              ? `Issued to ${buyer?.slice(0, 6)}...${buyer?.slice(-4)}`
              : `Received from ${seller?.slice(0, 6)}...${seller?.slice(-4)}`,
            amount: parseFloat(formatUnits(amount || 0n, 6)),
            direction: null,
            timestamp: Date.now(),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber || 0n,
          });
        }
      });
    },
  });

  // Watch InvoicePaid events
  useWatchContractEvent({
    address: addresses.InvoiceRegistry as `0x${string}`,
    abi: InvoiceRegistryABI,
    eventName: 'InvoicePaid',
    chainId,
    onLogs(logs) {
      logs.forEach((log) => {
        const { invoiceId, buyer, amount } = (log as any).args;
        if (buyer?.toLowerCase() === address?.toLowerCase()) {
          addActivity({
            id: `invoice-paid-${invoiceId}-${log.transactionHash}-${log.logIndex}`,
            type: 'invoice_paid',
            title: `Invoice INV-${invoiceId.toString().padStart(3, '0')} Paid`,
            description: 'Payment submitted',
            amount: parseFloat(formatUnits(amount || 0n, 6)),
            direction: 'out',
            timestamp: Date.now(),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber || 0n,
          });
        }
      });
    },
  });

  // Watch InvoiceCleared events (from InvoiceRegistry)
  useWatchContractEvent({
    address: addresses.InvoiceRegistry as `0x${string}`,
    abi: InvoiceRegistryABI,
    eventName: 'InvoiceCleared',
    chainId,
    onLogs(logs) {
      logs.forEach((log) => {
        const { invoiceId, seller, sellerAmount } = (log as any).args;
        if (seller?.toLowerCase() === address?.toLowerCase()) {
          addActivity({
            id: `invoice-cleared-${invoiceId}-${log.transactionHash}-${log.logIndex}`,
            type: 'invoice_cleared',
            title: `Invoice INV-${invoiceId.toString().padStart(3, '0')} Cleared`,
            description: 'Payment received and settled',
            amount: parseFloat(formatUnits(sellerAmount || 0n, 6)),
            direction: 'in',
            timestamp: Date.now(),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber || 0n,
          });
        }
      });
    },
  });

  // Watch InvoiceSettled events (from SettlementRouter - more complete info)
  useWatchContractEvent({
    address: addresses.SettlementRouter as `0x${string}`,
    abi: SettlementRouterABI,
    eventName: 'InvoiceSettled',
    chainId,
    onLogs(logs) {
      logs.forEach((log) => {
        const { invoiceId, seller, sellerAmount } = (log as any).args;
        if (seller?.toLowerCase() === address?.toLowerCase()) {
          // Update or add activity for invoice cleared
          addActivity({
            id: `invoice-settled-${invoiceId}-${log.transactionHash}-${log.logIndex}`,
            type: 'invoice_cleared',
            title: `Invoice INV-${invoiceId.toString().padStart(3, '0')} Cleared`,
            description: 'Payment received and settled',
            amount: parseFloat(formatUnits(sellerAmount || 0n, 6)),
            direction: 'in',
            timestamp: Date.now(),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber || 0n,
          });
        }
      });
    },
  });

  // Watch AdvanceRequested events
  useWatchContractEvent({
    address: addresses.AdvanceEngine as `0x${string}`,
    abi: AdvanceEngineABI,
    eventName: 'AdvanceRequested',
    chainId,
    onLogs(logs) {
      logs.forEach((log) => {
        const { invoiceId, seller, advanceAmount } = (log as any).args;
        if (seller?.toLowerCase() === address?.toLowerCase()) {
          addActivity({
            id: `advance-requested-${invoiceId}-${log.transactionHash}-${log.logIndex}`,
            type: 'advance_received',
            title: 'Advance Received',
            description: `On invoice INV-${invoiceId.toString().padStart(3, '0')}`,
            amount: parseFloat(formatUnits(advanceAmount || 0n, 6)),
            direction: 'in',
            timestamp: Date.now(),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber || 0n,
          });
        }
      });
    },
  });

  // Watch AdvanceRepaid events
  useWatchContractEvent({
    address: addresses.AdvanceEngine as `0x${string}`,
    abi: AdvanceEngineABI,
    eventName: 'AdvanceRepaid',
    chainId,
    onLogs(logs) {
      logs.forEach((log) => {
        const { invoiceId, seller, repaymentAmount } = (log as any).args;
        if (seller?.toLowerCase() === address?.toLowerCase()) {
          addActivity({
            id: `advance-repaid-${invoiceId}-${log.transactionHash}-${log.logIndex}`,
            type: 'advance_repaid',
            title: 'Advance Repaid',
            description: `Invoice INV-${invoiceId.toString().padStart(3, '0')} cleared`,
            amount: parseFloat(formatUnits(repaymentAmount || 0n, 6)),
            direction: 'out',
            timestamp: Date.now(),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber || 0n,
          });
        }
      });
    },
  });

  // Watch Vault Deposit events
  useWatchContractEvent({
    address: addresses.Vault as `0x${string}`,
    abi: VaultABI,
    eventName: 'Deposit',
    chainId,
    onLogs(logs) {
      logs.forEach((log) => {
        const { user, amount } = (log as any).args;
        if (user?.toLowerCase() === address?.toLowerCase()) {
          addActivity({
            id: `vault-deposit-${log.transactionHash}-${log.logIndex}`,
            type: 'vault_deposit',
            title: 'Vault Deposit',
            description: 'Added liquidity to funding pool',
            amount: parseFloat(formatUnits(amount || 0n, 6)),
            direction: 'out',
            timestamp: Date.now(),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber || 0n,
          });
        }
      });
    },
  });

  // Watch Vault Withdraw events
  useWatchContractEvent({
    address: addresses.Vault as `0x${string}`,
    abi: VaultABI,
    eventName: 'Withdraw',
    chainId,
    onLogs(logs) {
      logs.forEach((log) => {
        const { user, amount } = (log as any).args;
        if (user?.toLowerCase() === address?.toLowerCase()) {
          addActivity({
            id: `vault-withdraw-${log.transactionHash}-${log.logIndex}`,
            type: 'vault_withdraw',
            title: 'Vault Withdrawal',
            description: 'Withdrew liquidity from funding pool',
            amount: parseFloat(formatUnits(amount || 0n, 6)),
            direction: 'in',
            timestamp: Date.now(),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber || 0n,
          });
        }
      });
    },
  });

  // Watch Staking Stake events
  useWatchContractEvent({
    address: addresses.Staking as `0x${string}`,
    abi: StakingABI,
    eventName: 'Stake',
    chainId,
    onLogs(logs) {
      logs.forEach((log) => {
        const { user, usmtAmount } = (log as any).args;
        if (user?.toLowerCase() === address?.toLowerCase()) {
          addActivity({
            id: `stake-${log.transactionHash}-${log.logIndex}`,
            type: 'stake',
            title: 'Staked USMT+',
            description: 'Staked USMT+ to earn yield',
            amount: parseFloat(formatUnits(usmtAmount || 0n, 6)),
            direction: 'out',
            timestamp: Date.now(),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber || 0n,
          });
        }
      });
    },
  });

  // Watch Staking Unstake events
  useWatchContractEvent({
    address: addresses.Staking as `0x${string}`,
    abi: StakingABI,
    eventName: 'Unstake',
    chainId,
    onLogs(logs) {
      logs.forEach((log) => {
        const { user, usmtAmount } = (log as any).args;
        if (user?.toLowerCase() === address?.toLowerCase()) {
          addActivity({
            id: `unstake-${log.transactionHash}-${log.logIndex}`,
            type: 'unstake',
            title: 'Unstaked USMT+',
            description: 'Unstaked USMT+ from staking',
            amount: parseFloat(formatUnits(usmtAmount || 0n, 6)),
            direction: 'in',
            timestamp: Date.now(),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber || 0n,
          });
        }
      });
    },
  });

  // Watch USDC Transfer events (for both incoming and outgoing transfers)
  useWatchContractEvent({
    address: (address && addresses.DemoUSDC ? addresses.DemoUSDC : undefined) as `0x${string}` | undefined,
    abi: DemoUSDCABI,
    eventName: 'Transfer',
    onLogs(logs) {
      console.log('🔔 USDC Transfer event detected:', logs.length, 'logs');
      logs.forEach((log) => {
        const { from, to, value } = (log as any).args;
        const fromLower = from?.toLowerCase();
        const toLower = to?.toLowerCase();
        const addressLower = address?.toLowerCase();
        
        console.log('🔍 Processing Transfer event:', {
          from: fromLower,
          to: toLower,
          address: addressLower,
          value: value?.toString(),
        });
        
        // Skip if from and to are the same (self-transfers)
        if (fromLower === toLower) {
          console.log('⏭️ Skipping self-transfer');
          return;
        }
        
        // Track outgoing transfers (user sends funds)
        if (fromLower === addressLower) {
          console.log('📤 Detected outgoing USDC transfer');
          addActivity({
            id: `usdc-transfer-out-${log.transactionHash}-${log.logIndex}`,
            type: 'usdc_transfer',
            title: 'USDC Sent',
            description: `Sent to ${to?.slice(0, 6)}...${to?.slice(-4)}`,
            amount: parseFloat(formatUnits(value || 0n, 6)),
            direction: 'out',
            timestamp: Date.now(),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber || 0n,
          });
        }
        
        // Track incoming transfers (user receives funds)
        if (toLower === addressLower) {
          console.log('📥 Detected incoming USDC transfer');
          addActivity({
            id: `usdc-transfer-in-${log.transactionHash}-${log.logIndex}`,
            type: 'usdc_transfer',
            title: 'USDC Received',
            description: `Received from ${from?.slice(0, 6)}...${from?.slice(-4)}`,
            amount: parseFloat(formatUnits(value || 0n, 6)),
            direction: 'in',
            timestamp: Date.now(),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber || 0n,
          });
        }
      });
    },
    onError(error) {
      console.error('❌ Error watching USDC Transfer events:', error);
    },
  });

  // Load stored activities immediately on mount for instant display
  useEffect(() => {
    if (!address) {
      setActivities([]);
      setIsLoading(false);
      return;
    }

    const storedActivities = loadActivitiesFromStorage(address);
    console.log('📂 Initial load from localStorage:', storedActivities.length, 'activities');
    if (storedActivities.length > 0) {
      setActivities(storedActivities);
      setIsLoading(false); // Set loading to false immediately if we have stored activities
    }
  }, [address]);

  // Load past events on mount (also loads from localStorage and merges)
  useEffect(() => {
    if (!publicClient || !address) {
      setIsLoading(false);
      return;
    }

    const fetchPastEvents = async () => {
      try {
        setIsLoading(true);
        console.log('🔍 Fetching past events for activity feed...', { address });
        
        const currentBlock = await publicClient.getBlockNumber();
        console.log('📦 Current block:', currentBlock.toString());
        
        // Fetch events from last 10 blocks (Alchemy free tier limit: max 10 blocks per request)
        // Note: Free tier RPC providers (like Alchemy) limit eth_getLogs to 10 block ranges (inclusive)
        // To get exactly 10 blocks: if fromBlock = N, toBlock must be N+9 (not N+10, as range is inclusive)
        const BLOCKS_TO_SEARCH = 10n;
        const fromBlock = currentBlock >= BLOCKS_TO_SEARCH ? currentBlock - (BLOCKS_TO_SEARCH - 1n) : 0n;
        const toBlock = currentBlock; // This gives us exactly 10 blocks when fromBlock = currentBlock - 9
        console.log('🔎 Searching blocks:', fromBlock.toString(), 'to', toBlock.toString(), `(${Number(toBlock - fromBlock + 1n)} blocks - Alchemy free tier limit)`);
        
        const allActivities: Activity[] = [];

        // Helper to get block timestamp
        const getBlockTimestamp = async (blockNumber: bigint) => {
          try {
            const block = await publicClient.getBlock({ blockNumber });
            return Number(block.timestamp) * 1000; // Convert to milliseconds
          } catch {
            return Date.now(); // Fallback to current time
          }
        };

        // Helper to create activity from event log
        const createActivityFromLog = async (
          log: any,
          type: Activity['type'],
          title: string,
          description: string,
          amount: bigint | null,
          direction: Activity['direction'],
          invoiceId?: bigint,
          decimals: number = 6 // Default to 6 decimals (USDC), but allow override for MNT (18 decimals)
        ): Promise<Activity | null> => {
          const timestamp = await getBlockTimestamp(log.blockNumber || 0n);
          const activityId = invoiceId 
            ? `${type}-${invoiceId}-${log.transactionHash}-${log.logIndex || 0}`
            : `${type}-${log.transactionHash}-${log.logIndex || 0}`;
          
          return {
            id: activityId,
            type,
            title,
            description,
            amount: amount ? parseFloat(formatUnits(amount, decimals)) : null,
            direction,
            timestamp,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber || 0n,
          };
        };

        // Fetch InvoiceSettled events (most important - shows cleared invoices)
        if (addresses.SettlementRouter) {
          try {
            console.log('📋 Fetching InvoiceSettled events from SettlementRouter...');
            const rawLogs = await publicClient.getLogs({
              address: addresses.SettlementRouter as `0x${string}`,
              fromBlock,
              toBlock,
            });
            console.log('📋 Raw logs fetched:', rawLogs.length);

            try {
              const parsedLogs = parseEventLogs({
                abi: SettlementRouterABI,
                logs: rawLogs,
                eventName: 'InvoiceSettled',
              });
              console.log('✅ Parsed InvoiceSettled logs:', parsedLogs.length);

              for (const log of parsedLogs) {
                const decoded = (log as any).args;
                console.log('🔍 Checking log:', { seller: decoded?.seller, address });
                if (decoded.seller?.toLowerCase() === address?.toLowerCase()) {
                  console.log('✅ Match found for InvoiceSettled event');
                  const activity = await createActivityFromLog(
                    { ...log, transactionHash: log.transactionHash, blockNumber: log.blockNumber, logIndex: log.logIndex },
                    'invoice_cleared',
                    `Invoice INV-${decoded.invoiceId?.toString().padStart(3, '0') || 'N/A'} Cleared`,
                    'Payment received and settled',
                    decoded.sellerAmount || null,
                    'in',
                    decoded.invoiceId
                  );
                  if (activity) {
                    allActivities.push(activity);
                    console.log('➕ Added activity:', activity.title);
                  }
                }
              }
            } catch (parseErr) {
              console.error('❌ Error parsing InvoiceSettled logs:', parseErr);
            }
          } catch (err) {
            console.error('❌ Error fetching SettlementRouter events:', err);
          }
        } else {
          console.warn('⚠️ SettlementRouter address not configured');
        }

        // Fetch InvoiceCreated events
        if (addresses.InvoiceRegistry) {
          try {
            console.log('📋 Fetching InvoiceCreated events from InvoiceRegistry...');
            const rawLogs = await publicClient.getLogs({
              address: addresses.InvoiceRegistry as `0x${string}`,
              fromBlock,
              toBlock,
            });
            console.log('📋 Raw InvoiceRegistry logs fetched:', rawLogs.length);

            // Parse InvoiceCreated events
            try {
              const createdLogs = parseEventLogs({
                abi: InvoiceRegistryABI,
                logs: rawLogs,
                eventName: 'InvoiceCreated',
              });
              console.log('✅ Parsed InvoiceCreated logs:', createdLogs.length);

              for (const log of createdLogs) {
                const decoded = (log as any).args;
                if (decoded?.seller?.toLowerCase() === address?.toLowerCase() || decoded?.buyer?.toLowerCase() === address?.toLowerCase()) {
                  const activity = await createActivityFromLog(
                    { ...log, transactionHash: log.transactionHash, blockNumber: log.blockNumber, logIndex: log.logIndex },
                    'invoice_created',
                    `Invoice INV-${decoded.invoiceId?.toString().padStart(3, '0') || 'N/A'} Created`,
                    decoded.seller?.toLowerCase() === address?.toLowerCase()
                      ? `Issued to ${decoded.buyer?.slice(0, 6)}...${decoded.buyer?.slice(-4)}`
                      : `Received from ${decoded.seller?.slice(0, 6)}...${decoded.seller?.slice(-4)}`,
                    decoded.amount || null,
                    null,
                    decoded.invoiceId
                  );
                  if (activity) {
                    allActivities.push(activity);
                    console.log('➕ Added InvoiceCreated activity:', activity.title);
                  }
                }
              }
            } catch (parseErr) {
              console.error('❌ Error parsing InvoiceCreated logs:', parseErr);
            }

            // Parse InvoicePaid events
            try {
              const paidLogs = parseEventLogs({
                abi: InvoiceRegistryABI,
                logs: rawLogs,
                eventName: 'InvoicePaid',
              });
              console.log('✅ Parsed InvoicePaid logs:', paidLogs.length);

              for (const log of paidLogs) {
                const decoded = (log as any).args;
                if (decoded?.buyer?.toLowerCase() === address?.toLowerCase()) {
                  const activity = await createActivityFromLog(
                    { ...log, transactionHash: log.transactionHash, blockNumber: log.blockNumber, logIndex: log.logIndex },
                    'invoice_paid',
                    `Invoice INV-${decoded.invoiceId?.toString().padStart(3, '0') || 'N/A'} Paid`,
                    'Payment submitted',
                    decoded.amount || null,
                    'out',
                    decoded.invoiceId
                  );
                  if (activity) {
                    allActivities.push(activity);
                    console.log('➕ Added InvoicePaid activity:', activity.title);
                  }
                }
              }
            } catch (parseErr) {
              console.error('❌ Error parsing InvoicePaid logs:', parseErr);
            }
          } catch (err) {
            console.error('❌ Error fetching InvoiceRegistry events:', err);
          }
        } else {
          console.warn('⚠️ InvoiceRegistry address not configured');
        }

        // Fetch AdvanceRequested events
        if (addresses.AdvanceEngine) {
          try {
            console.log('📋 Fetching AdvanceRequested events...');
            const rawLogs = await publicClient.getLogs({
              address: addresses.AdvanceEngine as `0x${string}`,
              fromBlock,
              toBlock,
            });
            console.log('📋 Raw AdvanceEngine logs fetched:', rawLogs.length);

            try {
              const parsedLogs = parseEventLogs({
                abi: AdvanceEngineABI,
                logs: rawLogs,
                eventName: 'AdvanceRequested',
              });
              console.log('✅ Parsed AdvanceRequested logs:', parsedLogs.length);

              for (const log of parsedLogs) {
                const decoded = (log as any).args;
                if (decoded?.seller?.toLowerCase() === address?.toLowerCase()) {
                  const activity = await createActivityFromLog(
                    { ...log, transactionHash: log.transactionHash, blockNumber: log.blockNumber, logIndex: log.logIndex },
                    'advance_received',
                    'Advance Received',
                    `On invoice INV-${decoded.invoiceId?.toString().padStart(3, '0') || 'N/A'}`,
                    decoded.advanceAmount || null,
                    'in',
                    decoded.invoiceId
                  );
                  if (activity) {
                    allActivities.push(activity);
                    console.log('➕ Added AdvanceRequested activity:', activity.title);
                  }
                }
              }
            } catch (parseErr) {
              console.error('❌ Error parsing AdvanceRequested logs:', parseErr);
            }

            // Parse AdvanceRepaid events
            try {
              const repaidLogs = parseEventLogs({
                abi: AdvanceEngineABI,
                logs: rawLogs,
                eventName: 'AdvanceRepaid',
              });
              console.log('✅ Parsed AdvanceRepaid logs:', repaidLogs.length);

              for (const log of repaidLogs) {
                const decoded = (log as any).args;
                if (decoded?.seller?.toLowerCase() === address?.toLowerCase()) {
                  const activity = await createActivityFromLog(
                    { ...log, transactionHash: log.transactionHash, blockNumber: log.blockNumber, logIndex: log.logIndex },
                    'advance_repaid',
                    'Advance Repaid',
                    `Invoice INV-${decoded.invoiceId?.toString().padStart(3, '0') || 'N/A'} cleared`,
                    decoded.repaymentAmount || null,
                    'out',
                    decoded.invoiceId
                  );
                  if (activity) {
                    allActivities.push(activity);
                    console.log('➕ Added AdvanceRepaid activity:', activity.title);
                  }
                }
              }
            } catch (parseErr) {
              console.error('❌ Error parsing AdvanceRepaid logs:', parseErr);
            }
          } catch (err) {
            console.error('❌ Error fetching AdvanceEngine events:', err);
          }
        }

        // Fetch Vault Deposit/Withdraw events
        if (addresses.Vault) {
          try {
            console.log('📋 Fetching Vault events...');
            const rawLogs = await publicClient.getLogs({
              address: addresses.Vault as `0x${string}`,
              fromBlock,
              toBlock,
            });
            console.log('📋 Raw Vault logs fetched:', rawLogs.length);

            // Parse Deposit events
            try {
              const depositLogs = parseEventLogs({
                abi: VaultABI,
                logs: rawLogs,
                eventName: 'Deposit',
              });
              console.log('✅ Parsed Vault Deposit logs:', depositLogs.length);

              for (const log of depositLogs) {
                const decoded = (log as any).args;
                if (decoded?.user?.toLowerCase() === address?.toLowerCase()) {
                  const activity = await createActivityFromLog(
                    { ...log, transactionHash: log.transactionHash, blockNumber: log.blockNumber, logIndex: log.logIndex },
                    'vault_deposit',
                    'Vault Deposit',
                    'Added liquidity to funding pool',
                    decoded.amount || null,
                    'out',
                    undefined
                  );
                  if (activity) {
                    allActivities.push(activity);
                    console.log('➕ Added Vault Deposit activity');
                  }
                }
              }
            } catch (parseErr) {
              console.error('❌ Error parsing Vault Deposit logs:', parseErr);
            }

            // Parse Withdraw events
            try {
              const withdrawLogs = parseEventLogs({
                abi: VaultABI,
                logs: rawLogs,
                eventName: 'Withdraw',
              });
              console.log('✅ Parsed Vault Withdraw logs:', withdrawLogs.length);

              for (const log of withdrawLogs) {
                const decoded = (log as any).args;
                if (decoded?.user?.toLowerCase() === address?.toLowerCase()) {
                  const activity = await createActivityFromLog(
                    { ...log, transactionHash: log.transactionHash, blockNumber: log.blockNumber, logIndex: log.logIndex },
                    'vault_withdraw',
                    'Vault Withdrawal',
                    'Withdrew liquidity from funding pool',
                    decoded.amount || null,
                    'in',
                    undefined
                  );
                  if (activity) {
                    allActivities.push(activity);
                    console.log('➕ Added Vault Withdraw activity');
                  }
                }
              }
            } catch (parseErr) {
              console.error('❌ Error parsing Vault Withdraw logs:', parseErr);
            }
          } catch (err) {
            console.error('❌ Error fetching Vault events:', err);
          }
        }

        // Fetch Staking Stake/Unstake events
        if (addresses.Staking) {
          try {
            console.log('📋 Fetching Staking events...');
            const rawLogs = await publicClient.getLogs({
              address: addresses.Staking as `0x${string}`,
              fromBlock,
              toBlock,
            });
            console.log('📋 Raw Staking logs fetched:', rawLogs.length);

            // Parse Stake events
            try {
              const stakeLogs = parseEventLogs({
                abi: StakingABI,
                logs: rawLogs,
                eventName: 'Stake',
              });
              console.log('✅ Parsed Stake logs:', stakeLogs.length);

              for (const log of stakeLogs) {
                const decoded = (log as any).args;
                if (decoded?.user?.toLowerCase() === address?.toLowerCase()) {
                  const activity = await createActivityFromLog(
                    { ...log, transactionHash: log.transactionHash, blockNumber: log.blockNumber, logIndex: log.logIndex },
                    'stake',
                    'Staked USMT+',
                    'Staked USMT+ to earn yield',
                    decoded.usmtAmount || null,
                    'out',
                    undefined
                  );
                  if (activity) {
                    allActivities.push(activity);
                    console.log('➕ Added Stake activity');
                  }
                }
              }
            } catch (parseErr) {
              console.error('❌ Error parsing Stake logs:', parseErr);
            }

            // Parse Unstake events
            try {
              const unstakeLogs = parseEventLogs({
                abi: StakingABI,
                logs: rawLogs,
                eventName: 'Unstake',
              });
              console.log('✅ Parsed Unstake logs:', unstakeLogs.length);

              for (const log of unstakeLogs) {
                const decoded = (log as any).args;
                if (decoded?.user?.toLowerCase() === address?.toLowerCase()) {
                  const activity = await createActivityFromLog(
                    { ...log, transactionHash: log.transactionHash, blockNumber: log.blockNumber, logIndex: log.logIndex },
                    'unstake',
                    'Unstaked USMT+',
                    'Unstaked USMT+ from staking',
                    decoded.usmtAmount || null,
                    'in',
                    undefined
                  );
                  if (activity) {
                    allActivities.push(activity);
                    console.log('➕ Added Unstake activity');
                  }
                }
              }
            } catch (parseErr) {
              console.error('❌ Error parsing Unstake logs:', parseErr);
            }
          } catch (err) {
            console.error('❌ Error fetching Staking events:', err);
          }
        }

        // Fetch USDC Transfer events (for both incoming and outgoing transfers)
        if (addresses.DemoUSDC) {
          try {
            console.log('📋 Fetching USDC Transfer events...');
            const rawLogs = await publicClient.getLogs({
              address: addresses.DemoUSDC as `0x${string}`,
              fromBlock,
              toBlock,
            });
            console.log('📋 Raw DemoUSDC logs fetched:', rawLogs.length);

            try {
              const transferLogs = parseEventLogs({
                abi: DemoUSDCABI,
                logs: rawLogs,
                eventName: 'Transfer',
              });
              console.log('✅ Parsed USDC Transfer logs:', transferLogs.length);

              for (const log of transferLogs) {
                const decoded = (log as any).args;
                const fromLower = decoded?.from?.toLowerCase();
                const toLower = decoded?.to?.toLowerCase();
                const addressLower = address?.toLowerCase();
                
                // Skip self-transfers
                if (fromLower === toLower) continue;
                
                // Track outgoing transfers (user sends funds)
                if (fromLower === addressLower) {
                  const activity = await createActivityFromLog(
                    { ...log, transactionHash: log.transactionHash, blockNumber: log.blockNumber, logIndex: log.logIndex },
                    'usdc_transfer',
                    'USDC Sent',
                    `Sent to ${decoded.to?.slice(0, 6)}...${decoded.to?.slice(-4)}`,
                    decoded.value || null,
                    'out',
                    undefined
                  );
                  if (activity) {
                    allActivities.push(activity);
                    console.log('➕ Added USDC outgoing transfer activity');
                  }
                }
                
                // Track incoming transfers (user receives funds)
                if (toLower === addressLower) {
                  const activity = await createActivityFromLog(
                    { ...log, transactionHash: log.transactionHash, blockNumber: log.blockNumber, logIndex: log.logIndex },
                    'usdc_transfer',
                    'USDC Received',
                    `Received from ${decoded.from?.slice(0, 6)}...${decoded.from?.slice(-4)}`,
                    decoded.value || null,
                    'in',
                    undefined
                  );
                  if (activity) {
                    allActivities.push(activity);
                    console.log('➕ Added USDC incoming transfer activity');
                  }
                }
              }
            } catch (parseErr) {
              console.error('❌ Error parsing USDC Transfer logs:', parseErr);
            }
          } catch (err) {
            console.error('❌ Error fetching DemoUSDC events:', err);
          }
        }

        // Fetch native MNT transfers from recent blocks
        try {
          console.log('📋 Fetching native MNT transfers from blocks...');
          const addressLower = address?.toLowerCase();
          
          for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
            try {
              const block = await publicClient.getBlock({ blockNumber: blockNum, includeTransactions: true });
              
              if (block.transactions && Array.isArray(block.transactions)) {
                for (const tx of block.transactions) {
                  if (typeof tx === 'object' && tx.hash && tx.value && tx.value > 0n) {
                    const txFrom = (tx as any).from?.toLowerCase();
                    const txTo = (tx as any).to?.toLowerCase();
                    
                    // Track outgoing MNT transfers (user sends)
                    if (txFrom === addressLower && txTo && txTo !== addressLower) {
                      const activity = await createActivityFromLog(
                        { transactionHash: tx.hash, blockNumber: blockNum, logIndex: 0 },
                        'mnt_transfer',
                        'MNT Sent',
                        `Sent to ${(tx as any).to.slice(0, 6)}...${(tx as any).to.slice(-4)}`,
                        tx.value,
                        'out',
                        undefined,
                        18 // MNT has 18 decimals
                      );
                      if (activity) {
                        allActivities.push(activity);
                        console.log('➕ Added outgoing MNT transfer activity');
                      }
                    }
                    
                    // Track incoming MNT transfers (user receives)
                    if (txTo === addressLower && txFrom && txFrom !== addressLower) {
                      const activity = await createActivityFromLog(
                        { transactionHash: tx.hash, blockNumber: blockNum, logIndex: 0 },
                        'mnt_transfer',
                        'MNT Received',
                        `Received from ${(tx as any).from.slice(0, 6)}...${(tx as any).from.slice(-4)}`,
                        tx.value,
                        'in',
                        undefined,
                        18 // MNT has 18 decimals
                      );
                      if (activity) {
                        allActivities.push(activity);
                        console.log('➕ Added incoming MNT transfer activity');
                      }
                    }
                  }
                }
              }
            } catch (blockErr) {
              console.error(`❌ Error fetching block ${blockNum}:`, blockErr);
              // Continue with next block
            }
          }
        } catch (mntErr) {
          console.error('❌ Error fetching MNT transfers:', mntErr);
        }

        // Reload from localStorage NOW (after async operations) to get any activities saved by other useEffects
        const storedActivities = loadActivitiesFromStorage(address);
        
        // Merge with stored activities and remove duplicates
        const mergedActivities: Activity[] = [...storedActivities];
        
        allActivities.forEach(newActivity => {
          const exists = mergedActivities.some(a => a.id === newActivity.id);
          if (!exists) {
            mergedActivities.push(newActivity);
          }
        });

        // Sort by timestamp (newest first) and set activities
        const sortedActivities = mergedActivities.sort((a, b) => b.timestamp - a.timestamp);
        console.log('✅ Total activities from events:', allActivities.length);
        console.log('✅ Stored activities from localStorage:', storedActivities.length);
        console.log('✅ Merged activities total:', sortedActivities.length);
        
        setActivities(sortedActivities);
        
        // Save merged activities to localStorage (even if empty, to ensure we have the key)
        saveActivitiesToStorage(address, sortedActivities);
      } catch (err) {
        console.error('❌ Error fetching past events:', err);
        // On error, at least show stored activities if available
        const storedActivities = loadActivitiesFromStorage(address);
        if (storedActivities.length > 0) {
          console.log('⚠️ Using stored activities due to error:', storedActivities.length);
          setActivities(storedActivities);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchPastEvents();
  }, [publicClient, address]);

  // Also create activities from invoice data (fallback/supplement)
  useEffect(() => {
    if (!invoices || invoices.length === 0) return;

    console.log('📄 Creating activities from invoices:', invoices.length);
    const invoiceActivities: Activity[] = [];

    invoices.forEach((invoice: Invoice) => {
      // Add invoice created activity
      if (invoice.createdAt && invoice.createdAt > 0n) {
        const createdAt = Number(invoice.createdAt) * 1000; // Convert to milliseconds
        invoiceActivities.push({
          id: `invoice-created-${invoice.invoiceId}-from-data`,
          type: 'invoice_created',
          title: `Invoice INV-${invoice.invoiceId.toString().padStart(3, '0')} Created`,
          description: invoice.seller?.toLowerCase() === address?.toLowerCase()
            ? `Issued to ${invoice.buyer?.slice(0, 6)}...${invoice.buyer?.slice(-4)}`
            : `Received from ${invoice.seller?.slice(0, 6)}...${invoice.seller?.slice(-4)}`,
          amount: parseFloat(formatUnits(invoice.amount || 0n, 6)),
          direction: null,
          timestamp: createdAt,
          txHash: '0x0000000000000000000000000000000000000000000000000000000000000000', // Placeholder
          blockNumber: 0n,
        });
      }

      // Add invoice cleared activity if cleared
      if (invoice.status === 3 && invoice.clearedAt && invoice.clearedAt > 0n) {
        const clearedAt = Number(invoice.clearedAt) * 1000; // Convert to milliseconds
        invoiceActivities.push({
          id: `invoice-cleared-${invoice.invoiceId}-from-data`,
          type: 'invoice_cleared',
          title: `Invoice INV-${invoice.invoiceId.toString().padStart(3, '0')} Cleared`,
          description: 'Payment received and settled',
          amount: parseFloat(formatUnits(invoice.amount || 0n, 6)),
          direction: 'in',
          timestamp: clearedAt,
          txHash: '0x0000000000000000000000000000000000000000000000000000000000000000', // Placeholder
          blockNumber: 0n,
        });
      }
    });

    // Merge with existing activities from state AND localStorage, avoiding duplicates
    setActivities((prev) => {
      // Also load from localStorage to ensure we have all stored activities
      const storedActivities = loadActivitiesFromStorage(address || '');
      const allExisting = [...new Set([...prev, ...storedActivities].map(a => a.id))]
        .map(id => [...prev, ...storedActivities].find(a => a.id === id))
        .filter(Boolean) as Activity[];
      
      const merged = [...allExisting];
      invoiceActivities.forEach((newActivity) => {
        const exists = merged.some((a) => 
          a.id === newActivity.id || 
          (a.type === newActivity.type && a.title === newActivity.title)
        );
        if (!exists) {
          merged.push(newActivity);
        }
      });
      // Sort by timestamp (newest first)
      const sorted = merged.sort((a, b) => b.timestamp - a.timestamp);
      
      // Save to localStorage
      if (address) {
        saveActivitiesToStorage(address, sorted);
      }
      
      return sorted;
    });
    console.log('✅ Added', invoiceActivities.length, 'activities from invoice data');
  }, [invoices, address]);

  return {
    activities,
    isLoading,
  };
}

