import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The node calls Formy's API by path and reads its refusal codes. In the Formy
 * repository, where this package is developed, these checks read the API's
 * own route file and code, so renaming a route or dropping a code fails here
 * before it fails in somebody's workflow. Outside it (the published mirror)
 * there is nothing to compare against, and they are skipped.
 */
const API = resolve(__dirname, '../../../api');
const routesFile = resolve(API, 'routes/api-external.php');
const inMonorepo = existsSync(routesFile);

describe.skipIf(!inMonorepo)("Formy's API contract", () => {
	const routes = inMonorepo ? readFileSync(routesFile, 'utf8') : '';

	it('has the n8n subscription routes', () => {
		const group = routes.slice(routes.indexOf("Route::prefix('n8n')"));

		expect(routes).toContain("Route::prefix('n8n')");
		expect(group).toMatch(/Route::post\('webhook', \[AutomationWebhookController::class, 'attach'\]\)\s*->defaults\('provider', AutomationProvider::N8n->value\)/);
		expect(group).toMatch(/Route::delete\('webhook', \[AutomationWebhookController::class, 'detach'\]\)\s*->defaults\('provider', AutomationProvider::N8n->value\)/);
		expect(group).toMatch(/Route::get\('submissions\/recent', \[AutomationWebhookController::class, 'sample'\]\)\s*->defaults\('provider', AutomationProvider::N8n->value\)/);
	});

	it.each([
		["Route::get('validate', ValidateAuthController::class)"],
		["Route::get('workspaces', ListWorkspacesController::class)"],
		["Route::get('forms', ListFormsController::class)"],
		["Route::get('forms/{form}/fields', FormFieldsController::class)"],
		["Route::post('forms/{form}/signing-requests', CreateSigningRequestController::class)"],
	])('has %s', (route) => {
		expect(routes).toContain(route);
	});

	it('reads the subscription fields the trigger sends', () => {
		const request = readFileSync(resolve(API, 'app/Http/Requests/External/AttachAutomationWebhookRequest.php'), 'utf8');

		for (const field of ["'form_id'", "'hookUrl'", "'workflow_url'"]) {
			expect(request).toContain(field);
		}
	});

	it.each([
		['no_recipient_step', 'app/Services/BulkSend/BulkSendService.php'],
		['form_not_public', 'app/Services/BulkSend/BulkSendService.php'],
		['form_closed', 'app/Services/BulkSend/BulkSendService.php'],
		['routes_nowhere', 'app/Http/Controllers/Integrations/External/CreateSigningRequestController.php'],
		['invite_cap_reached', 'app/Http/Controllers/Integrations/External/CreateSigningRequestController.php'],
		['protected_entry_point_inactive', 'app/Http/Controllers/Integrations/External/CreateSigningRequestController.php'],
		["'plan_limit'", 'app/Exceptions/PlanLimitException.php'],
		['form_revision_invalid', 'app/Exceptions/FormRevisionException.php'],
	])('still answers with %s', (code, file) => {
		const path = resolve(API, file);
		const source = readFileSync(path, 'utf8');
		const fallback = code === 'form_revision_invalid'
			? readFileSync(resolve(API, 'resources/lang/en/messages.php'), 'utf8')
			: '';

		expect(`${source}\n${fallback}`).toContain(code);
	});

	it('does not offer field types the API refuses to prefill', () => {
		const sanitizer = readFileSync(resolve(API, 'app/Service/Forms/FormPrefillSanitizer.php'), 'utf8');

		// Groups are the one structured value the API accepts; the node leaves
		// them out because a mapping tool cannot build their rows.
		expect(sanitizer).toContain('RepeaterSchema::isRepeater');
	});
});
