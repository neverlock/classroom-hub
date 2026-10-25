// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			/** Set by hooks.server.ts for /admin requests that passed the super admin check. */
			superAdmin?: string;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
