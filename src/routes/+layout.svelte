<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { toastState } from '#lib/toast.svelte.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

{#if toastState.message}
	<div class="toast" role="status">{toastState.message}</div>
{/if}
