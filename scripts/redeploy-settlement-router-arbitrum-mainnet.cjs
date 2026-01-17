const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Redeploy SettlementRouter on Arbitrum Mainnet with real USDC address
 * This script ensures SettlementRouter uses the native USDC token on Arbitrum Mainnet
 * instead of a DemoUSDC contract.
 */

async function main() {
  console.log("Redeploying SettlementRouter on Arbitrum Mainnet with real USDC...\n");

  // Verify we're on Arbitrum Mainnet
  const network = await hre.ethers.provider.getNetwork();
  const chainId = network.chainId.toString();
  
  if (chainId !== "42161") {
    console.error("❌ Error: This script must be run on Arbitrum Mainnet (chain ID 42161)");
    console.error(`   Current chain ID: ${chainId}`);
    process.exit(1);
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Real USDC on Arbitrum Mainnet
  const REAL_USDC_ADDRESS = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
  
  // Get other contract addresses from .env or contracts-42161.json
  let contractAddresses = {};
  const contractsJsonPath = path.join(__dirname, "..", "contracts-42161.json");
  
  if (fs.existsSync(contractsJsonPath)) {
    const contractsData = JSON.parse(fs.readFileSync(contractsJsonPath, "utf8"));
    contractAddresses = contractsData.contracts || {};
  }

  // Try to get addresses from environment variables if not in JSON
  const INVOICE_REGISTRY = contractAddresses.InvoiceRegistry || process.env.VITE_42161_INVOICE_REGISTRY_ADDRESS;
  const VAULT = contractAddresses.Vault || process.env.VITE_42161_VAULT_ADDRESS;
  const ADVANCE_ENGINE = contractAddresses.AdvanceEngine || process.env.VITE_42161_ADVANCE_ENGINE_ADDRESS;
  const REPUTATION = contractAddresses.Reputation || process.env.VITE_42161_REPUTATION_ADDRESS;
  const TREASURY = contractAddresses.Treasury || process.env.VITE_TREASURY_ADDRESS || deployer.address;
  const PROTOCOL_FEE_BPS = contractAddresses.ProtocolFeeBps || process.env.VITE_PROTOCOL_FEE_BPS || "50";

  if (!INVOICE_REGISTRY || !VAULT || !ADVANCE_ENGINE || !REPUTATION) {
    console.error("❌ Error: Missing required contract addresses");
    console.error("Required addresses:");
    console.error("  - InvoiceRegistry:", INVOICE_REGISTRY || "MISSING");
    console.error("  - Vault:", VAULT || "MISSING");
    console.error("  - AdvanceEngine:", ADVANCE_ENGINE || "MISSING");
    console.error("  - Reputation:", REPUTATION || "MISSING");
    console.error("\nPlease ensure contracts-42161.json exists or set environment variables.");
    process.exit(1);
  }

  console.log("Using contract addresses:");
  console.log("  Real USDC (Arbitrum Mainnet):", REAL_USDC_ADDRESS);
  console.log("  InvoiceRegistry:", INVOICE_REGISTRY);
  console.log("  Vault:", VAULT);
  console.log("  AdvanceEngine:", ADVANCE_ENGINE);
  console.log("  Reputation:", REPUTATION);
  console.log("  Treasury:", TREASURY);
  console.log("  Protocol Fee:", PROTOCOL_FEE_BPS, "bps\n");

  // Deploy SettlementRouter with real USDC
  console.log("Deploying SettlementRouter with real USDC...");
  const SettlementRouterFactory = await hre.ethers.getContractFactory("SettlementRouter");
  const settlementRouter = await SettlementRouterFactory.deploy(
    REAL_USDC_ADDRESS, // Use real USDC on Arbitrum Mainnet
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
  console.log("✅ SettlementRouter deployed to:", settlementRouterAddress);
  console.log("   Using real USDC address:", REAL_USDC_ADDRESS, "\n");

  // Configure roles
  console.log("Configuring roles and permissions...\n");
  
  // Get existing contract instances
  const InvoiceRegistry = await hre.ethers.getContractAt("InvoiceRegistry", INVOICE_REGISTRY);
  const Vault = await hre.ethers.getContractAt("Vault", VAULT);
  const AdvanceEngine = await hre.ethers.getContractAt("AdvanceEngine", ADVANCE_ENGINE);
  const Reputation = await hre.ethers.getContractAt("Reputation", REPUTATION);

  // Grant SETTLEMENT_ROUTER_ROLE to new SettlementRouter in InvoiceRegistry
  console.log("1. Granting SETTLEMENT_ROUTER_ROLE to SettlementRouter in InvoiceRegistry...");
  const SETTLEMENT_ROUTER_ROLE = await InvoiceRegistry.SETTLEMENT_ROUTER_ROLE();
  const tx1 = await InvoiceRegistry.grantRole(SETTLEMENT_ROUTER_ROLE, settlementRouterAddress);
  await tx1.wait();
  console.log("   ✅ Granted SETTLEMENT_ROUTER_ROLE\n");

  // Grant SETTLEMENT_ROUTER_ROLE to new SettlementRouter in Reputation
  console.log("2. Granting SETTLEMENT_ROUTER_ROLE to SettlementRouter in Reputation...");
  const REPUTATION_ROUTER_ROLE = await Reputation.SETTLEMENT_ROUTER_ROLE();
  const tx2 = await Reputation.grantRole(REPUTATION_ROUTER_ROLE, settlementRouterAddress);
  await tx2.wait();
  console.log("   ✅ Granted SETTLEMENT_ROUTER_ROLE in Reputation\n");

  // Grant SETTLEMENT_ROUTER_ROLE to new SettlementRouter in AdvanceEngine
  console.log("3. Granting SETTLEMENT_ROUTER_ROLE to SettlementRouter in AdvanceEngine...");
  const SETTLEMENT_ROUTER_ROLE_AE = await AdvanceEngine.SETTLEMENT_ROUTER_ROLE();
  const tx3 = await AdvanceEngine.grantRole(SETTLEMENT_ROUTER_ROLE_AE, settlementRouterAddress);
  await tx3.wait();
  console.log("   ✅ Granted SETTLEMENT_ROUTER_ROLE in AdvanceEngine\n");

  // Update contracts-42161.json
  console.log("Updating contracts-42161.json...");
  const contractsData = {
    network: "arbitrumMainnet",
    chainId: "42161",
    chainName: "Arbitrum One",
    deployer: deployer.address,
    contracts: {
      ...contractAddresses,
      SettlementRouter: settlementRouterAddress,
      DemoUSDC: REAL_USDC_ADDRESS, // Update to show real USDC is being used
    },
    deployedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };
  
  fs.writeFileSync(contractsJsonPath, JSON.stringify(contractsData, null, 2));
  console.log("✅ Updated contracts-42161.json\n");

  // Output .env format
  console.log("📋 Add this to your .env file:");
  console.log("====================================");
  console.log(`# Arbitrum One Mainnet (42161) - SettlementRouter Redeployed`);
  console.log(`# IMPORTANT: SettlementRouter now uses REAL USDC`);
  console.log(`VITE_42161_DEMO_USDC_ADDRESS=${REAL_USDC_ADDRESS}`);
  console.log(`VITE_42161_SETTLEMENT_ROUTER_ADDRESS=${settlementRouterAddress}`);
  console.log("====================================");
  console.log("\n✅ Redeployment complete!");
  console.log("\n⚠️  IMPORTANT: Update your .env file with the new SettlementRouter address!");
  console.log("⚠️  The old SettlementRouter will no longer be used.\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });