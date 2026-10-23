import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { Formy } from '../nodes/Formy/Formy.node';
import { BASE, credentials, fakeFormy, node, type FakeResponse } from './helpers.mts';

type Parameters = Record<string, unknown>;

function executeContext(
	parameters: Parameters,
	routes: Array<[string, string, FakeResponse | Error]>,
	options: { continueOnFail?: boolean; items?: number } = {},
) {
	const formy = fakeFormy(routes);
	const items = Array.from({ length: options.items ?? 1 }, () => ({ json: {} }));

	const context = {
		getInputData: () => items,
		getNode: () => node,
		getCredentials: credentials(),
		continueOnFail: () => options.continueOnFail ?? false,
		getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown, opts?: { extractValue?: boolean }) => {
			const value = name in parameters ? parameters[name] : fallback;
			if (opts?.extractValue && value && typeof value === 'object' && 'value' in (value as IDataObject)) {
				return (value as IDataObject).value;
			}
			return value;
		},
		helpers: {
			httpRequestWithAuthentication: formy.httpRequestWithAuthentication,
		},
	} as unknown as IExecuteFunctions;

	return { context, calls: formy.calls };
}

async function run(context: IExecuteFunctions) {
	const [output] = await new Formy().execute.call(context);
	return output.map((item) => item.json);
}

const workspaces = [
	{ id: 1, name: 'Acme Ltd', label: 'Acme Ltd', value: 1 },
	{ id: 2, name: 'Second', label: 'Second', value: 2 },
];

describe('Workspace: Get Many', () => {
	it('returns each workspace as an item, up to the limit', async () => {
		const { context, calls } = executeContext(
			{ resource: 'workspace', operation: 'getAll', returnAll: false, limit: 1 },
			[['GET', `${BASE}/external/workspaces`, { statusCode: 200, body: workspaces }]],
		);

		expect(await run(context)).toEqual([workspaces[0]]);
		expect(calls[0].credentialType).toBe('formyApi');
		expect(calls[0].request).toMatchObject({
			method: 'GET',
			url: `${BASE}/external/workspaces`,
			json: true,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
			headers: { Accept: 'application/json' },
		});
	});

	it('returns everything with Return All', async () => {
		const { context } = executeContext(
			{ resource: 'workspace', operation: 'getAll', returnAll: true },
			[['GET', `${BASE}/external/workspaces`, { statusCode: 200, body: workspaces }]],
		);

		expect(await run(context)).toHaveLength(2);
	});
});

describe('Form: Get Many and Get Fields', () => {
	it('lists the forms of the chosen workspace', async () => {
		const forms = [{ id: 7, name: 'Service agreement', slug: 'service-agreement' }];
		const { context, calls } = executeContext(
			{
				resource: 'form',
				operation: 'getAll',
				workspace: { mode: 'list', value: '2' },
				returnAll: true,
			},
			[['GET', `${BASE}/external/forms`, { statusCode: 200, body: forms }]],
		);

		expect(await run(context)).toEqual(forms);
		expect(calls[0].request.qs).toEqual({ workspace_id: '2' });
	});

	it('lists the fields of the chosen form', async () => {
		const fields = [{ id: 'f-name', name: 'Full name', type: 'text', required: true, hidden: false }];
		const { context } = executeContext(
			{ resource: 'form', operation: 'getFields', form: { mode: 'id', value: '7' } },
			[['GET', `${BASE}/external/forms/7/fields`, { statusCode: 200, body: fields }]],
		);

		expect(await run(context)).toEqual(fields);
	});

	it('asks for a form when none is chosen', async () => {
		const { context, calls } = executeContext(
			{ resource: 'form', operation: 'getFields', form: { mode: 'list', value: '' } },
			[],
		);

		await expect(run(context)).rejects.toThrow("No form is selected in 'Form'");
		await expect(run(context)).rejects.toBeInstanceOf(NodeOperationError);
		expect(calls).toHaveLength(0);
	});
});

