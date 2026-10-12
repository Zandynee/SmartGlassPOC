import Database from '@tauri-apps/plugin-sql'
import schemaSql from './schema.sql?raw'

let _db = null

export async function initDb() {
  if (_db) return _db
  _db = await Database.load('sqlite:visioguard.db')
  const statements = schemaSql.split(';').map(s => s.trim()).filter(Boolean)
  for (const stmt of statements) await _db.execute(stmt)
  return _db
}

export async function execute(sql, params = []) {
  return _db.execute(sql, params)
}

export async function select(sql, params = []) {
  return _db.select(sql, params)
}

export async function lastInsertId() {
  const rows = await select('SELECT last_insert_rowid() as id')
  return rows[0]?.id
}