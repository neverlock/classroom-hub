<script lang="ts">
	import { enhance } from '$app/forms';
	import { fileSize } from '#lib/dates.js';
	import { randomPassword } from '#lib/password.js';
	import { toast } from '#lib/toast.svelte.js';
	import type { SubmitFunction } from '$app/forms';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	interface Reveal {
		roomId: number;
		slug: string;
		display: string;
		username: string;
		password: string;
	}
	let reveal = $state<Reveal | null>(null);
	let openRoom = $state<number | null>(null);
	let resetFor = $state<{ id: number; pw: string } | null>(null);
	let sure = $state('');
	let slug = $state('');
	let newPw = $state(randomPassword());
	let addPw = $state(randomPassword());
	let formError = $state<{ roomId?: number; adminId?: number; text: string } | null>(null);
	let createError = $state('');

	const on = $derived(data.rooms.filter((r) => r.active).length);
	const pct = $derived(Math.min(100, Math.max(1, Math.round((data.usedBytes / data.freeBytes) * 100))));

	function arm(ev: Event, key: string) {
		if (sure === key) return;
		ev.preventDefault();
		sure = key;
		setTimeout(() => sure === key && (sure = ''), 3000);
	}

	/** Generic handler: remember credentials to show once, show errors inline, refresh data. */
	function handle(msg?: (d: Record<string, unknown>) => string, onOk?: (d: Record<string, unknown>) => void): SubmitFunction {
		return () =>
			async ({ result, update }) => {
				formError = null;
				if (result.type === 'failure') {
					const d = (result.data ?? {}) as { error?: string; roomId?: number; adminId?: number };
					formError = { roomId: d.roomId, adminId: d.adminId, text: d.error ?? 'เกิดข้อผิดพลาด' };
					return;
				}
				if (result.type === 'success') {
					const d = (result.data ?? {}) as Record<string, unknown>;
					if (d.reveal) reveal = d.reveal as Reveal;
					if (msg) toast(msg(d));
					onOk?.(d);
				}
				await update({ reset: false });
			};
	}
	async function copy(text: string, ok: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast(ok);
		} catch {
			toast('คัดลอกไม่ได้ ให้จดไว้เอง');
		}
	}
</script>

<svelte:head><title>จัดการระบบห้องเรียน</title></svelte:head>

