// Read-only checks of public catalog responses. Never prints model titles, URLs or cookies.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../app/src/main/assets/js');
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function checkSegment(manifest, headers, check, proxyUrls, initial) {
  async function routed(url, requestHeaders) {
    const routes = [url].concat(proxyUrls(url, headers.Referer || ''));
    let last;
    for (const route of routes) {
      try {
        const response = await fetch(route, { headers: route === url ? requestHeaders : requestHeaders.Range ? { Range: requestHeaders.Range } : {}, signal: AbortSignal.timeout(12000) });
        if (response.ok || [401, 404, 410].includes(response.status) || route === routes[routes.length - 1]) return { response, base: route === url ? response.url : url, proxied: route !== url };
        if (response.body) await response.body.cancel();
        last = new Error('HTTP ' + response.status);
      } catch (error) { last = error; }
    }
    throw last;
  }
  let url = manifest;
  for (let depth = 0; depth < 4; depth++) {
    const { response, base, proxied } = depth === 0 && initial ? { response: new Response(initial.text), base: initial.base, proxied: false } : await routed(url, headers);
    if (!check.playlistChecks) check.playlistChecks = [];
    check.playlistChecks.push({ host: new URL(url).host, http: response.status, proxied });
    if (proxied) check.usedMediaProxy = true;
    if (!response.ok) { if (response.body) await response.body.cancel(); check.segmentHttp = response.status; return; }
    const text = await response.text();
    if (!text.startsWith('#EXTM3U')) throw new Error('Expected HLS playlist');
    const child = text.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#'));
    if (!child) throw new Error('Empty HLS playlist');
    url = new URL(child, base).href;
    if (!url.startsWith('https://')) throw new Error('Non-HTTPS HLS child');
    if (text.includes('#EXT-X-STREAM-INF')) continue;
    // fMP4 starts with an initialization segment; otherwise check the first media segment.
    const init = (text.match(/#EXT-X-MAP:[^\r\n]*URI="([^"]+)"/) || [])[1];
    if (init) url = new URL(init, base).href;
    const routedSegment = await routed(url, { ...headers, Range: 'bytes=0-1023' });
    const segment = routedSegment.response;
    if (routedSegment.proxied) check.usedMediaProxy = true;
    check.segmentHttp = segment.status;
    check.segmentBytes = 0;
    const reader = segment.body && segment.body.getReader();
    if (reader) { const first = await reader.read(); check.segmentBytes = first.value ? first.value.length : 0; await reader.cancel(); }
    check.segmentAvailable = segment.ok && check.segmentBytes > 0 && !/text\/html/.test(segment.headers.get('content-type') || '');
    return;
  }
  throw new Error('Too many nested HLS playlists');
}
(async () => {
  const ctx = { console: { warn() {}, error() {}, log() {} }, URL, URLSearchParams, Response, AbortController, setTimeout, clearTimeout, fetch,
    localStorage: { getItem: () => null, setItem() {} } };
  ctx.window = ctx; vm.createContext(ctx);
  const files = ['platform.js', 'api.js', 'adapter-utils.js', 'auth.js', 'adapters/live-base.js', 'adapters/pornhub.js', 'adapters/xvideos.js', 'adapters/xhamster.js', 'adapters/efukt.js', 'adapters/bongacams.js', 'adapters/runetki.js', 'adapters/chaturbate.js', 'adapters/stripchat.js'];
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file }));
  const proxy = process.argv.includes('--proxy');
  if (proxy) ctx.SisiPlus.Settings.set('public_proxy', true);
  const checkStreams = process.argv.includes('--streams');
  const sampleCount = Math.min(3, Math.max(1, Number((process.argv.find(value => value.startsWith('--samples=')) || '').split('=')[1]) || 1));
  const ids = process.argv.slice(2).filter(value => !value.startsWith('--'));
  const results = await Promise.all((ids.length ? ids : ['stripchat', 'chaturbate']).map(async id => {
    try {
      const adapter = ctx.SisiPlus.getAdapter(id);
      const categories = await adapter.getCategories();
      const result = await adapter.getList(categories[0].id, 1, {});
      const status = { source: id, cards: result.items.length, ok: result.items.length > 0 };
      if (result.items.length && process.argv.includes('--images')) {
        status.previewChecks = [];
        const card = result.items[0];
        for (const url of ctx.SisiPlus.Api.imageSources(card.poster, card.webpageUrl)) {
          try {
            const response = await fetch(url, { headers: { 'User-Agent': userAgent, Referer: new URL(card.webpageUrl).origin + '/' }, signal: AbortSignal.timeout(10000) });
            const type = response.headers.get('content-type') || '';
            status.previewChecks.push({ http: response.status, image: response.ok && type.startsWith('image/') });
            if (response.body) await response.body.cancel();
            if (response.ok && type.startsWith('image/')) break;
          } catch (error) { status.previewChecks.push({ error: error.cause && error.cause.code || error.message }); }
        }
      }
      if (checkStreams && result.items.length) {
        status.streamChecks = [];
        for (const item of result.items.slice(0, sampleCount)) {
        const check = {};
        try {
          const video = await adapter.getVideo(item.id, item);
          check.streamQualities = Object.keys(video.streams || {});
          const manifest = Object.values(video.streams || {}).find(url => typeof url === 'string' && url.includes('.m3u8'));
          if (manifest) {
            const response = await fetch(manifest, { headers: { 'User-Agent': userAgent, ...(video.headers || {}) }, signal: AbortSignal.timeout(18000) });
            check.hlsHttp = response.status;
            if (response.ok) {
              const text = await response.text();
              check.hlsManifest = text.startsWith('#EXTM3U');
              if (check.hlsManifest && process.argv.includes('--segments')) await checkSegment(manifest, { 'User-Agent': userAgent, ...(video.headers || {}) }, check, ctx.SisiPlus.Api.proxyUrls, { text, base: response.url });
            }
            else if (response.body) await response.body.cancel();
          }
        } catch (error) { check.streamError = error.message; }
        status.streamChecks.push(check);
        }
      }
      return status;
    } catch (error) { return { source: id, ok: false, error: error.message }; }
  }));
  const report = JSON.stringify({ checkedAt: new Date().toISOString(), proxyEnabled: ctx.SisiPlus.Settings.get('public_proxy', true), results }, null, 2);
  const output = process.argv.find(value => value.startsWith('--output='));
  if (output) fs.writeFileSync(path.resolve(output.slice('--output='.length)), report + '\n');
  console.log(report);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
