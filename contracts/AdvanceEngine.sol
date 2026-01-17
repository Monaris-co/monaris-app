// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IAdvanceEngine.sol";
import "./interfaces/IInvoiceRegistry.sol";
import "./interfaces/IVault.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AdvanceEngine
 * @notice Handles invoice financing (advances) from the funding pool
 * @dev Calculates interest, manages debt, coordinates with Vault for lending
 */
contract AdvanceEngine is IAdvanceEngine, AccessControl {
    bytes32 public constant SETTLEMENT_ROUTER_ROLE = keccak256("SETTLEMENT_ROUTER_ROLE");
    
    IInvoiceRegistry public immutable invoiceRegistry;
    IVault public immutable vault;
    
    mapping(uint256 => Advance) private _advances;
    mapping(address => uint256[]) private _sellerAdvances; // Invoice IDs
    
    uint256 private constant BASIS_POINTS = 10000;
    uint256 private constant SECONDS_PER_YEAR = 365 days;
    
    constructor(
        address _invoiceRegistry,
        address _vault,
        address defaultAdmin
    ) {
        invoiceRegistry = IInvoiceRegistry(_invoiceRegistry);
        vault = IVault(_vault);
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        // Note: BORROWER_ROLE must be granted to this contract by Vault admin after deployment
    }
    
    /**
     * @notice Request an advance on an invoice
     * @param invoiceId Invoice ID to finance
     * @param ltvBps Loan-to-value in basis points (e.g., 9000 = 90% for Tier A, 6500 = 65% for Tier B, 3500 = 35% for Tier C)
     * @param aprBps APR in basis points (e.g., 1000 = 10%)
     * @return advanceAmount Amount sent to seller
     * @dev Frontend enforces tier-based LTV limits: Tier A = 90%, Tier B = 65%, Tier C = 35%
     */
    function requestAdvance(
        uint256 invoiceId,
        uint256 ltvBps,
        uint256 aprBps
    ) external returns (uint256 advanceAmount) {
        require(ltvBps > 0 && ltvBps <= BASIS_POINTS, "Invalid LTV");
        require(aprBps > 0 && aprBps <= 5000, "Invalid APR"); // Max 50% APR
        
        IInvoiceRegistry.Invoice memory invoice = invoiceRegistry.getInvoice(invoiceId);
        require(invoice.seller == msg.sender, "Not invoice seller");
        require(invoice.status == IInvoiceRegistry.InvoiceStatus.Issued, "Invalid status");
        
        // Calculate advance amount (LTV of invoice amount)
        advanceAmount = (invoice.amount * ltvBps) / BASIS_POINTS;
        require(advanceAmount > 0, "Advance too small");
        
        // Calculate interest (simple interest until due date)
        // interest = principal * APR * (days until due / 365)
        uint256 daysUntilDue = invoice.dueDate > block.timestamp 
            ? (invoice.dueDate - block.timestamp) / 1 days
            : 0;
        uint256 principal = advanceAmount;
        uint256 interest = (principal * aprBps * daysUntilDue) / (BASIS_POINTS * 365);
        uint256 totalRepayment = principal + interest;
        
        // Check vault has liquidity
        require(vault.getTotalLiquidity() - vault.getTotalBorrowed() >= advanceAmount, "Insufficient vault liquidity");
        
        // Borrow from vault
        vault.borrow(advanceAmount);
        
        // Record advance
        _advances[invoiceId] = Advance({
            invoiceId: invoiceId,
            seller: msg.sender,
            advanceAmount: advanceAmount,
            principal: principal,
            interest: interest,
            totalRepayment: totalRepayment,
            requestedAt: block.timestamp,
            repaid: false
        });
        
        _sellerAdvances[msg.sender].push(invoiceId);
        
        // Mark invoice as financed
        invoiceRegistry.markFinanced(invoiceId, advanceAmount);
        
        emit AdvanceRequested(invoiceId, msg.sender, advanceAmount, principal, interest);
        
        return advanceAmount;
    }
    
    /**
     * @notice Get advance details for an invoice
     */
    function getAdvance(uint256 invoiceId) external view returns (Advance memory) {
        require(_advances[invoiceId].invoiceId != 0, "Advance not found");
        return _advances[invoiceId];
    }
    
    /**
     * @notice Get total debt for a seller (sum of unpaid advances)
     */
    function getTotalDebt(address seller) external view returns (uint256) {
        uint256[] memory advanceIds = _sellerAdvances[seller];
        uint256 total = 0;
        for (uint256 i = 0; i < advanceIds.length; i++) {
            Advance memory adv = _advances[advanceIds[i]];
            if (!adv.repaid) {
                total += adv.totalRepayment;
            }
        }
        return total;
    }
    
    /**
     * @notice Mark advance as repaid (called by SETTL.ementRouter)
     */
    function markRepaid(uint256 invoiceId) external onlyRole(SETTLEMENT_ROUTER_ROLE) {
        Advance storage advance = _advances[invoiceId];
        require(advance.invoiceId != 0, "Advance not found");
        require(!advance.repaid, "Already repaid");
        
        advance.repaid = true;
        emit AdvanceRepaid(invoiceId, advance.seller, advance.totalRepayment);
    }
    
    /**
     * @notice Get repayment amount for an invoice (if financed)
     */
    function getRepaymentAmount(uint256 invoiceId) external view returns (uint256) {
        Advance memory advance = _advances[invoiceId];
        if (advance.invoiceId == 0 || advance.repaid) {
            return 0;
        }
        return advance.totalRepayment;
    }
}

