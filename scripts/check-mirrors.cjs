// Read-only mirror inventory: public HTML/API only; never fetches account data or eFukt.
const fs = require('node:fs'), path = require('node:path');
const mirrors = {
  stripchat: ['https://ru.stripchat.com', 'https://stripchat.com', 'https://superchat.live'],
  chaturbate: ['https://chaturbate.com', 'https://chaturbate.eu', 'https://chaturbate.global'],
  pornhub: ['https://www.pornhub.com', 'https://www.pornhub.net', 'https://www.pornhub.org'],
  xvideos: ['https://www.xvideos.com', 'https://www.xvideos2.com', 'https://www.xvideos.es'],
  xhamster: ['https://xhamster.com', 'https://xhamster.one', 'https://xhamster.desi', 'https://xhms.pro', 'https://xhday.com', 'https://xhvid.com', 'https://xhamster2.com', 'https://xhamster11.com', 'https://xhamster26.com', 'https://xhamster20.desi'],
  bongacams: ['https://ukr.bongacams.com', 'https://ee.bongacams.com', 'https://bongacams.com'],
  runetki: ['https://rt.runetki.com', 'https://runetki.com', 'https://rus.runetki5.com', 'https://runetki5.com', 'https://ru.runetki.com', 'https://ru6.runetki6.com', 'https://runetki12.com', 'https://rt.runetki5.com']
};
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const proxy = (url, origin) => 'https://cherry-proxy.aawersom.workers.dev/proxy?key=1206&url=' + encodeURIComponent(url) + '&referer=' + encodeURIComponent(origin + '/');
async function fetchPage(url, origin, proxied) {
  const target = proxied ? proxy(url, origin) : url;
  try {
    const headers = { 'User-Agent': ua, Referer: origin + '/' };
    if (url.includes('/tools/listing_v3.php')) { headers['X-Requested-With'] = 'XMLHttpRequest'; headers.Accept = 'application/json'; }
    const response = await fetch(target, { headers: proxied ? {} : headers, signal: AbortSignal.timeout(7000) });
    if (!response.ok) { if (response.body) await response.body.cancel(); return { status: response.status }; }
    const chunks = []; let total = 0;
    for await (const chunk of response.body) { chunks.push(chunk); total += chunk.length; if (total > 5 * 1024 * 1024) throw new Error('response too large'); }
    const text = Buffer.concat(chunks).toString('utf8');
    return { status: response.status, landedHost: new URL(response.url).host, type: response.headers.get('content-type'), text, bytes: total };
  } catch (error) { return { error: error.cause && error.cause.code || error.message }; }
}
function shape(text = '') {
  let json; try { json = JSON.parse(text); } catch {}
  return {
    models: Array.isArray(json && json.models) ? json.models.length : Array.isArray(json && json.results) ? json.results.length : 0,
    videos: Array.isArray(json && json.videos) ? json.videos.length : 0,
    hasPublicHls: !!(json && json.hls_source && (!json.room_status || json.room_status === 'public')),
    thumbs: (text.match(/\bthumb-block\b/g) || []).length,
    initials: /window\.initials\s*=/.test(text),
    listingConfig: /listingConfiguration/.test(text),
    challenge: /just a moment|cf-chl-|checking your browser/i.test(text.slice(0, 20000))
  };
}
(async () => {
  const first = await fetchPage('https://chaturbate.com/api/public/affiliates/onlinerooms/?wm=9cg6A&client_ip=request_ip&limit=3', 'https://chaturbate.com', true);
  let sample = ''; try { sample = JSON.parse(first.text).results.find(model => !model.current_show || model.current_show === 'public').username; } catch {}
  const tasks = Object.entries(mirrors).flatMap(([source, origins]) => origins.map(origin => ({ source, origin })));
  const results = [], queue = tasks.slice();
  async function worker() {
    while (queue.length) {
      const { source, origin } = queue.shift();
      const suffix = source === 'pornhub' ? '/webmasters/search?search=&page=1&ordering=mostrecent&thumbsize=medium_hd' :
        source === 'chaturbate' && sample ? '/api/chatvideocontext/' + encodeURIComponent(sample) + '/' :
        source === 'bongacams' || source === 'runetki' ? '/tools/listing_v3.php?livetab=all&offset=0&limit=72' : '/';
      const entry = { source, origin, routes: {} };
      for (const routed of [false, true]) {
        const data = await fetchPage(origin + suffix, origin, routed);
        const parsed = shape(data.text);
        const label = routed ? 'cherry' : 'direct';
        const { text, ...meta } = data; entry.routes[label] = { ...meta, ...parsed };
        if (data.text && data.status === 200) {
          const dir = path.resolve(__dirname, '../.local/mirror-pages'); fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, source + '-' + new URL(origin).host + '-' + label + '.txt'), data.text);
        }
        if ((source === 'bongacams' || source === 'runetki') && !parsed.models) {
          const page = await fetchPage(origin + '/', origin, routed); const { text: html, ...pageMeta } = page;
          entry.routes[label + 'Home'] = { ...pageMeta, ...shape(html) };
          if (html && page.status === 200) { const dir = path.resolve(__dirname, '../.local/mirror-pages'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, source + '-' + new URL(origin).host + '-' + label + '-home.txt'), html); }
        }
      }
      results.push(entry); console.log(JSON.stringify(entry));
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  const report = { checkedAt: new Date().toISOString(), scope: `Seven sources and ${tasks.length} identified public origins; eFukt explicitly excluded`, results: results.sort((a, b) => a.source.localeCompare(b.source) || a.origin.localeCompare(b.origin)) };
  fs.mkdirSync(path.resolve(__dirname, '../reports'), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, '../reports/mirrors-2026-11-09.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Saved reports/mirrors-2026-11-09.json');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
