const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  console.log("Deploying Reputation contract only...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Deploy Reputation
  console.log("Deploying Reputation...");
  const Reputation = await ethers.getContractFactory("Reputation");
  const reputation = await Reputation.deploy(deployer.address); // defaultAdmin
  await reputation.waitForDeployment();
  const reputationAddress = await reputation.getAddress();
  console.log("✓ Reputation deployed to:", reputationAddress);

  // Grant SETTLEMENT_ROUTER_ROLE to SettlementRouter in Reputation
  const SETTLEMENT_ROUTER = process.env.VITE_SETTLEMENT_ROUTER_ADDRESS;
  if (SETTLEMENT_ROUTER) {
    console.log("\nGranting SETTLEMENT_ROUTER_ROLE to SettlementRouter in Reputation...");
    const SETTLEMENT_ROUTER_ROLE = await reputation.SETTLEMENT_ROUTER_ROLE();
    const hasRole = await reputation.hasRole(SETTLEMENT_ROUTER_ROLE, SETTLEMENT_ROUTER);
    if (!hasRole) {
      const tx = await reputation.grantRole(SETTLEMENT_ROUTER_ROLE, SETTLEMENT_ROUTER);
      await tx.wait();
      console.log("✓ SETTLEMENT_ROUTER_ROLE granted");
    } else {
      console.log("✓ SETTLEMENT_ROUTER_ROLE already granted");
    }
  } else {
    console.log("\n⚠️  VITE_SETTLEMENT_ROUTER_ADDRESS not found in .env - skipping role grant");
    console.log("   You'll need to grant SETTLEMENT_ROUTER_ROLE manually if needed");
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

  contractsData[networkName].Reputation = reputationAddress;

  fs.writeFileSync(contractsPath, JSON.stringify(contractsData, null, 2));
  console.log("\n✓ Updated contracts.json");

  console.log("\n=== Deployment Summary ===");
  console.log("Reputation:", reputationAddress);
  console.log("\n⚠️  IMPORTANT: Update your .env file with the new Reputation address:");
  console.log(`VITE_REPUTATION_ADDRESS=${reputationAddress}`);
  console.log("\nThen restart your dev server for the changes to take effect.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

