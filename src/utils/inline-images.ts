import browser from './browser-polyfill';

export interface InlineRemoteImagesStats {
	found: number;
	converted: number;
	failed: number;
	skipped: number;
	errors: { url: string; message: string }[];
}

export interface InlineRemoteImagesResult {
	markdown: string;
	stats: InlineRemoteImagesStats;
}

export interface InlineRemoteImagesOptions {
	fetchImageAsDataUri?: (url: string) => Promise<string>;
}

interface ImageMatch {
	start: number;
	end: number;
	url: string;
	raw: string;
	toReplacement: (dataUri: string) => string;
}

const MARKDOWN_IMAGE_RE = /!\[([^\]\n]*(?:\\\][^\]\n]*)*)\]\(\s*(?:<([^>\n]+)>|([^)\s\n]+))(?:\s+((["'])(?:\\.|(?!\5).)*\5))?\s*\)/g;
const HTML_IMAGE_RE = /<img\b[^>]*\bsrc\s*=\s*(["'])(https?:\/\/[^"']+)\1[^>]*>/gi;

export async function inlineRemoteImages(
	markdown: string,
	options: InlineRemoteImagesOptions = {}
): Promise<InlineRemoteImagesResult> {
	const stats: InlineRemoteImagesStats = {
		found: 0,
		converted: 0,
		failed: 0,
		skipped: 0,
		errors: []
	};

	if (!markdown) {
		return { markdown, stats };
	}

	const matches = collectImageMatches(markdown, stats);
	if (matches.length === 0) {
		return { markdown, stats };
	}

	const fetchImageAsDataUri = options.fetchImageAsDataUri || defaultFetchImageAsDataUri;
	const cache = new Map<string, Promise<string | null>>();

	const getDataUri = (url: string): Promise<string | null> => {
		const cached = cache.get(url);
		if (cached) return cached;

		const promise = fetchImageAsDataUri(url).catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			stats.failed += 1;
			stats.errors.push({ url, message });
			console.warn('[Obsidian Clipper] Failed to inline image:', url, error);
			return null;
		});
		cache.set(url, promise);
		return promise;
	};

	let result = '';
	let cursor = 0;

	for (const match of matches) {
		result += markdown.slice(cursor, match.start);
		const dataUri = await getDataUri(match.url);
		if (dataUri) {
			stats.converted += 1;
			result += match.toReplacement(dataUri);
		} else {
			result += match.raw;
		}
		cursor = match.end;
	}

	result += markdown.slice(cursor);
	return { markdown: result, stats };
}

function collectImageMatches(markdown: string, stats: InlineRemoteImagesStats): ImageMatch[] {
	const matches: ImageMatch[] = [];

	for (const match of markdown.matchAll(MARKDOWN_IMAGE_RE)) {
		const raw = match[0];
		const start = match.index ?? 0;
		const url = match[2] || match[3] || '';
		const title = match[4] ? ` ${match[4]}` : '';

		if (!isRemoteHttpImageUrl(url)) {
			stats.skipped += 1;
			continue;
		}

		stats.found += 1;
		matches.push({
			start,
			end: start + raw.length,
			url,
			raw,
			toReplacement: (dataUri) => `![${match[1]}](${dataUri}${title})`
		});
	}

	for (const match of markdown.matchAll(HTML_IMAGE_RE)) {
		const raw = match[0];
		const start = match.index ?? 0;
		const url = match[2] || '';

		if (!isRemoteHttpImageUrl(url)) {
			stats.skipped += 1;
			continue;
		}

		stats.found += 1;
		matches.push({
			start,
			end: start + raw.length,
			url,
			raw,
			toReplacement: (dataUri) => `![${extractHtmlAlt(raw)}](${dataUri})`
		});
	}

	matches.sort((a, b) => a.start - b.start);
	return removeOverlappingMatches(matches);
}

function removeOverlappingMatches(matches: ImageMatch[]): ImageMatch[] {
	const result: ImageMatch[] = [];
	let cursor = 0;

	for (const match of matches) {
		if (match.start < cursor) continue;
		result.push(match);
		cursor = match.end;
	}

	return result;
}

function isRemoteHttpImageUrl(url: string): boolean {
	return /^https?:\/\//i.test(url);
}

async function defaultFetchImageAsDataUri(url: string): Promise<string> {
	try {
		const response = await browser.runtime.sendMessage({
			action: 'fetchImageAsDataUri',
			url
		}) as { success?: boolean; dataUri?: string; error?: string };

		if (response?.success && response.dataUri) {
			return response.dataUri;
		}

		if (response?.error) {
			throw new Error(response.error);
		}
	} catch (error) {
		console.warn('[Obsidian Clipper] Background image fetch failed, falling back to direct fetch:', error);
	}

	return directFetchImageAsDataUri(url);
}

async function directFetchImageAsDataUri(url: string): Promise<string> {
	const response = await fetch(url, { credentials: 'include', cache: 'force-cache' });

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}

	const mimeType = getImageMimeType(response.headers.get('content-type') || '', response.url || url);
	const base64 = arrayBufferToBase64(await response.arrayBuffer());
	return `data:${mimeType};base64,${base64}`;
}

function getImageMimeType(contentType: string, url: string): string {
	const normalizedContentType = contentType.split(';')[0].trim().toLowerCase();
	if (normalizedContentType.startsWith('image/')) {
		return normalizedContentType;
	}

	const pathname = safePathname(url).toLowerCase();
	if (pathname.endsWith('.png')) return 'image/png';
	if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
	if (pathname.endsWith('.webp')) return 'image/webp';
	if (pathname.endsWith('.gif')) return 'image/gif';
	if (pathname.endsWith('.svg')) return 'image/svg+xml';
	if (pathname.endsWith('.avif')) return 'image/avif';
	return 'image/jpeg';
}

function safePathname(url: string): string {
	try {
		return new URL(url).pathname;
	} catch {
		return url;
	}
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const globalBuffer = (globalThis as any).Buffer;
	if (globalBuffer) {
		return globalBuffer.from(buffer).toString('base64');
	}

	let binary = '';
	const bytes = new Uint8Array(buffer);
	const chunkSize = 0x1000;
	for (let index = 0; index < bytes.length; index += chunkSize) {
		const chunk = bytes.subarray(index, index + chunkSize);
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}

function extractHtmlAlt(html: string): string {
	const match = html.match(/\balt\s*=\s*(["'])(.*?)\1/i);
	return match ? decodeBasicHtmlEntities(match[2]) : '';
}

function decodeBasicHtmlEntities(value: string): string {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}
