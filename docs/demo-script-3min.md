# 3-Minute Demo — ACE Healthcare Ecosystem

**Truth discipline: this script only claims what is verified. Nothing here says "Powered by Tencent TokenHub", no hospital integration, no mainnet.**

## Cast & surfaces

- **AI Missy** (offline, Windows local) — `apps/missy-desktop` → http://127.0.0.1:8766 (Build 08 runbook)
- **ACE gateway + PAIR engine** — `apps/pair-engine` / local gateway (or https://pair-renal-care.vercel.app for the deployed engine)
- **Nurse portal (Clinical Snapshot)** — `apps/web-portal`
- **Reactive contract** — Base Sepolia testnet event (optional highlight, testnet-only)

## Script

**0:00–0:30 — The claim.**
"Chronic kidney patients log daily data on their phones or a caregiver's laptop — often with no network. Clinicians need that data verified, not hallucinated. ACE is the trust chain between the two: offline capture, deterministic clinical verification, automatic escalation, and a tamper-evident audit trail."

**0:30–1:15 — Offline capture (AI Missy).**
Turn off Wi-Fi. In AI Missy: "Log 200 ml water" → confirm → value recorded locally. Show the safety layer: "log 500 ml I spilled yesterday" → **rejected** as ambiguous. "Data never left this machine — the safety guard ran locally."

**1:15–2:00 — Deterministic verification (PAIR).**
Reconnect. The gateway syncs the capture into the patient's baseline. PAIR's deterministic engine (CKD-EPI 2021) computes eGFR from the confirmed creatinine values: 76 → 49, −35.5% → escalation state **prompt_medical_review** — computed by hard-coded formulas, shown on screen. Point at the audit trail entry. "The LLM never decides escalation — it only explains it."

**2:00–2:40 — Clinician sees everything (web-portal).**
Nurse logs into the ACE portal. Alert visible. Opens Clinical Snapshot: the raw offline record with provenance, the computed staging and escalation reason, the full audit chain, and the consent record that authorized the read.

**2:40–3:00 — The optional highlight.**
Escalation event observed by the reactive contract on Base Sepolia testnet (testnet-only, deployment verified before demo or shown as local Foundry test). Close: "One identity, one data contract, one audit chain — three products, one ecosystem."

## Pre-demo checklist

1. `apps/missy-desktop`: run Build 08 offline verification once before recording (per its runbook; if preload/inference fails — stop, don't fake it).
2. `apps/pair-engine`: gateway running locally with the hero case values loaded, or the Vercel deployment open.
3. `apps/web-portal`: nurse account seeded, hero patient visible with consent record.
4. Decide: live testnet event (only if verified beforehand) or local Foundry test output on screen.
5. Screen record in one take; label all statuses truthfully.
