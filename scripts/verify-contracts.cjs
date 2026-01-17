require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Testing contracts with account:", deployer.address);

  // Contract addresses from deployment
  const INVOICE_NFT_ADDRESS = "0x6eDaAb9F0ABbFf26B40fB6a06D38720d54937fD2";
  const INVOICE_REGISTRY_ADDRESS = "0x458210af89D93FE5024F93239A85DA9448c929b2";

  console.log("\n=== Contract Verification ===");
  console.log("InvoiceNFT:", INVOICE_NFT_ADDRESS);
  console.log("InvoiceRegistry:", INVOICE_REGISTRY_ADDRESS);

  // Load contracts
  const InvoiceNFT = await hre.ethers.getContractFactory("InvoiceNFT");
  const InvoiceRegistry = await hre.ethers.getContractFactory("InvoiceRegistry");

  const invoiceNFT = InvoiceNFT.attach(INVOICE_NFT_ADDRESS);
  const invoiceRegistry = InvoiceRegistry.attach(INVOICE_REGISTRY_ADDRESS);

  console.log("\n1. Checking InvoiceNFT.invoiceRegistry...");
  try {
    const invoiceRegistryAddress = await invoiceNFT.invoiceRegistry();
    console.log("   ✅ InvoiceRegistry address:", invoiceRegistryAddress);
    if (invoiceRegistryAddress.toLowerCase() === INVOICE_REGISTRY_ADDRESS.toLowerCase()) {
      console.log("   ✅ Matches expected address!");
    } else {
      console.log("   ❌ MISMATCH! Expected:", INVOICE_REGISTRY_ADDRESS);
    }
  } catch (error) {
    console.log("   ❌ Error:", error.message);
  }

  console.log("\n2. Checking MINTER_ROLE...");
  try {
    const MINTER_ROLE = await invoiceNFT.MINTER_ROLE();
    console.log("   MINTER_ROLE hash:", MINTER_ROLE);

    const hasRole = await invoiceNFT.hasRole(MINTER_ROLE, INVOICE_REGISTRY_ADDRESS);
    console.log("   InvoiceRegistry has MINTER_ROLE:", hasRole);
    if (hasRole) {
      console.log("   ✅ InvoiceRegistry CAN mint NFTs!");
    } else {
      console.log("   ❌ InvoiceRegistry CANNOT mint NFTs! Need to grant MINTER_ROLE");
    }
  } catch (error) {
    console.log("   ❌ Error:", error.message);
  }

  console.log("\n3. Testing createInvoice (dry run with staticCall)...");
  try {
    // Test parameters
    const testBuyer = deployer.address; // Use deployer as buyer for testing
    const testAmount = hre.ethers.parseUnits("100", 6); // 100 USDC (6 decimals)
    const testDueDate = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days from now
    const testMetadataHash = hre.ethers.ZeroHash;

    console.log("   Test parameters:");
    console.log("   - Buyer:", testBuyer);
    console.log("   - Amount:", testAmount.toString(), "($100)");
    console.log("   - Due Date:", new Date(testDueDate * 1000).toISOString());

    // Try to simulate the call
    try {
      await invoiceRegistry.createInvoice.staticCall(
        testBuyer,
        testAmount,
        testDueDate,
        testMetadataHash
      );
      console.log("   ✅ createInvoice would succeed!");
    } catch (error) {
      console.log("   ❌ createInvoice would REVERT:");
      console.log("   Error:", error.message);
      
      // Check common revert reasons
      if (error.message.includes("InvoiceRegistry not set")) {
        console.log("   🔍 Issue: InvoiceNFT.invoiceRegistry is not set");
      } else if (error.message.includes("Invalid buyer")) {
        console.log("   🔍 Issue: Buyer address is invalid");
      } else if (error.message.includes("Amount must be > 0")) {
        console.log("   🔍 Issue: Amount is zero");
      } else if (error.message.includes("Due date must be in future")) {
        console.log("   🔍 Issue: Due date is in the past");
      } else if (error.message.includes("Not authorized") || error.message.includes("AccessControl")) {
        console.log("   🔍 Issue: MINTER_ROLE not granted");
      } else if (error.message.includes("Invoice already tokenized")) {
        console.log("   🔍 Issue: Invoice already has an NFT");
      } else if (error.message.includes("execution reverted")) {
        console.log("   🔍 Issue: Contract execution reverted (check MINTER_ROLE or invoiceRegistry)");
      }
    }
  } catch (error) {
    console.log("   ❌ Error testing createInvoice:", error.message);
  }

  console.log("\n4. Checking InvoiceNFT contract owner/admin...");
  try {
    const DEFAULT_ADMIN_ROLE = await invoiceNFT.DEFAULT_ADMIN_ROLE();
    const isAdmin = await invoiceNFT.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    console.log("   Deployer is admin:", isAdmin);
    if (isAdmin) {
      console.log("   ✅ Can grant MINTER_ROLE if needed");
    } else {
      console.log("   ⚠️  Deployer is NOT admin - cannot fix without admin access");
    }
  } catch (error) {
    console.log("   ❌ Error:", error.message);
  }

  console.log("\n=== Summary ===");
  console.log("If any checks failed, run: npx hardhat run scripts/fix-contract-setup.cjs --network mantleSepolia");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

