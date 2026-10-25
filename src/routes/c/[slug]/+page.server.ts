import { fail } from '@sveltejs/kit';
import { and, eq, notInArray } from 'drizzle-orm';
import { todayInBangkok, isIsoDate } from '#lib/dates.js';
import { attachments, comments, entries, subjects } from '#lib/server/db/schema.js';
import { lengthError, MAX_COMMENT_IMAGES, MAX_ENTRY_IMAGES, readText } from '#lib/validate.js';
import { loadMain, loadSubjects } from '#lib/server/queries.js';
import { adminContext, forgetStudentAction, identifyStudent, identifyWriter, loginAction, logoutAction, rememberStudent, roomContext } from '#lib/server/room.js';
import { pickFiles, saveImages } from '#lib/server/uploads.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { db, room, actor, student } = await roomContext(event);
	const today = todayInBangkok();
	const viewer = { admin: !!actor, studentId: student?.id ?? null };
	const [main, allSubjects] = await Promise.all([
		loadMain(db, room, { term: event.url.searchParams.get('term'), date: event.url.searchParams.get('d') }, today, viewer),
		loadSubjects(db, room.cls.id)
	]);
	const formSubjects = allSubjects.filter((s) => s.active);
	return {
		slug: room.cls.slug,
		open: room.cls.active,
		label: room.current?.classLabel ?? room.cls.slug,
		today,
		terms: room.terms.map((t) => ({
			id: t.id,
			name: t.name,
			classLabel: t.classLabel,
			startDate: t.startDate,
			endDate: t.endDate,
			isCurrent: t.id === room.current?.id
		})),
		currentTerm: room.current
			? { id: room.current.id, name: room.current.name, startDate: room.current.startDate, endDate: room.current.endDate }
			: null,
		view: main.view
			? {
					id: main.view.id,
					name: main.view.name,
					classLabel: main.view.classLabel,
					startDate: main.view.startDate,
					endDate: main.view.endDate,
					isCurrent: main.view.id === room.current?.id
				}
			: null,
		date: main.date,
		cards: main.cards,
		upcoming: main.upcoming,
		overdue: main.overdue,
		subjects: formSubjects.map((s) => ({ id: s.id, code: s.code, name: s.name })),
		actor: actor ? { display: actor.display, isSuper: actor.isSuper } : null,
		student: student ? { seatNo: student.seatNo } : null
	};
};

