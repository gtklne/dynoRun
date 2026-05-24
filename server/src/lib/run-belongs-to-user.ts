import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { runs } from '../schema.js';

export async function runBelongsToUser(runId: string, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: runs.id }).from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)));
  return !!row;
}
