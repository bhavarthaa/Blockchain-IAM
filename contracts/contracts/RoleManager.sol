// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IAuditLogger} from "./interfaces/IAuditLogger.sol";
import {PlatformConstants} from "./PlatformConstants.sol";

contract RoleManager is AccessControl, Pausable {
    bytes32 public constant ADMIN_ROLE = PlatformConstants.ADMIN_ROLE;
    bytes32 public constant MANAGER_ROLE = PlatformConstants.MANAGER_ROLE;
    bytes32 public constant AUDITOR_ROLE = PlatformConstants.AUDITOR_ROLE;
    bytes32 public constant USER_ROLE = PlatformConstants.USER_ROLE;
    bytes32 public constant ROLE_ASSIGNER_ROLE = PlatformConstants.ROLE_ASSIGNER_ROLE;

    bytes32 public constant IDENTITY_CREATE = PlatformConstants.IDENTITY_CREATE;
    bytes32 public constant IDENTITY_UPDATE = PlatformConstants.IDENTITY_UPDATE;
    bytes32 public constant IDENTITY_REVOKE = PlatformConstants.IDENTITY_REVOKE;
    bytes32 public constant ROLE_ASSIGN = PlatformConstants.ROLE_ASSIGN;
    bytes32 public constant ASSET_MINT = PlatformConstants.ASSET_MINT;
    bytes32 public constant ASSET_ASSIGN = PlatformConstants.ASSET_ASSIGN;
    bytes32 public constant ASSET_TRANSFER = PlatformConstants.ASSET_TRANSFER;
    bytes32 public constant ASSET_BURN = PlatformConstants.ASSET_BURN;
    bytes32 public constant ASSET_METADATA_UPDATE = PlatformConstants.ASSET_METADATA_UPDATE;
    bytes32 public constant AUDIT_EXPORT = PlatformConstants.AUDIT_EXPORT;

    mapping(bytes32 => mapping(bytes32 => bool)) private _rolePermissions;
    mapping(address => uint8) public activeRoleCount;
    uint256 private _adminMemberCount;
    address public identityRegistry;
    address public auditLogger;

    error UnknownRole(bytes32 role);
    error InvalidAccount();
    error UnknownPermission(bytes32 permission);
    error MissingPermission(address account, bytes32 permission);
    error IdentityRegistryNotConfigured();
    error CannotRemoveLastAdmin();
    error AlreadyConfigured();
    error InvalidAddress();

    event PlatformRoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
    event PlatformRoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);
    event PermissionConfigured(
        bytes32 indexed role,
        bytes32 indexed permission,
        bool enabled,
        address indexed sender
    );
    event IdentityRegistryConfigured(address indexed registry);
    event AuditLoggerConfigured(address indexed logger);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(ROLE_ASSIGNER_ROLE, msg.sender);
        _setRoleAdmin(ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(MANAGER_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(AUDITOR_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(USER_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(ROLE_ASSIGNER_ROLE, DEFAULT_ADMIN_ROLE);

        bytes32[10] memory permissions = [
            IDENTITY_CREATE,
            IDENTITY_UPDATE,
            IDENTITY_REVOKE,
            ROLE_ASSIGN,
            ASSET_MINT,
            ASSET_ASSIGN,
            ASSET_TRANSFER,
            ASSET_BURN,
            ASSET_METADATA_UPDATE,
            AUDIT_EXPORT
        ];
        for (uint256 i; i < permissions.length; ++i) {
            _rolePermissions[ADMIN_ROLE][permissions[i]] = true;
        }
        _rolePermissions[MANAGER_ROLE][ASSET_MINT] = true;
        _rolePermissions[MANAGER_ROLE][ASSET_ASSIGN] = true;
        _rolePermissions[MANAGER_ROLE][ASSET_TRANSFER] = true;
        _rolePermissions[MANAGER_ROLE][ASSET_BURN] = true;
        _rolePermissions[MANAGER_ROLE][ASSET_METADATA_UPDATE] = true;
        _rolePermissions[AUDITOR_ROLE][AUDIT_EXPORT] = true;
        _rolePermissions[USER_ROLE][ASSET_TRANSFER] = true;
    }

    function hasPermission(address account, bytes32 permission) public view returns (bool) {
        return
            _rolePermissions[ADMIN_ROLE][permission] && hasRole(ADMIN_ROLE, account) ||
            _rolePermissions[MANAGER_ROLE][permission] && hasRole(MANAGER_ROLE, account) ||
            _rolePermissions[AUDITOR_ROLE][permission] && hasRole(AUDITOR_ROLE, account) ||
            _rolePermissions[USER_ROLE][permission] && hasRole(USER_ROLE, account);
    }

    function getPermissions(bytes32 role) external view returns (bytes32[] memory permissions) {
        _requireKnownRole(role);
        bytes32[10] memory all = [
            IDENTITY_CREATE,
            IDENTITY_UPDATE,
            IDENTITY_REVOKE,
            ROLE_ASSIGN,
            ASSET_MINT,
            ASSET_ASSIGN,
            ASSET_TRANSFER,
            ASSET_BURN,
            ASSET_METADATA_UPDATE,
            AUDIT_EXPORT
        ];
        uint256 count;
        for (uint256 i; i < all.length; ++i) {
            if (_rolePermissions[role][all[i]]) ++count;
        }
        permissions = new bytes32[](count);
        uint256 index;
        for (uint256 i; i < all.length; ++i) {
            if (_rolePermissions[role][all[i]]) permissions[index++] = all[i];
        }
    }

    function getAccountRoles(address account) external view returns (bytes32[] memory roles) {
        return _getAccountRoles(account);
    }

    function _getAccountRoles(address account) internal view returns (bytes32[] memory roles) {
        bytes32[4] memory all = [ADMIN_ROLE, MANAGER_ROLE, AUDITOR_ROLE, USER_ROLE];
        uint256 count;
        for (uint256 i; i < all.length; ++i) if (hasRole(all[i], account)) ++count;
        roles = new bytes32[](count);
        uint256 index;
        for (uint256 i; i < all.length; ++i) {
            if (hasRole(all[i], account)) roles[index++] = all[i];
        }
    }

    function setPermission(bytes32 role, bytes32 permission, bool enabled)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        whenNotPaused
    {
        _requireKnownRole(role);
        if (!isKnownPermission(permission)) revert UnknownPermission(permission);
        _rolePermissions[role][permission] = enabled;
        emit PermissionConfigured(role, permission, enabled, msg.sender);
        _audit(keccak256("PERMISSION_CONFIGURED"), bytes32(0), permission);
    }

    function grantPlatformRole(bytes32 role, address account) external whenNotPaused {
        _requireKnownRole(role);
        if (account == address(0)) revert InvalidAccount();
        if (!hasRole(ROLE_ASSIGNER_ROLE, msg.sender) && msg.sender != identityRegistry) {
            revert AccessControlUnauthorizedAccount(msg.sender, ROLE_ASSIGNER_ROLE);
        }
        if (_grantRole(role, account)) {
            emit PlatformRoleGranted(role, account, msg.sender);
            _audit(keccak256("ROLE_GRANTED"), bytes32(uint256(uint160(account))), role);
        }
    }

    function revokePlatformRole(bytes32 role, address account) external whenNotPaused {
        _requireKnownRole(role);
        if (account == address(0)) revert InvalidAccount();
        if (!hasRole(ROLE_ASSIGNER_ROLE, msg.sender) && msg.sender != identityRegistry) {
            revert AccessControlUnauthorizedAccount(msg.sender, ROLE_ASSIGNER_ROLE);
        }
        if (role == ADMIN_ROLE && hasRole(ADMIN_ROLE, account) && activeRoleCount[account] <= 1) {
            revert CannotRemoveLastAdmin();
        }
        if (_revokeRole(role, account)) {
            emit PlatformRoleRevoked(role, account, msg.sender);
            _audit(keccak256("ROLE_REVOKED"), bytes32(uint256(uint160(account))), role);
        }
    }

    function setIdentityRegistry(address registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (registry == address(0)) revert InvalidAddress();
        if (identityRegistry != address(0)) revert AlreadyConfigured();
        identityRegistry = registry;
        emit IdentityRegistryConfigured(registry);
    }

    function setAuditLogger(address logger) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (logger == address(0)) revert InvalidAddress();
        if (auditLogger != address(0)) revert AlreadyConfigured();
        auditLogger = logger;
        emit AuditLoggerConfigured(logger);
    }

    function isKnownRole(bytes32 role) public pure returns (bool) {
        return role == ADMIN_ROLE || role == MANAGER_ROLE || role == AUDITOR_ROLE || role == USER_ROLE;
    }

    function isKnownPermission(bytes32 permission) public pure returns (bool) {
        return
            permission == IDENTITY_CREATE ||
            permission == IDENTITY_UPDATE ||
            permission == IDENTITY_REVOKE ||
            permission == ROLE_ASSIGN ||
            permission == ASSET_MINT ||
            permission == ASSET_ASSIGN ||
            permission == ASSET_TRANSFER ||
            permission == ASSET_BURN ||
            permission == ASSET_METADATA_UPDATE ||
            permission == AUDIT_EXPORT;
    }

    function adminMemberCount() external view returns (uint256) {
        return _adminMemberCount;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function revokeRole(bytes32 role, address account)
        public
        override
        whenNotPaused
    {
        if (role == ADMIN_ROLE && hasRole(ADMIN_ROLE, account) && activeRoleCount[account] <= 1) {
            revert CannotRemoveLastAdmin();
        }
        super.revokeRole(role, account);
    }

    function grantRole(bytes32 role, address account)
        public
        override
        whenNotPaused
    {
        super.grantRole(role, account);
    }

    function renounceRole(bytes32 role, address callerConfirmation)
        public
        override
        whenNotPaused
    {
        if (
            role == ADMIN_ROLE &&
            hasRole(ADMIN_ROLE, msg.sender) &&
            activeRoleCount[msg.sender] <= 1
        ) revert CannotRemoveLastAdmin();
        super.renounceRole(role, callerConfirmation);
    }

    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        bool granted = super._grantRole(role, account);
        if (granted && isKnownRole(role)) ++activeRoleCount[account];
        if (granted && role == ADMIN_ROLE) ++_adminMemberCount;
        return granted;
    }

    function _revokeRole(bytes32 role, address account) internal override returns (bool) {
        bool revoked = super._revokeRole(role, account);
        if (revoked && isKnownRole(role)) --activeRoleCount[account];
        if (revoked && role == ADMIN_ROLE) --_adminMemberCount;
        return revoked;
    }

    function _requireKnownRole(bytes32 role) internal pure {
        if (!isKnownRole(role)) revert UnknownRole(role);
    }

    function _audit(bytes32 action, bytes32 target, bytes32 metadata) internal {
        if (auditLogger != address(0)) {
            IAuditLogger(auditLogger).log(action, target, 0, metadata);
        }
    }
}
