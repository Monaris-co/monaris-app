// Contract ABIs - Extracted from Hardhat artifacts

import InvoiceRegistryArtifact from '../../artifacts/contracts/InvoiceRegistry.sol/InvoiceRegistry.json';
import DemoUSDCArtifact from '../../artifacts/contracts/DemoUSDC.sol/DemoUSDC.json';
import USMTPlusArtifact from '../../artifacts/contracts/USMTPlus.sol/USMTPlus.json';
import VaultArtifact from '../../artifacts/contracts/Vault.sol/Vault.json';
import StakingArtifact from '../../artifacts/contracts/Staking.sol/Staking.json';
import AdvanceEngineArtifact from '../../artifacts/contracts/AdvanceEngine.sol/AdvanceEngine.json';
import SettlementRouterArtifact from '../../artifacts/contracts/SettlementRouter.sol/SettlementRouter.json';
import ReputationArtifact from '../../artifacts/contracts/Reputation.sol/Reputation.json';

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

export const InvoiceRegistryABI = InvoiceRegistryArtifact.abi;
export const DemoUSDCABI = DemoUSDCArtifact.abi;
// Use ERC20ABI for mainnet USDC, DemoUSDCABI for testnet DemoUSDC
export const USDCABI = ERC20ABI;
export const USMTPlusABI = USMTPlusArtifact.abi;
export const VaultABI = VaultArtifact.abi;
export const StakingABI = StakingArtifact.abi;
export const AdvanceEngineABI = AdvanceEngineArtifact.abi;
export const SettlementRouterABI = SettlementRouterArtifact.abi;
export const ReputationABI = ReputationArtifact.abi;

/**
 * Get the appropriate USDC ABI based on chain ID
 * Mainnets (42161 Arbitrum, 1 Ethereum) use real USDC with ERC20ABI
 * Testnets use DemoUSDC with DemoUSDCABI
 */
export function getUSDCABI(chainId: number) {
  const isMainnet = chainId === 42161 || chainId === 1; // Arbitrum Mainnet or Ethereum Mainnet
  return isMainnet ? USDCABI : DemoUSDCABI;
}

