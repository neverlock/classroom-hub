<script lang="ts">
	import { page } from '$app/state';
	import { actionUrl } from '#lib/action-url.js';
	import { enhance } from '$app/forms';
	import { fmtDate, fmtDateTime } from '#lib/dates.js';
	import { withToast } from '#lib/enhance.js';
	import { parseStudentLines } from '#lib/validate.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const base = $derived(`/c/${data.slug}`);
	const loginError = $derived((form as { loginError?: string } | null)?.loginError ?? '');

	let editSub = $state<number | null>(null);
	let editStu = $state<number | null>(null);
	let editTerm = $state<number | null>(null);
	let sure = $state('');
	let filter = $state('');
	let bulk = $state('');
	let tName = $state('');
	let tLabel = $state('');
	let tStart = $state('');
	let tEnd = $state('');
	let loginBusy = $state(false);

	// "ask once more" buttons: first click arms, second click submits
	function arm(ev: Event, key: string) {
		if (sure === key) return;
		ev.preventDefault();
		sure = key;
		setTimeout(() => sure === key && (sure = ''), 3000);
	}

	const students = $derived(data.gate ? [] : data.students);
	const preview = $derived(parseStudentLines(bulk, students));
	const okCount = $derived(preview.filter((p) => !p.error).length);
	const shown = $derived(
		students.filter((s) => {
			const f = filter.trim().toLowerCase();
			return !f || String(s.seatNo) === f || s.studentCode.includes(f);
		})
	);
	const activeCount = $derived(students.filter((s) => s.active).length);

	$effect(() => {
		if (!data.gate) {
			tLabel = data.suggested.classLabel;
			tStart = data.suggested.startDate;
			tEnd = data.suggested.endDate;
		}
	});
	const tab = (t: string) => `${base}/manage?tab=${t}`;
</script>

<svelte:head><title>จัดการห้อง {data.label}</title></svelte:head>

