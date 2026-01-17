import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying DemoUSDC with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // Verify chain ID
  const network = await ethers.provider.getNetwork();
  console.log("Network chain ID:", network.chainId.toString());
  
  if (network.chainId.toString() !== "5003") {
    console.warn("WARNING: Not deploying to Mantle Sepolia Testnet (chainId 5003)");
  }

  // Deploy DemoUSDC
  console.log("\nDeploying DemoUSDC (public mint enabled)...");
  const DemoUSDC = await ethers.getContractFactory("DemoUSDC");
  const demoUSDC = await DemoUSDC.deploy(deployer.address);
  await demoUSDC.waitForDeployment();
  const demoUSDCAddress = await demoUSDC.getAddress();
  console.log("✅ DemoUSDC deployed to:", demoUSDCAddress);

  // Load existing contracts.json if it exists
  const contractsPath = path.join(__dirname, "..", "contracts.json");
  let contractsData: any = {
    network: network.name,
    chainId: network.chainId.toString(),
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

  // Save to contracts.json
  fs.writeFileSync(contractsPath, JSON.stringify(contractsData, null, 2));
  console.log("Contract address saved to:", contractsPath);

  // Print for .env
  console.log("\n====================================");
  console.log("Add this to your .env file:");
  console.log(`VITE_DEMO_USDC_ADDRESS=${demoUSDCAddress}`);
  console.log("====================================");
  console.log("\n✅ DemoUSDC deployment complete!");
  console.log("📝 Note: Anyone can now mint DemoUSDC on testnet (chainId 5003)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

