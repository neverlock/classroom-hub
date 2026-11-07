<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '$app/forms';
	import { actionUrl } from '#lib/action-url.js';
	import { GPA_TERMS, fmtCredit } from '#lib/gpa.js';
	import { toast } from '#lib/toast.svelte.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let editing = $state<number | null>(null);
	let sure = $state('');
	let copyFrom = $state('');
	let err = $state<{ form: string; id?: number; text: string } | null>(null);

	const termNo = $derived(data.termNo);
	const list = $derived(data.subjects.filter((s) => s.termNo === termNo));
	const sum2 = $derived(list.reduce((a, s) => a + s.credit2, 0));
	const countOf = (n: number) => data.subjects.filter((s) => s.termNo === n).length;
	const copyChoices = $derived(GPA_TERMS.filter((t) => t.no !== termNo && countOf(t.no) > 0));

	function arm(ev: Event, key: string) {
		if (sure === key) return;
		ev.preventDefault();
		sure = key;
		setTimeout(() => sure === key && (sure = ''), 3000);
	}
	function tabHref(n: number) {
		const q = new URLSearchParams(page.url.search);
		q.set('t', String(n));
		return `?${q}`;
	}
	function handle(msg?: (d: Record<string, unknown>) => string, onOk?: () => void): SubmitFunction {
		return () =>
			async ({ result, update }) => {
				err = null;
				if (result.type === 'failure') {
					const d = (result.data ?? {}) as { error?: string; form?: string; id?: number };
					err = { form: d.form ?? '', id: d.id, text: d.error ?? 'เกิดข้อผิดพลาด' };
					return;
				}
				if (result.type === 'success') {
					if (msg) toast(msg((result.data ?? {}) as Record<string, unknown>));
					onOk?.();
				}
				await update({ reset: false });
			};
	}
</script>

<svelte:head><title>จัดการหลักสูตร {data.course.name}</title></svelte:head>

