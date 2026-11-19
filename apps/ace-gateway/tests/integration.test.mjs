/**
 * Slice 02 integration tests — real upstream adaptation, no mocks for:
 *  - PAIR engine subprocess (real python, real CKD-EPI math)
 *  - Missy DB snapshot + immutable=1 read (real SQLite file)
 * The HTTP server itself is exercised via its exported db/handler pieces
 * where possible; full server E2E is the demo runbook's job.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { makePairRunner, validatePairOutput } from "../src/pair-engine.mjs";
import { readMissyObservations } from "../src/missy-adapter.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const heroFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/pair-hero-case.fixture.json"), "utf8")
);
const syntheticMissyDb = path.join(__dirname, "fixtures/synthetic-missy.sqlite3");
const pairSrc = process.env.PAIR_SRC_PATH || path.resolve(__dirname, "../../../../pair-renal-care/src");
// NOTE: __dirname is apps/ace-gateway/tests -> ../../../../ reaches ACE_Healthcare/
// (the parent of the ACE repo checkout) where the upstream clone lives.

describe("Slice 02: real PAIR engine subprocess (stdin JSON, timeout, stdout cap)", () => {
  const runPair = makePairRunner(pairSrc, process.env.PYTHON_EXE || "python");

  it("reproduces the captured hero case: eGFR 81.1 -> 51.2, -36.9%", async () => {
    const { input, expected_output } = heroFixture;
    const raw = await runPair({
      baseline: input.baseline,
      current: input.current,
      age_years: input.age,
      sex: input.sex,
    });
    assert.equal(raw.trend.previous_egfr_used, expected_output.previous.egfr_calculated_2021);
    assert.equal(raw.trend.current_egfr_used, expected_output.current.egfr_calculated_2021);
    assert.equal(raw.trend.egfr_percent_change, expected_output.trend.egfr_percent_change);
    assert.equal(raw.safety_flags[0].code, "EGFR_LARGE_DECLINE_DEMO_GUARD");
    assert.equal(raw.safety_flags[0].level, "prompt_medical_review");
  });

  it("gateway validation stamps pair_deterministic_engine and keeps trend numbers", async () => {
    const raw = await runPair({
      baseline: heroFixture.input.baseline,
      current: heroFixture.input.current,
      age_years: heroFixture.input.age,
      sex: heroFixture.input.sex,
    });
    const validated = validatePairOutput(raw);
    assert.equal(validated.provenance, "pair_deterministic_engine");
    assert.equal(typeof validated.trend.egfr_percent_change, "number");
    assert.equal(typeof validated.current.egfr_calculated_2021, "number");
    assert.ok(Array.isArray(validated.safety_flags));
  });

  it("rejects structurally invalid output via validatePairOutput (null)", () => {
    assert.equal(validatePairOutput({ invalid_field: true }), null);
    assert.equal(validatePairOutput(null), null);
    assert.equal(validatePairOutput({ trend: { egfr_percent_change: "x" }, current: {}, safety_flags: [] }), null);
  });
});

describe("Slice 02: Missy synthetic DB — snapshot copy + immutable=1 read", () => {
  it("reads confirmed observations from the locked upstream schema", () => {
    const res = readMissyObservations(syntheticMissyDb);
    assert.equal(res.status, "OK");
    assert.equal(res.captures.length, 1);
    const c = res.captures[0];
    assert.equal(c.capture_id, "cap-synth-101");
    assert.equal(c.volume_ml, 200);
    assert.equal(c.raw_text, "Log 200 ml water");
    assert.deepEqual(c.provenance, { source: "ai_missy_offline", synthetic: true, confirmation: "explicit" });
  });

  it("reports MISSY_UNREACHABLE for a nonexistent db without throwing", () => {
    const res = readMissyObservations(path.join(__dirname, "fixtures/does-not-exist.sqlite3"));
    assert.equal(res.status, "MISSY_UNREACHABLE");
    assert.deepEqual(res.captures, []);
  });
});
