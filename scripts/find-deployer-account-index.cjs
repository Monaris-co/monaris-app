require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  if (!process.env.DEPLOYER_MNEMONIC) {
    console.log("No DEPLOYER_MNEMONIC found in .env");
    process.exit(1);
  }

  const mnemonic = process.env.DEPLOYER_MNEMONIC;
  const targetDeployer = "0x6247d7b8b5F667662572b1C249EF1F1483CBFC14"; // From contracts-42161.json
  
  console.log("\n=== Finding Deployer Account Index ===");
  console.log("Target deployer address:", targetDeployer);
  console.log("Checking first 20 accounts from mnemonic...\n");

  for (let i = 0; i < 20; i++) {
    try {
      const hdNode = ethers.Mnemonic.fromPhrase(mnemonic);
      const wallet = ethers.HDNodeWallet.fromMnemonic(hdNode, `m/44'/60'/0'/0/${i}`);
      const address = wallet.address;
      
      console.log(`Account ${i}: ${address}${address.toLowerCase() === targetDeployer.toLowerCase() ? " ✅ MATCH!" : ""}`);
      
      if (address.toLowerCase() === targetDeployer.toLowerCase()) {
        console.log(`\n✅ Found! Deployer account is at index ${i}`);
        console.log(`\nTo use this account, set in .env:`);
        console.log(`DEPLOYER_ACCOUNT_INDEX=${i}`);
        console.log(`\nThen run: npm run fix:invoice-nft:arbitrum-mainnet`);
        process.exit(0);
      }
    } catch (error) {
      console.log(`Account ${i}: Error - ${error.message}`);
    }
  }
  
  console.log(`\n❌ Deployer address ${targetDeployer} not found in first 20 accounts.`);
  console.log(`Please check if you're using the correct mnemonic or if the deployer used a different account index.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
