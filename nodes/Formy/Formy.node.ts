import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { createSigningRequest, getFormFields, getManyForms, getManyWorkspaces } from './actions';
import { formyProperties } from './descriptions';
import { getPrefillFields, searchForms, searchWorkspaces } from './methods';

export class Formy implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Formy',
		name: 'formy',
		icon: { light: 'file:../../icons/formy.svg', dark: 'file:../../icons/formy.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Read Formy workspaces, forms and fields, and send documents for signature',
		defaults: {
			name: 'Formy',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'formyApi',
				required: true,
			},
		],
		properties: formyProperties,
	};

	methods = {
		listSearch: {
			searchForms,
			searchWorkspaces,
		},
		resourceMapping: {
			getPrefillFields,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				let results: IDataObject[];

				if (resource === 'workspace' && operation === 'getAll') {
					results = await getManyWorkspaces.call(this, itemIndex);
				} else if (resource === 'form' && operation === 'getAll') {
					results = await getManyForms.call(this, itemIndex);
				} else if (resource === 'form' && operation === 'getFields') {
					results = await getFormFields.call(this, itemIndex);
				} else if (resource === 'signingRequest' && operation === 'create') {
					results = await createSigningRequest.call(this, itemIndex);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation '${operation}' is not available for '${resource}'`,
						{ itemIndex },
					);
				}

				for (const json of results) {
					returnData.push({ json, pairedItem: { item: itemIndex } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				// Both constructors hand back an error of their own class unchanged,
				// so Formy's explanation and HTTP status survive.
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
			}
		}

		return [returnData];
	}
}
