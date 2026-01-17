const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  console.log("Deploying SettlementRouter contract only...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Get contract addresses from .env
  const DEMO_USDC = process.env.VITE_DEMO_USDC_ADDRESS;
  const INVOICE_REGISTRY = process.env.VITE_INVOICE_REGISTRY_ADDRESS;
  const VAULT = process.env.VITE_VAULT_ADDRESS;
  const ADVANCE_ENGINE = process.env.VITE_ADVANCE_ENGINE_ADDRESS;
  const REPUTATION = process.env.VITE_REPUTATION_ADDRESS;
  const TREASURY = process.env.VITE_TREASURY_ADDRESS || deployer.address; // Use deployer as treasury if not set
  const PROTOCOL_FEE_BPS = process.env.VITE_PROTOCOL_FEE_BPS || "50"; // 0.5% default

  if (!DEMO_USDC || !INVOICE_REGISTRY || !VAULT || !ADVANCE_ENGINE || !REPUTATION) {
    console.error("Error: Missing required contract addresses in .env file");
    console.error("Required: VITE_DEMO_USDC_ADDRESS, VITE_INVOICE_REGISTRY_ADDRESS, VITE_VAULT_ADDRESS, VITE_ADVANCE_ENGINE_ADDRESS, VITE_REPUTATION_ADDRESS");
    process.exit(1);
  }

  console.log("Using existing contract addresses:");
  console.log("  DemoUSDC:", DEMO_USDC);
  console.log("  InvoiceRegistry:", INVOICE_REGISTRY);
  console.log("  Vault:", VAULT);
  console.log("  AdvanceEngine:", ADVANCE_ENGINE);
  console.log("  Reputation:", REPUTATION);
  console.log("  Treasury:", TREASURY);
  console.log("  Protocol Fee:", PROTOCOL_FEE_BPS, "bps\n");

  // Deploy SettlementRouter
  console.log("Deploying SettlementRouter...");
  const SettlementRouter = await ethers.getContractFactory("SettlementRouter");
  const settlementRouter = await SettlementRouter.deploy(
    DEMO_USDC,
    INVOICE_REGISTRY,
    VAULT,
    ADVANCE_ENGINE,
    REPUTATION,
    TREASURY,
    PROTOCOL_FEE_BPS,
    deployer.address // defaultAdmin
  );
  await settlementRouter.waitForDeployment();
  const settlementRouterAddress = await settlementRouter.getAddress();
  console.log("✓ SettlementRouter deployed to:", settlementRouterAddress);

  // Grant SETTLEMENT_ROUTER_ROLE to SettlementRouter in InvoiceRegistry
  console.log("\nGranting SETTLEMENT_ROUTER_ROLE to SettlementRouter in InvoiceRegistry...");
  const InvoiceRegistry = await ethers.getContractFactory("InvoiceRegistry");
  const invoiceRegistry = InvoiceRegistry.attach(INVOICE_REGISTRY);
  const SETTLEMENT_ROUTER_ROLE = await invoiceRegistry.SETTLEMENT_ROUTER_ROLE();
  const hasRole = await invoiceRegistry.hasRole(SETTLEMENT_ROUTER_ROLE, settlementRouterAddress);
  if (!hasRole) {
    const tx1 = await invoiceRegistry.grantRole(SETTLEMENT_ROUTER_ROLE, settlementRouterAddress);
    await tx1.wait();
    console.log("✓ SETTLEMENT_ROUTER_ROLE granted");
  } else {
    console.log("✓ SETTLEMENT_ROUTER_ROLE already granted");
  }

  // Grant SETTLEMENT_ROUTER_ROLE to SettlementRouter in AdvanceEngine
  console.log("\nGranting SETTLEMENT_ROUTER_ROLE to SettlementRouter in AdvanceEngine...");
  const AdvanceEngine = await ethers.getContractFactory("AdvanceEngine");
  const advanceEngine = AdvanceEngine.attach(ADVANCE_ENGINE);
  const advanceEngineRole = await advanceEngine.SETTLEMENT_ROUTER_ROLE();
  const hasAdvanceRole = await advanceEngine.hasRole(advanceEngineRole, settlementRouterAddress);
  if (!hasAdvanceRole) {
    const tx2 = await advanceEngine.grantRole(advanceEngineRole, settlementRouterAddress);
    await tx2.wait();
    console.log("✓ SETTLEMENT_ROUTER_ROLE granted in AdvanceEngine");
  } else {
    console.log("✓ SETTLEMENT_ROUTER_ROLE already granted in AdvanceEngine");
  }

  // Grant SETTLEMENT_ROUTER_ROLE to SettlementRouter in Reputation
  console.log("\nGranting SETTLEMENT_ROUTER_ROLE to SettlementRouter in Reputation...");
  const Reputation = await ethers.getContractFactory("Reputation");
  const reputation = Reputation.attach(REPUTATION);
  const reputationRole = await reputation.SETTLEMENT_ROUTER_ROLE();
  const hasReputationRole = await reputation.hasRole(reputationRole, settlementRouterAddress);
  if (!hasReputationRole) {
    const tx3 = await reputation.grantRole(reputationRole, settlementRouterAddress);
    await tx3.wait();
    console.log("✓ SETTLEMENT_ROUTER_ROLE granted in Reputation");
  } else {
    console.log("✓ SETTLEMENT_ROUTER_ROLE already granted in Reputation");
  }

  // Update contracts.json
  const contractsPath = path.join(__dirname, "..", "contracts.json");
  let contractsData = {};
  if (fs.existsSync(contractsPath)) {
    contractsData = JSON.parse(fs.readFileSync(contractsPath, "utf8"));
  }

  // Get network name
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? "mantleSepolia" : network.name;
  
  if (!contractsData[networkName]) {
    contractsData[networkName] = {};
  }

  contractsData[networkName].SettlementRouter = settlementRouterAddress;

  fs.writeFileSync(contractsPath, JSON.stringify(contractsData, null, 2));
  console.log("\n✓ Updated contracts.json");

  console.log("\n=== Deployment Summary ===");
  console.log("SettlementRouter:", settlementRouterAddress);
  console.log("\n⚠️  IMPORTANT: Update your .env file with the new SettlementRouter address:");
  console.log(`VITE_SETTLEMENT_ROUTER_ADDRESS=${settlementRouterAddress}`);
  console.log("\nThen restart your dev server for the changes to take effect.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

