import { describe, expect, it } from 'vitest';
import {
	parseStudentLines,
	suggestNextTerm,
	validateAdminInput,
	validatePassword,
	validateSlug,
	validateTerm
} from './validate';

describe('slug, username and password', () => {
	it('accepts only lower-case slugs of 3-30 chars', () => {
		expect(validateSlug('p5-1')).toBeNull();
		expect(validateSlug('P5-1')).not.toBeNull();
		expect(validateSlug('-p5')).not.toBeNull();
		expect(validateSlug('ab')).not.toBeNull();
	});

	it('lets passwords be any characters, 8-128 long', () => {
		expect(validatePassword('ก ข ค!@#  ครู')).toBeNull();
		expect(validatePassword('1234567')).not.toBeNull();
		expect(validatePassword('x'.repeat(129))).not.toBeNull();
	});

	it('checks display name and username', () => {
		expect(validateAdminInput('ครูต้น', 'ton', 'abcdefgh')).toBeNull();
		expect(validateAdminInput('', 'ton', 'abcdefgh')).not.toBeNull();
		expect(validateAdminInput('ครูต้น', 'Bad User', 'abcdefgh')).not.toBeNull();
	});
});

describe('terms', () => {
	const t1 = { id: 1, name: 'ภาคเรียนที่ 1/2026', classLabel: 'ป.5/1', startDate: '2026-05-15', endDate: '2026-09-30' };

	it('rejects overlapping ranges and duplicate names', () => {
		const next = { name: 'ภาคเรียนที่ 2/2026', classLabel: 'ป.5/1', startDate: '2026-09-30', endDate: '2027-02-28' };
		expect(validateTerm(next, [t1])).toMatch(/ทับ/);
		expect(validateTerm({ ...next, startDate: '2026-10-01' }, [t1])).toBeNull();
		expect(validateTerm({ ...t1, id: undefined, startDate: '2027-01-01', endDate: '2027-02-01' }, [t1])).toMatch(/ชื่อนี้/);
	});

	it('allows editing a term without clashing with itself', () => {
		expect(validateTerm({ ...t1, endDate: '2026-10-05' }, [t1])).toBeNull();
	});

	it('rejects an end date before the start date', () => {
		expect(validateTerm({ name: 'x', classLabel: 'y', startDate: '2026-10-05', endDate: '2026-10-01' }, [])).toMatch(/ก่อน/);
	});

	it('suggests the day after the latest term', () => {
		expect(suggestNextTerm([t1], '2026-01-01').startDate).toBe('2026-10-01');
	});
});

describe('parseStudentLines', () => {
	const existing = [
		{ id: 1, seatNo: 1, studentCode: '10101', active: true },
		{ id: 2, seatNo: 2, studentCode: '10102', active: false }
	];

	it('reads "seat code" lines and code-only lines', () => {
		const r = parseStudentLines('5 10105\n10106\n7,10107', existing);
		expect(r.map((x) => [x.seatNo, x.studentCode, x.error])).toEqual([
			[5, '10105', undefined],
			[6, '10106', undefined],
			[7, '10107', undefined]
		]);
	});

	it('reports duplicates, hidden codes and bad formats with reasons', () => {
		const r = parseStudentLines('1 10199\n9 10101\n9 10102\n0 10110\nab\n3 4 5', existing);
		expect(r.map((x) => x.error)).toEqual([
			'เลขที่ 1 ถูกใช้แล้ว',
			'รหัสซ้ำกับที่มีอยู่',
			'รหัสนี้มีอยู่แล้ว (ซ่อนอยู่) กดแสดงที่รายชื่อแทน',
			'เลขที่ต้องเป็น 1–99',
			'รหัสต้องเป็นตัวอักษรหรือตัวเลข 3–20 ตัว',
			'รูปแบบไม่ถูก'
		]);
	});

	it('catches duplicates inside the pasted batch itself', () => {
		const r = parseStudentLines('8 10108\n8 10109\n9 10108', []);
		expect(r.map((x) => x.error)).toEqual([undefined, 'เลขที่ 8 ถูกใช้แล้ว', 'รหัสซ้ำกับที่มีอยู่']);
	});

	it('lets a student keep their own seat and code when editing', () => {
		const r = parseStudentLines('1 10101', existing, 1);
		expect(r[0].error).toBeUndefined();
	});
});
