import { and, asc, desc, eq, getTableColumns, gte, lt, max, sql } from 'drizzle-orm';
import { addDays, isIsoDate } from '#lib/dates.js';
import { attachments, classAdmins, classes, comments, entries, students, subjects, terms } from './db/schema';
import type { CardView, HomeworkRow } from '#lib/types.js';
import { batch, type Db } from './env';

export type ClassRow = typeof classes.$inferSelect;
export type TermRow = typeof terms.$inferSelect;

export interface Room {
	cls: ClassRow;
	terms: TermRow[];
	/** Term the home page shows by default (set by an admin); null until the first term exists. */
	current: TermRow | null;
}

/**
 * Loads a room and, in the same single D1 round trip, the rows of whoever is signed in
 * (ids come from the signed cookies, which are verified before this runs).
 */
export async function loadRoomBundle(db: Db, slug: string, adminId: number | null, studentId: number | null) {
	const q: unknown[] = [
		db.select().from(classes).where(eq(classes.slug, slug)),
		db.select(getTableColumns(terms)).from(terms).innerJoin(classes, eq(terms.classId, classes.id)).where(eq(classes.slug, slug)).orderBy(desc(terms.startDate))
	];
	const adminAt = adminId === null ? -1 : q.push(db.select().from(classAdmins).where(eq(classAdmins.id, adminId))) - 1;
	const studentAt = studentId === null ? -1 : q.push(db.select().from(students).where(eq(students.id, studentId))) - 1;
	const res = await batch(db, q);
	const cls = res[0][0] as ClassRow | undefined;
	if (!cls) return null;
	const list = res[1] as TermRow[];
	const room: Room = { cls, terms: list, current: list.find((t) => t.id === cls.currentTermId) ?? null };
	return {
		room,
		adminRow: adminAt >= 0 ? (res[adminAt][0] as typeof classAdmins.$inferSelect | undefined) : undefined,
		studentRow: studentAt >= 0 ? (res[studentAt][0] as typeof students.$inferSelect | undefined) : undefined
	};
}

export interface Viewer {
	admin: boolean;
	studentId: number | null;
}

