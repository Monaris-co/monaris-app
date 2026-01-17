// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IInvoiceRegistry.sol";

/**
 * @title InvoiceNFT
 * @notice ERC721 NFT representing tokenized invoices (Real-World Assets)
 * @dev Each invoice is minted as an NFT when created, enabling secondary markets and DeFi composability
 */
contract InvoiceNFT is ERC721URIStorage, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    IInvoiceRegistry public invoiceRegistry;
    bool private _invoiceRegistrySet;
    
    // Mapping from invoiceId to tokenId (1:1 relationship)
    mapping(uint256 => uint256) private _invoiceToTokenId;
    mapping(uint256 => uint256) private _tokenIdToInvoice;
    
    uint256 private _nextTokenId = 1;
    
    event InvoiceNFTMinted(
        uint256 indexed tokenId,
        uint256 indexed invoiceId,
        address indexed to
    );
    
    constructor(
        address defaultAdmin
    ) ERC721("SETTL Invoice NFT", "SETTL-INV") {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, defaultAdmin);
        _invoiceRegistrySet = false;
    }
    
    /**
     * @notice Set InvoiceRegistry address (can only be called once by admin)
     * @param _invoiceRegistry The InvoiceRegistry contract address
     */
    function setInvoiceRegistry(address _invoiceRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!_invoiceRegistrySet, "InvoiceRegistry already set");
        require(_invoiceRegistry != address(0), "Invalid address");
        invoiceRegistry = IInvoiceRegistry(_invoiceRegistry);
        _invoiceRegistrySet = true;
    }
    
    /**
     * @notice Mint an NFT for an invoice (only callable by InvoiceRegistry)
     * @param invoiceId The invoice ID
     * @param to The recipient address (seller)
     */
    function mintInvoiceNFT(
        uint256 invoiceId,
        address to
    ) external onlyRole(MINTER_ROLE) returns (uint256) {
        require(_invoiceRegistrySet, "InvoiceRegistry not set");
        require(to != address(0), "Invalid recipient");
        require(_invoiceToTokenId[invoiceId] == 0, "Invoice already tokenized");
        
        // Get invoice details for metadata
        IInvoiceRegistry.Invoice memory invoice = invoiceRegistry.getInvoice(invoiceId);
        require(invoice.invoiceId != 0, "Invoice not found");
        
        uint256 tokenId = _nextTokenId++;
        _invoiceToTokenId[invoiceId] = tokenId;
        _tokenIdToInvoice[tokenId] = invoiceId;
        
        // Mint NFT to seller
        _mint(to, tokenId);
        
        // Set token URI with invoice metadata
        string memory tokenURI = _generateTokenURI(invoice);
        _setTokenURI(tokenId, tokenURI);
        
        emit InvoiceNFTMinted(tokenId, invoiceId, to);
        
        return tokenId;
    }
    
    /**
     * @notice Get the token ID for an invoice
     * @param invoiceId The invoice ID
     * @return The token ID (0 if not minted)
     */
    function getTokenId(uint256 invoiceId) external view returns (uint256) {
        return _invoiceToTokenId[invoiceId];
    }
    
    /**
     * @notice Get the invoice ID for a token
     * @param tokenId The token ID
     * @return The invoice ID (0 if invalid)
     */
    function getInvoiceId(uint256 tokenId) external view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return _tokenIdToInvoice[tokenId];
    }
    
    /**
     * @notice Get invoice details for a token
     * @param tokenId The token ID
     * @return Invoice struct from registry
     */
    function getInvoiceForToken(uint256 tokenId) external view returns (IInvoiceRegistry.Invoice memory) {
        uint256 invoiceId = _tokenIdToInvoice[tokenId];
        require(invoiceId != 0, "Token does not have associated invoice");
        return invoiceRegistry.getInvoice(invoiceId);
    }
    
    /**
     * @notice Generate token URI with invoice metadata
     * @param invoice The invoice struct
     * @return JSON metadata URI
     */
    function _generateTokenURI(IInvoiceRegistry.Invoice memory invoice) internal pure returns (string memory) {
        // Build JSON metadata
        string memory statusName;
        if (invoice.status == IInvoiceRegistry.InvoiceStatus.Issued) statusName = "Issued";
        else if (invoice.status == IInvoiceRegistry.InvoiceStatus.Financed) statusName = "Financed";
        else if (invoice.status == IInvoiceRegistry.InvoiceStatus.Paid) statusName = "Paid";
        else statusName = "Cleared";
        
        return string(abi.encodePacked(
            'data:application/json;base64,',
            _base64Encode(bytes(string(abi.encodePacked(
                '{"name":"Invoice #', _toString(invoice.invoiceId), '",',
                '"description":"Tokenized invoice representing a real-world receivable on SETTL",',
                '"image":"data:image/svg+xml;base64,', _generateSVGImage(invoice), '",',
                '"attributes":[',
                '{"trait_type":"Invoice ID","value":', _toString(invoice.invoiceId), '},',
                '{"trait_type":"Amount","value":"$', _formatAmount(invoice.amount), '"},',
                '{"trait_type":"Status","value":"', statusName, '"},',
                '{"trait_type":"Seller","value":"', _addressToString(invoice.seller), '"},',
                '{"trait_type":"Buyer","value":"', _addressToString(invoice.buyer), '"},',
                '{"trait_type":"Due Date","value":', _toString(invoice.dueDate), '}',
                ']}'
            ))))
        ));
    }
    
    /**
     * @notice Generate SVG image for NFT
     */
    function _generateSVGImage(IInvoiceRegistry.Invoice memory invoice) internal pure returns (string memory) {
        string memory statusColor;
        if (invoice.status == IInvoiceRegistry.InvoiceStatus.Issued) statusColor = "#3B82F6";
        else if (invoice.status == IInvoiceRegistry.InvoiceStatus.Financed) statusColor = "#F59E0B";
        else if (invoice.status == IInvoiceRegistry.InvoiceStatus.Paid) statusColor = "#10B981";
        else statusColor = "#6366F1";
        
        return _base64Encode(bytes(string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
            '<rect width="400" height="400" fill="#1e1e2e"/>',
            '<rect x="20" y="20" width="360" height="360" rx="20" fill="#2a2a3e" stroke="', statusColor, '" stroke-width="4"/>',
            '<text x="200" y="80" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="white" text-anchor="middle">SETTL Invoice</text>',
            '<text x="200" y="140" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="', statusColor, '" text-anchor="middle">INV-', _toString(invoice.invoiceId), '</text>',
            '<text x="200" y="220" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="white" text-anchor="middle">$', _formatAmount(invoice.amount), '</text>',
            '<text x="200" y="280" font-family="Arial, sans-serif" font-size="20" fill="#888" text-anchor="middle">Tokenized RWA</text>',
            '</svg>'
        ))));
    }
    
    // Helper functions for string manipulation
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
    
    function _formatAmount(uint256 amount) internal pure returns (string memory) {
        // Amount is in 6 decimals (USDC)
        uint256 whole = amount / 1e6;
        uint256 decimals = amount % 1e6;
        if (decimals == 0) {
            return _toString(whole);
        }
        // Format with 2 decimal places
        string memory decStr = _toString(decimals);
        while (bytes(decStr).length < 6) {
            decStr = string(abi.encodePacked("0", decStr));
        }
        // Remove trailing zeros
        for (uint256 i = bytes(decStr).length - 1; i >= 2; i--) {
            if (bytes(decStr)[i] != "0") break;
            assembly {
                mstore(decStr, i)
            }
        }
        return string(abi.encodePacked(_toString(whole), ".", decStr));
    }
    
    function _addressToString(address addr) internal pure returns (string memory) {
        bytes32 value = bytes32(uint256(uint160(addr)));
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            str[2 + i * 2] = alphabet[uint8(value[i + 12] >> 4)];
            str[3 + i * 2] = alphabet[uint8(value[i + 12] & 0x0f)];
        }
        return string(str);
    }
    
    function _base64Encode(bytes memory data) internal pure returns (string memory) {
        string memory table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        uint256 encodedLen = 4 * ((data.length + 2) / 3);
        bytes memory result = new bytes(encodedLen + 32);
        
        uint256 i = 0;
        uint256 j = 0;
        for (; i + 3 <= data.length; i += 3) {
            uint256 a = uint256(uint8(data[i]));
            uint256 b = uint256(uint8(data[i + 1]));
            uint256 c = uint256(uint8(data[i + 2]));
            
            uint256 bitmap = (a << 16) | (b << 8) | c;
            
            result[j++] = bytes(table)[bitmap >> 18];
            result[j++] = bytes(table)[(bitmap >> 12) & 63];
            result[j++] = bytes(table)[(bitmap >> 6) & 63];
            result[j++] = bytes(table)[bitmap & 63];
        }
        
        if (i < data.length) {
            uint256 a = uint256(uint8(data[i]));
            uint256 b = i + 1 < data.length ? uint256(uint8(data[i + 1])) : 0;
            
            uint256 bitmap = (a << 16) | (b << 8);
            result[j++] = bytes(table)[bitmap >> 18];
            result[j++] = bytes(table)[(bitmap >> 12) & 63];
            
            if (i + 1 < data.length) {
                result[j++] = bytes(table)[(bitmap >> 6) & 63];
            } else {
                result[j++] = "=";
            }
            result[j++] = "=";
        }
        
        assembly {
            mstore(result, j)
        }
        
        return string(result);
    }
    
    // Required by ERC721
    function supportsInterface(bytes4 interfaceId) 
        public 
        view 
        override(ERC721URIStorage, AccessControl) 
        returns (bool) 
    {
        return super.supportsInterface(interfaceId);
    }
}

