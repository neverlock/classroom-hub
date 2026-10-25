<script lang="ts">
	import { fileSize } from '#lib/dates.js';
	import { shrinkImage, type Shrunk } from '#lib/image-client.js';

	interface Props {
		id: string;
		/** Max photos in total (kept + new). */
		max: number;
		label: string;
		/** Photos that are already stored (edit mode). Removing one drops it from `keep`. */
		existing?: number[];
		pending?: Shrunk[];
		keep?: number[];
	}
	let { id, max, label, existing = [], pending = $bindable([]), keep = $bindable([]) }: Props = $props();
	let error = $state('');

	const total = $derived(pending.length + keep.length);

	async function pick(ev: Event) {
		const input = ev.currentTarget as HTMLInputElement;
		const files = [...(input.files ?? [])];
		input.value = '';
		error = '';
		for (const f of files) {
			if (pending.length + keep.length >= max) {
				error = `แนบได้ไม่เกิน ${max} รูป`;
				break;
			}
			try {
				pending = [...pending, await shrinkImage(f)];
			} catch {
				error = `เครื่องนี้อ่านรูป ${f.name} ไม่ได้ ลองเลือกรูปอื่น`;
			}
		}
	}
	function removePending(i: number) {
		URL.revokeObjectURL(pending[i].url);
		pending = pending.filter((_, n) => n !== i);
	}
	// when the form switches to another entry, start from that entry's stored photos
	$effect(() => {
		keep = [...existing];
	});
</script>

<label for={id}>{label}</label>
<input type="file" {id} accept="image/*" multiple onchange={pick} disabled={total >= max} />
<div class="thumbs">
	{#each keep as pid (pid)}
		<div class="thumb">
			<img src={`/img/${pid}`} alt="" />
			<span>รูปที่แนบไว้</span>
			<button type="button" class="linkbtn" aria-label="เอารูปออก" onclick={() => (keep = keep.filter((k) => k !== pid))}>✕</button>
		</div>
	{/each}
	{#each pending as p, i (p.url)}
		<div class="thumb">
			<img src={p.url} alt="" />
			<span>ย่อแล้ว<small>{fileSize(p.before)} → {fileSize(p.after)}</small></span>
			<button type="button" class="linkbtn" aria-label="เอารูปออก" onclick={() => removePending(i)}>✕</button>
		</div>
	{/each}
</div>
{#if error}<p class="err" role="alert">{error}</p>{/if}
