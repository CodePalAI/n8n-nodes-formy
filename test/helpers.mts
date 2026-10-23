import type { IDataObject, IHttpRequestOptions, INode } from 'n8n-workflow';
import { vi } from 'vitest';

export const node: INode = {
	id: 'formy-node',
	name: 'Formy',
	type: 'n8n-nodes-formy.formy',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

export type FakeResponse = {
	statusCode: number;
	body?: unknown;
	headers?: IDataObject;
};

export type Call = {
	credentialType: string;
	request: IHttpRequestOptions;
};

/**
 * A stand-in for n8n's HTTP helper: answers each request with the first route
 * whose method and URL match, and records what was sent.
 */
export function fakeFormy(routes: Array<[string, string, FakeResponse | Error]>) {
	const calls: Call[] = [];

	const httpRequestWithAuthentication = vi.fn(async function (
		credentialType: string,
		request: IHttpRequestOptions,
	) {
		calls.push({ credentialType, request });
		const method = (request.method ?? 'GET').toUpperCase();
		const route = routes.find(([m, url]) => m === method && url === request.url);

		if (!route) {
			return { statusCode: 404, body: '<html>not found</html>', headers: {} };
		}

		const response = route[2];
		if (response instanceof Error) throw response;

		return { statusCode: response.statusCode, body: response.body, headers: response.headers ?? {} };
	});

	return { calls, httpRequestWithAuthentication };
}

export const BASE = 'https://formy.example.test/api';

export function credentials(baseUrl: string = `${BASE}/`) {
	return vi.fn(async () => ({ apiToken: 'synthetic-token', baseUrl }));
}
