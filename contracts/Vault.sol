// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IVault.sol";
import "./USMTPlus.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Vault
 * @notice Simple funding pool for LP deposits and borrowings
 * @dev Users deposit USDC and receive USMT+ tokens 1:1
 */
contract Vault is IVault, AccessControl {
    using SafeERC20 for IERC20;
    
    bytes32 public constant BORROWER_ROLE = keccak256("BORROWER_ROLE");
    
    IERC20 public immutable token; // DemoUSDC (USDC)
    USMTPlus public immutable usmtPlus; // USMT+ receipt token
    
    uint256 public totalLiquidity;    // Total USDC deposited
    uint256 public totalBorrowed;     // Total USDC borrowed
    
    uint256 private constant PRECISION = 1e18;
    
    constructor(address _token, address _usmtPlus, address defaultAdmin) {
        token = IERC20(_token);
        usmtPlus = USMTPlus(_usmtPlus);
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
    }
    
    /**
     * @notice Deposit USDC and receive USMT+ tokens 1:1
     * @param amount Amount to deposit (6 decimals)
     * @return usmtReceived Number of USMT+ tokens minted (1:1 with deposit)
     */
    function deposit(uint256 amount) external returns (uint256 usmtReceived) {
        require(amount > 0, "Amount must be > 0");
        
        // Transfer USDC from user
        token.safeTransferFrom(msg.sender, address(this), amount);
        
        // Mint USMT+ tokens 1:1
        usmtReceived = amount;
        usmtPlus.mint(msg.sender, usmtReceived);
        
        totalLiquidity += amount;
        
        emit Deposit(msg.sender, amount, usmtReceived);
        return usmtReceived;
    }
    
    /**
     * @notice Withdraw USDC by burning USMT+ tokens 1:1
     * @param usmtAmount Number of USMT+ tokens to burn
     * @return amountReceived USDC amount received (1:1 with USMT+ burned)
     */
    function withdraw(uint256 usmtAmount) external returns (uint256 amountReceived) {
        require(usmtAmount > 0, "Amount must be > 0");
        
        // Check available liquidity
        uint256 availableLiquidity = totalLiquidity - totalBorrowed;
        require(availableLiquidity >= usmtAmount, "Insufficient liquidity");
        
        // Burn USMT+ tokens from user
        usmtPlus.burn(msg.sender, usmtAmount);
        
        // Return USDC 1:1
        amountReceived = usmtAmount;
        totalLiquidity -= amountReceived;
        
        token.safeTransfer(msg.sender, amountReceived);
        
        emit Withdraw(msg.sender, usmtAmount, amountReceived);
        return amountReceived;
    }
    
    /**
     * @notice Borrow USDC from vault (called by AdvanceEngine)
     */
    function borrow(uint256 amount) external onlyRole(BORROWER_ROLE) {
        require(amount > 0, "Amount must be > 0");
        uint256 availableLiquidity = totalLiquidity - totalBorrowed;
        require(availableLiquidity >= amount, "Insufficient liquidity");
        
        totalBorrowed += amount;
        token.safeTransfer(msg.sender, amount);
        
        emit Borrow(msg.sender, amount);
    }
    
    /**
     * @notice Repay borrowed USDC (called by SETTL.ementRouter)
     */
    function repay(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(totalBorrowed >= amount, "Repay exceeds borrowed");
        
        token.safeTransferFrom(msg.sender, address(this), amount);
        totalBorrowed -= amount;
        // Note: totalLiquidity stays the same (repayment increases available liquidity)
        
        emit Repay(msg.sender, amount);
    }
    
    /**
     * @notice Get total liquidity (deposited USDC)
     */
    function getTotalLiquidity() external view returns (uint256) {
        return totalLiquidity;
    }
    
    /**
     * @notice Get total borrowed amount
     */
    function getTotalBorrowed() external view returns (uint256) {
        return totalBorrowed;
    }
    
    /**
     * @notice Get utilization rate (0-10000, where 10000 = 100%)
     */
    function getUtilizationRate() external view returns (uint256) {
        if (totalLiquidity == 0) return 0;
        return (totalBorrowed * 10000) / totalLiquidity;
    }
    
    /**
     * @notice Get user's USMT+ balance (receipt tokens)
     */
    function getShares(address user) external view returns (uint256) {
        return usmtPlus.balanceOf(user);
    }
    
    /**
     * @notice Get user's USDC balance (same as USMT+ balance since 1:1)
     */
    function getBalance(address user) external view returns (uint256) {
        return usmtPlus.balanceOf(user);
    }
    
    /**
     * @notice Get total USMT+ supply (total shares)
     */
    function totalShares() external view returns (uint256) {
        return usmtPlus.totalSupply();
    }
}

