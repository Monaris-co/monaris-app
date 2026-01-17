require("dotenv").config();
const hre = require("hardhat");

async function main() {
  // Arbitrum Mainnet contract addresses
  const INVOICE_NFT_ADDRESS = "0x6b7FD37c4325a2196B77BaD67F570F8f6544C37E";
  const INVOICE_REGISTRY_ADDRESS = "0x8b00dEE5209e73F1D92bE834223D3497c57b4263";

  console.log("\n=== Checking InvoiceNFT Permissions on Arbitrum Mainnet ===");
  console.log("InvoiceNFT:", INVOICE_NFT_ADDRESS);
  console.log("InvoiceRegistry:", INVOICE_REGISTRY_ADDRESS);

  // Load contracts
  const InvoiceNFT = await hre.ethers.getContractFactory("InvoiceNFT");
  const invoiceNFT = InvoiceNFT.attach(INVOICE_NFT_ADDRESS);

  // Get all signers to check which one has admin role
  const [deployer, ...otherSigners] = await hre.ethers.getSigners();
  const allSigners = [deployer, ...otherSigners];

  console.log("\n1. Checking InvoiceNFT state...");
  const invoiceRegistryAddress = await invoiceNFT.invoiceRegistry();
  const MINTER_ROLE = await invoiceNFT.MINTER_ROLE();
  const DEFAULT_ADMIN_ROLE = await invoiceNFT.DEFAULT_ADMIN_ROLE();
  const hasRole = await invoiceNFT.hasRole(MINTER_ROLE, INVOICE_REGISTRY_ADDRESS);

  console.log("   InvoiceRegistry address:", invoiceRegistryAddress);
  console.log("   InvoiceRegistry has MINTER_ROLE:", hasRole);

  console.log("\n2. Checking which accounts have DEFAULT_ADMIN_ROLE...");
  const DEFAULT_ADMIN_ROLE_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
  
  for (let i = 0; i < allSigners.length && i < 10; i++) {
    const signer = allSigners[i];
    try {
      const hasAdminRole = await invoiceNFT.hasRole(DEFAULT_ADMIN_ROLE, signer.address);
      if (hasAdminRole) {
        console.log(`   ✅ Account ${i} (${signer.address}) has DEFAULT_ADMIN_ROLE`);
        console.log(`      You can use this account to grant MINTER_ROLE`);
        break;
      } else {
        console.log(`   ❌ Account ${i} (${signer.address}) does NOT have DEFAULT_ADMIN_ROLE`);
      }
    } catch (error) {
      console.log(`   ⚠️  Error checking account ${i}:`, error.message);
    }
  }

  // Also check the deployer from contracts-42161.json
  const knownDeployer = "0x6247d7b8b5F667662572b1C249EF1F1483CBFC14";
  console.log(`\n3. Checking known deployer address: ${knownDeployer}`);
  try {
    const hasAdminRole = await invoiceNFT.hasRole(DEFAULT_ADMIN_ROLE, knownDeployer);
    console.log(`   Has DEFAULT_ADMIN_ROLE: ${hasAdminRole}`);
    if (hasAdminRole) {
      console.log(`   ✅ This address has admin access!`);
    }
  } catch (error) {
    console.log(`   ⚠️  Error checking:`, error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
