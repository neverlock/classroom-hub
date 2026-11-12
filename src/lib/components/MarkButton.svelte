<script lang="ts">
	let { done, ontoggle }: { done: boolean; ontoggle: () => void } = $props();
</script>

<button type="button" class="hw-mark" aria-pressed={done} onclick={ontoggle}>
	<span class="box" aria-hidden="true">✓</span>
	<span>{done ? 'ทำแล้ว' : 'ยังไม่ทำ'}</span>
</button>
