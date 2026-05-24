import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Database } from './database';
import { createDatabase } from './database-factory';
import { runMigrations } from './migrations/runner';

export const DbContext = createContext<Database | null>(null);

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d = await createDatabase('dynorun.db');
      await runMigrations(d);
      if (!cancelled) setDb(d);
    })();
    return () => { cancelled = true; };
  }, []);
  if (!db) return <div>Loading database…</div>;
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDatabase(): Database {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDatabase outside DbProvider');
  return db;
}
