// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {ReactiveGuard} from "../src/ReactiveGuard.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";

/// @dev System contract stand-in only. No actual Omni calls or funds.
contract SystemStub {
    uint256 public subscriptions;
    uint256 public callbacks;
    uint256 public lastChainId;
    address public lastRecipient;
    uint64 public lastGasLimit;
    bytes public lastPayload;

    function subscribe(uint256, address, uint256, uint256, uint256, uint256) external {
        subscriptions++;
    }
    function requestCallbackV_1_0(ISystemContract.CallbackConfiguration_V_1_0 memory config) external {
        callbacks++;
        lastChainId = config.chainId;
        lastRecipient = config.recipient;
        lastGasLimit = config.gasLimit;
        lastPayload = config.payload;
    }
}

contract ReactiveGuardTest is Test {
    address constant SYSTEM_ADDR = 0x8888888888888888888888888888888888888888;
    address constant ORIGIN = address(0xBEEF);
    address constant DESTINATION = address(0xCAFE);
    address constant OWNER = address(0x1234);
    ReactiveGuard guard;
    SystemStub system;

    function setUp() public {
        SystemStub implementation = new SystemStub();
        vm.etch(SYSTEM_ADDR, address(implementation).code);
        system = SystemStub(SYSTEM_ADDR);
        guard = new ReactiveGuard(ORIGIN, OWNER);
        assertEq(system.subscriptions(), 1);
    }

    function testDestinationOwnerAndOneTimeLock() public {
        vm.expectRevert(bytes("only owner"));
        guard.configureDestination(DESTINATION);
        vm.prank(OWNER);
        guard.configureDestination(DESTINATION);
        assertEq(guard.destination(), DESTINATION);
        vm.expectRevert(bytes("already configured"));
        vm.prank(OWNER);
        guard.configureDestination(address(0x9999));
    }

    function testDirectReactCallRejected() public {
        vm.expectRevert();
        guard.react(_log());
    }

    function testValidEventRequestsCallbackWithOriginBoundReceipt() public {
        vm.prank(OWNER);
        guard.configureDestination(DESTINATION);
        IReactive.LogRecord memory record = _log();
        vm.prank(SYSTEM_ADDR);
        guard.react(record);
        assertEq(system.callbacks(), 1);
        assertEq(system.lastChainId(), 84532);
        assertEq(system.lastRecipient(), DESTINATION);
        assertEq(system.lastGasLimit(), 600000);
        bytes memory payload = system.lastPayload();
        bytes4 selector;
        assembly { selector := mload(add(payload, 32)) }
        assertEq(selector, bytes4(keccak256("handleSignal(address,bytes32,bytes32,uint256)")));
        bytes memory args = new bytes(payload.length - 4);
        for (uint256 i = 4; i < payload.length; i++) args[i - 4] = payload[i];
        (address placeholder, bytes32 receiptId, bytes32 signalId, uint256 seq) =
            abi.decode(args, (address, bytes32, bytes32, uint256));
        assertEq(placeholder, address(0));
        assertEq(signalId, bytes32(uint256(22)));
        assertEq(seq, 7);
        assertEq(receiptId, keccak256(abi.encode(uint256(84532), ORIGIN, uint256(999), uint256(3))));
    }

    function testIgnoredWhenNoDestinationOrWrongOriginOrTopicCount() public {
        vm.prank(SYSTEM_ADDR);
        guard.react(_log());
        assertEq(system.callbacks(), 0);
        vm.prank(OWNER);
        guard.configureDestination(DESTINATION);
        IReactive.LogRecord memory record = _log();
        record.contractAddress = address(0x999);
        vm.prank(SYSTEM_ADDR);
        guard.react(record);
        record = _log();
        record.opCode = 3;
        vm.prank(SYSTEM_ADDR);
        guard.react(record);
        assertEq(system.callbacks(), 0);
    }

    function testRejectsIncorrectChainIdAndSignature() public {
        vm.prank(OWNER);
        guard.configureDestination(DESTINATION);
        IReactive.LogRecord memory record = _log();
        record.chainId = 1;
        vm.prank(SYSTEM_ADDR);
        guard.react(record);
        record = _log();
        record.topic0 = uint256(keccak256("WrongEvent(bytes32,uint256)"));
        vm.prank(SYSTEM_ADDR);
        guard.react(record);
        assertEq(system.callbacks(), 0);
    }

    function testRejectsInvalidDataAndZeroSignal() public {
        vm.prank(OWNER);
        guard.configureDestination(DESTINATION);
        IReactive.LogRecord memory record = _log();
        record.data = hex"1234";
        vm.prank(SYSTEM_ADDR);
        guard.react(record);
        record = _log();
        record.topic1 = 0;
        vm.prank(SYSTEM_ADDR);
        guard.react(record);
        record = _log();
        record.data = abi.encode(uint256(0));
        vm.prank(SYSTEM_ADDR);
        guard.react(record);
        assertEq(system.callbacks(), 0);
    }

    function testZeroDestinationRejected() public {
        vm.expectRevert(bytes("zero destination"));
        vm.prank(OWNER);
        guard.configureDestination(address(0));
        assertEq(guard.destination(), address(0));
    }

    function _log() internal pure returns (IReactive.LogRecord memory r) {
        r.chainId = 84532;
        r.contractAddress = ORIGIN;
        r.topic0 = uint256(keccak256("DemoSignal(bytes32,uint256)"));
        r.topic1 = 22;
        r.data = abi.encode(uint256(7));
        r.opCode = 2;
        r.txHash = 999;
        r.logIndex = 3;
    }
}
