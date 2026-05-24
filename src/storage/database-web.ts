import initSqlJs, { Database as SqlJsDb } from 'sql.js';
import type { Database, Row, SqlParam } from './database';

export async function createWebDatabase(_name: string): Promise<Database> {
  const SQL = await initSqlJs(
    (globalThis as Record<string, unknown>).__sqlJsConfig as Parameters<typeof initSqlJs>[0] ?? {
      locateFile: (file) => `https://sql.js.org/dist/${file}`,
    },
  );
  const sqlDb: SqlJsDb = new SQL.Database();

  const execute = async (sql: string, params: SqlParam[] = []): Promise<void> => {
    sqlDb.run(sql, params as never);
  };

  const query = async <T extends Row = Row>(
    sql: string,
    params: SqlParam[] = [],
  ): Promise<T[]> => {
    const stmt = sqlDb.prepare(sql);
    stmt.bind(params as never);
    const out: T[] = [];
    while (stmt.step()) out.push(stmt.getAsObject() as T);
    stmt.free();
    return out;
  };

  const transaction = async <T>(work: () => Promise<T>): Promise<T> => {
    sqlDb.run('BEGIN');
    try {
      const result = await work();
      sqlDb.run('COMMIT');
      return result;
    } catch (err) {
      sqlDb.run('ROLLBACK');
      throw err;
    }
  };

  const close = async (): Promise<void> => {
    sqlDb.close();
  };

  return { execute, query, transaction, close };
}
