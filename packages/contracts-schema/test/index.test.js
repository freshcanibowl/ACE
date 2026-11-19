import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEdgeCapture, makeEngineInput, makeEscalationEvent, makeConsentRecord, EDGE_CAPTURE_KINDS } from '../src/index.js';

test('edge capture: valid fluid intake record freezes with schema tag', () => {
  const c = makeEdgeCapture({
    kind: 'fluid_intake',
    patientRef: 'patient-001',
    capturedAt: '2026-11-20T08:00:00Z',
    payload: { valueMl: 200 },
    provenance: { source: 'ai_missy_offline', ambiguous: false, confirmation: 'explicit' },
  });
  assert.equal(c.schema, 'ace.edge-capture/0.1');
  assert.equal(Object.isFrozen(c), true);
});

test('edge capture: rejects unknown kind and missing provenance', () => {
  assert.throws(() => makeEdgeCapture({ kind: 'coffee' }));
  assert.throws(() => makeEdgeCapture({ kind: 'fluid_intake', patientRef: 'p1', capturedAt: 'x', payload: {} }));
});

test('engine input: requires tagged capture', () => {
  assert.throws(() => makeEngineInput({ capture: { schema: 'other' }, baseline: {} }));
  const c = makeEdgeCapture({ kind: 'vital_reading', patientRef: 'p1', capturedAt: 't', payload: { vitals: {} }, provenance: { source: 's', ambiguous: false, confirmation: 'explicit' } });
  assert.equal(makeEngineInput({ capture: c, baseline: { eGFRHistory: [] } }).schema, 'ace.engine-input/0.1');
});

test('escalation: only the deterministic engine may compute it', () => {
  assert.throws(() => makeEscalationEvent({ patientRef: 'p1', level: 'urgent_review', reason: 'r', computedBy: 'llm' }));
  const e = makeEscalationEvent({ patientRef: 'p1', level: 'prompt_medical_review', reason: 'eGFR drop', computedBy: 'pair_deterministic_engine', evidenceRef: 'audit-1' });
  assert.equal(e.level, 'prompt_medical_review');
  assert.throws(() => makeEscalationEvent({ patientRef: 'p1', level: 'coffee', reason: 'r', computedBy: 'pair_deterministic_engine' }));
});

test('consent: requires non-empty scopes', () => {
  assert.throws(() => makeConsentRecord({ patientRef: 'p1', grantee: 'nurse-9', scopes: [] }));
  const c = makeConsentRecord({ patientRef: 'p1', grantee: 'nurse-9', scopes: ['read:snapshot'], grantedAt: 't' });
  assert.equal(c.schema, 'ace.consent/0.1');
});

test('kinds list is frozen', () => {
  assert.throws(() => { EDGE_CAPTURE_KINDS.push('x'); }, TypeError);
});
