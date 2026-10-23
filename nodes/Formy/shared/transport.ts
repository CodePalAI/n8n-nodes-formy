import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IN8nHttpFullResponse,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { describeFormyFailure, UNREACHABLE, type FormyFailure } from './errors';

export type FormyRequestContext = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions;

export const DEFAULT_BASE_URL = 'https://formy.co.il/api';

export function normalizeBaseUrl(value: unknown): string {
	const raw = typeof value === 'string' && value.trim() !== '' ? value.trim() : DEFAULT_BASE_URL;
	return raw.replace(/\/+$/, '');
}

type FormyRequestOptions = {
	qs?: IDataObject;
	body?: IDataObject;
	itemIndex?: number;
};

function formyError(
	context: FormyRequestContext,
	failure: FormyFailure,
	status: number | undefined,
	itemIndex: number | undefined,
): NodeApiError {
	// The response itself is left out on purpose: Formy writes its messages in
	// Hebrew, and n8n shows the raw response under the error.
	const response: JsonObject = status === undefined ? {} : { httpCode: String(status) };

	return new NodeApiError(context.getNode(), response, {
		message: failure.message,
		description: failure.description,
		httpCode: status === undefined ? undefined : String(status),
		itemIndex,
		failure: failure.failure,
	});
}

function unreachableReason(error: unknown): string | undefined {
	const candidates = [
		(error as { cause?: { code?: unknown } })?.cause?.code,
		(error as { code?: unknown })?.code,
		(error as { cause?: { message?: unknown } })?.cause?.message,
		(error as { message?: unknown })?.message,
	];
	const reason = candidates.find((value) => typeof value === 'string' && value !== '');
	return typeof reason === 'string' ? reason.slice(0, 200) : undefined;
}

/**
 * One authenticated call to Formy's API.
 *
 * HTTP refusals are read rather than thrown by the HTTP helper, so that every
 * one of them is turned into an English explanation (see `errors.ts`).
 */
export async function formyRequest<T>(
	this: FormyRequestContext,
	method: IHttpRequestMethods,
	path: string,
	options: FormyRequestOptions = {},
): Promise<T> {
	const credentials = await this.getCredentials<{ baseUrl?: string }>('formyApi');

	const request: IHttpRequestOptions = {
		method,
		url: `${normalizeBaseUrl(credentials.baseUrl)}${path}`,
		headers: { Accept: 'application/json' },
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	if (options.qs) request.qs = options.qs;
	if (options.body) request.body = options.body;

	let response: IN8nHttpFullResponse;
	try {
		response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'formyApi',
			request,
		)) as IN8nHttpFullResponse;
	} catch (error) {
		const reason = unreachableReason(error);
		throw formyError(
			this,
			{
				...UNREACHABLE,
				description: reason ? `${UNREACHABLE.description} (${reason})` : UNREACHABLE.description,
			},
			undefined,
			options.itemIndex,
		);
	}

	const status = response.statusCode;
	const body = response.body as unknown;

	if (status >= 200 && status < 300) {
		if (body === null || typeof body !== 'object') {
			throw formyError(
				this,
				{
					message: 'Formy answered in an unexpected format',
					description:
						'Check the Base URL in the Formy credential. For formy.co.il it is https://formy.co.il/api.',
				},
				status,
				options.itemIndex,
			);
		}

		return body as T;
	}

	throw formyError(
		this,
		describeFormyFailure(status, body, response.headers),
		status,
		options.itemIndex,
	);
}
