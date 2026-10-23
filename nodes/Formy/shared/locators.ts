import type { INodeProperties } from 'n8n-workflow';

export const workspaceLocator: INodeProperties = {
	displayName: 'Workspace',
	name: 'workspace',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	description: 'The Formy workspace',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			placeholder: 'Select a workspace...',
			typeOptions: {
				searchListMethod: 'searchWorkspaces',
				searchable: true,
			},
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. 12',
			validation: [
				{
					type: 'regex',
					properties: {
						regex: '^[0-9]+$',
						errorMessage: 'A workspace ID is a number',
					},
				},
			],
		},
	],
};

export const formLocator: INodeProperties = {
	displayName: 'Form',
	name: 'form',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	description: 'The Formy form',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			placeholder: 'Select a form...',
			typeOptions: {
				searchListMethod: 'searchForms',
				searchable: true,
			},
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. 42',
			validation: [
				{
					type: 'regex',
					properties: {
						regex: '^[0-9]+$',
						errorMessage: 'A form ID is a number',
					},
				},
			],
		},
	],
};

/** The numeric ID a resource locator holds, or `undefined` when it holds none. */
export function numericId(value: unknown): string | undefined {
	const id =
		typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';

	return /^[1-9][0-9]*$/.test(id) ? id : undefined;
}
