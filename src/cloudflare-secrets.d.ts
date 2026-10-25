// Secrets are not in wrangler.jsonc (this repository is public), so `wrangler types` cannot know them.
declare namespace Cloudflare {
	interface Env {
		/** Secret: signs the admin and student cookies. Required, at least 16 characters. */
		SESSION_SECRET: string;
		/** Secret (optional): comma-separated super admin emails, enforced on top of the Access policy. */
		SUPER_ADMINS?: string;
		/** `vite dev` only (.dev.vars): act as this super admin without Cloudflare Access. */
		DEV_SUPER_ADMIN?: string;
	}
}
