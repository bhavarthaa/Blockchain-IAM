// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library PlatformConstants {
    bytes32 internal constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 internal constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 internal constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 internal constant USER_ROLE = keccak256("USER_ROLE");
    bytes32 internal constant ROLE_ASSIGNER_ROLE = keccak256("ROLE_ASSIGNER_ROLE");

    bytes32 internal constant IDENTITY_CREATE = keccak256("IDENTITY_CREATE");
    bytes32 internal constant IDENTITY_UPDATE = keccak256("IDENTITY_UPDATE");
    bytes32 internal constant IDENTITY_REVOKE = keccak256("IDENTITY_REVOKE");
    bytes32 internal constant ROLE_ASSIGN = keccak256("ROLE_ASSIGN");
    bytes32 internal constant ASSET_MINT = keccak256("ASSET_MINT");
    bytes32 internal constant ASSET_ASSIGN = keccak256("ASSET_ASSIGN");
    bytes32 internal constant ASSET_TRANSFER = keccak256("ASSET_TRANSFER");
    bytes32 internal constant ASSET_BURN = keccak256("ASSET_BURN");
    bytes32 internal constant ASSET_METADATA_UPDATE = keccak256("ASSET_METADATA_UPDATE");
    bytes32 internal constant AUDIT_EXPORT = keccak256("AUDIT_EXPORT");
}
