import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const dbCache = new Map<string, Database.Database>();

const SCHEMA = `
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;

  CREATE TABLE IF NOT EXISTS projects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    prefix     TEXT    NOT NULL,
    path       TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_number INTEGER NOT NULL,
    task_id     TEXT    NOT NULL UNIQUE,
    title       TEXT    NOT NULL,
    description TEXT,
    type        TEXT    NOT NULL CHECK(type IN ('feat','fix','docs','refactor','test','chore','perf','ci')),
    priority    TEXT    NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
    stage       TEXT    NOT NULL DEFAULT 'ideation'
                  CHECK(stage IN ('ideation','design','refinement','estimated','planned','in-progress','complete','deployed')),
    estimate    TEXT,
    assignee    TEXT,
    due_date    TEXT,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE(project_id, task_number)
  );

  CREATE TABLE IF NOT EXISTS task_comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    body       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS task_links (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    from_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    to_task_id   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    link_type    TEXT    NOT NULL CHECK(link_type IN ('blocks','depends-on','relates-to')),
    UNIQUE(from_task_id, to_task_id, link_type)
  );

  CREATE TABLE IF NOT EXISTS task_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    actor      TEXT,
    event_type TEXT    NOT NULL CHECK(event_type IN ('created','stage_changed','field_changed','comment_added','link_added')),
    field      TEXT,
    old_value  TEXT,
    new_value  TEXT,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`;

export function getDb(projectPath: string): Database.Database {
  const resolved = path.resolve(projectPath);
  const cached = dbCache.get(resolved);
  if (cached) return cached;

  const dbDir = path.join(resolved, '.claude-tasks');
  fs.mkdirSync(dbDir, { recursive: true });

  const dbPath = path.join(dbDir, 'tasks.db');
  const db = new Database(dbPath);

  db.exec(SCHEMA);

  // Migrations for columns added after initial schema
  const columns = (db.prepare("PRAGMA table_info('tasks')").all() as Array<{ name: string }>).map(r => r.name);
  if (!columns.includes('assignee'))  db.exec('ALTER TABLE tasks ADD COLUMN assignee TEXT');
  if (!columns.includes('due_date'))  db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');

  dbCache.set(resolved, db);
  return db;
}

export function closeDb(projectPath: string): void {
  const resolved = path.resolve(projectPath);
  const db = dbCache.get(resolved);
  if (db) {
    db.close();
    dbCache.delete(resolved);
  }
}
