import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Restrict drizzle-kit to tables we own here. better-auth manages its own
  // tables (user, session, account, verification) and would otherwise be
  // dropped by drizzle-kit push. Add new tables to this list when introducing
  // them.
  tablesFilter: [
    'vehicles',
    'calibrations',
    'runs',
    'samples',
    'derived_curves',
    'recordings',
    'grip_sessions',
  ],
});
