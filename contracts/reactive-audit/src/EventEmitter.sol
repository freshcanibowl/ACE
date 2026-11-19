// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/// @notice Testnet-only origin. This contract handles no money or customer data.
contract EventEmitter {
    event DemoSignal(bytes32 indexed signalId, uint256 sequence);
    uint256 public sequence;

    function emitSignal(bytes32 signalId) external {
        require(signalId != bytes32(0), "empty signal");
        uint256 next = ++sequence;
        emit DemoSignal(signalId, next);
    }
}
