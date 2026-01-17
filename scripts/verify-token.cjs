require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const provider = hre.ethers.provider;
  const tokenAddress = "0x2De86556c08Df11E1D35223F0741791fBD847567";
  
  const abi = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
  ];
  
  const token = new hre.ethers.Contract(tokenAddress, abi, provider);
  
  try {
    console.log("Verifying token contract:", tokenAddress);
    const name = await token.name();
    const symbol = await token.symbol();
    const decimals = await token.decimals();
    
    console.log("\n✅ Token Verification:");
    console.log("=====================");
    console.log("Name:", name);
    console.log("Symbol:", symbol);
    console.log("Decimals:", decimals.toString());
    
    if (name === "USDC" && symbol === "USDC") {
      console.log("\n✅ Token correctly deployed with USDC name and symbol!");
    } else {
      console.log("\n❌ Token name/symbol mismatch!");
      console.log(`Expected: USDC, Got: ${name} / ${symbol}`);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

main().catch(console.error);

