import type { Database } from '../database';
import { nowIso } from '@/shared/iso-time';
import initialSql from './001_initial.sql?raw';

interface Migration {
  version: number;
  sql: string;
}

const MIGRATIONS: Migration[] = [{ version: 1, sql: initialSql }];

export async function runMigrations(db: Database): Promise<void> {
  await ensureVersionsTable(db);
  const applied = await loadAppliedVersions(db);
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    await db.transaction(async () => {
      for (const stmt of splitSql(m.sql)) {
        if (stmt.trim()) await db.execute(stmt);
      }
      await db.execute(
        'INSERT INTO schema_versions (version, applied_at) VALUES (?, ?)',
        [m.version, nowIso()],
      );
    });
  }
}

async function ensureVersionsTable(db: Database): Promise<void> {
  const tbl = await db.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_versions'",
  );
  if (tbl.length === 0) {
    await db.execute(
      'CREATE TABLE schema_versions (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
    );
  }
}

async function loadAppliedVersions(db: Database): Promise<Set<number>> {
  const rows = await db.query<{ version: number }>('SELECT version FROM schema_versions');
  return new Set(rows.map((r) => r.version));
}

function splitSql(sql: string): string[] {
  return sql.split(/;\s*$/m);
}
