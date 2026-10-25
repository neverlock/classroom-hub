import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';
import { attachments, classAdmins, classes, entries, students, subjects, terms } from '#lib/server/db/schema.js';
import { hashPassword } from '#lib/server/crypto.js';
import { useEnv } from '#lib/server/env.js';
import { iterationsFor } from '#lib/server/room.js';
import { setSuperCookie } from '#lib/server/session.js';
import { addDays, todayInBangkok } from '#lib/dates.js';
import { readText, validateAdminInput, validatePassword, validateSlug, validateTerm } from '#lib/validate.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { db } = useEnv(event);
	const rooms = await db
		.select({ id: classes.id, slug: classes.slug, active: classes.active, label: terms.classLabel, term: terms.name })
		.from(classes)
		.leftJoin(terms, eq(classes.currentTermId, terms.id))
		.orderBy(asc(classes.id))
		.all();
	const count = async (table: typeof entries | typeof students) =>
		new Map(
			(await db.select({ id: table.classId, n: sql<number>`count(*)` }).from(table).groupBy(table.classId).all()).map((r) => [r.id, r.n])
		);
	const entryCount = await count(entries);
	const studentCount = await count(students);
	const admins = await db
		.select({ id: classAdmins.id, classId: classAdmins.classId, display: classAdmins.display, username: classAdmins.username, active: classAdmins.active })
		.from(classAdmins)
		.orderBy(asc(classAdmins.id))
		.all();
	const posts = new Map(
		(await db.select({ id: entries.authorAdminId, n: sql<number>`count(*)` }).from(entries).groupBy(entries.authorAdminId).all()).map((r) => [r.id, r.n])
	);
	const bytes = (await db.select({ n: sql<number>`coalesce(sum(${attachments.size}), 0)` }).from(attachments).get())?.n ?? 0;
	const today = todayInBangkok();
	return {
		email: event.locals.superAdmin ?? '',
		usedBytes: bytes,
		freeBytes: 10 * 1024 ** 3,
		today,
		defaults: { start: today, end: addDays(today, 120) },
		rooms: rooms.map((r) => ({
			id: r.id,
			slug: r.slug,
			active: r.active,
			label: r.label ?? r.slug,
			term: r.term,
			students: studentCount.get(r.id) ?? 0,
			entries: entryCount.get(r.id) ?? 0,
			admins: admins
				.filter((a) => a.classId === r.id)
				.map((a) => ({ id: a.id, display: a.display, username: a.username, active: a.active, posts: posts.get(a.id) ?? 0 }))
		}))
	};
};

const num = (v: FormDataEntryValue | null) => Number(v);

