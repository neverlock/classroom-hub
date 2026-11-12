import { error, json } from '@sveltejs/kit';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { MAX_COMMENT_ID } from '#lib/unread.js';
import { commentReads, entries } from '#lib/server/db/schema.js';
import { readRows } from '#lib/server/queries.js';
import { roomContext } from '#lib/server/room.js';
import type { RequestHandler } from './$types';

const CHUNK = 20; // 4 bound values per row, and D1 allows ~100 per statement
const MAX_ENTRIES = 600;
const headers = { 'cache-control': 'no-store' };

/**
 * How far a student (identified by the signed cookie) has read each card.
 *   { entries: { [entryId]: lastCommentId } }   raises the read mark of those cards (never lowers it)
 * Answers with all the student's rows. Visitors without a รหัส get 401 and keep this in their browser.
 */
export const POST: RequestHandler = async (event) => {
	const { db, room, student } = await roomContext(event);
	if (!student) error(401, 'ยังไม่ได้กรอกรหัส');
	let body: { entries?: unknown };
	try {
		body = await event.request.json();
	} catch {
		error(400, 'ข้อมูลไม่ถูกต้อง');
	}
	const okId = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_COMMENT_ID;

	if (body.entries && typeof body.entries === 'object') {
		const wanted = Object.entries(body.entries as Record<string, unknown>)
			.map(([k, v]) => [Number(k), v] as const)
			.filter((e): e is readonly [number, number] => Number.isInteger(e[0]) && e[0] > 0 && okId(e[1]))
			.slice(0, MAX_ENTRIES);
		for (let i = 0; i < wanted.length; i += CHUNK) {
			const part = wanted.slice(i, i + CHUNK);
			const valid = new Set(
				(await db.select({ id: entries.id }).from(entries).where(and(inArray(entries.id, part.map((p) => p[0])), eq(entries.classId, room.cls.id)))).map((r) => r.id)
			);
			const rows = part.filter((p) => valid.has(p[0])).map(([entryId, lastCommentId]) => ({ studentId: student.id, entryId, lastCommentId }));
			if (rows.length === 0) continue;
			await db
				.insert(commentReads)
				.values(rows)
				.onConflictDoUpdate({
					target: [commentReads.studentId, commentReads.entryId],
					set: { lastCommentId: sql`max(${commentReads.lastCommentId}, excluded.last_comment_id)`, updatedAt: Date.now() }
				});
		}
	}
	return json({ reads: await readRows(db, student.id) }, { headers });
};
