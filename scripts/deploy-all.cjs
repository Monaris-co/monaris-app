require("dotenv").config();
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Helper to retry transactions
async function retryOperation(operation, maxRetries = 5, delay = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`Retry ${i + 1}/${maxRetries} after ${delay/1000}s... (Error: ${error.message.substring(0, 50)})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.5, 15000); // Exponential backoff, max 15s
    }
  }
}

// Helper to wait between deployments
async function wait(ms = 3000) {
  console.log(`Waiting ${ms/1000}s...`);
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  // Verify either private key or mnemonic is loaded
  if (!process.env.DEPLOYER_PRIVATE_KEY && !process.env.DEPLOYER_MNEMONIC) {
    throw new Error("Neither DEPLOYER_PRIVATE_KEY nor DEPLOYER_MNEMONIC found in .env file. Please provide one of them.");
  }
  
  const [deployer] = await hre.ethers.getSigners();
  
  if (!deployer || !deployer.address) {
    throw new Error("No deployer account found. Check DEPLOYER_PRIVATE_KEY or DEPLOYER_MNEMONIC in .env");
  }
  console.log("Deploying contracts with account:", deployer.address);
  
  // Show which method is being used (for debugging)
  if (process.env.DEPLOYER_MNEMONIC) {
    console.log("Using mnemonic (seed phrase) for deployment");
    if (process.env.DEPLOYER_ACCOUNT_INDEX) {
      console.log(`Account index: ${process.env.DEPLOYER_ACCOUNT_INDEX}`);
    }
  } else {
    console.log("Using private key for deployment");
  }

  // Verify chain ID
  const network = await hre.ethers.provider.getNetwork();
  const chainId = network.chainId.toString();
  console.log("Network:", network.name);
  console.log("Chain ID:", chainId);

  // Chain metadata
  const chainNames = {
    "5003": "Mantle Sepolia",
    "5000": "Mantle Mainnet",
    "421614": "Arbitrum Sepolia",
    "42161": "Arbitrum One",
    "11155111": "Ethereum Sepolia",
    "1": "Ethereum Mainnet",
  };
  const chainName = chainNames[chainId] || `Chain ${chainId}`;
  console.log(`Deploying to: ${chainName} (${chainId})`);

  // Native currency symbol based on chain
  const nativeSymbols = {
    "5003": "MNT",
    "5000": "MNT",
    "421614": "ETH",
    "42161": "ETH",
    "11155111": "ETH",
    "1": "ETH",
  };
  const nativeSymbol = nativeSymbols[chainId] || "ETH";
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), nativeSymbol);

  const contracts = {};

  // 1. Get or deploy USDC token
  // On mainnets (Arbitrum Mainnet 42161, Ethereum Mainnet 1), use real USDC
  // On testnets, deploy DemoUSDC
  let demoUSDCAddress;
  const isMainnet = chainId === "42161" || chainId === "1"; // Arbitrum Mainnet or Ethereum Mainnet
  
  if (isMainnet) {
    console.log("\n1. Using real USDC token for mainnet...");
    if (chainId === "42161") {
      // Arbitrum Mainnet USDC (Native USDC on Arbitrum)
      demoUSDCAddress = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
      console.log("Using real USDC on Arbitrum Mainnet:", demoUSDCAddress);
    } else if (chainId === "1") {
      // Ethereum Mainnet USDC
      demoUSDCAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
      console.log("Using real USDC on Ethereum Mainnet:", demoUSDCAddress);
    }
    contracts.DemoUSDC = demoUSDCAddress;
  } else {
    console.log("\n1. Deploying DemoUSDC for testnet...");
    const DemoUSDC = await hre.ethers.getContractFactory("DemoUSDC");
    const demoUSDC = await retryOperation(async () => {
      return await DemoUSDC.deploy(deployer.address);
    });
    console.log("Waiting for deployment confirmation...");
    await demoUSDC.waitForDeployment();
    await wait();
    demoUSDCAddress = await demoUSDC.getAddress();
    contracts.DemoUSDC = demoUSDCAddress;
    console.log("DemoUSDC deployed to:", demoUSDCAddress);
  }

  // 2. Deploy InvoiceNFT (before InvoiceRegistry due to dependency)
  console.log("\n2. Deploying InvoiceNFT...");
  const InvoiceNFTFactory = await hre.ethers.getContractFactory("InvoiceNFT");
  const invoiceNFT = await retryOperation(async () => {
    return await InvoiceNFTFactory.deploy(deployer.address);
  });
  await invoiceNFT.waitForDeployment();
  await wait();
  const invoiceNFTAddress = await invoiceNFT.getAddress();
  contracts.InvoiceNFT = invoiceNFTAddress;
  console.log("InvoiceNFT deployed to:", invoiceNFTAddress);

  // 3. Deploy InvoiceRegistry (with InvoiceNFT address)
  console.log("\n3. Deploying InvoiceRegistry...");
  const InvoiceRegistry = await hre.ethers.getContractFactory("InvoiceRegistry");
  const invoiceRegistry = await retryOperation(async () => {
    return await InvoiceRegistry.deploy(invoiceNFTAddress, deployer.address);
  });
  await invoiceRegistry.waitForDeployment();
  await wait();
  const invoiceRegistryAddress = await invoiceRegistry.getAddress();
  contracts.InvoiceRegistry = invoiceRegistryAddress;
  console.log("InvoiceRegistry deployed to:", invoiceRegistryAddress);
  
  // Set InvoiceRegistry address in InvoiceNFT
  console.log("\n   Setting InvoiceRegistry address in InvoiceNFT...");
  const txSetRegistry = await retryOperation(async () => {
    return await invoiceNFT.setInvoiceRegistry(invoiceRegistryAddress);
  });
  await txSetRegistry.wait();
  console.log("InvoiceRegistry address set in InvoiceNFT");

  // 4. Deploy USMTPlus (receipt token for vault)
  console.log("\n4. Deploying USMTPlus...");
  const USMTPlus = await hre.ethers.getContractFactory("USMTPlus");
  const usmtPlus = await retryOperation(async () => {
    return await USMTPlus.deploy(deployer.address);
  });
  await usmtPlus.waitForDeployment();
  await wait();
  const usmtPlusAddress = await usmtPlus.getAddress();
  contracts.USMTPlus = usmtPlusAddress;
  console.log("USMTPlus deployed to:", usmtPlusAddress);

  // 5. Deploy Vault (requires USMTPlus address)
  console.log("\n5. Deploying Vault...");
  const Vault = await hre.ethers.getContractFactory("Vault");
  const vault = await retryOperation(async () => {
    return await Vault.deploy(demoUSDCAddress, usmtPlusAddress, deployer.address);
  });
  await vault.waitForDeployment();
  await wait();
  const vaultAddress = await vault.getAddress();
  contracts.Vault = vaultAddress;
  console.log("Vault deployed to:", vaultAddress);

  // 6. Deploy Staking (requires USMTPlus address)
  console.log("\n6. Deploying Staking...");
  const Staking = await hre.ethers.getContractFactory("Staking");
  const staking = await retryOperation(async () => {
    return await Staking.deploy(usmtPlusAddress, deployer.address);
  });
  await staking.waitForDeployment();
  await wait();
  const stakingAddress = await staking.getAddress();
  contracts.Staking = stakingAddress;
  console.log("Staking deployed to:", stakingAddress);

  // 7. Deploy AdvanceEngine
  console.log("\n7. Deploying AdvanceEngine...");
  const AdvanceEngine = await hre.ethers.getContractFactory("AdvanceEngine");
  const advanceEngine = await retryOperation(async () => {
    return await AdvanceEngine.deploy(
      invoiceRegistryAddress,
      vaultAddress,
      deployer.address
    );
  });
  await advanceEngine.waitForDeployment();
  await wait();
  const advanceEngineAddress = await advanceEngine.getAddress();
  contracts.AdvanceEngine = advanceEngineAddress;
  console.log("AdvanceEngine deployed to:", advanceEngineAddress);

  // 8. Deploy Reputation
  console.log("\n8. Deploying Reputation...");
  const Reputation = await hre.ethers.getContractFactory("Reputation");
  const reputation = await retryOperation(async () => {
    return await Reputation.deploy(deployer.address);
  });
  await reputation.waitForDeployment();
  await wait();
  const reputationAddress = await reputation.getAddress();
  contracts.Reputation = reputationAddress;
  console.log("Reputation deployed to:", reputationAddress);

  // 9. Deploy SettlementRouter
  console.log("\n9. Deploying SettlementRouter...");
  const SettlementRouterFactory = await hre.ethers.getContractFactory("SettlementRouter");
  const protocolFeeBps = 50; // 0.5% = 50 basis points
  const treasury = deployer.address; // Can be changed later
  const settlementRouter = await retryOperation(async () => {
    return await SettlementRouterFactory.deploy(
      demoUSDCAddress,
      invoiceRegistryAddress,
      vaultAddress,
      advanceEngineAddress,
      reputationAddress,
      treasury,
      protocolFeeBps,
      deployer.address
    );
  });
  await settlementRouter.waitForDeployment();
  await wait();
  const settlementRouterAddress = await settlementRouter.getAddress();
  contracts.SettlementRouter = settlementRouterAddress;
  contracts.Treasury = treasury;
  contracts.ProtocolFeeBps = protocolFeeBps.toString();
  console.log("SettlementRouter deployed to:", settlementRouterAddress);

  // 10. Configure roles and permissions
  console.log("\n10. Configuring roles and permissions...");
  await wait(5000); // Extra wait before role granting to ensure all deployments are settled
  
  // Grant MINTER_ROLE to InvoiceRegistry in InvoiceNFT
  const INVOICE_NFT_MINTER_ROLE = await invoiceNFT.MINTER_ROLE();
  const tx0 = await retryOperation(async () => {
    return await invoiceNFT.grantRole(INVOICE_NFT_MINTER_ROLE, invoiceRegistryAddress);
  });
  await tx0.wait();
  await wait(2000);
  console.log("Granted MINTER_ROLE to InvoiceRegistry in InvoiceNFT");
  
  // Grant MINTER_ROLE to Vault in USMTPlus
  const MINTER_ROLE = await usmtPlus.MINTER_ROLE();
  const tx0a = await retryOperation(async () => {
    return await usmtPlus.grantRole(MINTER_ROLE, vaultAddress);
  });
  await tx0a.wait();
  await wait(2000);
  console.log("Granted MINTER_ROLE to Vault in USMTPlus");
  
  // Grant SETTLEMENT_ROUTER_ROLE to SettlementRouter in InvoiceRegistry
  const SETTLEMENT_ROUTER_ROLE = await invoiceRegistry.SETTLEMENT_ROUTER_ROLE();
  const tx1 = await retryOperation(async () => {
    return await invoiceRegistry.grantRole(SETTLEMENT_ROUTER_ROLE, settlementRouterAddress);
  });
  await tx1.wait();
  await wait(2000);
  console.log("Granted SETTLEMENT_ROUTER_ROLE to SettlementRouter");

  // Grant ADVANCE_ENGINE_ROLE to AdvanceEngine in InvoiceRegistry
  const ADVANCE_ENGINE_ROLE = await invoiceRegistry.ADVANCE_ENGINE_ROLE();
  const tx2 = await retryOperation(async () => {
    return await invoiceRegistry.grantRole(ADVANCE_ENGINE_ROLE, advanceEngineAddress);
  });
  await tx2.wait();
  await wait(2000);
  console.log("Granted ADVANCE_ENGINE_ROLE to AdvanceEngine");

  // Grant SETTLEMENT_ROUTER_ROLE to SettlementRouter in Reputation
  const REPUTATION_ROUTER_ROLE = await reputation.SETTLEMENT_ROUTER_ROLE();
  const tx3 = await retryOperation(async () => {
    return await reputation.grantRole(REPUTATION_ROUTER_ROLE, settlementRouterAddress);
  });
  await tx3.wait();
  await wait(2000);
  console.log("Granted SETTLEMENT_ROUTER_ROLE to SettlementRouter in Reputation");

  // Grant BORROWER_ROLE to AdvanceEngine in Vault
  const BORROWER_ROLE = await vault.BORROWER_ROLE();
  const tx4 = await retryOperation(async () => {
    return await vault.grantRole(BORROWER_ROLE, advanceEngineAddress);
  });
  await tx4.wait();
  await wait(2000);
  console.log("Granted BORROWER_ROLE to AdvanceEngine in Vault");

  // Grant SETTLEMENT_ROUTER_ROLE to SettlementRouter in AdvanceEngine
  const SETTLEMENT_ROUTER_ROLE_AE = await advanceEngine.SETTLEMENT_ROUTER_ROLE();
  const tx5 = await retryOperation(async () => {
    return await advanceEngine.grantRole(SETTLEMENT_ROUTER_ROLE_AE, settlementRouterAddress);
  });
  await tx5.wait();
  await wait(2000);
  console.log("Granted SETTLEMENT_ROUTER_ROLE to SettlementRouter in AdvanceEngine");

  // 11. Save addresses to contracts.json (chain-specific)
  console.log("\n11. Saving contract addresses...");
  const contractsPath = path.join(__dirname, "..", `contracts-${chainId}.json`);
  const contractsData = {
    network: network.name,
    chainId: chainId,
    chainName: chainName,
    deployer: deployer.address,
    contracts: contracts,
    deployedAt: new Date().toISOString(),
  };
  
  fs.writeFileSync(contractsPath, JSON.stringify(contractsData, null, 2));
  console.log("Contract addresses saved to:", contractsPath);

  // 12. Save addresses to .env format for frontend (chain-specific)
  console.log("\n12. Contract deployment summary:");
  console.log("====================================");
  console.log(`Chain: ${chainName} (${chainId})`);
  console.log(`\nAdd these to your .env file (chain-specific):`);
  console.log(`\n# ${chainName} (${chainId})`);
  console.log(`VITE_${chainId}_DEMO_USDC_ADDRESS=${contracts.DemoUSDC}`);
  console.log(`VITE_${chainId}_INVOICE_NFT_ADDRESS=${contracts.InvoiceNFT}`);
  console.log(`VITE_${chainId}_INVOICE_REGISTRY_ADDRESS=${contracts.InvoiceRegistry}`);
  console.log(`VITE_${chainId}_USMT_PLUS_ADDRESS=${contracts.USMTPlus}`);
  console.log(`VITE_${chainId}_VAULT_ADDRESS=${contracts.Vault}`);
  console.log(`VITE_${chainId}_STAKING_ADDRESS=${contracts.Staking}`);
  console.log(`VITE_${chainId}_ADVANCE_ENGINE_ADDRESS=${contracts.AdvanceEngine}`);
  console.log(`VITE_${chainId}_REPUTATION_ADDRESS=${contracts.Reputation}`);
  console.log(`VITE_${chainId}_SETTLEMENT_ROUTER_ADDRESS=${contracts.SettlementRouter}`);
  console.log("\nOr use legacy format (backward compatible):");
  console.log(`VITE_DEMO_USDC_ADDRESS=${contracts.DemoUSDC}`);
  console.log(`VITE_INVOICE_NFT_ADDRESS=${contracts.InvoiceNFT}`);
  console.log(`VITE_INVOICE_REGISTRY_ADDRESS=${contracts.InvoiceRegistry}`);
  console.log(`VITE_USMT_PLUS_ADDRESS=${contracts.USMTPlus}`);
  console.log(`VITE_VAULT_ADDRESS=${contracts.Vault}`);
  console.log(`VITE_STAKING_ADDRESS=${contracts.Staking}`);
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

