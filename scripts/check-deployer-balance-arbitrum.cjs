require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const targetDeployerAddress = "0x6247d7b8b5F667662572b1C249EF1F1483CBFC14";
  const provider = hre.ethers.provider;

  console.log("\n=== Checking Deployer Account Balance on Arbitrum Mainnet ===");
  console.log("Deployer address:", targetDeployerAddress);

  try {
    const balance = await provider.getBalance(targetDeployerAddress);
    const balanceEth = hre.ethers.formatEther(balance);
    const balanceUsd = parseFloat(balanceEth) * 3077; // Approximate ETH price
    
    console.log("\nBalance:", balanceEth, "ETH");
    console.log("Balance (USD):", `~$${balanceUsd.toFixed(2)}`);
    
    if (balance === 0n) {
      console.log("\n❌ ERROR: Account has 0 ETH balance!");
      console.log("This account needs ETH to pay for gas fees to grant MINTER_ROLE.");
      console.log("Please send ETH to this address before running the fix script.");
    } else if (parseFloat(balanceEth) < 0.001) {
      console.log("\n⚠️  WARNING: Account has very low balance (< 0.001 ETH)");
      console.log("This might not be enough for the transaction. Consider adding more ETH.");
    } else {
      console.log("\n✅ Account has sufficient balance for transaction");
    }
  } catch (error) {
    console.log("❌ Error checking balance:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
