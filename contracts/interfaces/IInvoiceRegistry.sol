// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IInvoiceRegistry
 * @notice Interface for invoice registry contract
 */
interface IInvoiceRegistry {
    enum InvoiceStatus {
        Issued,     // 0 - Invoice created
        Financed,   // 1 - Advance requested and granted
        Paid,       // 2 - Buyer paid invoice
        Cleared     // 3 - SETTL.ement complete
    }
    
    struct Invoice {
        uint256 invoiceId;
        address seller;
        address buyer;
        uint256 amount;         // Invoice amount in USDC (6 decimals)
        uint256 dueDate;        // Unix timestamp
        InvoiceStatus status;
        bytes32 metadataHash;   // Optional: hash of invoice metadata (line items, etc.)
        uint256 createdAt;
        uint256 paidAt;
        uint256 clearedAt;
    }
    
    event InvoiceCreated(
        uint256 indexed invoiceId,
        address indexed seller,
        address indexed buyer,
        uint256 amount,
        uint256 dueDate,
        bytes32 metadataHash
    );
    
    event InvoiceFinanced(
        uint256 indexed invoiceId,
        address indexed seller,
        uint256 advanceAmount
    );
    
    event InvoicePaid(
        uint256 indexed invoiceId,
        address indexed buyer,
        uint256 amount
    );
    
    event InvoiceCleared(
        uint256 indexed invoiceId,
        address indexed seller,
        uint256 sellerAmount,
        uint256 feeAmount,
        uint256 repaymentAmount
    );
    
    function createInvoice(
        address buyer,
        uint256 amount,
        uint256 dueDate,
        bytes32 metadataHash
    ) external returns (uint256);
    
    function getInvoice(uint256 invoiceId) external view returns (Invoice memory);
    
    function getSellerInvoices(address seller) external view returns (uint256[] memory);
    
    function updateInvoiceStatus(uint256 invoiceId, InvoiceStatus newStatus) external;
    
    function markFinanced(uint256 invoiceId, uint256 advanceAmount) external;
    
    function markCleared(
        uint256 invoiceId,
        uint256 sellerAmount,
        uint256 feeAmount,
        uint256 repaymentAmount
    ) external;
}

