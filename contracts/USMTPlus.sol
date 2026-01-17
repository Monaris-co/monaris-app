// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title USMTPlus (USMT+)
 * @notice Receipt token for vault deposits. Users deposit USDC and receive USMT+ 1:1
 * @dev Mintable only by Vault contract
 */
contract USMTPlus is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    uint8 private constant DECIMALS = 6; // Match USDC decimals
    
    constructor(address defaultAdmin) ERC20("USMT+", "USMT+") {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, defaultAdmin); // Admin can grant MINTER_ROLE to Vault
    }
    
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }
    
    /**
     * @notice Mint USMT+ tokens (only by Vault)
     * @param to Address to mint tokens to
     * @param amount Amount to mint (6 decimals)
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }
    
    /**
     * @notice Burn USMT+ tokens (only by Vault)
     * @param from Address to burn tokens from
     * @param amount Amount to burn (6 decimals)
     */
    function burn(address from, uint256 amount) external onlyRole(MINTER_ROLE) {
        _burn(from, amount);
    }
}
