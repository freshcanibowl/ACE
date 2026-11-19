# 3-Minute Demo — ACE Healthcare Ecosystem

**Truth discipline: every number below is from a real verified run on 2026-11-20. Nothing here says "Powered by Tencent TokenHub", no hospital integration, no mainnet.**

## Verified demo facts (captured live)

- PAIR deterministic engine: creatinine 92→135 µmol/L, age 62, male → **eGFR 81.1 → 51.2, −36.9%**, flag `EGFR_LARGE_DECLINE_DEMO_GUARD` → `prompt_medical_review`.
- AI Missy synthetic runtime DB: `Log 200 ml water` → confirmed, persisted, synced (`source: OK`).
- Foundry: **19/19 tests pass** (3 suites, local, no deployment) — see `contracts/reactive-audit/docs/foundry-test-summary.txt`.

## Cast & surfaces (all local, one Windows machine)

| Surface | Command | URL |
| --- | --- | --- |
| AI Missy (offline patient) | `cd apps/missy-desktop && py server.py` | http://127.0.0.1:8766 |
| ACE gateway + nurse portal | `cd apps/ace-gateway && node src/server.mjs` (env: `MISSY_DB_PATH` to Missy's `demo-runtime.sqlite3`) | http://127.0.0.1:8787 |
| PAIR engine | invoked by gateway as a Python subprocess (no terminal needed) | — |
| Reactive contracts | `cd contracts/reactive-audit && forge test` (output on screen) | local only |

## Script

**0:00–0:30 — The claim.**
"Chronic kidney patients log daily data offline; clinicians need that data verified, not hallucinated. ACE is the trust chain: offline capture, deterministic clinical verification, automatic escalation, tamper-evident audit. One identity, one data contract, one audit chain — three products, one ecosystem."

**0:30–1:15 — Offline capture (AI Missy, port 8766).**
Show the record: "Log 200 ml water" confirmed and persisted locally. Show the safety layer rejecting ambiguous input (per its Build 08 runbook). "The record never left this machine."

**1:15–2:00 — Sync + deterministic verification (gateway, port 8787).**
Click **Sync Missy captures** → `captures_new: 1, source: OK`. Click **Run deterministic evaluation** → on screen: eGFR **81.1 → 51.2 (−36.9%)**, escalation `prompt_medical_review`, `computed_by: pair_deterministic_engine`. "The engine computes CKD-EPI 2021 from the confirmed creatinine values. The LLM never decides escalation — it only explains it."

**2:00–2:40 — Clinician sees everything (Load snapshot).**
One screen: synthetic-data banner, the raw capture with provenance, the escalation reason, the audit chain (who/what/when), and the demo consent record. "Display is not escalation — it routes to clinic SOP."

**2:40–3:00 — The testnet-only highlight.**
Show `forge test` output: 19/19 pass (local, pinned deps). "Reactive contracts observe escalation events on testnet — no PHI on-chain, salted anchors only. Deployment is not verified and we don't claim it."

## Pre-demo checklist

1. `apps/missy-desktop`: demo-runtime DB present (regenerate: `python -c` confirm flow in its README) or run its offline gate once.
2. `apps/ace-gateway`: start with `MISSY_DB_PATH` pointing at Missy's demo DB; verify `node --test` suites pass.
3. Contracts: `forge build && forge test` fresh; if deps missing, run the pinned clone commands in `docs/foundry-test-summary.txt` note.
4. Record in one take; keep all truth labels visible on screen.
