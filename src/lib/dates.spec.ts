import { describe, expect, it } from 'vitest';
import { addDays, clampDate, diffDays, fmtDate, groupByMonth, isIsoDate, relDue, todayInBangkok } from './dates';

describe('dates', () => {
	it('uses Thailand time for "today"', () => {
		// 18:30 UTC on the 24th is already 01:30 on the 25th in Bangkok
		expect(todayInBangkok(new Date('2026-10-24T18:30:00Z'))).toBe('2026-10-25');
		expect(todayInBangkok(new Date('2026-10-24T16:59:00Z'))).toBe('2026-10-24');
	});

	it('adds days across month and year boundaries', () => {
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
		expect(diffDays('2026-10-25', '2026-10-20')).toBe(5);
	});

	it('validates real calendar dates only', () => {
		expect(isIsoDate('2026-02-29')).toBe(false);
		expect(isIsoDate('2028-02-29')).toBe(true);
		expect(isIsoDate('25/10/2026')).toBe(false);
		expect(isIsoDate(undefined)).toBe(false);
	});

	it('formats like the old system (dd/mm/yyyy, Gregorian)', () => {
		expect(fmtDate('2026-08-27')).toBe('27/08/2026');
	});

	it('describes due dates relative to today', () => {
		expect(relDue('2026-10-25', '2026-10-25')).toBe('วันนี้');
		expect(relDue('2026-10-26', '2026-10-25')).toBe('พรุ่งนี้');
		expect(relDue('2026-10-30', '2026-10-25')).toBe('อีก 5 วัน');
		expect(relDue('2026-10-22', '2026-10-25')).toBe('เลยมา 3 วัน');
	});

	it('clamps a date into a term', () => {
		expect(clampDate('2026-01-01', '2026-05-01', '2026-09-30')).toBe('2026-05-01');
		expect(clampDate('2026-12-01', '2026-05-01', '2026-09-30')).toBe('2026-09-30');
		expect(clampDate('2026-06-01', '2026-05-01', '2026-09-30')).toBe('2026-06-01');
	});

	it('groups by month, newest month first, keeping item order', () => {
		const items = [
			{ id: 1, due: '2026-10-20' },
			{ id: 2, due: '2026-09-30' },
			{ id: 3, due: '2026-10-02' }
		];
		const groups = groupByMonth(items, (i) => i.due);
		expect(groups.map((g) => g.label)).toEqual(['ตุลาคม 2026', 'กันยายน 2026']);
		expect(groups[0].items.map((i) => i.id)).toEqual([1, 3]);
	});
});
