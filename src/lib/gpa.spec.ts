import { describe, expect, it } from 'vitest';
import { GPA_TERMS, calcTerm, calcTotal, fmtCredit, fmtGpa, parseCredit2, parseGrade, validateGpaSubject } from './gpa';

describe('gpa maths', () => {
	it('lists the six terms in order', () => {
		expect(GPA_TERMS.map((t) => t.label)).toEqual(['ม.1 เทอม 1', 'ม.1 เทอม 2', 'ม.2 เทอม 1', 'ม.2 เทอม 2', 'ม.3 เทอม 1', 'ม.3 เทอม 2']);
	});
	it('parses credits in 0.5 steps only', () => {
		expect(parseCredit2('1.5')).toBe(3);
		expect(parseCredit2(' 1 ')).toBe(2);
		expect(parseCredit2('0,5')).toBe(1);
		for (const bad of ['', '0', '0.25', '1.55', '11', 'abc', '-1', '1.']) expect(parseCredit2(bad)).toBeNull();
		expect(fmtCredit(3)).toBe('1.5');
		expect(fmtCredit(2)).toBe('1');
	});
	it('accepts grades 0..4 in halves', () => {
		for (const ok of ['0', '0.5', '1', '2.5', '3', '3.5', '4', '4.0']) expect(parseGrade(ok)).not.toBeNull();
		for (const bad of ['', '4.5', '5', '-1', '3.25', 'A', '3.', '.5']) expect(parseGrade(bad)).toBeNull();
	});
	it('weights a term by credits and ignores empty or invalid grades', () => {
		const subs = [{ id: 1, credit2: 3 }, { id: 2, credit2: 3 }, { id: 3, credit2: 2 }, { id: 4, credit2: 1 }];
		const r = calcTerm(subs, { 1: '4', 2: '3.5', 3: '3', 4: 'x' });
		expect(r).toMatchObject({ counted: 3, total: 4, credit2: 8 });
		expect(fmtGpa(r.gpa)).toBe('3.56'); // (4*3 + 3.5*3 + 3*2) / 8 = 28.5 / 8
		expect(calcTerm(subs, {}).gpa).toBeNull();
	});
	it('pools all credits for the cumulative GPA', () => {
		const a = calcTerm([{ id: 1, credit2: 6 }], { 1: '4' }); // 3 credits of 4.0
		const b = calcTerm([{ id: 2, credit2: 2 }], { 2: '1' }); // 1 credit of 1.0
		const none = calcTerm([{ id: 3, credit2: 4 }], {});
		const t = calcTotal([a, b, none]);
		expect(t).toMatchObject({ credit2: 8, terms: 2 });
		expect(fmtGpa(t.gpa)).toBe('3.25'); // not the 2.50 average of the two term GPAs
		expect(calcTotal([none]).gpa).toBeNull();
	});
	it('rounds half up to two decimals', () => {
		expect(fmtGpa(3.145)).toBe('3.15');
		expect(fmtGpa(2)).toBe('2.00');
		expect(fmtGpa(null)).toBe('–');
	});
	it('validates a subject', () => {
		expect(validateGpaSubject('ค21101', 'คณิตศาสตร์', '1.5')).toEqual({ credit2: 3 });
		expect(validateGpaSubject('', '', '1')).toHaveProperty('error');
		expect(validateGpaSubject('x'.repeat(21), 'a', '1')).toHaveProperty('error');
		expect(validateGpaSubject('', 'a', '0.3')).toHaveProperty('error');
	});
});
