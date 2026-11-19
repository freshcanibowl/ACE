# ACE Healthcare — Monorepo

**Status labels (honor these everywhere):**
- `PAIR TokenHub-ready` — live adapter implemented, NOT live-verified.
- `AI Missy offline — Windows demo verified path; QVAC offline run independently re-verifiable via its build-08 runbook.`
- `Reactive contracts — testnet only, deployment NOT verified.`

## What lives here

| Path | Origin | Role |
| --- | --- | --- |
| `apps/pair-engine/` | [pair-renal-care](https://github.com/freshcanibowl/pair-renal-care) (V8) | Deterministic renal verification engine (CKD-EPI 2021 eGFR, escalation routing, audit trail) |
| `apps/missy-desktop/` | [ai-missy-offline-qvac](https://github.com/freshcanibowl/ai-missy-offline-qvac) (Build 08) | Offline patient companion — local fluid/nutrition logging with safety guards (QVAC) |
| `apps/web-portal/` | new | ACE nurse/clinician workbench: alerts, Clinical Snapshot, audit chain viewer; patient PWA entry |
| `packages/contracts-schema/` | new | **Single source of truth** for EdgeCapture / EngineInput / EscalationEvent / ConsentRecord |
| `packages/clinical-kb/` | new (+ NTU longitudinal-adaptive design input) | CKD-EPI constants, safety red lines, longitudinal adaptive-support rules |
| `packages/auth-consent/` | new | ACE identity, RBAC, patient Consent middleware |
| `packages/ui-kit/` | new | Elderly-friendly high-contrast components (large type, a11y) |
| `contracts/reactive-audit/` | [coai-reactive-omni-2026](https://github.com/corwinlim/coai-reactive-omni-2026) | Foundry project — Base Sepolia reactive escalation callback (testnet highlight) |
| `devpost/` | new | Hackathon planning docs (scope, PRD, spec, checklist) |
| `docs/demo-script-3min.md` | new | End-to-end demo runbook |

## The kernel

Offline capture (AI Missy) → deterministic verification (PAIR) → automatic escalation routing + trusted audit (ACE / reactive contracts) → nurse Clinical Snapshot. Clinical judgment is **never** an LLM output; the LLM only explains what the deterministic engine already decided.

## Integration rule

No app redefines shared data shapes. AI Missy emits `EdgeCapture`; the ACE gateway normalizes it into `EngineInput` against the patient baseline; PAIR returns `EscalationEvent`; `auth-consent` gates the nurse's snapshot read. Import from `@ace/contracts-schema` only.

## Upstream repos

The original repos remain the verified source of truth for their own runbooks (PAIR Vercel deploy, AI Missy Windows offline verification, Foundry tests). Their content is migrated into the matching `apps/` / `contracts/` paths; until migration completes, the upstream README runbooks apply verbatim.
