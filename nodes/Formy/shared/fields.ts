import type { FieldType } from 'n8n-workflow';

export type FormyField = {
	id?: unknown;
	name?: unknown;
	type?: unknown;
	required?: unknown;
	hidden?: unknown;
};

/**
 * Field types whose answer cannot be written onto a document before it is
 * sent: repeatable groups, grids, calculations, uploads, signatures, payments,
 * passwords and scanner blocks. Formy refuses a value for most of them, and
 * the rest only make sense filled in by the signer.
 */
const UNMAPPABLE_TYPES = new Set([
	'repeater',
	'matrix',
	'computed',
	'files',
	'signature',
	'payment',
	'password',
	'barcode',
	'qrcode',
]);

const NUMERIC = new Set(['number', 'rating', 'scale', 'slider']);
const BOOLEAN = new Set(['checkbox', 'toggle_switch']);
const LIST = new Set(['multi_select']);

export type AnswerType = Extract<FieldType, 'string' | 'number' | 'boolean' | 'array'>;

export function isPrefillable(field: FormyField): field is FormyField & { id: string } {
	const type = typeof field.type === 'string' ? field.type : '';

	return (
		typeof field.id === 'string' &&
		field.id !== '' &&
		!type.startsWith('nf-') &&
		!UNMAPPABLE_TYPES.has(type)
	);
}

export function answerType(formyType: unknown): AnswerType {
	const type = typeof formyType === 'string' ? formyType : '';
	if (NUMERIC.has(type)) return 'number';
	if (BOOLEAN.has(type)) return 'boolean';
	if (LIST.has(type)) return 'array';
	return 'string';
}

function isEmpty(value: unknown): boolean {
	return (
		value === undefined ||
		value === null ||
		(typeof value === 'string' && value.trim() === '') ||
		(Array.isArray(value) && value.length === 0)
	);
}

function toList(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value
			.filter((item) => !isEmpty(item))
			.map((item) => (typeof item === 'string' ? item : String(item)));
	}

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed.startsWith('[')) {
			try {
				const parsed: unknown = JSON.parse(trimmed);
				if (Array.isArray(parsed)) return toList(parsed);
			} catch {
				// Not JSON: read it as a comma-separated list below.
			}
		}

		return trimmed
			.split(',')
			.map((item) => item.trim())
			.filter((item) => item !== '');
	}

	return [String(value)];
}

/**
 * A mapped value in the shape the field holds, or `undefined` when there is
 * nothing to send. An empty answer is left for the signer to fill in.
 *
 * Values that do not convert are sent as they are, so Formy's own validation
 * names the problem instead of the node silently changing it.
 */
export function coerceAnswer(value: unknown, type: AnswerType | string | undefined): unknown {
	if (isEmpty(value)) return undefined;

	if (type === 'number' && typeof value === 'string') {
		const number = Number(value.trim());
		return Number.isFinite(number) ? number : value;
	}

	if (type === 'boolean' && typeof value === 'string') {
		const word = value.trim().toLowerCase();
		if (['true', '1', 'yes', 'on'].includes(word)) return true;
		if (['false', '0', 'no', 'off'].includes(word)) return false;
		return value;
	}

	if (type === 'array') {
		const list = toList(value);
		return Array.isArray(list) && list.length === 0 ? undefined : list;
	}

	return value;
}
