// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IInvoiceRegistry.sol";
import "./InvoiceNFT.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title InvoiceRegistry
 * @notice Registry for invoice creation and state management
 * @dev Manages invoice lifecycle: Issued → Financed → Paid → Cleared
 * @dev Automatically mints InvoiceNFT when invoice is created (RWA tokenization)
 */
contract InvoiceRegistry is IInvoiceRegistry, AccessControl {
    bytes32 public constant SETTLEMENT_ROUTER_ROLE = keccak256("SETTLEMENT_ROUTER_ROLE");
    bytes32 public constant ADVANCE_ENGINE_ROLE = keccak256("ADVANCE_ENGINE_ROLE");
    
    InvoiceNFT public immutable invoiceNFT;
    
    uint256 private _nextInvoiceId = 1;
    
    mapping(uint256 => Invoice) private _invoices;
    mapping(address => uint256[]) private _sellerInvoices;
    
    modifier validStatusTransition(uint256 invoiceId, InvoiceStatus newStatus) {
        Invoice storage invoice = _invoices[invoiceId];
        InvoiceStatus currentStatus = invoice.status;
        
        // Validate state transitions
        if (currentStatus == InvoiceStatus.Issued) {
            require(
                newStatus == InvoiceStatus.Financed || newStatus == InvoiceStatus.Paid,
                "Invalid transition from Issued"
            );
        } else if (currentStatus == InvoiceStatus.Financed) {
            require(newStatus == InvoiceStatus.Paid, "Invalid transition from Financed");
        } else if (currentStatus == InvoiceStatus.Paid) {
            require(newStatus == InvoiceStatus.Cleared, "Invalid transition from Paid");
        } else {
            revert("Invoice already cleared");
        }
        _;
    }
    
    constructor(address _invoiceNFT, address defaultAdmin) {
        invoiceNFT = InvoiceNFT(_invoiceNFT);
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
    }
    
    /**
     * @notice Create a new invoice
     * @param buyer Buyer address
     * @param amount Invoice amount (6 decimals)
     * @param dueDate Unix timestamp for due date
     * @param metadataHash Optional hash of invoice metadata
     * @return invoiceId The created invoice ID
     */
    function createInvoice(
        address buyer,
        uint256 amount,
        uint256 dueDate,
        bytes32 metadataHash
    ) external returns (uint256) {
        require(buyer != address(0), "Invalid buyer");
        require(amount > 0, "Amount must be > 0");
        require(dueDate > block.timestamp, "Due date must be in future");
        
        uint256 invoiceId = _nextInvoiceId++;
        
        _invoices[invoiceId] = Invoice({
            invoiceId: invoiceId,
            seller: msg.sender,
            buyer: buyer,
            amount: amount,
            dueDate: dueDate,
            status: InvoiceStatus.Issued,
            metadataHash: metadataHash,
            createdAt: block.timestamp,
            paidAt: 0,
            clearedAt: 0
        });
        
        _sellerInvoices[msg.sender].push(invoiceId);
        
        // Mint InvoiceNFT (RWA tokenization)
        invoiceNFT.mintInvoiceNFT(invoiceId, msg.sender);
        
        emit InvoiceCreated(invoiceId, msg.sender, buyer, amount, dueDate, metadataHash);
        
        return invoiceId;
    }
    
    /**
     * @notice Get invoice details
     */
    function getInvoice(uint256 invoiceId) external view returns (Invoice memory) {
        require(_invoices[invoiceId].invoiceId != 0, "Invoice not found");
        return _invoices[invoiceId];
    }
    
    /**
     * @notice Get all invoices for a seller
     */
    function getSellerInvoices(address seller) external view returns (uint256[] memory) {
        return _sellerInvoices[seller];
    }
    
    /**
     * @notice Update invoice status (restricted to authorized contracts)
     */
    function updateInvoiceStatus(
        uint256 invoiceId,
        InvoiceStatus newStatus
    ) external validStatusTransition(invoiceId, newStatus) {
        Invoice storage invoice = _invoices[invoiceId];
        require(invoice.invoiceId != 0, "Invoice not found");
        
        // Check permissions based on transition
        if (newStatus == InvoiceStatus.Financed) {
            require(hasRole(ADVANCE_ENGINE_ROLE, msg.sender), "Not authorized to finance");
        } else if (newStatus == InvoiceStatus.Paid || newStatus == InvoiceStatus.Cleared) {
            require(hasRole(SETTLEMENT_ROUTER_ROLE, msg.sender), "Not authorized to SETTL.e");
        }
        
        invoice.status = newStatus;
        
        if (newStatus == InvoiceStatus.Paid) {
            invoice.paidAt = block.timestamp;
            emit InvoicePaid(invoiceId, invoice.buyer, invoice.amount);
        } else if (newStatus == InvoiceStatus.Cleared) {
            invoice.clearedAt = block.timestamp;
        }
    }
    
    /**
     * @notice Mark invoice as financed (called by AdvanceEngine)
     */
    function markFinanced(uint256 invoiceId, uint256 advanceAmount) external {
        require(hasRole(ADVANCE_ENGINE_ROLE, msg.sender), "Not authorized");
        require(_invoices[invoiceId].status == InvoiceStatus.Issued, "Invalid status");
        
        _invoices[invoiceId].status = InvoiceStatus.Financed;
        emit InvoiceFinanced(invoiceId, _invoices[invoiceId].seller, advanceAmount);
    }
    
    /**
     * @notice Mark invoice as cleared with SETTL.ement details (called by SETTL.ementRouter)
     */
    function markCleared(
        uint256 invoiceId,
        uint256 sellerAmount,
        uint256 feeAmount,
        uint256 repaymentAmount
    ) external {
        require(hasRole(SETTLEMENT_ROUTER_ROLE, msg.sender), "Not authorized");
        require(_invoices[invoiceId].status == InvoiceStatus.Paid, "Must be Paid");
        
        _invoices[invoiceId].status = InvoiceStatus.Cleared;
        _invoices[invoiceId].clearedAt = block.timestamp;
        
        emit InvoiceCleared(invoiceId, _invoices[invoiceId].seller, sellerAmount, feeAmount, repaymentAmount);
    }
}

