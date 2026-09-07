"""Browser regression tests. Requires Python playwright and its Chromium browser.
Usage: python tests/browser-check.py [http://127.0.0.1:8765]
Only synthetic links are used. No real proxy connection is attempted.
"""
import json
import sys
from pathlib import Path
from urllib.parse import urlencode, quote, urlsplit
from playwright.sync_api import sync_playwright

base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765'
params = {'type': 'xhttp', 'security': 'reality', 'sni': 'example.com',
          'pbk': 'A' * 43, 'sid': 'abcd'}
prefix = 'vless://00000000-0000-4000-8000-000000000001@192.0.2.1:443?'
link = prefix + urlencode(params) + '#Synthetic'
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(permissions=['clipboard-read', 'clipboard-write'],
                                  viewport={'width': 1280, 'height': 1000})
    page = context.new_page()
    errors, requests = [], []
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
    page.on('request', lambda req: requests.append(req.url))
    response = page.goto(base, wait_until='networkidle')
    assert response is not None and response.status == 200
    assert page.locator('#copyBtn').is_disabled()
    assert page.locator('#downloadBtn').is_disabled()
    assert page.locator('#profile').input_value() == 'exact'
    page.locator('#urlInput').fill(link)
    page.locator('#convertBtn').click()
    exact = json.loads(page.locator('#jsonOutput').inner_text())
    assert exact['transport']['mode'] == 'auto'
    assert 'xmux' not in exact['transport']
    assert 'max_concurrency' in page.locator('#warnings').inner_text()
    page.locator('#profile').select_option('podkop')
    assert page.locator('#copyBtn').is_disabled(), 'Profile change must invalidate stale output'
    before = len(requests)
    page.locator('#convertBtn').click()
    output = json.loads(page.locator('#jsonOutput').inner_text())
    assert output['transport']['mode'] == 'stream-one'
    assert output['transport']['xmux']['max_concurrency'] == '16-32'
    page.locator('#copyBtn').click()
    assert json.loads(page.evaluate('navigator.clipboard.readText()')) == output
    with page.expect_download() as download_event:
        page.locator('#downloadBtn').click()
    download = download_event.value
    assert download.suggested_filename == 'podkop-outbound.json'
    assert json.loads(Path(download.path()).read_text()) == output
    assert len(requests) == before, 'Converting, copying and downloading must not send network requests'
    assert page.evaluate('localStorage.length + sessionStorage.length') == 0
    page.locator('#urlInput').fill(prefix + urlencode({**params, 'extra': '{broken'}))
    assert page.locator('#copyBtn').is_disabled(), 'Input change must invalidate stale output'
    page.locator('#convertBtn').click()
    assert 'некорректный JSON' in page.locator('#jsonOutput').inner_text()
    assert page.locator('#downloadBtn').is_disabled()
    attack = '<img src=x onerror="window.pwned=1">'
    page.locator('#urlInput').fill(prefix + urlencode({**params, attack: 'test'}) + '#' + quote(attack))
    page.locator('#urlInput').press('Enter')
    assert json.loads(page.locator('#jsonOutput').inner_text())['tag'] == attack
    assert page.locator('#jsonOutput img, #warnings img').count() == 0
    assert page.evaluate('window.pwned || null') is None
    assert attack in page.locator('#warnings').inner_text()
    page.locator('#clearBtn').click()
    assert page.locator('#urlInput').input_value() == ''
    assert page.locator('#copyBtn').is_disabled()
    page.locator('#urlInput').fill(link)
    page.locator('#convertBtn').click()
    for width in [360, 390, 1280]:
        page.set_viewport_size({'width': width, 'height': 1000})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Horizontal overflow at {width}'
        assert page.locator('#convertBtn').is_visible()
    page.set_viewport_size({'width': 390, 'height': 1000})
    page.screenshot(path='/tmp/podkop-converter-mobile.png', full_page=True)
    page.set_viewport_size({'width': 1280, 'height': 1000})
    page.screenshot(path='/tmp/podkop-converter-desktop.png', full_page=True)
    origin = urlsplit(base).netloc
    assert all(urlsplit(url).netloc == origin for url in requests), requests
    assert not errors, errors
    print(json.dumps({'url': base, 'status': 'passed', 'checks': [
        'exact/profile conversion', 'visible warnings', 'clipboard', 'JSON download',
        'stale output invalidation', 'invalid extra fails closed', 'Enter shortcut',
        'XSS escaped in tag and unknown keys', 'clear input', '360/390/1280px layouts',
        'no conversion network traffic', 'no web storage', 'no third-party requests',
        'no JS/CSP errors'], 'initial_requests': requests}, ensure_ascii=False))
    browser.close()
