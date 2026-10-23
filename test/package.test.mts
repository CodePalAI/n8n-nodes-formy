import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FormyApi } from '../credentials/FormyApi.credentials';
import { Formy } from '../nodes/Formy/Formy.node';
import { FormyTrigger } from '../nodes/FormyTrigger/FormyTrigger.node';

const ROOT = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		return statSync(path).isDirectory() ? sourceFiles(path) : [path];
	});
}

const shipped = [...sourceFiles(join(ROOT, 'nodes')), ...sourceFiles(join(ROOT, 'credentials'))].filter(
	(file) => /\.(ts|json)$/.test(file),
);

describe("n8n's verification guidelines", () => {
	it('is named and tagged as a community node package', () => {
		expect(pkg.name).toMatch(/^n8n-nodes-/);
		expect(pkg.keywords).toContain('n8n-community-node-package');
		expect(pkg.license).toBe('MIT');
		expect(pkg.repository.url).toBe('git+https://github.com/CodePalAI/n8n-nodes-formy.git');
		expect(existsSync(join(ROOT, 'LICENSE.md'))).toBe(true);
		expect(readFileSync(join(ROOT, 'LICENSE.md'), 'utf8')).toContain('MIT License');
	});

	it('has no run-time dependencies', () => {
		expect(pkg.dependencies ?? {}).toEqual({});
		expect(Object.keys(pkg.peerDependencies)).toEqual(['n8n-workflow']);
	});

	it('declares every node and credential it ships', () => {
		expect(pkg.n8n).toEqual({
			n8nNodesApiVersion: 1,
			strict: true,
			credentials: ['dist/credentials/FormyApi.credentials.js'],
			nodes: ['dist/nodes/Formy/Formy.node.js', 'dist/nodes/FormyTrigger/FormyTrigger.node.js'],
		});
		expect(pkg.files).toEqual(['dist']);
	});

	it.each(shipped)('%s reads no environment variables or files', (file) => {
		const source = readFileSync(file, 'utf8');

		expect(source).not.toMatch(/process\.env|from 'fs'|from 'node:fs'|require\(|child_process|\$env/);
	});

	it.each(shipped)('%s speaks English only', (file) => {
		expect(readFileSync(file, 'utf8')).not.toMatch(/[\u0590-\u05FF]/);
	});
});

describe('descriptions', () => {
	it('keeps the token secret and tests it against the validate route', () => {
		const credential = new FormyApi();
		const token = credential.properties.find((property) => property.name === 'apiToken');

		expect(credential.name).toBe('formyApi');
		expect(token?.typeOptions?.password).toBe(true);
		expect(credential.test.request.url).toBe('/external/validate');
		expect(credential.authenticate).toEqual({
			type: 'generic',
			properties: { headers: { Authorization: '=Bearer {{$credentials.apiToken}}' } },
		});
	});

	it('offers the actions Formy supports', () => {
		const { properties } = new Formy().description;
		const operations = properties
			.filter((property) => property.name === 'operation')
			.flatMap((property) =>
				(property.options ?? []).map(
					(option) => `${property.displayOptions?.show?.resource}:${(option as { value: string }).value}`,
				),
			);

		expect(operations.sort()).toEqual([
			'form:getAll',
			'form:getFields',
			'signingRequest:create',
			'workspace:getAll',
		]);
	});

	it('listens on one POST webhook that answers at once', () => {
		const { description } = new FormyTrigger();

		expect(description.group).toEqual(['trigger']);
		expect(description.webhooks).toEqual([
			{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' },
		]);
	});

	it('builds into the files package.json names', () => {
		const dist = join(ROOT, 'dist');
		if (!existsSync(dist)) {
			return;
		}

		for (const file of [...pkg.n8n.credentials, ...pkg.n8n.nodes]) {
			expect(existsSync(join(ROOT, file)), file).toBe(true);
		}
		expect(existsSync(join(dist, 'icons/formy.svg'))).toBe(true);
	});
});
