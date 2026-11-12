<script lang="ts">
	let { done, ontoggle }: { done: boolean; ontoggle: () => void } = $props();
</script>

<button type="button" class="hw-mark" aria-pressed={done} onclick={ontoggle}>
	<span class="hw-tick" aria-hidden="true">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 12.5l4.5 4.5 8.5-9.5" /></svg>
	</span>
	<span>{done ? 'ทำแล้ว' : 'ยังไม่ทำ'}</span>
</button>
