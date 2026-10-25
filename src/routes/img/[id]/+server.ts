import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { attachments } from '#lib/server/db/schema.js';
import { useEnv } from '#lib/server/env.js';
import type { RequestHandler } from './$types';

/** Photos live in a private R2 bucket; this route is the only way to read them. */
export const GET: RequestHandler = async (event) => {
	const { env, db } = useEnv(event);
	const id = Number(event.params.id);
	if (!Number.isInteger(id)) error(404);
	const row = await db.select().from(attachments).where(eq(attachments.id, id)).get();
	if (!row) error(404);
	const obj = await env.IMAGES.get(row.r2Key);
	if (!obj) error(404);
	return new Response(obj.body, {
		headers: {
			'content-type': row.contentType,
			'content-length': String(obj.size),
			// ids are never reused, so the content behind an id never changes
			'cache-control': 'public, max-age=31536000, immutable',
			'x-content-type-options': 'nosniff'
		}
	});
};
