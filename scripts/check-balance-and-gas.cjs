require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  
  console.log("\n=== Account Balance & Gas Analysis ===\n");
  console.log("Network:", network.name);
  console.log("Chain ID:", network.chainId.toString());
  console.log("Deployer Address:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const balanceEth = hre.ethers.formatEther(balance);
  const balanceWei = balance.toString();
  
  console.log("\nCurrent Balance:");
  console.log(`  ${balanceEth} ETH`);
  console.log(`  ${balanceWei} wei`);
  console.log(`  ~$${(parseFloat(balanceEth) * 3077).toFixed(4)} USD (at $3077/ETH)`);
  
  // Get current gas price
  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
  const gasPriceGwei = hre.ethers.formatUnits(gasPrice, "gwei");
  
  console.log("\nCurrent Gas Prices:");
  console.log(`  Gas Price: ${gasPriceGwei} gwei`);
  if (feeData.maxFeePerGas) {
    console.log(`  Max Fee Per Gas: ${hre.ethers.formatUnits(feeData.maxFeePerGas, "gwei")} gwei`);
  }
  if (feeData.maxPriorityFeePerGas) {
    console.log(`  Max Priority Fee: ${hre.ethers.formatUnits(feeData.maxPriorityFeePerGas, "gwei")} gwei`);
  }
  
  // Estimate gas for Reputation contract deployment
  console.log("\n=== Gas Estimation ===\n");
  try {
    const Reputation = await hre.ethers.getContractFactory("Reputation");
    const deployTx = Reputation.getDeployTransaction(deployer.address);
    const estimatedGas = await hre.ethers.provider.estimateGas(deployTx);
    const estimatedCostWei = estimatedGas * gasPrice;
    const estimatedCostEth = hre.ethers.formatEther(estimatedCostWei);
    
    console.log("Reputation Contract:");
    console.log(`  Estimated Gas: ${estimatedGas.toString()}`);
    console.log(`  Estimated Cost: ${estimatedCostEth} ETH`);
    console.log(`  Estimated Cost: ~$${(parseFloat(estimatedCostEth) * 3077).toFixed(4)} USD`);
  } catch (err) {
    console.log("Reputation: Could not estimate (may need more funds)", err.message);
  }
  
  // Estimate gas for SettlementRouter (needs existing contract addresses)
  try {
    const SettlementRouter = await hre.ethers.getContractFactory("SettlementRouter");
    const demoUSDC = "0x239f6Dfd77c4D5FF3017daAD4d3D3cD8758Cc030";
    const invoiceRegistry = "0x8b00dEE5209e73F1D92bE834223D3497c57b4263";
    const vault = "0x0000000000000000000000000000000000000000";
    const advanceEngine = "0x0000000000000000000000000000000000000000";
    const reputation = "0x0000000000000000000000000000000000000000"; // Will be deployed first
    const treasury = deployer.address;
    const protocolFeeBps = 50;
    
    const deployTx = SettlementRouter.getDeployTransaction(
      demoUSDC,
      invoiceRegistry,
      vault,
      advanceEngine,
      reputation,
      treasury,
      protocolFeeBps,
      deployer.address
    );
    
    // Can't estimate until Reputation is deployed, but we can estimate roughly
    console.log("\nSettlementRouter Contract:");
    console.log("  (Note: Cannot estimate until Reputation is deployed)");
    console.log("  Typical gas: ~2,000,000 - 3,000,000");
    const typicalGas = 2500000n;
    const typicalCostWei = typicalGas * gasPrice;
    const typicalCostEth = hre.ethers.formatEther(typicalCostWei);
    console.log(`  Typical Cost: ~${typicalCostEth} ETH`);
    console.log(`  Typical Cost: ~$${(parseFloat(typicalCostEth) * 3077).toFixed(4)} USD`);
  } catch (err) {
    console.log("SettlementRouter: Could not estimate", err.message);
  }
  
  // Calculate total needed
  console.log("\n=== Summary ===\n");
  const estimatedTotalGas = 3500000n; // Conservative estimate for both contracts
  const estimatedTotalCostWei = estimatedTotalGas * gasPrice;
  const estimatedTotalCostEth = hre.ethers.formatEther(estimatedTotalCostWei);
  const shortfallWei = estimatedTotalCostWei > balance ? estimatedTotalCostWei - balance : 0n;
  const shortfallEth = hre.ethers.formatEther(shortfallWei);
  
  console.log(`Estimated Total Needed: ~${estimatedTotalCostEth} ETH (~$${(parseFloat(estimatedTotalCostEth) * 3077).toFixed(4)} USD)`);
  console.log(`Current Balance: ${balanceEth} ETH`);
  
  if (shortfallWei > 0n) {
    console.log(`\n❌ Shortfall: ${shortfallEth} ETH (~$${(parseFloat(shortfallEth) * 3077).toFixed(4)} USD)`);
    console.log(`   Need to add ${shortfallEth} ETH to deploy`);
  } else {
    console.log(`\n✅ Sufficient funds available!`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
