# ACE Integration Gateway — design seam

The gateway is the thin layer that turns AI Missy's offline `EdgeCapture` queue into PAIR `EngineInput`, and PAIR's output into `EscalationEvent` for the audit/reactive layer.

## Flow

```
AI Missy (offline queue) ──sync──▶ ACE Gateway ──▶ PAIR engine (deterministic)
                                        │                    │
                                   auth-consent ◀── EscalationEvent ──▶ audit trail / reactive contract
                                        ▼
                                 web-portal snapshot read (gated)
```

## Rules

1. The gateway normalizes but never computes clinical values — staging/escalation only come from PAIR's deterministic engine.
2. Every gateway hop writes one audit entry (who/what/when/source).
3. Nurse reads are gated by `ConsentRecord` scopes from `packages/auth-consent`.
4. LLM (AI Missy explanation layer) may only run **after** the deterministic result exists, and its output is never stored as clinical state.

## Status

Design seam only — wiring against the real PAIR V8 intake contract and AI Missy Build 08 output happens in the build phase, validated by `packages/contracts-schema` tests plus each upstream repo's own regression suite.
