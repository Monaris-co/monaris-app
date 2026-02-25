// Contract ABIs - Inlined from Hardhat artifacts for production builds

import {
  InvoiceRegistryABI as _InvoiceRegistryABI,
  DemoUSDCABI as _DemoUSDCABI,
  USMTPlusABI as _USMTPlusABI,
  VaultABI as _VaultABI,
  StakingABI as _StakingABI,
  AdvanceEngineABI as _AdvanceEngineABI,
  SettlementRouterABI as _SettlementRouterABI,
  ReputationABI as _ReputationABI,
} from './contract-abis';

// Standard ERC20 ABI for real USDC token (used on mainnets)
// Using modern ABI format compatible with wagmi/viem
export const ERC20ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transferFrom',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const InvoiceRegistryABI = _InvoiceRegistryABI;
export const DemoUSDCABI = _DemoUSDCABI;
export const USDCABI = ERC20ABI;
export const USMTPlusABI = _USMTPlusABI;
export const VaultABI = _VaultABI;
export const StakingABI = _StakingABI;
export const AdvanceEngineABI = _AdvanceEngineABI;
export const SettlementRouterABI = _SettlementRouterABI;
export const ReputationABI = _ReputationABI;

/**
 * Get the appropriate USDC ABI based on chain ID
 * Mainnets (42161 Arbitrum, 1 Ethereum) use real USDC with ERC20ABI
 * Testnets use DemoUSDC with DemoUSDCABI
 */
export function getUSDCABI(chainId: number) {
  const isMainnet = chainId === 42161 || chainId === 1; // Arbitrum Mainnet or Ethereum Mainnet
  return isMainnet ? USDCABI : DemoUSDCABI;
}

