"""Load the built extension in an isolated Chromium profile on CI."""
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import sync_playwright


def main():
    extension = Path('dist').resolve()
    assert (extension / 'manifest.json').is_file()
    with TemporaryDirectory(prefix='extension-fixture-') as profile, sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            profile, channel='chromium', headless=True,
            args=[f'--disable-extensions-except={extension}', f'--load-extension={extension}'],
        )
        try:
            context.route('http*://**/*', lambda route: route.fulfill(
                content_type='text/html', body='<title>fixture article</title><article>fixture content</article>'))
            worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
            manifest = worker.evaluate('chrome.runtime.getManifest()')
            assert manifest['name'] == 'Obsidian Web Clipper Inline Images'
            extension_id = worker.url.split('/')[2]
            page = context.new_page()
            page.goto('http://127.0.0.1:8765/fixture')
            assert page.title() == 'fixture article'
            popup = context.new_page()
            popup.goto(f'chrome-extension://{extension_id}/popup.html')
            popup.wait_for_load_state('domcontentloaded')
            assert popup.locator('body').inner_text().strip()
            assert popup.locator('button, input, select').count() > 0
            print('Extension service worker and popup passed in bundled Chromium.')
        finally:
            context.close()


if __name__ == '__main__':
    main()
