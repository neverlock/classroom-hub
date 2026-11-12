/**
 * "New comment" logic, shared by the page and its tests.
 * A comment is new when its id is above the highest comment id the reader has read on that card.
 * Comments written by the reader themselves are left out of `ids` by the server.
 */
export function unreadIds(ids: number[], lastRead: number | undefined): number[] {
	const floor = lastRead ?? 0;
	return ids.filter((id) => id > floor);
}

export const MAX_COMMENT_ID = 1_000_000_000;
