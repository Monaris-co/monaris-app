// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DemoUSDC
 * @notice Demo USDC token for SETTL. platform on all testnets
 * @dev Anyone can mint tokens on testnet for demo purposes. Minting restricted to testnet only.
 */
contract DemoUSDC is ERC20, Ownable {
    uint8 private constant DECIMALS = 6;
    
    // Supported testnet chain IDs
    uint256 private constant MANTLE_SEPOLIA = 5003;
    uint256 private constant ARBITRUM_SEPOLIA = 421614;
    uint256 private constant ETHEREUM_SEPOLIA = 11155111;
    
    constructor(address initialOwner) ERC20("USDC", "USDC") Ownable(initialOwner) {
        // Initial supply: 0 (mint as needed for demo)
    }
    
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }
    
    /**
     * @notice Check if current chain is a supported testnet
     * @return true if current chain is a testnet, false otherwise
     */
    function _isTestnet() private view returns (bool) {
        uint256 chainId = block.chainid;
        return chainId == MANTLE_SEPOLIA || 
               chainId == ARBITRUM_SEPOLIA || 
               chainId == ETHEREUM_SEPOLIA;
    }
    
    /**
     * @notice Mint tokens to an address (public, testnet only)
     * @param to Address to mint tokens to
     * @param amount Amount to mint (6 decimals)
     * @dev Anyone can mint on testnet for demo purposes
     */
    function mint(address to, uint256 amount) external {
        require(_isTestnet(), "DemoUSDC: Testnet only");
        _mint(to, amount);
    }
    
    /**
     * @notice Batch mint to multiple addresses
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts to mint (must match recipients length)
     * @dev Anyone can mint on testnet for demo purposes
     */
    function batchMint(address[] calldata recipients, uint256[] calldata amounts) external {
        require(_isTestnet(), "DemoUSDC: Testnet only");
        require(recipients.length == amounts.length, "DemoUSDC: Length mismatch");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], amounts[i]);
        }
    }
}

