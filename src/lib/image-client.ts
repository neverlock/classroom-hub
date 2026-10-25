/** Browser-only: shrink a photo before upload (phone photos are several MB; stored copies are ~300 KB). */
export interface Shrunk {
	blob: Blob;
	url: string;
	before: number;
	after: number;
	name: string;
}

const MAX_EDGE = 1600;

export async function shrinkImage(file: File): Promise<Shrunk> {
	// imageOrientation applies the camera's rotation; re-drawing on a canvas also drops EXIF (GPS, camera model)
	const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
	const k = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
	const w = Math.round(bmp.width * k);
	const h = Math.round(bmp.height * k);
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
	bmp.close?.();
	let blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.8));
	let ext = 'webp';
	if (!blob || blob.type !== 'image/webp') {
		blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.8));
		ext = 'jpg';
	}
	if (!blob) throw new Error('encode failed');
	return { blob, url: URL.createObjectURL(blob), before: file.size, after: blob.size, name: `photo.${ext}` };
}
