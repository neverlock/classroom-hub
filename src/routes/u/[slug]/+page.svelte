<script lang="ts">
	import { onMount } from 'svelte';
	import { GPA_TERMS, calcTerm, calcTotal, fmtCredit, fmtGpa, parseGrade } from '#lib/gpa.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const storeKey = $derived(`gpa:${data.slug}`);
	let cur = $state(0);
	/** subject id → what the visitor typed. Lives in this browser only. */
	let grades = $state<Record<string, string>>({});
	let ready = $state(false);
	let armed = $state(false);

	const byTerm = $derived(GPA_TERMS.map((t) => data.subjects.filter((s) => s.termNo === t.no)));
	const results = $derived(byTerm.map((subs) => calcTerm(subs, grades)));
	const total = $derived(calcTotal(results));
	const now = $derived(results[cur]);
	const termCredit2 = $derived(byTerm[cur].reduce((a, s) => a + s.credit2, 0));

	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(storeKey) ?? 'null') as Record<string, string> | null;
			const ids = new Set(data.subjects.map((s) => String(s.id)));
			// only keep answers for subjects that still exist (the course may have been edited)
			if (saved && typeof saved === 'object') grades = Object.fromEntries(Object.entries(saved).filter(([k, v]) => ids.has(k) && typeof v === 'string'));
		} catch {
			/* private window or blocked storage: the calculator still works, it just forgets */
		}
		ready = true;
	});
	$effect(() => {
		const snapshot = JSON.stringify(grades);
		if (!ready) return;
		try {
			localStorage.setItem(storeKey, snapshot);
		} catch {
			/* ignore */
		}
	});

	function type(id: number, ev: Event) {
		const el = ev.currentTarget as HTMLInputElement;
		el.value = el.value.replace(/[^0-9.,]/g, '');
		grades[id] = el.value;
	}
	const bad = (id: number) => (grades[id] ?? '') !== '' && parseGrade(grades[id]) === null;
	function clear() {
		if (!armed) {
			armed = true;
			setTimeout(() => (armed = false), 3000);
			return;
		}
		grades = {};
		armed = false;
	}
</script>

<svelte:head>
	<title>คำนวณ GPA · {data.name}</title>
</svelte:head>

<div class="wrap narrow">
	<h1>คำนวณ GPA</h1>
	<p class="sub">{data.name} · ม.1 – ม.3</p>
	<hr class="rule" />

	{#if !data.active}
		<div class="warn block">หลักสูตรนี้ปิดอยู่ในขณะนี้ ยังคำนวณไม่ได้</div>
	{:else if data.subjects.length === 0}
		<div class="empty">หลักสูตรนี้ยังไม่ได้ใส่รายวิชา โปรดแจ้งผู้ดูแลระบบ</div>
	{:else}
		<p class="hint" style="margin-top: 0">กรอกเกรดแต่ละวิชา (0, 0.5, 1 … 4) ระบบคำนวณให้ทันที เกรดที่กรอกอยู่ในเครื่องนี้เท่านั้น ไม่ถูกส่งขึ้นเซิร์ฟเวอร์</p>

		<div class="g-terms" role="tablist" aria-label="เลือกเทอม">
			{#each [1, 2, 3] as year (year)}
				<div class="g-tg" role="group" aria-label={`ม.${year}`}>
					<span>ม.{year}</span>
					{#each GPA_TERMS.filter((t) => t.year === year) as t (t.no)}
						{@const r = results[t.no]}
						<button type="button" class="g-tab" role="tab" aria-selected={cur === t.no} onclick={() => (cur = t.no)}>
							เทอม {t.term}
							<small class:has={r.counted > 0}>{r.counted ? `GPA ${fmtGpa(r.gpa)}` : byTerm[t.no].length ? 'ยังไม่กรอก' : 'ไม่มีวิชา'}</small>
						</button>
					{/each}
				</div>
			{/each}
		</div>

		<div class="g-panelhead"><h2>{GPA_TERMS[cur].label}</h2><span class="hint">กรอกแล้ว {now.counted}/{now.total} วิชา</span></div>
		<ul class="g-list">
			{#each byTerm[cur] as s (s.id)}
				<li class="g-row" class:bad={bad(s.id)}>
					<span class="g-nm">{#if s.code}<span class="g-cd">{s.code}</span>{/if}{s.name}</span>
					<input
						type="text"
						inputmode="decimal"
						maxlength="3"
						autocomplete="off"
						autocapitalize="none"
						spellcheck="false"
						placeholder="0–4"
						aria-label={`เกรด ${s.name}`}
						aria-invalid={bad(s.id)}
						value={grades[s.id] ?? ''}
						oninput={(e) => type(s.id, e)}
					/>
					<span class="g-crd"><b>{fmtCredit(s.credit2)}</b> หน่วยกิต</span>
					{#if bad(s.id)}<p class="g-err" role="alert">ใส่เกรด 0–4 (ครั้งละ 0.5) เช่น 3 หรือ 3.5</p>{/if}
				</li>
			{:else}
				<li class="empty">เทอมนี้ยังไม่มีรายวิชา</li>
			{/each}
		</ul>
		<div class="g-result">
			<span class="g-lab">หน่วยกิตรวมเทอมนี้ <b>{fmtCredit(termCredit2)}</b></span>
			<span class="g-lab">นับในเกรด <b>{fmtCredit(now.credit2)}</b> หน่วยกิต</span>
			<span class="g-big">{fmtGpa(now.gpa)}<small>GPA เทอมนี้</small></span>
		</div>

		<section class="g-total" aria-labelledby="gtot">
			<h2 id="gtot">สรุป GPA สะสม</h2>
			{#if total.terms === 0}
				<div class="g-empty">ยังไม่มีเทอมที่กรอกเกรด กรอกเกรดด้านบนแล้วสรุปจะขึ้นที่นี่</div>
			{:else}
				<div class="g-gpa"><b>{fmtGpa(total.gpa)}</b><span>GPA สะสม · {fmtCredit(total.credit2)} หน่วยกิต · {total.terms} เทอม</span></div>
				<table>
					<thead><tr><th>เทอม</th><th>หน่วยกิต</th><th>GPA</th></tr></thead>
					<tbody>
						{#each GPA_TERMS as t (t.no)}
							{@const r = results[t.no]}
							{#if r.counted > 0}
								<tr>
									<td>{t.label}{#if r.counted < r.total} <span class="g-part">({r.counted}/{r.total} วิชา)</span>{/if}</td>
									<td>{fmtCredit(r.credit2)}</td>
									<td><b>{fmtGpa(r.gpa)}</b></td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			{/if}
			<p class="g-foot">GPA = ผลรวม (เกรด × หน่วยกิต) ÷ ผลรวมหน่วยกิต นับเฉพาะวิชาที่กรอกเกรดแล้ว</p>
		</section>

		{#if data.note}<p class="hint" style="text-align: center; margin-top: 12px; white-space: pre-wrap">{data.note}</p>{/if}
		<button class="g-clear" type="button" onclick={clear}>{armed ? 'กดอีกครั้งเพื่อยืนยันล้างทั้งหมด' : 'ล้างเกรดที่กรอกทั้งหมด'}</button>
	{/if}
</div>
