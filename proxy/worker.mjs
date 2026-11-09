/** Optional PRIVATE Cloudflare Worker for public catalog/image/HLS traffic.
 * Deploy to your own account and set PROXY_KEY. Never forwards account cookies.
 * The Android DataSource resolves and proxies each HLS child URI independently.
 */
function checked(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || host === 'localhost' || host.endsWith('.local') || host.includes(':') ||
      /^(0|10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host)) throw new Error('Invalid public HTTPS target');
  return url;
}
export default {
  async fetch(request, env) {
    const input = new URL(request.url);
    if (!env.PROXY_KEY) return new Response('Configure PROXY_KEY before use', { status: 503 });
    if (input.searchParams.get('key') !== env.PROXY_KEY) return new Response('Forbidden', { status: 403 });
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Range, Content-Type, Accept, X-Requested-With', 'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Type', 'Cache-Control': 'no-store' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET' && request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
    try {
      let target = checked(input.searchParams.get('url'));
      const headers = new Headers();
      for (const name of ['Range', 'Accept', 'Content-Type', 'X-Requested-With']) {
        const value = request.headers.get(name); if (value) headers.set(name, value);
      }
      headers.set('User-Agent', 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
      const referer = input.searchParams.get('referer');
      if (referer) { const page = checked(referer); headers.set('Referer', page.href); headers.set('Origin', page.origin); }
      let method = request.method, body;
      if (method === 'POST') { body = await request.arrayBuffer(); if (body.byteLength > 65536) return new Response('Body too large', { status: 413, headers: cors }); }
      for (let redirects = 0; redirects <= 5; redirects++) {
        const response = await fetch(target.href, { method, headers, body, redirect: 'manual' });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          if (!location) return new Response('Invalid upstream redirect', { status: 502, headers: cors });
          target = checked(new URL(location, target));
          if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) { method = 'GET'; body = undefined; }
          if (response.body) await response.body.cancel();
          continue;
        }
        const output = new Headers(response.headers);
        output.delete('Set-Cookie');
        Object.entries(cors).forEach(([name, value]) => output.set(name, value));
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers: output });
      }
      return new Response('Too many redirects', { status: 502, headers: cors });
    } catch (error) { return new Response('Proxy request failed', { status: 502, headers: cors }); }
  }
};
