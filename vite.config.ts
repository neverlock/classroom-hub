import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';

/** Which commit this build came from (Workers Builds sets these), so the live site can tell you what it is running. */
const buildSha = (process.env.WORKERS_CI_COMMIT_SHA ?? process.env.CF_PAGES_COMMIT_SHA ?? '').slice(0, 7) || 'local';
const buildBranch = process.env.WORKERS_CI_BRANCH ?? process.env.CF_PAGES_BRANCH ?? 'local';

export default defineConfig({
	define: {
		__BUILD_SHA__: JSON.stringify(buildSha),
		__BUILD_BRANCH__: JSON.stringify(buildBranch),
		__BUILD_TIME__: JSON.stringify(new Date().toISOString())
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
