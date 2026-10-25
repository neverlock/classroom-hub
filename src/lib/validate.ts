/** Input rules shared by the server (authoritative) and the browser (early feedback). */
import { addDays, isIsoDate } from './dates';

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;
export const USERNAME_RE = /^[a-z0-9._-]{3,20}$/;
export const STUDENT_CODE_RE = /^[A-Za-z0-9]{3,20}$/;

export const MAX_ENTRY_IMAGES = 3;
export const MAX_COMMENT_IMAGES = 2;
export const MAX_IMAGE_BYTES = 1_200_000;
export const MAX_TEXT = 4000;

export function validateSlug(slug: string): string | null {
	return SLUG_RE.test(slug)
		? null
		: 'ชื่อลิงก์ใช้ได้เฉพาะตัวอักษรอังกฤษพิมพ์เล็ก ตัวเลข และขีด 3–30 ตัว (ไม่ขึ้นต้นหรือลงท้ายด้วยขีด)';
}

/** Passwords are free-form text: no character rules, never trimmed. */
export function validatePassword(pw: string): string | null {
	return pw.length >= 8 && pw.length <= 128 ? null : 'รหัสผ่านต้องยาว 8–128 ตัว';
}

export function validateAdminInput(display: string, username: string, password: string): string | null {
	if (!display || display.length > 30) return 'กรุณากรอกชื่อที่แสดง (ไม่เกิน 30 ตัวอักษร)';
	if (!USERNAME_RE.test(username)) return 'ชื่อผู้ใช้ใช้ได้เฉพาะ a–z 0–9 จุด ขีดกลาง ขีดล่าง 3–20 ตัว';
	return validatePassword(password);
}

export interface TermLike {
	id?: number;
	name: string;
	classLabel: string;
	startDate: string;
	endDate: string;
}

/** Terms of one room may not overlap and must have unique names. */
export function validateTerm(input: TermLike, others: TermLike[]): string | null {
	if (!input.name.trim() || !input.classLabel.trim()) return 'กรุณากรอกชื่อภาคเรียนและชื่อห้อง';
	if (input.name.length > 60 || input.classLabel.length > 40) return 'ชื่อยาวเกินไป';
	if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate)) return 'กรุณาเลือกวันเปิดและปิดเทอม';
	if (input.endDate < input.startDate) return 'วันปิดเทอมต้องไม่ก่อนวันเปิดเทอม';
	const rest = others.filter((t) => t.id !== input.id);
	const clash = rest.find((t) => t.startDate <= input.endDate && input.startDate <= t.endDate);
	if (clash) return `ช่วงวันที่ทับกับ ${clash.name}`;
	if (rest.some((t) => t.name.toLowerCase() === input.name.trim().toLowerCase())) return 'มีภาคเรียนชื่อนี้แล้ว';
	return null;
}

/** Suggested dates for the next term: starts the day after the latest one ends. */
export function suggestNextTerm(terms: TermLike[], today: string): { startDate: string; endDate: string } {
	const last = terms.reduce<string | null>((m, t) => (m === null || t.endDate > m ? t.endDate : m), null);
	const startDate = last ? addDays(last, 1) : today;
	return { startDate, endDate: addDays(startDate, 120) };
}

export interface StudentLike {
	id?: number;
	seatNo: number;
	studentCode: string;
	active: boolean;
}

export interface ParsedStudentLine {
	raw: string;
	seatNo?: number;
	studentCode?: string;
	error?: string;
}

/**
 * Parses pasted student lines: `เลขที่ รหัส` (space, comma or tab separated) or just `รหัส`,
 * in which case the next free seat number is used. Seats must be unique among active students;
 * codes must be unique across all students (a hidden student keeps their code).
 */
export function parseStudentLines(text: string, existing: StudentLike[], skipId?: number): ParsedStudentLine[] {
	const takenSeat = new Set<number>();
	const takenCode = new Map<string, 'active' | 'hidden'>();
	let maxSeat = 0;
	for (const s of existing) {
		if (s.id === skipId) continue;
		if (s.active) {
			takenSeat.add(s.seatNo);
			if (s.seatNo > maxSeat) maxSeat = s.seatNo;
		}
		takenCode.set(s.studentCode.toLowerCase(), s.active ? 'active' : 'hidden');
	}
	const out: ParsedStudentLine[] = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) continue;
		const r: ParsedStudentLine = { raw: line };
		out.push(r);
		const tk = line.split(/[\s,;\t]+/).filter(Boolean);
		let seat: number;
		let code: string;
		if (tk.length === 1) {
			code = tk[0];
			seat = ++maxSeat;
			while (takenSeat.has(seat)) seat = ++maxSeat;
		} else if (tk.length === 2) {
			seat = Number(tk[0]);
			code = tk[1];
		} else {
			r.error = 'รูปแบบไม่ถูก';
			continue;
		}
		if (!(Number.isInteger(seat) && seat >= 1 && seat <= 99)) {
			r.error = 'เลขที่ต้องเป็น 1–99';
			continue;
		}
		if (!STUDENT_CODE_RE.test(code)) {
			r.error = 'รหัสต้องเป็นตัวอักษรหรือตัวเลข 3–20 ตัว';
			continue;
		}
		const seen = takenCode.get(code.toLowerCase());
		if (seen) {
			r.error = seen === 'hidden' ? 'รหัสนี้มีอยู่แล้ว (ซ่อนอยู่) กดแสดงที่รายชื่อแทน' : 'รหัสซ้ำกับที่มีอยู่';
			continue;
		}
		if (takenSeat.has(seat)) {
			r.error = `เลขที่ ${seat} ถูกใช้แล้ว`;
			continue;
		}
		takenSeat.add(seat);
		takenCode.set(code.toLowerCase(), 'active');
		if (seat > maxSeat) maxSeat = seat;
		r.seatNo = seat;
		r.studentCode = code;
	}
	return out;
}

/** Trimmed text from a form field. It is never cut short: too-long input is rejected with `lengthError`. */
export function readText(s: unknown): string {
	return typeof s === 'string' ? s.trim() : '';
}

/** Message for the first field longer than its limit, or null. Silent truncation would lose what people typed. */
export function lengthError(rules: [label: string, value: string, max: number][]): string | null {
	for (const [label, value, max] of rules) {
		if (value.length > max) return `${label}ยาวเกินไป (ไม่เกิน ${max} ตัวอักษร ตอนนี้ ${value.length})`;
	}
	return null;
}