export async function loadMain(
	db: Db,
	room: Room,
	params: { term?: string | null; date?: string | null },
	today: string,
	viewer: Viewer
) {
	const { cls } = room;
	const termId = Number(params.term);
	const view = room.terms.find((t) => t.id === termId) ?? room.current ?? room.terms[0] ?? null;
	if (!view) return { view: null, date: today, cards: [] as CardView[], upcoming: [] as HomeworkRow[], overdue: [] as HomeworkRow[], subjects: [] as (typeof subjects.$inferSelect)[] };
	const isCurrent = view.id === room.current?.id;

	let date: string;
	if (isIsoDate(params.date)) date = params.date;
	else if (isCurrent) date = today;
	else {
		const last = await db
			.select({ d: max(entries.entryDate) })
			.from(entries)
			.where(and(eq(entries.classId, cls.id), eq(entries.hidden, false), gte(entries.entryDate, view.startDate), lt(entries.entryDate, addDays(view.endDate, 1))))
			.get();
		date = last?.d ?? view.endDate;
	}

	// Everything the page needs for this date, in ONE round trip. Photos and comments are looked up by
	// (class, date) through joins, so they do not have to wait for the list of cards.
	const dayOf = and(eq(entries.classId, cls.id), eq(entries.entryDate, date), eq(entries.hidden, false));
	const [rows, hwRows, pics, cs, cPics, subs] = (await batch(db, [
		db
			.select({
				id: entries.id,
				lesson: entries.lesson,
				hasHomework: entries.hasHomework,
				homeworkDetail: entries.homeworkDetail,
				homeworkDue: entries.homeworkDue,
				author: entries.authorDisplay,
				authorStudentId: entries.authorStudentId,
				sid: subjects.id,
				code: subjects.code,
				name: subjects.name,
				teacher: subjects.teacher
			})
			.from(entries)
			.innerJoin(subjects, eq(entries.subjectId, subjects.id))
			.where(dayOf)
			.orderBy(asc(subjects.sortOrder), asc(entries.id)),
		db
			.select({ id: entries.id, code: subjects.code, name: subjects.name, detail: entries.homeworkDetail, due: entries.homeworkDue })
			.from(entries)
			.innerJoin(subjects, eq(entries.subjectId, subjects.id))
			.where(
				and(
					eq(entries.classId, cls.id),
					eq(entries.hidden, false),
					eq(entries.hasHomework, true),
					gte(entries.entryDate, view.startDate),
					lt(entries.entryDate, addDays(view.endDate, 1))
				)
			)
			.orderBy(asc(entries.homeworkDue), asc(entries.id)),
		db
			.select({ id: attachments.id, entryId: attachments.entryId })
			.from(attachments)
			.innerJoin(entries, eq(attachments.entryId, entries.id))
			.where(dayOf)
			.orderBy(asc(attachments.id)),
		db
			.select({ id: comments.id, entryId: comments.entryId, seatNo: comments.seatNo, body: comments.body, createdAt: comments.createdAt })
			.from(comments)
			.innerJoin(entries, eq(comments.entryId, entries.id))
			.where(and(dayOf, eq(comments.hidden, false)))
			.orderBy(asc(comments.createdAt), asc(comments.id)),
		db
			.select({ id: attachments.id, commentId: attachments.commentId })
			.from(attachments)
			.innerJoin(comments, eq(attachments.commentId, comments.id))
			.innerJoin(entries, eq(comments.entryId, entries.id))
			.where(and(dayOf, eq(comments.hidden, false)))
			.orderBy(asc(attachments.id)),
		db.select().from(subjects).where(eq(subjects.classId, cls.id)).orderBy(asc(subjects.sortOrder), asc(subjects.id))
	])) as [
		{ id: number; lesson: string; hasHomework: boolean; homeworkDetail: string | null; homeworkDue: string | null; author: string; authorStudentId: number | null; sid: number; code: string; name: string; teacher: string | null }[],
		{ id: number; code: string; name: string; detail: string | null; due: string | null }[],
		{ id: number; entryId: number }[],
		{ id: number; entryId: number; seatNo: number; body: string; createdAt: number }[],
		{ id: number; commentId: number }[],
		(typeof subjects.$inferSelect)[]
	];

	const photosByEntry = new Map<number, number[]>();
	for (const p of pics) photosByEntry.set(p.entryId, [...(photosByEntry.get(p.entryId) ?? []), p.id]);
	const photosByComment = new Map<number, number[]>();
	for (const p of cPics) photosByComment.set(p.commentId, [...(photosByComment.get(p.commentId) ?? []), p.id]);
	const commentsByEntry = new Map<number, CardView['comments']>();
	for (const c of cs) {
		const list = commentsByEntry.get(c.entryId) ?? [];
		list.push({ id: c.id, seatNo: c.seatNo, body: c.body, createdAt: c.createdAt, photos: photosByComment.get(c.id) ?? [] });
		commentsByEntry.set(c.entryId, list);
	}

	const cards: CardView[] = rows.map((r) => ({
		id: r.id,
		date,
		subject: { id: r.sid, code: r.code, name: r.name, teacher: r.teacher },
		lesson: r.lesson,
		hasHomework: r.hasHomework,
		homeworkDetail: r.homeworkDetail ?? '',
		homeworkDue: r.homeworkDue,
		author: r.author,
		canEdit: isCurrent && room.cls.active && (viewer.admin || (viewer.studentId !== null && r.authorStudentId === viewer.studentId)),
		photos: photosByEntry.get(r.id) ?? [],
		comments: commentsByEntry.get(r.id) ?? []
	}));

	const toRow = (r: (typeof hwRows)[number]): HomeworkRow => ({ id: r.id, subjectCode: r.code, subjectName: r.name, detail: r.detail ?? '', due: r.due ?? '' });
	const upcoming = isCurrent ? hwRows.filter((r) => (r.due ?? '') >= today).map(toRow) : [];
	const overdue = hwRows.filter((r) => (r.due ?? '') < today).map(toRow).reverse();

	return { view, date, cards, upcoming, overdue, subjects: subs };
}

export async function loadSubjects(db: Db, classId: number) {
	return db.select().from(subjects).where(eq(subjects.classId, classId)).orderBy(asc(subjects.sortOrder), asc(subjects.id)).all();
}

export async function findStudentByCode(db: Db, classId: number, code: string) {
	return db
		.select()
		.from(students)
		.where(and(eq(students.classId, classId), eq(students.studentCode, code.toLowerCase())))
		.get();
}

export async function countEntries(db: Db, classId: number): Promise<number> {
	const r = await db.select({ n: sql<number>`count(*)` }).from(entries).where(eq(entries.classId, classId)).get();
	return r?.n ?? 0;
}
