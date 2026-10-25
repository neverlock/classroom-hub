<script lang="ts">
	import { linkify } from '#lib/linkify.js';
	let { text }: { text: string } = $props();
	const parts = $derived(linkify(text));
</script>

{#each parts as part}{#if 'href' in part}<a class="lnk" href={part.href} target="_blank" rel="noopener noreferrer nofollow" title={part.href}>{part.icon} <b>{part.label}</b></a>{:else}{part.text}{/if}{/each}
