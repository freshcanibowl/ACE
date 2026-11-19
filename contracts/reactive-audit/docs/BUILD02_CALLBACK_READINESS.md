# Build 02 — Callback readiness and threat model

**Status:** Only Foundry simulations are in scope. Real testnet deployment and cross-chain execution have NOT been performed. This document is not a deployment authorization.

## Proven locally by CI if and only if the linked workflow passes

- Callback target checks the trusted service provider and the authorized Reactive sender.
- Receipt replay is rejected, including attempts with altered signal payloads.
- The event subscription is limited to chain ID 84532, a fixed origin and the expected topic.
- Malformed data length, unsupported operation codes and zero identifiers are ignored.
- Receipt identifiers differ when an origin transaction hash or log index changes.

## Still unverified and not safe to infer from a passing Foundry test

1. The actual deployed Lasna system's subscription delivers matching origin logs.
2. A live proxy injects the expected Reactive sender and pays / charges as documented.
3. Real callback gas usage fits the configured 600,000 limit.
4. RPC, explorers, chain IDs, contract addresses, bytecode and verified source match.
5. Network reorganization, retries, callback failures, and system-level at-least-once delivery.
6. Budget, payments, authorization, key management and operational alerting.
7. AI inference: no model or decision policy is invoked by the present contract.
8. AI/business automation: no real commission settlement or fund movements.

## Required G03–G06 evidence before any claim of real callback success

- Origin deployment address, chain ID, tx hash and deployed bytecode hash.
- Reactive deployment address on Lasna, subscriptions and system logs.
- Destination proxy/callback deployment and source verification.
- One origin DemoSignal receipt and matching Reactive callback request.
- Destination callback receipt with correlated receipt ID; duplicated event negative test.
- Explicit testnet-only budget and private key handling outside GitHub.
- Review of callback proxy's current deployment address and the canonical interface.

## GO / NO-GO

- **GO**: non-deploying CI, contract review, failure-path tests, deterministic receipt evidence.
- **NO-GO**: real-funds execution, automated deployments, production use, or claims of AI-driven actions without new evidence.
