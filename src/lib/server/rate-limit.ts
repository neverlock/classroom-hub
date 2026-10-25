import { eq, sql } from 'drizzle-orm';
import type { Db } from './env';
import { authAttempts } from './db/schema';

const WINDOW_MS = 15 * 60_000;

/** True when `key` already failed `limit` times inside the current 15 minute window. */
export async function isLimited(db: Db, key: string, limit: number, now = Date.now()): Promise<boolean> {
	const row = await db.select().from(authAttempts).where(eq(authAttempts.key, key)).get();
	return !!row && row.windowStart + WINDOW_MS >= now && row.count >= limit;
}

/** Records one failed attempt (fixed window: the window restarts when it has expired). */
export async function recordFailure(db: Db, key: string, now = Date.now()): Promise<void> {
	await db
		.insert(authAttempts)
		.values({ key, count: 1, windowStart: now })
		.onConflictDoUpdate({
			target: authAttempts.key,
			set: {
				count: sql`CASE WHEN ${authAttempts.windowStart} + ${WINDOW_MS} < ${now} THEN 1 ELSE ${authAttempts.count} + 1 END`,
				windowStart: sql`CASE WHEN ${authAttempts.windowStart} + ${WINDOW_MS} < ${now} THEN ${now} ELSE ${authAttempts.windowStart} END`
			}
		});
}

export async function clearFailures(db: Db, key: string): Promise<void> {
	await db.delete(authAttempts).where(eq(authAttempts.key, key));
}
