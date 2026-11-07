import { error } from '@sveltejs/kit';
import { useEnv } from '#lib/server/env.js';
import { loadGpaCourse } from '#lib/server/queries.js';
import type { PageServerLoad } from './$types';

/**
 * Public GPA calculator. The server only sends the course's subject list; it never receives grades
 * (the page has no form and makes no request when you type: everything is computed in the browser).
 */
export const load: PageServerLoad = async (event) => {
	const { db } = useEnv(event);
	const found = await loadGpaCourse(db, event.params.slug);
	if (!found) error(404, 'ไม่พบหน้าคำนวณ GPA นี้');
	const { course, subjects } = found;
	return {
		slug: course.slug,
		name: course.name,
		note: course.note,
		active: course.active,
		subjects: course.active ? subjects.map((s) => ({ id: s.id, termNo: s.termNo, code: s.code, name: s.name, credit2: s.credit2 })) : []
	};
};
