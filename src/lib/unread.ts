/**
 * "New comment" logic, shared by the page and its tests.
 * A comment is new when its id is above both what the reader has read on that card and the room-wide baseline
 * (the newest comment that existed on the reader's first visit, so old comments are never flagged).
 * Comments written by the reader themselves are left out of `ids` by the server.
 */
export function unreadIds(ids: number[], lastRead: number | undefined, baseline: number | null): number[] {
	if (baseline === null) return []; // read state not loaded yet: show nothing rather than flash everything
	const floor = Math.max(lastRead ?? 0, baseline);
	return ids.filter((id) => id > floor);
}

export const MAX_COMMENT_ID = 1_000_000_000;
