/**
 * URL for a form action that keeps the page's current query string (`?term=…&d=…`, `?tab=…`).
 * A plain `?/name` action would replace it, and after submitting you would be sent back to the default view.
 */
export function actionUrl(url: { searchParams: { toString(): string } }, name: string): string {
	const q = url.searchParams.toString();
	return `?${q ? q + '&' : ''}/${name}`;
}
