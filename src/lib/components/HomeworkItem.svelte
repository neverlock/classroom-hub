<script lang="ts">
	import { untrack } from 'svelte';
	import { fmtDate } from '#lib/dates.js';
	import type { CardView, HomeworkRow } from '#lib/types.js';
	import EntryCard from './EntryCard.svelte';
	import Linkified from './Linkified.svelte';

	interface Props {
		row: HomeworkRow;
		/** Room path, e.g. `/c/p5-1`. */
		base: string;
		chip: { text: string; late: boolean };
		today: string;
		isAdmin: boolean;
		student: { seatNo: number } | null;
		onedit: (card: CardView) => void;
		onzoom: (src: string) => void;
		/** Changes whenever the page data is reloaded (after a comment, hide, …), so an open card refreshes itself. */
		version: unknown;
	}
	let { row, base, chip, today, isAdmin, student, onedit, onzoom, version }: Props = $props();

	let open = $state(false);
	let card = $state<CardView | null>(null);
	let loading = $state(false);
	let failed = $state(false);

	async function load() {
		loading = card === null;
		failed = false;
		try {
			const res = await fetch(`${base}/card?id=${row.id}`);
			if (!res.ok) throw new Error(String(res.status));
			card = ((await res.json()) as { card: CardView }).card;
		} catch {
			failed = true;
		} finally {
			loading = false;
		}
	}
	function toggle() {
		open = !open;
		if (open) load();
	}
	function onItemClick(ev: MouseEvent) {
		if ((ev.target as HTMLElement).closest('a')) return; // links inside the text keep working
		toggle();
	}
	function onItemKey(ev: KeyboardEvent) {
		if (ev.target !== ev.currentTarget) return;
		if (ev.key === 'Enter' || ev.key === ' ') {
			ev.preventDefault();
			toggle();
		}
	}

	let first = true;
	$effect(() => {
		version;
		if (first) {
			first = false;
			return;
		}
		if (open) untrack(load);
	});
</script>

{#if open}
	<div class="itemx">
		<button type="button" class="linkbtn collapse" aria-expanded="true" onclick={toggle}>▾ ย่อการ์ดนี้</button>
		{#if card}
			<EntryCard {card} {today} {isAdmin} {student} {onedit} {onzoom} />
			<button type="button" class="linkbtn collapse" onclick={toggle}>▾ ย่อการ์ดนี้</button>
		{:else if loading}
			<div class="empty">กำลังโหลด…</div>
		{:else if failed}
			<div class="empty">โหลดการ์ดไม่สำเร็จ <button type="button" class="linkbtn" onclick={load}>ลองใหม่</button></div>
		{/if}
	</div>
{:else}
	<div class="item expandable" role="button" tabindex="0" aria-expanded="false" onclick={onItemClick} onkeydown={onItemKey}>
		<div>
			<b>{row.subjectCode} {row.subjectName}</b>
			<p><Linkified text={row.detail} /></p>
			<span class="byline">ส่ง {fmtDate(row.due)}</span>
			<span class="more">▸ ดูการ์ด / รูป / ความคิดเห็น</span>
		</div>
		<span class="chip" class:due={!chip.late} class:late={chip.late}>{chip.text}</span>
	</div>
{/if}
