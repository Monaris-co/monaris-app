// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IReputation.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Reputation
 * @notice On-chain reputation system for sellers
 * @dev Updates score and tier based on cleared invoices
 */
contract Reputation is IReputation, AccessControl {
    bytes32 public constant SETTLEMENT_ROUTER_ROLE = keccak256("SETTLEMENT_ROUTER_ROLE");
    
    mapping(address => SellerStats) private _stats;
    
    // Tier thresholds (score ranges)
    uint256 private constant TIER_C_MAX = 450;   // 0-450 (Tier C: 0-450)
    uint256 private constant TIER_B_MIN = 500;   // Tier B starts at 500
    uint256 private constant TIER_B_MAX = 850;   // Tier B: 500-850
    // Tier A: 850-1000
    
    // Score calculation constants
    uint256 private constant BASE_SCORE_INCREMENT = 20;  // Base points per cleared invoice (20 points per repayment)
    uint256 private constant VOLUME_BONUS_DIVISOR = 1000000000000; // 1M USDC = 1 bonus point (1M * 1e6 decimals = 1e12)
    
    constructor(address defaultAdmin) {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
    }
    
    /**
     * @notice Update reputation after invoice cleared (called by SETTL.ementRouter)
     * @param seller Seller address
     * @param invoiceAmount Invoice amount in USDC
     */
    function updateReputation(address seller, uint256 invoiceAmount) external onlyRole(SETTLEMENT_ROUTER_ROLE) {
        SellerStats storage stats = _stats[seller];
        
        // Initialize new users with starting score of 450 (Tier C minimum)
        // Check BEFORE incrementing cleared count
        bool isNewUser = (stats.score == 0 && stats.invoicesCleared == 0);
        if (isNewUser) {
            stats.score = 450; // Start at Tier C minimum (450)
            stats.tier = Tier.C;
        }
        
        // Increment cleared count
        stats.invoicesCleared += 1;
        stats.totalVolume += invoiceAmount;
        
        // Calculate score increment
        // Base: +20 per cleared invoice (repayment reward)
        // Bonus: +1 per $1M volume (scaled for 6 decimals)
        uint256 baseIncrement = BASE_SCORE_INCREMENT; // 20 points per repayment
        uint256 volumeBonus = invoiceAmount / VOLUME_BONUS_DIVISOR;
        uint256 scoreIncrement = baseIncrement + volumeBonus;
        
        // Update score (capped at 1000)
        uint256 newScore = stats.score + scoreIncrement;
        if (newScore > 1000) {
            newScore = 1000;
        }
        stats.score = newScore;
        
        // Determine tier
        // Tier C: 0-450, Tier B: 500-850, Tier A: 850-1000
        // Note: Scores 451-499 remain Tier C until reaching 500
        if (newScore < TIER_B_MIN) {
            stats.tier = Tier.C;  // 0-499 are Tier C
        } else if (newScore < 850) {
            stats.tier = Tier.B;   // 500-849 are Tier B
        } else {
            stats.tier = Tier.A;   // 850-1000 are Tier A
        }
        
        stats.lastUpdated = block.timestamp;
        
        emit ReputationUpdated(seller, newScore, stats.tier, invoiceAmount);
    }
    
    /**
     * @notice Get seller's reputation score (0-1000)
     * @dev New users start with 450 (Tier C minimum)
     */
    function getScore(address seller) external view returns (uint256) {
        uint256 score = _stats[seller].score;
        // If user has no score yet, return default starting score of 450 (Tier C)
        if (score == 0 && _stats[seller].invoicesCleared == 0) {
            return 450;
        }
        return score;
    }
    
    /**
     * @notice Get seller's tier (A/B/C)
     * @dev New users start at Tier C
     */
    function getTier(address seller) external view returns (Tier) {
        SellerStats memory stats = _stats[seller];
        // If user has no score yet, return Tier C
        if (stats.score == 0 && stats.invoicesCleared == 0) {
            return Tier.C;
        }
        return stats.tier;
    }
    
    /**
     * @notice Get full seller stats
     * @dev New users start with score 450 (Tier C minimum)
     */
    function getStats(address seller) external view returns (SellerStats memory) {
        SellerStats memory stats = _stats[seller];
        // If user has no stats yet, return default starting stats (450, Tier C)
        if (stats.score == 0 && stats.invoicesCleared == 0) {
            return SellerStats({
                score: 450,
                tier: Tier.C,
                invoicesCleared: 0,
                totalVolume: 0,
                lastUpdated: 0
            });
        }
        return stats;
    }
}

