import { defineConfig } from 'drizzle-kit';

// Migrations are generated here and applied with `wrangler d1 migrations apply` (see package.json).
export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite'
});
