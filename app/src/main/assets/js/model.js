(function (global) {
  'use strict';
  // No DOM dependency: this controller can be tested without an Android device.
  class Catalog {
    constructor(app, changed) {
      this.app = app;
      this.changed = changed || function () {};
      this.sequence = 0;
      this.state = { source: '', categories: [], filters: [], category: '', country: 'all', query: '', favorites: false, items: [], page: 1, totalPages: 1, busy: false, error: '' };
    }
    emit() { this.changed(this.state); }
    async source(id) {
      const adapter = this.app.getAdapter(id);
      if (!adapter) throw new Error('Источник не найден');
      const token = ++this.sequence;
      Object.assign(this.state, { source: id, categories: [], filters: [], category: '', country: 'all', query: '', favorites: false, items: [], page: 1, totalPages: 1, busy: true, error: '' });
      this.emit();
      const metadata = await Promise.allSettled([adapter.getCategories(), adapter.getFilters()]);
      if (token !== this.sequence) return;
      this.state.categories = metadata[0].status === 'fulfilled' ? metadata[0].value : [];
      this.state.filters = metadata[1].status === 'fulfilled' ? metadata[1].value : [];
      this.state.category = (this.state.categories[0] || {}).id || 'popular';
      return this.load(false);
    }
    async load(append = false) {
      if (!this.state.source) return;
      const token = ++this.sequence;
      const adapter = this.app.getAdapter(this.state.source);
      const page = append ? this.state.page + 1 : 1;
      const { query, category, country, favorites } = this.state;
      this.state.busy = true;
      this.state.error = '';
      if (!append) this.state.items = [];
      this.emit();
      try {
        let result;
        if (favorites) result = { items: await this.app.Auth.favorites(adapter), totalPages: 1 };
        else if (query) result = await adapter.search(query, page, { country });
        else result = await adapter.getList(category, page, { country });
        if (token !== this.sequence) return;
        if (!result || !Array.isArray(result.items)) throw new Error('Источник вернул некорректный каталог');
        const items = result.items.filter(item => item && item.id != null && item.title);
        const combined = append ? this.state.items.concat(items) : items;
        this.state.items = Array.from(new Map(combined.map(item => [String(item.id), item])).values());
        this.state.page = page;
        this.state.totalPages = Math.max(page, Number(result.totalPages) || page);
      } catch (error) {
        if (token !== this.sequence) return;
        this.state.error = error.message || 'Не удалось загрузить источник';
      } finally {
        if (token === this.sequence) { this.state.busy = false; this.emit(); }
      }
    }
    chooseCategory(id) {
      Object.assign(this.state, { category: id, query: '', favorites: false });
      return this.load();
    }
    chooseCountry(id) {
      const filter = this.state.filters.find(entry => entry.id === 'country');
      const option = filter && filter.options.find(entry => entry.id === id && !entry.heading && !entry.separator);
      if (!option) return Promise.resolve(false);
      this.state.country = id;
      return this.load();
    }
    search(query) { this.state.query = String(query || '').trim(); this.state.favorites = false; return this.load(); }
    async nextPage() { if (!this.state.busy && this.state.page < this.state.totalPages) return this.load(true); }
  }
  global.SVideosCatalog = Catalog;
})(typeof window === 'undefined' ? globalThis : window);
