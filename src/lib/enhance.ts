import type { SubmitFunction } from '$app/forms';
import { toast } from '#lib/toast.svelte.js';

/**
 * `use:enhance` handler: shows the server's error as a toast on failure, a success message otherwise,
 * and refreshes the page data. Inputs are kept on failure so nothing typed is lost.
 */
export function withToast(ok?: string | ((data: Record<string, unknown>) => string), opts: { reset?: boolean; after?: () => void } = {}): SubmitFunction {
	return () =>
		async ({ result, update }) => {
			if (result.type === 'failure') {
				toast(String((result.data as { error?: string } | undefined)?.error ?? 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'), 4200);
				return;
			}
			if (result.type === 'success' && ok) {
				const data = (result.data ?? {}) as Record<string, unknown>;
				toast(typeof ok === 'function' ? ok(data) : ok);
			}
			await update({ reset: opts.reset ?? true });
			if (result.type === 'success') opts.after?.();
		};
}
