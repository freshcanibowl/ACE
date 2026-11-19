// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";
import {AbstractReactive} from "@reactive/src/base/AbstractReactive.sol";

/// @notice Lasna-only event relay. Not an AI decision engine yet.
contract ReactiveGuard is AbstractReactive {
    uint256 public constant BASE_SEPOLIA_ID = 84532;
    uint256 public constant SIGNAL_TOPIC = uint256(keccak256("DemoSignal(bytes32,uint256)"));
    uint64 public constant CALLBACK_GAS = 600_000;

    address public immutable owner;
    address public immutable origin;
    address public destination;
    event DestinationConfigured(address indexed destination);
    event CallbackRequested(bytes32 indexed signalId, bytes32 indexed receiptId);

    constructor(address origin_, address owner_) payable {
        require(origin_ != address(0) && owner_ != address(0), "zero address");
        origin = origin_;
        owner = owner_;
        SYSTEM.subscribe(BASE_SEPOLIA_ID, origin_, SIGNAL_TOPIC,
            REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    function configureDestination(address destination_) external {
        require(msg.sender == owner, "only owner");
        require(destination == address(0), "already configured");
        require(destination_ != address(0), "zero destination");
        destination = destination_;
        emit DestinationConfigured(destination_);
    }

    /// @inheritdoc IReactive
    function react(LogRecord memory log_) external onlySystem {
        if (destination == address(0) || log_.chainId != BASE_SEPOLIA_ID ||
            log_.contractAddress != origin || log_.topic0 != SIGNAL_TOPIC ||
            log_.opCode != 2 || log_.data.length != 32) return;

        bytes32 signalId = bytes32(log_.topic1);
        uint256 seq = abi.decode(log_.data, (uint256));
        if (signalId == bytes32(0) || seq == 0) return;
        bytes32 receiptId = keccak256(abi.encode(log_.chainId, origin,
            log_.txHash, log_.logIndex));
        bytes memory payload = abi.encodeWithSignature(
            "handleSignal(address,bytes32,bytes32,uint256)",
            address(0), receiptId, signalId, seq);
        SYSTEM.requestCallbackV_1_0(ISystemContract.CallbackConfiguration_V_1_0({
            chainId: BASE_SEPOLIA_ID,
            recipient: destination,
            gasLimit: CALLBACK_GAS,
            payload: payload
        }));
        emit CallbackRequested(signalId, receiptId);
    }
}
