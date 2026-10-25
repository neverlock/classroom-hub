import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { waitUntil } from 'cloudflare:workers';
import { attachments } from '#lib/server/db/schema.js';
import { useEnv } from '#lib/server/env.js';
import type { RequestHandler } from './$types';

/**
 * Photos live in a private R2 bucket; this route is the only way to read them.
 * The id never points at different content, so responses are cached for a year in the browser and
 * also in Cloudflare's edge cache (Cache API), which skips both D1 and R2 for repeat views.
 */
export const GET: RequestHandler = async (event) => {
	const id = Number(event.params.id);
	if (!Number.isInteger(id) || id < 1) error(404);

	const edge = typeof caches === 'undefined' ? null : (caches as unknown as { default?: Cache }).default;
	const key = new Request(`${event.url.origin}/img/${id}`);
	const cached = await edge?.match(key);
	// a Cache API response has read-only headers, and hooks.server.ts adds security headers, so rebuild it
	if (cached) return new Response(cached.body, { status: cached.status, headers: new Headers(cached.headers) });

	const { env, db } = useEnv(event);
	const row = await db.select().from(attachments).where(eq(attachments.id, id)).get();
	if (!row) error(404);
	const obj = await env.IMAGES.get(row.r2Key);
	if (!obj) error(404);
	const res = new Response(obj.body, {
		headers: {
			'content-type': row.contentType,
			'content-length': String(obj.size),
			'cache-control': 'public, max-age=31536000, immutable',
			'x-content-type-options': 'nosniff'
		}
	});
	if (edge) waitUntil(edge.put(key, res.clone()).catch(() => {}));
	return res;
};
