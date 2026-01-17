require("dotenv").config();
const hre = require("hardhat");

/**
 * Check specific Vault address configuration
 */
async function main() {
  const vaultAddress = process.env.CHECK_VAULT_ADDRESS || "0x5C20941E3d7c702e720b7e616F755a8DeB77ac70";
  const usmtPlusAddress = process.env.CHECK_USMT_ADDRESS || "0x9127A182Ae8dF5c6d831a53D4e39757c0f177577";

  console.log("Checking specific Vault:", vaultAddress);
  console.log("USMTPlus:", usmtPlusAddress);

  const USMTPlus = await hre.ethers.getContractFactory("USMTPlus");
  const usmtPlus = USMTPlus.attach(usmtPlusAddress);

  // Check MINTER_ROLE
  console.log("\n=== Checking MINTER_ROLE ===");
  try {
    const MINTER_ROLE = await usmtPlus.MINTER_ROLE();
    const hasRole = await usmtPlus.hasRole(MINTER_ROLE, vaultAddress);
    console.log("Vault has MINTER_ROLE:", hasRole);
    
    if (!hasRole) {
      console.log("\n❌ PROBLEM FOUND: Vault does NOT have MINTER_ROLE!");
      console.log("   Run: npm run fix:vault-minter");
      process.exit(1);
    } else {
      console.log("✓ Vault has MINTER_ROLE");
    }
  } catch (error) {
    console.log("❌ Error:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

