require("dotenv").config();
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Fix script to grant MINTER_ROLE to Vault in USMTPlus contract
 * Run this if Vault deposits are failing with "Execution reverted"
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Fixing Vault MINTER_ROLE with account:", deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)));

  // Prioritize .env addresses (VITE_ prefix) over contracts.json
  // This ensures we check the contracts the frontend is actually using
  let vaultAddress = process.env.VITE_VAULT_ADDRESS;
  let usmtPlusAddress = process.env.VITE_USMT_PLUS_ADDRESS;
  
  // Fallback to contracts.json if .env not set
  const contractsPath = path.join(__dirname, "..", "contracts.json");
  let contractsData = null;
  if (!vaultAddress || !usmtPlusAddress) {
    if (fs.existsSync(contractsPath)) {
      contractsData = JSON.parse(fs.readFileSync(contractsPath, "utf8"));
      vaultAddress = vaultAddress || contractsData.contracts?.Vault;
      usmtPlusAddress = usmtPlusAddress || contractsData.contracts?.USMTPlus;
    }
  }
  
  console.log("\n=== Contract Address Sources ===");
  if (contractsData) {
    console.log("From contracts.json - Vault:", contractsData.contracts?.Vault || "not found");
    console.log("From contracts.json - USMTPlus:", contractsData.contracts?.USMTPlus || "not found");
  }
  console.log("From .env - VITE_VAULT_ADDRESS:", process.env.VITE_VAULT_ADDRESS || "not found");
  console.log("From .env - VITE_USMT_PLUS_ADDRESS:", process.env.VITE_USMT_PLUS_ADDRESS || "not found");

  if (!vaultAddress) {
    throw new Error("Vault address not found in contracts.json or .env. Set VITE_VAULT_ADDRESS in .env");
  }

  if (!usmtPlusAddress) {
    throw new Error("USMTPlus address not found in contracts.json or .env. Set VITE_USMT_PLUS_ADDRESS in .env");
  }

  console.log("\n=== Using Contract Addresses ===");
  console.log("  Vault:", vaultAddress);
  console.log("  USMTPlus:", usmtPlusAddress);

  // Get contract instances
  const USMTPlus = await hre.ethers.getContractFactory("USMTPlus");
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
  } catch (error) {
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
