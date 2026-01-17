require("dotenv").config();
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying DemoUSDC with account:", deployer.address);

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

  // Deploy DemoUSDC
  console.log("\nDeploying DemoUSDC (public mint enabled on testnets)...");
  const DemoUSDC = await hre.ethers.getContractFactory("DemoUSDC");
  const demoUSDC = await DemoUSDC.deploy(deployer.address);
  await demoUSDC.waitForDeployment();
  const demoUSDCAddress = await demoUSDC.getAddress();
  console.log("✅ DemoUSDC deployed to:", demoUSDCAddress);

  // Save to chain-specific contracts file
  const contractsPath = path.join(__dirname, "..", `contracts-${chainId}.json`);
  let contractsData = {
    network: network.name,
    chainId: chainId,
    chainName: chainName,
    deployer: deployer.address,
    contracts: {},
    deployedAt: new Date().toISOString(),
  };

  if (fs.existsSync(contractsPath)) {
    const existing = JSON.parse(fs.readFileSync(contractsPath, "utf8"));
    contractsData = {
      ...existing,
      contracts: {
        ...existing.contracts,
        DemoUSDC: demoUSDCAddress,
      },
      lastUpdated: new Date().toISOString(),
    };
  } else {
    contractsData.contracts.DemoUSDC = demoUSDCAddress;
  }

  // Save to contracts file
  fs.writeFileSync(contractsPath, JSON.stringify(contractsData, null, 2));
  console.log("Contract address saved to:", contractsPath);

  // Print for .env
  console.log("\n====================================");
  console.log("Add this to your .env file:");
  console.log(`VITE_${chainId}_DEMO_USDC_ADDRESS=${demoUSDCAddress}`);
  console.log("====================================");
  console.log("\n✅ DemoUSDC deployment complete!");
  console.log(`📝 Note: Anyone can now mint DemoUSDC on testnets (Mantle Sepolia, Arbitrum Sepolia, Ethereum Sepolia)`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

