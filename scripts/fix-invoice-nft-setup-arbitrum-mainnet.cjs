require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const targetDeployerAddress = "0x6247d7b8b5F667662572b1C249EF1F1483CBFC14";
  
  // Get the deployer account at index 0 (the one that deployed InvoiceNFT)
  let deployer;
  
  if (process.env.DEPLOYER_MNEMONIC) {
    console.log("Creating deployer signer from mnemonic at index 0...");
    try {
      const mnemonic = process.env.DEPLOYER_MNEMONIC;
      const hdNode = hre.ethers.Mnemonic.fromPhrase(mnemonic);
      const deployerWallet = hre.ethers.HDNodeWallet.fromMnemonic(hdNode, `m/44'/60'/0'/0/0`);
      // Connect wallet to provider - this creates a signer that will sign transactions
      deployer = deployerWallet.connect(hre.ethers.provider);
      console.log("✅ Using deployer account at index 0:", deployer.address);
      
      if (deployer.address.toLowerCase() !== targetDeployerAddress.toLowerCase()) {
        console.log("⚠️  WARNING: Derived address doesn't match target deployer!");
        console.log("   Derived:", deployer.address);
        console.log("   Target:", targetDeployerAddress);
      }
    } catch (error) {
      console.log("❌ Could not create deployer signer from mnemonic:", error.message);
      const [currentDeployer] = await hre.ethers.getSigners();
      deployer = currentDeployer;
      console.log("Using current account instead:", deployer.address);
    }
  } else {
    [deployer] = await hre.ethers.getSigners();
    console.log("Using account from config:", deployer.address);
  }
  
  // Check balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const balanceEth = hre.ethers.formatEther(balance);
  console.log("Deployer balance:", balanceEth, "ETH");
  
  if (parseFloat(balanceEth) < 0.001) {
    console.log("⚠️  WARNING: Account has very low balance (< 0.001 ETH)");
    console.log("This might not be enough for the transaction. Consider adding more ETH.");
  }
  
  console.log("Fixing InvoiceNFT setup for Arbitrum Mainnet with account:", deployer.address);

  // Arbitrum Mainnet contract addresses (from contracts-42161.json)
  const INVOICE_NFT_ADDRESS = "0x6b7FD37c4325a2196B77BaD67F570F8f6544C37E";
  const INVOICE_REGISTRY_ADDRESS = "0x8b00dEE5209e73F1D92bE834223D3497c57b4263";

  console.log("\n=== Fixing InvoiceNFT Setup on Arbitrum Mainnet ===");
  console.log("InvoiceNFT:", INVOICE_NFT_ADDRESS);
  console.log("InvoiceRegistry:", INVOICE_REGISTRY_ADDRESS);

  // Load contracts
  const InvoiceNFT = await hre.ethers.getContractFactory("InvoiceNFT");
  const invoiceNFT = InvoiceNFT.attach(INVOICE_NFT_ADDRESS);

  // Check current state
  console.log("\n1. Checking current state...");
  const invoiceRegistryAddress = await invoiceNFT.invoiceRegistry();
  const MINTER_ROLE = await invoiceNFT.MINTER_ROLE();
  const hasRole = await invoiceNFT.hasRole(MINTER_ROLE, INVOICE_REGISTRY_ADDRESS);

  console.log("   Current InvoiceRegistry address:", invoiceRegistryAddress);
  console.log("   InvoiceRegistry has MINTER_ROLE:", hasRole);

  // Fix invoiceRegistry if needed
  const zeroAddress = "0x0000000000000000000000000000000000000000";
  if (invoiceRegistryAddress === zeroAddress || 
      invoiceRegistryAddress.toLowerCase() !== INVOICE_REGISTRY_ADDRESS.toLowerCase()) {
    console.log("\n2. Setting InvoiceRegistry address...");
    try {
      const tx = await invoiceNFT.setInvoiceRegistry(INVOICE_REGISTRY_ADDRESS);
      console.log("   Transaction sent:", tx.hash);
      await tx.wait();
      console.log("   ✅ InvoiceRegistry address set!");
    } catch (error) {
      if (error.message.includes("already set")) {
        console.log("   ℹ️  InvoiceRegistry already set");
      } else {
        console.log("   ❌ Error:", error.message);
        throw error;
      }
    }
  } else {
    console.log("\n2. ✅ InvoiceRegistry address already set correctly");
  }

  // Grant MINTER_ROLE if needed
  if (!hasRole) {
    console.log("\n3. Granting MINTER_ROLE to InvoiceRegistry...");
    
    // Check if deployer has admin role
    const DEFAULT_ADMIN_ROLE = await invoiceNFT.DEFAULT_ADMIN_ROLE();
    const deployerHasAdmin = await invoiceNFT.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    
    console.log("   Checking admin access...");
    console.log("   Deployer address:", deployer.address);
    console.log("   Has DEFAULT_ADMIN_ROLE:", deployerHasAdmin);
    
    if (!deployerHasAdmin) {
      console.log("\n   ❌ ERROR: Current account does not have DEFAULT_ADMIN_ROLE");
      console.log("   Current account:", deployer.address);
      console.log("   \n   Checking who has DEFAULT_ADMIN_ROLE...");
      
      // Try to get all accounts and check which one has admin
      const allSigners = await hre.ethers.getSigners();
      let foundAdmin = false;
      for (let i = 0; i < Math.min(allSigners.length, 10); i++) {
        try {
          const hasAdmin = await invoiceNFT.hasRole(DEFAULT_ADMIN_ROLE, allSigners[i].address);
          if (hasAdmin) {
            console.log(`   ✅ Account ${i} (${allSigners[i].address}) has DEFAULT_ADMIN_ROLE`);
            foundAdmin = true;
          }
        } catch (e) {
          // Skip errors
        }
      }
      
      if (!foundAdmin) {
        console.log("   ⚠️  Could not find any account with DEFAULT_ADMIN_ROLE in first 10 accounts.");
      }
      
      console.log("   \n   You need to run this script with the account that has DEFAULT_ADMIN_ROLE on InvoiceNFT.");
      console.log("   This is typically the account that deployed InvoiceNFT.");
      console.log("   \n   From contracts-42161.json, the deployer was: 0x6247d7b8b5F667662572b1C249EF1F1483CBFC14");
      console.log("   Please ensure DEPLOYER_PRIVATE_KEY or DEPLOYER_MNEMONIC in .env matches that account.");
      throw new Error("Current account does not have DEFAULT_ADMIN_ROLE on InvoiceNFT");
    }
    
    try {
      console.log("   Sending transaction to grant MINTER_ROLE...");
      
      // Try with explicit gas settings to ensure transaction goes through
      const gasPrice = await hre.ethers.provider.getFeeData();
      const estimatedGas = await invoiceNFT.grantRole.estimateGas(MINTER_ROLE, INVOICE_REGISTRY_ADDRESS).catch(() => 100000n);
      
      console.log("   Estimated gas:", estimatedGas.toString());
      console.log("   Gas price:", gasPrice.gasPrice?.toString(), "wei");
      
      const tx = await invoiceNFT.grantRole(MINTER_ROLE, INVOICE_REGISTRY_ADDRESS, {
        gasLimit: estimatedGas + 10000n, // Add 10k buffer
        gasPrice: gasPrice.gasPrice,
      });
      console.log("   Transaction sent:", tx.hash);
      console.log("   Waiting for confirmation...");
      const receipt = await tx.wait();
      console.log("   ✅ MINTER_ROLE granted! Block:", receipt.blockNumber);
    } catch (error) {
      const errorMsg = error.message || String(error);
      console.log("   ❌ Error details:", errorMsg);
      
      if (errorMsg.includes("AccessControl") || errorMsg.includes("AccessControl: account")) {
        console.log("   ❌ ERROR: AccessControl error - account does not have permission");
        console.log("   The account may not be the admin of InvoiceNFT.");
        throw error;
      }
      
      if (errorMsg.includes("execution reverted")) {
        console.log("   ❌ ERROR: Transaction reverted");
        console.log("   This could mean:");
        console.log("   1. The account doesn't have DEFAULT_ADMIN_ROLE");
        console.log("   2. The InvoiceNFT contract has different admin permissions");
        console.log("   3. There's a different issue with the contract");
      }
      
      throw error;
    }
  } else {
    console.log("\n3. ✅ MINTER_ROLE already granted");
  }

  // Verify final state
  console.log("\n4. Verifying final state...");
  const finalInvoiceRegistry = await invoiceNFT.invoiceRegistry();
  const finalHasRole = await invoiceNFT.hasRole(MINTER_ROLE, INVOICE_REGISTRY_ADDRESS);

  if (finalInvoiceRegistry.toLowerCase() === INVOICE_REGISTRY_ADDRESS.toLowerCase() && finalHasRole) {
    console.log("   ✅ All setup complete! Contracts are ready.");
    console.log("\n   You can now create invoices on Arbitrum Mainnet!");
  } else {
    console.log("   ❌ Setup incomplete:");
    console.log("   - InvoiceRegistry:", finalInvoiceRegistry);
    console.log("   - Has MINTER_ROLE:", finalHasRole);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
