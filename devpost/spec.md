---
status: draft
---

# Spec — ACE Healthcare Ecosystem (POC)

Implements every heading of `prd.md > What We're Building` (1–5), the error states from `prd.md > Empty / Error States`, and the approved PRD notes (English demo UI; multilingual Missy input normalized to the English schema).

## How This Works, In Plain Language

Three real programs already exist and are **not rewritten**: AI Missy's local server (Python, port 8766, SQLite), PAIR's deterministic engine (Python, CKD-EPI 2021), and the Foundry contracts. The POC adds one **new** piece — the ACE gateway — plus a nurse **web-portal** page. The gateway is a small Node HTTP server that:

1. reads confirmed records out of AI Missy's local SQLite once the machine is back online,
2. wraps them as `EngineInput` (from `packages/contracts-schema`) with a seeded patient baseline,
3. calls PAIR's Python engine (`evaluate_measurements`) as a subprocess with JSON in / JSON out,
4. stores the resulting `EscalationEvent` + audit entries in its own SQLite,
5. serves the nurse portal (single static page + JSON APIs) with consent checks from `packages/auth-consent`.

The demo runs entirely on one Windows machine: two Python servers and the Node gateway. The reactive contract stays a local Foundry test output (testnet highlight only).

## Components

### `apps/ace-gateway/` — new (the only substantial new code)

Implements `prd.md > Sync & Consent Gate`, `> Deterministic Verification` orchestration, `> Empty / Error States`.

- Node ≥ 20, no framework: `node:http` server, port 8787.
- SQLite via `better-sqlite3`; own DB file `data/ace.sqlite` (never AI Missy's DB — read Missy's via a **read-only copy** taken at sync time).
- Endpoints:
  - `POST /api/sync` — copies confirmed AI Missy observations, validates each as `EdgeCapture`, queues `EngineInput`. Errors: `NO_BASELINE` (→ seed prompt), `MISSY_UNREACHABLE` (captures stay queued), `SCHEMA_INVALID`.
  - `POST /api/evaluate` — runs PAIR engine subprocess (`python -c` calling `src.pair.engine.evaluate_measurements` with JSON). Engine failure → queued, **no synthetic escalation**. Produces `EscalationEvent` + audit row.
  - `GET /api/snapshot/:patientId` — gated by `ConsentRecord` scopes; returns capture provenance, computed result, escalation reason, audit chain, consent status. No consent → explicit `CONSENT_DENIED` JSON.
  - `GET /api/audit/:patientId` — ordered audit chain.
- Every endpoint writes one audit row (who/what/when/source).

### `apps/web-portal/` — nurse snapshot UI

Implements `prd.md > Nurse Clinical Snapshot`, `> Look and Feel`.

- One static page served by the gateway (`public/index.html` + vanilla JS + a single CSS file from `packages/ui-kit` design tokens). No build step.
- Alert list → hero patient snapshot; all four elements on one screen; `CONSENT_DENIED` and `AUDIT_INCOMPLETE` render as explicit states.

### `apps/missy-desktop/` — upstream AI Missy Build 08 (copied, not rewritten)

Implements `prd.md > Offline Capture`. Migration = copy of the upstream repo into this path; its runbook and safety tests stay authoritative. **Only addition**: a `sync-export/` endpoint-side helper script that dumps confirmed observations to JSON for the gateway (new file, upstream code untouched). English UI; input accepted in zh/en/ms — normalization to the English schema is rule-based (number + unit + keyword extraction), not model-based, in the POC.

### `apps/pair-engine/` — upstream PAIR V8 engine package (copied, not rewritten)

The Python package `src/pair/` is copied here; the gateway invokes it. The Vercel deployment (pair-renal-care.vercel.app) remains a separate live surface for the demo's engine slide; no new Vercel work in this POC.

### `packages/contracts-schema/` — exists; extended only if integration demands

Wire-format validation happens against AI Missy's actual `observations` shape (`type`, `volume_ml`, `confirmed_by_user`) and PAIR's `evaluate_measurements` output. Any mismatch is fixed by adapter code in the gateway, **not** by editing upstream repos.

### `packages/auth-consent/` — new, minimal

Consent store (SQLite table) + one function: `checkConsent(patientId, grantee, scope) → { allowed, reason }`. Seeded demo consents. No OIDC/JWT in the POC — ACE identity = named demo principal; labeled as such.

### `packages/clinical-kb/` — new, minimal

- CKD-EPI 2021 constants **referenced from PAIR's own module** (single source: the engine; this package only documents/links it).
- Threshold rules table mirroring PAIR's `_safety_flags` (K ≥ 6.0, SBP ≥ 180, ΔeGFR ≤ −25%) with citation-to-source comments and "DEMO_GUARD" truth labels preserved.

