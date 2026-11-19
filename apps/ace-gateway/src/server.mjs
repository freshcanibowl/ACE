/**
 * ACE Gateway — the only substantial new POC code (spec.md > Components).
 * Node >= 26, no framework, node:sqlite built-in. Port 8787.
 *
 * Endpoints (spec.md > apps/ace-gateway):
 *   POST /api/sync              — copy confirmed Missy observations as EdgeCaptures
 *   POST /api/evaluate          — run PAIR subprocess via evaluateClinicalSnapshot pipeline
 *   GET  /api/snapshot/:pid     — consent-gated Clinical Snapshot JSON
 *   GET  /api/audit/:pid        — ordered audit chain
 *   GET  /                      — nurse portal (public/index.html)
 *
 * Error semantics per spec.md > 0b matrix; AUDIT_INCOMPLETE is fail-closed.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { evaluateClinicalSnapshot } from './gateway-handler.mjs';
import { makePairRunner, validatePairOutput } from './pair-engine.mjs';
import { readMissyObservations, loadFixtureCaptures } from './missy-adapter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.ACE_PORT || 8787;
const MISSY_DB = process.env.MISSY_DB_PATH || ''; // empty -> fixture fallback
// Engine source: cloned upstream checkout sits next to the ACE repo checkout
// (ACE_Healthcare/pair-renal-care/src). ROOT here is apps/ace-gateway, so the
// clone is three levels up. Override with PAIR_SRC_PATH.
const PAIR_SRC = process.env.PAIR_SRC_PATH || path.resolve(ROOT, '../../../pair-renal-care/src');
const DB_PATH = process.env.ACE_DB_PATH || path.join(ROOT, 'data', 'ace.sqlite');

// ---------- DB init ----------
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS captures (
  id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, kind TEXT NOT NULL,
  payload_json TEXT NOT NULL, provenance_json TEXT NOT NULL,
  captured_at TEXT NOT NULL, sync_state TEXT NOT NULL DEFAULT 'queued');
CREATE TABLE IF NOT EXISTS escalations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, level TEXT NOT NULL,
  reason TEXT NOT NULL, computed_by TEXT NOT NULL, evidence_ref TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL,
  subject TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, grantee TEXT NOT NULL,
  scopes_json TEXT NOT NULL, granted_at TEXT NOT NULL, revoked_at TEXT);
CREATE TABLE IF NOT EXISTS baselines (
  patient_id TEXT PRIMARY KEY, egfr_history_json TEXT NOT NULL, staging TEXT, meds_json TEXT);
`);

// Seed synthetic demo consent + baseline (spec: labeled synthetic, demo-only flow gating)
function seedOnce() {
  const has = db.prepare("SELECT COUNT(*) AS n FROM baselines WHERE patient_id='SYNTH_PATIENT_001'").get().n;
  if (!has) {
    db.prepare("INSERT INTO baselines (patient_id, egfr_history_json, staging, meds_json) VALUES (?,?,?,?)")
      .run('SYNTH_PATIENT_001', JSON.stringify([{ date: '2026-10-01', egfr: 81.1 }]), 'G3b', '[]');
    db.prepare("INSERT INTO consents (patient_id, grantee, scopes_json, granted_at) VALUES (?,?,?,?)")
      .run('SYNTH_PATIENT_001', 'demo-duty-nurse', JSON.stringify(['read:snapshot', 'read:audit']), new Date().toISOString());
  }
}
seedOnce();

// ---------- audit (fail-closed per spec 0b) ----------
function writeAuditLog(entry) {
  try {
    db.prepare('INSERT INTO audit (actor, action, subject, source, created_at) VALUES (?,?,?,?,?)')
      .run(entry.actor || 'system', entry.event_type, entry.patientAlias || entry.job_id || '-', 'ace-gateway', new Date().toISOString());
    return true;
  } catch (err) {
    console.error(`[AUDIT_WRITE_FAILED] sqlite: ${err.message}`);
    return false;
  }
}

const runPairEngine = makePairRunner(PAIR_SRC);

// ---------- clinical boundaries (spec.md > 0) ----------
function mapSafetyFlagsToDisplay(flags) {
  // Wording red line: never diagnostic/alarmist. Sourced from PAIR flag codes only.
  return flags.map((f) => ({
    code: f.code,
    display: 'Threshold detected per clinic SOP. Please contact clinic staff.',
    level: f.level,
  }));
}

function evaluateSync({ patientId, current }) {
  const baselineRow = db.prepare('SELECT * FROM baselines WHERE patient_id=?').get(patientId);
  const baseline = baselineRow ? JSON.parse(baselineRow.egfr_history_json) : null;
  const ageYears = 62, sex = 'male'; // synthetic demo patient profile
  return evaluateClinicalSnapshot({
    patientAlias: patientId,
    baseline: baseline ? { timestamp: baseline[baseline.length - 1].date, serum_creatinine_value: 92.0, serum_creatinine_unit: 'umol/L', potassium_mmol_l: 4.4, systolic_bp: 132 } : null,
    current,
    runPairEngine: async ({ baseline: b, current: c }) => {
      const raw = await runPairEngine({ baseline: b, current: c, age_years: ageYears, sex });
      const validated = validatePairOutput(raw);
      if (!validated) throw new Error('ENGINE_INVALID_OUTPUT');
      return validated;
    },
    writeAuditLog,
  });
}

// ---------- HTTP plumbing ----------
function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 100_000) { reject(new Error('BODY_TOO_LARGE')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = url.pathname;

  try {
    // CORS-free localhost-only: nurse portal and APIs share the origin.
    if (p === '/' || p === '/index.html') {
      const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    if (p === '/api/sync' && req.method === 'POST') {
      const captured = MISSY_DB ? readMissyObservations(MISSY_DB) : { status: 'FIXTURE', captures: loadFixtureCaptures(path.join(ROOT, 'tests', 'fixtures', 'missy-captures.fixture.json')) };
      if (captured.status === 'MISSY_UNREACHABLE') return send(res, 503, { error: 'MISSY_UNREACHABLE' });
      let synced = 0;
      for (const c of captured.captures) {
        const kind = c.volume_ml != null ? 'fluid_intake' : 'text_log';
        db.prepare(`INSERT INTO captures (id, patient_id, kind, payload_json, provenance_json, captured_at, sync_state)
                    VALUES (?,?,?,?,?,?,?)
                    ON CONFLICT(id) DO NOTHING`)
          .run(c.capture_id, 'SYNTH_PATIENT_001', kind, JSON.stringify(c), JSON.stringify(c.provenance), c.confirmed_at, 'synced');
        synced++;
      }
      writeAuditLog({ event_type: 'sync_completed', patientAlias: 'SYNTH_PATIENT_001', actor: 'gateway' });
      return send(res, 200, { status: 'synced', captures_seen: captured.captures.length, captures_new: synced, source: captured.status });
    }

    if (p === '/api/evaluate' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const result = await evaluateSync({ patientId: 'SYNTH_PATIENT_001', current: body.current || { timestamp: '2026-11-18T09:15:00', serum_creatinine_value: 135.0, serum_creatinine_unit: 'umol/L', potassium_mmol_l: 5.1, systolic_bp: 146 } });
      if (result.httpStatus === 200 && result.body.status === 'ok') {
        const snap = result.body.snapshot;
        const topFlag = snap.safety_flags?.[0];
        if (topFlag) {
          db.prepare('INSERT INTO escalations (patient_id, level, reason, computed_by, evidence_ref, created_at) VALUES (?,?,?,?,?,?)')
            .run('SYNTH_PATIENT_001', topFlag.level, `${topFlag.code}: eGFR change ${snap.trend.egfr_percent_change}%`, 'pair_deterministic_engine', 'see audit', new Date().toISOString());
        }
      }
      return send(res, result.httpStatus, result.body);
    }

    const snapMatch = p.match(/^\/api\/snapshot\/([^/]+)$/);
    if (snapMatch && req.method === 'GET') {
      const pid = decodeURIComponent(snapMatch[1]);
      const consent = db.prepare("SELECT * FROM consents WHERE patient_id=? AND grantee='demo-duty-nurse' AND revoked_at IS NULL").get(pid);
      if (!consent) {
        writeAuditLog({ event_type: 'consent_denied', patientAlias: pid, actor: 'demo-duty-nurse' });
        return send(res, 403, { error: 'CONSENT_DENIED', message: 'No active consent for this grantee.' });
      }
      const baselineRow = db.prepare('SELECT * FROM baselines WHERE patient_id=?').get(pid);
      const captures = db.prepare('SELECT * FROM captures WHERE patient_id=? ORDER BY captured_at').all(pid);
      const escalations = db.prepare('SELECT * FROM escalations WHERE patient_id=? ORDER BY created_at').all(pid);
      const auditRows = db.prepare('SELECT * FROM audit ORDER BY id').all();
      if (auditRows.length === 0) {
        return send(res, 200, { error: 'AUDIT_INCOMPLETE', message: 'Audit chain empty — snapshot withheld.' });
      }
      const lastEngine = escalations.at(-1) || null;
      return send(res, 200, {
        synthetic_banner: 'SYNTHETIC DEMO DATA ONLY — NOT FOR CLINICAL USE',
        patient_id: pid,
        baseline: baselineRow ? JSON.parse(baselineRow.egfr_history_json) : null,
        captures,
        escalations,
        safety_display: lastEngine ? mapSafetyFlagsToDisplay([{ code: lastEngine.reason.split(':')[0], level: lastEngine.level, message: lastEngine.reason }]) : [],
        audit_chain: auditRows,
        consent: { grantee: consent.grantee, scopes: JSON.parse(consent.scopes_json), note: 'demo flow gating only, not a compliance consent record' },
      });
    }

    const auditMatch = p.match(/^\/api\/audit\/([^/]+)$/);
    if (auditMatch && req.method === 'GET') {
      const pid = decodeURIComponent(auditMatch[1]);
      const rows = db.prepare("SELECT * FROM audit WHERE subject=? OR subject='-' ORDER BY id").all(pid);
      return send(res, 200, { patient_id: pid, audit_chain: rows });
    }

    return send(res, 404, { error: 'NOT_FOUND' });
  } catch (err) {
    console.error('[GATEWAY_ERROR]', err.stack || err.message);
    return send(res, 500, { error: 'GATEWAY_ERROR', cause: err.message });
  }
});

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`ACE gateway listening on http://127.0.0.1:${PORT} (synthetic demo data only)`);
  });
}

export { server, writeAuditLog, db };
