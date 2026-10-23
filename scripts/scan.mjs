#!/usr/bin/env node
/**
 * Runs n8n's community package scanner on this package before it is published.
 *
 * n8n verifies a community node with `npx @n8n/scan-community-package
 * n8n-nodes-formy`, which needs the published package and its npm provenance.
 * The lint half of that check does not: it lints the source the provenance
 * points at (package.json, nodes/, credentials/) and the compiled files in the
 * tarball. This script runs exactly those two passes, with the scanner's own
 * code, on the working tree and on what `npm pack` would publish.
 *
 * The scanner is installed into node_modules/.cache rather than as a
 * devDependency: it ships its own TypeScript, whose `tsc` would otherwise
 * replace the one `n8n-node build` uses.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCANNER_VERSION = '0.39.0';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cache = join(root, 'node_modules', '.cache', `scan-community-package-${SCANNER_VERSION}`);
const scannerEntry = join(cache, 'node_modules', '@n8n', 'scan-community-package', 'scanner', 'scanner.mjs');

if (!existsSync(scannerEntry)) {
	mkdirSync(cache, { recursive: true });
	execFileSync(
		'npm',
		['install', '--prefix', cache, '--no-audit', '--no-fund', `@n8n/scan-community-package@${SCANNER_VERSION}`],
		{ stdio: 'inherit' },
	);
}

const { analyzePackage, SOURCE_FILE_PATTERNS } = await import(pathToFileURL(scannerEntry).href);

execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });

const work = mkdtempSync(join(tmpdir(), 'n8n-nodes-formy-scan-'));
try {
	const [{ filename }] = JSON.parse(
		execFileSync('npm', ['pack', '--json', '--pack-destination', work], { cwd: root }).toString(),
	);
	const unpacked = join(work, 'package');
	mkdirSync(unpacked);
	execFileSync('tar', ['-xzf', join(work, filename), '-C', unpacked, '--strip-components=1']);

	const passes = [
		['source (package.json, nodes/, credentials/)', await analyzePackage(root, SOURCE_FILE_PATTERNS)],
		[`tarball ${filename}`, await analyzePackage(unpacked, ['**/*.js', 'package.json'])],
	];

	let failed = false;
	for (const [label, result] of passes) {
		if (result.passed) {
			console.log(`✅ ${label}: passed`);
		} else {
			failed = true;
			console.log(`❌ ${label}: ${result.message}`);
			if (result.details) console.log(result.details);
		}
	}

	console.log(
		'\nProvenance is checked by n8n only after publishing, from GitHub Actions (.github/workflows/publish.yml).',
	);
	process.exitCode = failed ? 1 : 0;
} finally {
	rmSync(work, { recursive: true, force: true });
}
