// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IInvoiceRegistry.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IAdvanceEngine.sol";
import "./interfaces/IReputation.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title SETTL.ementRouter
 * @notice Executes atomic SETTL.ement waterfall: fee → pool repayment → seller remainder
 * @dev This is the core contract that orchestrates payment SETTL.ement
 */
contract SettlementRouter is AccessControl {
    using SafeERC20 for IERC20;
    
    IERC20 public immutable token; // DemoUSDC
    IInvoiceRegistry public immutable invoiceRegistry;
    IVault public immutable vault;
    IAdvanceEngine public immutable advanceEngine;
    IReputation public immutable reputation;
    
    address public treasury; // Fee recipient
    uint256 public protocolFeeBps; // Protocol fee in basis points (e.g., 50 = 0.5%)
    
    uint256 private constant BASIS_POINTS = 10000;
    
    event InvoiceSettled(
        uint256 indexed invoiceId,
        address indexed buyer,
        address indexed seller,
        uint256 invoiceAmount,
        uint256 feeAmount,
        uint256 repaymentAmount,
        uint256 sellerAmount
    );
    
    constructor(
        address _token,
        address _invoiceRegistry,
        address _vault,
        address _advanceEngine,
        address _reputation,
        address _treasury,
        uint256 _protocolFeeBps,
        address defaultAdmin
    ) {
        token = IERC20(_token);
        invoiceRegistry = IInvoiceRegistry(_invoiceRegistry);
        vault = IVault(_vault);
        advanceEngine = IAdvanceEngine(_advanceEngine);
        reputation = IReputation(_reputation);
        treasury = _treasury;
        protocolFeeBps = _protocolFeeBps;
        
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
    }
    
    /**
     * @notice Pay an invoice and execute SETTL.ement waterfall atomically
     * @param invoiceId Invoice ID to pay
     */
    function payInvoice(uint256 invoiceId) external {
        IInvoiceRegistry.Invoice memory invoice = invoiceRegistry.getInvoice(invoiceId);
        require(invoice.invoiceId != 0, "Invoice not found");
        require(invoice.status != IInvoiceRegistry.InvoiceStatus.Cleared, "Already cleared");
        require(invoice.buyer == msg.sender, "Not invoice buyer");
        
        // Pull payment from buyer
        token.safeTransferFrom(msg.sender, address(this), invoice.amount);
        
        // Update invoice status to Paid
        invoiceRegistry.updateInvoiceStatus(invoiceId, IInvoiceRegistry.InvoiceStatus.Paid);
        
        // Calculate SETTL.ement amounts
        uint256 feeAmount = (invoice.amount * protocolFeeBps) / BASIS_POINTS;
        
        // Check if invoice was financed
        uint256 repaymentAmount = 0;
        try advanceEngine.getRepaymentAmount(invoiceId) returns (uint256 amount) {
            repaymentAmount = amount;
        } catch {
            // Invoice not financed, no repayment
        }
        
        // Calculate seller remainder: invoiceAmount - fee - repayment
        uint256 sellerAmount = invoice.amount - feeAmount - repaymentAmount;
        
        // Verify math: fee + repayment + seller = invoiceAmount
        require(
            feeAmount + repaymentAmount + sellerAmount == invoice.amount,
            "SETTL.ement math mismatch"
        );
        
        // Execute waterfall atomically:
        // 1. Send fee to treasury
        if (feeAmount > 0) {
            token.safeTransfer(treasury, feeAmount);
        }
        
        // 2. Repay vault (if financed)
        if (repaymentAmount > 0) {
            // Approve vault to pull repayment from this contract
            // Note: Using approve directly since we control the flow and reset to zero after
            token.approve(address(vault), repaymentAmount);
            // Vault will transfer repayment from this contract via safeTransferFrom
            vault.repay(repaymentAmount);
            // Reset approval to zero (gas optimization and security)
            token.approve(address(vault), 0);
            // Mark advance as repaid
            advanceEngine.markRepaid(invoiceId);
        }
        
        // 3. Send remainder to seller
        if (sellerAmount > 0) {
            token.safeTransfer(invoice.seller, sellerAmount);
        }
        
        // 4. Mark invoice as cleared
        invoiceRegistry.markCleared(invoiceId, sellerAmount, feeAmount, repaymentAmount);
        
        // 5. Update reputation (must succeed - atomic operation)
        // If reputation update fails, entire transaction reverts (invoice remains uncleared)
        // This ensures reputation is always updated when invoices are cleared
        reputation.updateReputation(invoice.seller, invoice.amount);
        
        emit InvoiceSettled(
            invoiceId,
            msg.sender,
            invoice.seller,
            invoice.amount,
            feeAmount,
            repaymentAmount,
            sellerAmount
        );
    }
    
    /**
     * @notice Set protocol fee (admin only)
     */
    function setProtocolFee(uint256 newFeeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newFeeBps <= 500, "Fee too high"); // Max 5%
        protocolFeeBps = newFeeBps;
    }
    
    /**
     * @notice Set treasury address (admin only)
     */
    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newTreasury != address(0), "Invalid treasury");
        treasury = newTreasury;
    }
}

