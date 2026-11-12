<script lang="ts">
	/** Speech bubble; with a count it carries the red badge for new comments. */
	let { count = 0, size = 28 }: { count?: number; size?: number } = $props();
</script>

<span class="bub" class:isnew={count > 0} style={`width: ${size}px; height: ${Math.round(size * 0.93)}px`} aria-hidden="true">
	<svg viewBox="0 0 30 28" width={size} height={Math.round(size * 0.93)}>
		<path d="M4 2h22a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H15l-7 6v-6H4a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3z" fill="currentColor" />
		<circle cx="9" cy="11.5" r="1.8" fill="var(--surface)" /><circle cx="15" cy="11.5" r="1.8" fill="var(--surface)" /><circle cx="21" cy="11.5" r="1.8" fill="var(--surface)" />
	</svg>
	{#if count > 0}<span class="cnt">{count}</span>{/if}
</span>
