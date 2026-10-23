import type { INodeProperties } from 'n8n-workflow';

import { formLocator, workspaceLocator } from '../shared/locators';

export const resourceProperty: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{
			name: 'Form',
			value: 'form',
		},
		{
			name: 'Signing Request',
			value: 'signingRequest',
		},
		{
			name: 'Workspace',
			value: 'workspace',
		},
	],
	default: 'signingRequest',
};

const workspaceOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['workspace'] } },
	options: [
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'Retrieve a list of workspaces',
			action: 'Get many workspaces',
		},
	],
	default: 'getAll',
};

const formOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['form'] } },
	options: [
		{
			name: 'Get Fields',
			value: 'getFields',
			description: 'List all fields in a form, with their IDs, names and types',
			action: 'Get form fields',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'Retrieve a list of forms in a workspace',
			action: 'Get many forms',
		},
	],
	default: 'getFields',
};

const signingRequestOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['signingRequest'] } },
	options: [
		{
			name: 'Create',
			value: 'create',
			description: 'Send a form to someone for signature, with answers already filled in',
			action: 'Create signing request',
		},
	],
	default: 'create',
};

const getManyFields = (resource: string): INodeProperties[] => [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		displayOptions: { show: { resource: [resource], operation: ['getAll'] } },
		default: false,
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		displayOptions: { show: { resource: [resource], operation: ['getAll'], returnAll: [false] } },
		typeOptions: {
			minValue: 1,
		},
		default: 50,
		description: 'Max number of results to return',
	},
];

const formFields: INodeProperties[] = [
	{
		...workspaceLocator,
		displayOptions: { show: { resource: ['form'], operation: ['getAll'] } },
	},
	...getManyFields('form'),
	{
		...formLocator,
		displayOptions: { show: { resource: ['form'], operation: ['getFields'] } },
	},
];

const signingRequestFields: INodeProperties[] = [
	{
		...formLocator,
		description:
			'The form to send. It needs a signing round whose step takes its recipient from an email field of the form.',
		displayOptions: { show: { resource: ['signingRequest'], operation: ['create'] } },
	},
	{
		displayName: 'Signer Email',
		name: 'signerEmail',
		type: 'string',
		placeholder: 'e.g. nathan@example.com',
		required: true,
		default: '',
		description:
			'Who the document is sent to. Formy writes this address into the email field the signing round takes its recipient from.',
		displayOptions: { show: { resource: ['signingRequest'], operation: ['create'] } },
	},
	{
		displayName: 'Prefilled Answers',
		name: 'answers',
		type: 'resourceMapper',
		noDataExpression: true,
		default: {
			mappingMode: 'defineBelow',
			value: null,
		},
		description:
			'Answers the document opens with, already filled in. The signer cannot change them. Fields you leave out are for the signer to fill in.',
		typeOptions: {
			loadOptionsDependsOn: ['form.value'],
			resourceMapper: {
				resourceMapperMethod: 'getPrefillFields',
				mode: 'add',
				addAllFields: false,
				supportAutoMap: false,
				fieldWords: {
					singular: 'answer',
					plural: 'answers',
				},
			},
		},
		displayOptions: { show: { resource: ['signingRequest'], operation: ['create'] } },
	},
];

export const formyProperties: INodeProperties[] = [
	resourceProperty,
	workspaceOperations,
	formOperations,
	signingRequestOperations,
	...getManyFields('workspace'),
	...formFields,
	...signingRequestFields,
];
