/**
 * AI Missy adapter — reads a SYNTHETIC copy of the Missy SQLite DB per
 * spec.md > 0d: the .db (+ -wal/-shm if present) is copied to a controlled
 * temp dir and opened read-only with immutable=1. The real path/sync comes
 * from MISSY_DB_PATH; the fixture default keeps business code free of
 * unverified assumptions (MockMissyAdapter-first rule satisfied: this IS
 * the verified schema, captured from upstream core.py line 22).
 *
 * Observed upstream schema (ai-missy-offline-qvac/core.py, Build 08):
 *   observations(id TEXT PRIMARY KEY, ml INTEGER NOT NULL,
 *                source TEXT NOT NULL, confirmed_at TEXT NOT NULL)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function snapshotMissyDb(missyDbPath) {
  const src = path.resolve(missyDbPath);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-missy-'));
  for (const suffix of ['', '-wal', '-shm']) {
    const candidate = src + suffix;
    if (fs.existsSync(candidate)) {
      const dest = path.join(tmp, 'missy_copy.sqlite3' + suffix);
      fs.copyFileSync(candidate, dest);
      fs.chmodSync(dest, 0o600);
    }
  }
  return {
    copyPath: path.join(tmp, 'missy_copy.sqlite3'),
    cleanup() {
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

export function readMissyObservations(missyDbPath) {
  if (!fs.existsSync(path.resolve(missyDbPath))) {
    return { status: 'MISSY_UNREACHABLE', captures: [] };
  }
  const snap = snapshotMissyDb(missyDbPath);
  try {
    const db = new DatabaseSync('file:' + snap.copyPath.replace(/\\/g, '/') + '?immutable=1', { readOnly: true });
    const rows = db
      .prepare('SELECT id, ml, source, confirmed_at FROM observations ORDER BY confirmed_at')
      .all();
    db.close();
    return {
      status: 'OK',
      captures: rows.map((r) => ({
        capture_id: r.id,
        volume_ml: r.ml,
        raw_text: r.source,
        confirmed_at: r.confirmed_at,
        // gateway-level provenance: this came from a synthetic Missy demo DB
        provenance: { source: 'ai_missy_offline', synthetic: true, confirmation: 'explicit' },
      })),
    };
  } finally {
    snap.cleanup();
  }
}

/**
 * Fallback used when no real Missy DB exists on this machine (e.g. CI):
 * loads the synthetic fixture so the gateway stays demo-able.
 */
export function loadFixtureCaptures(fixturePath) {
  const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  return data.captures.map((c) => ({
    capture_id: c.capture_id,
    volume_ml: null,
    raw_text: c.raw_text,
    confirmed_at: c.captured_at,
    provenance: { source: 'ai_missy_offline', synthetic: true, confirmation: 'explicit', fixture: true },
  }));
}

// keep spawnSync import referenced for potential future synchronous snapshot use
void spawnSync;
