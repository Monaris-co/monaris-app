const hre = require("hardhat");

async function main() {
  console.log("🔍 Checking Invoice Status and Contract Configuration...\n");

  // Load environment variables
  require("dotenv").config();

  // Get contract addresses from .env
  const invoiceRegistryAddress = process.env.VITE_INVOICE_REGISTRY_ADDRESS;
  const advanceEngineAddress = process.env.VITE_ADVANCE_ENGINE_ADDRESS;

  if (!invoiceRegistryAddress || !advanceEngineAddress) {
    console.error("❌ Missing contract addresses in .env file");
    console.log("Required: VITE_INVOICE_REGISTRY_ADDRESS, VITE_ADVANCE_ENGINE_ADDRESS");
    process.exit(1);
  }

  console.log("Contract Addresses:");
  console.log(`  InvoiceRegistry: ${invoiceRegistryAddress}`);
  console.log(`  AdvanceEngine:   ${advanceEngineAddress}\n`);

  // Get signer
  const [deployer] = await hre.ethers.getSigners();
  console.log("Using account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString(), "wei\n");

  // Load contract ABIs
  const InvoiceRegistryABI = [
    "function getInvoice(uint256 invoiceId) external view returns (tuple(uint256 invoiceId, address seller, address buyer, uint256 amount, uint256 dueDate, uint8 status, bytes32 metadataHash, uint256 createdAt, uint256 paidAt, uint256 clearedAt))"
  ];

  const AdvanceEngineABI = [
    "function getAdvance(uint256 invoiceId) external view returns (tuple(uint256 invoiceId, address seller, uint256 advanceAmount, uint256 principal, uint256 interest, uint256 totalRepayment, uint256 requestedAt, bool repaid))"
  ];

  const invoiceRegistry = new hre.ethers.Contract(invoiceRegistryAddress, InvoiceRegistryABI, deployer);
  const advanceEngine = new hre.ethers.Contract(advanceEngineAddress, AdvanceEngineABI, deployer);

  const invoiceId = 1;
  
  // Check if invoice already has an advance (which means it's already financed)
  console.log(`\n🔍 Checking if Invoice #${invoiceId} already has an advance...`);
  try {
    const existingAdvance = await advanceEngine.getAdvance(invoiceId);
    if (existingAdvance && existingAdvance.advanceAmount > 0n) {
      console.error(`\n❌ INVOICE #${invoiceId} ALREADY HAS AN ADVANCE!`);
      console.error("  This invoice was already financed.");
      console.error("  Advance Amount:", existingAdvance.advanceAmount.toString());
      console.error("  Seller:", existingAdvance.seller);
      console.error("\n  This explains why the transaction fails with 'Invalid status'!");
      console.error("  The invoice status must be 'Financed' (1), not 'Issued' (0).\n");
    }
  } catch (err) {
    // getAdvance will revert if no advance exists, which is fine
    console.log(`✅ Invoice #${invoiceId} does not have an existing advance.\n`);
  }

  // Check invoice status
  console.log(`\n📋 Checking Invoice #${invoiceId} status...`);
  try {
    const invoice = await invoiceRegistry.getInvoice(invoiceId);
    console.log("Invoice from InvoiceRegistry (frontend uses this):");
    console.log("  Invoice ID:", invoice.invoiceId.toString());
    console.log("  Status:", invoice.status.toString(), "(0=Issued, 1=Financed, 2=Paid, 3=Cleared)");
    console.log("  Seller:", invoice.seller);
    console.log("  Buyer:", invoice.buyer);
    console.log("  Amount:", invoice.amount.toString());
    
    if (invoice.status.toString() !== "0") {
      console.error(`\n❌ INVOICE STATUS IS NOT 'Issued' (0)!`);
      console.error(`  Current status: ${invoice.status.toString()}`);
      console.error(`  This invoice cannot be advanced because it's already ${invoice.status.toString() === "1" ? "Financed" : invoice.status.toString() === "2" ? "Paid" : "Cleared"}`);
    } else {
      console.log("\n✅ Invoice status is 'Issued' (0) - should be eligible for advance.");
    }
  } catch (err) {
    console.error("Error reading invoice:", err.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
