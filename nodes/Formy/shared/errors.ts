import type { Failure, IDataObject } from 'n8n-workflow';

/**
 * What a refusal from Formy means, in words the person running the workflow
 * can act on.
 *
 * Formy's API answers in Hebrew only, so its `message` is never shown. The
 * explanation is chosen from what the response says in machine terms: the HTTP
 * status, the `type` and `code` fields, and the keys of a validation `errors`
 * object.
 */
export type FormyFailure = {
	message: string;
	description: string;
	failure?: Failure;
};

type FormyErrorBody = {
	type?: unknown;
	code?: unknown;
	errors?: unknown;
};

const TOKEN_ABILITY_LIST = ['workspaces-read', 'forms-read', 'forms-write', 'manage-integrations'];

function asBody(body: unknown): FormyErrorBody {
	return body !== null && typeof body === 'object' && !Array.isArray(body)
		? (body as FormyErrorBody)
		: {};
}

function errorKeys(body: FormyErrorBody): string[] {
	const errors = body.errors;
	return errors !== null && typeof errors === 'object' && !Array.isArray(errors)
		? Object.keys(errors as IDataObject)
		: [];
}

function header(headers: IDataObject | undefined, name: string): string | undefined {
	if (!headers) return undefined;
	const match = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
	const value = match === undefined ? undefined : headers[match];
	if (Array.isArray(value)) return value.length ? String(value[0]) : undefined;
	return value === undefined || value === null ? undefined : String(value);
}

function retryAfterSeconds(headers: IDataObject | undefined): number | undefined {
	const raw = header(headers, 'retry-after');
	if (raw === undefined) return undefined;
	const seconds = Number(raw);
	return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}

const UNPROCESSABLE_BY_CODE: Record<string, Omit<FormyFailure, 'failure'>> = {
	no_recipient_step: {
		message: 'This form has no signing round, so there is nobody to send the document to',
		description:
			'In Formy, add a signing step whose recipient comes from an email field of the form.',
	},
	routes_nowhere: {
		message: "A step of the form's signing round has no address to send to",
		description: 'In Formy, give every signing step a recipient.',
	},
	protected_entry_point_inactive: {
		message:
			'This form collects protected signing evidence, which Formy does not start from an automation',
		description: 'Send this document from Formy itself.',
	},
	form_not_public: {
		message: 'The form is not published',
		description: 'Publish the form in Formy, then run the step again.',
	},
	form_closed: {
		message: 'The form is closed',
		description: 'Reopen the form in Formy, then run the step again.',
	},
	form_revision_invalid: {
		message: 'Formy did not accept the form version',
		description: 'Run the step again.',
	},
};

const UNPROCESSABLE_BY_FIELD: Array<[string, Omit<FormyFailure, 'failure'>]> = [
	[
		'hookUrl',
		{
			message: 'Formy only sends submissions to a public HTTPS address',
			description:
				"This n8n instance's webhook URLs must be reachable from the internet over HTTPS. On a self-hosted n8n, set N8N_WEBHOOK_URL (WEBHOOK_URL on older versions) to its public HTTPS address, then try again.",
		},
	],
	[
		'email',
		{
			message: 'The signer email is not a valid email address',
			description: "Check the value of 'Signer Email'.",
		},
	],
	[
		'data',
		{
			message:
				'A prefilled answer names a field that is not on this form, or holds a value the document cannot show',
			description:
				"Remove that answer from 'Prefilled Answers' or change its value. Values must be text, numbers, true/false or a list.",
		},
	],
	[
		'signing_document_type',
		{
			message: 'Formy does not sign this kind of document electronically',
			description: 'Collect it without signatures, or use a different form.',
		},
	],
	[
		'form_id',
		{
			message: 'Formy did not accept the form',
			description: "Choose a form in 'Form'.",
		},
	],
];

export function describeFormyFailure(
	status: number,
	rawBody: unknown,
	headers?: IDataObject,
): FormyFailure {
	const body = asBody(rawBody);
	const code = typeof body.code === 'string' ? body.code : undefined;
	const type = typeof body.type === 'string' ? body.type : undefined;

	if (status === 401) {
		return {
			message: 'Formy did not accept the API token',
			description:
				'Check the token in the Formy credential, or create a new one in Formy under Settings › API.',
			failure: { cause: 'credential-invalid' },
		};
	}

	if (status === 403 && type === 'plan_limit') {
		return {
			message: 'This Formy workspace has used up its signed-document allowance',
			description: 'Upgrade the plan or wait for the allowance to renew, then run the step again.',
			failure: { cause: 'quota-exhausted' },
		};
	}

	if (status === 403) {
		return {
			message: 'The API token is not allowed to do this',
			description: `Give the token the abilities this step needs (${TOKEN_ABILITY_LIST.join(', ')}). A read-only member of the workspace cannot change forms.`,
			failure: { cause: 'configuration-invalid' },
		};
	}

	// Formy answers every API 404 in JSON. Anything else came from a web
	// server at an address that is not the API.
	if (status === 404 && (rawBody === null || typeof rawBody !== 'object')) {
		return {
			message: "Formy's API was not found at this address",
			description:
				'Check the Base URL in the Formy credential. For formy.co.il it is https://formy.co.il/api.',
			failure: { cause: 'configuration-invalid' },
		};
	}

	if (status === 404) {
		return {
			message: 'Formy could not find this form, or the token cannot see it',
			description:
				"Check the form, and that the token belongs to a member of the form's workspace.",
			failure: { cause: 'configuration-invalid' },
		};
	}

	if (status === 412) {
		return {
			message: 'The form changed in Formy while the document was being sent, so nothing was sent',
			description: 'Run the step again to send the current version.',
		};
	}

	if (status === 428) {
		return {
			message: "Formy needs the form's current version before it sends a document",
			description: 'Run the step again.',
		};
	}

	if (status === 422) {
		if (code !== undefined && UNPROCESSABLE_BY_CODE[code]) {
			return { ...UNPROCESSABLE_BY_CODE[code] };
		}

		const keys = errorKeys(body);
		const byField = UNPROCESSABLE_BY_FIELD.find(([field]) => keys.includes(field));
		if (byField) {
			return { ...byField[1] };
		}

		return {
			message: 'Formy refused the request',
			description: 'Check the values in this step.',
		};
	}

	if (status === 429) {
		const seconds = retryAfterSeconds(headers);
		const failure: Failure =
			seconds === undefined
				? { cause: 'rate-limited' }
				: { cause: 'rate-limited', retryAfterMs: seconds * 1000 };

		if (code === 'invite_cap_reached') {
			return {
				message: 'The workspace reached its hourly limit of signing invitations',
				description:
					seconds === undefined
						? 'Try again at the start of the next hour.'
						: `Try again in ${seconds} seconds.`,
				failure,
			};
		}

		return {
			message: 'Too many requests to Formy',
			description:
				'Formy accepts 60 automation requests a minute per user. Wait a minute and try again.',
			failure,
		};
	}

	if (status >= 500) {
		return {
			message: 'Formy is not responding as expected',
			description:
				'Try again in a few minutes. If it keeps happening, contact support@formy.co.il.',
			failure: { cause: 'temporarily-unavailable' },
		};
	}

	return {
		message: `Formy answered with an unexpected status (${status})`,
		description: 'Check the values in this step and try again.',
	};
}

export const UNREACHABLE: FormyFailure = {
	message: 'Could not reach Formy',
	description:
		'Check the Base URL in the Formy credential, and that this n8n instance can reach it.',
	failure: { cause: 'temporarily-unavailable' },
};
