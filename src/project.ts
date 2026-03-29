import Database from 'better-sqlite3';
import * as path from 'path';
import { Project } from './types.js';

export function generatePrefix(dirName: string): string {
  const words = dirName.trim().split(/[-_\s]+/).filter(Boolean);
  if (words.length > 1) {
    return words.map(w => w[0].toUpperCase()).join('');
  }
  const word = words[0] ?? 'PRJ';
  return word.slice(0, 3).toUpperCase();
}

export function ensureProject(db: Database.Database, projectPath: string): Project {
  const resolved = path.resolve(projectPath);
  const existing = db.prepare('SELECT * FROM projects WHERE path = ?').get(resolved) as Project | undefined;
  if (existing) return existing;

  const dirName = path.basename(resolved);
  let prefix = generatePrefix(dirName);

  // Handle prefix collisions
  const taken = db.prepare('SELECT prefix FROM projects WHERE prefix LIKE ?').all(`${prefix}%`) as Array<{ prefix: string }>;
  if (taken.length > 0) {
    const takenSet = new Set(taken.map(r => r.prefix));
    let i = 2;
    while (takenSet.has(`${prefix}${i}`)) i++;
    prefix = `${prefix}${i}`;
  }

  const result = db.prepare(
    'INSERT INTO projects (name, prefix, path) VALUES (?, ?, ?) RETURNING *'
  ).get(dirName, prefix, resolved) as Project;

  return result;
}
