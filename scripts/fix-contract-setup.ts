import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Fixing contract setup with account:", deployer.address);

  // Contract addresses
  const INVOICE_NFT_ADDRESS = "0x6eDaAb9F0ABbFf26B40fB6a06D38720d54937fD2";
  const INVOICE_REGISTRY_ADDRESS = "0x458210af89D93FE5024F93239A85DA9448c929b2";

  console.log("\n=== Fixing Contract Setup ===");

  // Load contracts
  const InvoiceNFT = await ethers.getContractFactory("InvoiceNFT");
  const invoiceNFT = InvoiceNFT.attach(INVOICE_NFT_ADDRESS);

  // Check current state
  console.log("\n1. Checking current state...");
  const invoiceRegistryAddress = await invoiceNFT.invoiceRegistry();
  const MINTER_ROLE = await invoiceNFT.MINTER_ROLE();
  const hasRole = await invoiceNFT.hasRole(MINTER_ROLE, INVOICE_REGISTRY_ADDRESS);

  console.log("   InvoiceRegistry address:", invoiceRegistryAddress);
  console.log("   Has MINTER_ROLE:", hasRole);

  // Fix invoiceRegistry if needed
  if (invoiceRegistryAddress === ethers.ZeroAddress || 
      invoiceRegistryAddress.toLowerCase() !== INVOICE_REGISTRY_ADDRESS.toLowerCase()) {
    console.log("\n2. Setting InvoiceRegistry address...");
    try {
      const tx = await invoiceNFT.setInvoiceRegistry(INVOICE_REGISTRY_ADDRESS);
      console.log("   Transaction sent:", tx.hash);
      await tx.wait();
      console.log("   ✅ InvoiceRegistry address set!");
    } catch (error: any) {
      if (error.message.includes("already set")) {
        console.log("   ℹ️  InvoiceRegistry already set");
      } else {
        console.log("   ❌ Error:", error.message);
        throw error;
      }
    }
  } else {
    console.log("\n2. ✅ InvoiceRegistry address already set correctly");
  }

  // Grant MINTER_ROLE if needed
  if (!hasRole) {
    console.log("\n3. Granting MINTER_ROLE to InvoiceRegistry...");
    try {
      const tx = await invoiceNFT.grantRole(MINTER_ROLE, INVOICE_REGISTRY_ADDRESS);
      console.log("   Transaction sent:", tx.hash);
      await tx.wait();
      console.log("   ✅ MINTER_ROLE granted!");
    } catch (error: any) {
      console.log("   ❌ Error:", error.message);
      throw error;
    }
  } else {
    console.log("\n3. ✅ MINTER_ROLE already granted");
  }

  // Verify final state
  console.log("\n4. Verifying final state...");
  const finalInvoiceRegistry = await invoiceNFT.invoiceRegistry();
  const finalHasRole = await invoiceNFT.hasRole(MINTER_ROLE, INVOICE_REGISTRY_ADDRESS);

  if (finalInvoiceRegistry.toLowerCase() === INVOICE_REGISTRY_ADDRESS.toLowerCase() && finalHasRole) {
    console.log("   ✅ All setup complete! Contracts are ready.");
  } else {
    console.log("   ❌ Setup incomplete:");
    console.log("   - InvoiceRegistry:", finalInvoiceRegistry);
    console.log("   - Has MINTER_ROLE:", finalHasRole);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

