import schemaSql from './schema.sql?raw'

let _db = null          // Tauri Database handle OR sql.js Database (set only AFTER schema is ready)
let _isTauri = false
let _initPromise = null

const detectTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// ── raw helpers that take the handle explicitly (used during init) ──
async function rawExecute(db, sql, params = []) {
  if (_isTauri) return db.execute(sql, params)          // { rowsAffected, lastInsertId }
  db.run(sql, params)
  const res = db.exec('SELECT last_insert_rowid()')
  return {
    rowsAffected: db.getRowsModified(),
    lastInsertId: res[0]?.values[0][0] ?? null,
  }
}

async function _init() {
  _isTauri = detectTauri()
  let db
  if (_isTauri) {
    const { default: Database } = await import('@tauri-apps/plugin-sql')
    db = await Database.load('sqlite:visioguard.db')
  } else {
    const { default: initSqlJs } = await import('sql.js')
    const { default: wasmUrl } = await import('sql.js/dist/sql-wasm.wasm?url')
    const SQL = await initSqlJs({ locateFile: () => wasmUrl })
    db = new SQL.Database()
  }

  const statements = schemaSql.split(';').map(s => s.trim()).filter(Boolean)
  for (const stmt of statements) await rawExecute(db, stmt)

  _db = db            // publish only once tables exist
  return _db
}

/** Safe to call many times / concurrently: everyone awaits the same promise. */
export function initDb() {
  if (!_initPromise) {
    _initPromise = _init().catch((e) => {
      _initPromise = null       // allow retry after a failure
      throw e
    })
  }
  return _initPromise
}

/**
 * Returns { rowsAffected, lastInsertId }.
 * lastInsertId comes from the INSERT itself — never from a separate
 * SELECT last_insert_rowid(), which is per-connection and wrong with a pool.
 */
export async function execute(sql, params = []) {
  await initDb()
  return rawExecute(_db, sql, params)
}

export async function select(sql, params = []) {
  await initDb()
  if (_isTauri) return _db.select(sql, params)
  const stmt = _db.prepare(sql)
  try {
    stmt.bind(params)
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    return rows
  } finally {
    stmt.free()
  }
}