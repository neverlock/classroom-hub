<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>บันทึกการเรียนการสอน</title></svelte:head>

<div class="wrap narrow">
	<h1>บันทึกการเรียนการสอน</h1>
	<p class="sub">เลือกห้องเรียน</p>
	<hr class="rule" />
	<div class="list">
		{#each data.rooms as r (r.slug)}
			<a class="roomlink" href={`/c/${r.slug}`}>{r.label}<small>{r.term ?? 'ยังไม่ได้ตั้งภาคเรียน'}</small></a>
		{:else}
			<div class="empty">ยังไม่มีห้องเรียน ผู้ดูแลระบบสร้างห้องได้ที่ /admin</div>
		{/each}
	</div>
</div>
