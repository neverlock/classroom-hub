import type { Cookies } from '@sveltejs/kit';
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

export type AdminTokenData = AdminToken | SuperToken;

/** Reads (and verifies the signature of) the admin cookie without touching the database. */
export async function peekAdmin(c: Pick<Ctx, 'cookies' | 'secret'>, slug: string): Promise<AdminTokenData | null> {
	const tok = await verifyToken<AdminToken | SuperToken>(c.cookies.get(adminName(slug)), c.secret);
	return tok && (tok.k === 'a' || tok.k === 's') ? tok : null;
}

/**
 * The signed-in room admin (or super admin acting in the room). `row` is the admin's database row,
 * loaded in the same batch as the room; it is re-checked every time so deactivating someone takes effect at once.
 */
export function toActor(tok: AdminTokenData | null, cls: ClassRef, row: typeof classAdmins.$inferSelect | undefined): Actor | null {
	if (!tok || tok.cid !== cls.id) return null;
	if (tok.k === 's') return { adminId: null, display: 'ผู้ดูแลระบบ', isSuper: true };
	if (!row || row.id !== tok.aid || row.classId !== cls.id || !row.active || row.sessionVersion !== tok.v) return null;
	return { adminId: row.id, display: row.display, isSuper: false };
}

export async function setStudentCookie(c: Ctx, cls: ClassRef, studentId: number) {
	const t: StudentToken = { k: 'st', sid: studentId, cid: cls.id, exp: Date.now() + STUDENT_TTL };
	c.cookies.set(studentName(cls.slug), await signToken(t, c.secret), cookieOpts(c.secure, STUDENT_TTL));
}

export function clearStudentCookie(cookies: Cookies, slug: string) {
	cookies.delete(studentName(slug), { path: '/' });
}

export async function peekStudent(c: Pick<Ctx, 'cookies' | 'secret'>, slug: string): Promise<StudentToken | null> {
	const tok = await verifyToken<StudentToken>(c.cookies.get(studentName(slug)), c.secret);
	return tok && tok.k === 'st' ? tok : null;
}

export function toStudent(tok: StudentToken | null, cls: ClassRef, row: typeof students.$inferSelect | undefined) {
	if (!tok || tok.cid !== cls.id || !row || row.id !== tok.sid || row.classId !== cls.id || !row.active) return null;
	return row;
}
