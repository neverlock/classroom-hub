import { error, json } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { isIsoDate } from '#lib/dates.js';
import { attachments, entries } from '#lib/server/db/schema.js';
import { roomContext } from '#lib/server/room.js';
import type { RequestHandler } from './$types';

/** Lets the admin form load an existing card for a date + subject, so saving edits it instead of overwriting blindly. */
export const GET: RequestHandler = async (event) => {
	const { db, room, actor } = await roomContext(event);
	if (!actor) error(401, 'กรุณาล็อกอินแอดมินห้องก่อน');
	const date = event.url.searchParams.get('date');
	const subjectId = Number(event.url.searchParams.get('subject'));
	if (!isIsoDate(date) || !subjectId) return json({ exists: false });
	const e = await db
		.select()
		.from(entries)
		.where(and(eq(entries.classId, room.cls.id), eq(entries.entryDate, date), eq(entries.subjectId, subjectId)))
		.get();
	if (!e) return json({ exists: false });
	const photos = await db.select({ id: attachments.id }).from(attachments).where(eq(attachments.entryId, e.id)).orderBy(asc(attachments.id)).all();
	return json({
		exists: true,
		hidden: e.hidden,
		lesson: e.lesson,
		hasHomework: e.hasHomework,
		detail: e.homeworkDetail ?? '',
		due: e.homeworkDue ?? '',
		photos: photos.map((p) => p.id)
	}, { headers: { 'cache-control': 'no-store' } });
};
