import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { getSuperAdminEmail } from './access';

const TEAM = 'team.cloudflareaccess.com';
const AUD = 'test-aud-tag';
const env = { CF_ACCESS_TEAM_DOMAIN: TEAM, CF_ACCESS_AUD: AUD };

let privateKey: CryptoKey;
let otherKey: CryptoKey;

async function jwt(claims: { email?: string; aud?: string; iss?: string; exp?: string }, key = privateKey) {
	return new SignJWT({ email: claims.email })
		.setProtectedHeader({ alg: 'ES256', kid: 'k1' })
		.setIssuer(claims.iss ?? `https://${TEAM}`)
		.setAudience(claims.aud ?? AUD)
		.setIssuedAt()
		.setExpirationTime(claims.exp ?? '5m')
		.sign(key);
}
const req = (token?: string) => new Request('https://x.test/admin', { headers: token ? { 'cf-access-jwt-assertion': token } : {} });

beforeAll(async () => {
	const pair = await generateKeyPair('ES256');
	privateKey = pair.privateKey;
	otherKey = (await generateKeyPair('ES256')).privateKey;
	const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
	vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } }));
});

describe('Cloudflare Access JWT check', () => {
	it('accepts a valid token and returns the lower-cased email', async () => {
		expect(await getSuperAdminEmail(req(await jwt({ email: 'Boss@Example.com' })), env)).toBe('boss@example.com');
	});

	it('rejects a missing header, wrong audience, wrong issuer, expired token and foreign signature', async () => {
		expect(await getSuperAdminEmail(req(), env)).toBeNull();
		expect(await getSuperAdminEmail(req(await jwt({ email: 'a@b.c', aud: 'other-app' })), env)).toBeNull();
		expect(await getSuperAdminEmail(req(await jwt({ email: 'a@b.c', iss: 'https://evil.example.com' })), env)).toBeNull();
		expect(await getSuperAdminEmail(req(await jwt({ email: 'a@b.c', exp: '-1m' })), env)).toBeNull();
		expect(await getSuperAdminEmail(req(await jwt({ email: 'a@b.c' }, otherKey)), env)).toBeNull();
		expect(await getSuperAdminEmail(req('not.a.jwt'), env)).toBeNull();
	});

	it('rejects a token without an email claim', async () => {
		expect(await getSuperAdminEmail(req(await jwt({})), env)).toBeNull();
	});

	it('also enforces SUPER_ADMINS when it is set', async () => {
		const locked = { ...env, SUPER_ADMINS: 'boss@example.com, second@example.com' };
		expect(await getSuperAdminEmail(req(await jwt({ email: 'second@example.com' })), locked)).toBe('second@example.com');
		expect(await getSuperAdminEmail(req(await jwt({ email: 'intruder@example.com' })), locked)).toBeNull();
	});
});
