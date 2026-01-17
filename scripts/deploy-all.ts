import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // Verify chain ID
  const network = await ethers.provider.getNetwork();
  console.log("Network chain ID:", network.chainId.toString());
  
  if (network.chainId.toString() !== "5003") {
    console.warn("WARNING: Not deploying to Mantle Sepolia Testnet (chainId 5003)");
  }

  const contracts: Record<string, string> = {};

  // 1. Deploy DemoUSDC
  console.log("\n1. Deploying DemoUSDC...");
  const DemoUSDC = await ethers.getContractFactory("DemoUSDC");
  const demoUSDC = await DemoUSDC.deploy(deployer.address);
  await demoUSDC.waitForDeployment();
  const demoUSDCAddress = await demoUSDC.getAddress();
  contracts.DemoUSDC = demoUSDCAddress;
  console.log("DemoUSDC deployed to:", demoUSDCAddress);

  // 2. Deploy InvoiceNFT (can set InvoiceRegistry after deployment)
  console.log("\n2. Deploying InvoiceNFT...");
  const InvoiceNFTFactory = await ethers.getContractFactory("InvoiceNFT");
  const invoiceNFT = await InvoiceNFTFactory.deploy(deployer.address);
  await invoiceNFT.waitForDeployment();
  const invoiceNFTAddress = await invoiceNFT.getAddress();
  contracts.InvoiceNFT = invoiceNFTAddress;
  console.log("InvoiceNFT deployed to:", invoiceNFTAddress);

  // 3. Deploy InvoiceRegistry (with InvoiceNFT address)
  console.log("\n3. Deploying InvoiceRegistry...");
  const InvoiceRegistry = await ethers.getContractFactory("InvoiceRegistry");
  const invoiceRegistry = await InvoiceRegistry.deploy(invoiceNFTAddress, deployer.address);
  await invoiceRegistry.waitForDeployment();
  const invoiceRegistryAddress = await invoiceRegistry.getAddress();
  contracts.InvoiceRegistry = invoiceRegistryAddress;
  console.log("InvoiceRegistry deployed to:", invoiceRegistryAddress);
  
  // Set InvoiceRegistry address in InvoiceNFT
  console.log("\n   Setting InvoiceRegistry address in InvoiceNFT...");
  const txSetRegistry = await invoiceNFT.setInvoiceRegistry(invoiceRegistryAddress);
  await txSetRegistry.wait();
  console.log("InvoiceRegistry address set in InvoiceNFT");

  // 4. Deploy Vault
  console.log("\n4. Deploying Vault...");
  const Vault = await ethers.getContractFactory("Vault");
  const vault = await Vault.deploy(demoUSDCAddress, deployer.address);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  contracts.Vault = vaultAddress;
  console.log("Vault deployed to:", vaultAddress);

  // 5. Deploy AdvanceEngine
  console.log("\n5. Deploying AdvanceEngine...");
  const AdvanceEngine = await ethers.getContractFactory("AdvanceEngine");
  const advanceEngine = await AdvanceEngine.deploy(
    invoiceRegistryAddress,
    vaultAddress,
    deployer.address
  );
  await advanceEngine.waitForDeployment();
  const advanceEngineAddress = await advanceEngine.getAddress();
  contracts.AdvanceEngine = advanceEngineAddress;
  console.log("AdvanceEngine deployed to:", advanceEngineAddress);

  // 6. Deploy Reputation
  console.log("\n6. Deploying Reputation...");
  const Reputation = await ethers.getContractFactory("Reputation");
  const reputation = await Reputation.deploy(deployer.address);
  await reputation.waitForDeployment();
  const reputationAddress = await reputation.getAddress();
  contracts.Reputation = reputationAddress;
  console.log("Reputation deployed to:", reputationAddress);

  // 7. Deploy SettlementRouter
  console.log("\n7. Deploying SettlementRouter...");
  const SettlementRouterFactory = await ethers.getContractFactory("SettlementRouter");
  const protocolFeeBps = 50; // 0.5% = 50 basis points
  const treasury = deployer.address; // Can be changed later
  const settlementRouter = await SettlementRouterFactory.deploy(
    demoUSDCAddress,
    invoiceRegistryAddress,
    vaultAddress,
    advanceEngineAddress,
    reputationAddress,
    treasury,
    protocolFeeBps,
    deployer.address
  );
  await settlementRouter.waitForDeployment();
  const settlementRouterAddress = await settlementRouter.getAddress();
  contracts.SettlementRouter = settlementRouterAddress;
  contracts.Treasury = treasury;
  contracts.ProtocolFeeBps = protocolFeeBps.toString();
  console.log("SettlementRouter deployed to:", settlementRouterAddress);

  // 8. Configure roles and permissions
  console.log("\n8. Configuring roles and permissions...");
  
  // Grant MINTER_ROLE to InvoiceRegistry in InvoiceNFT
  const MINTER_ROLE = await invoiceNFT.MINTER_ROLE();
  const tx0 = await invoiceNFT.grantRole(MINTER_ROLE, invoiceRegistryAddress);
  await tx0.wait();
  console.log("Granted MINTER_ROLE to InvoiceRegistry in InvoiceNFT");
  
  // Grant SETTLEMENT_ROUTER_ROLE to SettlementRouter in InvoiceRegistry
  const SETTLEMENT_ROUTER_ROLE = await invoiceRegistry.SETTLEMENT_ROUTER_ROLE();
  const tx1 = await invoiceRegistry.grantRole(SETTLEMENT_ROUTER_ROLE, settlementRouterAddress);
  await tx1.wait();
  console.log("Granted SETTLEMENT_ROUTER_ROLE to SettlementRouter");

  // Grant ADVANCE_ENGINE_ROLE to AdvanceEngine in InvoiceRegistry
  const ADVANCE_ENGINE_ROLE = await invoiceRegistry.ADVANCE_ENGINE_ROLE();
  const tx2 = await invoiceRegistry.grantRole(ADVANCE_ENGINE_ROLE, advanceEngineAddress);
  await tx2.wait();
  console.log("Granted ADVANCE_ENGINE_ROLE to AdvanceEngine");

  // Grant SETTLEMENT_ROUTER_ROLE to SettlementRouter in Reputation
  const REPUTATION_ROUTER_ROLE = await reputation.SETTLEMENT_ROUTER_ROLE();
  const tx3 = await reputation.grantRole(REPUTATION_ROUTER_ROLE, settlementRouterAddress);
  await tx3.wait();
  console.log("Granted SETTLEMENT_ROUTER_ROLE to SettlementRouter in Reputation");

  // Grant BORROWER_ROLE to AdvanceEngine in Vault
  const BORROWER_ROLE = await vault.BORROWER_ROLE();
  const tx4 = await vault.grantRole(BORROWER_ROLE, advanceEngineAddress);
  await tx4.wait();
  console.log("Granted BORROWER_ROLE to AdvanceEngine in Vault");

  // Grant SETTLEMENT_ROUTER_ROLE to SettlementRouter in AdvanceEngine
  const SETTLEMENT_ROUTER_ROLE_AE = await advanceEngine.SETTLEMENT_ROUTER_ROLE();
  const tx5 = await advanceEngine.grantRole(SETTLEMENT_ROUTER_ROLE_AE, settlementRouterAddress);
  await tx5.wait();
  console.log("Granted SETTLEMENT_ROUTER_ROLE to SettlementRouter in AdvanceEngine");

  // 9. Save addresses to contracts.json
  console.log("\n9. Saving contract addresses...");
  const contractsPath = path.join(__dirname, "..", "contracts.json");
  const contractsData = {
    network: network.name,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    contracts: contracts,
    deployedAt: new Date().toISOString(),
  };
  
  fs.writeFileSync(contractsPath, JSON.stringify(contractsData, null, 2));
  console.log("Contract addresses saved to:", contractsPath);

  // 10. Save addresses to .env format for frontend
  console.log("\n10. Contract deployment summary:");
  console.log("====================================");
  console.log(`VITE_DEMO_USDC_ADDRESS=${contracts.DemoUSDC}`);
  console.log(`VITE_INVOICE_NFT_ADDRESS=${contracts.InvoiceNFT}`);
  console.log(`VITE_INVOICE_REGISTRY_ADDRESS=${contracts.InvoiceRegistry}`);
  console.log(`VITE_VAULT_ADDRESS=${contracts.Vault}`);
  console.log(`VITE_ADVANCE_ENGINE_ADDRESS=${contracts.AdvanceEngine}`);
  console.log(`VITE_REPUTATION_ADDRESS=${contracts.Reputation}`);
  console.log(`VITE_SETTLEMENT_ROUTER_ADDRESS=${contracts.SettlementRouter}`);
  console.log("====================================");
  console.log("\n✅ Deployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

