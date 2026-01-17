require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const INVOICE_NFT_ADDRESS = "0x6b7FD37c4325a2196B77BaD67F570F8f6544C37E";
  const INVOICE_REGISTRY_ADDRESS = "0x8b00dEE5209e73F1D92bE834223D3497c57b4263";
  const targetDeployerAddress = "0x6247d7b8b5F667662572b1C249EF1F1483CBFC14";

  // Get deployer account at index 0
  let deployer;
  if (process.env.DEPLOYER_MNEMONIC) {
    const mnemonic = process.env.DEPLOYER_MNEMONIC;
    const hdNode = hre.ethers.Mnemonic.fromPhrase(mnemonic);
    const deployerWallet = hre.ethers.HDNodeWallet.fromMnemonic(hdNode, `m/44'/60'/0'/0/0`);
    deployer = await hre.ethers.getSigner(deployerWallet.address);
  } else {
    [deployer] = await hre.ethers.getSigners();
  }

  console.log("\n=== Debugging InvoiceNFT Role Setup ===");
  console.log("Using account:", deployer.address);
  console.log("Target deployer:", targetDeployerAddress);
  console.log("Match:", deployer.address.toLowerCase() === targetDeployerAddress.toLowerCase() ? "✅" : "❌");

  const InvoiceNFT = await hre.ethers.getContractFactory("InvoiceNFT");
  const invoiceNFT = InvoiceNFT.attach(INVOICE_NFT_ADDRESS);

  // Get roles
  const MINTER_ROLE = await invoiceNFT.MINTER_ROLE();
  const DEFAULT_ADMIN_ROLE = await invoiceNFT.DEFAULT_ADMIN_ROLE();

  console.log("\n1. Checking roles...");
  console.log("   MINTER_ROLE:", MINTER_ROLE);
  console.log("   DEFAULT_ADMIN_ROLE:", DEFAULT_ADMIN_ROLE);

  const hasMinterRole = await invoiceNFT.hasRole(MINTER_ROLE, INVOICE_REGISTRY_ADDRESS);
  const hasAdminRole = await invoiceNFT.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);

  console.log("\n2. Current state:");
  console.log("   InvoiceRegistry has MINTER_ROLE:", hasMinterRole);
  console.log("   Deployer has DEFAULT_ADMIN_ROLE:", hasAdminRole);

  // Try to simulate the grantRole call
  console.log("\n3. Simulating grantRole call...");
  try {
    // Use staticCall to simulate without actually sending
    await invoiceNFT.grantRole.staticCall(MINTER_ROLE, INVOICE_REGISTRY_ADDRESS);
    console.log("   ✅ Static call succeeded - transaction should work!");
  } catch (error) {
    console.log("   ❌ Static call failed:");
    console.log("   Error:", error.message);
    
    // Try to extract revert reason
    if (error.data) {
      console.log("   Error data:", error.data);
    }
    if (error.reason) {
      console.log("   Revert reason:", error.reason);
    }
  }

  // Actually try to send the transaction if static call works
  if (!hasMinterRole && hasAdminRole) {
    console.log("\n4. Sending actual transaction...");
    try {
      const tx = await invoiceNFT.grantRole(MINTER_ROLE, INVOICE_REGISTRY_ADDRESS);
      console.log("   Transaction hash:", tx.hash);
      console.log("   Waiting for confirmation...");
      const receipt = await tx.wait();
      console.log("   ✅ Transaction confirmed! Block:", receipt.blockNumber);
    } catch (error) {
      console.log("   ❌ Transaction failed:");
      console.log("   Error:", error.message);
      if (error.reason) {
        console.log("   Revert reason:", error.reason);
      }
    }
  } else if (hasMinterRole) {
    console.log("\n4. ✅ MINTER_ROLE already granted - no action needed");
  } else if (!hasAdminRole) {
    console.log("\n4. ❌ Deployer doesn't have admin role - cannot grant MINTER_ROLE");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
