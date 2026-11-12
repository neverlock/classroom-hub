import { unreadIds } from '#lib/unread.js';

/**
 * Which comments the reader has already seen.
 *  - A student who entered their รหัส: stored on the server, so it follows them to every device.
 *  - Anybody else: stored in this browser only (localStorage), nothing is sent.
 * When a visitor first enters their รหัส, what is in the browser is merged up to the server.
 */
export class Reads {
	/** entryId → highest comment id read on that card */
	last = $state<Record<number, number>>({});
	/** comments with an id up to this existed on the first visit and are never "new"; null = not known yet */
	baseline = $state<number | null>(null);
	#slug: string;
	#key: string;
	#server = false;
	#syncing = false;

	constructor(slug: string) {
		this.#slug = slug;
		this.#key = `cm-read:${slug}`;
	}

	/** Ids of the comments (by others) on this card that are new for the reader. */
	unread(entryId: number, ids: number[]): number[] {
		return unreadIds(ids, this.last[entryId], this.baseline);
	}

	#readLocal(): { last: Record<number, number>; baseline: number | null } {
		try {
			const raw = JSON.parse(localStorage.getItem(this.#key) ?? 'null') as { last?: Record<string, number>; baseline?: number } | null;
			const last: Record<number, number> = {};
			for (const [k, v] of Object.entries(raw?.last ?? {})) if (Number.isInteger(Number(k)) && Number.isInteger(v)) last[Number(k)] = v;
			return { last, baseline: Number.isInteger(raw?.baseline) ? (raw!.baseline as number) : null };
		} catch {
			return { last: {}, baseline: null };
		}
	}
	#writeLocal() {
		try {
			localStorage.setItem(this.#key, JSON.stringify({ last: this.last, baseline: this.baseline }));
		} catch {
			/* private window / blocked storage: read state just lasts for this visit */
		}
	}
	#clearLocal() {
		try {
			localStorage.removeItem(this.#key);
		} catch {
			/* ignore */
		}
	}
	async #post(body: unknown): Promise<{ entryId: number; last: number }[] | null> {
		try {
			const res = await fetch(`/c/${this.#slug}/reads`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			if (!res.ok) return null;
			return ((await res.json()) as { reads: { entryId: number; last: number }[] }).reads;
		} catch {
			return null;
		}
	}
	#apply(rows: { entryId: number; last: number }[]) {
		const last: Record<number, number> = {};
		let baseline: number | null = null;
		for (const r of rows) {
			if (r.entryId === 0) baseline = r.last;
			else last[r.entryId] = r.last;
		}
		this.last = last;
		this.baseline = baseline;
	}

	/** Call whenever the page data changes. `newest` is the highest comment id in the room right now. */
	async sync(isStudent: boolean, serverRows: { entryId: number; last: number }[], newest: number) {
		this.#server = isStudent;
		if (!isStudent) {
			const local = this.#readLocal();
			this.last = local.last;
			this.baseline = local.baseline ?? newest; // first visit on this device: everything existing counts as read
			if (local.baseline === null) this.#writeLocal();
			return;
		}
		this.#apply(serverRows);
		const local = this.#readLocal();
		const needBaseline = this.baseline === null;
		const hasLocal = Object.keys(local.last).length > 0 || local.baseline !== null;
		if (!needBaseline && !hasLocal) return;
		if (this.#syncing) return;
		this.#syncing = true;
		const rows = await this.#post({ entries: local.last, baseline: needBaseline ? (local.baseline ?? newest) : undefined });
		this.#syncing = false;
		if (rows) {
			this.#apply(rows);
			this.#clearLocal();
		} else if (needBaseline) this.baseline = local.baseline ?? newest; // offline: still behave sensibly for now
	}

	/** The reader has seen the comments up to these ids (entryId → highest comment id on that card). */
	async markRead(map: Record<number, number>) {
		const next = { ...this.last };
		let changed = false;
		for (const [k, v] of Object.entries(map)) {
			const id = Number(k);
			if (v > (next[id] ?? 0)) {
				next[id] = v;
				changed = true;
			}
		}
		if (!changed) return;
		this.last = next;
		if (!this.#server) {
			this.#writeLocal();
			return;
		}
		const rows = await this.#post({ entries: map });
		if (rows) this.#apply(rows);
	}
}
