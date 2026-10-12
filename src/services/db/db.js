import schemaSql from './schema.sql?raw'

let _db = null          // Tauri Database handle OR sql.js Database
let _isTauri = false

const detectTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export async function initDb() {
  if (_db) return _db
  _isTauri = detectTauri()

  if (_isTauri) {
    // ── Tauri: native SQLite via plugin-sql (unchanged behaviour) ──
    const { default: Database } = await import('@tauri-apps/plugin-sql')
    _db = await Database.load('sqlite:visioguard.db')
  } else {
    // ── Browser (npm run dev): SQLite in WASM ──
    const { default: initSqlJs } = await import('sql.js')
    const { default: wasmUrl } = await import('sql.js/dist/sql-wasm.wasm?url')
    const SQL = await initSqlJs({ locateFile: () => wasmUrl })
    _db = new SQL.Database()
  }

  const statements = schemaSql.split(';').map(s => s.trim()).filter(Boolean)
  for (const stmt of statements) await execute(stmt)
  return _db
}

export async function execute(sql, params = []) {
  if (_isTauri) return _db.execute(sql, params)
  _db.run(sql, params)
  return { rowsAffected: _db.getRowsModified() }
}

export async function select(sql, params = []) {
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

export async function lastInsertId() {
  const rows = await select('SELECT last_insert_rowid() as id')
  return rows[0]?.id
}