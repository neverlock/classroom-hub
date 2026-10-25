import type { Handle } from '@sveltejs/kit/hooks';
import { env } from 'cloudflare:workers';
import { getSuperAdminEmail } from '#lib/server/access.js';

/** Everything under /admin is for super admins only. Cloudflare Access sits in front; we verify its JWT again here. */
export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	if (path === '/admin' || path.startsWith('/admin/')) {
		const email = await getSuperAdminEmail(event.request, env);
		if (!email) {
			return new Response(
				'ต้องเข้าสู่ระบบผ่าน Cloudflare Access ด้วยอีเมลผู้ดูแลระบบ (403)\nSuper admin sign-in required.',
				{ status: 403, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }
			);
		}
		event.locals.superAdmin = email;
	}
	const res = await resolve(event);
	if (path.startsWith('/admin') || path.includes('/manage')) res.headers.set('cache-control', 'no-store');
	// closed community site: keep it out of search engines and out of other sites' frames
	res.headers.set('x-robots-tag', 'noindex, nofollow');
	res.headers.set('x-content-type-options', 'nosniff');
	res.headers.set('referrer-policy', 'same-origin');
	res.headers.set('x-frame-options', 'DENY');
	return res;
};
