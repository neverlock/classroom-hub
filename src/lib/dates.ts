/** Date helpers. Dates are ISO `YYYY-MM-DD` strings in Thailand time (UTC+7, no DST). */

export const TH_MONTHS = [
	'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
	'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];
export const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function utc(s: string): number {
	const m = ISO_RE.exec(s)!;
	return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

export function isIsoDate(s: unknown): s is string {
	if (typeof s !== 'string') return false;
	const m = ISO_RE.exec(s);
	if (!m) return false;
	const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
	return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function todayInBangkok(now: Date = new Date()): string {
	return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
	return new Date(utc(s) + n * 86400_000).toISOString().slice(0, 10);
}

/** Whole days from `b` to `a` (a - b). */
export function diffDays(a: string, b: string): number {
	return Math.round((utc(a) - utc(b)) / 86400_000);
}

/** `2026-10-25` -> `25/10/2026` (Gregorian year, same as the old system). */
export function fmtDate(s: string): string {
	const m = ISO_RE.exec(s);
	return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

export function weekdayTh(s: string): string {
	return TH_DAYS[new Date(utc(s)).getUTCDay()];
}

/** `2026-10` -> `ตุลาคม 2026` */
export function monthLabel(key: string): string {
	const [y, m] = key.split('-');
	return `${TH_MONTHS[Number(m) - 1]} ${y}`;
}

export function clampDate(d: string, start: string, end: string): string {
	return d < start ? start : d > end ? end : d;
}

export function relDue(due: string, today: string): string {
	const n = diffDays(due, today);
	if (n === 0) return 'วันนี้';
	if (n === 1) return 'พรุ่งนี้';
	if (n > 1) return `อีก ${n} วัน`;
	return `เลยมา ${-n} วัน`;
}

export interface MonthGroup<T> {
	key: string;
	label: string;
	items: T[];
}

/** Groups items by month of `getDate(item)`, newest month first; item order inside a month is kept. */
export function groupByMonth<T>(items: T[], getDate: (item: T) => string): MonthGroup<T>[] {
	const map = new Map<string, T[]>();
	for (const it of items) {
		const key = getDate(it).slice(0, 7);
		const arr = map.get(key);
		if (arr) arr.push(it);
		else map.set(key, [it]);
	}
	return [...map.entries()]
		.sort((a, b) => (a[0] < b[0] ? 1 : -1))
		.map(([key, list]) => ({ key, label: monthLabel(key), items: list }));
}

export function fileSize(n: number): string {
	return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** `วันนี้ 14:30` / `เมื่อวาน 18:02` / `20/10/2026 09:15`, in Thailand time. */
export function fmtDateTime(ms: number, today: string): string {
	const d = new Date(ms + 7 * 3600_000);
	const day = d.toISOString().slice(0, 10);
	const hm = d.toISOString().slice(11, 16);
	if (day === today) return `วันนี้ ${hm}`;
	if (day === addDays(today, -1)) return `เมื่อวาน ${hm}`;
	return `${fmtDate(day)} ${hm}`;
}
