// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAuditLogger} from "./interfaces/IAuditLogger.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {IRoleManager} from "./interfaces/IRoleManager.sol";
import {PlatformConstants} from "./PlatformConstants.sol";

contract AssetNFT is ERC721, ERC721URIStorage, AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = PlatformConstants.ADMIN_ROLE;
    bytes32 public constant MANAGER_ROLE = PlatformConstants.MANAGER_ROLE;
    bytes32 public constant ASSET_MINT = PlatformConstants.ASSET_MINT;
    bytes32 public constant ASSET_ASSIGN = PlatformConstants.ASSET_ASSIGN;
    bytes32 public constant ASSET_TRANSFER = PlatformConstants.ASSET_TRANSFER;
    bytes32 public constant ASSET_BURN = PlatformConstants.ASSET_BURN;
    bytes32 public constant ASSET_METADATA_UPDATE = PlatformConstants.ASSET_METADATA_UPDATE;

    struct AssetInfo {
        uint256 tokenId;
        address creator;
        uint64 createdAt;
        bool burned;
    }

    struct TransferRecord {
        address from;
        address to;
        address operator;
        uint64 timestamp;
        bytes32 transactionReason;
    }

    uint256 public nextTokenId = 1;
    mapping(uint256 => AssetInfo) private _assets;
    mapping(uint256 => TransferRecord[]) private _ownershipHistory;
    address public identityRegistry;
    address public roleManager;
    address public auditLogger;

    error InvalidRecipient();
    error TokenDoesNotExist(uint256 tokenId);
    error TokenAlreadyBurned(uint256 tokenId);
    error EmptyMetadataURI();
    error MissingPermission(address account, bytes32 permission);
    error NotOwnerOrApproved(address account, uint256 tokenId);
    error TransferToInactiveIdentity();
    error IdentityRegistryNotConfigured();
    error RoleManagerNotConfigured();
    error AuditLoggerNotConfigured();
    error InvalidAddress();
    error AlreadyConfigured();

    event AssetMinted(
        uint256 indexed tokenId,
        address indexed creator,
        address indexed initialOwner,
        string metadataURI
    );
    event AssetAssigned(
        uint256 indexed tokenId,
        bytes32 indexed recipientDidKey,
        address indexed recipient
    );
    event AssetTransferred(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        address operator
    );
    event AssetBurned(uint256 indexed tokenId, address indexed burner);
    event MetadataUpdated(
        uint256 indexed tokenId,
        string previousURI,
        string newURI,
        address indexed updater
    );
    event IdentityRegistryConfigured(address indexed registry);
    event RoleManagerConfigured(address indexed roleManager);
    event AuditLoggerConfigured(address indexed auditLogger);

    constructor() ERC721("IAM Managed Asset", "IAM") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function mint(address to, string calldata metadataURI)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 tokenId)
    {
        _requirePermission(ASSET_MINT);
        _requireAuditLogger();
        _validateMetadata(metadataURI);
        _validateRecipient(to);

        tokenId = nextTokenId++;
        _assets[tokenId] = AssetInfo({
            tokenId: tokenId,
            creator: msg.sender,
            createdAt: uint64(block.timestamp),
            burned: false
        });
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, metadataURI);
        emit AssetMinted(tokenId, msg.sender, to, metadataURI);
    }

    function assign(uint256 tokenId, string calldata toDid)
        external
        nonReentrant
        whenNotPaused
    {
        _requirePermission(ASSET_ASSIGN);
        _requireAuditLogger();
        _requireExisting(tokenId);
        address recipient = _walletForDID(toDid);
        _validateRecipient(recipient);
        address from = ownerOf(tokenId);
        _transfer(from, recipient, tokenId);
        emit AssetAssigned(tokenId, IIdentityRegistry(identityRegistry).didKeyForWallet(recipient), recipient);
    }

    function transferAsset(address from, address to, uint256 tokenId)
        external
        nonReentrant
        whenNotPaused
    {
        _requirePermission(ASSET_TRANSFER);
        _requireAuditLogger();
        _requireExisting(tokenId);
        _validateRecipient(to);
        if (ownerOf(tokenId) != from) revert NotOwnerOrApproved(msg.sender, tokenId);

        bool privileged =
            IRoleManager(roleManager).hasRole(ADMIN_ROLE, msg.sender) ||
            IRoleManager(roleManager).hasRole(MANAGER_ROLE, msg.sender);
        if (
            !privileged &&
            msg.sender != from &&
            getApproved(tokenId) != msg.sender &&
            !isApprovedForAll(from, msg.sender)
        ) revert NotOwnerOrApproved(msg.sender, tokenId);

        _transfer(from, to, tokenId);
    }

    function burn(uint256 tokenId) external nonReentrant whenNotPaused {
        _requirePermission(ASSET_BURN);
        _requireAuditLogger();
        _requireExisting(tokenId);
        _burn(tokenId);
        _assets[tokenId].burned = true;
        emit AssetBurned(tokenId, msg.sender);
    }

    function updateTokenURI(uint256 tokenId, string calldata newURI)
        external
        nonReentrant
        whenNotPaused
    {
        _requirePermission(ASSET_METADATA_UPDATE);
        _requireAuditLogger();
        _requireExisting(tokenId);
        _validateMetadata(newURI);
        string memory previousURI = tokenURI(tokenId);
        _setTokenURI(tokenId, newURI);
        emit MetadataUpdated(tokenId, previousURI, newURI, msg.sender);
        _audit(keccak256("ASSET_METADATA_UPDATED"), _didKeyForOwner(tokenId), tokenId, keccak256(bytes(newURI)));
    }

    function getAsset(uint256 tokenId) external view returns (AssetInfo memory) {
        _requireRecorded(tokenId);
        return _assets[tokenId];
    }

    function getOwnershipHistory(uint256 tokenId)
        external
        view
        returns (TransferRecord[] memory)
    {
        _requireRecorded(tokenId);
        return _ownershipHistory[tokenId];
    }

    function verifyOwnership(string calldata did, uint256 tokenId) external view returns (bool) {
        if (!_assetExists(tokenId) || identityRegistry == address(0)) return false;
        address wallet;
        try IIdentityRegistry(identityRegistry).walletForDID(did) returns (address resolved) {
            wallet = resolved;
        } catch {
            return false;
        }
        return wallet != address(0) && ownerOf(tokenId) == wallet;
    }

    function setIdentityRegistry(address registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (registry == address(0)) revert InvalidAddress();
        if (identityRegistry != address(0)) revert AlreadyConfigured();
        identityRegistry = registry;
        emit IdentityRegistryConfigured(registry);
    }

    function setRoleManager(address manager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (manager == address(0)) revert InvalidAddress();
        if (roleManager != address(0)) revert AlreadyConfigured();
        roleManager = manager;
        emit RoleManagerConfigured(manager);
    }

    function setAuditLogger(address logger) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (logger == address(0)) revert InvalidAddress();
        if (auditLogger != address(0)) revert AlreadyConfigured();
        auditLogger = logger;
        emit AuditLoggerConfigured(logger);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _safeTransfer(address from, address to, uint256 tokenId, bytes memory data)
        internal
        override
        nonReentrant
    {
        super._safeTransfer(from, to, tokenId, data);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721)
        returns (address)
    {
        auth;
        _requireNotPaused();
        _requireAuditLogger();
        address from = _ownerOf(tokenId);
        if (to != address(0)) {
            _validateRecipient(to);
        }
        if (from != address(0) && to != address(0)) {
            _requirePermission(ASSET_TRANSFER);
        }
        bytes32 targetDidKey = _didKeyForWallet(to == address(0) ? from : to);
        address previous = super._update(to, tokenId, auth);
        bytes32 reason = from == address(0)
            ? keccak256("ASSET_MINTED")
            : to == address(0)
                ? keccak256("ASSET_BURNED")
                : bytes32(0);
        _ownershipHistory[tokenId].push(
            TransferRecord({
                from: from,
                to: to,
                operator: msg.sender,
                timestamp: uint64(block.timestamp),
                transactionReason: reason
            })
        );
        if (from != address(0) && to != address(0)) {
            emit AssetTransferred(tokenId, from, to, msg.sender);
            _audit(
                keccak256("ASSET_TRANSFERRED"),
                targetDidKey,
                tokenId,
                bytes32(0)
            );
        } else if (from == address(0)) {
            _audit(
                keccak256("ASSET_MINTED"),
                targetDidKey,
                tokenId,
                bytes32(0)
            );
        } else {
            _audit(keccak256("ASSET_BURNED"), targetDidKey, tokenId, bytes32(0));
        }
        return previous;
    }

    function _requireExisting(uint256 tokenId) internal view {
        if (!_assetExists(tokenId)) {
            if (tokenId < nextTokenId && _assets[tokenId].burned) revert TokenAlreadyBurned(tokenId);
            revert TokenDoesNotExist(tokenId);
        }
    }

    function _requireRecorded(uint256 tokenId) internal view {
        if (_assets[tokenId].tokenId == 0) revert TokenDoesNotExist(tokenId);
    }

    function _assetExists(uint256 tokenId) internal view returns (bool) {
        return _assets[tokenId].tokenId != 0 && !_assets[tokenId].burned;
    }

    function _validateRecipient(address to) internal view {
        if (to == address(0)) revert InvalidRecipient();
        if (identityRegistry == address(0)) revert IdentityRegistryNotConfigured();
        if (!IIdentityRegistry(identityRegistry).isActiveWallet(to)) {
            revert TransferToInactiveIdentity();
        }
    }

    function _walletForDID(string calldata did) internal view returns (address wallet) {
        if (identityRegistry == address(0)) revert IdentityRegistryNotConfigured();
        wallet = IIdentityRegistry(identityRegistry).walletForDID(did);
        if (wallet == address(0)) revert InvalidRecipient();
    }

    function _validateMetadata(string calldata metadataURI) internal pure {
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();
    }

    function _requirePermission(bytes32 permission) internal view {
        if (roleManager == address(0)) revert RoleManagerNotConfigured();
        if (!IRoleManager(roleManager).hasPermission(msg.sender, permission)) {
            revert MissingPermission(msg.sender, permission);
        }
    }

    function _requireAuditLogger() internal view {
        if (auditLogger == address(0)) revert AuditLoggerNotConfigured();
    }

    function _didKeyForOwner(uint256 tokenId) internal view returns (bytes32) {
        if (identityRegistry == address(0)) return bytes32(0);
        address owner = _ownerOf(tokenId);
        return _didKeyForWallet(owner);
    }

    function _didKeyForWallet(address wallet) internal view returns (bytes32) {
        if (identityRegistry == address(0) || wallet == address(0)) return bytes32(0);
        return IIdentityRegistry(identityRegistry).didKeyForWallet(wallet);
    }

    function _audit(bytes32 action, bytes32 didKey, uint256 tokenId, bytes32 metadataHash) internal {
        IAuditLogger(auditLogger).log(action, didKey, tokenId, metadataHash);
    }
}