describe('Signing Request: Create', () => {
	const created = {
		id: 501,
		form_id: 7,
		form_revision: 8,
		submission_revision: 1,
		etag: '"submission-7-501-v1"',
		status: 'pending',
		form_slug: 'service-agreement',
		email: 'client@example.com',
		data: { 'f-package': 'Pro', 'f-fee': 8000 },
	};

	const parameters = {
		resource: 'signingRequest',
		operation: 'create',
		form: { mode: 'list', value: '7' },
		signerEmail: ' client@example.com ',
		answers: {
			mappingMode: 'defineBelow',
			value: {
				'f-package': 'Pro',
				'f-fee': '8000',
				'f-rush': 'true',
				'f-addons': 'Support, Training',
				'f-notes': '',
				'f-removed': 'should not be sent',
			},
			schema: [
				{ id: 'f-package', type: 'string' },
				{ id: 'f-fee', type: 'number' },
				{ id: 'f-rush', type: 'boolean' },
				{ id: 'f-addons', type: 'array' },
				{ id: 'f-notes', type: 'string' },
				{ id: 'f-removed', type: 'string', removed: true },
			],
		},
	};

	it('reads the current version of the form, then sends the document', async () => {
		const { context, calls } = executeContext(parameters, [
			['GET', `${BASE}/open/forms/7`, { statusCode: 200, body: { id: 7, definition_revision: 8 } }],
			['POST', `${BASE}/external/forms/7/signing-requests`, { statusCode: 201, body: created }],
		]);

		expect(await run(context)).toEqual([created]);
		expect(calls.map((call) => `${call.request.method} ${call.request.url}`)).toEqual([
			`GET ${BASE}/open/forms/7`,
			`POST ${BASE}/external/forms/7/signing-requests`,
		]);
		expect(calls[1].request.body).toEqual({
			expected_form_revision: 8,
			email: 'client@example.com',
			data: {
				'f-package': 'Pro',
				'f-fee': 8000,
				'f-rush': true,
				'f-addons': ['Support', 'Training'],
			},
		});
	});

	it('sends no answers when none are mapped', async () => {
		const { context, calls } = executeContext(
			{ ...parameters, answers: { mappingMode: 'defineBelow', value: null } },
			[
				['GET', `${BASE}/open/forms/7`, { statusCode: 200, body: { definition_revision: 3 } }],
				['POST', `${BASE}/external/forms/7/signing-requests`, { statusCode: 201, body: created }],
			],
		);

		await run(context);
		expect((calls[1].request.body as IDataObject).data).toEqual({});
	});

	it('stops with an English explanation when the form changed in between', async () => {
		const { context } = executeContext(parameters, [
			['GET', `${BASE}/open/forms/7`, { statusCode: 200, body: { definition_revision: 8 } }],
			[
				'POST',
				`${BASE}/external/forms/7/signing-requests`,
				{ statusCode: 412, body: { message: 'הטופס השתנה', code: 'form_revision_conflict' } },
			],
		]);

		const failure = await run(context).catch((error: unknown) => error);

		expect(failure).toBeInstanceOf(NodeApiError);
		expect((failure as NodeApiError).message).toBe(
			'The form changed in Formy while the document was being sent, so nothing was sent',
		);
		expect((failure as NodeApiError).description).toBe('Run the step again to send the current version.');
		expect((failure as NodeApiError).httpCode).toBe('412');
	});

	it('explains a refusal code', async () => {
		const { context } = executeContext(parameters, [
			['GET', `${BASE}/open/forms/7`, { statusCode: 200, body: { definition_revision: 8 } }],
			[
				'POST',
				`${BASE}/external/forms/7/signing-requests`,
				{ statusCode: 422, body: { message: 'אין סבב חתימה', code: 'no_recipient_step' } },
			],
		]);

		await expect(run(context)).rejects.toThrow(
			'This form has no signing round, so there is nobody to send the document to',
		);
	});

	it('refuses an empty signer email before calling Formy', async () => {
		const { context, calls } = executeContext({ ...parameters, signerEmail: '  ' }, []);

		await expect(run(context)).rejects.toThrow("'Signer Email' is empty");
		expect(calls).toHaveLength(0);
	});

	it('reports a server it cannot reach', async () => {
		const unreachable = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), {
			code: 'ECONNREFUSED',
		});
		const { context } = executeContext(parameters, [['GET', `${BASE}/open/forms/7`, unreachable]]);

		const failure = (await run(context).catch((error: unknown) => error)) as NodeApiError;

		expect(failure.message).toBe('Could not reach Formy');
		expect(failure.description).toContain('ECONNREFUSED');
	});

	it('points at the Base URL when the answer is a web page', async () => {
		const { context } = executeContext(parameters, [
			['GET', `${BASE}/open/forms/7`, { statusCode: 200, body: '<!doctype html><html></html>' }],
		]);

		await expect(run(context)).rejects.toThrow('Formy answered in an unexpected format');
	});

	it('continues with the error when the workflow says so', async () => {
		const { context } = executeContext(
			parameters,
			[
				['GET', `${BASE}/open/forms/7`, { statusCode: 200, body: { definition_revision: 8 } }],
				[
					'POST',
					`${BASE}/external/forms/7/signing-requests`,
					{ statusCode: 429, body: { code: 'invite_cap_reached' }, headers: { 'retry-after': '60' } },
				],
			],
			{ continueOnFail: true, items: 2 },
		);

		expect(await run(context)).toEqual([
			{ error: 'The workspace reached its hourly limit of signing invitations' },
			{ error: 'The workspace reached its hourly limit of signing invitations' },
		]);
	});
});
