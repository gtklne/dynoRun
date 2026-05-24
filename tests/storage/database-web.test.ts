import { describe, it, expect, beforeEach } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import type { Database } from '@/storage/database';

describe('WebDatabase', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
  });

  it('executes DDL and inserts rows', async () => {
    await db.execute('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)');
    await db.execute('INSERT INTO t (id, n) VALUES (?, ?)', ['a', 1]);
    const rows = await db.query<{ id: string; n: number }>('SELECT * FROM t');
    expect(rows).toEqual([{ id: 'a', n: 1 }]);
  });

  it('rolls back on transaction failure', async () => {
    await db.execute('CREATE TABLE t (id TEXT PRIMARY KEY)');
    await db.execute('INSERT INTO t (id) VALUES (?)', ['a']);
    await expect(
      db.transaction(async () => {
        await db.execute('INSERT INTO t (id) VALUES (?)', ['b']);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const rows = await db.query('SELECT id FROM t ORDER BY id');
    expect(rows).toEqual([{ id: 'a' }]);
  });
});
