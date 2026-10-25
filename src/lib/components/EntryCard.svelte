<script lang="ts">
	import { page } from '$app/state';
	import { actionUrl } from '#lib/action-url.js';
	import { enhance } from '$app/forms';
	import { fmtDate, fmtDateTime } from '#lib/dates.js';
	import type { CardView } from '#lib/types.js';
	import CommentForm from './CommentForm.svelte';
	import Linkified from './Linkified.svelte';

	interface Props {
		card: CardView;
		today: string;
		/** Signed-in room admin on the current term: can hide comments. Editing a card is decided per card (`card.canEdit`). */
		isAdmin: boolean;
		student: { seatNo: number } | null;
		onedit: (card: CardView) => void;
		onzoom: (src: string) => void;
	}
	let { card, today, isAdmin, student, onedit, onzoom }: Props = $props();

	let open = $state(false);
	let sureCard = $state(false);
	let sureComment = $state<number | null>(null);
	function confirmOnce(ev: Event, current: boolean, set: (v: boolean) => void) {
		if (current) return;
		ev.preventDefault();
		set(true);
		setTimeout(() => set(false), 3000);
	}
</script>

{#snippet pics(ids: number[])}
	{#if ids.length}
		<div class="pics">
			{#each ids as id (id)}
				<button type="button" class="picbtn" onclick={() => onzoom(`/img/${id}`)} aria-label="ดูรูปขยาย">
					<img src={`/img/${id}`} alt="รูปแนบ" loading="lazy" />
				</button>
			{/each}
		</div>
	{/if}
{/snippet}

<article class="ecard" class:hw={card.hasHomework}>
	<h3>{card.subject.code} {card.subject.name}</h3>
	{#if card.subject.teacher}<div class="teacher">ผู้สอน: {card.subject.teacher}</div>{/if}
	<p><b>📝 งานในคาบ:</b> <Linkified text={card.lesson} /></p>
	{@render pics(card.photos)}
	{#if card.hasHomework}
		<div class="chips"><span class="chip">⚠ มีการบ้าน</span><span class="chip due">📅 ส่ง: {fmtDate(card.homeworkDue ?? '')}</span></div>
		<p><b>🎯 โจทย์การบ้าน:</b> <Linkified text={card.homeworkDetail} /></p>
	{:else}
		<div class="nohw">✓ ไม่มีการบ้าน</div>
	{/if}
	<div class="meta">
		<span class="byline">บันทึกโดย {card.author}</span>
		{#if card.canEdit}
			<div class="tools">
				<button type="button" class="ibtn" aria-label="แก้ไข" title="แก้ไข" onclick={() => onedit(card)}>✎</button>
				<form method="POST" action={actionUrl(page.url, 'hideEntry')} use:enhance>
					<input type="hidden" name="id" value={card.id} />
					<button type="submit" class="ibtn" class:sure={sureCard} aria-label="ซ่อนการ์ดนี้" title="ซ่อน (กู้คืนได้ที่หน้าจัดการห้อง)" onclick={(e) => confirmOnce(e, sureCard, (v) => (sureCard = v))}>
						{sureCard ? 'ยืนยันซ่อน?' : '🗑'}
					</button>
				</form>
			</div>
		{/if}
	</div>
	<button class="cbtn" type="button" aria-expanded={open} onclick={() => (open = !open)}>
		💬 {card.comments.length} <span>ความคิดเห็น</span><i>{open ? '▾ ย่อ' : '▸ อ่าน / เขียน'}</i>
	</button>
	{#if open}
		<div class="cmts">
			{#each card.comments as c (c.id)}
				<div class="cm">
					<header>
						<span><b>เลขที่ {c.seatNo}</b> · {fmtDateTime(c.createdAt, today)}</span>
						{#if isAdmin}
							<form method="POST" action={actionUrl(page.url, 'hideComment')} use:enhance>
								<input type="hidden" name="id" value={c.id} />
								<button type="submit" class="linkbtn" onclick={(e) => confirmOnce(e, sureComment === c.id, (v) => (sureComment = v ? c.id : null))}>
									{sureComment === c.id ? 'ยืนยันซ่อน?' : 'ซ่อน'}
								</button>
							</form>
						{/if}
					</header>
					{#if c.body}<p><Linkified text={c.body} /></p>{/if}
					{@render pics(c.photos)}
				</div>
			{:else}
				<div class="empty" style="padding: 14px">ยังไม่มีความคิดเห็น เป็นคนแรกได้เลย</div>
			{/each}
			<CommentForm entryId={card.id} {student} />
		</div>
	{/if}
</article>
