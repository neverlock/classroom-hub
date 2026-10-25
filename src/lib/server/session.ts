import type { Cookies } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { classAdmins, students } from './db/schema';
import { signToken, verifyToken } from './crypto';
import type { Db } from './env';

const DAY = 86_400_000;
const ADMIN_TTL = 90 * DAY;
const SUPER_TTL = 12 * 3_600_000;
const STUDENT_TTL = 180 * DAY;

export interface Actor {
	/** null for a super admin working inside the room */
	adminId: number | null;
	display: string;
	isSuper: boolean;
}

type AdminToken = { k: 'a'; aid: number; cid: number; v: number; exp: number };
type SuperToken = { k: 's'; cid: number; exp: number };
type StudentToken = { k: 'st'; sid: number; cid: number; exp: number };

const adminName = (slug: string) => `ca_${slug}`;
const studentName = (slug: string) => `st_${slug}`;

function cookieOpts(secure: boolean, maxAgeMs: number) {
	return { path: '/', httpOnly: true, secure, sameSite: 'lax' as const, maxAge: Math.floor(maxAgeMs / 1000) };
}

interface Ctx {
	db: Db;
	secret: string;
	cookies: Cookies;
	secure: boolean;
}
interface ClassRef {
	id: number;
	slug: string;
}

export async function setAdminCookie(c: Ctx, cls: ClassRef, adminId: number, version: number) {
	const t: AdminToken = { k: 'a', aid: adminId, cid: cls.id, v: version, exp: Date.now() + ADMIN_TTL };
	c.cookies.set(adminName(cls.slug), await signToken(t, c.secret), cookieOpts(c.secure, ADMIN_TTL));
}

/** A super admin who entered a room from /admin. */
export async function setSuperCookie(c: Ctx, cls: ClassRef) {
	const t: SuperToken = { k: 's', cid: cls.id, exp: Date.now() + SUPER_TTL };
	c.cookies.set(adminName(cls.slug), await signToken(t, c.secret), cookieOpts(c.secure, SUPER_TTL));
}

export function clearAdminCookie(cookies: Cookies, slug: string) {
	cookies.delete(adminName(slug), { path: '/' });
}

/** The signed-in room admin (or super admin acting in the room), re-checked against the database every time. */
export async function readActor(c: Ctx, cls: ClassRef): Promise<Actor | null> {
	const raw = c.cookies.get(adminName(cls.slug));
	const tok = await verifyToken<AdminToken | SuperToken>(raw, c.secret);
	if (!tok || tok.cid !== cls.id) return null;
	if (tok.k === 's') return { adminId: null, display: 'ผู้ดูแลระบบ', isSuper: true };
	if (tok.k !== 'a') return null;
	const a = await c.db
		.select()
		.from(classAdmins)
		.where(and(eq(classAdmins.id, tok.aid), eq(classAdmins.classId, cls.id)))
		.get();
	if (!a || !a.active || a.sessionVersion !== tok.v) return null;
	return { adminId: a.id, display: a.display, isSuper: false };
}

export async function setStudentCookie(c: Ctx, cls: ClassRef, studentId: number) {
	const t: StudentToken = { k: 'st', sid: studentId, cid: cls.id, exp: Date.now() + STUDENT_TTL };
	c.cookies.set(studentName(cls.slug), await signToken(t, c.secret), cookieOpts(c.secure, STUDENT_TTL));
}

export function clearStudentCookie(cookies: Cookies, slug: string) {
	cookies.delete(studentName(slug), { path: '/' });
}

export async function readStudent(c: Ctx, cls: ClassRef) {
	const tok = await verifyToken<StudentToken>(c.cookies.get(studentName(cls.slug)), c.secret);
	if (!tok || tok.k !== 'st' || tok.cid !== cls.id) return null;
	const s = await c.db
		.select()
		.from(students)
		.where(and(eq(students.id, tok.sid), eq(students.classId, cls.id)))
		.get();
	return s && s.active ? s : null;
}
