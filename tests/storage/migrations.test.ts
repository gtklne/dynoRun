import { describe, it, expect, beforeEach } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';

describe('migrations runner', () => {
  let db: Awaited<ReturnType<typeof createWebDatabase>>;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
  });

  it('applies initial schema on a fresh database', async () => {
    await runMigrations(db);
    const tables = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    const names = tables.map((t) => t.name);
    expect(names).toContain('vehicles');
    expect(names).toContain('calibrations');
    expect(names).toContain('runs');
    expect(names).toContain('samples');
    expect(names).toContain('derived_curves');
    expect(names).toContain('schema_versions');
  });

  it('is idempotent', async () => {
    await runMigrations(db);
    await runMigrations(db);
    const versions = await db.query<{ version: number }>(
      'SELECT version FROM schema_versions',
    );
    expect(versions).toEqual([{ version: 1 }]);
  });
});
