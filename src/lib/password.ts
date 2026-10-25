/** Readable random password without look-alike characters (0/O, 1/l/I). Runs in the browser and on the server. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomPassword(length = 10): string {
	const out: string[] = [];
	const limit = 256 - (256 % ALPHABET.length); // reject values that would bias the choice
	while (out.length < length) {
		for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
			if (b < limit && out.length < length) out.push(ALPHABET[b % ALPHABET.length]);
		}
	}
	return out.join('');
}
