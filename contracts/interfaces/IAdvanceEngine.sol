// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAdvanceEngine
 * @notice Interface for advance/financing engine
 */
interface IAdvanceEngine {
    struct Advance {
        uint256 invoiceId;
        address seller;
        uint256 advanceAmount;      // Amount sent to seller
        uint256 principal;          // Principal to repay
        uint256 interest;           // Interest amount
        uint256 totalRepayment;     // principal + interest
        uint256 requestedAt;
        bool repaid;
    }
    
    event AdvanceRequested(
        uint256 indexed invoiceId,
        address indexed seller,
        uint256 advanceAmount,
        uint256 principal,
        uint256 interest
    );
    
    event AdvanceRepaid(
        uint256 indexed invoiceId,
        address indexed seller,
        uint256 repaymentAmount
    );
    
    function requestAdvance(
        uint256 invoiceId,
        uint256 ltvBps,  // LTV in basis points (e.g., 7500 = 75%)
        uint256 aprBps   // APR in basis points (e.g., 1000 = 10%)
    ) external returns (uint256 advanceAmount);
    
    function getAdvance(uint256 invoiceId) external view returns (Advance memory);
    
    function getTotalDebt(address seller) external view returns (uint256);
    
    function getRepaymentAmount(uint256 invoiceId) external view returns (uint256);
    
    function markRepaid(uint256 invoiceId) external;
}

