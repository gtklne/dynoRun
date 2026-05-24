import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { Database, Row, SqlParam } from './database';

const sqlite = new SQLiteConnection(CapacitorSQLite);

export async function createCapacitorDatabase(name: string): Promise<Database> {
  const ret = await sqlite.checkConnectionsConsistency();
  const isConn = (await sqlite.isConnection(name, false)).result;
  let conn: SQLiteDBConnection;
  if (ret.result && isConn) {
    conn = await sqlite.retrieveConnection(name, false);
  } else {
    conn = await sqlite.createConnection(name, false, 'no-encryption', 1, false);
  }
  await conn.open();

  const execute = async (sql: string, params: SqlParam[] = []): Promise<void> => {
    await conn.run(sql, params as never);
  };

  const query = async <T = Row>(
    sql: string,
    params: SqlParam[] = [],
  ): Promise<T[]> => {
    const res = await conn.query(sql, params as never);
    return (res.values ?? []) as T[];
  };

  const transaction = async <T>(work: () => Promise<T>): Promise<T> => {
    await conn.run('BEGIN');
    try {
      const result = await work();
      await conn.run('COMMIT');
      return result;
    } catch (err) {
      await conn.run('ROLLBACK');
      throw err;
    }
  };

  const close = async (): Promise<void> => {
    await conn.close();
    await sqlite.closeConnection(name, false);
  };

  return { execute, query, transaction, close };
}
