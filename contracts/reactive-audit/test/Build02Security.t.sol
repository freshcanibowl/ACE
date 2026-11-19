// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {ReactiveGuard} from "../src/ReactiveGuard.sol";
import {GuardCallback} from "../src/GuardCallback.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {SystemStub} from "./ReactiveGuard.t.sol";

/// @notice Build 02: adversarial local tests. NEVER claims real network callback proof.
contract Build02SecurityTest is Test {
    address constant SYSTEM_ADDR = 0x8888888888888888888888888888888888888888;
    address constant ORIGIN = address(0xBEEF);
    address constant DEST = address(0xCAFE);
    address constant OWNER = address(0x1234);
    ReactiveGuard guard;
    SystemStub system;

    function setUp() public {
        SystemStub implementation = new SystemStub();
        vm.etch(SYSTEM_ADDR, address(implementation).code);
        system = SystemStub(SYSTEM_ADDR);
        guard = new ReactiveGuard(ORIGIN, OWNER);
        vm.prank(OWNER);
        guard.configureDestination(DEST);
    }

    function testDifferentLogIndexChangesReceiptId() public {
        IReactive.LogRecord memory first = _log();
        bytes32 id1 = _requestAndDecodeReceipt(first);
        first.logIndex = 4;
        bytes32 id2 = _requestAndDecodeReceipt(first);
        assertTrue(id1 != id2);
        assertEq(system.callbacks(), 2);
    }

    function testDifferentTxHashChangesReceiptId() public {
        IReactive.LogRecord memory first = _log();
        bytes32 id1 = _requestAndDecodeReceipt(first);
        first.txHash = 1000;
        bytes32 id2 = _requestAndDecodeReceipt(first);
        assertTrue(id1 != id2);
        assertEq(system.callbacks(), 2);
    }

    function testZeroOpcodeAndUnknownOpcodeDoNotRequestCallback() public {
        IReactive.LogRecord memory record = _log();
        record.opCode = 0;
        vm.prank(SYSTEM_ADDR);
        guard.react(record);
        record.opCode = type(uint256).max;
        vm.prank(SYSTEM_ADDR);
        guard.react(record);
        assertEq(system.callbacks(), 0);
    }

    function testMalformedDataLengthsDoNotRequestCallback() public {
        IReactive.LogRecord memory record = _log();
        record.data = hex"";
        vm.prank(SYSTEM_ADDR);
        guard.react(record);
        record.data = abi.encode(uint256(7), uint256(8));
        vm.prank(SYSTEM_ADDR);
        guard.react(record);
        assertEq(system.callbacks(), 0);
    }

    function testConstructorRejectsZeroOriginAndOwner() public {
        vm.expectRevert(bytes("zero address"));
        new ReactiveGuard(address(0), OWNER);
        vm.expectRevert(bytes("zero address"));
        new ReactiveGuard(ORIGIN, address(0));
    }

    function testCallbackReplayRemainsBlockedAcrossPayloadChanges() public {
        address proxy = address(0x1111);
        address sender = address(0x2222);
        GuardCallback cb = new GuardCallback(IPayable(payable(proxy)), sender);
        bytes32 receipt = keccak256("same-receipt");
        vm.prank(proxy);
        cb.handleSignal(sender, receipt, keccak256("first"), 10);
        vm.expectRevert(bytes("duplicate receipt"));
        vm.prank(proxy);
        cb.handleSignal(sender, receipt, keccak256("different"), 11);
        assertEq(cb.handledCount(), 1);
    }

    function _requestAndDecodeReceipt(IReactive.LogRecord memory record) internal returns (bytes32 receiptId) {
        vm.prank(SYSTEM_ADDR);
        guard.react(record);
        bytes memory payload = system.lastPayload();
        assertEq(payload.length, 4 + 4 * 32);
        bytes memory args = new bytes(payload.length - 4);
        for (uint256 i = 4; i < payload.length; i++) {
            args[i - 4] = payload[i];
        }
        (address injected, bytes32 decodedId, bytes32 signal, uint256 seq) =
            abi.decode(args, (address, bytes32, bytes32, uint256));
        assertEq(injected, address(0));
        assertEq(signal, bytes32(uint256(22)));
        assertEq(seq, 7);
        return decodedId;
    }

    function _log() internal pure returns (IReactive.LogRecord memory record) {
        record.chainId = 84532;
        record.contractAddress = ORIGIN;
        record.topic0 = uint256(keccak256("DemoSignal(bytes32,uint256)"));
        record.topic1 = 22;
        record.data = abi.encode(uint256(7));
        record.opCode = 2;
        record.txHash = 999;
        record.logIndex = 3;
    }
}
