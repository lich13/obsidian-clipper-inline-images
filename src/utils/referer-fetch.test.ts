import { describe, expect, test, vi } from 'vitest';
import { fetchWithPageReferer } from './referer-fetch';

describe('fetchWithPageReferer', () => {
	test('temporarily sets the Referer header with a declarativeNetRequest session rule', async () => {
		const calls: unknown[] = [];
		const dnr = {
			updateSessionRules: vi.fn(async (options: unknown) => {
				calls.push(options);
			})
		};
		const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));

		await fetchWithPageReferer(
			'https://cdnfile.sspai.com/2026/05/13/example.png?format=webp',
			'https://sspai.com/post/109708',
			{ dnr, fetchImpl, ruleId: 9101 }
		);

		expect(fetchImpl).toHaveBeenCalledWith(
			'https://cdnfile.sspai.com/2026/05/13/example.png?format=webp',
			expect.objectContaining({ credentials: 'include', cache: 'no-store' })
		);
		expect(dnr.updateSessionRules).toHaveBeenCalledTimes(2);
		expect(calls[0]).toEqual({
			removeRuleIds: [9101],
			addRules: [{
				id: 9101,
				priority: 1000,
				action: {
					type: 'modifyHeaders',
					requestHeaders: [{
						header: 'Referer',
						operation: 'set',
						value: 'https://sspai.com/post/109708'
					}]
				},
				condition: {
					urlFilter: '||cdnfile.sspai.com/',
					resourceTypes: ['xmlhttprequest', 'image', 'other']
				}
			}]
		});
		expect(calls[1]).toEqual({ removeRuleIds: [9101] });
	});

	test('removes the temporary rule when the fetch fails', async () => {
		const dnr = {
			updateSessionRules: vi.fn(async () => {})
		};
		const fetchImpl = vi.fn(async () => {
			throw new Error('network failed');
		});

		await expect(fetchWithPageReferer(
			'https://cdnfile.sspai.com/a.png',
			'https://sspai.com/post/109708',
			{ dnr, fetchImpl, ruleId: 9102 }
		)).rejects.toThrow('network failed');

		expect(dnr.updateSessionRules).toHaveBeenLastCalledWith({ removeRuleIds: [9102] });
	});
});
