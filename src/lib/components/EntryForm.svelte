<script lang="ts">
	import { page } from '$app/state';
	import { actionUrl } from '#lib/action-url.js';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { SubmitFunction } from '$app/forms';
	import { addDays, fmtDate } from '#lib/dates.js';
	import type { Shrunk } from '#lib/image-client.js';
	import { toast } from '#lib/toast.svelte.js';
	import PhotoPicker from './PhotoPicker.svelte';

	interface Props {
		slug: string;
		/** Who is writing: a signed-in room admin, a remembered student, or nobody yet (then the form asks for the code). */
		identity: { kind: 'admin'; display: string } | { kind: 'student'; seatNo: number } | null;
		subjects: { id: number; code: string; name: string }[];
		term: { name: string; startDate: string; endDate: string } | null;
		date: string;
		subjectId: string;
	}
	let { slug, identity, subjects, term, date = $bindable(), subjectId = $bindable() }: Props = $props();

	let lesson = $state('');
	let hasHomework = $state('0');
	let detail = $state('');
	let due = $state('');
	let existing = $state<number[]>([]);
	let keep = $state<number[]>([]);
	let pending = $state<Shrunk[]>([]);
	let editing = $state(false);
	let notice = $state('');
	let blocked = $state(false);
	let error = $state('');
	let busy = $state(false);
	let seq = 0;

	function clearFields() {
		lesson = '';
		hasHomework = '0';
		detail = '';
		due = '';
		existing = [];
		pending = [];
	}

	// Picking a date + subject that already has a card loads it, so saving edits the card instead of overwriting blindly.
	$effect(() => {
		const d = date;
		const s = subjectId;
		const mine = ++seq;
		if (!d || !s) {
			editing = false;
			return;
		}
		fetch(`/c/${slug}/entry?date=${encodeURIComponent(d)}&subject=${encodeURIComponent(s)}`)
			.then((r) => r.json() as Promise<{ exists: boolean; editable?: boolean | null; author?: string; lesson?: string; hasHomework?: boolean; detail?: string; due?: string; photos?: number[] }>)
			.then((j) => {
				if (mine !== seq) return;
				notice = '';
				blocked = false;
				if (j.exists && j.editable) {
					editing = true;
					lesson = j.lesson ?? '';
					hasHomework = j.hasHomework ? '1' : '0';
					detail = j.detail ?? '';
					due = j.due ?? '';
					existing = j.photos ?? [];
					return;
				}
				if (editing) {
					editing = false;
					clearFields();
				}
				if (j.exists) {
					blocked = j.editable === false;
					notice = `วิชานี้ของวันที่เลือกมีบันทึกอยู่แล้ว (โดย ${j.author}) แก้ไขได้เฉพาะผู้บันทึกหรือแอดมิน · เขียนเพิ่มเป็นความคิดเห็นใต้การ์ดได้`;
				}
			})
			.catch(() => {});
	});

	$effect(() => {
		if (hasHomework === '1' && !due && date) due = addDays(date, 1);
	});

	const submit: SubmitFunction = ({ formData, action }) => {
		if (action.search.includes('forgetStudent')) return; // plain "not me" button: default handling
		busy = true;
		error = '';
		formData.delete('photos');
		for (const p of pending) formData.append('photos', new File([p.blob], p.name, { type: p.blob.type }));
		for (const id of keep) formData.append('keep', String(id));
		return async ({ result }) => {
			busy = false;
			if (result.type === 'failure' || result.type === 'error') {
				error = String((result as { data?: { error?: string } }).data?.error ?? 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
				return;
			}
			if (result.type === 'success') {
				const d = String((result.data as { date?: string }).date ?? date);
				const updated = !!(result.data as { updated?: boolean }).updated;
				toast(updated ? 'แก้ไขเรียบร้อย' : 'บันทึกเรียบร้อย');
				subjectId = '';
				editing = false;
				clearFields();
				await goto(`?d=${d}`, { refreshAll: true });
			}
		};
	};
</script>

<form method="POST" action={actionUrl(page.url, 'saveEntry')} enctype="multipart/form-data" use:enhance={submit}>
	<div class="who">
		{#if identity?.kind === 'admin'}
			<span>บันทึกโดย: <b>{identity.display}</b></span>
		{:else if identity?.kind === 'student'}
			<span>บันทึกโดย: <b>เลขที่ {identity.seatNo}</b></span>
			<button class="linkbtn" type="submit" formaction={actionUrl(page.url, 'forgetStudent')} formnovalidate>ไม่ใช่ฉัน?</button>
		{:else}
			<span>ทุกคนในห้องบันทึกได้ แค่กรอกรหัสของคุณ</span>
		{/if}
	</div>
	<h3 style="margin-top: 8px">{editing ? 'แก้ไขข้อมูลที่บันทึกไว้' : 'ฟอร์มบันทึกข้อมูล'}</h3>
	{#if editing}<div class="note-edit">วิชานี้มีบันทึกของวันที่เลือกอยู่แล้ว กำลังแก้ไขของเดิม ไม่สร้างซ้ำ</div>{/if}
	{#if notice}<div class="note-edit" role="status">{notice}</div>{/if}
	{#if term}<p class="hint">เลือกวันที่ได้ในช่วง {term.name} ({fmtDate(term.startDate)} – {fmtDate(term.endDate)})</p>{/if}
	<div class="cols">
		<div>
			<label for="fdate">วันที่เรียน *</label>
			<input type="date" id="fdate" name="date" bind:value={date} min={term?.startDate} max={term?.endDate} required />
		</div>
		<div>
			<label for="fsubject">วิชา *</label>
			<select id="fsubject" name="subjectId" bind:value={subjectId} required>
				<option value="">-- เลือกวิชา --</option>
				{#each subjects as s (s.id)}<option value={String(s.id)}>{s.code} {s.name}</option>{/each}
			</select>
		</div>
	</div>
	<label for="flesson">สิ่งที่เรียนวันนี้ (เนื้อหาที่เรียน/งานในคาบ) *</label>
	<textarea id="flesson" name="lesson" bind:value={lesson} maxlength="4000" required></textarea>
	<p class="hint">วางลิงก์ Google Classroom / Canva / YouTube ในข้อความได้เลย ระบบจะแสดงเป็นปุ่มให้กด</p>
	<label for="fhw">การบ้าน *</label>
	<select id="fhw" name="hasHomework" bind:value={hasHomework}>
		<option value="0">ไม่มี</option>
		<option value="1">มี</option>
	</select>
	{#if hasHomework === '1'}
		<label for="fdetail">โจทย์การบ้าน *</label>
		<textarea id="fdetail" name="detail" bind:value={detail} maxlength="4000"></textarea>
		<label for="fdue">วันที่ส่ง *</label>
		<input type="date" id="fdue" name="due" bind:value={due} />
	{/if}
	<PhotoPicker id="fphotos" max={3} label="แนบรูป (ไม่เกิน 3 รูป · ถ่ายจากมือถือได้ ระบบย่อให้เอง)" {existing} bind:pending bind:keep />
	{#if !identity}
		<label for="fcode">รหัส *</label>
		<input type="password" id="fcode" name="code" autocomplete="off" placeholder="รหัสของคุณ" />
		<p class="hint">กรอกครั้งเดียว ระบบจำเครื่องนี้ไว้ ไม่ต้องกรอกอีก</p>
	{/if}
	{#if error}<p class="err" role="alert">{error}</p>{/if}
	<button class="btn" type="submit" disabled={busy || blocked}>{busy ? 'กำลังบันทึก…' : editing ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล'}</button>
</form>
