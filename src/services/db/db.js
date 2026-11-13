import schemaSql from './schema.sql?raw'
import { migrate, splitSql, REQUIRED_TABLES, V2_COLUMNS, SCHEMA_VERSION } from './migrate.js'

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

async function rawSelect(db, sql, params = []) {
  if (_isTauri) return db.select(sql, params)
  const stmt = db.prepare(sql)
  try {
    stmt.bind(params)
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    return rows
  } finally {
    stmt.free()
  }
}

/** Build the database. `sqlJsLoader` is injectable so Node tests can supply sql.js. */
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
  return finishInit(db)
}

async function finishInit(db) {
  for (const stmt of splitSql(schemaSql)) await rawExecute(db, stmt)
  await migrate({
    run: (sql, params) => rawExecute(db, sql, params),
    all: (sql, params) => rawSelect(db, sql, params),
  })
  _db = db            // publish only once tables exist and are migrated
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
  return rawSelect(_db, sql, params)
}

/**
 * Connection check. Never throws; look at `ok`.
 *   backend     'tauri' (file visioguard.db, persistent) | 'sqljs' (in-memory, lost on reload)
 *   persistent  false in the browser: History does not survive a page reload there
 *   missing     tables / v2 columns that are absent (should be empty)
 *   writeOk     inserted and deleted a test row
 */
export async function dbHealth({ write = true } = {}) {
  const h = {
    ok: false, backend: null, persistent: false, sqliteVersion: null, userVersion: null,
    tables: {}, missing: [], writeOk: null, error: null,
  }
  try {
    await initDb()
    h.backend = _isTauri ? 'tauri' : 'sqljs'
    h.persistent = _isTauri
    h.sqliteVersion = (await select('SELECT sqlite_version() AS v'))[0]?.v ?? null
    h.userVersion = (await select('PRAGMA user_version'))[0]?.user_version ?? null

    const present = new Set((await select("SELECT name FROM sqlite_master WHERE type = 'table'")).map((r) => r.name))
    for (const t of REQUIRED_TABLES) {
      if (!present.has(t)) { h.missing.push(t); continue }
      h.tables[t] = (await select(`SELECT COUNT(*) AS n FROM ${t}`))[0]?.n ?? 0
    }
    for (const [table, col] of V2_COLUMNS) {
      const cols = await select(`PRAGMA table_info(${table})`)
      if (!cols.some((c) => c.name === col)) h.missing.push(`${table}.${col}`)
    }

    if (write) {
      const { lastInsertId } = await execute('INSERT INTO sessions (started_at, mode) VALUES (?, ?)', [Date.now(), 'healthcheck'])
      await execute('DELETE FROM sessions WHERE id = ?', [lastInsertId])
      h.writeOk = !!lastInsertId
    }
    h.ok = h.missing.length === 0 && h.userVersion === SCHEMA_VERSION && (h.writeOk ?? true)
  } catch (e) {
    h.error = e?.message || String(e)
  }
  return h
}

/** Test hook (Node): use a ready-made sql.js Database instead of loading one. */
export async function _initWithDatabase(sqlJsDb) {
  _isTauri = false
  _initPromise = finishInit(sqlJsDb)
  return _initPromise
}

if (typeof window !== 'undefined') window._dbHealth = dbHealth
