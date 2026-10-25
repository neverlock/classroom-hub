import { json } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { isIsoDate } from '#lib/dates.js';
import { attachments, entries } from '#lib/server/db/schema.js';
import { roomContext } from '#lib/server/room.js';
import type { RequestHandler } from './$types';

/**
 * Lets the entry form load an existing card for a date + subject, so saving edits it instead of overwriting blindly.
 * Only the card's author or a room admin gets the content; everybody else only learns who wrote it.
 */
export const GET: RequestHandler = async (event) => {
	const { db, room, actor, student } = await roomContext(event);
	const date = event.url.searchParams.get('date');
	const subjectId = Number(event.url.searchParams.get('subject'));
	const headers = { 'cache-control': 'no-store' };
	if (!isIsoDate(date) || !subjectId) return json({ exists: false }, { headers });
	const e = await db
		.select()
		.from(entries)
		.where(and(eq(entries.classId, room.cls.id), eq(entries.entryDate, date), eq(entries.subjectId, subjectId)))
		.get();
	if (!e) return json({ exists: false }, { headers });

	const identified = !!actor || !!student;
	const editable = !!actor || (!!student && !e.hidden && e.authorStudentId === student.id);
	if (!editable) return json({ exists: true, editable: identified ? false : null, author: e.authorDisplay, hidden: e.hidden }, { headers });

	const photos = await db.select({ id: attachments.id }).from(attachments).where(eq(attachments.entryId, e.id)).orderBy(asc(attachments.id)).all();
	return json(
		{
			exists: true,
			editable: true,
			author: e.authorDisplay,
			lesson: e.lesson,
			hasHomework: e.hasHomework,
			detail: e.homeworkDetail ?? '',
			due: e.homeworkDue ?? '',
			photos: photos.map((p) => p.id)
		},
		{ headers }
	);
};
