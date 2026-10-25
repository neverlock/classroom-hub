export type Part = { text: string } | { href: string; label: string; icon: string };

const URL_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g;

/** Names the site behind a link so people recognise Classroom / Canva / YouTube at a glance. */
export function describeLink(u: URL): { icon: string; label: string } {
	const h = u.hostname.replace(/^www\./, '');
	if (h === 'classroom.google.com') return { icon: '🎓', label: 'Google Classroom' };
	if (h === 'canva.com' || h === 'canva.link' || h.endsWith('.canva.com')) return { icon: '🎨', label: 'Canva' };
	if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'youtu.be') return { icon: '▶', label: 'YouTube' };
	if (h === 'docs.google.com' || h === 'drive.google.com') return { icon: '📄', label: 'Google Docs/Drive' };
	return { icon: '🔗', label: h };
}

/**
 * Splits text into plain text and http(s) links. Only the URL characters of ASCII are taken, so Thai
 * text right after a link is not swallowed; trailing punctuation stays outside the link. Rendering is
 * done by Svelte text nodes and `<a>` elements (no HTML injection).
 */
export function linkify(text: string): Part[] {
	const parts: Part[] = [];
	let last = 0;
	for (const m of text.matchAll(URL_RE)) {
		let raw = m[0];
		const tail = /[.,;:!?)']+$/.exec(raw)?.[0] ?? '';
		raw = raw.slice(0, raw.length - tail.length);
		let url: URL;
		try {
			url = new URL(raw);
		} catch {
			continue;
		}
		if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
		const start = m.index!;
		if (start > last) parts.push({ text: text.slice(last, start) });
		parts.push({ href: url.href, ...describeLink(url) });
		last = start + raw.length;
	}
	if (last < text.length) parts.push({ text: text.slice(last) });
	return parts;
}
