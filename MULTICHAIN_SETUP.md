# Multichain Setup Guide

SETTL now supports multiple chains! This guide explains how to deploy and configure SETTL on different networks.

## Supported Chains

### Testnets
- **Mantle Sepolia** (Chain ID: 5003) - Default testnet
- **Arbitrum Sepolia** (Chain ID: 421614)
- **Ethereum Sepolia** (Chain ID: 11155111)

### Mainnets
- **Mantle** (Chain ID: 5000)
- **Arbitrum One** (Chain ID: 42161)
- **Ethereum Mainnet** (Chain ID: 1)

## Configuration

### Environment Variables

Contract addresses can be configured in two ways:

1. **Chain-specific** (recommended for multichain):
```bash
# Mantle Sepolia (5003)
VITE_5003_DEMO_USDC_ADDRESS=0x...
VITE_5003_INVOICE_REGISTRY_ADDRESS=0x...
VITE_5003_VAULT_ADDRESS=0x...

# Arbitrum Sepolia (421614)
VITE_421614_DEMO_USDC_ADDRESS=0x...
VITE_421614_INVOICE_REGISTRY_ADDRESS=0x...
VITE_421614_VAULT_ADDRESS=0x...
```

2. **Legacy format** (backward compatible):
```bash
# Uses default chain (Mantle Sepolia or VITE_DEFAULT_CHAIN_ID)
VITE_DEMO_USDC_ADDRESS=0x...
VITE_INVOICE_REGISTRY_ADDRESS=0x...
```

### Default Chain

Set the default chain ID:
```bash
VITE_DEFAULT_CHAIN_ID=5003  # Mantle Sepolia
```

### RPC URLs

Optional - override default RPC URLs per chain:
```bash
VITE_RPC_URL_5003=https://rpc.sepolia.mantle.xyz
VITE_RPC_URL_421614=https://sepolia-rollup.arbitrum.io/rpc
VITE_RPC_URL_42161=https://arb1.arbitrum.io/rpc
VITE_RPC_URL_11155111=https://rpc.sepolia.org
VITE_RPC_URL_1=https://eth.llamarpc.com
```

## Deployment

### Deploy to Specific Network

```bash
# Mantle Sepolia (default)
npm run deploy:mantle-sepolia

# Arbitrum Sepolia
npm run deploy:arbitrum-sepolia

# Arbitrum Mainnet
npm run deploy:arbitrum-mainnet

# Ethereum Sepolia
npm run deploy:eth-sepolia

# Ethereum Mainnet
npm run deploy:eth-mainnet

# Mantle Mainnet
npm run deploy:mantle-mainnet
```

### Deployment Output

After deployment, the script will:
1. Save addresses to `contracts-{chainId}.json`
2. Output environment variables for your `.env` file
3. Display both chain-specific and legacy format variables

### Example Output

```
Contract deployment summary:
====================================
Chain: Arbitrum Sepolia (421614)

Add these to your .env file (chain-specific):
VITE_421614_DEMO_USDC_ADDRESS=0x...
VITE_421614_INVOICE_REGISTRY_ADDRESS=0x...
...
```

## Frontend Configuration

### Privy Configuration

All supported chains are automatically configured in Privy. Make sure to:
1. Enable all chains in your Privy dashboard (https://dashboard.privy.io)
2. Add your deployment URL to allowed origins

### Chain Switching

Users can switch chains using the chain selector in the topbar:
- Click the chain name/icon in the topbar
- Select desired network
- The app will automatically switch and load contracts for that chain

### Contract Address Loading

The app automatically loads contract addresses based on the currently connected chain:
- Uses `useChainId()` from wagmi to detect current chain
- Loads chain-specific addresses from environment variables
- Falls back to legacy format for backward compatibility

## Code Usage

### Getting Contract Addresses

```typescript
import { useChainAddresses, useChainAddress } from '@/hooks/useChainAddresses';
import { useChainId } from 'wagmi';
import { getContractAddressesForChainId } from '@/lib/contracts';

// In a component - get all addresses for current chain
const addresses = useChainAddresses();
const invoiceRegistry = addresses.InvoiceRegistry;

// Get specific address
const vault = useChainAddress('Vault');

// Get addresses for specific chain (outside component)
const addresses = getContractAddressesForChainId(chainId);
```

### Using Current Chain in Hooks

Hooks should use `useChainId()` from wagmi:

```typescript
import { useChainId } from 'wagmi';
import { useChainAddresses } from '@/hooks/useChainAddresses';

export function useMyHook() {
  const chainId = useChainId();
  const addresses = useChainAddresses();
  
  const { data } = useReadContract({
    address: addresses.Vault as `0x${string}`,
    chainId, // Important: specify chain ID
    // ...
  });
}
```

### Chain Utilities

```typescript
import { 
  getChainMetadata, 
  getExplorerUrl, 
  hasContractsDeployed 
} from '@/lib/chain-utils';

// Get chain metadata
const metadata = getChainMetadata(chainId);
console.log(metadata.name, metadata.explorerUrl);

// Get explorer URL for transaction
const txUrl = getExplorerUrl(chainId, txHash);

// Check if contracts are deployed on chain
const deployed = hasContractsDeployed(chainId);
```

## Migration from Single Chain

If you're upgrading from single-chain setup:

1. **Update environment variables**:
   - Add chain-specific addresses: `VITE_{CHAIN_ID}_{CONTRACT}`
   - Keep legacy format for backward compatibility if needed

2. **Deploy contracts to new chains**:
   ```bash
   npm run deploy:arbitrum-sepolia
   npm run deploy:eth-sepolia
   # etc.
   ```

3. **Update Privy dashboard**:
   - Enable all chains you want to support
   - Add your deployment URLs to allowed origins

4. **Test chain switching**:
   - Deploy frontend
   - Test switching between chains
   - Verify contracts load correctly for each chain

## Hardhat Configuration

All networks are configured in `hardhat.config.cjs`:

```javascript
networks: {
  mantleSepolia: { ... },
  arbitrumSepolia: { ... },
  arbitrumMainnet: { ... },
  sepolia: { ... },
  mainnet: { ... },
}
```

RPC URLs are automatically loaded from environment variables or use defaults.

## Troubleshooting

### Contracts Not Loading

1. Check environment variables are set correctly:
   ```bash
   # Verify chain-specific addresses
   echo $VITE_5003_VAULT_ADDRESS
   ```

2. Check current chain ID matches addresses:
   ```javascript
   const chainId = useChainId();
   console.log('Current chain:', chainId);
   ```

3. Verify contracts are deployed:
   - Check `contracts-{chainId}.json` file
   - Verify addresses on block explorer

### Chain Switch Not Working

1. Ensure Privy is configured for all chains
2. Check wallet supports chain switching
3. Verify RPC URLs are correct in environment variables

### Wrong Contract Addresses

- The app loads addresses based on current `chainId`
- Make sure environment variables use correct chain ID prefix
- Check `VITE_DEFAULT_CHAIN_ID` is set correctly if using legacy format

## Best Practices

1. **Use chain-specific environment variables** for production
2. **Deploy contracts to all chains** before enabling in production
3. **Test chain switching** thoroughly before launch
4. **Monitor contract addresses** per chain in your deployment logs
5. **Use ChainSelector component** for user chain switching
6. **Always specify `chainId` in wagmi hooks** for clarity

## Next Steps

- Deploy contracts to all supported chains
- Configure environment variables for each deployment
- Test chain switching in development
- Enable chains in Privy dashboard
- Deploy frontend with multichain support
