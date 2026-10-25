// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	/** Injected at build time by vite.config.ts */
	const __BUILD_SHA__: string;
	const __BUILD_BRANCH__: string;
	const __BUILD_TIME__: string;

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