<div class="wrap narrow">
	<div class="topbar"><a class="linkbtn" href={base} style="display: inline-grid; place-items: center">← กลับหน้าหลัก</a></div>
	<h1>จัดการห้อง {data.label}</h1>
	<p class="sub">วิชา · นักเรียน · ตั้งค่า</p>
	<hr class="rule" />

	{#if data.gate}
		<section>
			<h2>หน้านี้สำหรับแอดมินห้อง</h2>
			{#if !data.open}
				<div class="warn block">ห้องนี้ปิดอยู่ (อ่านอย่างเดียว) ล็อกอินไม่ได้</div>
			{:else}
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
					<label for="gname">ชื่อผู้ใช้ (user name)</label>
					<input type="text" id="gname" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="เช่น mai" />
					<label for="gpin">รหัสผ่าน</label>
					<input type="password" id="gpin" name="password" autocomplete="current-password" />
					<p class="hint">ถ้าเคยล็อกอินบนเครื่องนี้แล้วจะเข้าหน้านี้ได้ทันที · ลืมรหัสผ่านให้ติดต่อผู้ดูแลระบบ</p>
					{#if loginError}<p class="err" role="alert">{loginError}</p>{/if}
					<button class="btn" type="submit" disabled={loginBusy}>เข้าสู่หน้าจัดการ</button>
				</form>
			{/if}
		</section>
	{:else}
		<div class="who">
			<span>บันทึกโดย: <b>{data.actor.display}</b></span>
			<form method="POST" action={actionUrl(page.url, 'logout')} use:enhance style="display: contents"><button class="linkbtn" type="submit">ออกจากระบบ</button></form>
		</div>
		{#if !data.open}<div class="warn block">ห้องนี้ปิดอยู่ (อ่านอย่างเดียว) แก้ไขไม่ได้</div>{/if}

		<div class="tabs" role="tablist" aria-label="หมวดการจัดการ">
			<a class="tab" role="tab" aria-selected={data.tab === 'subjects'} href={tab('subjects')}>📚 วิชา</a>
			<a class="tab" role="tab" aria-selected={data.tab === 'students'} href={tab('students')}>🧒 นักเรียน</a>
			<a class="tab" role="tab" aria-selected={data.tab === 'settings'} href={tab('settings')}>⚙ ตั้งค่า</a>
		</div>

		{#if data.tab === 'subjects'}
			<h2>วิชาของห้อง</h2>
			<p class="hint">วิชาที่แสดงในช่อง "เลือกวิชา" ตอนบันทึก เรียงตามลำดับนี้ ใช้ปุ่ม ▲ ▼ เลื่อนลำดับ</p>
			<ul class="list">
				{#each data.subjects as s, i (s.id)}
					{#if editSub === s.id}
						<li class="lrow">
							<form class="editgrid g3" method="POST" action={actionUrl(page.url, 'subjectSave')} use:enhance={withToast('แก้ไขวิชาแล้ว', { after: () => (editSub = null) })}>
								<input type="hidden" name="id" value={s.id} />
								<div><label for={`ec${s.id}`} style="margin-top: 0">รหัสวิชา</label><input type="text" id={`ec${s.id}`} name="code" value={s.code} autocomplete="off" /></div>
								<div><label for={`en${s.id}`} style="margin-top: 0">ชื่อวิชา</label><input type="text" id={`en${s.id}`} name="name" value={s.name} autocomplete="off" /></div>
								<div><label for={`et${s.id}`} style="margin-top: 0">ผู้สอน (ไม่ใส่ก็ได้)</label><input type="text" id={`et${s.id}`} name="teacher" value={s.teacher} autocomplete="off" /></div>
								<div class="row2"><button class="btn" type="submit">บันทึก</button><button class="btn alt" type="button" onclick={() => (editSub = null)}>ยกเลิก</button></div>
							</form>
						</li>
					{:else}
						<li class="lrow" class:off={!s.active}>
							<div class="rmain">
								<b>{s.code}</b> {s.name}{#if !s.active}<span class="pill" style="margin-left: 6px">ซ่อนอยู่</span>{/if}
								<small>{s.n} บันทึก{s.teacher ? ` · ผู้สอน ${s.teacher}` : ''}</small>
							</div>
							<div class="rtools">
								<form method="POST" action={actionUrl(page.url, 'subjectMove')} use:enhance={withToast()}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="up" /><button class="ibtn" type="submit" aria-label="เลื่อนขึ้น" disabled={i === 0}>▲</button></form>
								<form method="POST" action={actionUrl(page.url, 'subjectMove')} use:enhance={withToast()}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="dir" value="down" /><button class="ibtn" type="submit" aria-label="เลื่อนลง" disabled={i === data.subjects.length - 1}>▼</button></form>
								<button class="ibtn" type="button" aria-label="แก้ไข" title="แก้ไข" onclick={() => (editSub = s.id)}>✎</button>
								<form method="POST" action={actionUrl(page.url, 'subjectToggle')} use:enhance={withToast((d) => (d.active ? 'แสดงวิชาแล้ว' : 'ซ่อนวิชาแล้ว บันทึกเก่ายังอยู่ครบ'))}>
									<input type="hidden" name="id" value={s.id} /><button class="ibtn" type="submit" aria-label={s.active ? 'ซ่อนวิชา' : 'แสดงวิชา'} title={s.active ? 'ซ่อน' : 'แสดง'}>{s.active ? '🙈' : '👁'}</button>
								</form>
								<form method="POST" action={actionUrl(page.url, 'subjectDelete')} use:enhance={withToast('ลบวิชาแล้ว')}>
									<input type="hidden" name="id" value={s.id} />
									<button class="ibtn" class:sure={sure === `s${s.id}`} type="submit" disabled={s.n > 0} aria-label="ลบวิชา" title={s.n > 0 ? 'ลบไม่ได้ เพราะมีบันทึกแล้ว ให้ซ่อนแทน' : 'ลบ'} onclick={(e) => arm(e, `s${s.id}`)}>
										{sure === `s${s.id}` ? 'ยืนยัน?' : '🗑'}
									</button>
								</form>
							</div>
						</li>
					{/if}
				{:else}
					<li class="empty">ยังไม่มีวิชา เพิ่มวิชาแรกด้านล่าง</li>
				{/each}
			</ul>
			<form class="box add" method="POST" action={actionUrl(page.url, 'subjectAdd')} use:enhance={withToast((d) => `เพิ่มวิชา ${d.added} แล้ว`)}>
				<h2>+ เพิ่มวิชา</h2>
				<label for="scode">รหัสวิชา</label>
				<input type="text" id="scode" name="code" autocomplete="off" placeholder="เช่น ค21103" />
				<label for="sname">ชื่อวิชา</label>
				<input type="text" id="sname" name="name" autocomplete="off" placeholder="เช่น คณิตศาสตร์ 1" />
				<label for="steach">ผู้สอน (ไม่ใส่ก็ได้)</label>
				<input type="text" id="steach" name="teacher" autocomplete="off" placeholder="เช่น ครูสมศรี" />
				<p class="hint">ถ้าใส่ ชื่อผู้สอนจะแสดงเล็กๆ ที่การ์ดของวิชานี้ในหน้าหลัก (แก้ชื่อผู้สอนแล้ว การ์ดเก่าของวิชานี้จะแสดงชื่อใหม่ด้วย)</p>
				<button class="btn" type="submit">เพิ่มวิชา</button>
			</form>
		{/if}

		{#if data.tab === 'students'}
			<h2>รายชื่อนักเรียน</h2>
			<p class="hint">"รหัส" คือสิ่งที่นักเรียนกรอกตอนเขียนความคิดเห็น ระบบแสดงผลเป็น "เลขที่" · รายชื่อใช้ต่อข้ามปีได้ ความคิดเห็นเก่าเก็บเลขที่ตอนโพสต์ไว้ แก้เลขที่ทีหลังไม่กระทบของเก่า</p>
			<div class="stats"><span>ทั้งหมด <b>{students.length}</b> คน</span><span>ใช้งาน <b>{activeCount}</b></span><span>ซ่อน <b>{students.length - activeCount}</b></span></div>
			<label for="sfilter" style="margin-top: 12px">ค้นหา</label>
			<input type="text" id="sfilter" bind:value={filter} autocomplete="off" placeholder="เลขที่ หรือ รหัส" />
			<ul class="list">
				{#each shown as s (s.id)}
					{#if editStu === s.id}
						<li class="lrow">
							<form class="editgrid" method="POST" action={actionUrl(page.url, 'studentSave')} use:enhance={withToast('แก้ไขแล้ว · ความคิดเห็นเก่ายังแสดงเลขที่เดิมตอนที่โพสต์', { after: () => (editStu = null) })}>
								<input type="hidden" name="id" value={s.id} />
								<div><label for={`es${s.id}`} style="margin-top: 0">เลขที่</label><input type="text" id={`es${s.id}`} name="seat" inputmode="numeric" value={s.seatNo} autocomplete="off" /></div>
								<div><label for={`ek${s.id}`} style="margin-top: 0">รหัส</label><input type="text" id={`ek${s.id}`} name="code" value={s.studentCode} autocomplete="off" /></div>
								<div class="row2"><button class="btn" type="submit">บันทึก</button><button class="btn alt" type="button" onclick={() => (editStu = null)}>ยกเลิก</button></div>
							</form>
						</li>
					{:else}
						<li class="lrow" class:off={!s.active}>
							<div class="rmain"><span class="seat">{s.seatNo}</span>รหัส <b>{s.studentCode}</b>{#if !s.active}<span class="pill" style="margin-left: 6px">ซ่อนอยู่</span>{/if}</div>
							<div class="rtools flex">
								<button class="ibtn" type="button" aria-label="แก้ไข" title="แก้ไข" onclick={() => (editStu = s.id)}>✎</button>
								<form method="POST" action={actionUrl(page.url, 'studentToggle')} use:enhance={withToast((d) => (d.active ? `แสดงเลขที่ ${d.seat} แล้ว` : `ซ่อนเลขที่ ${d.seat} แล้ว รหัสนี้โพสต์ไม่ได้อีก ความคิดเห็นเก่ายังอยู่`))}>
									<input type="hidden" name="id" value={s.id} /><button class="ibtn" type="submit" aria-label={s.active ? 'ซ่อน' : 'แสดง'} title={s.active ? 'ซ่อน (ย้ายออก)' : 'แสดงอีกครั้ง'}>{s.active ? '🙈' : '👁'}</button>
								</form>
							</div>
						</li>
					{/if}
				{:else}
					<li class="empty">{students.length ? `ไม่พบ "${filter}"` : 'ยังไม่มีนักเรียน เพิ่มด้านล่าง'}</li>
				{/each}
			</ul>
			<form class="box add" method="POST" action={actionUrl(page.url, 'studentAdd')} use:enhance={withToast((d) => `เพิ่ม ${d.added} คน${Number(d.skipped) ? ` · ข้าม ${d.skipped} บรรทัดที่ไม่ถูกต้อง` : ''}`, { after: () => (bulk = '') })}>
				<h2>+ เพิ่มนักเรียน</h2>
				<label for="stBulk">วางรายชื่อได้หลายบรรทัด (บรรทัดละคน)</label>
				<textarea id="stBulk" name="bulk" bind:value={bulk} placeholder={'12 10112\n13 10113\nหรือพิมพ์เฉพาะรหัส ระบบเรียงเลขที่ต่อให้'} style="min-height: 96px"></textarea>
				<p class="hint">รูปแบบ: <b>เลขที่ รหัส</b> (คั่นด้วยเว้นวรรค จุลภาค หรือแท็บ) · วางจาก Excel/Google Sheets ได้ · รหัสเป็นตัวอักษรหรือตัวเลข 3–20 ตัว</p>
				<ul class="preview">
					{#each preview as r}
						<li>{#if r.error}<span class="bad">✗</span><span>{r.raw} — {r.error}</span>{:else}<span class="ok">✓</span><span>เลขที่ <b>{r.seatNo}</b> · รหัส <b>{r.studentCode}</b></span>{/if}</li>
					{/each}
				</ul>
				<button class="btn" type="submit" disabled={okCount === 0}>{okCount ? `เพิ่มนักเรียน ${okCount} คน` : 'เพิ่มนักเรียน'}</button>
			</form>
		{/if}

		{#if data.tab === 'settings'}
			<div class="box" style="margin-top: 0">
				<h2>ภาคเรียน</h2>
				<p class="hint" style="margin-top: 2px">หน้าหลักแสดงเฉพาะข้อมูลของ "ภาคเรียนปัจจุบัน" และใช้ชื่อห้องของภาคเรียนนั้น ภาคเรียนเก่าไม่หาย ผู้ใช้เลือกดูย้อนหลังได้จากตัวเลือกภาคเรียนใต้แถบเลือกวัน</p>
				<ul class="list">
					{#each data.terms as t (t.id)}
						{#if editTerm === t.id}
							<li class="lrow">
								<form class="editgrid g4" method="POST" action={actionUrl(page.url, 'termSave')} use:enhance={withToast('แก้ไขภาคเรียนแล้ว', { reset: false, after: () => (editTerm = null) })}>
									<input type="hidden" name="id" value={t.id} />
									<div><label for={`xn${t.id}`} style="margin-top: 0">ชื่อภาคเรียน</label><input type="text" id={`xn${t.id}`} name="name" value={t.name} autocomplete="off" /></div>
									<div><label for={`xl${t.id}`} style="margin-top: 0">ชื่อห้อง</label><input type="text" id={`xl${t.id}`} name="label" value={t.classLabel} autocomplete="off" /></div>
									<div><label for={`xs${t.id}`} style="margin-top: 0">วันเปิดเทอม</label><input type="date" id={`xs${t.id}`} name="start" value={t.startDate} /></div>
									<div><label for={`xe${t.id}`} style="margin-top: 0">วันปิดเทอม</label><input type="date" id={`xe${t.id}`} name="end" value={t.endDate} /></div>
									<div class="row2"><button class="btn" type="submit">บันทึก</button><button class="btn alt" type="button" onclick={() => (editTerm = null)}>ยกเลิก</button></div>
								</form>
							</li>
						{:else}
							<li class="lrow" class:off={!t.isCurrent}>
								<div class="rmain"><b>{t.name}</b> · {t.classLabel}{#if t.isCurrent}<span class="pill on" style="margin-left: 6px">ปัจจุบัน</span>{/if}<small>{fmtDate(t.startDate)} – {fmtDate(t.endDate)}</small></div>
								<div class="rtools flex">
									<button class="ibtn" type="button" aria-label="แก้ไข" title="แก้ไข" onclick={() => (editTerm = t.id)}>✎</button>
									{#if !t.isCurrent}
										<form method="POST" action={actionUrl(page.url, 'termSetCurrent')} use:enhance={withToast((d) => `ตั้ง ${d.current} เป็นภาคเรียนปัจจุบันแล้ว · หน้าหลักจะแสดงข้อมูลของภาคเรียนนี้`)}>
											<input type="hidden" name="id" value={t.id} /><button class="sbtn" type="submit">ตั้งเป็นปัจจุบัน</button>
										</form>
									{/if}
								</div>
							</li>
						{/if}
					{:else}
						<li class="empty">ยังไม่มีภาคเรียน สร้างภาคเรียนแรกด้านล่าง หน้าหลักจะใช้งานได้หลังมีภาคเรียนปัจจุบัน</li>
					{/each}
				</ul>
			</div>
			<form class="box add" method="POST" action={actionUrl(page.url, 'termCreate')} use:enhance={withToast((d) => `สร้าง ${d.created} แล้ว${d.current ? ' · เป็นภาคเรียนปัจจุบัน' : ''}`, { reset: false, after: () => (tName = '') })}>
				<h2>+ สร้างภาคเรียนใหม่</h2>
				<label for="tnm">ชื่อภาคเรียน</label>
				<input type="text" id="tnm" name="name" bind:value={tName} autocomplete="off" placeholder="เช่น ภาคเรียนที่ 1/2027" />
				<label for="tlb">ชื่อห้องในภาคเรียนนี้</label>
				<input type="text" id="tlb" name="label" bind:value={tLabel} autocomplete="off" placeholder="เช่น ป.6/1" />
				<div class="cols">
					<div><label for="tst">วันเปิดเทอม</label><input type="date" id="tst" name="start" bind:value={tStart} /></div>
					<div><label for="ten">วันปิดเทอม</label><input type="date" id="ten" name="end" bind:value={tEnd} /></div>
				</div>
				<label class="check" for="tcur"><input type="checkbox" id="tcur" name="makeCurrent" checked /> ตั้งเป็นภาคเรียนปัจจุบันเลย</label>
				<div class="warn block">
					<b>ขึ้นปีการศึกษาใหม่ ทำตามนี้</b>
					<ol class="steps">
						<li>สร้างภาคเรียนใหม่ด้านบน แล้วเปลี่ยนชื่อห้อง (เช่น ป.5/1 → ป.6/1)</li>
						<li>แท็บ 🧒 นักเรียน: ซ่อนคนที่ย้ายออก เพิ่มคนใหม่ ปรับเลขที่ถ้าเปลี่ยน</li>
						<li>แท็บ 📚 วิชา: ซ่อนวิชาที่ไม่เรียนแล้ว เพิ่มวิชาและผู้สอนของปีนี้</li>
					</ol>
					ข้อมูลปีเก่าอยู่ครบ ไม่ต้องลบอะไร
				</div>
				<button class="btn" type="submit">สร้างภาคเรียน</button>
			</form>

			<div class="box">
				<h2>แอดมินห้อง</h2>
				<p class="hint" style="margin-top: 2px">คนที่ล็อกอินบันทึกข้อมูลของห้องนี้ได้ ชื่อที่แสดง (display) จะขึ้นเป็นผู้บันทึกบนการ์ด</p>
				<ul class="list">
					{#each data.admins as a (a.id)}
						<li class="lrow" class:off={!a.active}>
							<div class="rmain"><b>{a.display}</b> <span class="pill">@{a.username}</span>{#if !a.active}<span class="pill" style="margin-left: 6px">ปิดใช้งาน</span>{/if}
								<small>ใช้ล่าสุด: {a.lastLoginAt ? fmtDateTime(a.lastLoginAt, data.today) : 'ยังไม่เคยล็อกอิน'}{a.id === data.actor.adminId ? ' · นี่คือคุณ' : ''}</small></div>
						</li>
					{:else}
						<li class="empty">ยังไม่มีแอดมินห้อง</li>
					{/each}
				</ul>
				<div class="warn block">เพิ่มแอดมิน ตั้งรหัสผ่านใหม่ หรือปิดใช้งาน ให้ติดต่อผู้ดูแลระบบ (super admin) แอดมินห้องไม่สามารถเปลี่ยนรหัสผ่านเองได้</div>
			</div>

			<div class="box">
				<h2>ที่ซ่อนไว้ <span class="pill">{data.hiddenEntries.length + data.hiddenComments.length}</span></h2>
				<p class="hint" style="margin-top: 2px">การ์ดหรือความคิดเห็นที่แอดมินซ่อน ยังไม่ถูกลบจริง กู้คืนได้</p>
				<ul class="list">
					{#each data.hiddenEntries as h (h.id)}
						<li class="lrow">
							<div class="rmain"><span class="pill" style="margin-right: 6px">การ์ด</span>{h.code} · {fmtDate(h.date)}<small>ซ่อนโดย {h.by ?? '-'}{h.at ? ` · ${fmtDateTime(h.at, data.today)}` : ''}</small></div>
							<form method="POST" action={actionUrl(page.url, 'restoreEntry')} use:enhance={withToast('กู้คืนแล้ว')}><input type="hidden" name="id" value={h.id} /><button class="sbtn" type="submit">กู้คืน</button></form>
						</li>
					{/each}
					{#each data.hiddenComments as h (h.id)}
						<li class="lrow">
							<div class="rmain"><span class="pill" style="margin-right: 6px">ความคิดเห็น</span>เลขที่ {h.seat} ใต้การ์ด {h.code} · {fmtDate(h.date)}<small>{h.body || '(รูป)'} · ซ่อนโดย {h.by ?? '-'}</small></div>
							<form method="POST" action={actionUrl(page.url, 'restoreComment')} use:enhance={withToast('กู้คืนแล้ว')}><input type="hidden" name="id" value={h.id} /><button class="sbtn" type="submit">กู้คืน</button></form>
						</li>
					{/each}
					{#if data.hiddenEntries.length + data.hiddenComments.length === 0}<li class="empty">ไม่มีรายการที่ซ่อนไว้</li>{/if}
				</ul>
			</div>
		{/if}
	{/if}
</div>
