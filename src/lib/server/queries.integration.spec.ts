import { readdirSync, readFileSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from './db';
import { attachments, classAdmins, classes, comments, entries, students, subjects, terms } from './db/schema';
import { loadAdminOverview, loadMain, loadManageData, loadRoomBundle } from './queries';

/**
 * Runs the real queries against a real (in-memory) D1 from wrangler's local runtime.
 * Ids are made deliberately different (subject 1 != entry 3 != comment 1 ...) so that a query which
 * returns the wrong column, or shifts columns, cannot pass by luck.
 */
let proxy: Awaited<ReturnType<typeof getPlatformProxy>>;
let db: ReturnType<typeof getDb>;

beforeAll(async () => {
	proxy = await getPlatformProxy({ persist: false });
	const d1 = (proxy.env as unknown as { DB: D1Database }).DB;
	for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) {
		for (const stmt of readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint')) {
			const sql = stmt.replace(/\s+/g, ' ').trim();
			if (sql) await d1.prepare(sql).run();
		}
	}
	db = getDb(d1);
}, 60_000);

afterAll(async () => {
	await proxy?.dispose();
});

describe('loadMain / loadRoomBundle against D1', () => {
	it('returns the right ids, subject fields, photos and comments for every card', async () => {
		const cls = await db.insert(classes).values({ slug: 'p5-1' }).returning().get();
		const term = await db.insert(terms).values({ classId: cls.id, name: 'ภาคเรียนที่ 2/2026', classLabel: 'ป.5/1', startDate: '2026-08-01', endDate: '2027-03-31' }).returning().get();
		await db.update(classes).set({ currentTermId: term.id }).where(eq(classes.id, cls.id));
		const [eng, thai, math] = [
			await db.insert(subjects).values({ classId: cls.id, code: 'อ21103', name: 'ภาษาอังกฤษเข้ม', teacher: 'Mr. Jayson', sortOrder: 1 }).returning().get(),
			await db.insert(subjects).values({ classId: cls.id, code: 'ท21101', name: 'ภาษาไทย', teacher: 'ครูสุพิชชา', sortOrder: 2 }).returning().get(),
			await db.insert(subjects).values({ classId: cls.id, code: 'ค21103', name: 'คณิตศาสตร์ 1', teacher: null, sortOrder: 3 }).returning().get()
		];
		const stu = await db.insert(students).values({ classId: cls.id, studentCode: '10121', seatNo: 21 }).returning().get();
		// other days first, so the entry ids of the day under test (4, 5) differ from the subject ids (1, 2)
		for (const d of ['2026-10-20', '2026-10-21', '2026-10-22']) {
			await db.insert(entries).values({ classId: cls.id, entryDate: d, subjectId: math.id, lesson: 'เก่า', authorDisplay: 'x' });
		}
		const day = '2026-10-27';
		const e1 = await db.insert(entries).values({ classId: cls.id, entryDate: day, subjectId: eng.id, lesson: 'บทเรียน', authorDisplay: 'เลขที่ 21', authorStudentId: stu.id }).returning().get();
		const e2 = await db
			.insert(entries)
			.values({ classId: cls.id, entryDate: day, subjectId: thai.id, lesson: 'มีการบ้าน', hasHomework: true, homeworkDetail: 'หน้า 12', homeworkDue: '2026-11-04', authorDisplay: 'แม่น้องมาย' })
			.returning()
			.get();
		const photo = await db.insert(attachments).values({ classId: cls.id, entryId: e1.id, r2Key: 'k1', contentType: 'image/webp', size: 10 }).returning().get();
		const c1 = await db.insert(comments).values({ entryId: e1.id, studentId: stu.id, seatNo: 21, body: 'ความคิดเห็น 1' }).returning().get();
		const c2 = await db.insert(comments).values({ entryId: e1.id, studentId: stu.id, seatNo: 21, body: 'ความคิดเห็น 2' }).returning().get();
		const cPhoto = await db.insert(attachments).values({ classId: cls.id, commentId: c2.id, r2Key: 'k2', contentType: 'image/webp', size: 20 }).returning().get();
		await db.insert(comments).values({ entryId: e1.id, studentId: stu.id, seatNo: 21, body: 'ซ่อน', hidden: true });

		const bundle = await loadRoomBundle(db, 'p5-1', null, stu.id);
		expect(bundle?.room.current?.id).toBe(term.id);
		expect(bundle?.studentRow?.seatNo).toBe(21);

		const main = await loadMain(db, bundle!.room, { date: day }, '2026-10-25', { admin: false, studentId: stu.id });
		expect(main.cards).toHaveLength(2);
		expect(main.cards[0]).toMatchObject({
			id: e1.id,
			subject: { id: eng.id, code: 'อ21103', name: 'ภาษาอังกฤษเข้ม', teacher: 'Mr. Jayson' },
			lesson: 'บทเรียน',
			author: 'เลขที่ 21',
			canEdit: true,
			photos: [photo.id]
		});
		expect(main.cards[0].comments.map((c) => [c.id, c.seatNo, c.body, c.photos])).toEqual([
			[c1.id, 21, 'ความคิดเห็น 1', []],
			[c2.id, 21, 'ความคิดเห็น 2', [cPhoto.id]]
		]);
		expect(main.cards[1]).toMatchObject({
			id: e2.id,
			subject: { id: thai.id, code: 'ท21101', name: 'ภาษาไทย', teacher: 'ครูสุพิชชา' },
			hasHomework: true,
			homeworkDetail: 'หน้า 12',
			homeworkDue: '2026-11-04',
			canEdit: false,
			photos: [],
			comments: []
		});
		expect(main.upcoming.map((r) => [r.id, r.subjectCode, r.subjectName, r.due])).toEqual([[e2.id, 'ท21101', 'ภาษาไทย', '2026-11-04']]);
		expect(main.subjects.map((s) => s.code)).toEqual(['อ21103', 'ท21101', 'ค21103']);
	}, 60_000);
});


