import { error, json } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { entries, homeworkMarks } from '#lib/server/db/schema.js';
import { doneMarks } from '#lib/server/queries.js';
import { roomContext } from '#lib/server/room.js';
import type { RequestHandler } from './$types';

const MAX_MERGE = 500;
const CHUNK = 40;
const headers = { 'cache-control': 'no-store' };

/**
 * "ทำแล้ว" marks of a student who has entered their รหัส (identified by the signed cookie).
 *   { entryId, done }  sets or clears one mark
 *   { merge: [ids] }   adds marks that were kept in the browser before the student identified themselves
 * Answers with the student's full list so the page can replace its copy. Visitors without a รหัส get 401 and keep marks locally.
 */
export const POST: RequestHandler = async (event) => {
	const { db, room, student } = await roomContext(event);
	if (!student) error(401, 'ยังไม่ได้กรอกรหัส');
	let body: { entryId?: unknown; done?: unknown; merge?: unknown };
	try {
		body = await event.request.json();
	} catch {
		error(400, 'ข้อมูลไม่ถูกต้อง');
	}

	const ids = Array.isArray(body.merge) ? body.merge : body.entryId !== undefined ? [body.entryId] : [];
	const wanted = [...new Set(ids.filter((n): n is number => Number.isInteger(n) && (n as number) > 0))].slice(0, MAX_MERGE);
	if (wanted.length === 0 && !Array.isArray(body.merge)) error(400, 'ข้อมูลไม่ถูกต้อง');

	// D1 allows only ~100 bound parameters per statement, so long lists go in small chunks
	for (let i = 0; i < wanted.length; i += CHUNK) {
		const part = wanted.slice(i, i + CHUNK);
		const valid = await db
			.select({ id: entries.id })
			.from(entries)
			.where(and(inArray(entries.id, part), eq(entries.classId, room.cls.id), eq(entries.hasHomework, true), eq(entries.hidden, false)));
		const ok = valid.map((v) => v.id);
		if (ok.length === 0) continue;
		if (Array.isArray(body.merge) || body.done !== false) {
			await db.insert(homeworkMarks).values(ok.map((entryId) => ({ studentId: student.id, entryId }))).onConflictDoNothing();
		} else {
			await db.delete(homeworkMarks).where(and(eq(homeworkMarks.studentId, student.id), inArray(homeworkMarks.entryId, ok)));
		}
	}
	const rows = await doneMarks(db, room.cls.id, student.id);
	return json({ ids: rows.map((r) => r.entryId) }, { headers });
};
