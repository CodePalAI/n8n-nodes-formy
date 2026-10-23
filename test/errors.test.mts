import { describe, expect, it } from 'vitest';

import { describeFormyFailure } from '../nodes/Formy/shared/errors';

const HEBREW = /[\u0590-\u05FF]/;

describe('describeFormyFailure', () => {
	it.each([
		[401, {}, 'Formy did not accept the API token', 'credential-invalid'],
		[403, { type: 'plan_limit', code: 'signed_submissions' }, 'used up its signed-document allowance', 'quota-exhausted'],
		[403, { message: 'Invalid ability provided.' }, 'The API token is not allowed to do this', 'configuration-invalid'],
		[404, { message: 'לא נמצא' }, 'Formy could not find this form, or the token cannot see it', 'configuration-invalid'],
		[404, '<!doctype html><html></html>', "Formy's API was not found at this address", 'configuration-invalid'],
		[412, { code: 'form_revision_conflict' }, 'The form changed in Formy while the document was being sent', undefined],
		[428, { code: 'form_revision_required' }, "Formy needs the form's current version", undefined],
		[422, { code: 'no_recipient_step' }, 'This form has no signing round', undefined],
		[422, { code: 'routes_nowhere' }, "A step of the form's signing round has no address to send to", undefined],
		[422, { code: 'protected_entry_point_inactive' }, 'protected signing evidence', undefined],
		[422, { code: 'form_not_public' }, 'The form is not published', undefined],
		[422, { code: 'form_closed' }, 'The form is closed', undefined],
		[422, { code: 'form_revision_invalid' }, 'Formy did not accept the form version', undefined],
		[422, { errors: { hookUrl: ['...'] } }, 'Formy only sends submissions to a public HTTPS address', undefined],
		[422, { errors: { email: ['...'] } }, 'The signer email is not a valid email address', undefined],
		[422, { errors: { data: ['...'] } }, 'A prefilled answer names a field that is not on this form', undefined],
		[422, { errors: { signing_document_type: ['...'] } }, 'Formy does not sign this kind of document', undefined],
		[422, { errors: { form_id: ['...'] } }, 'Formy did not accept the form', undefined],
		[422, { errors: { something_else: ['...'] } }, 'Formy refused the request', undefined],
		[429, { code: 'invite_cap_reached' }, 'hourly limit of signing invitations', 'rate-limited'],
		[429, {}, 'Too many requests to Formy', 'rate-limited'],
		[500, {}, 'Formy is not responding as expected', 'temporarily-unavailable'],
		[503, 'Service Unavailable', 'Formy is not responding as expected', 'temporarily-unavailable'],
		[409, {}, 'Formy answered with an unexpected status (409)', undefined],
	])('explains %i %j in English', (status, body, message, cause) => {
		const failure = describeFormyFailure(status, body);

		expect(failure.message).toContain(message);
		expect(failure.message).not.toMatch(HEBREW);
		expect(failure.description).not.toMatch(HEBREW);
		expect(failure.description.length).toBeGreaterThan(0);
		expect(failure.failure?.cause).toBe(cause);
	});

	it('prefers the refusal code over validation keys', () => {
		const failure = describeFormyFailure(422, {
			code: 'routes_nowhere',
			errors: { data: ['...'] },
		});

		expect(failure.message).toContain('no address to send to');
	});

	it('never passes Formy\'s own message through', () => {
		const failure = describeFormyFailure(422, { message: 'הטופס לא נמצא', errors: { data: ['שגיאה'] } });

		expect(`${failure.message} ${failure.description}`).not.toMatch(HEBREW);
	});

	it('tells how long to wait when Formy says so', () => {
		const capped = describeFormyFailure(429, { code: 'invite_cap_reached' }, { 'Retry-After': '1200' });
		expect(capped.description).toBe('Try again in 1200 seconds.');
		expect(capped.failure).toEqual({ cause: 'rate-limited', retryAfterMs: 1_200_000 });

		const throttled = describeFormyFailure(429, {}, { 'retry-after': ['30'] });
		expect(throttled.failure).toEqual({ cause: 'rate-limited', retryAfterMs: 30_000 });

		const unknown = describeFormyFailure(429, { code: 'invite_cap_reached' }, { 'retry-after': 'soon' });
		expect(unknown.description).toBe('Try again at the start of the next hour.');
		expect(unknown.failure).toEqual({ cause: 'rate-limited' });
	});
});
