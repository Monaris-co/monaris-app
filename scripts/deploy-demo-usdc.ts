import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying DemoUSDC with account:", deployer.address);

  const DemoUSDC = await ethers.getContractFactory("DemoUSDC");
  const demoUSDC = await DemoUSDC.deploy(deployer.address);
  await demoUSDC.waitForDeployment();
  
  const address = await demoUSDC.getAddress();
  console.log("DemoUSDC deployed to:", address);
  console.log("Owner:", deployer.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

