import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Fix script to grant MINTER_ROLE to Vault in USMTPlus contract
 * Run this if Vault deposits are failing with "Execution reverted"
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Fixing Vault MINTER_ROLE with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // Load contract addresses
  const contractsPath = path.join(__dirname, "..", "contracts.json");
  if (!fs.existsSync(contractsPath)) {
    throw new Error("contracts.json not found. Please deploy contracts first.");
  }

  const contractsData = JSON.parse(fs.readFileSync(contractsPath, "utf8"));
  const vaultAddress = contractsData.contracts?.Vault;
  const usmtPlusAddress = contractsData.contracts?.USMTPlus;

  if (!vaultAddress) {
    throw new Error("Vault address not found in contracts.json");
  }

  if (!usmtPlusAddress) {
    throw new Error("USMTPlus address not found in contracts.json");
  }

  console.log("\nContract Addresses:");
  console.log("  Vault:", vaultAddress);
  console.log("  USMTPlus:", usmtPlusAddress);

  // Get contract instances
  const USMTPlus = await ethers.getContractFactory("USMTPlus");
  const usmtPlus = USMTPlus.attach(usmtPlusAddress);

  // Check if Vault already has MINTER_ROLE
  const MINTER_ROLE = await usmtPlus.MINTER_ROLE();
  const hasRole = await usmtPlus.hasRole(MINTER_ROLE, vaultAddress);

  if (hasRole) {
    console.log("\n✅ Vault already has MINTER_ROLE in USMTPlus. No action needed.");
    return;
  }

  console.log("\n❌ Vault does NOT have MINTER_ROLE. Granting now...");

  try {
    const tx = await usmtPlus.grantRole(MINTER_ROLE, vaultAddress);
    console.log("   Transaction sent:", tx.hash);
    await tx.wait();
    console.log("   ✅ MINTER_ROLE granted to Vault!");
    
    // Verify
    const hasRoleAfter = await usmtPlus.hasRole(MINTER_ROLE, vaultAddress);
    if (hasRoleAfter) {
      console.log("\n✅ Verification successful! Vault now has MINTER_ROLE.");
      console.log("   You can now deposit to the Vault.");
    } else {
      console.log("\n❌ Verification failed! Please check the transaction.");
    }
  } catch (error: any) {
    console.error("\n❌ Error granting MINTER_ROLE:", error.message);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

