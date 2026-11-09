const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../app/src/main/assets/js');
function context(extra = {}) {
  const ctx = { console, URL, URLSearchParams, Response, AbortController, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {} }, ...extra };
  ctx.window = ctx; return vm.createContext(ctx);
}
function load(ctx, name) { vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), ctx, { filename: name }); }
function registry(ctx) {
  ['platform.js', 'api.js', 'adapter-utils.js', 'auth.js', 'adapters/live-base.js', 'adapters/pornhub.js',
    'adapters/xvideos.js', 'adapters/xhamster.js', 'adapters/efukt.js', 'adapters/bongacams.js',
    'adapters/runetki.js', 'adapters/chaturbate.js', 'adapters/stripchat.js'].forEach(file => load(ctx, file));
}
test('all source files parse and eight adapters register without Lampa', () => {
  for (const file of fs.readdirSync(root, { recursive: true }).filter(file => file.endsWith('.js'))) {
    new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file });
  }
  const ctx = context(); registry(ctx);
  assert.equal(ctx.SisiPlus.getAdapters().length, 8);
  assert.equal(ctx.Lampa, undefined);
  assert.equal(ctx.SVideos.native, false);
});
test('a late source response never replaces the newly selected source', async () => {
  const ctx = context(); load(ctx, 'model.js');
  let complete;
  const a = { getCategories: async () => [{ id: 'a' }], getFilters: async () => [], getList: () => new Promise(resolve => { complete = resolve; }) };
  const b = { getCategories: async () => [{ id: 'b' }], getFilters: async () => [], getList: async () => ({ items: [{ id: 'b', title: 'New' }], totalPages: 1 }) };
  const model = new ctx.SVideosCatalog({ getAdapter: id => id === 'a' ? a : b });
  const first = model.source('a');
  await new Promise(resolve => setTimeout(resolve, 0));
  await model.source('b'); complete({ items: [{ id: 'a', title: 'Stale' }], totalPages: 1 }); await first;
  assert.equal(model.state.source, 'b'); assert.equal(model.state.items[0].id, 'b'); assert.equal(model.state.busy, false);
});
test('continent headings cannot become country filters and pages merge without duplicates', async () => {
  const ctx = context(); load(ctx, 'model.js');
  let pageRequested;
  const adapter = { getCategories: async () => [{ id: 'popular' }], getFilters: async () => [{ id: 'country', options: [{ id: 'heading:Asia', heading: true }, { id: 'jp' }] }],
    getList: async (category, page, filters) => { pageRequested = { page, filters }; return { items: page === 1 ? [{ id: 1, title: 'One' }] : [{ id: 1, title: 'One' }, { id: 2, title: 'Two' }], totalPages: 2 }; } };
  const model = new ctx.SVideosCatalog({ getAdapter: () => adapter }); await model.source('stripchat');
  assert.equal(await model.chooseCountry('heading:Asia'), false); assert.equal(model.state.country, 'all');
  await model.chooseCountry('jp'); assert.equal(pageRequested.filters.country, 'jp');
  await model.nextPage(); assert.equal(model.state.items.length, 2); assert.equal(pageRequested.page, 2);
});
test('authenticated requests never fall back to the public proxy', async () => {
  const urls = [];
  const ctx = context({ fetch: async url => { urls.push(url); throw new Error('Offline'); } });
  registry(ctx); ctx.SisiPlus.Settings.set('public_proxy', true);
  await assert.rejects(ctx.SisiPlus.Api.siteText('https://stripchat.com/api/test', { headers: { Cookie: 'test=session' } }));
  assert.equal(urls.length, 1); assert.equal(new URL(urls[0]).hostname, 'stripchat.com');
});
test('native calls resolve once and propagate status without requiring a browser fetch', async () => {
  const ctx = context({ SVideosAndroid: { readSettings: () => '{}', dispatch(id) { ctx.SVideosNativeResult(id, { ok: true, value: 'native-result' }); } } });
  load(ctx, 'platform.js');
  assert.equal(await ctx.SVideos.call('request', {}), 'native-result');
});
test('catalog failures release loading state and keep retry possible', async () => {
  const ctx = context(); load(ctx, 'model.js');
  const adapter = { getCategories: async () => [], getFilters: async () => [], getList: async () => { throw new Error('Offline'); } };
  const model = new ctx.SVideosCatalog({ getAdapter: () => adapter }); await model.source('xvideos');
  assert.equal(model.state.busy, false); assert.equal(model.state.error, 'Offline');
  adapter.getList = async () => ({ items: [{ id: 1, title: 'Recovered' }] }); await model.load();
  assert.equal(model.state.error, ''); assert.equal(model.state.items.length, 1);
});
