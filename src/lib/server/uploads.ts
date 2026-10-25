import { MAX_IMAGE_BYTES } from '#lib/validate.js';
import { randomId } from './crypto';
import { attachments } from './db/schema';
import type { Db } from './env';

/** The browser shrinks photos first; the server re-checks size and the real file type (not the claimed one). */
export function sniffImage(b: Uint8Array): { type: string; ext: string } | null {
	if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
	if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: 'image/png', ext: 'png' };
	if (
		b.length > 12 &&
		b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
		b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
	)
		return { type: 'image/webp', ext: 'webp' };
	return null;
}

export function pickFiles(form: FormData, name: string): File[] {
	return form.getAll(name).filter((v): v is File => v instanceof File && v.size > 0);
}

interface SaveArgs {
	classId: number;
	files: File[];
	entryId?: number;
	commentId?: number;
}

/** Validates every file first, then stores them all. Returns an error message or null. */
export async function saveImages(env: { IMAGES: R2Bucket }, db: Db, a: SaveArgs): Promise<string | null> {
	const ready: { bytes: ArrayBuffer; type: string; ext: string }[] = [];
	for (const f of a.files) {
		if (f.size > MAX_IMAGE_BYTES) return `รูป ${f.name || ''} ใหญ่เกินไป (ไม่เกิน 1.2 MB หลังย่อ) ลองเลือกรูปอื่นหรือเปิดด้วยเบราว์เซอร์ที่ย่อรูปให้ได้`;
		const bytes = await f.arrayBuffer();
		const kind = sniffImage(new Uint8Array(bytes.slice(0, 16)));
		if (!kind) return 'รองรับเฉพาะไฟล์รูป JPG, PNG หรือ WebP';
		ready.push({ bytes, ...kind });
	}
	for (const r of ready) {
		const key = `c${a.classId}/${randomId()}.${r.ext}`;
		await env.IMAGES.put(key, r.bytes, { httpMetadata: { contentType: r.type } });
		await db.insert(attachments).values({
			classId: a.classId,
			entryId: a.entryId ?? null,
			commentId: a.commentId ?? null,
			r2Key: key,
			contentType: r.type,
			size: r.bytes.byteLength
		});
	}
	return null;
}
