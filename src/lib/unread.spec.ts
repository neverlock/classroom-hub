import { describe, expect, it } from 'vitest';
import { unreadIds } from './unread';

describe('unreadIds', () => {
	it('flags every comment above the read mark, and all of them when nothing was read yet', () => {
		expect(unreadIds([4, 7, 9], undefined)).toEqual([4, 7, 9]);
		expect(unreadIds([4, 7, 9], 0)).toEqual([4, 7, 9]);
		expect(unreadIds([4, 7, 9], 7)).toEqual([9]);
		expect(unreadIds([4, 7, 9], 9)).toEqual([]);
	});
	it('handles cards without comments', () => {
		expect(unreadIds([], 0)).toEqual([]);
	});
});
