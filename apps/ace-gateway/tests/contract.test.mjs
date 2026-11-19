import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizePatientInput, SAFETY_COPY_I18N } from "../src/normalizer.mjs";
import { evaluateClinicalSnapshot } from "../src/gateway-handler.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const heroFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/pair-hero-case.fixture.json"), "utf8")
);

describe("Slice 01: PAIR Hero Case & Tri-lingual Safety Copy Bans", () => {
  it("enforces synthetic data flag and pair_deterministic_engine provenance", () => {
    assert.equal(heroFixture._meta.synthetic_data, true);
    assert.equal(heroFixture.expected_output.provenance, "pair_deterministic_engine");
    assert.equal(heroFixture.expected_output.action, "prompt_medical_review");
    assert.equal(heroFixture.expected_output.egfr_delta_pct, -35.5);
  });

  it("provides EN/ZH/MS safety copy and strictly bans diagnostic/alarmist words", () => {
    const BANNED_PATTERN = /(紧急|emergency|高风险|high\s*risk|诊断|diagnos)/i;
    for (const [key, translations] of Object.entries(SAFETY_COPY_I18N)) {
      for (const lang of ["en", "zh", "ms"]) {
        const copy = translations[lang];
        assert.ok(copy, `${key} missing ${lang}`);
        assert.doesNotMatch(
          copy,
          BANNED_PATTERN,
          `Safety copy ${key}.${lang} contains banned clinical/alarmist term: "${copy}"`
        );
      }
    }
  });
});

describe("Slice 01: Complete Error Matrix, Priority & Fail-Closed Contract Tests", () => {
  it("1. NO_BASELINE takes priority over queueJob and never enqueues", async () => {
    const audits = [];
    let queueCalled = false;
    const res = await evaluateClinicalSnapshot({
      patientAlias: "SYNTH_001",
      baseline: null,
      current: { egfr: 49 },
      queueJob: async () => { queueCalled = true; return { job_id: "SHOULD_NOT_RUN" }; },
      runPairEngine: async () => { throw new Error("Should not call engine"); },
      writeAuditLog: async (entry) => { audits.push(entry); return true; }
    });

    assert.equal(res.httpStatus, 200);
    assert.equal(res.body.status, "no_baseline");
    assert.equal(queueCalled, false, "queueJob MUST NOT be called when baseline is null");
    assert.equal(audits[0].event_type, "no_baseline");
  });

  it("1b. NO_BASELINE + Audit Failure: strictly fail-closed (500 AUDIT_INCOMPLETE)", async () => {
    const stderrLogs = [];
    const res = await evaluateClinicalSnapshot({
      patientAlias: "SYNTH_001",
      baseline: null,
      current: { egfr: 49 },
      writeAuditLog: async () => false,
      emergencyStderr: (msg) => stderrLogs.push(msg)
    });

    assert.equal(res.httpStatus, 500);
    assert.equal(res.body.error, "AUDIT_INCOMPLETE");
    assert.equal(res.body.snapshot, undefined);
    assert.equal(stderrLogs.length, 1);
  });

  it("2a. ENGINE_UNAVAILABLE: returns 503 on subprocess error without red flags", async () => {
    const audits = [];
    const res = await evaluateClinicalSnapshot({
      patientAlias: "SYNTH_001",
      baseline: { egfr: 76 },
      current: { egfr: 49 },
      runPairEngine: async () => { throw new Error("SIGTERM timeout"); },
      writeAuditLog: async (entry) => { audits.push(entry); return true; }
    });

    assert.equal(res.httpStatus, 503);
    assert.equal(res.body.error, "ENGINE_UNAVAILABLE");
    assert.equal(res.body.snapshot, undefined);
    assert.equal(audits[0].event_type, "engine_failure");
  });

  it("2b. ENGINE_INVALID_OUTPUT: returns 503 with cause schema_validation_failed", async () => {
    const audits = [];
    const res = await evaluateClinicalSnapshot({
      patientAlias: "SYNTH_001",
      baseline: { egfr: 76 },
      current: { egfr: 49 },
      runPairEngine: async () => ({ invalid_field: true }),
      writeAuditLog: async (entry) => { audits.push(entry); return true; }
    });

    assert.equal(res.httpStatus, 503);
    assert.equal(res.body.error, "ENGINE_INVALID_OUTPUT");
    assert.equal(res.body.cause, "schema_validation_failed");
    assert.equal(audits[0].event_type, "engine_invalid_output");
  });

  it("2c. ENGINE_UNAVAILABLE + Audit Failure: strictly fail-closed (500 AUDIT_INCOMPLETE) + stderr", async () => {
    const stderrLogs = [];
    const res = await evaluateClinicalSnapshot({
      patientAlias: "SYNTH_001",
      baseline: { egfr: 76 },
      current: { egfr: 49 },
      runPairEngine: async () => { throw new Error("Python crash"); },
      writeAuditLog: async () => false,
      emergencyStderr: (msg) => stderrLogs.push(msg)
    });

    assert.equal(res.httpStatus, 500);
    assert.equal(res.body.error, "AUDIT_INCOMPLETE");
    assert.equal(stderrLogs.length, 1);
  });

  it("3a. QUEUE_PENDING: returns 202 + job_id when baseline exists", async () => {
    const audits = [];
    const res = await evaluateClinicalSnapshot({
      patientAlias: "SYNTH_001",
      baseline: { egfr: 76 },
      current: { egfr: 49 },
      queueJob: async () => ({ job_id: "JOB_SYNTH_999" }),
      writeAuditLog: async (entry) => { audits.push(entry); return true; }
    });

    assert.equal(res.httpStatus, 202);
    assert.equal(res.body.job_id, "JOB_SYNTH_999");
    assert.equal(res.body.status, "processing");
    assert.equal(audits[0].event_type, "queue_enqueued");
  });

  it("3b. QUEUE_PENDING Timeout: transitions to terminal 503 ENGINE_UNAVAILABLE (never infinite pending)", async () => {
    const audits = [];
    const res = await evaluateClinicalSnapshot({
      patientAlias: "SYNTH_001",
      baseline: { egfr: 76 },
      current: { egfr: 49 },
      pollJobStatus: { job_id: "JOB_SYNTH_999", timedOut: true },
      writeAuditLog: async (entry) => { audits.push(entry); return true; }
    });

    assert.equal(res.httpStatus, 503);
    assert.equal(res.body.error, "ENGINE_UNAVAILABLE");
    assert.equal(res.body.cause, "queue_timeout");
    assert.equal(audits[0].event_type, "engine_failure");
  });

  it("4. AUDIT_INCOMPLETE on success path: strictly fail-closed (500) and blocks snapshot output", async () => {
    const res = await evaluateClinicalSnapshot({
      patientAlias: "SYNTH_001",
      baseline: heroFixture.input.baseline,
      current: heroFixture.input.current,
      runPairEngine: async () => heroFixture.expected_output,
      writeAuditLog: async () => false
    });

    assert.equal(res.httpStatus, 500);
    assert.equal(res.body.error, "AUDIT_INCOMPLETE");
    assert.equal(res.body.snapshot, undefined);
  });
});

