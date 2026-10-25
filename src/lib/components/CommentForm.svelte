<script lang="ts">
	import { page } from '$app/state';
	import { actionUrl } from '#lib/action-url.js';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '$app/forms';
	import type { Shrunk } from '#lib/image-client.js';
	import { toast } from '#lib/toast.svelte.js';
	import PhotoPicker from './PhotoPicker.svelte';

	let { entryId, student }: { entryId: number; student: { seatNo: number } | null } = $props();
	let pending = $state<Shrunk[]>([]);
	let keep = $state<number[]>([]);
	let error = $state('');
	let busy = $state(false);

	const submit: SubmitFunction = ({ formData, action }) => {
		if (action.search.includes('forgetStudent')) return; // plain "not me" button: default handling
		busy = true;
		error = '';
		formData.delete('photos');
		for (const p of pending) formData.append('photos', new File([p.blob], p.name, { type: p.blob.type }));
		return async ({ result, update }) => {
			busy = false;
			if (result.type === 'failure') {
				error = String((result.data as { error?: string } | undefined)?.error ?? 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
				return;
			}
			if (result.type === 'success') {
				pending = [];
				toast('โพสต์ความคิดเห็นแล้ว');
			}
			await update();
		};
	};
</script>

<form class="cform" method="POST" action={actionUrl(page.url, 'comment')} enctype="multipart/form-data" use:enhance={submit}>
	<input type="hidden" name="entryId" value={entryId} />
	{#if student}
		<div class="cwho">
			<span>โพสต์ในนาม <b>เลขที่ {student.seatNo}</b></span>
			<button class="linkbtn" type="submit" formaction={actionUrl(page.url, 'forgetStudent')} formnovalidate>ไม่ใช่ฉัน?</button>
		</div>
	{:else}
		<label for={`cc-${entryId}`}>รหัส</label>
		<input type="password" id={`cc-${entryId}`} name="code" autocomplete="off" placeholder="รหัสของคุณ" />
		<p class="hint">กรอกครั้งเดียว ระบบจำเครื่องนี้ไว้ ไม่ต้องกรอกอีก</p>
	{/if}
	<label for={`ct-${entryId}`}>ความคิดเห็น</label>
	<textarea id={`ct-${entryId}`} name="body" placeholder="ถามเพื่อน ตอบเพื่อน หรือวางลิงก์ (Classroom / Canva / YouTube)" maxlength="2000"></textarea>
	<PhotoPicker id={`cf-${entryId}`} max={2} label="แนบรูป (ไม่เกิน 2 รูป)" bind:pending bind:keep />
	{#if error}<p class="err" role="alert">{error}</p>{/if}
	<button class="btn" type="submit" disabled={busy}>{busy ? 'กำลังโพสต์…' : 'โพสต์ความคิดเห็น'}</button>
</form>
