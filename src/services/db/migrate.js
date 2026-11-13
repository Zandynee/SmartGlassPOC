// ─────────────────────────────────────────────
//  migrate.js  –  brings an existing (version 1) database up to version 2
//
//  schema.sql only creates what is missing (IF NOT EXISTS), so a database made by the
//  old app keeps its old `checks` table. This adds the new columns. Column presence is
//  checked with PRAGMA table_info, so it is safe to run on every start.
//  No data is deleted; legacy rows keep status = NULL and are shown as "—" in History.
//
//  `db` is { run(sql, params), all(sql, params) } (both async) – see db.js.
// ─────────────────────────────────────────────

export const SCHEMA_VERSION = 2

/** [table, column, SQL type] added in version 2 */
export const V2_COLUMNS = [
  ['checks', 'status', 'TEXT'],
  ['checks', 'work_duration_s', 'REAL'],
  ['checks', 'rmssd_change_pct', 'REAL'],
  ['checks', 'sdnn_change_pct', 'REAL'],
  ['checks', 'valid_windows', 'INTEGER'],
  ['checks', 'total_windows', 'INTEGER'],
  ['checks', 'drop_thr', 'REAL'],
]

export const REQUIRED_TABLES = ['sessions', 'imu_readings', 'ppg_readings', 'tof_readings', 'checks', 'baselines']

/** Split a .sql file into statements (strips `-- …` comments first, so a ';' in a comment can't break it). */
export function splitSql(sql) {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function migrate(db) {
  const done = []
  for (const [table, col, type] of V2_COLUMNS) {
    const cols = await db.all(`PRAGMA table_info(${table})`)
    if (!cols.some((c) => c.name === col)) {
      await db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`)
      done.push(`${table}.${col}`)
    }
  }
  await db.run('CREATE INDEX IF NOT EXISTS idx_checks_status ON checks(status, t)')
  await db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  return done
}
