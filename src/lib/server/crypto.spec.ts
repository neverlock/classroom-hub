import { describe, expect, it } from 'vitest';
import { hashPassword, randomPassword, signToken, verifyPassword, verifyToken } from './crypto';

describe('signed tokens', () => {
	it('round-trips and rejects tampering, wrong secret and expiry', async () => {
		const t = await signToken({ aid: 3, exp: Date.now() + 60_000 }, 'secret-1');
		expect(await verifyToken<{ aid: number; exp?: number }>(t, 'secret-1')).toMatchObject({ aid: 3 });
		expect(await verifyToken(t, 'secret-2')).toBeNull();
		const [body, sig] = t.split('.');
		const forged = btoa(JSON.stringify({ aid: 99, exp: Date.now() + 60_000 })).replace(/=+$/, '');
		expect(await verifyToken(`${forged}.${sig}`, 'secret-1')).toBeNull();
		expect(await verifyToken(`${body}.`, 'secret-1')).toBeNull();
		const old = await signToken({ aid: 3, exp: Date.now() - 1 }, 'secret-1');
		expect(await verifyToken(old, 'secret-1')).toBeNull();
		expect(await verifyToken(undefined, 'secret-1')).toBeNull();
	});
});

describe('passwords', () => {
	it('verifies the right password only, including Thai and symbols', async () => {
		const pw = 'รหัส ผ่าน!@# 123';
		const h = await hashPassword(pw, 1000);
		expect(await verifyPassword(pw, h)).toBe(true);
		expect(await verifyPassword(pw + ' ', h)).toBe(false);
		expect(await verifyPassword('wrong-password', h)).toBe(false);
	});

	it('salts every hash', async () => {
		const a = await hashPassword('same-password', 1000);
		const b = await hashPassword('same-password', 1000);
		expect(a.hash).not.toBe(b.hash);
	});

	it('generates readable random passwords', () => {
		const p = randomPassword(10);
		expect(p).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{10}$/);
		expect(randomPassword(10)).not.toBe(p);
	});
});
