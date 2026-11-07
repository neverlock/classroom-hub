import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';
import { gpaCourses, gpaSubjects } from '#lib/server/db/schema.js';
import { useEnv } from '#lib/server/env.js';
import { loadGpaCourse } from '#lib/server/queries.js';
import { GPA_TERMS, MAX_SUBJECTS_PER_TERM, validateGpaSubject } from '#lib/gpa.js';
import { lengthError, readText } from '#lib/validate.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { db } = useEnv(event);
	const found = await loadGpaCourse(db, event.params.slug);
	if (!found) error(404, 'ไม่พบหลักสูตรนี้');
	const t = Number(event.url.searchParams.get('t'));
	return {
		course: found.course,
		subjects: found.subjects.map((s) => ({ id: s.id, termNo: s.termNo, code: s.code, name: s.name, credit2: s.credit2 })),
		termNo: Number.isInteger(t) && t >= 0 && t < GPA_TERMS.length ? t : 0
	};
};

async function courseOf(event: Parameters<Actions[string]>[0]) {
	const { db } = useEnv(event);
	const course = await db.select().from(gpaCourses).where(eq(gpaCourses.slug, event.params.slug!)).get();
	return { db, course };
}
const termOf = (v: FormDataEntryValue | null) => {
	const n = Number(v);
	return Number.isInteger(n) && n >= 0 && n < GPA_TERMS.length ? n : null;
};

export const actions: Actions = {
	courseSave: async (event) => {
		const { db, course } = await courseOf(event);
		if (!course) return fail(404, { error: 'ไม่พบหลักสูตร' });
		const f = await event.request.formData();
		const name = readText(f.get('name'));
		const note = readText(f.get('note'));
		if (!name) return fail(400, { error: 'กรุณาตั้งชื่อหลักสูตรที่แสดง', form: 'course' });
		const err = lengthError([['ชื่อหลักสูตร', name, 60], ['ข้อความท้ายหน้า', note, 300]]);
		if (err) return fail(400, { error: err, form: 'course' });
		await db.update(gpaCourses).set({ name, note }).where(eq(gpaCourses.id, course.id));
		return { saved: 'course' as const };
	},

	subjectAdd: async (event) => {
		const { db, course } = await courseOf(event);
		if (!course) return fail(404, { error: 'ไม่พบหลักสูตร', form: 'add' });
		const f = await event.request.formData();
		const termNo = termOf(f.get('termNo'));
		if (termNo === null) return fail(400, { error: 'ไม่พบเทอมนี้', form: 'add' });
		const code = readText(f.get('code'));
		const name = readText(f.get('name'));
		const v = validateGpaSubject(code, name, String(f.get('credit') ?? ''));
		if ('error' in v) return fail(400, { error: v.error, form: 'add' });
		const cur = await db
			.select({ n: sql<number>`count(*)`, top: sql<number>`coalesce(max(${gpaSubjects.sortOrder}), 0)` })
			.from(gpaSubjects)
			.where(and(eq(gpaSubjects.courseId, course.id), eq(gpaSubjects.termNo, termNo)))
			.get();
		if ((cur?.n ?? 0) >= MAX_SUBJECTS_PER_TERM) return fail(400, { error: `เทอมหนึ่งใส่ได้ไม่เกิน ${MAX_SUBJECTS_PER_TERM} วิชา`, form: 'add' });
		await db.insert(gpaSubjects).values({ courseId: course.id, termNo, code, name, credit2: v.credit2, sortOrder: (cur?.top ?? 0) + 1 });
		return { added: name };
	},

	subjectSave: async (event) => {
		const { db, course } = await courseOf(event);
		if (!course) return fail(404, { error: 'ไม่พบหลักสูตร' });
		const f = await event.request.formData();
		const id = Number(f.get('id'));
		const code = readText(f.get('code'));
		const name = readText(f.get('name'));
		const v = validateGpaSubject(code, name, String(f.get('credit') ?? ''));
		if ('error' in v) return fail(400, { error: v.error, form: 'edit', id });
		const res = await db
			.update(gpaSubjects)
			.set({ code, name, credit2: v.credit2 })
			.where(and(eq(gpaSubjects.id, id), eq(gpaSubjects.courseId, course.id)))
			.returning({ id: gpaSubjects.id });
		if (res.length === 0) return fail(404, { error: 'ไม่พบวิชานี้', form: 'edit', id });
		return { saved: 'subject' as const };
	},

	subjectDelete: async (event) => {
		const { db, course } = await courseOf(event);
		if (!course) return fail(404, { error: 'ไม่พบหลักสูตร' });
		const id = Number((await event.request.formData()).get('id'));
		await db.delete(gpaSubjects).where(and(eq(gpaSubjects.id, id), eq(gpaSubjects.courseId, course.id)));
		return { deleted: true as const };
	},

	/** Swaps a subject with its neighbour in the same term. */
	subjectMove: async (event) => {
		const { db, course } = await courseOf(event);
		if (!course) return fail(404, { error: 'ไม่พบหลักสูตร' });
		const f = await event.request.formData();
		const id = Number(f.get('id'));
		const dir = f.get('dir') === 'up' ? -1 : 1;
		const me = await db.select().from(gpaSubjects).where(and(eq(gpaSubjects.id, id), eq(gpaSubjects.courseId, course.id))).get();
		if (!me) return fail(404, { error: 'ไม่พบวิชานี้' });
		const list = await db
			.select({ id: gpaSubjects.id })
			.from(gpaSubjects)
			.where(and(eq(gpaSubjects.courseId, course.id), eq(gpaSubjects.termNo, me.termNo)))
			.orderBy(asc(gpaSubjects.sortOrder), asc(gpaSubjects.id));
		const i = list.findIndex((r) => r.id === id);
		const j = i + dir;
		if (i < 0 || j < 0 || j >= list.length) return { moved: false as const };
		[list[i], list[j]] = [list[j], list[i]];
		// renumber the whole term so equal sort orders can never leave the swap undone
		await db.batch(list.map((r, k) => db.update(gpaSubjects).set({ sortOrder: k + 1 }).where(eq(gpaSubjects.id, r.id))) as unknown as Parameters<typeof db.batch>[0]);
		return { moved: true as const };
	},

	/** Replaces the subjects of one term with a copy of another term's. */
	termCopy: async (event) => {
		const { db, course } = await courseOf(event);
		if (!course) return fail(404, { error: 'ไม่พบหลักสูตร' });
		const f = await event.request.formData();
		const from = termOf(f.get('from'));
		const to = termOf(f.get('to'));
		if (from === null || to === null || from === to) return fail(400, { error: 'เลือกเทอมที่จะคัดลอกมา', form: 'copy' });
		const src = await db
			.select()
			.from(gpaSubjects)
			.where(and(eq(gpaSubjects.courseId, course.id), eq(gpaSubjects.termNo, from)))
			.orderBy(asc(gpaSubjects.sortOrder), asc(gpaSubjects.id));
		if (src.length === 0) return fail(400, { error: `${GPA_TERMS[from].label} ยังไม่มีวิชาให้คัดลอก`, form: 'copy' });
		const ops = [
			db.delete(gpaSubjects).where(and(eq(gpaSubjects.courseId, course.id), eq(gpaSubjects.termNo, to))),
			...src.map((s, k) => db.insert(gpaSubjects).values({ courseId: course.id, termNo: to, code: s.code, name: s.name, credit2: s.credit2, sortOrder: k + 1 }))
		];
		await db.batch(ops as unknown as Parameters<typeof db.batch>[0]);
		return { copied: GPA_TERMS[from].label, count: src.length };
	}
};
