// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Staking
 * @notice Staking contract for USMT+ tokens. Users stake USMT+ and receive sUSMT+ (staked USMT+)
 * @dev sUSMT+ accrues yield over time based on staking rewards
 */
contract Staking is ERC20, AccessControl {
    using SafeERC20 for IERC20;
    
    bytes32 public constant REWARDS_DISTRIBUTOR_ROLE = keccak256("REWARDS_DISTRIBUTOR_ROLE");
    
    IERC20 public immutable usmtPlus; // USMT+ token
    uint256 public totalStaked; // Total USMT+ staked
    uint256 public totalRewardsDistributed; // Total rewards distributed (for tracking)
    
    // Staking info per user
    mapping(address => uint256) public stakedBalance; // User's staked USMT+ amount
    
    uint256 private constant DECIMALS = 1e6; // 6 decimals
    
    event Stake(address indexed user, uint256 usmtAmount, uint256 susmtAmount);
    event Unstake(address indexed user, uint256 usmtAmount, uint256 susmtAmount);
    event RewardsDistributed(uint256 totalAmount);
    
    constructor(address _usmtPlus, address defaultAdmin) ERC20("Staked USMT+", "sUSMT+") {
        usmtPlus = IERC20(_usmtPlus);
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
    }
    
    function decimals() public pure override returns (uint8) {
        return 6; // Match USMT+ decimals
    }
    
    /**
     * @notice Stake USMT+ and receive sUSMT+
     * @param amount Amount of USMT+ to stake (6 decimals)
     * @return susmtAmount Amount of sUSMT+ minted
     */
    function stake(uint256 amount) external returns (uint256 susmtAmount) {
        require(amount > 0, "Amount must be > 0");
        
        // Transfer USMT+ from user
        usmtPlus.safeTransferFrom(msg.sender, address(this), amount);
        
        // Calculate sUSMT+ to mint (1:1 for now, but can be adjusted for yield accumulation)
        // In future, this could use an exchange rate based on accumulated yield
        susmtAmount = amount;
        
        // Mint sUSMT+ to user
        _mint(msg.sender, susmtAmount);
        
        // Update staking info
        stakedBalance[msg.sender] += amount;
        totalStaked += amount;
        
        emit Stake(msg.sender, amount, susmtAmount);
        return susmtAmount;
    }
    
    /**
     * @notice Unstake USMT+ by burning sUSMT+
     * @param susmtAmount Amount of sUSMT+ to burn (6 decimals)
     * @return usmtAmount Amount of USMT+ returned
     */
    function unstake(uint256 susmtAmount) external returns (uint256 usmtAmount) {
        require(susmtAmount > 0, "Amount must be > 0");
        require(balanceOf(msg.sender) >= susmtAmount, "Insufficient sUSMT+ balance");
        
        // Calculate USMT+ to return (1:1 for now)
        // In future, this could use an exchange rate based on accumulated yield
        usmtAmount = susmtAmount;
        require(stakedBalance[msg.sender] >= usmtAmount, "Insufficient staked balance");
        
        // Burn sUSMT+ from user
        _burn(msg.sender, susmtAmount);
        
        // Transfer USMT+ back to user
        usmtPlus.safeTransfer(msg.sender, usmtAmount);
        
        // Update staking info
        stakedBalance[msg.sender] -= usmtAmount;
        totalStaked -= usmtAmount;
        
        emit Unstake(msg.sender, usmtAmount, susmtAmount);
        return usmtAmount;
    }
    
    /**
     * @notice Get user's staked balance
     * @param user User address
     * @return Amount of USMT+ staked by user
     */
    function getStakedBalance(address user) external view returns (uint256) {
        return stakedBalance[user];
    }
    
    /**
     * @notice Get user's sUSMT+ balance (staked token balance)
     * @param user User address
     * @return Amount of sUSMT+ held by user
     */
    function getSusmtBalance(address user) external view returns (uint256) {
        return balanceOf(user);
    }
    
    /**
     * @notice Distribute rewards (to be called by rewards distributor)
     * @dev In future, this could mint additional sUSMT+ to stakers or transfer USMT+ rewards
     * For now, this is a placeholder for future yield distribution logic
     */
    function distributeRewards(uint256 amount) external onlyRole(REWARDS_DISTRIBUTOR_ROLE) {
        require(amount > 0, "Amount must be > 0");
        // TODO: Implement reward distribution logic
        // For now, just track total rewards distributed
        totalRewardsDistributed += amount;
        emit RewardsDistributed(amount);
    }
}
