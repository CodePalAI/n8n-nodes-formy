import { describe, expect, it } from 'vitest';

import { answersByName, withAnswers } from '../nodes/Formy/shared/answers';
import { answerType, coerceAnswer, isPrefillable } from '../nodes/Formy/shared/fields';

describe('answers by field name', () => {
	const delivery = {
		form_id: 12,
		form_title: 'Service agreement',
		form_slug: 'service-agreement',
		submission_id: 345,
		data: {
			'f-name': { value: 'Dana Cohen', name: 'Full name', type: 'text' },
			'f-mail': { value: 'dana@example.com', name: 'Email', type: 'email' },
			'f-mail-2': { value: 'office@example.com', name: 'Email', type: 'email' },
			'f-blank': { value: 'x', name: '  ', type: 'text' },
			'f-null': { name: 'Notes', type: 'text' },
		},
	};

	it('keeps the delivery and adds answers keyed by name', () => {
		const output = withAnswers(delivery);

		expect(output).toMatchObject({ form_id: 12, submission_id: 345, data: delivery.data });
		expect(output.answers).toEqual({
			'Full name': 'Dana Cohen',
			Email: 'dana@example.com',
			'Email (f-mail-2)': 'office@example.com',
			'f-blank': 'x',
			Notes: null,
		});
	});

	it('keeps the order of the form', () => {
		expect(Object.keys(answersByName(delivery.data))).toEqual([
			'Full name',
			'Email',
			'Email (f-mail-2)',
			'f-blank',
			'Notes',
		]);
	});

	it('treats a field named __proto__ as an ordinary answer', () => {
		const answers = answersByName({ odd: { name: '__proto__', value: { polluted: true } } });

		expect(Object.prototype.hasOwnProperty.call(answers, '__proto__')).toBe(true);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it('survives bodies that are not deliveries', () => {
		expect(withAnswers({ hello: 'world' })).toEqual({ hello: 'world', answers: {} });
		expect(withAnswers('text')).toEqual({ body: 'text' });
		expect(withAnswers(null)).toEqual({ body: null });
		expect(answersByName([1, 2])).toEqual({});
	});
});

describe('prefillable fields', () => {
	it.each([
		['text', true],
		['email', true],
		['select', true],
		['multi_select', true],
		['date', true],
		['checkbox', true],
		['repeater', false],
		['matrix', false],
		['computed', false],
		['files', false],
		['signature', false],
		['payment', false],
		['password', false],
		['barcode', false],
		['qrcode', false],
		['nf-text', false],
	])('%s → %s', (type, prefillable) => {
		expect(isPrefillable({ id: 'field', name: 'Field', type })).toBe(prefillable);
	});

	it('needs an ID', () => {
		expect(isPrefillable({ name: 'No id', type: 'text' })).toBe(false);
		expect(isPrefillable({ id: '', type: 'text' })).toBe(false);
	});

	it.each([
		['number', 'number'],
		['rating', 'number'],
		['scale', 'number'],
		['slider', 'number'],
		['checkbox', 'boolean'],
		['toggle_switch', 'boolean'],
		['multi_select', 'array'],
		['date', 'string'],
		['phone_number', 'string'],
		[undefined, 'string'],
	])('types %s as %s', (formyType, type) => {
		expect(answerType(formyType)).toBe(type);
	});
});

describe('coerceAnswer', () => {
	it('leaves empty answers for the signer', () => {
		expect(coerceAnswer(undefined, 'string')).toBeUndefined();
		expect(coerceAnswer(null, 'number')).toBeUndefined();
		expect(coerceAnswer('   ', 'string')).toBeUndefined();
		expect(coerceAnswer([], 'array')).toBeUndefined();
		expect(coerceAnswer('', 'array')).toBeUndefined();
	});

	it('keeps false, which is an answer', () => {
		expect(coerceAnswer(false, 'boolean')).toBe(false);
		expect(coerceAnswer('no', 'boolean')).toBe(false);
		expect(coerceAnswer('TRUE', 'boolean')).toBe(true);
	});

	it('reads numbers from text', () => {
		expect(coerceAnswer('8000', 'number')).toBe(8000);
		expect(coerceAnswer(' 12.5 ', 'number')).toBe(12.5);
		expect(coerceAnswer(3, 'number')).toBe(3);
	});

	it('sends what does not convert as it is, for Formy to name the problem', () => {
		expect(coerceAnswer('eight thousand', 'number')).toBe('eight thousand');
		expect(coerceAnswer('maybe', 'boolean')).toBe('maybe');
	});

	it('reads lists from JSON, from commas and from arrays', () => {
		expect(coerceAnswer('["Basic", "Pro"]', 'array')).toEqual(['Basic', 'Pro']);
		expect(coerceAnswer('Basic, Pro ,', 'array')).toEqual(['Basic', 'Pro']);
		expect(coerceAnswer(['Basic', 2, ''], 'array')).toEqual(['Basic', '2']);
		expect(coerceAnswer(7, 'array')).toEqual(['7']);
	});

	it('leaves text alone', () => {
		expect(coerceAnswer('חבילה 1', 'string')).toBe('חבילה 1');
		expect(coerceAnswer(42, 'string')).toBe(42);
	});
});
