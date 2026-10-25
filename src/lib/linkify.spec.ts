import { describe, expect, it } from 'vitest';
import { linkify } from './linkify';

describe('linkify', () => {
	it('turns Classroom, Canva and YouTube urls into labelled links', () => {
		const parts = linkify('ส่งที่ https://classroom.google.com/c/abc และ https://www.canva.com/design/x/edit ดู https://youtu.be/q?a=1&b=2.');
		const links = parts.filter((p) => 'href' in p);
		expect(links.map((l) => ('label' in l ? l.label : ''))).toEqual(['Google Classroom', 'Canva', 'YouTube']);
		expect(links[2]).toMatchObject({ href: 'https://youtu.be/q?a=1&b=2' });
	});

	it('keeps Thai text and trailing punctuation outside the link', () => {
		const parts = linkify('ดูคลิป https://youtu.be/x ก่อนนะ');
		expect(parts).toEqual([
			{ text: 'ดูคลิป ' },
			{ href: 'https://youtu.be/x', label: 'YouTube', icon: '▶' },
			{ text: ' ก่อนนะ' }
		]);
	});

	it('shows the host for unknown sites and ignores non-http schemes', () => {
		const parts = linkify('javascript:alert(1) https://evil.example.com/path "x"');
		expect(parts.some((p) => 'href' in p && p.label === 'evil.example.com')).toBe(true);
		expect(parts.some((p) => 'href' in p && p.href.startsWith('javascript'))).toBe(false);
	});

	it('returns plain text unchanged', () => {
		expect(linkify('ไม่มีลิงก์')).toEqual([{ text: 'ไม่มีลิงก์' }]);
	});
});
