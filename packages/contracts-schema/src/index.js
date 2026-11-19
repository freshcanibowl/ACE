/**
 * ACE unified contracts — single source of truth for data crossing
 * app boundaries. AI Missy offline captures produce EdgeCapture records;
 * PAIR V8 consumes them as engine inputs; the web-portal renders the
 * resulting Clinical Snapshot. No app defines its own variant of these.
 *
 * Truth labels (per project convention):
 *  - Schema status: DRAFT — wire format must be validated against both
 *    AI Missy Build 08 output and PAIR V8 intake contract before adoption.
 */

export const EDGE_CAPTURE_KINDS = Object.freeze([
  'fluid_intake',
  'medication_log',
  'symptom_report',
  'vital_reading',
]);

export const ESCALATION_LEVELS = Object.freeze([
  'no_action',
  'monitor',
  'prompt_medical_review',
  'urgent_review',
]);

/**
 * EdgeCapture — what AI Missy emits offline and queues for sync.
 * Provenance and ambiguity guard fields are mandatory: the offline layer
 * must have already rejected hypothetical/spilled/questioned amounts.
 */
export function makeEdgeCapture({ kind, patientRef, capturedAt, payload, provenance, deviceMeta }) {
  if (!EDGE_CAPTURE_KINDS.includes(kind)) {
    throw new Error(`unknown capture kind: ${kind}`);
  }
  if (!patientRef || !capturedAt || !payload || !provenance) {
    throw new Error('patientRef, capturedAt, payload and provenance are required');
  }
  return Object.freeze({
    schema: 'ace.edge-capture/0.1',
    kind,
    patientRef,
    capturedAt,
    payload, // { valueMl?, medication?, text?, vitals? } — per-kind, validated downstream
    provenance, // { source: 'ai_missy_offline', ambiguous: false, confirmation: 'explicit' }
    deviceMeta: deviceMeta ?? null,
  });
}

/**
 * EngineInput — the shape PAIR V8 receives after the ACE gateway
 * normalizes an EdgeCapture against the patient's longitudinal baseline.
 * PAIR owns everything downstream of this boundary.
 */
export function makeEngineInput({ capture, baseline }) {
  if (!capture || capture.schema !== 'ace.edge-capture/0.1') {
    throw new Error('capture must be a valid ace.edge-capture/0.1 record');
  }
  return Object.freeze({
    schema: 'ace.engine-input/0.1',
    capture,
    baseline, // { eGFRHistory: [ { date, value } ], staging: 'G1..G5', meds: [...] }
  });
}

/**
 * EscalationEvent — PAIR's deterministic output crossing to the audit /
 * reactive layer. This is the record the audit trail stores and the
 * reactive contract observes (testnet highlight).
 */
export function makeEscalationEvent({ patientRef, level, reason, computedBy, evidenceRef }) {
  if (!ESCALATION_LEVELS.includes(level)) {
    throw new Error(`unknown escalation level: ${level}`);
  }
  if (computedBy !== 'pair_deterministic_engine') {
    throw new Error('escalation may only be computed by the deterministic engine — never an LLM');
  }
  return Object.freeze({
    schema: 'ace.escalation-event/0.1',
    patientRef,
    level,
    reason,
    computedBy,
    evidenceRef, // pointer into the audit trail
  });
}

/**
 * ConsentRecord — ACE auth-consent middleware checks this before any
 * cross-app data flow (patient -> engine -> nurse snapshot).
 */
export function makeConsentRecord({ patientRef, grantee, scopes, grantedAt, revokedAt = null }) {
  if (!patientRef || !grantee || !Array.isArray(scopes) || scopes.length === 0) {
    throw new Error('patientRef, grantee and non-empty scopes are required');
  }
  return Object.freeze({
    schema: 'ace.consent/0.1',
    patientRef,
    grantee, // nurse / clinician / institution ref
    scopes, // e.g. ['read:snapshot', 'read:audit']
    grantedAt,
    revokedAt,
  });
}
