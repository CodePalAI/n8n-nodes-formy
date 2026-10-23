import type { IDataObject } from 'n8n-workflow';

type FormyAnswer = {
	value?: unknown;
	name?: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The answers of a delivery keyed by field name.
 *
 * A Formy delivery keys answers by field ID, which is stable but opaque. This
 * copy is what most mappings want. A repeated (or empty) name is keyed
 * "<name> (<field ID>)" (or just the field ID), so no answer is lost.
 */
export function answersByName(data: unknown): IDataObject {
	const answers: IDataObject = {};

	if (!isPlainObject(data)) {
		return answers;
	}

	for (const [fieldId, raw] of Object.entries(data)) {
		if (!isPlainObject(raw)) continue;

		const answer = raw as FormyAnswer;
		const name = typeof answer.name === 'string' ? answer.name.trim() : '';
		let key = name === '' ? fieldId : name;

		if (Object.prototype.hasOwnProperty.call(answers, key)) {
			key = name === '' ? fieldId : `${name} (${fieldId})`;
		}

		// defineProperty, so a field named "__proto__" is an answer like any other.
		Object.defineProperty(answers, key, {
			value: (answer.value ?? null) as IDataObject[string],
			enumerable: true,
			writable: true,
			configurable: true,
		});
	}

	return answers;
}

/** A delivery, unchanged, plus `answers`. */
export function withAnswers(payload: unknown): IDataObject {
	if (!isPlainObject(payload)) {
		return { body: (payload ?? null) as IDataObject[string] };
	}

	return { ...(payload as IDataObject), answers: answersByName(payload.data) };
}
