require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  const mnemonic = "debate enlist annual tomorrow manual usual define bracket project desert outdoor giggle";
  const targetAddress = "0xEbF48F51c719b89fB5BE22B3F386ebC525C91193";
  const INVOICE_NFT_ADDRESS = "0x6b7FD37c4325a2196B77BaD67F570F8f6544C37E";
  
  console.log("\n=== Checking Account from Mnemonic ===");
  console.log("Target address:", targetAddress);
  console.log("Checking first 10 accounts...\n");

  const InvoiceNFT = await ethers.getContractFactory("InvoiceNFT");
  const invoiceNFT = InvoiceNFT.attach(INVOICE_NFT_ADDRESS);

  for (let i = 0; i < 10; i++) {
    try {
      const hdNode = ethers.Mnemonic.fromPhrase(mnemonic);
      const wallet = ethers.HDNodeWallet.fromMnemonic(hdNode, `m/44'/60'/0'/0/${i}`);
      const address = wallet.address;
      
      const isMatch = address.toLowerCase() === targetAddress.toLowerCase();
      console.log(`Account ${i}: ${address}${isMatch ? " ✅ MATCH!" : ""}`);
      
      if (isMatch) {
        console.log(`\n✅ Found at index ${i}!`);
        
        // Check if this account has admin role
        const DEFAULT_ADMIN_ROLE = await invoiceNFT.DEFAULT_ADMIN_ROLE();
        const hasAdmin = await invoiceNFT.hasRole(DEFAULT_ADMIN_ROLE, address);
        
        console.log(`\nChecking admin access on InvoiceNFT...`);
        console.log(`Has DEFAULT_ADMIN_ROLE: ${hasAdmin}`);
        
        if (hasAdmin) {
          console.log(`\n✅ This account HAS admin access! Can grant MINTER_ROLE.`);
          console.log(`\nSet in .env:`);
          console.log(`DEPLOYER_ACCOUNT_INDEX=${i}`);
        } else {
          console.log(`\n❌ This account does NOT have admin access.`);
          console.log(`Need to find which account has DEFAULT_ADMIN_ROLE.`);
        }
        
        // Check balance
        const provider = new ethers.JsonRpcProvider("https://arb1.arbitrum.io/rpc");
        const balance = await provider.getBalance(address);
        const balanceEth = ethers.formatEther(balance);
        console.log(`\nBalance: ${balanceEth} ETH`);
        
        if (parseFloat(balanceEth) < 0.001) {
          console.log(`⚠️  WARNING: Low balance (< 0.001 ETH). May not be enough for transaction.`);
        }
        
        process.exit(0);
      }
    } catch (error) {
      console.log(`Account ${i}: Error - ${error.message}`);
    }
  }
  
  console.log(`\n❌ Address ${targetAddress} not found in first 10 accounts.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
