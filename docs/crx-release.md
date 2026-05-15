# CRX packaging and update maintenance

This fork builds a Chrome/Brave CRX whose Markdown output embeds remote images as `data:image/...;base64,...` links.

## Local build

```bash
npm ci
npm test
npm run build:crx
```

Generated files:

- `builds/crx/obsidian-web-clipper-inline-images-<version>.crx`
- `builds/crx/obsidian-web-clipper-inline-images-<version>.zip`
- `builds/crx/updates.xml`

The signing key is stored at `build/keys/obsidian-web-clipper-inline-images.pem` and is intentionally ignored by git. Keep this key stable; changing it changes the extension ID and breaks the update chain.

## GitHub Actions release

Store the private key in the repository secret `CRX_PRIVATE_KEY_PEM`:

```bash
gh secret set CRX_PRIVATE_KEY_PEM --body-file build/keys/obsidian-web-clipper-inline-images.pem
```

Pushing to `main` runs tests, builds the CRX, uploads artifacts, and publishes:

- `https://lich13.github.io/obsidian-clipper-inline-images/updates.xml`
- `https://lich13.github.io/obsidian-clipper-inline-images/obsidian-web-clipper-inline-images-<version>.crx`

To publish a new version later:

```bash
npm version <new-version> --no-git-tag-version
npm run sync-version
npm test
npm run build:crx
git add .
git commit -m "Release <new-version>"
git tag v<new-version>
git push origin main --tags
```

Chrome and Brave restrict arbitrary local CRX installs. For manual use, `chrome://extensions` with Developer Mode and the unpacked `dist/` folder is the most reliable path. The CRX/update feed is primarily for managed/external installs that honor the manifest `update_url`.
