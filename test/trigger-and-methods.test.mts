import type { IDataObject, IHookFunctions, ILoadOptionsFunctions, IWebhookFunctions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { getPrefillFields, searchForms, searchWorkspaces } from '../nodes/Formy/methods';
import { FormyTrigger } from '../nodes/FormyTrigger/FormyTrigger.node';
import { BASE, credentials, fakeFormy, node, type FakeResponse } from './helpers.mts';

const HOOK = 'https://automations.example.com/webhook/0b5d2c1e-6c2f-4f7e-9d4a-2a1f3c4b5d6e/webhook';

function hookContext(
	routes: Array<[string, string, FakeResponse | Error]>,
	options: { formId?: string; staticData?: IDataObject; hookUrl?: string; baseUrl?: string } = {},
) {
	const formy = fakeFormy(routes);
	const staticData = options.staticData ?? {};

	const context = {
		getNode: () => node,
		getCredentials: credentials(),
		getNodeParameter: (name: string, fallback?: unknown, opts?: { extractValue?: boolean }) => {
			if (name !== 'form') return fallback;
			const value = { mode: 'list', value: options.formId ?? '7' };
			return opts?.extractValue ? value.value : value;
		},
		getNodeWebhookUrl: () => options.hookUrl ?? HOOK,
		getWorkflowStaticData: () => staticData,
		getWorkflow: () => ({ id: 'wf123', name: 'Leads', active: true }),
		getInstanceBaseUrl: () => options.baseUrl ?? 'https://automations.example.com/',
		helpers: { httpRequestWithAuthentication: formy.httpRequestWithAuthentication },
	} as unknown as IHookFunctions;

	return { context, calls: formy.calls, staticData };
}

const trigger = new FormyTrigger();
const methods = trigger.webhookMethods.default;

describe('Formy Trigger subscription', () => {
	it('subscribes the webhook to the form, with a link back to the workflow', async () => {
		const { context, calls, staticData } = hookContext([
			[
				'POST',
				`${BASE}/external/n8n/webhook`,
				{ statusCode: 200, body: { id: 31, form_id: 7, form_title: 'Leads', hook_url: HOOK } },
			],
		]);

		expect(await methods.create.call(context)).toBe(true);
		expect(calls[0].request.body).toEqual({
			form_id: 7,
			hookUrl: HOOK,
			workflow_url: 'https://automations.example.com/workflow/wf123',
		});
		expect(staticData.formySubscription).toEqual({ formId: '7', hookUrl: HOOK, integrationId: 31 });
	});

	it('leaves the link out when n8n does not know its own address', async () => {
		const { context, calls } = hookContext(
			[['POST', `${BASE}/external/n8n/webhook`, { statusCode: 200, body: { id: 31 } }]],
			{ baseUrl: '' },
		);

		await methods.create.call(context);
		expect(calls[0].request.body).toEqual({ form_id: 7, hookUrl: HOOK });
	});

	it('explains a webhook address Formy will not send to', async () => {
		const { context, staticData } = hookContext([
			[
				'POST',
				`${BASE}/external/n8n/webhook`,
				{ statusCode: 422, body: { message: 'כתובת לא תקינה', errors: { hookUrl: ['...'] } } },
			],
		]);

		await expect(methods.create.call(context)).rejects.toThrow(
			'Formy only sends submissions to a public HTTPS address',
		);
		expect(staticData.formySubscription).toBeUndefined();
	});

	it('knows a subscription it made, and only that one', async () => {
		const subscription = { formId: '7', hookUrl: HOOK, integrationId: 31 };

		expect(await methods.checkExists.call(hookContext([], { staticData: { formySubscription: subscription } }).context)).toBe(true);
		expect(await methods.checkExists.call(hookContext([], { staticData: {} }).context)).toBe(false);
		expect(
			await methods.checkExists.call(
				hookContext([], { staticData: { formySubscription: subscription }, formId: '8' }).context,
			),
		).toBe(false);
		expect(
			await methods.checkExists.call(
				hookContext([], { staticData: { formySubscription: subscription }, hookUrl: `${HOOK}-test` }).context,
			),
		).toBe(false);
	});

	it('unsubscribes what it subscribed', async () => {
		const { context, calls, staticData } = hookContext(
			[['DELETE', `${BASE}/external/n8n/webhook`, { statusCode: 200, body: { removed: 1 } }]],
			{ staticData: { formySubscription: { formId: '5', hookUrl: `${HOOK}-old` } }, formId: '7' },
		);

		expect(await methods.delete.call(context)).toBe(true);
		expect(calls[0].request.body).toEqual({ form_id: 5, hookUrl: `${HOOK}-old` });
		expect(staticData.formySubscription).toBeUndefined();
	});

	it('unsubscribes the current form and URL when it has no record', async () => {
		const { context, calls } = hookContext([
			['DELETE', `${BASE}/external/n8n/webhook`, { statusCode: 200, body: { removed: 0 } }],
		]);

		expect(await methods.delete.call(context)).toBe(true);
		expect(calls[0].request.body).toEqual({ form_id: 7, hookUrl: HOOK });
	});

	it('treats a form that is gone as unsubscribed', async () => {
		const { context, staticData } = hookContext(
			[['DELETE', `${BASE}/external/n8n/webhook`, { statusCode: 404, body: { message: 'לא נמצא' } }]],
			{ staticData: { formySubscription: { formId: '7', hookUrl: HOOK } } },
		);

		expect(await methods.delete.call(context)).toBe(true);
		expect(staticData.formySubscription).toBeUndefined();
	});

	it('keeps its record when Formy could not unsubscribe', async () => {
		const { context, staticData } = hookContext(
			[['DELETE', `${BASE}/external/n8n/webhook`, { statusCode: 500, body: {} }]],
			{ staticData: { formySubscription: { formId: '7', hookUrl: HOOK } } },
		);

		expect(await methods.delete.call(context)).toBe(false);
		expect(staticData.formySubscription).toBeDefined();
	});
});

describe('Formy Trigger deliveries', () => {
	it('starts the workflow with the delivery and its answers by name', async () => {
		const delivery = {
			form_id: 7,
			form_title: 'Leads',
			form_slug: 'leads',
			submission_id: 99,
			data: { 'f-name': { value: 'Dana Cohen', name: 'Full name', type: 'text' } },
		};
		const context = {
			getBodyData: () => delivery,
			helpers: { returnJsonArray: (data: IDataObject) => [{ json: data }] },
		} as unknown as IWebhookFunctions;

		const response = await trigger.webhook.call(context);

		expect(response.workflowData).toEqual([
			[{ json: { ...delivery, answers: { 'Full name': 'Dana Cohen' } } }],
		]);
	});
});

function loadOptionsContext(
	routes: Array<[string, string, FakeResponse | Error]>,
	formValue: unknown = '7',
) {
	const formy = fakeFormy(routes);
	const context = {
		getNode: () => node,
		getCredentials: credentials(),
		getCurrentNodeParameter: () => formValue,
		helpers: { httpRequestWithAuthentication: formy.httpRequestWithAuthentication },
	} as unknown as ILoadOptionsFunctions;

	return { context, calls: formy.calls };
}

describe('lists and field mapping', () => {
	const routes: Array<[string, string, FakeResponse]> = [
		[
			'GET',
			`${BASE}/external/workspaces`,
			{
				statusCode: 200,
				body: [
					{ id: 1, name: 'Acme Ltd' },
					{ id: 2, name: 'Clinic' },
				],
			},
		],
	];

	it('searches workspaces by name', async () => {
		const { context } = loadOptionsContext(routes);

		expect(await searchWorkspaces.call(context, 'clin')).toEqual({
			results: [{ name: 'Clinic', value: '2' }],
		});
	});

	it('lists the forms of every workspace, naming the workspace when there are several', async () => {
		const { context, calls } = loadOptionsContext([
			...routes,
			[
				'GET',
				`${BASE}/external/forms`,
				{ statusCode: 200, body: [{ id: 7, name: 'Intake', slug: 'intake', url: 'https://formy.co.il/forms/intake' }] },
			],
		]);

		const { results } = await searchForms.call(context);

		expect(results).toEqual([
			{ name: 'Intake (Acme Ltd)', value: '7', url: 'https://formy.co.il/forms/intake' },
			{ name: 'Intake (Clinic)', value: '7', url: 'https://formy.co.il/forms/intake' },
		]);
		expect(calls.slice(1).map((call) => call.request.qs)).toEqual([{ workspace_id: 1 }, { workspace_id: 2 }]);

		const filtered = await searchForms.call(context, 'nothing like it');
		expect(filtered.results).toEqual([]);
	});

	it('offers the fields a document can open with, typed', async () => {
		const { context } = loadOptionsContext([
			[
				'GET',
				`${BASE}/external/forms/7/fields`,
				{
					statusCode: 200,
					body: [
						{ id: 'f-name', name: 'שם מלא', type: 'text' },
						{ id: 'f-fee', name: 'Monthly fee', type: 'number' },
						{ id: 'f-terms', name: 'Terms accepted', type: 'checkbox' },
						{ id: 'f-addons', name: 'Add-ons', type: 'multi_select' },
						{ id: 'f-sign', name: 'Signature', type: 'signature' },
						{ id: 'f-upload', name: 'ID copy', type: 'files' },
						{ id: 'f-unnamed', name: '', type: 'text' },
					],
				},
			],
		]);

		const { fields } = await getPrefillFields.call(context);

		expect(fields.map((field) => [field.id, field.displayName, field.type, field.required])).toEqual([
			['f-name', 'שם מלא', 'string', false],
			['f-fee', 'Monthly fee', 'number', false],
			['f-terms', 'Terms accepted', 'boolean', false],
			['f-addons', 'Add-ons', 'array', false],
			['f-unnamed', 'f-unnamed', 'string', false],
		]);
	});

	it('asks for a form before it lists fields', async () => {
		const { context, calls } = loadOptionsContext([], '');

		expect(await getPrefillFields.call(context)).toEqual({ fields: [], emptyFieldsNotice: 'Choose a form first' });
		expect(calls).toHaveLength(0);
	});
});
