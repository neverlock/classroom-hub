import { fail } from '@sveltejs/kit';
import { and, eq, notInArray } from 'drizzle-orm';
import { todayInBangkok, isIsoDate } from '#lib/dates.js';
import { attachments, comments, entries, subjects } from '#lib/server/db/schema.js';
import { clampText, MAX_COMMENT_IMAGES, MAX_ENTRY_IMAGES } from '#lib/validate.js';
import { findStudentByCode, loadMain, loadSubjects } from '#lib/server/queries.js';
import { adminContext, forgetStudentAction, loginAction, logoutAction, roomContext } from '#lib/server/room.js';
import { clearFailures, isLimited, recordFailure } from '#lib/server/rate-limit.js';
import { setStudentCookie } from '#lib/server/session.js';
import { pickFiles, saveImages } from '#lib/server/uploads.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { db, room, actor, student } = await roomContext(event);
	const today = todayInBangkok();
	const main = await loadMain(
		db,
		room,
		{ term: event.url.searchParams.get('term'), date: event.url.searchParams.get('d') },
		today
	);
	const formSubjects = actor ? (await loadSubjects(db, room.cls.id)).filter((s) => s.active) : [];
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
		const { ctx, denied } = await adminContext(event);
		if (denied) return denied;
		const { db, env, room, actor } = ctx;
		const form = await event.request.formData();
		const date = String(form.get('date') ?? '');
		const subjectId = Number(form.get('subjectId'));
		const lesson = clampText(form.get('lesson'));
		const hasHomework = form.get('hasHomework') === '1';
		const detail = clampText(form.get('detail'));
		const due = String(form.get('due') ?? '');
		const keep = form.getAll('keep').map(Number).filter(Number.isInteger);
		const files = pickFiles(form, 'photos');

		const cur = room.current;
		if (!cur) return fail(400, { error: 'ยังไม่ได้ตั้งภาคเรียนปัจจุบัน ไปที่หน้าจัดการห้อง → ตั้งค่า' });
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
			authorAdminId: actor!.adminId,
			authorDisplay: actor!.display,
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
		const err = await saveImages(env, db, { classId: room.cls.id, files, entryId });
		if (err) return fail(400, { error: `${err} (บันทึกข้อความแล้ว แต่รูปไม่ถูกบันทึก)`, date });
		return { ok: true as const, date, updated: !!existing };
	},

	hideEntry: async (event) => {
		const { ctx, denied } = await adminContext(event);
		if (denied) return denied;
		const id = Number((await event.request.formData()).get('id'));
		await ctx.db
			.update(entries)
			.set({ hidden: true, hiddenBy: ctx.actor!.display, hiddenAt: Date.now() })
			.where(and(eq(entries.id, id), eq(entries.classId, ctx.room.cls.id)));
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
		const { db, env, room, c, ip } = ctx;
		if (!room.cls.active) return fail(403, { error: 'ห้องนี้ปิดอยู่ (อ่านอย่างเดียว)', entryId: null });
		const form = await event.request.formData();
		const entryId = Number(form.get('entryId'));
		const body = clampText(form.get('body'), 2000);
		const files = pickFiles(form, 'photos');
		const reply = (error: string) => fail(400, { error, entryId });

		const entry = await db
			.select()
			.from(entries)
			.where(and(eq(entries.id, entryId), eq(entries.classId, room.cls.id), eq(entries.hidden, false)))
			.get();
		if (!entry) return reply('ไม่พบการ์ดนี้');
		if (!body && files.length === 0) return reply('กรุณาเขียนข้อความหรือแนบรูป');
		if (files.length > MAX_COMMENT_IMAGES) return reply(`แนบรูปได้ไม่เกิน ${MAX_COMMENT_IMAGES} รูป`);

		let student = ctx.student;
		let remember = false;
		if (!student) {
			const code = String(form.get('code') ?? '').trim();
			const key = `code:${ip}`;
			if (await isLimited(db, key, 10)) return reply('ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่');
			const found = code ? await findStudentByCode(db, room.cls.id, code) : undefined;
			if (!found || !found.active) {
				await recordFailure(db, key);
				return reply('ไม่พบรหัสนี้ในห้อง ลองใหม่อีกครั้ง');
			}
			await clearFailures(db, key);
			student = found;
			remember = true;
		}

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
		if (remember) await setStudentCookie(c, room.cls, student.id);
		return { commented: true as const, entryId, seatNo: student.seatNo };
	}
};

