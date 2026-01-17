require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  if (!process.env.DEPLOYER_MNEMONIC) {
    console.log("No DEPLOYER_MNEMONIC found in .env");
    return;
  }
  
  const provider = new ethers.JsonRpcProvider("https://arb1.arbitrum.io/rpc");
  const mnemonic = process.env.DEPLOYER_MNEMONIC;
  
  console.log("\n=== Checking All Accounts from Mnemonic on Arbitrum Mainnet ===\n");
  console.log("Checking first 10 accounts (index 0-9)...\n");
  
  for (let i = 0; i < 10; i++) {
    try {
      const hdNode = ethers.Mnemonic.fromPhrase(mnemonic);
      const wallet = ethers.HDNodeWallet.fromMnemonic(hdNode, `m/44'/60'/0'/0/${i}`);
      const address = wallet.address;
      const balance = await provider.getBalance(address, "latest");
      const balanceEth = ethers.formatEther(balance);
      const balanceUsd = parseFloat(balanceEth) * 3077;
      
      if (balance > 0n || i < 3) { // Show first 3 even if zero, or any with balance
        console.log(`Account Index ${i}:`);
        console.log(`  Address: ${address}`);
        console.log(`  Balance: ${balanceEth} ETH (~$${balanceUsd.toFixed(4)} USD)`);
        
        if (balanceUsd > 5) {
          console.log(`  ✅ HAS SUFFICIENT FUNDS!`);
        }
        console.log("");
      }
    } catch (error) {
      console.log(`Account Index ${i}: Error - ${error.message}\n`);
    }
  }
  
  console.log("\nNote: If you see an account with sufficient funds, set DEPLOYER_ACCOUNT_INDEX in .env");
  console.log("Example: DEPLOYER_ACCOUNT_INDEX=1");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
