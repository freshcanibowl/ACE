// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;
import {Test} from "forge-std/Test.sol";
import {GuardCallback} from "../src/GuardCallback.sol";
import {EventEmitter} from "../src/EventEmitter.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";

contract GuardCallbackTest is Test {
    address proxy = address(0x1234);
    address reactive = address(0x5678);
    GuardCallback cb;
    EventEmitter emitter;
    function setUp() public {
        cb = new GuardCallback(IPayable(payable(proxy)), reactive);
        emitter = new EventEmitter();
    }
    function testAuthorizedCallbackAndReplayProtection() public {
        bytes32 receipt = keccak256("receipt-1");
        bytes32 signal = keccak256("signal-1");
        vm.prank(proxy);
        cb.handleSignal(reactive, receipt, signal, 1);
        assertTrue(cb.processed(receipt));
        assertEq(cb.handledCount(), 1);
        vm.expectRevert(bytes("duplicate receipt"));
        vm.prank(proxy);
        cb.handleSignal(reactive, receipt, signal, 1);
    }
    function testUnauthorizedDirectCallerFails() public {
        vm.expectRevert();
        cb.handleSignal(reactive, keccak256("a"), keccak256("b"), 1);
    }
    function testWrongReactiveSenderFails() public {
        vm.expectRevert();
        vm.prank(proxy);
        cb.handleSignal(address(0xAAAA), keccak256("a"), keccak256("b"), 1);
    }
    function testRejectZeroReceiptSignalAndSequence() public {
        bytes32 receipt = keccak256("receipt-ok");
        bytes32 signal = keccak256("signal-ok");
        vm.expectRevert(bytes("bad input"));
        vm.prank(proxy);
        cb.handleSignal(reactive, bytes32(0), signal, 1);
        vm.expectRevert(bytes("bad input"));
        vm.prank(proxy);
        cb.handleSignal(reactive, receipt, bytes32(0), 1);
        vm.expectRevert(bytes("bad input"));
        vm.prank(proxy);
        cb.handleSignal(reactive, receipt, signal, 0);
        assertEq(cb.handledCount(), 0);
    }
    function testEmitterSequence() public {
        emitter.emitSignal(keccak256("a"));
        emitter.emitSignal(keccak256("b"));
        assertEq(emitter.sequence(), 2);
    }
    function testEmitterRejectsEmptySignal() public {
        vm.expectRevert(bytes("empty signal"));
        emitter.emitSignal(bytes32(0));
    }
}
