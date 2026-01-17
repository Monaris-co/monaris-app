require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  const provider = new ethers.JsonRpcProvider("https://arb1.arbitrum.io/rpc");
  const address = "0x6247d7b8b5F667662572b1C249EF1F1483CBFC14";
  
  console.log("\n=== Checking Balance on Arbitrum Mainnet ===\n");
  console.log("Address:", address);
  
  try {
    // Check latest balance
    const balance = await provider.getBalance(address, "latest");
    const balanceEth = ethers.formatEther(balance);
    const balanceWei = balance.toString();
    
    console.log("\nLatest Balance:");
    console.log(`  ${balanceEth} ETH`);
    console.log(`  ${balanceWei} wei`);
    console.log(`  ~$${(parseFloat(balanceEth) * 3077).toFixed(4)} USD (at $3077/ETH)`);
    
    // Check pending balance (includes pending transactions)
    const pendingBalance = await provider.getBalance(address, "pending");
    const pendingEth = ethers.formatEther(pendingBalance);
    
    if (pendingBalance.toString() !== balance.toString()) {
      console.log("\nPending Balance (includes pending transactions):");
      console.log(`  ${pendingEth} ETH`);
      console.log(`  ${pendingBalance.toString()} wei`);
      console.log(`  ~$${(parseFloat(pendingEth) * 3077).toFixed(4)} USD`);
      console.log("\n⚠️  Balance differs - there may be pending transactions");
    }
    
    // Get transaction count to check recent activity
    const txCount = await provider.getTransactionCount(address, "pending");
    console.log(`\nTransaction Count (pending): ${txCount}`);
    
    // Calculate what's needed for deployment
    const gasPrice = await provider.getFeeData();
    const avgGasPrice = gasPrice.gasPrice || 20000000000n; // 0.02 gwei default
    
    // Estimated gas for Reputation: ~53,793
    // Estimated gas for SettlementRouter: ~2,500,000
    const totalGas = 2553793n; // Total for both contracts
    const totalCostWei = totalGas * avgGasPrice;
    const totalCostEth = ethers.formatEther(totalCostWei);
    
    console.log("\n=== Deployment Cost Estimate ===");
    console.log(`Estimated Total Gas: ${totalGas.toString()}`);
    console.log(`Estimated Total Cost: ${totalCostEth} ETH`);
    console.log(`Estimated Total Cost: ~$${(parseFloat(totalCostEth) * 3077).toFixed(4)} USD`);
    
    const shortfall = totalCostWei > balance ? totalCostWei - balance : 0n;
    
    if (shortfall > 0n) {
      const shortfallEth = ethers.formatEther(shortfall);
      console.log(`\n❌ Shortfall: ${shortfallEth} ETH (~$${(parseFloat(shortfallEth) * 3077).toFixed(4)} USD)`);
      console.log(`   Current: ${balanceEth} ETH`);
      console.log(`   Needed: ${totalCostEth} ETH`);
    } else {
      console.log(`\n✅ Sufficient funds!`);
      console.log(`   Current: ${balanceEth} ETH`);
      console.log(`   Needed: ${totalCostEth} ETH`);
      console.log(`   Remaining after deployment: ${ethers.formatEther(balance - totalCostWei)} ETH`);
    }
    
  } catch (error) {
    console.error("Error checking balance:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
