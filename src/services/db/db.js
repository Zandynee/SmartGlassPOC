import initSqlJs from 'sql.js'
import schemaSql from './schema.sql?raw'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

let _db = null
export async function initDb()
{
    if (_db) return _db
    const SQL = await initSqlJs({
                locateFile: (file) => sqlWasmUrl, //find wasm
            })
    _db = new SQL.Database()
    _db.run(schemaSql)
    return _db
}

export function execute(sql,params = []){
    if (!_db) throw new Error('Database not initialized. Call initDb() first.')
    _db.run(sql, params)
}

export function select(sql, params = []){
    if (!_db) throw new Error('Database not initialized. Call initDb() first.')
    const stmt  = _db.prepare(sql)
    stmt.bind(params)
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
}

export function lastInsertId(){
    const rows = select('SELECT last_insert_rowid() as id')
    return rows[0]?.id
}
if (typeof window !== 'undefined') {
  window._db = { execute, select }
}
