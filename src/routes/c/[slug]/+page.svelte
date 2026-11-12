<script lang="ts">
	import { page } from '$app/state';
	import { actionUrl } from '#lib/action-url.js';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { Marks } from '#lib/marks.svelte.js';
	import { Reads } from '#lib/reads.svelte.js';
	import { clampDate, fmtDate, groupByMonth, relDue, weekdayTh } from '#lib/dates.js';
	import type { CardView } from '#lib/types.js';
	import EntryCard from '#lib/components/EntryCard.svelte';
	import EntryForm from '#lib/components/EntryForm.svelte';
	import HomeworkItem from '#lib/components/HomeworkItem.svelte';
	import Linkified from '#lib/components/Linkified.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let panelOpen = $state(false);
	let formDate = $state('');
	let formSubject = $state('');
	let zoom = $state<string | null>(null);
	let overMonths = $state(3);
	let loginBusy = $state(false);
	let filter = $state<'all' | 'todo' | 'done'>('all');

	// "ทำแล้ว" marks: on the server for a student who entered their รหัส, in this browser otherwise
	const marks = new Marks(untrack(() => data.slug));
	$effect(() => {
		const isStudent = !!data.student;
		const ids = data.doneIds;
		untrack(() => marks.sync(isStudent, ids));
	});
	const reads = new Reads(untrack(() => data.slug));
	$effect(() => {
		const isStudent = !!data.student;
		const rows = data.reads;
		untrack(() => reads.sync(isStudent, rows));
	});
	/** read state only matters on the current term; old terms are a read-only archive */
	const liveReads = $derived(data.view?.isCurrent ? reads : undefined);
	/** every card and homework row on the page: comments by others, and the highest comment id (for "mark all read") */
	const commentMap = $derived.by(() => {
		const m = new Map<number, { others: number[]; top: number }>();
		for (const c of data.cards) m.set(c.id, { others: c.comments.filter((x) => !x.mine).map((x) => x.id), top: c.comments.reduce((a, x) => Math.max(a, x.id), 0) });
		for (const r of [...data.upcoming, ...data.overdue]) if (!m.has(r.id)) m.set(r.id, { others: r.cids, top: r.cids.reduce((a, x) => Math.max(a, x), 0) });
		return m;
	});
	const newTotal = $derived(liveReads ? [...commentMap].reduce((a, [id, v]) => a + reads.unread(id, v.others).length, 0) : 0);
	function readAll() {
		reads.markRead(Object.fromEntries([...commentMap].filter(([, v]) => v.top > 0).map(([id, v]) => [id, v.top])));
	}
	const doneCount = $derived(data.upcoming.filter((r) => marks.has(r.id)).length);
	const shownUpcoming = $derived(data.upcoming.filter((r) => filter === 'all' || (filter === 'done') === marks.has(r.id)));
	const overdueOpen = $derived(data.overdue.filter((r) => !marks.has(r.id)).length);

	const base = $derived(`/c/${data.slug}`);
	const isAdmin = $derived(!!data.actor && data.open && !!data.view?.isCurrent);
	const months = $derived(groupByMonth(data.overdue, (r) => r.due));
	const loginError = $derived((form as { loginError?: string } | null)?.loginError ?? '');

	function href(params: { term?: number; d?: string }) {
		const q = new URLSearchParams();
		if (params.term && params.term !== data.currentTerm?.id) q.set('term', String(params.term));
		if (params.d) q.set('d', params.d);
		const s = q.toString();
		return s ? `${base}?${s}` : base;
	}
	function go(d: string) {
		if (!data.view) return;
		goto(href({ term: data.view.id, d: clampDate(d, data.view.startDate, data.view.endDate) }), { reset: false });
	}
	function openPanel() {
		panelOpen = !panelOpen;
		if (panelOpen && !formDate) formDate = data.currentTerm ? clampDate(data.today, data.currentTerm.startDate, data.currentTerm.endDate) : data.today;
	}
	function edit(card: CardView) {
		panelOpen = true;
		formDate = card.date;
		formSubject = String(card.subject.id);
		queueMicrotask(() => document.getElementById('panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
	}
</script>

<svelte:head>
	<title>บันทึกการเรียนการสอน {data.label}</title>
</svelte:head>
<svelte:window onkeydown={(e) => e.key === 'Escape' && (zoom = null)} />

<div class="wrap">
	<h1>บันทึกการเรียนการสอน {data.label}</h1>
	<p class="sub">
		วัน{weekdayTh(data.today)}ที่ {fmtDate(data.today)}{data.currentTerm ? ` · ${data.currentTerm.name}` : ''}
	</p>
	<hr class="rule" />

	{#if !data.open}
		<div class="warn block">ห้องนี้ปิดอยู่ (อ่านอย่างเดียว) ไม่สามารถบันทึกหรือเขียนความคิดเห็นเพิ่มได้</div>
	{/if}

	{#if data.open}
		<button class="cta" id="toggle" type="button" aria-expanded={panelOpen} aria-controls="panel" onclick={openPanel}>+ บันทึกสิ่งที่เรียน / การบ้านใหม่</button>
		{#if panelOpen}
			<section class="panel" id="panel">
				<EntryForm
					slug={data.slug}
					identity={data.actor ? { kind: 'admin', display: data.actor.display } : data.student ? { kind: 'student', seatNo: data.student.seatNo } : null}
					subjects={data.subjects}
					term={data.currentTerm}
					bind:date={formDate}
					bind:subjectId={formSubject}
				/>
				<div class="tools" style="margin-top: 14px">
					{#if data.actor}
						<a class="sbtn" style="text-decoration: none; display: grid; place-items: center" href={`${base}/manage`}>⚙ จัดการห้อง</a>
						<form method="POST" action={actionUrl(page.url, 'logout')} use:enhance style="display: contents"><button class="sbtn" type="submit">ออกจากระบบแอดมิน</button></form>
					{/if}
				</div>
				{#if !data.actor}
					<details class="adminlogin">
						<summary>แอดมินห้อง? ล็อกอินที่นี่</summary>
						<form
							method="POST"
							action={actionUrl(page.url, 'login')}
							use:enhance={() => {
								loginBusy = true;
								return async ({ update }) => {
									loginBusy = false;
									await update({ reset: false });
								};
							}}
						>
							<label for="idname">ชื่อผู้ใช้ (user name)</label>
							<input type="text" id="idname" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="เช่น mai" />
							<label for="idpin">รหัสผ่าน</label>
							<input type="password" id="idpin" name="password" autocomplete="current-password" />
							<p class="hint">แอดมินแก้ไข/ซ่อนการ์ดและความคิดเห็นของทุกคนได้ · ลืมรหัสผ่านให้ติดต่อผู้ดูแลระบบ</p>
							{#if loginError}<p class="err" role="alert">{loginError}</p>{/if}
							<button class="btn" type="submit" disabled={loginBusy}>{loginBusy ? 'กำลังตรวจสอบ…' : 'ล็อกอินแอดมิน'}</button>
						</form>
					</details>
				{/if}
			</section>
		{/if}
	{/if}

	{#if data.view}
		<div class="datebar">
			<label for="pickDate">📅 เลือกวันที่ดูข้อมูล:</label>
			<input
				type="date"
				id="pickDate"
				value={data.date}
				min={data.view.startDate}
				max={data.view.endDate}
				onchange={(e) => e.currentTarget.value && go(e.currentTarget.value)}
			/>
			<a class="btn" style="text-decoration: none; display: grid; place-items: center; margin: 0" href={base}>วันนี้</a>
		</div>

		{#if data.view.isCurrent && data.today < data.view.startDate}
			<div class="warn block">ภาคเรียนนี้ยังไม่เริ่ม (เริ่ม {fmtDate(data.view.startDate)}) ยังไม่มีบันทึกก่อนวันนั้น</div>
		{:else if data.view.isCurrent && data.today > data.view.endDate}
			<div class="warn block">ภาคเรียนนี้สิ้นสุดแล้ว ({fmtDate(data.view.endDate)}) · แอดมินสร้างภาคเรียนใหม่ได้ที่หน้าจัดการห้อง</div>
		{/if}

		{#if data.terms.length > 1}
			<div class="termbar">
				<label for="termSel">📂 ภาคเรียน:</label>
				<select id="termSel" value={String(data.view.id)} onchange={(e) => goto(href({ term: Number(e.currentTarget.value) }))}>
					{#each data.terms as t (t.id)}
						<option value={String(t.id)}>{t.name} · {t.classLabel}{t.isCurrent ? ' (ปัจจุบัน)' : ''}</option>
					{/each}
				</select>
			</div>
		{/if}
		{#if !data.view.isCurrent}
			<div class="warn">
				<span>กำลังดูข้อมูลย้อนหลัง · <b>{data.view.classLabel} · {data.view.name} · {fmtDate(data.view.startDate)} – {fmtDate(data.view.endDate)}</b></span>
				<a class="linkbtn" href={base} style="display: inline-grid; place-items: center">กลับภาคเรียนปัจจุบัน</a>
			</div>
		{/if}

		{#if newTotal > 0}
			<div class="newbar" role="status">
				<span><b>{newTotal}</b> ความคิดเห็นใหม่ ที่ยังไม่ได้อ่าน</span>
				<button type="button" class="linkbtn" onclick={readAll}>ทำเครื่องหมายว่าอ่านแล้วทั้งหมด</button>
			</div>
		{/if}

		<h2 class="sec">📚 สิ่งที่เรียน (ตามวันที่เลือก)</h2>
		<div class="grid">
			{#each data.cards as card (card.id)}
				<EntryCard {card} today={data.today} isAdmin={isAdmin} student={data.student} onedit={edit} onzoom={(src) => (zoom = src)} reads={liveReads} />
			{:else}
				<div class="empty" style="grid-column: 1 / -1">ยังไม่มีบันทึกของวันที่ {fmtDate(data.date)}</div>
			{/each}
		</div>

		{#if data.view.isCurrent}
			<h2 class="sec">📌 การบ้านที่ต้องส่ง (เรียงตามกำหนด)</h2>
			{#if data.upcoming.length}
				<div class="hw-prog" aria-live="polite">
					<span>ทำแล้ว <b>{doneCount}</b> จาก <b>{data.upcoming.length}</b> งาน</span>
					<span class="hint">{doneCount === data.upcoming.length ? '🎉 ครบแล้ว' : `เหลือ ${data.upcoming.length - doneCount} งาน`}</span>
					<div class="hw-bar" role="img" aria-label="ความคืบหน้าการบ้าน"><i style={`width: ${(doneCount / data.upcoming.length) * 100}%`}></i></div>
				</div>
				<div class="hw-filter" role="group" aria-label="กรองรายการการบ้าน">
					<button type="button" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>ทั้งหมด<small>{data.upcoming.length}</small></button>
					<button type="button" aria-pressed={filter === 'todo'} onclick={() => (filter = 'todo')}>ยังไม่ทำ<small>{data.upcoming.length - doneCount}</small></button>
					<button type="button" aria-pressed={filter === 'done'} onclick={() => (filter = 'done')}>ทำแล้ว<small>{doneCount}</small></button>
				</div>
			{/if}
			<div class="list">
				{#each shownUpcoming as r (r.id)}
					<HomeworkItem row={r} {base} chip={{ text: relDue(r.due, data.today), late: false }} today={data.today} {isAdmin} student={data.student} onedit={edit} onzoom={(src) => (zoom = src)} {marks} reads={liveReads} version={data} />
				{:else}
					<div class="empty">{data.upcoming.length === 0 || filter === 'todo' ? '🎉 ยอดเยี่ยมมาก! ไม่มีการบ้านค้างเลยครับ' : 'ยังไม่มีงานที่ทำแล้ว'}</div>
				{/each}
			</div>
		{/if}

		<details class="over">
			<summary><span>⏰ งานเลยกำหนดส่ง ({data.overdue.length}{overdueOpen < data.overdue.length ? ` · ค้าง ${overdueOpen}` : ''})</span></summary>
			<div class="over-body">
				{#if data.overdue.length === 0}
					<div class="empty" style="margin-top: 4px">ไม่มีงานที่เลยกำหนด</div>
				{:else}
					{#each months.slice(0, overMonths) as g (g.key)}
						<div class="month"><span>{g.label}</span><span>{g.items.length} งาน</span></div>
						<div class="list">
							{#each g.items as r (r.id)}
								<HomeworkItem row={r} {base} chip={{ text: relDue(r.due, data.today), late: true }} today={data.today} {isAdmin} student={data.student} onedit={edit} onzoom={(src) => (zoom = src)} {marks} reads={liveReads} version={data} />
							{/each}
						</div>
					{/each}
					{#if months.length > overMonths}
						<button class="btn alt" style="margin-top: 14px" type="button" onclick={() => (overMonths += 3)}>ดูเดือนก่อนหน้า ({months.length - overMonths} เดือน)</button>
					{/if}
				{/if}
			</div>
		</details>
	{:else}
		<div class="empty" style="margin-top: 18px">
			ห้องนี้ยังไม่ได้ตั้งภาคเรียน
			{#if data.actor}<br /><a href={`${base}/manage`}>ไปที่หน้าจัดการห้อง → ตั้งค่า เพื่อสร้างภาคเรียน</a>{/if}
		</div>
	{/if}

	<p class="hint" style="text-align: center; margin-top: 20px"><a href={`${base}/manage`} style="display: inline-grid; place-items: center; min-height: 44px; padding: 0 12px">สำหรับแอดมินห้อง: จัดการห้อง</a></p>
</div>

{#if zoom}
	<button type="button" class="lb" onclick={() => (zoom = null)} aria-label="ปิดรูป"><img src={zoom} alt="รูปขยาย" /></button>
{/if}
