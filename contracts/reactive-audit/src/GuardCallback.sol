// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {AbstractCallback} from "@reactive/src/base/AbstractCallback.sol";

/// @notice Test-only sink. Does not move funds or control production systems.
contract GuardCallback is AbstractCallback {
    mapping(bytes32 => bool) public processed;
    uint256 public handledCount;
    event SignalHandled(bytes32 indexed receiptId, bytes32 indexed signalId, uint256 sequence);

    constructor(IPayable callbackProxy_, address reactive_)
        payable AbstractCallback(callbackProxy_, reactive_) {}

    function handleSignal(address reactive_, bytes32 receiptId, bytes32 signalId, uint256 sequence)
        external onlyServiceProvider onlyCallbackSender(reactive_)
    {
        require(receiptId != bytes32(0) && signalId != bytes32(0) && sequence > 0, "bad input");
        require(!processed[receiptId], "duplicate receipt");
        processed[receiptId] = true;
        handledCount += 1;
        emit SignalHandled(receiptId, signalId, sequence);
    }
}
