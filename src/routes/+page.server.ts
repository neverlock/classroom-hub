import { redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { classes, terms } from '#lib/server/db/schema.js';
import { useEnv } from '#lib/server/env.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { db } = useEnv(event);
	const rows = await db
		.select({ slug: classes.slug, label: terms.classLabel, term: terms.name })
		.from(classes)
		.leftJoin(terms, eq(classes.currentTermId, terms.id))
		.where(eq(classes.active, true))
		.orderBy(asc(classes.id))
		.all();
	if (rows.length === 1) redirect(302, `/c/${rows[0].slug}`);
	return { rooms: rows.map((r) => ({ slug: r.slug, label: r.label ?? r.slug, term: r.term })) };
};
