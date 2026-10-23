import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

export default defineConfig({
	resolve: {
		// n8n loads nodes as CommonJS, so the tests use n8n-workflow's
		// CommonJS build too.
		alias: { 'n8n-workflow': require.resolve('n8n-workflow') },
	},
	test: {
		include: ['test/**/*.test.mts'],
		server: { deps: { external: [/n8n-workflow/] } },
	},
});
