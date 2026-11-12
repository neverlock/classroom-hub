import { describe, expect, it } from 'vitest';
import { unreadIds } from './unread';

describe('unreadIds', () => {
	it('flags only comments above the baseline and the read mark', () => {
		expect(unreadIds([4, 7, 9], undefined, 5)).toEqual([7, 9]); // 4 existed before the first visit
		expect(unreadIds([4, 7, 9], 7, 5)).toEqual([9]);
		expect(unreadIds([4, 7, 9], 9, 5)).toEqual([]);
		expect(unreadIds([4, 7, 9], 2, 0)).toEqual([4, 7, 9]);
	});
	it('shows nothing until the baseline is known', () => {
		expect(unreadIds([1, 2, 3], undefined, null)).toEqual([]);
	});
	it('handles cards without comments', () => {
		expect(unreadIds([], 0, 0)).toEqual([]);
	});
});
