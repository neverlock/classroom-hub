import { and, asc, desc, eq, gte, inArray, lt, max, sql } from 'drizzle-orm';
import { addDays, clampDate, isIsoDate } from '#lib/dates.js';
import { attachments, classes, comments, entries, students, subjects, terms } from './db/schema';
import type { CardView, HomeworkRow } from '#lib/types.js';
import type { Db } from './env';

export type ClassRow = typeof classes.$inferSelect;
export type TermRow = typeof terms.$inferSelect;

export interface Room {
	cls: ClassRow;
	terms: TermRow[];
	/** Term the home page shows by default (set by an admin); null until the first term exists. */
	current: TermRow | null;
}

function chunk<T>(list: T[], size = 80): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
	return out;
}

export async function loadRoom(db: Db, slug: string): Promise<Room | null> {
	const cls = await db.select().from(classes).where(eq(classes.slug, slug)).get();
	if (!cls) return null;
	const list = await db.select().from(terms).where(eq(terms.classId, cls.id)).orderBy(desc(terms.startDate)).all();
	const current = list.find((t) => t.id === cls.currentTermId) ?? null;
	return { cls, terms: list, current };
}

export async function loadMain(db: Db, room: Room, params: { term?: string | null; date?: string | null }, today: string) {
	const { cls } = room;
	const termId = Number(params.term);
	const view = room.terms.find((t) => t.id === termId) ?? room.current ?? room.terms[0] ?? null;
	if (!view) return { view: null, date: today, cards: [] as CardView[], upcoming: [] as HomeworkRow[], overdue: [] as HomeworkRow[] };
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
	date = clampDate(date, view.startDate, view.endDate);

	const rows = await db
		.select({
			id: entries.id,
			lesson: entries.lesson,
			hasHomework: entries.hasHomework,
			homeworkDetail: entries.homeworkDetail,
			homeworkDue: entries.homeworkDue,
			author: entries.authorDisplay,
			sid: subjects.id,
			code: subjects.code,
			name: subjects.name,
			teacher: subjects.teacher
		})
		.from(entries)
		.innerJoin(subjects, eq(entries.subjectId, subjects.id))
		.where(and(eq(entries.classId, cls.id), eq(entries.entryDate, date), eq(entries.hidden, false)))
		.orderBy(asc(subjects.sortOrder), asc(entries.id))
		.all();

	const entryIds = rows.map((r) => r.id);
	const photosByEntry = new Map<number, number[]>();
	const commentsByEntry = new Map<number, CardView['comments']>();
	if (entryIds.length) {
		const pics = await db
			.select({ id: attachments.id, entryId: attachments.entryId })
			.from(attachments)
			.where(inArray(attachments.entryId, entryIds))
			.orderBy(asc(attachments.id))
			.all();
		for (const p of pics) photosByEntry.set(p.entryId!, [...(photosByEntry.get(p.entryId!) ?? []), p.id]);

		const cs = await db
			.select({ id: comments.id, entryId: comments.entryId, seatNo: comments.seatNo, body: comments.body, createdAt: comments.createdAt })
			.from(comments)
			.where(and(inArray(comments.entryId, entryIds), eq(comments.hidden, false)))
			.orderBy(asc(comments.createdAt), asc(comments.id))
			.all();
		const photosByComment = new Map<number, number[]>();
		for (const ids of chunk(cs.map((c) => c.id))) {
			const cp = await db
				.select({ id: attachments.id, commentId: attachments.commentId })
				.from(attachments)
				.where(inArray(attachments.commentId, ids))
				.orderBy(asc(attachments.id))
				.all();
			for (const p of cp) photosByComment.set(p.commentId!, [...(photosByComment.get(p.commentId!) ?? []), p.id]);
		}
		for (const c of cs) {
			const list = commentsByEntry.get(c.entryId) ?? [];
			list.push({ id: c.id, seatNo: c.seatNo, body: c.body, createdAt: c.createdAt, photos: photosByComment.get(c.id) ?? [] });
			commentsByEntry.set(c.entryId, list);
		}
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
		photos: photosByEntry.get(r.id) ?? [],
		comments: commentsByEntry.get(r.id) ?? []
	}));

	const hwRows = await db
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
		.orderBy(asc(entries.homeworkDue), asc(entries.id))
		.all();
	const toRow = (r: (typeof hwRows)[number]): HomeworkRow => ({ id: r.id, subjectCode: r.code, subjectName: r.name, detail: r.detail ?? '', due: r.due ?? '' });
	const upcoming = isCurrent ? hwRows.filter((r) => (r.due ?? '') >= today).map(toRow) : [];
	const overdue = hwRows.filter((r) => (r.due ?? '') < today).map(toRow).reverse();

	return { view, date, cards, upcoming, overdue };
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
