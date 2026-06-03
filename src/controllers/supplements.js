import { getDb } from '../db/index.js';

const today = () => new Date().toISOString().slice(0, 10);

export function listActive(req, res) {
  const rows = getDb()
    .prepare('SELECT * FROM supplements WHERE active = 1 ORDER BY time_of_day, name ASC')
    .all();
  res.json(rows);
}

export function createSupplement(req, res) {
  const { name, dose, unit = 'mg', time_of_day = 'morning' } = req.body;
  if (!name?.trim() || !dose?.trim()) {
    return res.status(400).json({ error: 'name and dose are required' });
  }
  const db = getDb();
  const trimmedName = name.trim();
  const trimmedDose = dose.trim();
  const now = today();

  const existing = db.prepare('SELECT * FROM supplements WHERE LOWER(name) = LOWER(?)').get(trimmedName);

  if (existing) {
    if (existing.active === 1) {
      return res.status(409).json({ error: 'A supplement with this name already exists' });
    }
    // Reactivate inactive supplement with updated values
    const doseChanged = trimmedDose !== existing.dose || unit !== existing.unit;
    db.transaction(() => {
      db.prepare('UPDATE supplements SET active = 1, dose = ?, unit = ?, time_of_day = ? WHERE id = ?')
        .run(trimmedDose, unit, time_of_day, existing.id);
      if (doseChanged) {
        db.prepare('UPDATE supplement_dose_history SET effective_to = ? WHERE supplement_id = ? AND effective_to IS NULL')
          .run(now, existing.id);
        db.prepare('INSERT INTO supplement_dose_history (supplement_id, dose, unit, effective_from) VALUES (?, ?, ?, ?)')
          .run(existing.id, trimmedDose, unit, now);
      }
    })();
    return res.json(db.prepare('SELECT * FROM supplements WHERE id = ?').get(existing.id));
  }

  const id = db.transaction(() => {
    const sup = db
      .prepare('INSERT INTO supplements (name, dose, unit, time_of_day) VALUES (?, ?, ?, ?)')
      .run(trimmedName, trimmedDose, unit, time_of_day);
    db
      .prepare('INSERT INTO supplement_dose_history (supplement_id, dose, unit, effective_from) VALUES (?, ?, ?, ?)')
      .run(sup.lastInsertRowid, trimmedDose, unit, now);
    return sup.lastInsertRowid;
  })();
  res.status(201).json(db.prepare('SELECT * FROM supplements WHERE id = ?').get(id));
}

export function deduplicateSupplements() {
  const db = getDb();
  const duplicateGroups = db.prepare(`
    SELECT LOWER(name) AS lower_name, COUNT(*) AS cnt
    FROM supplements
    GROUP BY LOWER(name)
    HAVING cnt > 1
  `).all();

  if (duplicateGroups.length === 0) return;

  console.log(`[supplements] Found ${duplicateGroups.length} duplicate group(s), deduplicating...`);

  // Prepare statements and collect merge plan BEFORE entering the transaction.
  // better-sqlite3 silently rolls back transactions that throw, and calling
  // .prepare() or .all() inside the callback can trigger that in some versions.
  const getMembers = db.prepare(`
    SELECT s.id, COUNT(sl.id) AS log_count
    FROM supplements s
    LEFT JOIN supplement_logs sl ON sl.supplement_id = s.id
    WHERE LOWER(s.name) = ?
    GROUP BY s.id
    ORDER BY log_count DESC, s.id ASC
  `);
  const reassignLogs = db.prepare('UPDATE supplement_logs SET supplement_id = ? WHERE supplement_id = ?');
  const deactivate = db.prepare('UPDATE supplements SET active = 0 WHERE id = ?');

  const merges = [];
  for (const group of duplicateGroups) {
    const [canonical, ...duplicates] = getMembers.all(group.lower_name);
    for (const dup of duplicates) {
      merges.push({ canonicalId: canonical.id, dupId: dup.id });
    }
  }

  console.log(`[supplements] Merging ${merges.length} duplicate record(s) into canonical counterpart(s)`);

  db.transaction(() => {
    for (const { canonicalId, dupId } of merges) {
      reassignLogs.run(canonicalId, dupId);
      deactivate.run(dupId);
    }
  })();

  console.log(`[supplements] Deduplication complete — ${merges.length} record(s) merged`);
}

export function updateSupplement(req, res) {
  const { id } = req.params;
  const { name, dose, unit, time_of_day } = req.body;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM supplements WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const newDose = dose ?? existing.dose;
  const newUnit = unit ?? existing.unit;
  const doseChanged = (dose != null && dose !== existing.dose) || (unit != null && unit !== existing.unit);
  const now = today();

  db.transaction(() => {
    db.prepare('UPDATE supplements SET name = ?, dose = ?, unit = ?, time_of_day = ? WHERE id = ?')
      .run(name ?? existing.name, newDose, newUnit, time_of_day ?? existing.time_of_day, id);
    if (doseChanged) {
      db.prepare('UPDATE supplement_dose_history SET effective_to = ? WHERE supplement_id = ? AND effective_to IS NULL')
        .run(now, id);
      db.prepare('INSERT INTO supplement_dose_history (supplement_id, dose, unit, effective_from) VALUES (?, ?, ?, ?)')
        .run(id, newDose, newUnit, now);
    }
  })();

  res.json(db.prepare('SELECT * FROM supplements WHERE id = ?').get(id));
}

export function deleteSupplement(req, res) {
  getDb().prepare('UPDATE supplements SET active = 0 WHERE id = ?').run(req.params.id);
  res.status(204).end();
}

export function getLog(req, res) {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });

  const db = getDb();
  const supplements = db.prepare('SELECT * FROM supplements WHERE active = 1 ORDER BY time_of_day, name ASC').all();
  const logs = db.prepare('SELECT * FROM supplement_logs WHERE date = ?').all(date);
  const logMap = {};
  for (const l of logs) logMap[l.supplement_id] = l;

  res.json(supplements.map(s => ({
    ...s,
    taken: logMap[s.id]?.taken ?? 0,
    log_id: logMap[s.id]?.id ?? null,
  })));
}

export function logDose(req, res) {
  const { supplement_id, date, time_of_day, taken } = req.body;
  if (!supplement_id || !date) {
    return res.status(400).json({ error: 'supplement_id and date are required' });
  }
  const db = getDb();
  const existing = db.prepare('SELECT id FROM supplement_logs WHERE supplement_id = ? AND date = ?').get(supplement_id, date);
  if (existing) {
    db.prepare("UPDATE supplement_logs SET taken = ?, logged_at = datetime('now') WHERE id = ?").run(taken ? 1 : 0, existing.id);
    res.json({ id: existing.id });
  } else {
    const result = db.prepare('INSERT INTO supplement_logs (supplement_id, date, time_of_day, taken) VALUES (?, ?, ?, ?)').run(supplement_id, date, time_of_day ?? 'morning', taken ? 1 : 0);
    res.status(201).json({ id: result.lastInsertRowid });
  }
}
