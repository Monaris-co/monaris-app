// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IVault
 * @notice Interface for funding pool (vault) contract
 */
interface IVault {
    function BORROWER_ROLE() external view returns (bytes32);
    event Deposit(address indexed user, uint256 amount, uint256 shares);
    event Withdraw(address indexed user, uint256 shares, uint256 amount);
    event Borrow(address indexed borrower, uint256 amount);
    event Repay(address indexed borrower, uint256 amount);
    
    function deposit(uint256 amount) external returns (uint256 shares);
    function withdraw(uint256 shares) external returns (uint256 amount);
    function borrow(uint256 amount) external;
    function repay(uint256 amount) external;
    
    function getTotalLiquidity() external view returns (uint256);
    function getTotalBorrowed() external view returns (uint256);
    function getUtilizationRate() external view returns (uint256);
    function getShares(address user) external view returns (uint256);
    function getBalance(address user) external view returns (uint256);
    function totalShares() external view returns (uint256);
}