export const actions: Actions = {
	createRoom: async (event) => {
		const { db, env } = useEnv(event);
		const f = await event.request.formData();
		const slug = String(f.get('slug') ?? '').trim().toLowerCase();
		const term = { name: readText(f.get('term')), classLabel: readText(f.get('label')), startDate: String(f.get('start') ?? ''), endDate: String(f.get('end') ?? '') };
		const display = readText(f.get('display'));
		const username = String(f.get('username') ?? '').trim().toLowerCase();
		const password = String(f.get('password') ?? '');
		const err = validateSlug(slug) ?? validateTerm(term, []) ?? validateAdminInput(display, username, password);
		if (err) return fail(400, { error: err });
		if (await db.select({ id: classes.id }).from(classes).where(eq(classes.slug, slug)).get()) return fail(400, { error: `ชื่อลิงก์ /c/${slug} ถูกใช้แล้ว` });

		const room = await db.insert(classes).values({ slug }).returning({ id: classes.id }).get();
		const t = await db.insert(terms).values({ classId: room.id, ...term }).returning({ id: terms.id }).get();
		await db.update(classes).set({ currentTermId: t.id }).where(eq(classes.id, room.id));
		const h = await hashPassword(password, iterationsFor(env));
		await db.insert(classAdmins).values({ classId: room.id, display, username, passwordHash: h.hash, salt: h.salt, iterations: h.iterations });
		return { reveal: { roomId: room.id, slug, display, username, password }, created: term.classLabel };
	},

	toggleRoom: async (event) => {
		const { db } = useEnv(event);
		const id = num((await event.request.formData()).get('id'));
		const r = await db.select().from(classes).where(eq(classes.id, id)).get();
		if (!r) return fail(404, { error: 'ไม่พบห้อง' });
		await db.update(classes).set({ active: !r.active }).where(eq(classes.id, id));
		return { active: !r.active };
	},

	deleteRoom: async (event) => {
		const { db } = useEnv(event);
		const id = num((await event.request.formData()).get('id'));
		const used = await db.select({ n: sql<number>`count(*)` }).from(entries).where(eq(entries.classId, id)).get();
		if ((used?.n ?? 0) > 0) return fail(400, { error: 'ลบไม่ได้ เพราะห้องนี้มีข้อมูลแล้ว ให้ปิดห้องแทน' });
		await db.update(classes).set({ currentTermId: null }).where(eq(classes.id, id));
		await db.delete(classAdmins).where(eq(classAdmins.classId, id));
		await db.delete(subjects).where(eq(subjects.classId, id));
		await db.delete(students).where(eq(students.classId, id));
		await db.delete(terms).where(eq(terms.classId, id));
		await db.delete(classes).where(eq(classes.id, id));
		return { deleted: true };
	},

	addAdmin: async (event) => {
		const { db, env } = useEnv(event);
		const f = await event.request.formData();
		const roomId = num(f.get('roomId'));
		const display = readText(f.get('display'));
		const username = String(f.get('username') ?? '').trim().toLowerCase();
		const password = String(f.get('password') ?? '');
		const room = await db.select().from(classes).where(eq(classes.id, roomId)).get();
		if (!room) return fail(404, { error: 'ไม่พบห้อง', roomId });
		const err = validateAdminInput(display, username, password);
		if (err) return fail(400, { error: err, roomId });
		if (await db.select({ id: classAdmins.id }).from(classAdmins).where(and(eq(classAdmins.classId, roomId), eq(classAdmins.username, username))).get()) {
			return fail(400, { error: `ชื่อผู้ใช้ @${username} ถูกใช้แล้วในห้องนี้`, roomId });
		}
		const h = await hashPassword(password, iterationsFor(env));
		await db.insert(classAdmins).values({ classId: roomId, display, username, passwordHash: h.hash, salt: h.salt, iterations: h.iterations });
		return { reveal: { roomId, slug: room.slug, display, username, password } };
	},

	resetAdmin: async (event) => {
		const { db, env } = useEnv(event);
		const f = await event.request.formData();
		const id = num(f.get('id'));
		const password = String(f.get('password') ?? '');
		const a = await db.select().from(classAdmins).where(eq(classAdmins.id, id)).get();
		if (!a) return fail(404, { error: 'ไม่พบแอดมิน' });
		const err = validatePassword(password);
		if (err) return fail(400, { error: err, adminId: id });
		const h = await hashPassword(password, iterationsFor(env));
		await db.update(classAdmins).set({ passwordHash: h.hash, salt: h.salt, iterations: h.iterations, sessionVersion: a.sessionVersion + 1 }).where(eq(classAdmins.id, id));
		const room = await db.select().from(classes).where(eq(classes.id, a.classId)).get();
		return { reveal: { roomId: a.classId, slug: room?.slug ?? '', display: a.display, username: a.username, password }, reset: a.display };
	},

	toggleAdmin: async (event) => {
		const { db } = useEnv(event);
		const id = num((await event.request.formData()).get('id'));
		const a = await db.select().from(classAdmins).where(eq(classAdmins.id, id)).get();
		if (!a) return fail(404, { error: 'ไม่พบแอดมิน' });
		await db.update(classAdmins).set({ active: !a.active, sessionVersion: a.sessionVersion + 1 }).where(eq(classAdmins.id, id));
		return { toggled: a.display, active: !a.active };
	},

	deleteAdmin: async (event) => {
		const { db } = useEnv(event);
		const id = num((await event.request.formData()).get('id'));
		const used = await db.select({ n: sql<number>`count(*)` }).from(entries).where(eq(entries.authorAdminId, id)).get();
		if ((used?.n ?? 0) > 0) return fail(400, { error: 'ลบไม่ได้ เพราะแอดมินคนนี้เคยบันทึกข้อมูลแล้ว ให้ปิดใช้งานแทน' });
		await db.delete(classAdmins).where(eq(classAdmins.id, id));
		return { deleted: true };
	},

	/** Opens a room's manage page as super admin without a room login. */
	enterRoom: async (event) => {
		const { db, secret } = useEnv(event);
		const id = num((await event.request.formData()).get('id'));
		const room = await db.select().from(classes).where(eq(classes.id, id)).get();
		if (!room) return fail(404, { error: 'ไม่พบห้อง' });
		await setSuperCookie({ db, secret, cookies: event.cookies, secure: event.url.protocol === 'https:' }, room);
		redirect(303, `/c/${room.slug}/manage`);
	}
};