export const actions: Actions = {
	login: loginAction,
	logout: logoutAction,
	forgetStudent: forgetStudentAction,

	saveEntry: async (event) => {
		const ctx = await roomContext(event);
		const { db, env, room } = ctx;
		const form = await event.request.formData();
		const who = await identifyWriter(ctx, String(form.get('code') ?? ''));
		if ('error' in who) return fail(who.status, { error: who.error });
		const writer = who.writer;

		const date = String(form.get('date') ?? '');
		const subjectId = Number(form.get('subjectId'));
		const lesson = readText(form.get('lesson'));
		const hasHomework = form.get('hasHomework') === '1';
		const detail = readText(form.get('detail'));
		const due = String(form.get('due') ?? '');
		const keep = form.getAll('keep').map(Number).filter(Number.isInteger);
		const files = pickFiles(form, 'photos');

		const tooLong = lengthError([['สิ่งที่เรียน', lesson, 4000], ['โจทย์การบ้าน', detail, 4000]]);
		if (tooLong) return fail(400, { error: tooLong });
		const cur = room.current;
		if (!cur) return fail(400, { error: 'ยังไม่ได้ตั้งภาคเรียนปัจจุบัน ให้แอดมินตั้งที่หน้าจัดการห้อง → ตั้งค่า' });
		if (!isIsoDate(date) || !subjectId || !lesson) return fail(400, { error: 'กรุณากรอกวันที่ วิชา และสิ่งที่เรียน' });
		if (date < cur.startDate || date > cur.endDate) {
			return fail(400, { error: `วันที่อยู่นอก${cur.name} เลือกวันที่ในภาคเรียนปัจจุบัน` });
		}
		if (hasHomework && (!detail || !isIsoDate(due))) return fail(400, { error: 'มีการบ้าน: กรุณากรอกโจทย์และวันที่ส่ง' });
		if (hasHomework && due < date) return fail(400, { error: 'วันที่ส่งต้องไม่ก่อนวันที่เรียน' });

		const subject = await db
			.select()
			.from(subjects)
			.where(and(eq(subjects.id, subjectId), eq(subjects.classId, room.cls.id)))
			.get();
		if (!subject) return fail(400, { error: 'ไม่พบวิชานี้' });

		const existing = await db
			.select()
			.from(entries)
			.where(and(eq(entries.classId, room.cls.id), eq(entries.entryDate, date), eq(entries.subjectId, subjectId)))
			.get();
		if (!existing && !subject.active) return fail(400, { error: 'วิชานี้ถูกซ่อนอยู่ เลือกวิชาอื่น' });
		if (existing && writer.kind === 'student') {
			// students may only change their own card; anyone else's can be answered with a comment
			if (existing.hidden) return fail(400, { error: 'การ์ดวิชานี้ของวันที่เลือกถูกซ่อนโดยแอดมิน ติดต่อแอดมินห้อง' });
			if (existing.authorStudentId !== writer.studentId) {
				return fail(400, { error: `วิชานี้ของวันที่เลือกมีบันทึกอยู่แล้ว (โดย ${existing.authorDisplay}) แก้ไขได้เฉพาะผู้บันทึกหรือแอดมิน เขียนเพิ่มเป็นความคิดเห็นใต้การ์ดได้` });
			}
		}

		const keptPhotos = existing
			? (await db.select({ id: attachments.id }).from(attachments).where(eq(attachments.entryId, existing.id)).all())
					.map((r) => r.id)
					.filter((id) => keep.includes(id))
			: [];
		if (keptPhotos.length + files.length > MAX_ENTRY_IMAGES) return fail(400, { error: `แนบรูปได้ไม่เกิน ${MAX_ENTRY_IMAGES} รูป` });

		const values = {
			lesson,
			hasHomework,
			homeworkDetail: hasHomework ? detail : null,
			homeworkDue: hasHomework ? due : null,
			authorAdminId: writer.kind === 'admin' ? writer.adminId : null,
			authorStudentId: writer.kind === 'student' ? writer.studentId : null,
			authorDisplay: writer.display,
			hidden: false,
			hiddenBy: null,
			hiddenAt: null,
			updatedAt: Date.now()
		};
		let entryId: number;
		if (existing) {
			entryId = existing.id;
			await db.update(entries).set(values).where(eq(entries.id, entryId));
			const drop = await db
				.select({ id: attachments.id, key: attachments.r2Key })
				.from(attachments)
				.where(keptPhotos.length ? and(eq(attachments.entryId, entryId), notInArray(attachments.id, keptPhotos)) : eq(attachments.entryId, entryId))
				.all();
			for (const d of drop) {
				await env.IMAGES.delete(d.key);
				await db.delete(attachments).where(eq(attachments.id, d.id));
			}
		} else {
			const row = await db
				.insert(entries)
				.values({ classId: room.cls.id, entryDate: date, subjectId, ...values })
				.returning({ id: entries.id })
				.get();
			entryId = row.id;
		}
		if (writer.kind === 'student' && writer.remember) await rememberStudent(ctx, writer.studentId);
		const err = await saveImages(env, db, { classId: room.cls.id, files, entryId });
		if (err) return fail(400, { error: `${err} (บันทึกข้อความแล้ว แต่รูปไม่ถูกบันทึก)`, date });
		return { ok: true as const, date, updated: !!existing };
	},

	hideEntry: async (event) => {
		const ctx = await roomContext(event);
		if (!ctx.room.cls.active) return fail(403, { error: 'ห้องนี้ปิดอยู่ (อ่านอย่างเดียว)' });
		const id = Number((await event.request.formData()).get('id'));
		const entry = await ctx.db.select().from(entries).where(and(eq(entries.id, id), eq(entries.classId, ctx.room.cls.id))).get();
		if (!entry) return fail(404, { error: 'ไม่พบการ์ด' });
		const mine = !!ctx.student && entry.authorStudentId === ctx.student.id;
		if (!ctx.actor && !mine) return fail(403, { error: 'ซ่อนได้เฉพาะผู้บันทึกหรือแอดมิน' });
		await ctx.db
			.update(entries)
			.set({ hidden: true, hiddenBy: ctx.actor?.display ?? entry.authorDisplay, hiddenAt: Date.now() })
			.where(eq(entries.id, id));
		return { hidden: true as const };
	},

	hideComment: async (event) => {
		const { ctx, denied } = await adminContext(event);
		if (denied) return denied;
		const id = Number((await event.request.formData()).get('id'));
		const mine = await ctx.db
			.select({ id: comments.id })
			.from(comments)
			.innerJoin(entries, eq(comments.entryId, entries.id))
			.where(and(eq(comments.id, id), eq(entries.classId, ctx.room.cls.id)))
			.get();
		if (!mine) return fail(404, { error: 'ไม่พบความคิดเห็น' });
		await ctx.db.update(comments).set({ hidden: true, hiddenBy: ctx.actor!.display, hiddenAt: Date.now() }).where(eq(comments.id, id));
		return { hidden: true as const };
	},

	comment: async (event) => {
		const ctx = await roomContext(event);
		const { db, env, room } = ctx;
		if (!room.cls.active) return fail(403, { error: 'ห้องนี้ปิดอยู่ (อ่านอย่างเดียว)', entryId: null });
		const form = await event.request.formData();
		const entryId = Number(form.get('entryId'));
		const body = readText(form.get('body'));
		const files = pickFiles(form, 'photos');
		const reply = (error: string) => fail(400, { error, entryId });

		const entry = await db
			.select()
			.from(entries)
			.where(and(eq(entries.id, entryId), eq(entries.classId, room.cls.id), eq(entries.hidden, false)))
			.get();
		if (!entry) return reply('ไม่พบการ์ดนี้');
		if (!body && files.length === 0) return reply('กรุณาเขียนข้อความหรือแนบรูป');
		const bodyErr = lengthError([['ความคิดเห็น', body, 2000]]);
		if (bodyErr) return reply(bodyErr);
		if (files.length > MAX_COMMENT_IMAGES) return reply(`แนบรูปได้ไม่เกิน ${MAX_COMMENT_IMAGES} รูป`);

		const who = await identifyStudent(ctx, String(form.get('code') ?? ''));
		if ('error' in who) return reply(who.error ?? 'ไม่พบรหัสนี้ในห้อง');
		const student = who.student;

		const row = await db
			.insert(comments)
			.values({ entryId, studentId: student.id, seatNo: student.seatNo, body })
			.returning({ id: comments.id })
			.get();
		const err = await saveImages(env, db, { classId: room.cls.id, files, commentId: row.id });
		if (err) {
			await db.delete(comments).where(eq(comments.id, row.id));
			return reply(err);
		}
		if (who.remember) await rememberStudent(ctx, student.id);
		return { commented: true as const, entryId, seatNo: student.seatNo };
	}
};

