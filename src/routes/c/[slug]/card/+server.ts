import { json } from '@sveltejs/kit';
import { loadCard } from '#lib/server/queries.js';
import { roomContext } from '#lib/server/room.js';
import type { RequestHandler } from './$types';

/** One full card (photos + comments) for expanding a row of "การบ้านที่ต้องส่ง" / "งานเลยกำหนดส่ง". */
export const GET: RequestHandler = async (event) => {
	const { db, room, actor, student } = await roomContext(event);
	const id = Number(event.url.searchParams.get('id'));
	const headers = { 'cache-control': 'no-store' };
	if (!Number.isInteger(id) || id <= 0) return json({ card: null }, { status: 400, headers });
	const card = await loadCard(db, room, id, { admin: !!actor, studentId: student?.id ?? null });
	if (!card) return json({ card: null }, { status: 404, headers });
	return json({ card }, { headers });
};
