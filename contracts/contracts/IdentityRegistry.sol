// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAuditLogger} from "./interfaces/IAuditLogger.sol";
import {IRoleManager} from "./interfaces/IRoleManager.sol";
import {PlatformConstants} from "./PlatformConstants.sol";

contract IdentityRegistry is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant IDENTITY_CREATE = PlatformConstants.IDENTITY_CREATE;
    bytes32 public constant IDENTITY_UPDATE = PlatformConstants.IDENTITY_UPDATE;
    bytes32 public constant IDENTITY_REVOKE = PlatformConstants.IDENTITY_REVOKE;
    bytes32 public constant ROLE_ASSIGN = PlatformConstants.ROLE_ASSIGN;
    bytes32 public constant ADMIN_ROLE = PlatformConstants.ADMIN_ROLE;

    uint256 public constant MAX_DID_LENGTH = 256;

    struct Identity {
        string did;
        address wallet;
        bytes32 documentHash;
        uint8 roleCode;
        uint64 createdAt;
        uint64 updatedAt;
        bool active;
    }

    mapping(bytes32 => Identity) private _identities;
    mapping(address => bytes32) public walletToDid;
    mapping(bytes32 => bool) public identityExists;
    address public roleManager;
    address public auditLogger;

    error EmptyDID();
    error DIDTooLong();
    error DocumentHashRequired();
    error InvalidWallet();
    error DIDAlreadyRegistered(bytes32 didKey);
    error WalletAlreadyRegistered(address wallet);
    error IdentityNotFound(bytes32 didKey);
    error IdentityInactive(bytes32 didKey);
    error UnauthorizedIdentityUpdate();
    error MissingPermission(address account, bytes32 permission);
    error RoleManagerNotConfigured();
    error AuditLoggerNotConfigured();
    error InvalidAddress();
    error AlreadyConfigured();
    error CannotRevokeAdminIdentity();

    event IdentityCreated(
        bytes32 indexed didKey,
        string did,
        address indexed wallet,
        uint8 roleCode,
        bytes32 documentHash
    );
    event IdentityUpdated(
        bytes32 indexed didKey,
        address indexed wallet,
        bytes32 previousDocumentHash,
        bytes32 newDocumentHash
    );
    event IdentityRevoked(bytes32 indexed didKey, string did, address indexed revoker);
    event IdentityRestored(bytes32 indexed didKey, string did, address indexed restorer);
    event IdentityRoleAssigned(
        bytes32 indexed didKey,
        address indexed account,
        bytes32 indexed role,
        address assigner
    );
    event IdentityRoleRevoked(
        bytes32 indexed didKey,
        address indexed account,
        bytes32 indexed role,
        address revoker
    );
    event RoleManagerConfigured(address indexed roleManager);
    event AuditLoggerConfigured(address indexed auditLogger);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function createIdentity(
        address wallet,
        string calldata did,
        uint8 roleCode,
        bytes32 documentHash
    ) external nonReentrant whenNotPaused returns (bytes32 didKey) {
        _requirePermission(IDENTITY_CREATE);
        _requireAuditLogger();
        if (wallet == address(0)) revert InvalidWallet();
        _validateDID(did);
        if (documentHash == bytes32(0)) revert DocumentHashRequired();
        didKey = keccak256(bytes(did));
        if (identityExists[didKey]) revert DIDAlreadyRegistered(didKey);
        if (walletToDid[wallet] != bytes32(0)) revert WalletAlreadyRegistered(wallet);

        _identities[didKey] = Identity({
            did: did,
            wallet: wallet,
            documentHash: documentHash,
            roleCode: roleCode,
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            active: true
        });
        identityExists[didKey] = true;
        walletToDid[wallet] = didKey;
        emit IdentityCreated(didKey, did, wallet, roleCode, documentHash);
        _audit(keccak256("IDENTITY_CREATED"), didKey, documentHash);
    }

    function updateDIDDocument(string calldata did, bytes32 newDocumentHash)
        external
        nonReentrant
        whenNotPaused
    {
        _requireAuditLogger();
        if (newDocumentHash == bytes32(0)) revert DocumentHashRequired();
        _validateDID(did);
        bytes32 didKey = keccak256(bytes(did));
        _requireExists(didKey);
        Identity storage identity = _identities[didKey];
        if (!identity.active) revert IdentityInactive(didKey);
        if (
            msg.sender != identity.wallet &&
            !_hasPermission(msg.sender, IDENTITY_UPDATE)
        ) revert UnauthorizedIdentityUpdate();

        bytes32 previous = identity.documentHash;
        identity.documentHash = newDocumentHash;
        identity.updatedAt = uint64(block.timestamp);
        emit IdentityUpdated(didKey, identity.wallet, previous, newDocumentHash);
        _audit(keccak256("IDENTITY_UPDATED"), didKey, newDocumentHash);
    }

    function revokeIdentity(string calldata did) external nonReentrant whenNotPaused {
        _requirePermission(IDENTITY_REVOKE);
        _requireAuditLogger();
        _validateDID(did);
        bytes32 didKey = keccak256(bytes(did));
        _requireExists(didKey);
        Identity storage identity = _identities[didKey];
        if (!identity.active) revert IdentityInactive(didKey);
        if (
            IRoleManager(roleManager).hasRole(ADMIN_ROLE, identity.wallet) &&
            IRoleManager(roleManager).adminMemberCount() <= 1
        ) revert CannotRevokeAdminIdentity();
        identity.active = false;
        identity.updatedAt = uint64(block.timestamp);
        emit IdentityRevoked(didKey, identity.did, msg.sender);
        _audit(keccak256("IDENTITY_REVOKED"), didKey, bytes32(0));
    }

    function restoreIdentity(string calldata did) external nonReentrant whenNotPaused {
        _requirePermission(IDENTITY_UPDATE);
        _requireAuditLogger();
        _validateDID(did);
        bytes32 didKey = keccak256(bytes(did));
        _requireExists(didKey);
        Identity storage identity = _identities[didKey];
        if (identity.active) revert IdentityInactive(didKey);
        identity.active = true;
        identity.updatedAt = uint64(block.timestamp);
        emit IdentityRestored(didKey, identity.did, msg.sender);
        _audit(keccak256("IDENTITY_RESTORED"), didKey, bytes32(0));
    }

    function assignRole(string calldata did, bytes32 role, address account)
        external
        nonReentrant
        whenNotPaused
    {
        _requirePermission(ROLE_ASSIGN);
        _requireAuditLogger();
        if (account == address(0)) revert InvalidWallet();
        bytes32 didKey = keccak256(bytes(did));
        _requireActive(didKey);
        IRoleManager(roleManager).grantPlatformRole(role, account);
        emit IdentityRoleAssigned(didKey, account, role, msg.sender);
        _audit(keccak256("IDENTITY_ROLE_ASSIGNED"), didKey, role);
    }

    function revokeRole(string calldata did, bytes32 role, address account)
        external
        nonReentrant
        whenNotPaused
    {
        _requirePermission(ROLE_ASSIGN);
        _requireAuditLogger();
        if (account == address(0)) revert InvalidWallet();
        bytes32 didKey = keccak256(bytes(did));
        _requireActive(didKey);
        IRoleManager(roleManager).revokePlatformRole(role, account);
        emit IdentityRoleRevoked(didKey, account, role, msg.sender);
        _audit(keccak256("IDENTITY_ROLE_REVOKED"), didKey, role);
    }

    function resolveDID(string calldata did) external view returns (Identity memory) {
        bytes32 didKey = keccak256(bytes(did));
        _requireExists(didKey);
        return _identities[didKey];
    }

    function didForWallet(address wallet) external view returns (string memory) {
        bytes32 didKey = walletToDid[wallet];
        if (didKey == bytes32(0)) return "";
        return _identities[didKey].did;
    }

    function didKeyForWallet(address wallet) external view returns (bytes32) {
        return walletToDid[wallet];
    }

    function isActiveWallet(address wallet) public view returns (bool) {
        bytes32 didKey = walletToDid[wallet];
        return didKey != bytes32(0) && identityExists[didKey] && _identities[didKey].active;
    }

    function isActiveDID(string calldata did) external view returns (bool) {
        bytes32 didKey = keccak256(bytes(did));
        return identityExists[didKey] && _identities[didKey].active;
    }

    function walletForDID(string calldata did) external view returns (address) {
        bytes32 didKey = keccak256(bytes(did));
        _requireExists(didKey);
        return _identities[didKey].wallet;
    }

    function getRoleCode(string calldata did) external view returns (uint8) {
        bytes32 didKey = keccak256(bytes(did));
        _requireExists(didKey);
        return _identities[didKey].roleCode;
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

    function _validateDID(string calldata did) internal pure {
        uint256 length = bytes(did).length;
        if (length == 0) revert EmptyDID();
        if (length > MAX_DID_LENGTH) revert DIDTooLong();
    }

    function _requirePermission(bytes32 permission) internal view {
        if (roleManager == address(0)) revert RoleManagerNotConfigured();
        if (!IRoleManager(roleManager).hasPermission(msg.sender, permission)) {
            revert MissingPermission(msg.sender, permission);
        }
    }

    function _hasPermission(address account, bytes32 permission) internal view returns (bool) {
        return roleManager != address(0) && IRoleManager(roleManager).hasPermission(account, permission);
    }

    function _requireAuditLogger() internal view {
        if (auditLogger == address(0)) revert AuditLoggerNotConfigured();
    }

    function _requireExists(bytes32 didKey) internal view {
        if (!identityExists[didKey]) revert IdentityNotFound(didKey);
    }

    function _requireActive(bytes32 didKey) internal view {
        _requireExists(didKey);
        if (!_identities[didKey].active) revert IdentityInactive(didKey);
    }

    function _audit(bytes32 action, bytes32 didKey, bytes32 metadata) internal {
        IAuditLogger(auditLogger).log(action, didKey, 0, metadata);
    }
}
