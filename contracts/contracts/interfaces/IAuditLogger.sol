// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAuditLogger {
    function log(
        bytes32 action,
        bytes32 targetDidKey,
        uint256 targetTokenId,
        bytes32 metadataHash
    ) external;
}
