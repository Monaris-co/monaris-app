require("dotenv").config();
const hre = require("hardhat");

async function main() {
  console.log("Granting SETTLEMENT_ROUTER_ROLE to SettlementRouter in Reputation...\n");

  const SETTLEMENT_ROUTER = process.env.VITE_SETTLEMENT_ROUTER_ADDRESS;
  const REPUTATION = process.env.VITE_REPUTATION_ADDRESS;

  if (!SETTLEMENT_ROUTER || !REPUTATION) {
    console.error("❌ Missing contract addresses in .env:");
    if (!SETTLEMENT_ROUTER) console.error("   - VITE_SETTLEMENT_ROUTER_ADDRESS");
    if (!REPUTATION) console.error("   - VITE_REPUTATION_ADDRESS");
    process.exit(1);
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Using account:", deployer.address);

  const Reputation = await hre.ethers.getContractFactory("Reputation");
  const reputation = Reputation.attach(REPUTATION);

  const SETTLEMENT_ROUTER_ROLE = await reputation.SETTLEMENT_ROUTER_ROLE();
  const hasRole = await reputation.hasRole(SETTLEMENT_ROUTER_ROLE, SETTLEMENT_ROUTER);

  if (hasRole) {
    console.log("✓ SETTLEMENT_ROUTER_ROLE already granted");
    return;
  }

  console.log("Granting role...");
  const tx = await reputation.grantRole(SETTLEMENT_ROUTER_ROLE, SETTLEMENT_ROUTER);
  console.log("Transaction hash:", tx.hash);
  await tx.wait();
  console.log("✅ SETTLEMENT_ROUTER_ROLE granted successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

