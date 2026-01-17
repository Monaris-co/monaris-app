import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Diagnostic script to check Vault contract configuration
 * This will help identify why deposits are failing
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Checking Vault configuration with account:", deployer.address);

  // Load contract addresses
  const contractsPath = path.join(__dirname, "..", "contracts.json");
  if (!fs.existsSync(contractsPath)) {
    throw new Error("contracts.json not found. Please deploy contracts first.");
  }

  const contractsData = JSON.parse(fs.readFileSync(contractsPath, "utf8"));
  const vaultAddress = contractsData.contracts?.Vault || process.env.VITE_VAULT_ADDRESS;
  const usmtPlusAddress = contractsData.contracts?.USMTPlus || process.env.VITE_USMT_PLUS_ADDRESS;
  const demoUSDCAddress = contractsData.contracts?.DemoUSDC || process.env.VITE_DEMO_USDC_ADDRESS;

  if (!vaultAddress) {
    throw new Error("Vault address not found in contracts.json or .env");
  }

  if (!usmtPlusAddress) {
    throw new Error("USMTPlus address not found in contracts.json or .env");
  }

  if (!demoUSDCAddress) {
    throw new Error("DemoUSDC address not found in contracts.json or .env");
  }

  console.log("\n=== Contract Addresses ===");
  console.log("Vault:", vaultAddress);
  console.log("USMTPlus:", usmtPlusAddress);
  console.log("DemoUSDC:", demoUSDCAddress);

  // Get contract instances
  const Vault = await ethers.getContractFactory("Vault");
  const USMTPlus = await ethers.getContractFactory("USMTPlus");
  const DemoUSDC = await ethers.getContractFactory("DemoUSDC");
  
  const vault = Vault.attach(vaultAddress);
  const usmtPlus = USMTPlus.attach(usmtPlusAddress);
  const demoUSDC = DemoUSDC.attach(demoUSDCAddress);

  console.log("\n=== Checking Vault Configuration ===");
  
  // Check Vault's token address
  try {
    const vaultTokenAddress = await vault.token();
    console.log("✓ Vault.token():", vaultTokenAddress);
    if (vaultTokenAddress.toLowerCase() !== demoUSDCAddress.toLowerCase()) {
      console.log("❌ MISMATCH! Vault is using wrong token address!");
      console.log("   Expected:", demoUSDCAddress);
      console.log("   Got:", vaultTokenAddress);
    } else {
      console.log("✓ Token address matches");
    }
  } catch (error: any) {
    console.log("❌ Error reading vault.token():", error.message);
  }

  // Check Vault's USMTPlus address
  try {
    const vaultUsmtPlusAddress = await vault.usmtPlus();
    console.log("✓ Vault.usmtPlus():", vaultUsmtPlusAddress);
    if (vaultUsmtPlusAddress.toLowerCase() !== usmtPlusAddress.toLowerCase()) {
      console.log("❌ MISMATCH! Vault is using wrong USMTPlus address!");
      console.log("   Expected:", usmtPlusAddress);
      console.log("   Got:", vaultUsmtPlusAddress);
    } else {
      console.log("✓ USMTPlus address matches");
    }
  } catch (error: any) {
    console.log("❌ Error reading vault.usmtPlus():", error.message);
  }

  // Check MINTER_ROLE
  console.log("\n=== Checking MINTER_ROLE ===");
  try {
    const MINTER_ROLE = await usmtPlus.MINTER_ROLE();
    const hasRole = await usmtPlus.hasRole(MINTER_ROLE, vaultAddress);
    console.log("MINTER_ROLE:", MINTER_ROLE);
    console.log("Vault has MINTER_ROLE:", hasRole);
    
    if (!hasRole) {
      console.log("\n❌ PROBLEM FOUND: Vault does NOT have MINTER_ROLE!");
      console.log("   Run: npm run fix:vault-minter");
    } else {
      console.log("✓ Vault has MINTER_ROLE");
    }
  } catch (error: any) {
    console.log("❌ Error checking MINTER_ROLE:", error.message);
  }

  // Check token balance of deployer
  console.log("\n=== Checking Token Balances ===");
  try {
    const deployerBalance = await demoUSDC.balanceOf(deployer.address);
    console.log("Deployer USDC balance:", ethers.formatUnits(deployerBalance, 6), "USDC");
  } catch (error: any) {
    console.log("❌ Error checking balance:", error.message);
  }

  // Check allowance
  console.log("\n=== Checking Allowance ===");
  try {
    const allowance = await demoUSDC.allowance(deployer.address, vaultAddress);
    console.log("Deployer allowance for Vault:", ethers.formatUnits(allowance, 6), "USDC");
    if (allowance === 0n) {
      console.log("⚠️  No allowance set. User needs to approve USDC spending.");
    }
  } catch (error: any) {
    console.log("❌ Error checking allowance:", error.message);
  }

  // Check Vault state
  console.log("\n=== Checking Vault State ===");
  try {
    const totalLiquidity = await vault.getTotalLiquidity();
    const totalBorrowed = await vault.getTotalBorrowed();
    console.log("Total Liquidity:", ethers.formatUnits(totalLiquidity, 6), "USDC");
    console.log("Total Borrowed:", ethers.formatUnits(totalBorrowed, 6), "USDC");
  } catch (error: any) {
    console.log("❌ Error reading vault state:", error.message);
  }

  console.log("\n=== Diagnostic Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

