import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { coerceAnswer } from '../shared/fields';
import { numericId } from '../shared/locators';
import { formyRequest } from '../shared/transport';

type ResourceMapperValue = {
	value?: IDataObject | null;
	schema?: Array<{ id?: string; type?: string; removed?: boolean }>;
};

function limited(this: IExecuteFunctions, items: IDataObject[], itemIndex: number): IDataObject[] {
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
	if (returnAll) return items;

	const limit = this.getNodeParameter('limit', itemIndex, 50) as number;
	return items.slice(0, Math.max(1, limit));
}

function requiredId(
	this: IExecuteFunctions,
	parameter: 'form' | 'workspace',
	itemIndex: number,
): string {
	const id = numericId(
		this.getNodeParameter(parameter, itemIndex, undefined, { extractValue: true }),
	);

	if (id === undefined) {
		const label = parameter === 'form' ? 'Form' : 'Workspace';
		throw new NodeOperationError(this.getNode(), `No ${parameter} is selected in '${label}'`, {
			itemIndex,
			description: `Choose a ${parameter} from the list, or enter its numeric ID.`,
		});
	}

	return id;
}

export async function getManyWorkspaces(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const workspaces = (await formyRequest.call(this, 'GET', '/external/workspaces', {
		itemIndex,
	})) as IDataObject[];

	return limited.call(this, workspaces, itemIndex);
}

export async function getManyForms(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const workspaceId = requiredId.call(this, 'workspace', itemIndex);
	const forms = (await formyRequest.call(this, 'GET', '/external/forms', {
		qs: { workspace_id: workspaceId },
		itemIndex,
	})) as IDataObject[];

	return limited.call(this, forms, itemIndex);
}

export async function getFormFields(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const formId = requiredId.call(this, 'form', itemIndex);

	return (await formyRequest.call(this, 'GET', `/external/forms/${formId}/fields`, {
		itemIndex,
	})) as IDataObject[];
}

/**
 * The prefilled answers as Formy reads them: field ID to value, empty answers
 * left out for the signer, each value in the shape its field holds.
 */
export function prefilledAnswers(mapper: ResourceMapperValue | undefined): IDataObject {
	const types = new Map<string, string | undefined>();
	const removed = new Set<string>();

	for (const field of mapper?.schema ?? []) {
		if (typeof field.id !== 'string') continue;
		types.set(field.id, field.type);
		if (field.removed === true) removed.add(field.id);
	}

	const data: IDataObject = {};

	for (const [fieldId, value] of Object.entries(mapper?.value ?? {})) {
		if (removed.has(fieldId)) continue;

		const answer = coerceAnswer(value, types.get(fieldId));
		if (answer !== undefined) {
			data[fieldId] = answer as IDataObject[string];
		}
	}

	return data;
}

/**
 * Formy refuses a signing request that does not name the version of the form
 * it was prepared against, so the current version is read first. If the form
 * is saved between the two requests, Formy answers 412 and nothing is sent.
 */
export async function createSigningRequest(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const formId = requiredId.call(this, 'form', itemIndex);
	const email = String(this.getNodeParameter('signerEmail', itemIndex, '')).trim();

	if (email === '') {
		throw new NodeOperationError(this.getNode(), "'Signer Email' is empty", {
			itemIndex,
			description: 'Enter the email address the document should be sent to.',
		});
	}

	const data = prefilledAnswers(
		this.getNodeParameter('answers', itemIndex, { value: null }) as ResourceMapperValue,
	);

	const form = (await formyRequest.call(this, 'GET', `/open/forms/${formId}`, {
		itemIndex,
	})) as IDataObject;

	const created = (await formyRequest.call(
		this,
		'POST',
		`/external/forms/${formId}/signing-requests`,
		{
			body: {
				expected_form_revision: form.definition_revision as number,
				email,
				data,
			},
			itemIndex,
		},
	)) as IDataObject;

	return [created];
}