describe("Slice 01: Multilingual & Unit Safety Normalization Contract Tests", () => {
  it("Case 1: Mixed language fluid intake ('今早 minum air 300ml') preserves raw_text and original_unit", () => {
    const res = normalizePatientInput("今早 minum air 300ml");
    assert.equal(res.status, "CONFIRMED");
    assert.equal(res.raw_text, "今早 minum air 300ml");
    assert.equal(res.normalized_value, 300);
    assert.equal(res.unit, "ml");
    assert.equal(res.original_unit, "ml");
    assert.equal(res.conversion, null);
  });

  it("Case 2: Missing unit ('Scr 145') MUST NOT guess and returns NEEDS_CONFIRMATION", () => {
    const res = normalizePatientInput("Scr 145");
    assert.equal(res.status, "NEEDS_CONFIRMATION");
    assert.equal(res.normalized_value, null);
    assert.equal(res.original_unit, null);
  });

  it("Case 3: Scr dual-unit explicit conversion tracks original_unit and conversion metadata", () => {
    const resMg = normalizePatientInput("Scr 1.5 mg/dL");
    assert.equal(resMg.status, "CONFIRMED");
    assert.equal(resMg.normalized_value, 132.6);
    assert.equal(resMg.unit, "umol/L");
    assert.equal(resMg.original_unit, "mg/dL");
    assert.deepEqual(resMg.conversion, { from: "mg/dL", to: "umol/L", factor: 88.4 });

    const resUmol = normalizePatientInput("肌酐 135 µmol/L");
    assert.equal(resUmol.status, "CONFIRMED");
    assert.equal(resUmol.normalized_value, 135);
    assert.equal(resUmol.unit, "umol/L");
    assert.equal(resUmol.original_unit, "µmol/L");
    assert.equal(resUmol.conversion, null);
  });

  it("Case 4: Conflicting units ('Scr 1.5 mg/dL 135 µmol/L') triggers UNIT_CONFLICT", () => {
    const res = normalizePatientInput("Scr 1.5 mg/dL 135 µmol/L");
    assert.equal(res.status, "NEEDS_CONFIRMATION");
    assert.equal(res.reason, "UNIT_CONFLICT");
    assert.equal(res.normalized_value, null);
  });

  it("Case 5: eGFR assigns fixed_standard unit without conversion", () => {
    const res = normalizePatientInput("eGFR 49");
    assert.equal(res.status, "CONFIRMED");
    assert.equal(res.normalized_value, 49);
    assert.equal(res.unit, "mL/min/1.73m2");
    assert.equal(res.original_unit, "mL/min/1.73m2");
    assert.equal(res.conversion, null);
  });

  it("Case 6: Negation ('今天没有水肿 no edema') records boolean false", () => {
    const res = normalizePatientInput("今天没有水肿 no edema");
    assert.equal(res.status, "CONFIRMED");
    assert.equal(res.metric, "edema");
    assert.equal(res.normalized_value, false);
  });

  it("Case 7: Uncertainty ('可能上次更高') flags NEEDS_CONFIRMATION", () => {
    const res = normalizePatientInput("可能上次更高");
    assert.equal(res.status, "NEEDS_CONFIRMATION");
    assert.equal(res.reason, "UNCERTAIN_EXPRESSION");
    assert.ok(res.safety_notice.zh);
  });
});