<div class="wrap narrow">
	<a class="hint" href="/admin?m=gpa" style="display: inline-block; min-height: 32px">← กลับหน้าจัดการระบบ</a>
	<h1>จัดการหลักสูตร {data.course.name}</h1>
	<p class="sub"><span class="url">/u/{data.course.slug}</span> · <span class="pill" class:on={data.course.active}>{data.course.active ? 'เปิดใช้งาน' : 'ปิดอยู่'}</span></p>
	<hr class="rule" style="margin-bottom: 0" />

	<nav class="g-terms" aria-label="เลือกเทอม">
		{#each [1, 2, 3] as year (year)}
			<div class="g-tg" role="group" aria-label={`ม.${year}`}>
				<span>ม.{year}</span>
				{#each GPA_TERMS.filter((t) => t.year === year) as t (t.no)}
					<a class="g-tab" href={tabHref(t.no)} aria-current={termNo === t.no ? 'page' : undefined} data-sveltekit-noscroll data-sveltekit-replacestate onclick={() => (editing = null)}>
						เทอม {t.term}
						<small>{countOf(t.no)} วิชา</small>
					</a>
				{/each}
			</div>
		{/each}
	</nav>

	<div class="g-panelhead"><h2>{GPA_TERMS[termNo].label}</h2><span class="hint">{list.length} วิชา</span></div>
	<p class="hint">วิชาที่ใส่ในเทอมนี้คือวิชาที่ผู้ใช้จะเห็นช่องให้กรอกเกรด</p>

	<ul class="list">
		{#each list as s, i (s.id)}
			<li class="g-srow">
				<div class="g-shead">
					<div>
						{#if s.code}<b class="g-code">{s.code}</b>{/if}
						<span class="g-sname">{s.name}</span>
					</div>
					<span class="g-cr">{fmtCredit(s.credit2)} หน่วยกิต</span>
				</div>
				<div class="tools">
					<form method="POST" action={actionUrl(page.url, 'subjectMove')} use:enhance={handle()} style="display: contents">
						<input type="hidden" name="id" value={s.id} />
						<button class="ibtn" type="submit" name="dir" value="up" aria-label="เลื่อนขึ้น" disabled={i === 0}>▲</button>
						<button class="ibtn" type="submit" name="dir" value="down" aria-label="เลื่อนลง" disabled={i === list.length - 1}>▼</button>
					</form>
					<button class="ibtn" type="button" aria-label="แก้ไข" aria-expanded={editing === s.id} onclick={() => ((editing = editing === s.id ? null : s.id), (err = null))}>✎</button>
					<form method="POST" action={actionUrl(page.url, 'subjectDelete')} use:enhance={handle(() => 'ลบวิชาแล้ว')} style="display: contents">
						<input type="hidden" name="id" value={s.id} />
						<button class="ibtn" class:sure={sure === `s${s.id}`} type="submit" aria-label="ลบวิชา" onclick={(e) => arm(e, `s${s.id}`)}>{sure === `s${s.id}` ? 'ยืนยันลบ?' : '🗑'}</button>
					</form>
				</div>
				{#if editing === s.id}
					<form class="g-edit" method="POST" action={actionUrl(page.url, 'subjectSave')} use:enhance={handle(() => 'บันทึกวิชาแล้ว', () => (editing = null))}>
						<input type="hidden" name="id" value={s.id} />
						<div class="g-grid2">
							<div><label for={`ec${s.id}`}>รหัสวิชา</label><input type="text" id={`ec${s.id}`} name="code" value={s.code} maxlength="20" autocomplete="off" /></div>
							<div><label for={`er${s.id}`}>หน่วยกิต</label><input type="text" id={`er${s.id}`} name="credit" value={fmtCredit(s.credit2)} inputmode="decimal" maxlength="4" autocomplete="off" /></div>
						</div>
						<label for={`en${s.id}`}>ชื่อวิชา</label>
						<input type="text" id={`en${s.id}`} name="name" value={s.name} maxlength="100" autocomplete="off" />
						{#if err && err.form === 'edit' && err.id === s.id}<p class="err" role="alert">{err.text}</p>{/if}
						<div class="tools"><button class="btn" type="submit" style="flex: 1; margin-top: 12px">บันทึก</button><button class="btn alt" type="button" style="margin-top: 12px; min-height: 48px" onclick={() => (editing = null)}>ยกเลิก</button></div>
					</form>
				{/if}
			</li>
		{:else}
			<li class="empty">เทอมนี้ยังไม่มีวิชา เพิ่มด้านล่าง หรือคัดลอกจากเทอมอื่น</li>
		{/each}
	</ul>
	<div class="g-sum"><span>หน่วยกิตรวมของเทอมนี้</span><span>{fmtCredit(sum2)} หน่วยกิต</span></div>

	<form class="box add" method="POST" action={actionUrl(page.url, 'subjectAdd')} use:enhance={handle((d) => `เพิ่มวิชา ${d.added} แล้ว`, () => (editing = null))}>
		<input type="hidden" name="termNo" value={termNo} />
		<h2>+ เพิ่มวิชา</h2>
		<div class="g-grid2">
			<div><label for="acode">รหัสวิชา (ไม่ใส่ก็ได้)</label><input type="text" id="acode" name="code" maxlength="20" autocomplete="off" placeholder="เช่น ค21101" /></div>
			<div><label for="acred">หน่วยกิต</label><input type="text" id="acred" name="credit" inputmode="decimal" maxlength="4" autocomplete="off" placeholder="1.5" /></div>
		</div>
		<label for="aname">ชื่อวิชา</label>
		<input type="text" id="aname" name="name" maxlength="100" autocomplete="off" placeholder="เช่น คณิตศาสตร์พื้นฐาน" />
		{#if err && err.form === 'add'}<p class="err" role="alert">{err.text}</p>{/if}
		<button class="btn" type="submit">เพิ่มวิชา</button>
		<p class="hint">หน่วยกิตใส่ได้ครั้งละ 0.5 เช่น 0.5, 1, 1.5</p>
	</form>

	{#if copyChoices.length}
		<form class="box" method="POST" action={actionUrl(page.url, 'termCopy')} use:enhance={handle((d) => `คัดลอก ${d.count} วิชาจาก ${d.copied} แล้ว`, () => (copyFrom = ''))}>
			<input type="hidden" name="to" value={termNo} />
			<label for="cfrom" style="margin-top: 0">⧉ คัดลอกวิชาจากเทอมอื่นมาใส่เทอมนี้</label>
			<select id="cfrom" name="from" bind:value={copyFrom} class="g-select">
				<option value="">เลือกเทอมต้นทาง</option>
				{#each copyChoices as t (t.no)}<option value={t.no}>{t.label} ({countOf(t.no)} วิชา)</option>{/each}
			</select>
			{#if err && err.form === 'copy'}<p class="err" role="alert">{err.text}</p>{/if}
			<button class="btn alt" type="submit" disabled={copyFrom === ''} class:sure={sure === 'copy'} style="width: 100%; margin-top: 10px; min-height: 48px" onclick={(e) => list.length && arm(e, 'copy')}>
				{sure === 'copy' ? `ยืนยัน แทนที่ ${list.length} วิชาเดิมของเทอมนี้?` : 'คัดลอกมาใส่เทอมนี้'}
			</button>
			{#if list.length}<p class="hint">วิชาเดิมของเทอมนี้จะถูกแทนที่ทั้งหมด</p>{/if}
		</form>
	{/if}

	<details class="g-settings" open>
		<summary>⚙ ตั้งค่าหลักสูตร</summary>
		<form method="POST" action={actionUrl(page.url, 'courseSave')} use:enhance={handle(() => 'บันทึกการตั้งค่าแล้ว')}>
			<label for="sname">ชื่อหลักสูตรที่แสดง</label>
			<input type="text" id="sname" name="name" value={data.course.name} maxlength="60" autocomplete="off" />
			<label for="snote">ข้อความท้ายหน้า (ไม่ใส่ก็ได้)</label>
			<input type="text" id="snote" name="note" value={data.course.note} maxlength="300" autocomplete="off" placeholder="เช่น ใช้ประกอบการประเมินเบื้องต้นเท่านั้น" />
			<p class="hint">ข้อความนี้แสดงใต้การ์ดสรุป GPA ในหน้าผู้ใช้</p>
			{#if err && err.form === 'course'}<p class="err" role="alert">{err.text}</p>{/if}
			<button class="btn" type="submit">บันทึก</button>
		</form>
	</details>
</div>
