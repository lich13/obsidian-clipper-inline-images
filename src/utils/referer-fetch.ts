type DnrRule = {
	id: number;
	priority: number;
	action: {
		type: 'modifyHeaders';
		requestHeaders: {
			header: string;
			operation: 'set';
			value: string;
		}[];
	};
	condition: {
		urlFilter: string;
		resourceTypes: string[];
	};
};

type DeclarativeNetRequestApi = {
	updateSessionRules(options: { removeRuleIds: number[]; addRules?: DnrRule[] }): Promise<void> | void;
};

export interface FetchWithPageRefererOptions {
	dnr?: DeclarativeNetRequestApi;
	fetchImpl?: typeof fetch;
	ruleId?: number;
}

const INLINE_IMAGE_REFERER_RULE_BASE_ID = 9100;
let nextInlineImageRefererRuleId = INLINE_IMAGE_REFERER_RULE_BASE_ID;

export async function fetchWithPageReferer(
	url: string,
	referrerUrl?: string,
	options: FetchWithPageRefererOptions = {}
): Promise<Response> {
	const fetchImpl = options.fetchImpl || fetch;
	const fetchOptions = buildImageFetchOptions(referrerUrl);
	const dnr = options.dnr || getDeclarativeNetRequestApi();
	const rule = buildRefererRule(url, referrerUrl, options.ruleId || allocateRefererRuleId());

	if (!dnr || !rule) {
		return fetchImpl(url, fetchOptions);
	}

	let installedRule = false;
	try {
		await Promise.resolve(dnr.updateSessionRules({
			removeRuleIds: [rule.id],
			addRules: [rule]
		}));
		installedRule = true;
		return await fetchImpl(url, fetchOptions);
	} finally {
		if (installedRule) {
			await Promise.resolve(dnr.updateSessionRules({ removeRuleIds: [rule.id] })).catch((error) => {
				console.warn('[Obsidian Clipper] Failed to remove temporary Referer rule:', error);
			});
		}
	}
}

function buildImageFetchOptions(_referrerUrl?: string): RequestInit {
	return {
		credentials: 'include',
		cache: 'no-store'
	};
}

function buildRefererRule(url: string, referrerUrl: string | undefined, ruleId: number): DnrRule | null {
	if (!referrerUrl || !isRemoteHttpUrl(referrerUrl)) {
		return null;
	}

	let requestDomain = '';
	try {
		requestDomain = new URL(url).hostname;
	} catch {
		return null;
	}
	if (!requestDomain) return null;

	return {
		id: ruleId,
		priority: 1000,
		action: {
			type: 'modifyHeaders',
			requestHeaders: [{
				header: 'Referer',
				operation: 'set',
				value: referrerUrl
			}]
		},
		condition: {
			urlFilter: `||${requestDomain}/`,
			resourceTypes: ['xmlhttprequest', 'image', 'other']
		}
	};
}

function getDeclarativeNetRequestApi(): DeclarativeNetRequestApi | undefined {
	const chromeApi = (globalThis as any).chrome;
	return chromeApi?.declarativeNetRequest;
}

function allocateRefererRuleId(): number {
	nextInlineImageRefererRuleId += 1;
	if (nextInlineImageRefererRuleId > INLINE_IMAGE_REFERER_RULE_BASE_ID + 899) {
		nextInlineImageRefererRuleId = INLINE_IMAGE_REFERER_RULE_BASE_ID + 1;
	}
	return nextInlineImageRefererRuleId;
}

function isRemoteHttpUrl(url: string): boolean {
	return /^https?:\/\//i.test(url);
}
