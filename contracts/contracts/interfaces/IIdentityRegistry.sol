// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IIdentityRegistry {
    function walletForDID(string calldata did) external view returns (address);
    function didKeyForWallet(address wallet) external view returns (bytes32);
    function isActiveWallet(address wallet) external view returns (bool);
}
