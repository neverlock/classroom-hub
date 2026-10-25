import { dev } from '$app/env';
import { createRemoteJWKSet, jwtVerify } from 'jose';

type AccessEnv = {
	CF_ACCESS_TEAM_DOMAIN: string;
	CF_ACCESS_AUD: string;
	SUPER_ADMINS?: string;
	DEV_SUPER_ADMIN?: string;
};

const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Returns the email of a signed-in super admin, or null.
 * Cloudflare Access puts a signed JWT in `Cf-Access-Jwt-Assertion` on requests to the protected
 * paths. We verify it ourselves (signature, issuer, audience) instead of trusting the header.
 */
export async function getSuperAdminEmail(request: Request, env: AccessEnv): Promise<string | null> {
	if (dev && env.DEV_SUPER_ADMIN) return env.DEV_SUPER_ADMIN.toLowerCase();

	const token = request.headers.get('cf-access-jwt-assertion');
	if (!token || !env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) return null;
	try {
		const team = env.CF_ACCESS_TEAM_DOMAIN;
		let jwks = jwksByTeam.get(team);
		if (!jwks) {
			jwks = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
			jwksByTeam.set(team, jwks);
		}
		const { payload } = await jwtVerify(token, jwks, {
			issuer: `https://${team}`,
			audience: env.CF_ACCESS_AUD
		});
		const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
		if (!email) return null;
		// Optional second lock: if SUPER_ADMINS is set it must contain the email as well.
		const allow = (env.SUPER_ADMINS ?? '')
			.split(',')
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean);
		return allow.length === 0 || allow.includes(email) ? email : null;
	} catch {
		return null;
	}
}
