import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

const migrations = new URL('../drizzle/', import.meta.url);
const columns = {
  letter_submissions: ['id', 'plant_id', 'author_name', 'author_email', 'body', 'created_at', 'published_at'],
  moderation_credentials: ['email', 'password_hash']
};

function transaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function applyMigrations(db, snapshot) {
  db.exec('CREATE TABLE IF NOT EXISTS _flora_migrations (name TEXT PRIMARY KEY)');
  const applied = db.prepare('SELECT name FROM _flora_migrations WHERE name = ?');
  const record = db.prepare('INSERT INTO _flora_migrations (name) VALUES (?)');
  const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', migrations), 'utf8'));
  for (const {tag} of journal.entries) {
    transaction(db, () => {
      if (applied.get(tag)) return;
      db.exec(readFileSync(new URL(tag + '.sql', migrations), 'utf8'));
      record.run(tag);
    });
  }
  if (snapshot) {
    transaction(db, () => {
      if (applied.get('sites-import')) return;
      const data = JSON.parse(snapshot);
      for (const [table, fields] of Object.entries(columns)) {
        const placeholders = fields.map(() => '?').join(', ');
        const insert = db.prepare('INSERT INTO ' + table + ' (' + fields.join(', ') + ') VALUES (' + placeholders + ')');
        for (const row of data[table]) insert.run(...fields.map((field) => row[field]));
      }
      record.run('sites-import');
    });
  }
}

export function openDatabase(file, snapshot) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000');
  applyMigrations(db, snapshot);
  function prepare(sql) {
    const statement = db.prepare(sql);
    const bound = (args) => ({
      first: () => statement.get(...args) ?? null,
      all: () => ({results:statement.all(...args)}),
      run: () => ({meta:{changes:statement.run(...args).changes}})
    });
    return {...bound([]), bind:(...args) => bound(args)};
  }
  return {
    prepare,
    batch: (statements) => transaction(db, () => statements.map((statement) => statement.run())),
    close: () => db.close()
  };
}
