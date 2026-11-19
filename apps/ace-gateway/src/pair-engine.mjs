/**
 * PAIR engine adapter — invokes the real pair-renal-care engine (src/pair)
 * via a Python subprocess. Per spec.md > 0e:
 *   - JSON travels through STDIN pipe, never CLI-arg interpolation
 *   - 5000 ms timeout, 1 MB stdout cap, separate stderr capture
 *   - output schema-validated; invalid -> ENGINE_INVALID_OUTPUT
 * Pin: pair-renal-care upstream repo, engine.py unchanged.
 */
import { spawn } from 'node:child_process';

const TIMEOUT_MS = 5000;
const MAX_STDOUT = 1024 * 1024;

// Small template generated from observed upstream field names (models.py).
// Written once at package init; never modified by the gateway.
const DRIVER = String.raw`
import sys, json
sys.path.insert(0, r"__PAIR_SRC__")
from datetime import datetime
from pair.engine import evaluate_measurements
from pair.models import PatientProfile, RenalMeasurement

req = json.load(sys.stdin)
p = PatientProfile(age_years=req["age_years"], sex=req["sex"])
def meas(m):
    return RenalMeasurement(
        timestamp=datetime.fromisoformat(m["timestamp"]),
        serum_creatinine_value=m["serum_creatinine_value"],
        serum_creatinine_unit=m["serum_creatinine_unit"],
        potassium_mmol_l=m.get("potassium_mmol_l"),
        systolic_bp=m.get("systolic_bp"),
    )
print(json.dumps(evaluate_measurements(p, meas(req["baseline"]), meas(req["current"]))))
`;

export function makePairRunner(pairSrcPath, pythonExe = 'python') {
  const driver = DRIVER.replace('__PAIR_SRC__', pairSrcPath);
  return function runPairEngine({ baseline, current, age_years, sex }) {
    return new Promise((resolve, reject) => {
      const child = spawn(pythonExe, ['-c', driver], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          child.kill();
          reject(new Error('ENGINE_TIMEOUT'));
        }
      }, TIMEOUT_MS);
      child.stdout.on('data', (d) => {
        stdout += d;
        if (stdout.length > MAX_STDOUT) {
          done = true; clearTimeout(timer); child.kill();
          reject(new Error('ENGINE_STDOUT_OVERFLOW'));
        }
      });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('error', (err) => {
        if (!done) { done = true; clearTimeout(timer); reject(err); }
      });
      child.on('close', (code) => {
        if (done) return;
        done = true; clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`ENGINE_EXIT_${code}: ${stderr.slice(0, 300)}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error('ENGINE_INVALID_JSON'));
        }
      });
      child.stdin.write(JSON.stringify({ baseline, current, age_years, sex }));
      child.stdin.end();
    });
  };
}

/**
 * Validates a real PAIR engine result against the observed output shape
 * (captured in tests/fixtures/pair-hero-case.fixture.json).
 * Returns null when invalid — caller maps to ENGINE_INVALID_OUTPUT.
 * Also stamps gateway-level provenance: the engine itself does not emit one.
 */
export function validatePairOutput(result) {
  if (!result || typeof result !== 'object') return null;
  const t = result.trend;
  const cur = result.current;
  const flags = result.safety_flags;
  if (!t || typeof t.egfr_percent_change !== 'number') return null;
  if (!cur || typeof cur.egfr_calculated_2021 !== 'number') return null;
  if (!Array.isArray(flags)) return null;
  for (const f of flags) {
    if (!f || typeof f.level !== 'string' || typeof f.code !== 'string' || typeof f.message !== 'string') return null;
  }
  return {
    ...result,
    provenance: 'pair_deterministic_engine',
  };
}
