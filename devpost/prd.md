---
status: approved
---

# PRD — ACE Healthcare Ecosystem (POC)

Builds on `scope.md > The Unique Kernel` (zero-hallucination closed loop) and `scope.md > The POC Boundary`.

## Product Name

**ACE Healthcare** — "One identity, one data contract, one audit chain; three products, one ecosystem."

## Who Uses It (POC demo roles)

1. **Patient (elderly-friendly)** — logs fluid intake offline via AI Missy.
2. **ACE Gateway** (system actor) — normalizes captures, enforces consent.
3. **Nurse/clinician** — monitors alerts, opens Clinical Snapshot.

## What We're Building

### 1. Offline Capture (AI Missy) — `scope.md > The Unique Kernel` step 1

**Behavior**: Patient types "Log 200 ml water" → confirm → structured local record. Ambiguous statements ("I spilled 500 ml yesterday", hypothetical/future amounts) are rejected with a plain-language reason; nothing ambiguous is silently recorded. UI shows sync status (queued offline → synced).

**Acceptance criteria**:
- [ ] Explicit "Log 200 ml water" records 200 mL locally and persists after restart.
- [ ] "I spilled 500 ml yesterday" produces a rejection message naming the ambiguity, and records nothing.
- [ ] Queued captures show an offline badge; after sync the badge flips to synced.

### 2. Sync & Consent Gate (ACE Gateway) — develops `scope.md > The POC Boundary` integration rule

**Behavior**: On reconnect, queued captures sync into the gateway. The gateway validates each capture against `contracts-schema`, attaches the patient baseline (eGFR history), and checks the nurse's `ConsentRecord` before any snapshot read. Every hop writes one audit entry (who/what/when/source).

**Acceptance criteria**:
- [ ] A valid capture appears in the engine input queue within seconds of reconnect.
- [ ] A nurse without a valid consent scope gets a denied read (visible reason), not the snapshot.
- [ ] Each sync/read produces exactly one audit entry visible in the audit viewer.

### 3. Deterministic Verification (PAIR) — `scope.md > The Unique Kernel` step 2

**Behavior**: The engine computes eGFR (CKD-EPI 2021) from confirmed creatinine values against the baseline; on the hero case (76 → 49, −35.5%) it routes escalation state `prompt_medical_review`. Computed by hard-coded formula only. AI Missy's explanation layer runs after the deterministic result and never changes clinical state.

**Acceptance criteria**:
- [ ] Hero case input produces `prompt_medical_review` with the computed eGFR change displayed.
- [ ] The escalation record names `pair_deterministic_engine` as computedBy (enforced by schema).
- [ ] No LLM output is stored as clinical state.

### 4. Nurse Clinical Snapshot (web-portal) — `scope.md > The Unique Kernel` step 4

**Behavior**: Nurse logs in with an ACE identity, sees an alert list, opens the hero patient's Clinical Snapshot: raw offline record with provenance, computed staging + escalation reason, audit chain (chronological), consent record. Elderly-friendly/accessible styling for patient-facing parts; clean clinical density for the nurse view.

**Acceptance criteria**:
- [ ] One screen shows all four elements without navigation.
- [ ] The audit chain lists entries in order with timestamps.
- [ ] Denied-consent state is shown explicitly, never as a blank screen.

### 5. Reactive Highlight (testnet-only, optional in demo) — `scope.md > Explicitly Cut` guard

**Behavior**: Escalation events are observable by the reactive contract path. Demo shows either a verified Base Sepolia event **or** local Foundry test output, labeled testnet-only. Never claimed as production.

**Acceptance criteria**:
- [ ] Whatever is shown is labeled testnet; nothing claims mainnet or live funding.

## Empty / Error States (consequential what-ifs)

- **First use, no baseline**: engine input requires a seeded baseline; UI shows "no baseline — seed demo patient" instead of computing.
- **Sync failure after reconnect**: captures stay queued with a retry state; nothing is silently dropped.
- **Engine unavailable**: gateway queues engine inputs; no fake escalation is ever produced.
- **Audit chain missing for a snapshot**: show "audit incomplete" flag rather than an empty list.

## Look and Feel

Patient-facing surfaces (AI Missy): large type, high contrast, minimal jargon — reuse `packages/ui-kit` elderly-friendly components. Nurse portal: calm clinical palette, dense but scannable; escalation alerts visually prominent. Overall: no generic AI-app styling; medical-credible, not consumer-playful. *(Approved 2026-11-20: demo UI English; AI Missy input layer accepts Chinese/English/Malay and normalizes to the English schema locally before passing to PAIR. The four error states are mandatory spec test cases.)*

## Deferred (from `scope.md > Explicitly Cut`)

Real hospital integration, mainnet, Flutter apps, HealthKit sync, FHIR full integration, real nursing validation, PDPA/HCSA execution.

## Proof of Success

The 3-minute demo path in `docs/demo-script-3min.md` runs end to end: offline log → safety rejection demo → sync → deterministic escalation → nurse snapshot with audit chain → labeled testnet highlight.

## Product Decisions

- Monorepo with contract-first integration; original runtimes preserved (no rewrites).
- Escalation computed exclusively by PAIR's deterministic engine; enforced at the contract level.
- Testnet reactive contracts are a highlight, never the critical path.
- Truth labels ("TokenHub-ready", "testnet only", "not live-verified") carried from upstream repos into all ACE surfaces.