<div class="wrap narrow">
	<h1>จัดการระบบ</h1>
	<p class="sub">สำหรับผู้ดูแลระบบ (super admin) เท่านั้น</p>
	<div class="warn" style="justify-content: center">🔐 เข้าสู่ระบบด้วย Cloudflare Access: <b style="overflow-wrap: anywhere">{data.email}</b></div>

	<div class="nums">
		<div class="num"><b>{data.rooms.length}</b><span>ห้องทั้งหมด</span></div>
		<div class="num"><b>{on}</b><span>เปิดใช้งาน</span></div>
		<div class="num"><b>{fileSize(data.usedBytes)}</b><span>พื้นที่รูป</span></div>
	</div>
	<div class="bar" role="img" aria-label={`พื้นที่เก็บรูปที่ใช้ไปแล้ว ${pct} เปอร์เซ็นต์`}><i style={`width: ${pct}%`}></i></div>
	<p class="hint">ใช้ไป {fileSize(data.usedBytes)} จาก 10 GB ของพื้นที่ฟรี (ประมาณการ ตรวจโควตาจริงที่ Cloudflare)</p>

	<h2 class="sec">ห้องเรียน</h2>
	<ul class="list">
		{#each data.rooms as r (r.id)}
			{@const activeAdmins = r.admins.filter((a) => a.active).length}
			<li class="room" class:off={!r.active} class:fresh={reveal?.roomId === r.id && !!reveal}>
				<div class="top"><h3>{r.label}</h3><span class="pill" class:on={r.active}>{r.active ? 'เปิดใช้งาน' : 'ปิดอยู่ (อ่านอย่างเดียว)'}</span></div>
				<div class="url">/c/{r.slug}</div>
				<div class="rmeta"><span>{r.term ?? 'ยังไม่มีภาคเรียน'}</span><span>นักเรียน <b>{r.students}</b></span><span>บันทึก <b>{r.entries}</b></span><span>แอดมิน <b>{activeAdmins}</b>/{r.admins.length}</span></div>

				{#if openRoom === r.id || reveal?.roomId === r.id}
					<div class="pinbox">
						<b>แอดมินห้อง ({r.admins.length})</b>
						<ul class="alist">
							{#each r.admins as a (a.id)}
								<li class="arow" class:off={!a.active}>
									<div class="rmain"><b>{a.display}</b> <span class="url">@{a.username}</span>{#if !a.active} <span class="pill">ปิดใช้งาน</span>{/if}<small>บันทึกไปแล้ว {a.posts} ครั้ง</small></div>
									{#if resetFor?.id === a.id}
										<form method="POST" action="?/resetAdmin" use:enhance={handle((d) => `ตั้งรหัสผ่านใหม่ให้ ${d.reset} แล้ว · ออกจากระบบทุกเครื่องของแอดมินคนนี้`, () => (resetFor = null))}>
											<input type="hidden" name="id" value={a.id} />
											<div class="pinrow" style="margin-top: 6px">
												<input type="text" name="password" bind:value={resetFor!.pw} autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="รหัสผ่านใหม่" />
												<button class="sbtn" type="button" aria-label="สุ่มใหม่" onclick={() => resetFor && (resetFor.pw = randomPassword())}>🎲</button>
											</div>
											{#if formError && formError.adminId === a.id}<p class="err" role="alert">{formError.text}</p>{/if}
											<div class="tools"><button class="sbtn primary" type="submit">ตั้งรหัสผ่านใหม่</button><button class="sbtn" type="button" onclick={() => (resetFor = null)}>ยกเลิก</button></div>
										</form>
									{:else}
										<div class="tools">
											<button class="sbtn" type="button" onclick={() => ((resetFor = { id: a.id, pw: randomPassword() }), (reveal = null))}>ตั้งรหัสผ่านใหม่</button>
											<form method="POST" action="?/toggleAdmin" use:enhance={handle((d) => (d.active ? `เปิดใช้งาน ${d.toggled} แล้ว` : `ปิดใช้งาน ${d.toggled} แล้ว ออกจากระบบทุกเครื่อง ข้อมูลที่เคยบันทึกยังอยู่`))} style="display: contents">
												<input type="hidden" name="id" value={a.id} /><button class="sbtn" type="submit">{a.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>
											</form>
											<form method="POST" action="?/deleteAdmin" use:enhance={handle(() => 'ลบแอดมินแล้ว')} style="display: contents">
												<input type="hidden" name="id" value={a.id} />
												<button class="sbtn" class:sure={sure === `a${a.id}`} type="submit" disabled={a.posts > 0} aria-label="ลบแอดมิน" title={a.posts > 0 ? 'ลบไม่ได้ เพราะเคยบันทึกข้อมูลแล้ว ให้ปิดใช้งานแทน' : 'ลบ'} onclick={(e) => arm(e, `a${a.id}`)}>{sure === `a${a.id}` ? 'ยืนยันลบ?' : '🗑'}</button>
											</form>
										</div>
									{/if}
								</li>
							{:else}
								<li class="empty">ยังไม่มีแอดมินห้อง เพิ่มคนแรกด้านล่าง</li>
							{/each}
						</ul>
						{#if reveal && reveal.roomId === r.id}
							<div class="warn block">
								<b>ข้อมูลล็อกอินของ {reveal.display}</b> <small>(แสดงครั้งเดียว)</small>
								<div class="cred">ชื่อผู้ใช้: {reveal.username}<br />รหัสผ่าน: {reveal.password}</div>
								<div class="tools" style="margin-top: 8px">
									<button class="sbtn" type="button" onclick={() => reveal && copy(`ชื่อผู้ใช้: ${reveal.username}\nรหัสผ่าน: ${reveal.password}`, 'คัดลอกชื่อผู้ใช้และรหัสผ่านแล้ว')}>คัดลอก</button>
									<button class="sbtn" type="button" onclick={() => (reveal = null)}>เสร็จแล้ว</button>
								</div>
								<p class="hint">จดหรือส่งให้แอดมินก่อนกด "เสร็จแล้ว" ปิดแล้วดูรหัสผ่านซ้ำไม่ได้ (ลืมให้ตั้งรหัสผ่านใหม่) แอดมินที่ล็อกอินค้างอยู่จะถูกออกจากระบบ</p>
							</div>
						{/if}
						<form class="aform" method="POST" action="?/addAdmin" use:enhance={handle((d) => `เพิ่มแอดมิน ${(d.reveal as Reveal).display} แล้ว · จดรหัสผ่านก่อนกด "เสร็จแล้ว"`, () => (addPw = randomPassword()))}>
							<input type="hidden" name="roomId" value={r.id} />
							<label for={`ad${r.id}`}>เพิ่มแอดมิน · ชื่อที่แสดง</label>
							<input type="text" id={`ad${r.id}`} name="display" autocomplete="off" placeholder="เช่น ครูต้น" />
							<label for={`au${r.id}`}>ชื่อผู้ใช้</label>
							<input type="text" id={`au${r.id}`} name="username" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="เช่น ton" />
							<label for={`ap${r.id}`}>รหัสผ่าน (ตั้งอิสระ 8–128 ตัว)</label>
							<div class="pinrow"><input type="text" id={`ap${r.id}`} name="password" bind:value={addPw} autocomplete="off" autocapitalize="none" spellcheck="false" /><button class="sbtn" type="button" aria-label="สุ่มใหม่" onclick={() => (addPw = randomPassword())}>🎲</button></div>
							{#if formError && formError.roomId === r.id && !formError.adminId}<p class="err" role="alert">{formError.text}</p>{/if}
							<button class="btn" type="submit" style="margin-top: 6px">เพิ่มแอดมิน</button>
						</form>
					</div>
				{/if}

				<div class="tools">
					<form method="POST" action="?/enterRoom" style="display: contents"><input type="hidden" name="id" value={r.id} /><button class="sbtn" type="submit">จัดการห้อง →</button></form>
					<button class="sbtn" type="button" onclick={() => copy(`${location.origin}/c/${r.slug}`, `คัดลอกลิงก์ /c/${r.slug} แล้ว`)}>คัดลอกลิงก์</button>
					<button class="sbtn" type="button" aria-expanded={openRoom === r.id} onclick={() => ((openRoom = openRoom === r.id ? null : r.id), (resetFor = null))}>👤 แอดมินห้อง</button>
					<form method="POST" action="?/toggleRoom" use:enhance={handle((d) => (d.active ? `เปิดห้อง ${r.label} แล้ว` : `ปิดห้อง ${r.label} แล้ว ทุกคนอ่านได้ แต่โพสต์หรือแก้ไขไม่ได้`))} style="display: contents">
						<input type="hidden" name="id" value={r.id} /><button class="sbtn" type="submit">{r.active ? 'ปิดห้อง' : 'เปิดห้องอีกครั้ง'}</button>
					</form>
					<form method="POST" action="?/deleteRoom" use:enhance={handle(() => 'ลบห้องแล้ว')} style="display: contents">
						<input type="hidden" name="id" value={r.id} />
						<button class="sbtn" class:sure={sure === `r${r.id}`} type="submit" disabled={r.entries > 0} aria-label="ลบห้อง" title={r.entries > 0 ? 'ลบไม่ได้ เพราะมีข้อมูลแล้ว ให้ปิดห้องแทน' : 'ลบ'} onclick={(e) => arm(e, `r${r.id}`)}>{sure === `r${r.id}` ? 'ยืนยันลบห้อง?' : r.entries > 0 ? '🗑' : '🗑 ลบ'}</button>
					</form>
				</div>
			</li>
		{:else}
			<li class="empty">ยังไม่มีห้อง สร้างห้องแรกด้านล่าง</li>
		{/each}
	</ul>

	<form
		class="box add"
		style="margin-top: 26px"
		method="POST"
		action="?/createRoom"
		use:enhance={() =>
			async ({ result, update }) => {
				createError = '';
				if (result.type === 'failure') {
					createError = String((result.data as { error?: string } | undefined)?.error ?? 'เกิดข้อผิดพลาด');
					return;
				}
				if (result.type === 'success') {
					reveal = (result.data as { reveal: Reveal }).reveal;
					openRoom = reveal.roomId;
					toast(`สร้างห้อง ${(result.data as { created: string }).created} แล้ว · จดข้อมูลล็อกอินของแอดมินก่อนกด "เสร็จแล้ว"`);
					slug = '';
					newPw = randomPassword();
				}
				await update({ reset: true });
			}}
	>
		<h2>+ สร้างห้องใหม่</h2>
		<label for="nslug" style="margin-top: 8px">ชื่อลิงก์ของห้อง (ตั้งแล้วเปลี่ยนไม่ได้)</label>
		<input type="text" id="nslug" name="slug" bind:value={slug} autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="เช่น p5-1" />
		<p class="urlprev">/c/{slug.trim().toLowerCase() || '…'}</p>
		<p class="hint">ตัวอักษรอังกฤษพิมพ์เล็ก ตัวเลข และขีด 3–30 ตัว ใช้เป็นลิงก์ถาวร ชื่อห้องที่แสดงตั้งในภาคเรียน เปลี่ยนตามปีได้</p>
		<label for="nlabel">ชื่อห้องที่แสดง</label>
		<input type="text" id="nlabel" name="label" autocomplete="off" placeholder="เช่น ป.5/1" />
		<label for="nterm">ภาคเรียนแรก</label>
		<input type="text" id="nterm" name="term" autocomplete="off" placeholder="เช่น ภาคเรียนที่ 1/2027" />
		<div class="cols">
			<div><label for="nst">วันเปิดเทอม</label><input type="date" id="nst" name="start" value={data.defaults.start} /></div>
			<div><label for="nen">วันปิดเทอม</label><input type="date" id="nen" name="end" value={data.defaults.end} /></div>
		</div>
		<h3 style="margin-top: 18px">แอดมินห้องคนแรก</h3>
		<label for="ndisp">ชื่อที่แสดง (display)</label>
		<input type="text" id="ndisp" name="display" autocomplete="off" placeholder="เช่น แม่น้องมาย" />
		<p class="hint">แสดงเป็นผู้บันทึกบนการ์ดในหน้าหลัก</p>
		<label for="nuser">ชื่อผู้ใช้ (user name)</label>
		<input type="text" id="nuser" name="username" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="เช่น mai" />
		<p class="hint">ใช้ล็อกอินตอนบันทึกข้อมูล · a–z 0–9 จุด ขีดกลาง ขีดล่าง 3–20 ตัว</p>
		<label for="npw">รหัสผ่าน</label>
		<div class="pinrow"><input type="text" id="npw" name="password" bind:value={newPw} autocomplete="off" autocapitalize="none" spellcheck="false" /><button class="sbtn" type="button" aria-label="สุ่มใหม่" onclick={() => (newPw = randomPassword())}>🎲 สุ่ม</button></div>
		<p class="hint">ตั้งอิสระได้ ใช้ตัวอักษร ตัวเลข หรือสัญลักษณ์อะไรก็ได้ ยาว 8–128 ตัว (แนะนำให้ใช้ที่ระบบสุ่ม) ระบบเก็บเฉพาะค่าที่เข้ารหัสแล้ว หลังสร้างจะแสดงให้ดูครั้งเดียว แล้วแจ้งแอดมินห้อง</p>
		{#if createError}<p class="err" role="alert">{createError}</p>{/if}
		<button class="btn" type="submit">สร้างห้อง</button>
	</form>

	<h2 class="sec">ระบบ</h2>
	<div class="box" style="margin-top: 8px">
		<b>ผู้ดูแลระบบ (Super admin)</b>
		<p class="hint">เข้าสู่ระบบด้วยอีเมลที่อนุญาตในนโยบาย Cloudflare Access การเพิ่มหรือลบทำที่ Cloudflare Zero Trust (Access → Applications) ไม่แก้ในหน้านี้ เพื่อกันล็อกตัวเองออกจากระบบ</p>
	</div>
	<div class="box">
		<b>สำรองข้อมูล</b>
		<p class="hint">ส่งออกฐานข้อมูลด้วย <code>npx wrangler d1 export classroom-hub --remote --output backup.sql</code> แนะนำให้สำรองก่อนสิ้นภาคเรียนทุกครั้ง</p>
	</div>
</div>
