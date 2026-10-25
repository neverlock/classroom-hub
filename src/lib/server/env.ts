import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { getDb } from './db';

/** Bindings, config and a Drizzle handle. (Cloudflare bindings come from `cloudflare:workers`, not `event.platform`.) */
export function useEnv(_event?: unknown) {
	if (!env.DB) error(500, 'ไม่พบฐานข้อมูล (binding DB) ตรวจสอบ wrangler.jsonc');
	if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 16) {
		error(500, 'ยังไม่ได้ตั้งค่า SESSION_SECRET (ต้องเป็น secret ยาวอย่างน้อย 16 ตัว)');
	}
	return { env, db: getDb(env.DB), secret: env.SESSION_SECRET };
}

export type Db = ReturnType<typeof getDb>;

/**
 * Runs several read queries in ONE round trip to D1 (`db.batch`). Each extra round trip costs the
 * distance to the database, so pages group their independent queries here. Results come back in order.
 */
export function batch(db: Db, queries: unknown[]): Promise<Record<string, unknown>[][]> {
	return db.batch(queries as unknown as Parameters<Db['batch']>[0]) as unknown as Promise<Record<string, unknown>[][]>;
}
