import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FormyApi implements ICredentialType {
	name = 'formyApi';

	displayName = 'Formy API';

	icon: Icon = { light: 'file:../icons/formy.svg', dark: 'file:../icons/formy.dark.svg' };

	documentationUrl = 'https://github.com/CodePalAI/n8n-nodes-formy#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'A personal access token from Formy. Create one in Formy under Settings › API. It needs the workspaces-read, forms-read, forms-write and manage-integrations abilities.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			required: true,
			default: 'https://formy.co.il/api',
			description: 'The address of the Formy API. Keep the default for formy.co.il.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(new RegExp("/+$"), "")}}',
			url: '/external/validate',
			method: 'GET',
			headers: {
				Accept: 'application/json',
			},
		},
	};
}