describe('manage page and /admin overview queries against D1', () => {
	it('returns hidden items with the right ids, counts and names', async () => {
		const cls = await db.insert(classes).values({ slug: 'm1-3' }).returning().get();
		const s0 = await db.insert(subjects).values({ classId: cls.id, code: 'ก1', name: 'เก่า', sortOrder: 1 }).returning().get();
		const s1 = await db.insert(subjects).values({ classId: cls.id, code: 'ว21103', name: 'วิทยาศาสตร์ 1', teacher: 'ครูต้น', sortOrder: 2 }).returning().get();
		const st = await db.insert(students).values({ classId: cls.id, studentCode: '20101', seatNo: 7 }).returning().get();
		const adm = await db.insert(classAdmins).values({ classId: cls.id, display: 'แม่น้องมาย', username: 'mai', passwordHash: 'h', salt: 's', iterations: 1000 }).returning().get();
		// an entry whose id (>= 5 because of the entries above) differs from every subject id
		const hiddenEntry = await db
			.insert(entries)
			.values({ classId: cls.id, entryDate: '2026-10-27', subjectId: s1.id, lesson: 'ซ่อน', authorDisplay: 'แม่น้องมาย', authorAdminId: adm.id, hidden: true, hiddenBy: 'แม่น้องมาย', hiddenAt: 1000 })
			.returning()
			.get();
		const c1 = await db.insert(comments).values({ entryId: hiddenEntry.id, studentId: st.id, seatNo: 7, body: 'ใต้การ์ดที่ซ่อน' }).returning().get();
		await db.insert(attachments).values({ classId: cls.id, entryId: hiddenEntry.id, r2Key: 'a', contentType: 'image/webp', size: 5 });
		await db.insert(attachments).values({ classId: cls.id, commentId: c1.id, r2Key: 'b', contentType: 'image/webp', size: 7 });
		const visible = await db.insert(entries).values({ classId: cls.id, entryDate: '2026-10-28', subjectId: s0.id, lesson: 'เห็น', authorDisplay: 'x' }).returning().get();
		const hiddenComment = await db
			.insert(comments)
			.values({ entryId: visible.id, studentId: st.id, seatNo: 7, body: 'ความคิดเห็นที่ซ่อน', hidden: true, hiddenBy: 'ครูต้น', hiddenAt: 2000 })
			.returning()
			.get();
		await db.insert(attachments).values({ classId: cls.id, commentId: hiddenComment.id, r2Key: 'c', contentType: 'image/webp', size: 9 });

		const m = await loadManageData(db, cls.id);
		expect(m.subjectRows.map((x) => [x.id, x.code, x.name, x.teacher])).toEqual([
			[s0.id, 'ก1', 'เก่า', null],
			[s1.id, 'ว21103', 'วิทยาศาสตร์ 1', 'ครูต้น']
		]);
		expect(m.counts.map((x) => [x.id, x.n]).sort()).toEqual([[s0.id, 1], [s1.id, 1]].sort());
		expect(m.studentRows.map((x) => [x.id, x.seatNo, x.studentCode])).toEqual([[st.id, 7, '20101']]);
		expect(m.admins).toEqual([{ id: adm.id, display: 'แม่น้องมาย', username: 'mai', active: true, lastLoginAt: null }]);
		expect(m.hiddenEntries).toEqual([
			{ id: hiddenEntry.id, date: '2026-10-27', code: 'ว21103', name: 'วิทยาศาสตร์ 1', by: 'แม่น้องมาย', at: 1000, comments: 1, photos: 2 }
		]);
		expect(m.hiddenComments).toEqual([
			{ id: hiddenComment.id, seat: 7, body: 'ความคิดเห็นที่ซ่อน', date: '2026-10-28', code: 'ก1', by: 'ครูต้น', at: 2000, photos: 1 }
		]);

		const o = await loadAdminOverview(db);
		const room = o.rooms.find((r) => r.slug === 'm1-3');
		expect(room).toMatchObject({ id: cls.id, active: true, label: null, term: null });
		expect(o.entryRows.find((r) => r.id === cls.id)?.n).toBe(2);
		expect(o.studentRows.find((r) => r.id === cls.id)?.n).toBe(1);
		expect(o.admins.find((a) => a.classId === cls.id)).toMatchObject({ id: adm.id, display: 'แม่น้องมาย', username: 'mai', active: true });
		expect(o.postRows.find((r) => r.id === adm.id)?.n).toBe(1);
		expect(o.byteRows[0].n).toBeGreaterThanOrEqual(5 + 7 + 9);
	}, 60_000);
});
