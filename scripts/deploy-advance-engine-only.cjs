const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

/**
 * Deploy only AdvanceEngine contract
 * This script updates the AdvanceEngine contract without redeploying all contracts
 */
async function main() {
  console.log("🚀 Deploying AdvanceEngine contract only...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Load existing contract addresses from .env or contracts.json
  const contractsPath = path.join(__dirname, "..", "contracts.json");
  let existingContracts = {};
  
  if (fs.existsSync(contractsPath)) {
    const contractsData = JSON.parse(fs.readFileSync(contractsPath, "utf8"));
    existingContracts = contractsData.contracts || {};
  }

  // Get addresses from .env or existing contracts
  const invoiceRegistryAddress = process.env.VITE_INVOICE_REGISTRY_ADDRESS || existingContracts.InvoiceRegistry;
  const vaultAddress = process.env.VITE_VAULT_ADDRESS || existingContracts.Vault;

  if (!invoiceRegistryAddress || !vaultAddress) {
    throw new Error("Missing required contract addresses. Please set VITE_INVOICE_REGISTRY_ADDRESS and VITE_VAULT_ADDRESS in .env");
  }

  console.log("Using existing contracts:");
  console.log("  InvoiceRegistry:", invoiceRegistryAddress);
  console.log("  Vault:", vaultAddress);
  console.log("");

  // Deploy AdvanceEngine
  console.log("📝 Deploying AdvanceEngine...");
  const AdvanceEngine = await hre.ethers.getContractFactory("AdvanceEngine");
  const advanceEngine = await AdvanceEngine.deploy(
    invoiceRegistryAddress,
    vaultAddress,
    deployer.address // defaultAdmin
  );

  await advanceEngine.waitForDeployment();
  const advanceEngineAddress = await advanceEngine.getAddress();

  console.log("✅ AdvanceEngine deployed to:", advanceEngineAddress);
  console.log("");

  // Update contracts.json with new AdvanceEngine address
  const network = await hre.ethers.provider.getNetwork();
  const contractsData = {
    network: network.name,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    contracts: {
      ...existingContracts,
      AdvanceEngine: advanceEngineAddress,
    },
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(contractsPath, JSON.stringify(contractsData, null, 2));
  console.log("✅ Updated contracts.json");

  // Print .env update instruction
  console.log("\n📋 Update your .env file with the new AdvanceEngine address:");
  console.log(`VITE_ADVANCE_ENGINE_ADDRESS=${advanceEngineAddress}`);
  console.log("");

  // Grant ADVANCE_ENGINE_ROLE to AdvanceEngine in InvoiceRegistry
  console.log("🔐 Granting ADVANCE_ENGINE_ROLE to AdvanceEngine...");
  try {
    const InvoiceRegistry = await hre.ethers.getContractFactory("InvoiceRegistry");
    const invoiceRegistry = InvoiceRegistry.attach(invoiceRegistryAddress);
    
    const ADVANCE_ENGINE_ROLE = hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes("ADVANCE_ENGINE_ROLE")
    );
    
    const tx = await invoiceRegistry.grantRole(ADVANCE_ENGINE_ROLE, advanceEngineAddress);
    await tx.wait();
    console.log("✅ Granted ADVANCE_ENGINE_ROLE to AdvanceEngine");
  } catch (err) {
    console.error("⚠️  Error granting ADVANCE_ENGINE_ROLE:", err.message);
    console.log("   You may need to grant this role manually");
  }

  // Grant BORROWER_ROLE to AdvanceEngine in Vault
  console.log("🔐 Granting BORROWER_ROLE to AdvanceEngine...");
  try {
    const Vault = await hre.ethers.getContractFactory("Vault");
    const vault = Vault.attach(vaultAddress);
    
    const BORROWER_ROLE = hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes("BORROWER_ROLE")
    );
    
    const tx = await vault.grantRole(BORROWER_ROLE, advanceEngineAddress);
    await tx.wait();
    console.log("✅ Granted BORROWER_ROLE to AdvanceEngine");
  } catch (err) {
    console.error("⚠️  Error granting BORROWER_ROLE:", err.message);
    console.log("   You may need to grant this role manually");
  }

  console.log("\n✅ Deployment complete!");
  console.log("\n📝 Next steps:");
  console.log("1. Update .env file with: VITE_ADVANCE_ENGINE_ADDRESS=" + advanceEngineAddress);
  console.log("2. Restart your frontend to load the new contract address");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
