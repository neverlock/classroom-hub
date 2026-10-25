/** Web Crypto helpers (work on Workers and in Node 22). */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64Url(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64Url(s: string): Uint8Array {
	const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
	const out = new Uint8Array(b.length);
	for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
	return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign',
		'verify'
	]);
}

/** `base64url(json).base64url(hmac)`; `exp` (unix ms) is added by the caller inside the payload. */
export async function signToken(payload: object, secret: string): Promise<string> {
	const body = toB64Url(enc.encode(JSON.stringify(payload)));
	const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
	return `${body}.${toB64Url(new Uint8Array(sig))}`;
}

export async function verifyToken<T extends { exp?: number }>(
	token: string | undefined,
	secret: string,
	now = Date.now()
): Promise<T | null> {
	if (!token || !secret) return null;
	const [body, sig, extra] = token.split('.');
	if (!body || !sig || extra !== undefined) return null;
	try {
		const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64Url(sig) as BufferSource, enc.encode(body));
		if (!ok) return null;
		const payload = JSON.parse(dec.decode(fromB64Url(body))) as T;
		if (typeof payload.exp === 'number' && payload.exp < now) return null;
		return payload;
	} catch {
		return null;
	}
}

export interface PasswordHash {
	hash: string;
	salt: string;
	iterations: number;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, [
		'deriveBits'
	]);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
		key,
		256
	);
	return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations: number): Promise<PasswordHash> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	return { hash: toB64Url(await pbkdf2(password, salt, iterations)), salt: toB64Url(salt), iterations };
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
	const got = await pbkdf2(password, fromB64Url(stored.salt), stored.iterations);
	return timingSafeEqual(got, fromB64Url(stored.hash));
}

export { randomPassword } from '../password.js';

export function randomId(): string {
	return toB64Url(crypto.getRandomValues(new Uint8Array(12)));
}
