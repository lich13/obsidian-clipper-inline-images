import { describe, expect, test } from 'vitest';
import { inlineRemoteImages } from './inline-images';

const dataUri = 'data:image/png;base64,QUJD';

describe('inlineRemoteImages', () => {
	test('converts remote markdown images to data URIs', async () => {
		const result = await inlineRemoteImages('before ![Alt](https://example.com/a.png) after', {
			fetchImageAsDataUri: async () => dataUri
		});

		expect(result.markdown).toBe(`before ![Alt](${dataUri}) after`);
		expect(result.stats.found).toBe(1);
		expect(result.stats.converted).toBe(1);
		expect(result.stats.failed).toBe(0);
	});

	test('preserves markdown image titles', async () => {
		const result = await inlineRemoteImages('![Alt](https://example.com/a.png "Title")', {
			fetchImageAsDataUri: async () => dataUri
		});

		expect(result.markdown).toBe(`![Alt](${dataUri} "Title")`);
	});

	test('converts angle-bracket markdown image URLs', async () => {
		const result = await inlineRemoteImages('![](<https://example.com/a image.png>)', {
			fetchImageAsDataUri: async () => dataUri
		});

		expect(result.markdown).toBe(`![](${dataUri})`);
	});

	test('converts duplicate image URLs once', async () => {
		let calls = 0;
		const result = await inlineRemoteImages('![](https://example.com/a.png)\n![](https://example.com/a.png)', {
			fetchImageAsDataUri: async () => {
				calls += 1;
				return dataUri;
			}
		});

		expect(calls).toBe(1);
		expect(result.stats.converted).toBe(2);
		expect(result.markdown.match(/data:image\/png/g)).toHaveLength(2);
	});

	test('leaves failed downloads unchanged', async () => {
		const result = await inlineRemoteImages('![](https://example.com/missing.png)', {
			fetchImageAsDataUri: async () => {
				throw new Error('not found');
			}
		});

		expect(result.markdown).toBe('![](https://example.com/missing.png)');
		expect(result.stats.found).toBe(1);
		expect(result.stats.converted).toBe(0);
		expect(result.stats.failed).toBe(1);
		expect(result.stats.errors[0].message).toBe('not found');
	});

	test('converts html image tags to markdown image syntax', async () => {
		const result = await inlineRemoteImages('<p><img src="https://example.com/a.png" alt="A &amp; B"></p>', {
			fetchImageAsDataUri: async () => dataUri
		});

		expect(result.markdown).toBe(`<p>![A & B](${dataUri})</p>`);
	});

	test('skips already-local or inline image URLs', async () => {
		const markdown = '![](data:image/png;base64,AAAA)\n![](Images/local.png)';
		const result = await inlineRemoteImages(markdown, {
			fetchImageAsDataUri: async () => {
				throw new Error('should not fetch');
			}
		});

		expect(result.markdown).toBe(markdown);
		expect(result.stats.found).toBe(0);
		expect(result.stats.skipped).toBe(2);
	});
});
