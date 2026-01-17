const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const invoiceId = process.argv[2] || "1";
  const buyerAddress = process.argv[3] || "0x632E4Bb937Dd0c22CFADeB36A0d2c4e9afD84246";
  
  console.log(`\n=== Diagnosing Payment Issue for Invoice ${invoiceId} ===\n`);
  console.log(`Buyer Address: ${buyerAddress}\n`);

  const [signer] = await ethers.getSigners();
  console.log(`Using signer: ${signer.address}\n`);

  // Get contract addresses from .env
  const DEMO_USDC = process.env.VITE_DEMO_USDC_ADDRESS;
  const INVOICE_REGISTRY = process.env.VITE_INVOICE_REGISTRY_ADDRESS;
  const SETTLEMENT_ROUTER = process.env.VITE_SETTLEMENT_ROUTER_ADDRESS;
  const ADVANCE_ENGINE = process.env.VITE_ADVANCE_ENGINE_ADDRESS;

  if (!DEMO_USDC || !INVOICE_REGISTRY || !SETTLEMENT_ROUTER) {
    console.error("Missing contract addresses in .env");
    process.exit(1);
  }

  console.log("Contract Addresses:");
  console.log(`  DemoUSDC: ${DEMO_USDC}`);
  console.log(`  InvoiceRegistry: ${INVOICE_REGISTRY}`);
  console.log(`  SettlementRouter: ${SETTLEMENT_ROUTER}\n`);

  // ABI for basic calls
  const erc20Abi = [
    "function balanceOf(address owner) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)",
  ];

  const invoiceRegistryAbi = [
    "function getInvoice(uint256 invoiceId) external view returns (tuple(uint256 invoiceId, address seller, address buyer, uint256 amount, uint256 dueDate, uint8 status, uint256 createdAt, uint256 paidAt, uint256 clearedAt))",
  ];

  const settlementRouterAbi = [
    "function payInvoice(uint256 invoiceId) external",
  ];

  const demoUSDC = new ethers.Contract(DEMO_USDC, erc20Abi, signer);
  const invoiceRegistry = new ethers.Contract(INVOICE_REGISTRY, invoiceRegistryAbi, signer);
  const settlementRouter = new ethers.Contract(SETTLEMENT_ROUTER, settlementRouterAbi, signer);

  try {
    // 1. Check invoice details
    console.log("1. Invoice Details:");
    const invoice = await invoiceRegistry.getInvoice(invoiceId);
    console.log(`   Invoice ID: ${invoice.invoiceId.toString()}`);
    console.log(`   Seller: ${invoice.seller}`);
    console.log(`   Buyer: ${invoice.buyer}`);
    console.log(`   Amount: ${ethers.formatUnits(invoice.amount, 6)} USDC`);
    console.log(`   Status: ${invoice.status} (0=Issued, 1=Financed, 2=Paid, 3=Cleared)`);
    console.log(`   Due Date: ${new Date(Number(invoice.dueDate) * 1000).toLocaleString()}\n`);

    // 2. Check buyer balance
    console.log("2. Buyer USDC Balance:");
    const balance = await demoUSDC.balanceOf(buyerAddress);
    const decimals = await demoUSDC.decimals();
    console.log(`   Balance: ${ethers.formatUnits(balance, decimals)} USDC\n`);

    // 3. Check buyer allowance
    console.log("3. Buyer USDC Allowance to SettlementRouter:");
    const allowance = await demoUSDC.allowance(buyerAddress, SETTLEMENT_ROUTER);
    console.log(`   Allowance: ${ethers.formatUnits(allowance, decimals)} USDC\n`);

    // 4. Verify buyer matches invoice buyer
    console.log("4. Buyer Verification:");
    const isBuyer = invoice.buyer.toLowerCase() === buyerAddress.toLowerCase();
    console.log(`   Is Invoice Buyer: ${isBuyer}`);
    if (!isBuyer) {
      console.log(`   ❌ ERROR: Address ${buyerAddress} is not the invoice buyer!`);
      console.log(`   Expected buyer: ${invoice.buyer}\n`);
    } else {
      console.log(`   ✓ Buyer address matches\n`);
    }

    // 5. Check invoice status
    console.log("5. Invoice Status Check:");
    if (invoice.status === 3) {
      console.log(`   ❌ ERROR: Invoice is already cleared (status: 3)\n`);
    } else if (invoice.status === 2) {
      console.log(`   ⚠️  WARNING: Invoice is already paid (status: 2) but not cleared\n`);
    } else {
      console.log(`   ✓ Invoice status is valid for payment\n`);
    }

    // 6. Check if allowance is sufficient
    console.log("6. Allowance Check:");
    if (allowance < invoice.amount) {
      console.log(`   ❌ ERROR: Insufficient allowance!`);
      console.log(`   Required: ${ethers.formatUnits(invoice.amount, decimals)} USDC`);
      console.log(`   Current: ${ethers.formatUnits(allowance, decimals)} USDC\n`);
    } else {
      console.log(`   ✓ Allowance is sufficient\n`);
    }

    // 7. Check if balance is sufficient
    console.log("7. Balance Check:");
    if (balance < invoice.amount) {
      console.log(`   ❌ ERROR: Insufficient balance!`);
      console.log(`   Required: ${ethers.formatUnits(invoice.amount, decimals)} USDC`);
      console.log(`   Current: ${ethers.formatUnits(balance, decimals)} USDC\n`);
    } else {
      console.log(`   ✓ Balance is sufficient\n`);
    }

    // 8. Try to simulate the transaction
    console.log("8. Transaction Simulation:");
    try {
      // Connect as the buyer (we'll use the signer's address if it matches, otherwise we'll just check)
      if (signer.address.toLowerCase() === buyerAddress.toLowerCase()) {
        const callResult = await settlementRouter.payInvoice.staticCall(invoiceId);
        console.log(`   ✓ Simulation successful: Transaction would succeed\n`);
      } else {
        console.log(`   ⚠️  Cannot simulate: Signer address (${signer.address}) doesn't match buyer (${buyerAddress})`);
        console.log(`   You can manually test with: settlementRouter.payInvoice(${invoiceId})\n`);
      }
    } catch (simError) {
      console.log(`   ❌ Simulation failed:`);
      console.log(`   Error: ${simError.message}`);
      if (simError.reason) {
        console.log(`   Reason: ${simError.reason}`);
      }
      if (simError.data) {
        console.log(`   Data: ${simError.data}`);
      }
      console.log();
    }

    // Summary
    console.log("\n=== SUMMARY ===\n");
    const issues = [];
    if (!isBuyer) issues.push("❌ Wrong buyer address");
    if (invoice.status === 3) issues.push("❌ Invoice already cleared");
    if (allowance < invoice.amount) issues.push("❌ Insufficient allowance - need to approve USDC");
    if (balance < invoice.amount) issues.push("❌ Insufficient balance");

    if (issues.length === 0) {
      console.log("✓ All checks passed! The transaction should work.\n");
    } else {
      console.log("Issues found:");
      issues.forEach(issue => console.log(`  ${issue}`));
      console.log();
    }

  } catch (error) {
    console.error("Error during diagnosis:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

