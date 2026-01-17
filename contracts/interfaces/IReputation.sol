// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IReputation
 * @notice Interface for on-chain reputation system
 */
interface IReputation {
    enum Tier {
        C,  // 0 - Low
        B,  // 1 - Medium
        A   // 2 - High
    }
    
    struct SellerStats {
        uint256 score;           // 0-1000
        Tier tier;               // A/B/C
        uint256 invoicesCleared; // Total cleared invoices
        uint256 totalVolume;     // Total volume processed
        uint256 lastUpdated;
    }
    
    event ReputationUpdated(
        address indexed seller,
        uint256 newScore,
        Tier newTier,
        uint256 invoiceVolume
    );
    
    function updateReputation(address seller, uint256 invoiceAmount) external;
    function getScore(address seller) external view returns (uint256);
    function getTier(address seller) external view returns (Tier);
    function getStats(address seller) external view returns (SellerStats memory);
}

