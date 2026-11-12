// Émulation minimale de l'API Cloudflare D1 au-dessus de node:sqlite, pour les tests locaux.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  bind(...p) { this.params = p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v)); return this; }
  _s() { return this.db.prepare(this.sql); }
  async first() { return this._s().get(...this.params) ?? null; }
  async all() { return { results: this._s().all(...this.params).map((r) => ({ ...r })) }; }
  async run() { const r = this._s().run(...this.params); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; }
  _exec() { return this.run(); }
}

export function createD1(migrationsDir, file = ':memory:') {
  const db = new DatabaseSync(file);
  for (const f of readdirSync(migrationsDir).sort()) db.exec(readFileSync(`${migrationsDir}/${f}`, 'utf8'));
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
