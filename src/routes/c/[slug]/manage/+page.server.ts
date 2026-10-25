import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { classAdmins, classes, comments, entries, students, subjects, terms } from '#lib/server/db/schema.js';
import { adminContext, forgetStudentAction, loginAction, logoutAction, roomContext } from '#lib/server/room.js';
import { loadSubjects } from '#lib/server/queries.js';
import { batch } from '#lib/server/env.js';
import { lengthError, parseStudentLines, readText, suggestNextTerm, validateTerm } from '#lib/validate.js';
import { todayInBangkok } from '#lib/dates.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { db, room, actor } = await roomContext(event);
	const base = { slug: room.cls.slug, open: room.cls.active, label: room.current?.classLabel ?? room.cls.slug };
	if (!actor) return { ...base, gate: true as const };

	const tab = ['subjects', 'students', 'settings'].includes(event.url.searchParams.get('tab') ?? '')
		? (event.url.searchParams.get('tab') as 'subjects' | 'students' | 'settings')
		: 'subjects';
	// all six lists in ONE round trip to D1
	const [subjectRows, counts, studentRows, admins, hiddenEntries, hiddenCommentRows] = (await batch(db, [
		db.select().from(subjects).where(eq(subjects.classId, room.cls.id)).orderBy(asc(subjects.sortOrder), asc(subjects.id)),
		db.select({ id: entries.subjectId, n: sql<number>`count(*)` }).from(entries).where(eq(entries.classId, room.cls.id)).groupBy(entries.subjectId),
		db.select().from(students).where(eq(students.classId, room.cls.id)).orderBy(asc(students.seatNo), asc(students.id)),
		db
			.select({ id: classAdmins.id, display: classAdmins.display, username: classAdmins.username, active: classAdmins.active, lastLoginAt: classAdmins.lastLoginAt })
			.from(classAdmins)
			.where(eq(classAdmins.classId, room.cls.id))
			.orderBy(asc(classAdmins.id)),
		db
			.select({ id: entries.id, date: entries.entryDate, code: subjects.code, name: subjects.name, by: entries.hiddenBy, at: entries.hiddenAt })
			.from(entries)
			.innerJoin(subjects, eq(entries.subjectId, subjects.id))
			.where(and(eq(entries.classId, room.cls.id), eq(entries.hidden, true)))
			.orderBy(desc(entries.hiddenAt)),
		db
			.select({ id: comments.id, seat: comments.seatNo, body: comments.body, date: entries.entryDate, code: subjects.code, by: comments.hiddenBy, at: comments.hiddenAt })
			.from(comments)
			.innerJoin(entries, eq(comments.entryId, entries.id))
			.innerJoin(subjects, eq(entries.subjectId, subjects.id))
			.where(and(eq(entries.classId, room.cls.id), eq(comments.hidden, true)))
			.orderBy(desc(comments.hiddenAt))
	])) as [
		(typeof subjects.$inferSelect)[],
		{ id: number; n: number }[],
		(typeof students.$inferSelect)[],
		{ id: number; display: string; username: string; active: boolean; lastLoginAt: number | null }[],
		{ id: number; date: string; code: string; name: string; by: string | null; at: number | null }[],
		{ id: number; seat: number; body: string; date: string; code: string; by: string | null; at: number | null }[]
	];
	const countOf = new Map(counts.map((c) => [c.id, c.n]));
	const hiddenComments = hiddenCommentRows;

	const today = todayInBangkok();
	return {
		...base,
		gate: false as const,
		tab,
		today,
		actor: { display: actor.display, isSuper: actor.isSuper, adminId: actor.adminId },
		subjects: subjectRows.map((s) => ({ id: s.id, code: s.code, name: s.name, teacher: s.teacher ?? '', active: s.active, n: countOf.get(s.id) ?? 0 })),
		students: studentRows.map((s) => ({ id: s.id, seatNo: s.seatNo, studentCode: s.studentCode, active: s.active })),
		terms: room.terms.map((t) => ({ id: t.id, name: t.name, classLabel: t.classLabel, startDate: t.startDate, endDate: t.endDate, isCurrent: t.id === room.current?.id })),
		suggested: { ...suggestNextTerm(room.terms, today), classLabel: room.current?.classLabel ?? '' },
		admins,
		hiddenEntries,
		hiddenComments: hiddenComments.map((c) => ({ ...c, body: c.body.slice(0, 80) }))
	};
};

const num = (v: FormDataEntryValue | null) => Number(v);
const ok = <T extends object>(data: T) => data;

