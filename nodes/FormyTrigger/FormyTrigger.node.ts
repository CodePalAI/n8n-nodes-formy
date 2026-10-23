import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { searchForms } from '../Formy/methods';
import { withAnswers } from '../Formy/shared/answers';
import { formLocator, numericId } from '../Formy/shared/locators';
import { formyRequest } from '../Formy/shared/transport';

type Subscription = {
	formId: string;
	hookUrl: string;
	integrationId?: number;
};

const SUBSCRIPTION_KEY = 'formySubscription';

function selectedFormId(context: IHookFunctions): string {
	const formId = numericId(context.getNodeParameter('form', undefined, { extractValue: true }));

	if (formId === undefined) {
		throw new NodeOperationError(context.getNode(), "No form is selected in 'Form'", {
			description: 'Choose a form from the list, or enter its numeric ID.',
		});
	}

	return formId;
}

/** Where the workflow opens, so Formy's integration row can link back to it. */
function workflowUrl(context: IHookFunctions): string | undefined {
	try {
		const workflowId = context.getWorkflow().id;
		const base = context.getInstanceBaseUrl().replace(/\/+$/, '');

		return workflowId && /^https?:\/\//.test(base) ? `${base}/workflow/${workflowId}` : undefined;
	} catch {
		return undefined;
	}
}

export class FormyTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Formy Trigger',
		name: 'formyTrigger',
		icon: { light: 'file:../../icons/formy.svg', dark: 'file:../../icons/formy.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: 'New submission',
		description: 'Starts the workflow when a Formy form receives a new submission',
		defaults: {
			name: 'Formy Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'formyApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'Formy sends each new submission once. A correction to a submission that already exists is not sent.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				...formLocator,
				description: 'The form whose new submissions start the workflow',
			},
		],
	};

	methods = {
		listSearch: {
			searchForms,
		},
	};

	webhookMethods = {
		default: {
			/**
			 * Whether Formy already delivers this form to this URL. Answered from
			 * what the trigger itself subscribed, so restarting n8n does not
			 * switch a subscription the form's owner paused in Formy back on.
			 */
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const subscription = this.getWorkflowStaticData('node')[SUBSCRIPTION_KEY] as
					| Subscription
					| undefined;

				return (
					subscription !== undefined &&
					subscription.formId === selectedFormId(this) &&
					subscription.hookUrl === this.getNodeWebhookUrl('default')
				);
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const formId = selectedFormId(this);
				const hookUrl = this.getNodeWebhookUrl('default') as string;
				const body: IDataObject = { form_id: Number(formId), hookUrl };

				const link = workflowUrl(this);
				if (link !== undefined) body.workflow_url = link;

				const subscribed = (await formyRequest.call(this, 'POST', '/external/n8n/webhook', {
					body,
				})) as IDataObject;

				const subscription: Subscription = {
					formId,
					hookUrl,
					integrationId: typeof subscribed.id === 'number' ? subscribed.id : undefined,
				};
				this.getWorkflowStaticData('node')[SUBSCRIPTION_KEY] = subscription;

				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const subscription = staticData[SUBSCRIPTION_KEY] as Subscription | undefined;
				const formId =
					subscription?.formId ??
					numericId(this.getNodeParameter('form', undefined, { extractValue: true }));
				const hookUrl = subscription?.hookUrl ?? this.getNodeWebhookUrl('default');

				if (formId === undefined || !hookUrl) {
					delete staticData[SUBSCRIPTION_KEY];
					return true;
				}

				try {
					await formyRequest.call(this, 'DELETE', '/external/n8n/webhook', {
						body: { form_id: Number(formId), hookUrl },
					});
				} catch (error) {
					// The form, or the token's access to it, is gone: so is the
					// subscription.
					if (!(error instanceof NodeApiError && error.httpCode === '404')) {
						return false;
					}
				}

				delete staticData[SUBSCRIPTION_KEY];
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		return {
			workflowData: [this.helpers.returnJsonArray(withAnswers(this.getBodyData()))],
		};
	}
}
