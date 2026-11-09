(function pornhubAdapterModule(global) {
  'use strict';
  const app = global.SisiPlus;
  const U = app.AdapterUtils;
  const SITE = 'https://www.pornhub.com';
  const ORIGINS = [SITE, 'https://www.pornhub.net', 'https://www.pornhub.org'];
  const API = `${SITE}/webmasters/search`;

  class PornhubAdapter extends app.Adapter {
    constructor() { super('pornhub'); this.items = new Map(); app.Api.registerMirrors(this.id, ORIGINS); }
    getName() { return 'Pornhub'; }
    getCategories() {
      return Promise.resolve([
        { id: 'sort:mostrecent', title: 'Новинки', group: 'sort' },
        { id: 'sort:mostviewed', title: 'Популярные', group: 'sort' },
        { id: 'sort:rating', title: 'По рейтингу', group: 'sort' },
        { id: 'category:russian', title: 'Русские', group: 'genre' },
        { id: 'category:amateur', title: 'Любительское', group: 'genre' },
        { id: 'category:anal', title: 'Анал', group: 'genre' },
        { id: 'category:milf', title: 'MILF', group: 'genre' },
        { id: 'category:lesbian', title: 'Лесбиянки', group: 'genre' },
        { id: 'category:transgender', title: 'Транс', group: 'genre' }
      ]);
    }
    mapVideo(video, origin = SITE) {
      const page = app.Api.publicUrl(video.url || '', origin, ORIGINS);
      const id = String(video.video_id || ((page.match(/viewkey=([^&]+)/) || [])[1]) || page);
      const thumbs = [video.default_thumb, video.thumb].concat((video.thumbs || []).map((item) => item.src));
      const poster = thumbs.find((url) => url && url.includes('hdnea=')) || thumbs.find(Boolean) || '';
      const item = {
        id, title: video.title || id, poster, background: poster,
        badge: [video.duration, video.views ? `${video.views} просм.` : ''].filter(Boolean).join(' · '),
        webpageUrl: page, sourceData: video
      };
      this.items.set(id, item);
      return item;
    }
    async request(query, page, ordering, category) {
      const url = new URL(API);
      url.searchParams.set('search', query || '');
      url.searchParams.set('page', String(page));
      url.searchParams.set('ordering', ordering || 'mostrecent');
      url.searchParams.set('thumbsize', 'medium_hd');
      if (category) url.searchParams.set('category', category);
      const resolved = await app.Api.cached(`ph:${url}`, () => app.Api.publicJson(url.href, ORIGINS, { validateData: data => !!data && (Array.isArray(data.videos) || !!data.data && Array.isArray(data.data.videos)) }), 45_000);
      const data = resolved.data;
      const videos = data.videos || (data.data && data.data.videos) || [];
      return U.result(videos.map((video) => this.mapVideo(video, resolved.origin)), page, videos.length >= 20 ? page + 1 : page);
    }
    getList(category = 'sort:mostrecent', page = 1) {
      const parts = String(category).split(':');
      return this.request('', page, parts[0] === 'sort' ? parts[1] : 'mostrecent', parts[0] === 'category' ? parts[1] : '');
    }
    search(query, page = 1) { return this.request(query, page, 'mostrecent', ''); }
    async getVideo(id, item = {}) {
      const card = item.webpageUrl ? item : this.items.get(String(id));
      const pageUrl = card && card.webpageUrl ? card.webpageUrl : `${SITE}/view_video.php?viewkey=${encodeURIComponent(id)}`;
      const resolved = await app.Api.publicText(pageUrl, ORIGINS, { validate: html => /flashvars_|mediaDefinitions/.test(html) });
      const html = resolved.text;
      const marker = (html.match(/var\s+(flashvars_\d+)\s*=/) || [])[1];
      const flashvars = marker ? U.extractAssignedJson(html, `var ${marker} =`) || U.extractAssignedJson(html, `var ${marker}=`) : null;
      const streams = {};
      for (const definition of (flashvars && flashvars.mediaDefinitions) || []) {
        const source = String(definition.videoUrl || '').replace(/\\\//g, '/');
        if (!source) continue;
        if (/get_media|\/video\/get_media/i.test(source)) {
          try {
            const media = await app.Api.siteJson(source, { referer: resolved.origin + '/' });
            (Array.isArray(media) ? media : []).forEach(entry => { if (entry.videoUrl) streams[`${entry.quality || 'original'}p`] = entry.videoUrl; });
          } catch (error) {}
          continue;
        }
        const hls = /\.m3u8(?:[?#]|$)/i.test(source);
        const label = !Array.isArray(definition.quality) && /^\d+$/.test(String(definition.quality)) ? `${definition.quality}p` : hls ? 'HLS' : 'original';
        streams[label] = source;
      }
      return { title: card ? card.title : 'Pornhub', poster: card ? card.poster : '', streams, webpageUrl: pageUrl, headers: { Referer: resolved.origin + '/', Origin: resolved.origin } };
    }
  }
  app.registerAdapter(new PornhubAdapter());
})(window);