export const actions: Actions = {
	login: loginAction,
	logout: logoutAction,
	forgetStudent: forgetStudentAction,

	// ---------- subjects ----------
	subjectAdd: async (event) => {
		const { ctx, denied } = await adminContext(event);
		if (denied) return denied;
		const f = await event.request.formData();
		const code = readText(f.get('code'));
		const name = readText(f.get('name'));
		const teacher = readText(f.get('teacher'));
		if (!code || !name) return fail(400, { error: 'กรุณากรอกรหัสวิชาและชื่อวิชา' });
		const tooLong = lengthError([['รหัสวิชา', code, 20], ['ชื่อวิชา', name, 100], ['ผู้สอน', teacher, 60]]);
		if (tooLong) return fail(400, { error: tooLong });
		const list = await loadSubjects(ctx.db, ctx.room.cls.id);
		if (list.some((s) => s.code.toLowerCase() === code.toLowerCase())) return fail(400, { error: `มีรหัสวิชา ${code} อยู่แล้ว` });
		const next = list.reduce((m, s) => Math.max(m, s.sortOrder), 0) + 1;
		await ctx.db.insert(subjects).values({ classId: ctx.room.cls.id, code, name, teacher: teacher || null, sortOrder: next });
		return ok({ added: code });
	},

	subjectSave: async (event) => {
		const { ctx, denied } = await adminContext(event);
		if (denied) return denied;
		const f = await event.request.formData();
		const id = num(f.get('id'));
		const code = readText(f.get('code'));
		const name = readText(f.get('name'));
		const teacher = readText(f.get('teacher'));
		if (!code || !name) return fail(400, { error: 'กรุณากรอกรหัสวิชาและชื่อวิชา' });
		const tooLong = lengthError([['รหัสวิชา', code, 20], ['ชื่อวิชา', name, 100], ['ผู้สอน', teacher, 60]]);
		if (tooLong) return fail(400, { error: tooLong });
		const list = await loadSubjects(ctx.db, ctx.room.cls.id);
		if (!list.some((s) => s.id === id)) return fail(404, { error: 'ไม่พบวิชานี้' });
		if (list.some((s) => s.id !== id && s.code.toLowerCase() === code.toLowerCase())) return fail(400, { error: `มีรหัสวิชา ${code} อยู่แล้ว` });
		await ctx.db.update(subjects).set({ code, name, teacher: teacher || null }).where(eq(subjects.id, id));
		return ok({ saved: true });
	},

	subjectMove: async (event) => {
		const { ctx, denied } = await adminContext(event);
		if (denied) return denied;
		const f = await event.request.formData();
		const id = num(f.get('id'));
		const dir = f.get('dir') === 'up' ? -1 : 1;
		const list = await loadSubjects(ctx.db, ctx.room.cls.id);
		const i = list.findIndex((s) => s.id === id);
		const j = i + dir;
		if (i < 0 || j < 0 || j >= list.length) return ok({ moved: false });
		[list[i], list[j]] = [list[j], list[i]];
		for (const [n, s] of list.entries()) await ctx.db.update(subjects).set({ sortOrder: n + 1 }).where(eq(subjects.id, s.id));
		return ok({ moved: true });
	},

	subjectToggle: async (event) => {
		const { ctx, denied } = await adminContext(event);
		if (denied) return denied;
		const id = num((await event.request.formData()).get('id'));
		const s = await ctx.db.select().from(subjects).where(and(eq(subjects.id, id), eq(subjects.classId, ctx.room.cls.id))).get();
		if (!s) return fail(404, { error: 'ไม่พบวิชานี้' });
		await ctx.db.update(subjects).set({ active: !s.active }).where(eq(subjects.id, id));
		return ok({ active: !s.active });
	},

	subjectDelete: async (event) => {
		const { ctx, denied } = await adminContext(event);
		if (denied) return denied;
		const id = num((await event.request.formData()).get('id'));
		const used = await ctx.db.select({ n: sql<number>`count(*)` }).from(entries).where(eq(entries.subjectId, id)).get();
		if ((used?.n ?? 0) > 0) return fail(400, { error: 'ลบไม่ได้ เพราะมีบันทึกของวิชานี้แล้ว ให้ซ่อนแทน' });
		await ctx.db.delete(subjects).where(and(eq(subjects.id, id), eq(subjects.classId, ctx.room.cls.id)));
		return ok({ deleted: true });
	},

	// ---------- students ----------
	studentAdd: async (event) => {
		const { ctx, denied } = await adminContext(event);
		if (denied) return denied;
		const text = String((await event.request.formData()).get('bulk') ?? '');
		const existing = await ctx.db.select().from(students).where(eq(students.classId, ctx.room.cls.id)).all();
		const parsed = parseStudentLines(text, existing.map((s) => ({ id: s.id, seatNo: s.seatNo, studentCode: s.studentCode, active: s.active })));
		const good = parsed.filter((p) => !p.error);
		if (good.length === 0) return fail(400, { error: 'ไม่มีบรรทัดที่ถูกต้องให้เพิ่ม' });
		for (const p of good) {
			await ctx.db.insert(students).values({ classId: ctx.room.cls.id, studentCode: p.studentCode!.toLowerCase(), seatNo: p.seatNo! });
		}
		return ok({ added: good.length, skipped: parsed.length - good.length });
	},

	studentSave: async (event) => {
		const { ctx, denied } = await adminContext(event);
		if (denied) return denied;
		const f = await event.request.formData();
		const id = num(f.get('id'));
		const existing = await ctx.db.select().from(students).where(eq(students.classId, ctx.room.cls.id)).all();
		if (!existing.some((s) => s.id === id)) return fail(404, { error: 'ไม่พบนักเรียน' });
		const r = parseStudentLines(`${String(f.get('seat') ?? '').trim()} ${String(f.get('code') ?? '').trim()}`, existing.map((s) => ({ id: s.id, seatNo: s.seatNo, studentCode: s.studentCode, active: s.active })), id)[0];
		if (!r || r.error) return fail(400, { error: r?.error ?? 'รูปแบบไม่ถูก' });
		await ctx.db.update(students).set({ seatNo: r.seatNo!, studentCode: r.studentCode!.toLowerCase() }).where(eq(students.id, id));
		return ok({ saved: true });
	},

	studentToggle: async (event) => {
		const { ctx, denied } = await adminContext(event);
		if (denied) return denied;
		const id = num((await event.request.formData()).get('id'));
		const all = await ctx.db.select().from(students).where(eq(students.classId, ctx.room.cls.id)).all();
		const s = all.find((x) => x.id === id);
		if (!s) return fail(404, { error: 'ไม่พบนักเรียน' });
		if (!s.active) {
			const clash = all.find((x) => x.id !== id && x.active && x.seatNo === s.seatNo);
			if (clash) return fail(400, { error: `แสดงไม่ได้: เลขที่ ${s.seatNo} ถูกใช้แล้ว แก้เลขที่ก่อน` });
		}
		await ctx.db.update(students).set({ active: !s.active }).where(eq(students.id, id));
		return ok({ seat: s.seatNo, active: !s.active });
	},

	// ---------- terms ----------
	termCreate: async (event) => {
		const { ctx, denied } = await adminContext(event);
		if (denied) return denied;
		const f = await event.request.formData();
		const input = { name: readText(f.get('name')), classLabel: readText(f.get('label')), startDate: String(f.get('start') ?? ''), endDate: String(f.get('end') ?? '') };
		const err = validateTerm(input, ctx.room.terms);
		if (err) return fail(400, { error: err });
		const row = await ctx.db.insert(terms).values({ classId: ctx.room.cls.id, ...input }).returning({ id: terms.id }).get();
		const makeCurrent = f.get('makeCurrent') === 'on' || !ctx.room.current;
		if (makeCurrent) await ctx.db.update(classes).set({ currentTermId: row.id }).where(eq(classes.id, ctx.room.cls.id));
		return ok({ created: input.name, current: makeCurrent });
	},

	termSave: async (event) => {
		const { ctx, denied } = await adminContext(event);
		if (denied) return denied;
		const f = await event.request.formData();
		const id = num(f.get('id'));
		const input = { id, name: readText(f.get('name')), classLabel: readText(f.get('label')), startDate: String(f.get('start') ?? ''), endDate: String(f.get('end') ?? '') };
		if (!ctx.room.terms.some((t) => t.id === id)) return fail(404, { error: 'ไม่พบภาคเรียน' });
		const err = validateTerm(input, ctx.room.terms);
		if (err) return fail(400, { error: err });
		await ctx.db.update(terms).set({ name: input.name, classLabel: input.classLabel, startDate: input.startDate, endDate: input.endDate }).where(eq(terms.id, id));
		return ok({ saved: true });
	},

	termSetCurrent: async (event) => {
		const { ctx, denied } = await adminContext(event);
		if (denied) return denied;
		const id = num((await event.request.formData()).get('id'));
		const t = ctx.room.terms.find((x) => x.id === id);
		if (!t) return fail(404, { error: 'ไม่พบภาคเรียน' });
		await ctx.db.update(classes).set({ currentTermId: id }).where(eq(classes.id, ctx.room.cls.id));
		return ok({ current: t.name });
	},

	// ---------- hidden items ----------
	restoreEntry: async (event) => {
		const { ctx, denied } = await adminContext(event);
		if (denied) return denied;
		const id = num((await event.request.formData()).get('id'));
		await ctx.db.update(entries).set({ hidden: false, hiddenBy: null, hiddenAt: null }).where(and(eq(entries.id, id), eq(entries.classId, ctx.room.cls.id)));
		return ok({ restored: true });
	},

	restoreComment: async (event) => {
		const { ctx, denied } = await adminContext(event);
		if (denied) return denied;
		const id = num((await event.request.formData()).get('id'));
		const mine = await ctx.db.select({ id: comments.id }).from(comments).innerJoin(entries, eq(comments.entryId, entries.id)).where(and(eq(comments.id, id), eq(entries.classId, ctx.room.cls.id))).get();
		if (!mine) return fail(404, { error: 'ไม่พบความคิดเห็น' });
		await ctx.db.update(comments).set({ hidden: false, hiddenBy: null, hiddenAt: null }).where(eq(comments.id, id));
		return ok({ restored: true });
	}
};
