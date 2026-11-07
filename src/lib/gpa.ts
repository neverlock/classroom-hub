/**
 * GPA maths, shared by the public calculator (runs ONLY in the browser: grades are sensitive and never sent anywhere)
 * and by the super-admin pages (which validate subjects and credits).
 */

export interface GpaTerm {
	no: number;
	/** 1..3 = ม.1..ม.3 */
	year: number;
	/** 1 or 2 */
	term: number;
	label: string;
}

/** ม.1 เทอม 1 … ม.3 เทอม 2, in display order. */
export const GPA_TERMS: GpaTerm[] = Array.from({ length: 6 }, (_, no) => {
	const year = Math.floor(no / 2) + 1;
	const term = (no % 2) + 1;
	return { no, year, term, label: `ม.${year} เทอม ${term}` };
});

export const MAX_CREDIT2 = 20; // 10 credits in one subject is far beyond anything real
export const MAX_SUBJECTS_PER_TERM = 40;

/** "1.5" → 3 (credits × 2). Only 0.5 steps are valid. Returns null for anything else. */
export function parseCredit2(text: string): number | null {
	const s = text.trim().replace(',', '.');
	if (!/^\d{1,2}(\.\d)?$/.test(s)) return null;
	const n = Number(s) * 2;
	return Number.isInteger(n) && n >= 1 && n <= MAX_CREDIT2 ? n : null;
}

export function fmtCredit(credit2: number): string {
	return Number.isInteger(credit2 / 2) ? String(credit2 / 2) : (credit2 / 2).toFixed(1);
}

/** A grade is 0, 0.5, 1 … 4. Returns null when the text is empty or not a valid grade. */
export function parseGrade(text: string): number | null {
	const s = text.trim().replace(',', '.');
	if (!/^\d(\.\d)?$/.test(s)) return null;
	const n = Number(s);
	return n >= 0 && n <= 4 && Number.isInteger(n * 2) ? n : null;
}

export interface TermResult {
	/** subjects with a valid grade */
	counted: number;
	total: number;
	/** credits ×2 of the counted subjects */
	credit2: number;
	/** Σ grade × credit ×2 (exact: grades are halves, credits are integers) */
	points2: number;
	gpa: number | null;
}

export function calcTerm(subjects: { id: number; credit2: number }[], grades: Record<string, string>): TermResult {
	let credit2 = 0;
	let points2 = 0;
	let counted = 0;
	for (const s of subjects) {
		const g = parseGrade(grades[s.id] ?? '');
		if (g === null) continue;
		credit2 += s.credit2;
		points2 += g * s.credit2;
		counted++;
	}
	return { counted, total: subjects.length, credit2, points2, gpa: credit2 ? points2 / credit2 : null };
}

/** Cumulative GPA: all credits of all terms pooled (not an average of the term GPAs). */
export function calcTotal(results: TermResult[]): { credit2: number; terms: number; gpa: number | null } {
	let credit2 = 0;
	let points2 = 0;
	let terms = 0;
	for (const r of results) {
		if (r.counted === 0) continue;
		credit2 += r.credit2;
		points2 += r.points2;
		terms++;
	}
	return { credit2, terms, gpa: credit2 ? points2 / credit2 : null };
}

/** Two decimals, rounded half up (3.145 → 3.15 even though 3.145 is not exact in binary). */
export function fmtGpa(v: number | null): string {
	return v === null ? '–' : (Math.round((v + 1e-9) * 100) / 100).toFixed(2);
}

export function validateGpaSubject(code: string, name: string, creditText: string): { error: string } | { credit2: number } {
	if (!name || name.length > 100) return { error: 'กรุณาใส่ชื่อวิชา (ไม่เกิน 100 ตัวอักษร)' };
	if (code.length > 20) return { error: 'รหัสวิชายาวเกิน 20 ตัวอักษร' };
	const credit2 = parseCredit2(creditText);
	if (credit2 === null) return { error: 'หน่วยกิตต้องเป็น 0.5, 1, 1.5 … (ครั้งละ 0.5 ไม่เกิน 10)' };
	return { credit2 };
}
