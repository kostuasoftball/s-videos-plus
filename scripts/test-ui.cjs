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
    await page.addInitScript(() => { Element.prototype.replaceChildren = undefined; Element.prototype.animate = undefined; });
    page.on('pageerror', error => errors.push(error.message));
    async function selectFirstSource() {
      await page.locator('.source').first().waitFor();
      assert.equal(await page.locator('.source.active').count(), 0);
      assert.equal(await page.locator('.card').count(), 0);
      assert.equal(await page.evaluate(() => SVideosUI.model.sequence), 0);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.source), await page.locator('.source').first().getAttribute('data-source'));
      await page.keyboard.press('Enter');
      await page.locator('.card').first().waitFor();
    }
    await page.goto(`http://127.0.0.1:${server.address().port}/?demo=1`);
    assert.equal(await page.locator('#source-logo').isHidden(), true);
    await selectFirstSource();
    const clock = page.locator('#clock');
    assert.equal(await clock.getAttribute('data-style'), 'flip');
    assert.equal(await clock.locator('.clock-digit').count(), 4);
    assert.match(await clock.getAttribute('datetime'), /^\d\d:\d\d$/);
    const clockBounds = await clock.boundingBox();
    assert.ok(clockBounds.y + clockBounds.height < (await page.locator('.heading').boundingBox()).y);
    await page.locator('.card').nth(12).focus();
    assert.ok(await page.locator('#catalog').evaluate(node => node.scrollTop > 0));
    assert.ok((await page.locator('.heading').boundingBox()).y < 76);
    assert.deepEqual(await clock.boundingBox(), clockBounds);
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');
    assert.ok(await page.locator('.category.active').evaluate(node => document.activeElement === node));
    // First/last column, scrolled rows and the final card all fit without a clipped focus ring.
    const cards = page.locator('.card');
    for (const i of [0, 3, 12, 15, 23]) {
      await cards.nth(i).focus();
      await page.waitForFunction(index => {
        const card = document.querySelectorAll('.card')[index], catalog = document.querySelector('#catalog');
        const a = card.getBoundingClientRect(), b = catalog.getBoundingClientRect();
        const left = index % 4 > 0 && card.previousElementSibling.getBoundingClientRect();
        const right = index % 4 < 3 && card.nextElementSibling && card.nextElementSibling.getBoundingClientRect();
        return a.width >= card.offsetWidth * 1.04 && a.left >= b.left && a.top >= b.top
          && a.right <= b.left + catalog.clientWidth && a.bottom <= b.bottom
          && (!left || left.right < a.left) && (!right || right.left > a.right);
      }, i, { timeout: 3000 });
    }
    await page.locator('#settings').click();
    await page.getByRole('button', { name: /^Часы:/ }).click();
    await page.getByRole('button', { name: 'Янтарные цифровые', exact: true }).click();
    assert.equal(await clock.getAttribute('data-style'), 'digital');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Янтарные цифровые');
    assert.ok((await page.locator('#panel-close').boundingBox()).y > clockBounds.y + clockBounds.height);
    await page.reload(); await selectFirstSource();
    assert.equal(await clock.getAttribute('data-style'), 'digital');
    await page.locator('#settings').click();
    await page.getByRole('button', { name: /^Часы:/ }).click();
    await page.getByRole('button', { name: 'Классические', exact: true }).click();
    assert.equal(await clock.getAttribute('data-style'), 'classic');
    for (const [style, title, shape] of [
      ['vfd', 'Зелёная электроника 90-х', 'rect'],
      ['lcd', 'Карманный LCD', 'rect'],
      ['led', 'Красный LED', 'rect'],
      ['nixie', 'Ламповые Nixie', 'text'],
      ['analog', 'Стрелочные', 'line']
    ]) {
      await page.getByRole('button', { name: title, exact: true }).click();
      assert.equal(await clock.getAttribute('data-style'), style);
      assert.ok(await clock.locator('svg ' + shape).count());
      assert.equal(await page.evaluate(() => document.activeElement.textContent), title);
    }
    await page.reload(); await selectFirstSource();
    assert.equal(await clock.getAttribute('data-style'), 'analog');
    await page.locator('#settings').click();
    await page.getByRole('button', { name: /^Часы:/ }).click();
    await page.getByRole('button', { name: 'Ретро Flip', exact: true }).click();
    assert.equal(await clock.getAttribute('data-style'), 'flip');
    await page.reload(); await selectFirstSource();
    await page.locator('.card').first().focus();
    assert.deepEqual(await page.locator('.card').first().evaluate(card => {
      const poster = card.querySelector('.poster'), title = card.querySelector('.card-title');
      return {
        frameOnImage: getComputedStyle(poster, '::before').content !== 'none',
        frameOnCard: getComputedStyle(card, '::after').content !== 'none',
        titleInset: title.getBoundingClientRect().left > poster.getBoundingClientRect().left,
        titleBelow: title.getBoundingClientRect().top > poster.getBoundingClientRect().bottom
      };
    }), { frameOnImage: true, frameOnCard: false, titleInset: true, titleBelow: true });
    const geometry = await page.locator('.card').evaluateAll(nodes => nodes.slice(0, 5).map(node => ({ x: node.offsetLeft, y: node.offsetTop })));
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
    await page.getByRole('button', { name: 'Показать / скрыть страны  ›', exact: true }).click();
    const countryMenu = page.locator('#panel-body');
    const lastCountryOption = countryMenu.locator('button[data-action="hidden"]').last();
    await lastCountryOption.evaluate(node => node.scrollIntoView({ block: 'end' }));
    const countryScroll = await countryMenu.evaluate(node => node.scrollTop);
    assert.ok(countryScroll > 0);
    await lastCountryOption.focus();
    await page.keyboard.press('Enter');
    assert.equal(await lastCountryOption.evaluate(node => document.activeElement === node), true);
    assert.equal(await countryMenu.evaluate(node => node.scrollTop), countryScroll);
    await page.keyboard.press('Enter'); // restore the original visibility
    await page.getByRole('button', { name: 'Француженки — показывать', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Француженки — скрыта', exact: true }).getAttribute('aria-pressed'), 'false');
    await page.getByRole('button', { name: 'Закрепить наверху: Японки', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Открепить: Японки', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button', { name: 'Француженки', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Японки', exact: true }).count(), 1);
    assert.equal(await page.locator('#panel-body button').nth(2).textContent(), 'Японки');
    // Restart restores preferences. No live source requests in demo mode.
    await page.reload(); await selectFirstSource();
    await page.locator('#filters').click();
    await page.getByRole('button', { name: 'Страна / национальность  ›' }).click();
    assert.equal(await page.getByRole('button', { name: 'Француженки', exact: true }).count(), 0);
    assert.equal(await page.locator('#panel-body button').nth(2).textContent(), 'Японки');
    await page.getByRole('button', { name: 'Показать / скрыть страны  ›', exact: true }).click();
    await page.getByRole('button', { name: 'Японки — показывать', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button', { name: 'Японки', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Показать / скрыть страны  ›', exact: true }).click();
    await page.getByRole('button', { name: 'Открепить: Японки', exact: true }).click();
    await page.getByRole('button', { name: 'Закрепить наверху: Японки', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Японки — показывать', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => SisiPlus.Settings.get('country_menu_chaturbate', null)), null);
    await page.getByRole('button', { name: 'Показать все страны', exact: true }).click();
    await page.getByRole('button', { name: 'Открепить: Японки', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button', { name: 'Француженки', exact: true }).count(), 1);
    assert.equal(await page.locator('.group-title').count(), 6);
    // Center-key hold opens actions without selecting a country on key release.
    await page.getByRole('button', { name: 'Японки', exact: true }).focus();
    await page.keyboard.down('Enter');
    await page.getByRole('button', { name: 'Закрепить наверху', exact: true }).waitFor();
    await page.keyboard.up('Enter');
    assert.equal(await page.evaluate(() => SVideosUI.model.state.country), 'all');
    await page.getByRole('button', { name: 'Закрепить наверху', exact: true }).click();
    assert.equal(await page.locator('#panel-body button').nth(2).textContent(), 'Японки');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.countryId), 'jp');
    // Primary mouse hold uses the same menu. Release must not activate the item.
    await page.getByRole('button', { name: 'Японки', exact: true }).hover();
    await page.mouse.down();
    await page.getByRole('button', { name: 'Открепить', exact: true }).waitFor();
    await page.mouse.up();
    await page.getByRole('button', { name: 'Открепить', exact: true }).click();
    await page.getByRole('button', { name: 'Японки', exact: true }).focus();
    await page.keyboard.down('Enter');
    await page.getByRole('button', { name: 'Переместить', exact: true }).waitFor();
    await page.keyboard.up('Enter');
    await page.getByRole('button', { name: 'Переместить', exact: true }).click();
    await page.getByRole('button', { name: 'В конец раздела', exact: true }).click();
    const order = await page.evaluate(() => SisiPlus.Settings.get('country_menu_stripchat').order);
    assert.equal(order[order.length - 1], 'jp');
    await page.reload(); await selectFirstSource();
    assert.deepEqual(await page.evaluate(() => SisiPlus.Settings.get('country_menu_stripchat').order), order);
    await page.locator('#filters').click();
    await page.getByRole('button', { name: 'Страна / национальность  ›' }).click();
    await page.getByRole('button', { name: 'Японки', exact: true }).click();
    assert.equal(await page.locator('#filter-summary').textContent(), 'Японки');
    await page.locator('#modal-layer').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#modal-layer').isHidden(), true);
    await page.locator('#search').click();
    await page.getByRole('searchbox').fill('Aurora');
    await page.getByRole('searchbox').press('Enter');
    await page.waitForFunction(() => document.getElementById('section-title').textContent.includes('Aurora'));
    await page.locator('#modal-layer').waitFor({ state: 'hidden' });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#modal-layer').isHidden(), true);
    await page.locator('#settings').click();
    assert.equal(await page.getByRole('button', { name: 'Проверить обновления', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Зеркала  ›', exact: true }).click();
    await page.getByRole('button', { name: /^Xvideos:/ }).click();
    await page.getByRole('button', { name: 'www.xvideos.es', exact: true }).click();
    assert.equal(await page.locator('.option.selected').textContent(), 'www.xvideos.es');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'www.xvideos.es');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('svideos_settings')).mirror_xvideos), 'https://www.xvideos.es');
    await page.reload(); await selectFirstSource();
    await page.locator('#settings').click();
    await page.getByRole('button', { name: 'Зеркала  ›', exact: true }).click();
    await page.getByRole('button', { name: /^Xvideos: www.xvideos.es/ }).click();
    assert.equal(await page.locator('.option.selected').textContent(), 'www.xvideos.es');
    await page.getByRole('button', { name: 'Автоматически', exact: true }).click();
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Аккаунт Stripchat  ›' }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Cookie' }).count(), 1);
    await page.evaluate(() => {
      window.testOriginalNativeCall = SVideos.call;
      window.testNativeCalls = [];
      SVideos.native = true;
      SVideos.call = async (method, data) => { window.testNativeCalls.push({ method, data }); return true; };
    });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Аккаунт Stripchat  ›' }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Cookie' }).count(), 0);
    await page.getByRole('button', { name: 'Ввести Cookie с клавиатуры ТВ / Google TV', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.testNativeCalls), [{ method: 'editSession', data: { source: 'stripchat' } }]);
    await page.evaluate(() => SVideosEvent('sessionInput', JSON.stringify({ source: 'stripchat', value: 'TEST_ONLY=a+b/c==; encoded=%3B%2B' })));
    assert.equal(await page.evaluate(() => SisiPlus.Auth.getSession('stripchat') === 'TEST_ONLY=a+b/c==; encoded=%3B%2B'), true);
    assert.equal((await page.locator('body').innerText()).includes('TEST_ONLY='), false);
    await page.getByRole('button', { name: 'Удалить сессию', exact: true }).click();
    await page.evaluate(() => { SVideos.native = false; SVideos.call = window.testOriginalNativeCall; delete window.testOriginalNativeCall; delete window.testNativeCalls; });
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.locator('.source').filter({ hasText: 'Chaturbate' }).click();
    await page.waitForFunction(() => document.getElementById('source-name').textContent === 'Chaturbate');
    await page.locator('.card').nth(5).focus();
    await page.evaluate(() => SVideosEvent('closed', ''));
    assert.equal(await page.evaluate(() => document.activeElement.dataset.index), '5');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.index), '4');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.source), 'chaturbate');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.index), '4');
    // Reduced motion bypasses optional Web Animations entirely.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#filters').click();
    assert.equal(await page.locator('#panel').evaluate(node => node.getAnimations().length), 0);
    await page.keyboard.press('Escape');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('.source').filter({ hasText: 'Stripchat' }).click();
    await page.waitForFunction(() => document.getElementById('source-name').textContent === 'Stripchat' && document.querySelectorAll('.card').length > 0);
    await page.locator('.card').first().focus();
    fs.mkdirSync(path.join(__dirname, '../test-results'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '../test-results/catalog.png') });
    await page.locator('#filters').click(); await page.getByRole('button', { name: 'Страна / национальность  ›' }).click();
    await page.screenshot({ path: path.join(__dirname, '../test-results/countries.png') });
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.locator('#settings').click();
    await page.getByRole('button', { name: 'Источники  ›', exact: true }).click();
    await page.getByRole('button', { name: 'Chaturbate — показывать', exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Chaturbate — скрыт');
    assert.equal(await page.locator('.source[data-source="chaturbate"]').count(), 0);
    await page.reload(); await selectFirstSource();
    assert.equal(await page.locator('.source[data-source="chaturbate"]').count(), 0);
    await page.locator('#settings').click();
    await page.getByRole('button', { name: 'Источники  ›', exact: true }).click();
    await page.getByRole('button', { name: 'Chaturbate — скрыт', exact: true }).click();
    assert.equal(await page.locator('.source[data-source="chaturbate"]').count(), 1);
    // Hiding the active source selects a visible fallback, never an empty menu.
    await page.getByRole('button', { name: 'Stripchat — показывать', exact: true }).click();
    await page.waitForFunction(() => SVideosUI.model.state.source === 'chaturbate');
    assert.equal(await page.locator('.source.active').getAttribute('data-source'), 'chaturbate');
    for (const id of await page.locator('[data-source-option][aria-pressed="true"]').evaluateAll(nodes => nodes.map(node => node.dataset.sourceOption))) {
      if (id !== 'chaturbate') await page.locator('[data-source-option="' + id + '"]').click();
    }
    await page.getByRole('button', { name: 'Chaturbate — показывать', exact: true }).click();
    assert.equal(await page.locator('.source').count(), 1);
    for (const id of await page.locator('[data-source-option][aria-pressed="false"]').evaluateAll(nodes => nodes.map(node => node.dataset.sourceOption))) await page.locator('[data-source-option="' + id + '"]').click();
    assert.equal(await page.locator('.source').count(), 8);
    await page.reload();
    await page.locator('.source').first().waitFor();
    assert.equal(await page.locator('.brand-logo').evaluate(node => node.complete && node.naturalWidth > 0), true);
    await page.evaluate(() => { window.exitCalls = 0; SVideos.call = async method => { if (method === 'exit') window.exitCalls++; return true; }; });
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.exitCalls), 0);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.exitCalls), 0);
    await page.waitForTimeout(2100);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.exitCalls), 0);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.exitCalls), 1);
    await page.locator('#settings').click();
    assert.match(await page.locator('#panel').evaluate(node => getComputedStyle(node).animationName), /panel-in/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#modal-layer').evaluate(node => node.classList.contains('closing')), true);
    await page.locator('#modal-layer').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.exitCalls), 1);
    await page.keyboard.down('Escape'); await page.keyboard.down('Escape'); await page.keyboard.down('Escape'); await page.keyboard.up('Escape');
    assert.equal(await page.evaluate(() => window.exitCalls), 1);
    assert.deepEqual(errors, []);
    const brandIds = await page.locator('.source').evaluateAll(nodes => nodes.map(node => node.dataset.source));
    await page.reload();
    const gradients = new Set();
    for (const id of brandIds) {
      await page.locator('.source[data-source="' + id + '"]').click();
      await page.waitForFunction(source => {
        const logo = document.getElementById('source-logo');
        return document.getElementById('catalog-header').dataset.source === source
          && !logo.hidden && logo.complete && logo.naturalWidth > 0
          && document.querySelector('.card');
      }, id);
      assert.equal(await page.locator('#source-text').isHidden(), true);
      const gradient = await page.locator('#catalog-header').evaluate(header => getComputedStyle(header).backgroundImage);
      assert.match(gradient, /linear-gradient/);
      gradients.add(gradient);
    }
    assert.equal(gradients.size, 8);
    assert.deepEqual(errors, []);
    await page.clock.setFixedTime(new Date(2026, 10, 13, 10, 25));
    await page.evaluate(() => SVideosClock.refresh());
    await clock.locator('.clock-leaf').first().waitFor({ state: 'detached' });
    await page.clock.setFixedTime(new Date(2026, 10, 13, 10, 26));
    assert.equal(await page.evaluate(() => {
      SVideosClock.refresh();
      return document.querySelectorAll('.clock-digit .clock-leaf').length;
    }), 2);
    assert.equal(await clock.getAttribute('datetime'), '10:26');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.setFixedTime(new Date(2026, 10, 13, 10, 27));
    await page.evaluate(() => SVideosClock.refresh());
    assert.equal(await clock.locator('.clock-leaf').count(), 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.clock.setFixedTime(new Date());
    console.log('PASS: four columns, D-pad, return focus to active source/card, reduced motion, filters, country order/restart persistence, search/back, accounts, native session entry, mirrors, source visibility/restart/fallback/last-source guard. No JS runtime errors.');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
