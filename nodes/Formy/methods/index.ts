import type {
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
	ResourceMapperFields,
} from 'n8n-workflow';

import { answerType, isPrefillable, type FormyField } from '../shared/fields';
import { numericId } from '../shared/locators';
import { formyRequest } from '../shared/transport';

export type FormyWorkspace = {
	id: number;
	name: string;
};

export type FormyForm = {
	id: number;
	name: string;
	slug?: string;
	url?: string;
};

function matches(filter: string | undefined, ...texts: Array<string | undefined>): boolean {
	const needle = (filter ?? '').trim().toLowerCase();
	return needle === '' || texts.some((text) => (text ?? '').toLowerCase().includes(needle));
}

export async function searchWorkspaces(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const workspaces = (await formyRequest.call(
		this,
		'GET',
		'/external/workspaces',
	)) as FormyWorkspace[];

	return {
		results: workspaces
			.filter((workspace) => matches(filter, workspace.name))
			.map((workspace) => ({ name: workspace.name, value: String(workspace.id) })),
	};
}

/**
 * Every form the token can see, across its workspaces. Formy lists forms per
 * workspace and does not paginate, so this is one request per workspace.
 */
export async function searchForms(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const workspaces = (await formyRequest.call(
		this,
		'GET',
		'/external/workspaces',
	)) as FormyWorkspace[];
	const results: INodeListSearchItems[] = [];

	for (const workspace of workspaces) {
		const forms = (await formyRequest.call(this, 'GET', '/external/forms', {
			qs: { workspace_id: workspace.id },
		})) as FormyForm[];

		for (const form of forms) {
			if (!matches(filter, form.name, form.slug, workspace.name)) continue;

			results.push({
				name: workspaces.length > 1 ? `${form.name} (${workspace.name})` : form.name,
				value: String(form.id),
				url: form.url,
			});
		}
	}

	return { results };
}

export async function getPrefillFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
	const formId = numericId(this.getCurrentNodeParameter('form', { extractValue: true }));

	if (formId === undefined) {
		return { fields: [], emptyFieldsNotice: 'Choose a form first' };
	}

	const fields = (await formyRequest.call(
		this,
		'GET',
		`/external/forms/${formId}/fields`,
	)) as FormyField[];

	return {
		fields: fields.filter(isPrefillable).map((field) => ({
			id: field.id,
			displayName:
				typeof field.name === 'string' && field.name.trim() !== '' ? field.name : field.id,
			required: false,
			defaultMatch: false,
			canBeUsedToMatch: false,
			display: true,
			type: answerType(field.type),
		})),
		emptyFieldsNotice: 'This form has no fields that can be filled in before it is sent',
	};
}
