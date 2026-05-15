import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;

const manifestPaths = [
	'src/manifest.chrome.json',
	'src/manifest.firefox.json',
	'src/manifest.safari.json',
	'dev/manifest.json',
	'dev_firefox/manifest.json',
	'dev_safari/manifest.json'
];

for (const relativePath of manifestPaths) {
	const manifestPath = path.join(rootDir, relativePath);
	if (!fs.existsSync(manifestPath)) continue;

	const manifest = fs.readFileSync(manifestPath, 'utf8');
	const updatedManifest = manifest.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`);
	fs.writeFileSync(manifestPath, updatedManifest);
	console.log(`Synced ${relativePath} to ${version}`);
}
