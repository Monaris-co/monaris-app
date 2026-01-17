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
  
  if (process.env.DEPLOYER_MNEMONIC) {
    console.log("Using mnemonic (seed phrase) for deployment");
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

  // Load existing contracts if available
  const contractsPath = path.join(__dirname, "..", `contracts-${chainId}.json`);
  let existingContracts = {};
  
  if (fs.existsSync(contractsPath)) {
    const existing = JSON.parse(fs.readFileSync(contractsPath, "utf8"));
    existingContracts = existing.contracts || {};
    console.log("\nLoaded existing contract addresses:");
    Object.keys(existingContracts).forEach(key => {
      console.log(`  ${key}: ${existingContracts[key]}`);
    });
  }

  // Required addresses for SettlementRouter
  // These should already be deployed on Arbitrum Mainnet
  const demoUSDCAddress = existingContracts.DemoUSDC || "0x239f6Dfd77c4D5FF3017daAD4d3D3cD8758Cc030";
  const invoiceRegistryAddress = existingContracts.InvoiceRegistry || "0x8b00dEE5209e73F1D92bE834223D3497c57b4263";
  const vaultAddress = existingContracts.Vault || process.env.VAULT_ADDRESS || "0x0000000000000000000000000000000000000000";
  const advanceEngineAddress = existingContracts.AdvanceEngine || process.env.ADVANCE_ENGINE_ADDRESS || "0x0000000000000000000000000000000000000000";

  console.log("\nUsing these contract addresses for SettlementRouter:");
  console.log(`  DemoUSDC: ${demoUSDCAddress}`);
  console.log(`  InvoiceRegistry: ${invoiceRegistryAddress}`);
  console.log(`  Vault: ${vaultAddress}`);
  console.log(`  AdvanceEngine: ${advanceEngineAddress}`);

  const contracts = { ...existingContracts };

  // 1. Deploy Reputation
  console.log("\n1. Deploying Reputation...");
  const Reputation = await hre.ethers.getContractFactory("Reputation");
  const reputation = await retryOperation(async () => {
    // Get current gas price and set max fee per gas slightly higher for reliability
    const feeData = await hre.ethers.provider.getFeeData();
    const maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice || hre.ethers.parseUnits("0.05", "gwei");
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || hre.ethers.parseUnits("0.01", "gwei");
    
    // Estimate gas first
    let estimatedGas;
    try {
      estimatedGas = await Reputation.signer.estimateGas(
        Reputation.getDeployTransaction(deployer.address)
      );
      console.log(`  Estimated gas: ${estimatedGas.toString()}`);
    } catch (e) {
      console.log(`  Gas estimation failed, using default: ${e.message.substring(0, 50)}`);
      estimatedGas = 2000000n; // Default estimate for Reputation
    }
    
    // Add 20% buffer for safety
    const gasLimit = estimatedGas + (estimatedGas * 20n / 100n);
    
    return await Reputation.deploy(deployer.address, {
      maxFeePerGas,
      maxPriorityFeePerGas,
      gasLimit,
    });
  });
  await reputation.waitForDeployment();
  await wait();
  const reputationAddress = await reputation.getAddress();
  contracts.Reputation = reputationAddress;
  console.log("✅ Reputation deployed to:", reputationAddress);

  // 2. Deploy SettlementRouter
  console.log("\n2. Deploying SettlementRouter...");
  const SettlementRouterFactory = await hre.ethers.getContractFactory("SettlementRouter");
  const protocolFeeBps = 50; // 0.5% = 50 basis points
  const treasury = deployer.address; // Can be changed later
  
  const settlementRouter = await retryOperation(async () => {
    // Get current gas price and set max fee per gas slightly higher for reliability
    const feeData = await hre.ethers.provider.getFeeData();
    const maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice || hre.ethers.parseUnits("0.05", "gwei");
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || hre.ethers.parseUnits("0.01", "gwei");
    
    // Estimate gas first
    let estimatedGas;
    try {
      estimatedGas = await SettlementRouterFactory.signer.estimateGas(
        SettlementRouterFactory.getDeployTransaction(
          demoUSDCAddress,
          invoiceRegistryAddress,
          vaultAddress,
          advanceEngineAddress,
          reputationAddress,
          treasury,
          protocolFeeBps,
          deployer.address
        )
      );
      console.log(`  Estimated gas: ${estimatedGas.toString()}`);
    } catch (e) {
      console.log(`  Gas estimation failed, using default: ${e.message.substring(0, 50)}`);
      estimatedGas = 3000000n; // Default estimate for SettlementRouter
    }
    
    // Add 20% buffer for safety
    const gasLimit = estimatedGas + (estimatedGas * 20n / 100n);
    
    return await SettlementRouterFactory.deploy(
      demoUSDCAddress,
      invoiceRegistryAddress,
      vaultAddress,
      advanceEngineAddress,
      reputationAddress,
      treasury,
      protocolFeeBps,
      deployer.address,
      {
        maxFeePerGas,
        maxPriorityFeePerGas,
        gasLimit,
      }
    );
  });
  await settlementRouter.waitForDeployment();
  await wait();
  const settlementRouterAddress = await settlementRouter.getAddress();
  contracts.SettlementRouter = settlementRouterAddress;
  contracts.Treasury = treasury;
  contracts.ProtocolFeeBps = protocolFeeBps.toString();
  console.log("✅ SettlementRouter deployed to:", settlementRouterAddress);

  // 3. Save addresses to contracts.json (chain-specific)
  console.log("\n3. Saving contract addresses...");
  const contractsData = {
    network: network.name,
    chainId: chainId,
    chainName: chainName,
    deployer: deployer.address,
    contracts: contracts,
    deployedAt: existingContracts ? new Date().toISOString() : new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };
  
  fs.writeFileSync(contractsPath, JSON.stringify(contractsData, null, 2));
  console.log("Contract addresses saved to:", contractsPath);

  // 4. Print summary
  console.log("\n====================================");
  console.log(`Chain: ${chainName} (${chainId})`);
  console.log(`\nNewly deployed contracts:`);
  console.log(`VITE_${chainId}_REPUTATION_ADDRESS=${reputationAddress}`);
  console.log(`VITE_${chainId}_SETTLEMENT_ROUTER_ADDRESS=${settlementRouterAddress}`);
  console.log("\n====================================");
  console.log("\n✅ Deployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
