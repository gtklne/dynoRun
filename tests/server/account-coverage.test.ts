import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const schema = readFileSync(resolve(root, 'server/src/schema.ts'), 'utf8');
const accountRoute = readFileSync(resolve(root, 'server/src/routes/account.ts'), 'utf8');

/**
 * Every table keyed by a user, as declared in the schema. Read from source
 * rather than listed here, so adding a table to schema.ts extends this test
 * automatically instead of leaving it silently narrower than reality.
 */
function userScopedTables(): string[] {
  const found: string[] = [];
  // pgTable declarations, in order, so the nearest one above a user_id column
  // is that column's owner.
  const declarations = [...schema.matchAll(/export const (\w+) = pgTable\('(\w+)'/g)]
    .map((m) => ({ constName: m[1], index: m.index ?? 0 }));

  for (const match of schema.matchAll(/userId: text\('user_id'\)/g)) {
    const at = match.index ?? 0;
    const owner = [...declarations].reverse().find((d) => d.index < at);
    if (owner && !found.includes(owner.constName)) found.push(owner.constName);
  }
  return found;
}

describe('account export and deletion cover every user-scoped table', () => {
  const tables = userScopedTables();

  it('finds the user-scoped tables in the schema', () => {
    // Guards the parser itself: if this regex ever stops matching, the two
    // tests below would pass vacuously over an empty list.
    expect(tables.length).toBeGreaterThanOrEqual(5);
    expect(tables).toContain('gripSessions');
  });

  it.each(tables)('DELETE /account deletes %s', (table) => {
    // The privacy policy promises deletion "immediately and permanently removes
    // the underlying data". grip_sessions was missed once already, which left
    // multi-MB GPS traces orphaned in the database after an account was gone.
    expect(accountRoute).toMatch(new RegExp(`tx\\.delete\\(${table}\\)`));
  });

  it.each(tables)('GET /account/export includes %s', (table) => {
    // Same promise from the other side: an export that silently omits a table
    // is an incomplete answer to a data-access request.
    expect(accountRoute).toMatch(new RegExp(`from\\(${table}\\)`));
  });
});
