require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");

// Helper to get RPC URL from environment or use defaults
function getRpcUrl(chainId) {
  const envKey = `RPC_URL_${chainId}`;
  return (
    process.env[envKey] ||
    process.env[`VITE_RPC_URL_${chainId}`] ||
    {
      5003: "https://rpc.sepolia.mantle.xyz",
      5000: "https://rpc.mantle.xyz",
      421614: "https://sepolia-rollup.arbitrum.io/rpc",
      42161: "https://arb1.arbitrum.io/rpc",
      11155111: "https://rpc.sepolia.org",
      1: "https://eth.llamarpc.com",
    }[chainId] ||
    ""
  );
}

// Helper to get accounts configuration (supports both mnemonic and private key)
function getAccountsConfig() {
  // Prefer mnemonic over private key (if both are provided, mnemonic takes precedence)
  if (process.env.DEPLOYER_MNEMONIC) {
    return {
      mnemonic: process.env.DEPLOYER_MNEMONIC,
      // Optional: specify initial index and count (defaults to index 0)
      initialIndex: process.env.DEPLOYER_ACCOUNT_INDEX ? parseInt(process.env.DEPLOYER_ACCOUNT_INDEX) : 0,
      count: process.env.DEPLOYER_ACCOUNT_COUNT ? parseInt(process.env.DEPLOYER_ACCOUNT_COUNT) : 10,
    };
  }
  // Fall back to private key if mnemonic is not provided
  if (process.env.DEPLOYER_PRIVATE_KEY) {
    return [process.env.DEPLOYER_PRIVATE_KEY];
  }
  // Return empty array if neither is provided
  return [];
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000, // Higher runs = smaller bytecode size, more gas savings for deployment
      },
      viaIR: true, // Enable IR-based code generation to handle stack too deep errors
    },
  },
  networks: {
    // Mantle networks
    mantleSepolia: {
      url: getRpcUrl(5003),
      chainId: 5003,
      accounts: getAccountsConfig(),
    },
    mantleMainnet: {
      url: getRpcUrl(5000),
      chainId: 5000,
      accounts: getAccountsConfig(),
    },
    // Arbitrum networks
    arbitrumSepolia: {
      url: getRpcUrl(421614),
      chainId: 421614,
      accounts: getAccountsConfig(),
    },
    arbitrumMainnet: {
      url: getRpcUrl(42161),
      chainId: 42161,
      accounts: getAccountsConfig(),
    },
    // Ethereum networks
    sepolia: {
      url: getRpcUrl(11155111),
      chainId: 11155111,
      accounts: getAccountsConfig(),
    },
    mainnet: {
      url: getRpcUrl(1),
      chainId: 1,
      accounts: getAccountsConfig(),
    },
    // Local development
    hardhat: {
      chainId: 31337,
    },
  },
  etherscan: {
    apiKey: {
      mantleSepolia: process.env.MANTLE_ETHERSCAN_API_KEY || process.env.ETHERSCAN_API_KEY || "",
      mantleMainnet: process.env.MANTLE_ETHERSCAN_API_KEY || process.env.ETHERSCAN_API_KEY || "",
      arbitrumSepolia: process.env.ARBISCAN_API_KEY || process.env.ETHERSCAN_API_KEY || "",
      arbitrumMainnet: process.env.ARBISCAN_API_KEY || process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      mainnet: process.env.ETHERSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "mantleSepolia",
        chainId: 5003,
        urls: {
          apiURL: "https://explorer.testnet.mantle.xyz/api",
          browserURL: "https://explorer.testnet.mantle.xyz",
        },
      },
      {
        network: "mantleMainnet",
        chainId: 5000,
        urls: {
          apiURL: "https://explorer.mantle.xyz/api",
          browserURL: "https://explorer.mantle.xyz",
        },
      },
      {
        network: "arbitrumSepolia",
        chainId: 421614,
        urls: {
          apiURL: "https://api-sepolia.arbiscan.io/api",
          browserURL: "https://sepolia-explorer.arbitrum.io",
        },
      },
      {
        network: "arbitrumMainnet",
        chainId: 42161,
        urls: {
          apiURL: "https://api.arbiscan.io/api",
          browserURL: "https://explorer.arbitrum.io",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

