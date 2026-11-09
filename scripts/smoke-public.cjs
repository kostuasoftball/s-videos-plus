// Read-only checks of public catalog responses. Never prints model titles, URLs or cookies.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../app/src/main/assets/js');
(async () => {
  const ctx = { console: { warn() {}, error() {}, log() {} }, URL, URLSearchParams, Response, AbortController, setTimeout, clearTimeout, fetch,
    localStorage: { getItem: () => null, setItem() {} } };
  ctx.window = ctx; vm.createContext(ctx);
  const files = ['platform.js', 'api.js', 'adapter-utils.js', 'auth.js', 'adapters/live-base.js', 'adapters/pornhub.js', 'adapters/xvideos.js', 'adapters/xhamster.js', 'adapters/efukt.js', 'adapters/bongacams.js', 'adapters/runetki.js', 'adapters/chaturbate.js', 'adapters/stripchat.js'];
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file }));
  const proxy = process.argv.includes('--proxy');
  if (proxy) ctx.SisiPlus.Settings.set('public_proxy', true);
  const checkStreams = process.argv.includes('--streams');
  const ids = process.argv.slice(2).filter(value => !value.startsWith('--'));
  const results = await Promise.all((ids.length ? ids : ['stripchat', 'chaturbate']).map(async id => {
    try {
      const adapter = ctx.SisiPlus.getAdapter(id);
      const categories = await adapter.getCategories();
      const result = await adapter.getList(categories[0].id, 1, {});
      const status = { source: id, cards: result.items.length, ok: result.items.length > 0 };
      if (checkStreams && result.items.length) {
        try {
          const item = result.items[0];
          const video = await adapter.getVideo(item.id, item);
          status.streamQualities = Object.keys(video.streams || {});
          const manifest = Object.values(video.streams || {}).find(url => typeof url === 'string' && url.includes('.m3u8'));
          if (manifest) {
            const response = await fetch(manifest, { headers: video.headers || {}, signal: AbortSignal.timeout(18000) });
            status.hlsHttp = response.status;
            if (response.ok) status.hlsManifest = (await response.text()).startsWith('#EXTM3U');
            else if (response.body) await response.body.cancel();
          }
        } catch (error) { status.streamError = error.message; }
      }
      return status;
    } catch (error) { return { source: id, ok: false, error: error.message }; }
  }));
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), proxyEnabled: proxy, results }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
