let message = $state('');
let timer: ReturnType<typeof setTimeout> | undefined;

export const toastState = {
	get message() {
		return message;
	}
};

export function toast(text: string, ms = 2800) {
	message = text;
	clearTimeout(timer);
	timer = setTimeout(() => (message = ''), ms);
}
