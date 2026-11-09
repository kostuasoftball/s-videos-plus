const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../app/src/main/assets/js');
function context(extra = {}) {
  const ctx = { console, URL, Response, AbortController, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} }, ...extra };
  ctx.window = ctx; vm.createContext(ctx);
  for (const name of ['platform.js', 'api.js', 'adapter-utils.js', 'auth.js']) vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), ctx);
  return ctx;
}
test('Android previews use a same-origin binary bridge and normalize relative/HTTP URLs', () => {
  const ctx = context({ SVideosAndroid: { readSettings: () => '{}', dispatch() {} } });
  const images = ctx.SisiPlus.Api.imageSources('//cdn.example/thumb.jpg', 'https://site.example/model');
  const proxy = new URL(images[0]);
  assert.equal(proxy.origin, 'https://appassets.androidplatform.net');
  assert.equal(proxy.pathname, '/image');
  assert.equal(proxy.searchParams.get('url'), 'https://cdn.example/thumb.jpg');
  assert.equal(proxy.searchParams.get('referer'), 'https://site.example/');
  assert.equal(ctx.SisiPlus.Api.imageSources('javascript:alert(1)', 'https://site.example/').length, 0);
  assert.equal(new URL(ctx.SisiPlus.Api.imageSources('http://cdn.example/p.jpg', 'https://site.example/')[0]).searchParams.get('url'), 'https://cdn.example/p.jpg');
});
test('public JSON falls back after a 200 challenge and keeps POST body/content type', async () => {
  const requests = [];
  const ctx = context({ fetch: async (url, options) => {
    requests.push({ url, options });
    return new Response(requests.length === 1 ? '<html>Challenge</html>' : '{"success":true}', { status: 200 });
  } });
  const result = await ctx.SisiPlus.Api.siteJson('https://source.example/ajax', { method: 'POST', body: 'room_slug=public', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(result.success, true); assert.equal(requests.length, 2);
  assert.equal(new URL(requests[1].url).hostname, 'cherry-proxy.aawersom.workers.dev');
  assert.equal(requests[1].options.method, 'POST'); assert.equal(requests[1].options.body, 'room_slug=public');
  assert.equal(requests[1].options.headers['Content-Type'], 'application/x-www-form-urlencoded');
});
test('forced mode still sends real account Cookie/Authorization only directly', async () => {
  const urls = [];
  const ctx = context({ fetch: async (url) => { urls.push(url); throw new Error('blocked'); } });
  ctx.SisiPlus.Settings.set('proxy_mode', 'force');
  await assert.rejects(ctx.SisiPlus.Api.siteJson('https://source.example/account', { headers: { Cookie: 'private=test', Authorization: 'test' } }));
  assert.equal(urls.length, 1); assert.equal(new URL(urls[0]).hostname, 'source.example');
});
test('custom proxy precedes Cherry, and disabled mode keeps public requests direct', async () => {
  const urls = [];
  const ctx = context({ fetch: async url => { urls.push(url); if (new URL(url).hostname === 'cherry-proxy.aawersom.workers.dev') return new Response('ok'); throw new Error('blocked'); } });
  ctx.SisiPlus.Settings.set('proxy_url', 'https://my-proxy.example/?url={url}&referer={referer}');
  ctx.SisiPlus.Settings.set('proxy_mode', 'force');
  assert.equal(await ctx.SisiPlus.Api.siteText('https://source.example/'), 'ok');
  assert.deepEqual(urls.map(url => new URL(url).hostname), ['my-proxy.example', 'cherry-proxy.aawersom.workers.dev']);
  urls.length = 0; ctx.SisiPlus.Settings.set('public_proxy', false);
  await assert.rejects(ctx.SisiPlus.Api.siteText('https://source.example/'));
  assert.deepEqual(urls.map(url => new URL(url).hostname), ['source.example']);
});
test('Chaturbate resolves public HLS from the small API without consent/account cookies', async () => {
  const requests = [];
  const ctx = context({ fetch: async (url, options) => { requests.push({ url, options }); return new Response(JSON.stringify({ room_status: 'public', hls_source: 'https://cdn.example/live.m3u8' })); } });
  ctx.SisiPlus.Adapter = class { constructor(id) { this.id = id; } };
  ctx.SisiPlus.LiveAdapters = { LIVE_COUNTRIES: [] };
  let adapter; ctx.SisiPlus.registerAdapter = value => { adapter = value; };
  vm.runInContext(fs.readFileSync(path.join(root, 'adapters/chaturbate.js'), 'utf8'), ctx);
  const video = await adapter.getVideo('public_room');
  assert.equal(video.streams.HLS, 'https://cdn.example/live.m3u8');
  assert.equal(video.mimeType, 'application/x-mpegURL');
  assert.equal(requests.length, 1);
  assert.equal(Object.keys(requests[0].options.headers).some(key => key.toLowerCase() === 'cookie'), false);
});
test('Chaturbate does not try fallback APIs to unlock non-public rooms', async () => {
  let calls = 0;
  const ctx = context({ fetch: async () => { calls++; return new Response(JSON.stringify({ room_status: 'private', hls_source: '' })); } });
  ctx.SisiPlus.Adapter = class { constructor(id) { this.id = id; } }; ctx.SisiPlus.LiveAdapters = { LIVE_COUNTRIES: [] };
  let adapter; ctx.SisiPlus.registerAdapter = value => { adapter = value; };
  vm.runInContext(fs.readFileSync(path.join(root, 'adapters/chaturbate.js'), 'utf8'), ctx);
  await assert.rejects(adapter.getVideo('private_room'), /публично/); assert.equal(calls, 1);
});
test('private worker forwards binary ranges but strips account and proxy secrets', async () => {
  const worker = (await import('../proxy/worker.mjs')).default;
  const originalFetch = global.fetch;
  let forwarded;
  global.fetch = async (url, options) => { forwarded = { url, options }; return new Response(new Uint8Array([0, 255, 128, 1]), { status: 206, headers: { 'Content-Type': 'video/mp2t', 'Content-Range': 'bytes 5-8/20', 'Set-Cookie': 'upstream=ignored' } }); };
  try {
    const url = 'https://own.example/?key=server-key&url=' + encodeURIComponent('https://cdn.example/segment.ts') + '&referer=' + encodeURIComponent('https://source.example/');
    const response = await worker.fetch(new Request(url, { headers: { Range: 'bytes=5-8', Cookie: 'private=never', Authorization: 'never' } }), { PROXY_KEY: 'server-key' });
    assert.equal(response.status, 206); assert.equal(forwarded.options.headers.get('Range'), 'bytes=5-8');
    assert.equal(forwarded.options.headers.get('Cookie'), null); assert.equal(forwarded.options.headers.get('Authorization'), null);
    assert.equal(forwarded.options.headers.get('Referer'), 'https://source.example/'); assert.equal(response.headers.get('Set-Cookie'), null);
    assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [0, 255, 128, 1]);
    assert.equal((await worker.fetch(new Request('https://own.example/?url=https://cdn.example/'), {})).status, 503);
    assert.equal((await worker.fetch(new Request('https://own.example/?key=wrong&url=https://cdn.example/'), { PROXY_KEY: 'server-key' })).status, 403);
  } finally { global.fetch = originalFetch; }
});
