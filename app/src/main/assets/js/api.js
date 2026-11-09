(function (global) {
  'use strict';
  const app = global.SisiPlus;
  const cache = new Map();
  const inFlight = new Map();
  const workingOrigins = new Map();
  const mirrorSources = new Map();
  let mirrorRevision = 0;
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const PROXY = 'https://cherry-proxy.aawersom.workers.dev/proxy';
  function sensitive(headers = {}) { return Object.keys(headers).some(key => /^(cookie|authorization|proxy-authorization)$/i.test(key)); }
  function proxyUrls(url, referer = '') {
    const urls = [], custom = String(app.Settings.get('proxy_url', '') || '').trim();
    if (custom) {
      try {
        const value = (custom.includes('{url}') ? custom.replace('{url}', encodeURIComponent(url)) : custom + encodeURIComponent(url)).replace('{referer}', encodeURIComponent(referer));
        const parsed = new URL(value);
        if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) urls.push(parsed.href);
      } catch (error) {}
    }
    urls.push(PROXY + '?key=1206&url=' + encodeURIComponent(url) + '&referer=' + encodeURIComponent(referer));
    return Array.from(new Set(urls));
  }
  async function request(url, options) {
    if (global.SVideos.native) return global.SVideos.call('request', { url, method: options.method || 'GET', body: options.body, headers: options.headers || {}, timeout: options.timeout || 10000 });
    const control = new AbortController();
    const timer = setTimeout(() => control.abort(), options.timeout || 18000);
    try {
      const response = await fetch(url, { method: options.method || 'GET', headers: options.headers || {}, body: options.body, signal: control.signal, credentials: 'omit' });
      if (!response.ok) { const error = new Error('HTTP ' + response.status); error.status = response.status; throw error; }
      return await response.text();
    } finally { clearTimeout(timer); }
  }
  async function siteText(url, options = {}) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Источник должен использовать HTTPS');
    const referer = options.referer || parsed.origin + '/';
    const headers = { 'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.7', 'User-Agent': USER_AGENT, Referer: referer, ...(options.headers || {}) };
    const privateRequest = sensitive(headers);
    // No session or authorization headers are ever sent to a third-party proxy.
    const proxyAllowed = !privateRequest && options.proxy !== 'never' && app.Settings.get('public_proxy', true) === true;
    if (options.proxy === 'always' && !proxyAllowed) throw new Error(privateRequest ? 'Сессионные запросы через публичные прокси запрещены' : 'Прокси выключен в настройках');
    // Force mode is for media; public API/pages still try direct mirrors first.
    const force = proxyAllowed && options.proxy === 'always';
    const routes = force ? [] : [{ url, options: { ...options, headers } }];
    if (proxyAllowed) {
      const publicHeaders = {};
      Object.keys(options.headers || {}).forEach(key => { if (/^(accept|content-type)$/i.test(key)) publicHeaders[key] = options.headers[key]; });
      proxyUrls(url, referer).forEach(proxy => routes.push({ url: proxy, options: { ...options, headers: publicHeaders } }));
    }
    let lastError;
    for (const route of routes) {
      try {
        const text = await request(route.url, route.options);
        if (typeof options.validate === 'function' && !options.validate(text)) throw new Error('Источник вернул страницу проверки вместо данных');
        return text;
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('Нет доступного маршрута');
  }
  async function cached(key, producer, ttl = 30000) {
    key = mirrorRevision + ':' + key;
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
  function imageSources(value, page) {
    try {
      const url = new URL(value, page);
      if (url.protocol === 'http:') url.protocol = 'https:';
      if (url.protocol !== 'https:' || url.username || url.password) return [];
      const referer = new URL(page || url.href).origin + '/';
      if (global.SVideos.native) return ['https://appassets.androidplatform.net/image?url=' + encodeURIComponent(url.href) + '&referer=' + encodeURIComponent(referer)];
      const proxies = app.Settings.get('public_proxy', true) === true ? proxyUrls(url.href, referer) : [];
      return app.Settings.get('proxy_mode', 'auto') === 'force' && proxies.length ? proxies : [url.href].concat(proxies);
    } catch (error) { return []; }
  }
  function publicUrl(value, origin, allowed) {
    if (!value) return '';
    const url = new URL(value, origin);
    if (allowed.includes(url.origin)) return origin + url.pathname + url.search + url.hash;
    return url.href;
  }
  function registerMirrors(id, origins) {
    const allowed = Array.from(new Set(origins));
    allowed.forEach(origin => {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'https:' || parsed.origin !== origin || parsed.username || parsed.password) throw new Error('Invalid mirror origin');
    });
    mirrorSources.set(id, allowed);
  }
  function getMirrors(id) {
    const origins = mirrorSources.get(id) || [];
    const stored = app.Settings.get('mirror_' + id, 'auto');
    return { origins: origins.slice(), selected: origins.includes(stored) ? stored : 'auto' };
  }
  function selectMirror(id, origin) {
    const origins = mirrorSources.get(id);
    if (!origins || (origin !== 'auto' && !origins.includes(origin))) throw new Error('Unknown mirror');
    app.Settings.set('mirror_' + id, origin);
    mirrorRevision += 1;
    workingOrigins.delete(origins.join('|'));
    cache.clear();
  }
  async function publicText(url, origins, options = {}) {
    const original = new URL(url);
    if (sensitive(options.headers) || !origins.includes(original.origin)) {
      return { text: await siteText(url, { ...options, proxy: 'never' }), origin: original.origin, url };
    }
    const key = origins.join('|'), remembered = workingOrigins.get(key);
    const entry = Array.from(mirrorSources.entries()).find(([, allowed]) => allowed.join('|') === key);
    const selected = entry ? getMirrors(entry[0]).selected : 'auto';
    const preferred = selected !== 'auto' ? selected : remembered;
    const ordered = preferred ? [preferred].concat(origins.filter(origin => origin !== preferred)) : origins;
    const deadline = options.deadline || Date.now() + 35000;
    let lastError;
    for (const origin of ordered) {
      if (Date.now() > deadline) break;
      const target = origin + original.pathname + original.search;
      try {
        const text = await siteText(target, { ...options, timeout: options.timeout || 5000, referer: origin + '/',
          validate: options.validate ? value => options.validate(value, origin) : undefined });
        workingOrigins.set(key, origin); return { text, origin, url: target };
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('Ни основной адрес, ни зеркала не ответили');
  }
  async function publicJson(url, origins, options = {}) {
    const result = await publicText(url, origins, { ...options, validate: text => {
      try { const data = JSON.parse(text); return !options.validateData || options.validateData(data); } catch (error) { return false; }
    } });
    return { ...result, data: JSON.parse(result.text) };
  }
  app.Api = {
    siteText,
    async siteJson(url, options = {}) {
      const text = await siteText(url, { ...options, validate: value => { try { JSON.parse(value); return true; } catch (error) { return false; } } });
      return JSON.parse(text);
    },
    cached, imageSources, proxyUrls, publicText, publicJson, publicUrl, registerMirrors, getMirrors, selectMirror, isAndroid: () => global.SVideos.native,
    mediaUrl: url => url,
    parseDOM: html => new DOMParser().parseFromString(String(html), 'text/html'),
    cache: { clear: () => cache.clear() }
  };
})(window);