### `contracts/reactive-audit/` — upstream Foundry project (copied, not rewritten)

Demo shows `forge test` output locally; no deployment. Labeled testnet-only everywhere.

### `packages/ui-kit/` — design tokens only (CSS variables file)

Elderly-friendly tokens for patient surfaces; clinical-density tokens for the nurse view. No component framework in the POC.

## Data Model (gateway SQLite)

- `captures(id, patient_id, kind, payload_json, provenance_json, captured_at, sync_state)` — sync_state ∈ `queued | synced | failed`
- `escalations(id, patient_id, level, reason, computed_by, evidence_ref, created_at)` — `computed_by` always `pair_deterministic_engine`
- `audit(id, actor, action, subject, source, created_at)` — append-only; no UPDATE/DELETE grants in code paths
- `consents(id, patient_id, grantee, scopes_json, granted_at, revoked_at)`
- `baselines(patient_id, egfr_history_json, staging, meds_json)` — seeded demo data, labeled synthetic

## External Services

- AI Missy local server: `http://127.0.0.1:8766` (token-gated; token in `.env`, `.env.example` provided). Doc: upstream `README.md` / Build 08 runbook.
- PAIR engine: local Python subprocess. Doc: upstream `src/pair/engine.py`.
- Vercel PAIR deployment: optional demo surface, https://pair-renal-care.vercel.app. No code dependency.
- Base Sepolia: testnet highlight only. Doc: upstream `README.md`.

## Failure Modes → PRD error states mapping (mandatory test cases)

1. No baseline → `NO_BASELINE` + "seed demo patient" prompt (`prd.md > Empty / Error States` #1).
2. Missy unreachable at sync → captures remain `queued`, retry state shown (#2).
3. Engine subprocess fails → engine input queued; no escalation row created (#3).
4. Audit chain gap for a snapshot → `AUDIT_INCOMPLETE` flag in snapshot payload (#4).

## File Structure (annotated)

```
ACE/
├── apps/
│   ├── ace-gateway/          # NEW: Node gateway (server.js, db.js, sync.js, evaluate.js, consent.js)
│   │   ├── public/index.html # NEW: nurse portal (vanilla JS)
│   │   └── data/             # ace.sqlite (gitignored)
│   ├── missy-desktop/        # copied AI Missy Build 08 (+ sync-export helper)
│   ├── pair-engine/          # copied PAIR python engine package
│   └── web-portal/.gitkeep   # portal lives in gateway/public for the POC
├── packages/
│   ├── contracts-schema/     # exists — adapters for missy/pair wire formats
│   ├── auth-consent/         # NEW: checkConsent + seed data
│   ├── clinical-kb/          # NEW: threshold rules doc + constants links
│   └── ui-kit/               # NEW: tokens.css
├── contracts/reactive-audit/ # copied Foundry project (testnet only)
├── devpost/                  # scope, prd, spec, checklist (5-build)
├── docs/demo-script-3min.md, gateway-seam.md
└── infra/.gitkeep
```

## Where It Runs and How Someone Tries It

One Windows machine, three terminals:

1. **AI Missy**: `cd apps/missy-desktop && py server.py` → http://127.0.0.1:8766 (offline flow per its runbook: log 200 ml, confirm).
2. **Gateway + portal**: `cd apps/ace-gateway && node server.js` → http://127.0.0.1:8787 (nurse portal). Click **Sync** → **Evaluate** → snapshot renders.
3. **Contracts (optional highlight)**: `cd contracts/reactive-audit && forge test -vv` → screenshot output labeled testnet.

Demo video records exactly this. Deployment is optional and not required for submission.

## Simplifications (POC boundary guard)

- Consent = seeded records, no real auth server (labeled demo principal).
- Multilingual input normalization = rule-based parsing, no extra model.
- Gateway reads a **copy** of Missy's confirmed observations rather than sharing its SQLite file (avoids write contention and keeps Missy's offline guarantees intact).
- The nurse portal is served by the gateway rather than a separate app — `apps/web-portal` stays a placeholder.
- Reactive contract = local test output only.

## Decisions and Open Issues

- **Decision (user-approved via PRD)**: escalation computed only by the deterministic engine, enforced by `contracts-schema`; LLM output never stored as clinical state.
- **Decision (user-approved via PRD)**: the four PRD error states are mandatory contract-test cases.
- **Open issue — verified during build**: AI Missy's DB path/schema and PAIR's JSON shape must be probed once the copies are in place; `contracts-schema` adapters are written against observed output, not assumptions. If the observed shape contradicts this spec, the adapter changes — upstream repos do not.
- **Open issue**: QVAC offline inference on this specific machine is unverified; the demo falls back to the verified Build 08 runbook path if preload fails (per upstream rule: stop, don't fake).
