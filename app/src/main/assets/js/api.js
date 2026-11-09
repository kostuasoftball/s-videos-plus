(function (global) {
  'use strict';
  const app = global.SisiPlus;
  const cache = new Map();
  const inFlight = new Map();
  const PROXY = 'https://cherry-proxy.aawersom.workers.dev/proxy';
  function proxyUrl(url, referer) {
    return PROXY + '?key=1206&url=' + encodeURIComponent(url) + '&referer=' + encodeURIComponent(referer || '');
  }
  async function request(url, options) {
    if (global.SVideos.native) return global.SVideos.call('request', { url, ...options });
    const control = new AbortController();
    const timer = setTimeout(() => control.abort(), 18000);
    try {
      const response = await fetch(url, { method: options.method || 'GET', headers: options.headers || {}, body: options.body, signal: control.signal, credentials: 'omit' });
      if (!response.ok) { const error = new Error('HTTP ' + response.status); error.status = response.status; throw error; }
      return await response.text();
    } finally { clearTimeout(timer); }
  }
  async function siteText(url, options = {}) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('Источник должен использовать HTTPS');
    const referer = options.referer || parsed.origin + '/';
    const headers = { 'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.7', Referer: referer, ...(options.headers || {}) };
    const privateRequest = Object.keys(headers).some(key => /^(cookie|authorization)$/i.test(key));
    // No session or authorization headers are ever sent to a third-party proxy.
    const proxyAllowed = !privateRequest && options.proxy !== 'never' && app.Settings.get('public_proxy', false) === true;
    if (options.proxy === 'always') {
      if (!proxyAllowed) throw new Error('Резервный прокси выключен. Его можно включить в настройках');
      return request(proxyUrl(url, referer), { headers: {} });
    }
    try { return await request(url, { ...options, headers }); }
    catch (error) {
      if (!proxyAllowed) throw error;
      return request(proxyUrl(url, referer), { headers: {} });
    }
  }
  async function cached(key, producer, ttl = 30000) {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    if (inFlight.has(key)) return inFlight.get(key);
    const job = Promise.resolve().then(producer).then(value => {
      cache.delete(key);
      cache.set(key, { value, expires: Date.now() + ttl });
      while (cache.size > 100) cache.delete(cache.keys().next().value);
      return value;
    }).finally(() => inFlight.delete(key));
    inFlight.set(key, job);
    return job;
  }
  app.Api = {
    siteText,
    async siteJson(url, options) {
      const text = await siteText(url, options);
      try { return JSON.parse(text); } catch (error) { throw new Error('Источник вернул страницу вместо JSON'); }
    },
    cached, isAndroid: () => global.SVideos.native,
    mediaUrl: url => url,
    parseDOM: html => new DOMParser().parseFromString(String(html), 'text/html'),
    cache: { clear: () => cache.clear() }
  };
})(window);
