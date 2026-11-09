const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serve } = require('./preview.cjs');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/Users/matyugin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

(async () => {
  const server = await serve(0);
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?demo=1`);
    await page.locator('.card').first().waitFor();
    await page.locator('.card').first().focus();
    const geometry = await page.locator('.card').evaluateAll(nodes => nodes.slice(0, 5).map(node => ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y })));
    assert.equal(new Set(geometry.slice(0, 4).map(rect => rect.y)).size, 1);
    assert.ok(geometry[4].y > geometry[0].y);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.index), '4');
    await page.keyboard.press('ArrowUp');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Страна / национальность  ›' }).click();
    assert.equal(await page.locator('.group-title').count(), 6);
    assert.equal(await page.locator('.group-title button').count(), 0);
    await page.getByRole('button', { name: 'Японки', exact: true }).click();
    assert.equal(await page.locator('#filter-summary').textContent(), 'Японки');
    assert.equal(await page.locator('#modal-layer').isHidden(), true);
    await page.locator('#search').click();
    await page.getByRole('searchbox').fill('Aurora');
    await page.getByRole('searchbox').press('Enter');
    await page.waitForFunction(() => document.getElementById('section-title').textContent.includes('Aurora'));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#modal-layer').isHidden(), true);
    await page.locator('#settings').click();
    await page.getByRole('button', { name: 'Аккаунт Stripchat  ›' }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Cookie' }).count(), 1);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.locator('.source').filter({ hasText: 'Chaturbate' }).click();
    await page.waitForFunction(() => document.getElementById('source-name').textContent === 'Chaturbate');
    await page.locator('.source').filter({ hasText: 'Stripchat' }).click();
    await page.waitForFunction(() => document.getElementById('source-name').textContent === 'Stripchat' && document.querySelectorAll('.card').length > 0);
    await page.locator('.card').first().focus();
    fs.mkdirSync(path.join(__dirname, '../test-results'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '../test-results/catalog.png') });
    await page.locator('#filters').click(); await page.getByRole('button', { name: 'Страна / национальность  ›' }).click();
    await page.screenshot({ path: path.join(__dirname, '../test-results/countries.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: four columns, D-pad rows and right-edge filters, country headings, search/back, account settings, source switching. No JS runtime errors.');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
