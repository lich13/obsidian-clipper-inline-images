import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const crx3 = require('crx3');

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

const artifactName = 'obsidian-web-clipper-inline-images';
const version = packageJson.version;
const extensionDir = path.resolve(rootDir, process.env.CRX_EXTENSION_DIR || 'dist');
const outputDir = path.resolve(rootDir, process.env.CRX_OUTPUT_DIR || 'builds/crx');
const keyPath = path.resolve(rootDir, process.env.CRX_PRIVATE_KEY || 'build/keys/obsidian-web-clipper-inline-images.pem');
const updateBaseUrl = (process.env.CRX_UPDATE_BASE_URL || 'https://lich13.github.io/obsidian-clipper-inline-images').replace(/\/+$/, '');
const browserVersion = process.env.CRX_BROWSER_VERSION || '114.0.0';

const manifestPath = path.join(extensionDir, 'manifest.json');
const crxPath = path.join(outputDir, `${artifactName}-${version}.crx`);
const zipPath = path.join(outputDir, `${artifactName}-${version}.zip`);
const xmlPath = path.join(outputDir, 'updates.xml');
const latestCrxPath = path.join(outputDir, `${artifactName}-latest.crx`);
const latestZipPath = path.join(outputDir, `${artifactName}-latest.zip`);
const crxURL = `${updateBaseUrl}/${path.basename(crxPath)}`;

if (!fs.existsSync(manifestPath)) {
	throw new Error(`Missing ${manifestPath}. Run npm run build:chrome before packaging CRX.`);
}

fs.mkdirSync(path.dirname(keyPath), { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const info = await crx3([manifestPath], {
	keyPath,
	crxPath,
	zipPath,
	xmlPath,
	appVersion: version,
	crxURL,
	browserVersion
});

await Promise.all([
	waitForStableFile(crxPath),
	waitForStableFile(zipPath),
	waitForStableFile(xmlPath)
]);

fs.copyFileSync(crxPath, latestCrxPath);
fs.copyFileSync(zipPath, latestZipPath);

const result = {
	appId: info.appId,
	version,
	keyPath,
	crxPath,
	zipPath,
	xmlPath,
	latestCrxPath,
	latestZipPath,
	crxURL
};

console.log(JSON.stringify(result, null, 2));

async function waitForStableFile(filePath) {
	const deadline = Date.now() + 5000;
	let previousSize = -1;

	while (Date.now() < deadline) {
		if (fs.existsSync(filePath)) {
			const { size } = fs.statSync(filePath);
			if (size > 0 && size === previousSize) return;
			previousSize = size;
		}

		await new Promise(resolve => setTimeout(resolve, 100));
	}

	throw new Error(`Timed out waiting for ${filePath}`);
}
