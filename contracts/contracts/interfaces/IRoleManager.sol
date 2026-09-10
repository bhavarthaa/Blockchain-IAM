// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRoleManager {
    function hasPermission(address account, bytes32 permission) external view returns (bool);
    function hasRole(bytes32 role, address account) external view returns (bool);
    function grantPlatformRole(bytes32 role, address account) external;
    function revokePlatformRole(bytes32 role, address account) external;
    function adminMemberCount() external view returns (uint256);
}
