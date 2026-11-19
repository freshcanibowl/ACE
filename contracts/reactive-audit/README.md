# CoAi Reactive Omni — Build 01.12

Testnet-only event-driven Reactive Omni prototype. The project validates an Origin Event → Reactive Contract → Callback flow using Foundry tests and a **non-deploying** GitHub Actions workflow.

**Status:** GitHub CI and on-chain callbacks must be independently verified. This is NOT an AI risk engine or production system. No live funding, private keys, or deployment automation are included.

## Architecture

- `src/EventEmitter.sol`: test events on Base Sepolia (84532)
- `src/ReactiveGuard.sol`: test Reactive contract for Lasna, event filtering, callback request
- `src/GuardCallback.sol`: authenticated destination and replay protection
- `test/*.t.sol`: Foundry unit tests with mocked system contract
- `.github/workflows/solidity-validation.yml`: build and tests only; NO deployment

Run `forge build && forge test -vv` after dependencies have been installed. The workflow pins upstream dependency commits. Local Python audit utilities are maintained separately in the Build 01.12 release package and have not been executed by the published CI until explicitly included.

## Safety

This project has no wallet access, production contract addresses, customer data, or funds movement. Testnet deployment and transaction receipts remain NOT VERIFIED.
