// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract AuditLogger is AccessControl, Pausable {
    struct AuditEventRecord {
        bytes32 action;
        address actor;
        bytes32 targetDidKey;
        uint256 targetTokenId;
        bytes32 metadataHash;
        uint64 timestamp;
        uint256 blockNumber;
    }

    mapping(address => bool) private _approvedEmitters;
    mapping(bytes32 => bool) public recordedEvents;
    mapping(uint256 => AuditEventRecord) private _records;
    uint256 public eventCount;

    error UnauthorizedEmitter(address emitter);
    error InvalidAction();
    error InvalidEmitter();
    error AlreadyRecorded(bytes32 eventId);

    event AuditEvent(
        uint256 indexed sequence,
        bytes32 indexed action,
        address indexed emitter,
        bytes32 targetDidKey,
        uint256 targetTokenId,
        bytes32 metadataHash,
        uint256 timestamp
    );
    event EmitterConfigured(address indexed emitter, bool approved);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function log(
        bytes32 action,
        bytes32 targetDidKey,
        uint256 targetTokenId,
        bytes32 metadataHash
    ) external whenNotPaused {
        if (!_approvedEmitters[msg.sender]) revert UnauthorizedEmitter(msg.sender);
        if (action == bytes32(0)) revert InvalidAction();

        bytes32 eventId = keccak256(
            abi.encode(msg.sender, action, targetDidKey, targetTokenId, metadataHash, block.number, eventCount)
        );
        if (recordedEvents[eventId]) revert AlreadyRecorded(eventId);
        recordedEvents[eventId] = true;
        uint256 sequence = ++eventCount;
        _records[sequence] = AuditEventRecord({
            action: action,
            actor: msg.sender,
            targetDidKey: targetDidKey,
            targetTokenId: targetTokenId,
            metadataHash: metadataHash,
            timestamp: uint64(block.timestamp),
            blockNumber: block.number
        });
        emit AuditEvent(
            sequence,
            action,
            msg.sender,
            targetDidKey,
            targetTokenId,
            metadataHash,
            block.timestamp
        );
    }

    function setEmitter(address emitter, bool approved) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (emitter == address(0)) revert InvalidEmitter();
        _approvedEmitters[emitter] = approved;
        emit EmitterConfigured(emitter, approved);
    }

    function getEventCount() external view returns (uint256) {
        return eventCount;
    }

    function isApprovedEmitter(address emitter) external view returns (bool) {
        return _approvedEmitters[emitter];
    }

    function getAuditEvent(uint256 sequence) external view returns (AuditEventRecord memory) {
        require(sequence > 0 && sequence <= eventCount, "AuditLogger: invalid sequence");
        return _records[sequence];
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
