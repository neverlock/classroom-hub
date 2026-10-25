import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { classAdmins } from './db/schema';
import { hashPassword, verifyPassword } from './crypto';
import { clearFailures, isLimited, recordFailure } from './rate-limit';
import { useEnv } from './env';
import { loadRoom, type Room } from './queries';
import { clearAdminCookie, clearStudentCookie, readActor, readStudent, setAdminCookie } from './session';

type Ev = RequestEvent<{ slug: string }>;

export function iterationsFor(env: { PBKDF2_ITERATIONS?: string }): number {
	const n = Number(env.PBKDF2_ITERATIONS);
	return Number.isFinite(n) ? Math.min(100_000, Math.max(1_000, Math.floor(n))) : 20_000;
}

/** Everything a room page or action needs: bindings, the room itself and the signed-in people (if any). */
export async function roomContext(event: Ev) {
	const { env, db, secret } = useEnv(event);
	const room = await loadRoom(db, event.params.slug);
	if (!room) error(404, 'ไม่พบห้องนี้');
	const c = { db, secret, cookies: event.cookies, secure: event.url.protocol === 'https:' };
	const actor = await readActor(c, room.cls);
	const student = await readStudent(c, room.cls);
	return { env, db, secret, room, c, actor, student, ip: safeIp(event) };
}
export type RoomContext = Awaited<ReturnType<typeof roomContext>>;

function safeIp(event: Ev): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}

/** For actions that change things: the room must be open and the caller a signed-in room admin. */
export async function adminContext(event: Ev) {
	const ctx = await roomContext(event);
	if (!ctx.actor) return { ctx, denied: fail(401, { error: 'กรุณาล็อกอินแอดมินห้องก่อน' }) };
	if (!ctx.room.cls.active) return { ctx, denied: fail(403, { error: 'ห้องนี้ปิดอยู่ (อ่านอย่างเดียว)' }) };
	return { ctx, denied: null };
}

const LOGIN_LIMIT_USER = 5;
const LOGIN_LIMIT_IP = 30;

export async function loginAction(event: Ev) {
	const ctx = await roomContext(event);
	const { db, env, room, ip, c } = ctx;
	const form = await event.request.formData();
	const username = String(form.get('username') ?? '').trim().toLowerCase();
	const password = String(form.get('password') ?? '');
	if (!username || !password) return fail(400, { loginError: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
	if (!room.cls.active) return fail(403, { loginError: 'ห้องนี้ปิดอยู่ (อ่านอย่างเดียว) ล็อกอินไม่ได้' });

	const userKey = `login:${room.cls.id}:${username}`;
	const ipKey = `login-ip:${ip}`;
	if ((await isLimited(db, userKey, LOGIN_LIMIT_USER)) || (await isLimited(db, ipKey, LOGIN_LIMIT_IP))) {
		return fail(429, { loginError: 'ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่' });
	}

	const admin = await db
		.select()
		.from(classAdmins)
		.where(and(eq(classAdmins.classId, room.cls.id), eq(classAdmins.username, username)))
		.get();
	const iterations = iterationsFor(env);
	let ok = false;
	if (admin && admin.active) ok = await verifyPassword(password, { hash: admin.passwordHash, salt: admin.salt, iterations: admin.iterations });
	else await hashPassword(password, iterations); // keep timing similar when the user does not exist

	if (!ok || !admin) {
		await recordFailure(db, userKey);
		await recordFailure(db, ipKey);
		return fail(400, { loginError: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (ลืมรหัสผ่านให้ติดต่อผู้ดูแลระบบ)' });
	}
	await clearFailures(db, userKey);
	const patch: Partial<typeof classAdmins.$inferInsert> = { lastLoginAt: Date.now() };
	if (admin.iterations < iterations) {
		const h = await hashPassword(password, iterations); // upgrade old hashes to the configured cost
		Object.assign(patch, { passwordHash: h.hash, salt: h.salt, iterations: h.iterations });
	}
	await db.update(classAdmins).set(patch).where(eq(classAdmins.id, admin.id));
	await setAdminCookie(c, room.cls, admin.id, admin.sessionVersion);
	return { loggedIn: true as const };
}

export function logoutAction(event: Ev) {
	clearAdminCookie(event.cookies, event.params.slug);
	return { loggedOut: true as const };
}

export function forgetStudentAction(event: Ev) {
	clearStudentCookie(event.cookies, event.params.slug);
	return { forgotten: true as const };
}

export type { Room };
