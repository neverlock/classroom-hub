import { toast } from '#lib/toast.svelte.js';

/**
 * "ทำแล้ว" marks on homework rows.
 *  - A student who entered their รหัส: marks live on the server, so they follow the student to every device.
 *  - Anybody else: marks live in this browser only (localStorage), nothing is sent.
 * When a visitor first enters their รหัส, the marks already kept in the browser are merged up to the server.
 */
export class Marks {
	done = $state<Record<number, true>>({});
	#key: string;
	#slug: string;
	#server = false;
	#syncing = false;

	constructor(slug: string) {
		this.#slug = slug;
		this.#key = `hw-done:${slug}`;
	}

	has(id: number): boolean {
		return !!this.done[id];
	}

	count(ids: number[]): number {
		return ids.filter((id) => this.done[id]).length;
	}

	#readLocal(): number[] {
		try {
			const raw = JSON.parse(localStorage.getItem(this.#key) ?? '[]') as unknown;
			return Array.isArray(raw) ? raw.filter((n): n is number => Number.isInteger(n)) : [];
		} catch {
			return [];
		}
	}
	#writeLocal(ids: number[]) {
		try {
			if (ids.length) localStorage.setItem(this.#key, JSON.stringify(ids));
			else localStorage.removeItem(this.#key);
		} catch {
			/* private window / blocked storage: marks just last for this visit */
		}
	}
	#set(ids: number[]) {
		this.done = Object.fromEntries(ids.map((id) => [id, true as const]));
	}
	async #post(body: unknown): Promise<number[] | null> {
		try {
			const res = await fetch(`/c/${this.#slug}/marks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			if (!res.ok) return null;
			return ((await res.json()) as { ids: number[] }).ids;
		} catch {
			return null;
		}
	}

	/** Call whenever the page data changes (who is identified, what the server says). */
	async sync(isStudent: boolean, serverIds: number[]) {
		this.#server = isStudent;
		if (!isStudent) {
			this.#set(this.#readLocal());
			return;
		}
		this.#set(serverIds);
		const local = this.#readLocal();
		if (local.length === 0 || this.#syncing) return;
		this.#syncing = true;
		const merged = await this.#post({ merge: local });
		this.#syncing = false;
		if (merged) {
			this.#set(merged);
			this.#writeLocal([]); // now safely on the server
		}
	}

	async toggle(id: number) {
		const now = !this.done[id];
		const next = { ...this.done };
		if (now) next[id] = true;
		else delete next[id];
		const before = this.done;
		this.done = next;
		if (!this.#server) {
			this.#writeLocal(Object.keys(next).map(Number));
			return;
		}
		const ids = await this.#post({ entryId: id, done: now });
		if (ids) this.#set(ids);
		else {
			this.done = before;
			toast('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
		}
	}
}
