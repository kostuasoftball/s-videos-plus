(function (global) {
  'use strict';
  const app = global.SisiPlus, native = global.SVideos;
  const $ = id => document.getElementById(id);
  const demo = !native.native && new URLSearchParams(location.search).has('demo');
  let modal = false, restoreFocus = null, playing = false, playIndex = -1, playVersion = 0, playBusy = false;
  let catalogKey = '', sourcesKey = '', toastTimer, queryText = '', lastFocusedCard = '';
  let panelBack = null;
  const sourceIds = ['stripchat', 'chaturbate', 'bongacams', 'runetki', 'pornhub', 'xvideos', 'xhamster', 'efukt'];
  if (demo) {
    $('demo-label').hidden = false;
    sourceIds.forEach(id => {
      const adapter = app.getAdapter(id);
      adapter.getList = async () => ({ items: Array.from({ length: 24 }, (_, i) => ({
        id: 'demo-' + i, title: ['Aurora', 'Mia', 'Sofia', 'Luna', 'Emma', 'Eva', 'Alice', 'Nora'][i % 8] + (i >= 8 ? ' ' + (i + 1) : ''),
        country: ['jp', 'fr', 'co', 'de'][i % 4], badge: [1264, 842, 724, 610][i % 4] + ' зр.'
      })), totalPages: 2 });
      adapter.search = adapter.getList;
    });
  }
  const model = new global.SVideosCatalog(app, render);
  function replace(node, ...children) {
    while (node.firstChild) node.removeChild(node.firstChild);
    children.forEach(child => node.appendChild(child));
  }
  function scale() {
    // innerWidth may include the unscaled 1600px canvas on older Android WebViews.
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    const ratio = Math.min(width / 1600, height / 900);
    $('screen').style.transform = 'scale(' + ratio + ')';
    $('screen').style.left = (width - 1600 * ratio) / 2 + 'px';
    $('screen').style.top = (height - 900 * ratio) / 2 + 'px';
  }
  function clock() { $('clock').textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
  function toast(message) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
  }
  function button(label, className, callback) {
    const node = document.createElement('button'); node.className = className; node.textContent = label;
    node.addEventListener('click', callback); return node;
  }
  function focus(node) { if (node && node.isConnected) { node.focus({ preventScroll: true }); node.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } }
  function appear(node, slide = false) {
    if (!node.animate || (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    if (node._appearance) node._appearance.cancel();
    node._appearance = node.animate(slide ? [{ opacity: 0, transform: 'translateX(12px)' }, { opacity: 1, transform: 'translateX(0)' }] : [{ opacity: 0.4 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
  }
  function currentSourceButton() {
    return Array.from(document.querySelectorAll('.source')).find(node => node.dataset.source === model.state.source);
  }
  function panel(title, draw, back) {
    const wasOpen = modal;
    if (!modal) restoreFocus = document.activeElement;
    modal = true; panelBack = back || null; $('modal-layer').hidden = false;
    $('panel-title').textContent = title; replace($('panel-body'));
    draw($('panel-body'));
    appear(wasOpen ? $('panel-body') : $('panel'), !wasOpen);
    focus($('panel-body').querySelector('.selected, button, input, textarea') || $('panel-close'));
  }
  function closePanel() {
    modal = false; panelBack = null; $('modal-layer').hidden = true;
    focus(restoreFocus && restoreFocus.isConnected ? restoreFocus : document.querySelector('.card, .source.active'));
  }
  function description(body, message) { const p = document.createElement('p'); p.className = 'panel-description'; p.textContent = message; body.appendChild(p); }
  function option(body, label, callback, selected = false) {
    const node = button(label, 'option' + (selected ? ' selected' : ''), callback); body.appendChild(node); return node;
  }
  function render(state) {
    const adapter = app.getAdapter(state.source);
    if (!adapter) return;
    $('source-name').textContent = adapter.getName();
    $('source-description').textContent = ['stripchat', 'chaturbate', 'bongacams', 'runetki'].includes(state.source) ? 'Прямые трансляции' : 'Видеокаталог';
    $('favorites').hidden = !adapter.getCapabilities().favorites;
    const countries = state.filters.find(filter => filter.id === 'country');
    const selected = countries && countries.options.find(item => item.id === state.country);
    $('filter-summary').textContent = selected ? selected.title : 'Все страны';
    const category = state.categories.find(item => item.id === state.category);
    $('section-title').textContent = state.favorites ? 'Избранные модели' : state.query ? 'Поиск: ' + state.query : (category && category.title) || 'Каталог';
    $('breadcrumb').textContent = state.query ? 'Каталог / Поиск' : 'Каталог';
    $('busy').hidden = !state.busy;
    const key = JSON.stringify([state.source, state.category, state.categories]);
    if (sourcesKey !== key) {
      sourcesKey = key;
      replace($('sources'), ...sourceIds.map(id => {
        const node = button(app.getAdapter(id).getName(), 'source' + (state.source === id ? ' active' : ''), () => selectSource(id));
        node.dataset.source = id; return node;
      }));
      replace($('categories'), ...state.categories.map(item => button(item.title, 'category' + (state.category === item.id ? ' active' : ''), () => model.chooseCategory(item.id))));
    }
    const newKey = JSON.stringify([state.source, state.category, state.country, state.query, state.favorites, state.items.map(item => item.id)]);
    if (newKey !== catalogKey) {
      const prior = document.activeElement;
      const priorId = prior && prior.dataset ? prior.dataset.id : '';
      const hadCardFocus = prior && prior.classList.contains('card');
      catalogKey = newKey;
      replace($('cards'), ...state.items.map((item, index) => {
        const card = button('', 'card', () => play(index)); card.dataset.id = String(item.id); card.dataset.index = String(index); card.setAttribute('role', 'listitem');
        card.addEventListener('focus', () => { lastFocusedCard = String(item.id); });
        card.addEventListener('contextmenu', event => { event.preventDefault(); videoMenu(item, index); });
        const poster = document.createElement('div'); poster.className = 'poster placeholder';
        const images = item.poster ? app.Api.imageSources(item.poster, item.webpageUrl) : [];
        if (images.length) {
          let attempt = 0;
          const image = document.createElement('img'); image.src = images[attempt]; image.loading = 'lazy'; image.alt = '';
          image.addEventListener('error', () => { attempt += 1; if (attempt < images.length) image.src = images[attempt]; else image.remove(); });
          image.addEventListener('load', () => poster.classList.remove('placeholder')); poster.appendChild(image);
        }
        const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = item.offline ? 'OFFLINE' : item.badge || 'Смотреть'; poster.appendChild(badge);
        const title = document.createElement('span'); title.className = 'card-title'; title.textContent = item.title;
        const meta = document.createElement('span'); meta.className = 'card-meta';
        const country = document.createElement('span'); country.textContent = item.country ? app.AdapterUtils.countryLabel(item.country) : '';
        meta.appendChild(country); card.append(poster, title, meta); return card;
      }));
      appear($('cards'));
      if (!modal && hadCardFocus && state.items.length) focus(Array.from(document.querySelectorAll('.card')).find(card => card.dataset.id === priorId) || document.querySelector('.card'));
      if (state.page === 1) $('catalog').scrollTop = 0;
    }
    $('next-page').hidden = state.busy || state.page >= state.totalPages;
    $('empty').hidden = state.busy || state.items.length > 0;
    if (!$('empty').hidden) {
      $('empty').textContent = state.error || (state.favorites ? 'Нет доступных избранных моделей. Подключите аккаунт в настройках.' : 'В этой категории ничего не найдено. Попробуйте изменить фильтры.');
      $('empty').appendChild(button('Повторить загрузку', 'action', () => model.load()));
    }
    if (state.error && state.items.length) toast(state.error);
    if (!modal && !playing && !state.busy && document.activeElement === document.body) {
      focus(document.querySelector('.card') || $('empty').querySelector('button') || document.querySelector('.source.active'));
    }
  }
  function selectSource(id) { app.Settings.set('last_source', id); closePanel(); return model.source(id); }
  // Menu preferences only: do not change adapter queries or catalog contents.
  function countryPreferences() {
    const saved = app.Settings.get('country_menu_' + model.state.source, {});
    const valid = value => Array.isArray(value) ? value.filter(id => typeof id === 'string' && id !== 'all') : [];
    return { hidden: valid(saved && saved.hidden), pinned: valid(saved && saved.pinned), order: valid(saved && saved.order) };
  }
  function saveCountryPreferences(preferences) {
    try { app.Settings.set('country_menu_' + model.state.source, preferences); return true; }
    catch (error) { toast('Не удалось сохранить настройки стран'); return false; }
  }
  function countryVisibilityPanel() {
    const filter = model.state.filters.find(item => item.id === 'country');
    if (!filter) return;
    panel('Показать / скрыть страны', body => {
      description(body, 'Управление пунктами меню: закрепите нужные наверху или скройте лишние. Содержимое каталога не меняется.');
      option(body, 'Показать все страны', () => {
        const preferences = countryPreferences(); preferences.hidden = [];
        if (saveCountryPreferences(preferences)) countryVisibilityPanel();
      });
      const preferences = countryPreferences();
      filter.options.forEach(item => {
        if (item.heading || item.separator || item.id === 'all') return;
        const hidden = preferences.hidden.includes(item.id);
        const pinned = preferences.pinned.includes(item.id);
        const change = field => {
          const next = countryPreferences();
          next[field] = next[field].includes(item.id) ? next[field].filter(id => id !== item.id) : next[field].concat(item.id);
          // Pinning a hidden entry also makes it visible.
          if (field === 'pinned' && next.pinned.includes(item.id)) next.hidden = next.hidden.filter(id => id !== item.id);
          if (!saveCountryPreferences(next)) return;
          countryVisibilityPanel();
          focus(Array.from($('panel-body').querySelectorAll('button')).find(node => node.dataset.country === item.id && node.dataset.action === field));
        };
        const visibility = option(body, item.title + (hidden ? ' — скрыта' : ' — показывать'), () => change('hidden'));
        visibility.setAttribute('aria-pressed', String(!hidden));
        visibility.dataset.country = item.id; visibility.dataset.action = 'hidden';
        const pin = option(body, (pinned ? 'Открепить: ' : 'Закрепить наверху: ') + item.title, () => change('pinned'));
        pin.setAttribute('aria-pressed', String(pinned));
        pin.dataset.country = item.id; pin.dataset.action = 'pinned';
      });
    }, countryPanel);
  }
  function countryGroup(item, preferences) {
    const options = model.state.filters.find(filter => filter.id === 'country').options;
    const countries = options.filter(entry => !entry.heading && !entry.separator && entry.id !== 'all');
    if (preferences.pinned.includes(item.id)) return preferences.pinned.map(id => countries.find(entry => entry.id === id)).filter(Boolean);
    const index = options.findIndex(entry => entry.id === item.id && !entry.heading && !entry.separator);
    let start = index, end = index + 1;
    while (start > 0 && !options[start - 1].heading && !options[start - 1].separator) start--;
    while (end < options.length && !options[end].heading && !options[end].separator) end++;
    return orderCountries(options.slice(start, end).filter(entry => entry.id !== 'all' && !preferences.pinned.includes(entry.id)), preferences.order);
  }
  function orderCountries(items, order) {
    const rank = id => { const index = order.indexOf(id); return index < 0 ? order.length : index; };
    return items.map((item, index) => ({ item, index })).sort((a, b) => rank(a.item.id) - rank(b.item.id) || a.index - b.index).map(entry => entry.item);
  }
  function returnToCountry(item) {
    countryPanel();
    focus(Array.from($('panel-body').querySelectorAll('button')).find(node => node.dataset.countryId === item.id));
  }
  function countryActions(item) {
    const preferences = countryPreferences();
    const pinned = preferences.pinned.includes(item.id);
    panel(item.title, body => {
      option(body, 'Переместить', () => {
        panel('Переместить: ' + item.title, targets => {
          description(targets, 'Выберите новую позицию внутри текущего раздела.');
          const group = countryGroup(item, countryPreferences());
          const moveBefore = target => {
            const next = countryPreferences();
            const ids = group.map(entry => entry.id).filter(id => id !== item.id);
            ids.splice(target === null ? ids.length : ids.indexOf(target), 0, item.id);
            if (next.pinned.includes(item.id)) next.pinned = ids;
            else next.order = next.order.filter(id => !ids.includes(id)).concat(ids);
            if (saveCountryPreferences(next)) returnToCountry(item);
          };
          group.filter(entry => entry.id !== item.id && !preferences.hidden.includes(entry.id)).forEach(entry => option(targets, 'Перед: ' + entry.title, () => moveBefore(entry.id)));
          option(targets, 'В конец раздела', () => moveBefore(null));
          option(targets, 'Отмена', () => countryActions(item));
        }, () => countryActions(item));
      });
      option(body, pinned ? 'Открепить' : 'Закрепить наверху', () => {
        const next = countryPreferences();
        next.pinned = pinned ? next.pinned.filter(id => id !== item.id) : next.pinned.concat(item.id);
        next.hidden = next.hidden.filter(id => id !== item.id);
        if (saveCountryPreferences(next)) returnToCountry(item);
      });
      option(body, 'Скрыть', () => {
        const next = countryPreferences(); next.hidden = Array.from(new Set(next.hidden.concat(item.id)));
        if (saveCountryPreferences(next)) countryPanel();
      });
      option(body, 'Отмена', () => returnToCountry(item));
    }, () => returnToCountry(item));
  }
  function countryHold(node, item) {
    node.dataset.countryId = item.id;
    node.setAttribute('aria-haspopup', 'dialog');
    let timer, consumed = false;
    const cancel = () => { clearTimeout(timer); };
    node.addEventListener('countryhold', () => countryActions(item));
    node.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      cancel(); consumed = false;
      timer = setTimeout(() => { consumed = true; countryActions(item); }, 650);
    });
    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(type => node.addEventListener(type, cancel));
    node.addEventListener('click', event => { if (consumed) { event.preventDefault(); event.stopImmediatePropagation(); consumed = false; } }, true);
    node.addEventListener('contextmenu', event => { event.preventDefault(); cancel(); if (!consumed) { consumed = true; countryActions(item); } });
  }
  function countryPanel() {
    const filter = model.state.filters.find(item => item.id === 'country');
    if (!filter) { toast('У этого источника нет фильтра стран'); return; }
    const preferences = countryPreferences();
    const selectable = filter.options.filter(item => !item.heading && !item.separator);
    const pinned = preferences.pinned.map(id => selectable.find(item => item.id === id)).filter(item => item && !preferences.hidden.includes(item.id));
    const sorted = [];
    let group = [];
    filter.options.forEach(item => {
      if (item.heading || item.separator) { sorted.push(...orderCountries(group, preferences.order), item); group = []; }
      else group.push(item);
    });
    sorted.push(...orderCountries(group, preferences.order));
    const visible = sorted.filter((item, index, options) => {
      if (!item.heading && !item.separator) return !preferences.hidden.includes(item.id) && !pinned.includes(item);
      // Avoid empty continent headings after hiding all their countries.
      for (let next = index + 1; next < options.length && !options[next].heading && !options[next].separator; next++) {
        if (!preferences.hidden.includes(options[next].id) && !pinned.includes(options[next])) return true;
      }
      return false;
    });
    panel(filter.title, body => {
      option(body, 'Показать / скрыть страны  ›', countryVisibilityPanel);
      const all = visible.find(item => item.id === 'all');
      const entries = (all ? [all] : []).concat(pinned, visible.filter(item => item !== all));
      entries.forEach(item => {
      if (item.heading || item.separator) { const heading = document.createElement('div'); heading.className = 'group-title'; heading.textContent = item.title; body.appendChild(heading); }
      else {
        const node = option(body, item.title + (item.id === model.state.country ? '  ✓' : ''), () => { closePanel(); model.chooseCountry(item.id); }, item.id === model.state.country);
        if (item.id !== 'all') countryHold(node, item);
      }
      });
    }, filterPanel);
  }
  function filterPanel() {
    panel('Фильтры', body => {
      if (model.state.filters.some(filter => filter.id === 'country')) option(body, 'Страна / национальность  ›', countryPanel);
      let lastGroup = '';
      model.state.categories.forEach(item => {
        if (lastGroup !== item.group) { const heading = document.createElement('div'); heading.className = 'group-title'; heading.textContent = ({ type: 'Тип моделей', sort: 'Сортировка', genre: 'Жанр', feature: 'Особенности' })[item.group] || 'Категории'; body.appendChild(heading); lastGroup = item.group; }
        option(body, item.title, () => { closePanel(); model.chooseCategory(item.id); }, item.id === model.state.category);
      });
      option(body, 'Сбросить фильтры', () => { closePanel(); selectSource(model.state.source); });
    });
  }
  function searchPanel() {
    panel('Поиск · ' + app.getAdapter(model.state.source).getName(), body => {
      description(body, 'Введите имя модели или название видео.');
      const input = document.createElement('input'); input.type = 'search'; input.placeholder = 'Поисковый запрос'; input.value = queryText; input.setAttribute('aria-label', 'Поисковый запрос'); body.appendChild(input);
      const submit = () => { queryText = input.value; closePanel(); model.search(queryText); };
      input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); submit(); } });
      option(body, 'Найти', submit); option(body, 'Очистить поиск', () => { queryText = ''; closePanel(); model.search(''); });
    });
  }
  function settingsPanel() {
    panel('Настройки', body => {
      description(body, 'S Videos + · 0.1.0-alpha.7');
      option(body, 'Проверить обновления', () => native.call('checkUpdates').catch(error => toast(error.message)));
      option(body, 'Зеркала  ›', mirrorsPanel);
      const proxyEnabled = app.Settings.get('public_proxy', true);
      const proxyName = proxyEnabled ? (app.Settings.get('proxy_mode', 'auto') === 'force' ? 'Принудительно' : 'Авто') : 'Выключены';
      option(body, 'Прокси: ' + proxyName + '  ›', proxyPanel);
      description(body, 'Прокси применяется к публичным страницам, превью и потокам. Cookie аккаунта сторонним прокси не передаются.');
      ['stripchat', 'chaturbate'].forEach(id => option(body, 'Аккаунт ' + app.getAdapter(id).getName() + '  ›', () => accountPanel(id)));
      option(body, 'Очистить кэш каталогов', () => { app.Api.cache.clear(); toast('Кэш очищен'); });
      option(body, 'О приложении', () => panel('S Videos +', panelBody => description(panelBody, 'Отдельное приложение Android TV. Восемь независимых адаптеров, интерфейс Calm и нативный плеер Media3. Данные сайтов могут изменяться. Исходники плагина Lampa не изменяются.'), settingsPanel));
    });
  }
  function mirrorsPanel() {
    panel('Зеркала', body => {
      description(body, 'Если основной сайт недоступен, выберите известное зеркало. При ошибке выбранного адреса приложение попробует остальные. Это не гарантирует обход блокировки видеосервера.');
      app.getAdapters().forEach(adapter => {
        const mirrors = app.Api.getMirrors(adapter.id);
        if (mirrors.origins.length < 2) return;
        const current = mirrors.selected === 'auto' ? 'Автоматически' : new URL(mirrors.selected).hostname;
        option(body, adapter.getName() + ': ' + current + '  ›', () => mirrorSourcePanel(adapter));
      });
      description(body, 'Cookie аккаунта не отправляются зеркалам. Stripchat использует отдельный API каталога: замена домена сайта для него не применяется. eFukt не изменён.');
    }, settingsPanel);
  }
  function mirrorSourcePanel(adapter) {
    panel('Зеркала · ' + adapter.getName(), body => {
      const mirrors = app.Api.getMirrors(adapter.id);
      description(body, 'Выбор сохраняется для публичного каталога и получения ссылки на видео. Уже открытое видео не переключается.');
      const choose = origin => {
        app.Api.selectMirror(adapter.id, origin);
        toast('Адрес сохранён');
        mirrorSourcePanel(adapter);
        if (model.state.source === adapter.id) model.load();
      };
      option(body, 'Автоматически', () => choose('auto'), mirrors.selected === 'auto');
      mirrors.origins.forEach(origin => option(body, new URL(origin).hostname, () => choose(origin), mirrors.selected === origin));
    }, mirrorsPanel);
  }
  function proxyPanel() {
    panel('Сеть и прокси', body => {
      description(body, 'Авто: сначала напрямую, при ошибке — резервный маршрут. Принудительный режим сразу отправляет превью и потоки через прокси. Каталоги/API сначала проверяют прямые адреса и зеркала. Обрабатываются также HLS-сегменты и ключи.');
      const setMode = mode => { app.Settings.set('public_proxy', mode !== 'off'); app.Settings.set('proxy_mode', mode === 'force' ? 'force' : 'auto'); app.Api.cache.clear(); proxyPanel(); };
      const enabled = app.Settings.get('public_proxy', true), forced = app.Settings.get('proxy_mode', 'auto') === 'force';
      option(body, 'Автоматический резерв', () => setMode('auto'), enabled && !forced);
      option(body, 'Принудительно для превью и потоков', () => setMode('force'), enabled && forced);
      option(body, 'Без сторонних прокси', () => setMode('off'), !enabled);
      const label = document.createElement('label'); label.className = 'field-label'; label.textContent = 'Свой HTTPS-прокси (необязательно)'; body.appendChild(label);
      const input = document.createElement('textarea'); input.setAttribute('aria-label', 'Свой HTTPS-прокси'); input.value = app.Settings.get('proxy_url', ''); input.placeholder = 'https://your-proxy.example/?url={url}&referer={referer}'; input.spellcheck = false; body.appendChild(input);
      option(body, 'Сохранить адрес прокси', () => {
        const value = input.value.trim();
        if (value) { try { const url = new URL(value.replace('{url}', encodeURIComponent('https://example.com/')).replace('{referer}', '')); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); } catch (error) { return toast('Нужен корректный HTTPS-адрес без логина и пароля'); } }
        app.Settings.set('proxy_url', value); app.Api.cache.clear(); toast('Адрес прокси сохранён'); proxyPanel();
      });
      description(body, 'Сначала используется ваш адрес, затем встроенный Cherry. Если сайт блокирует оба маршрута, нужен другой доступный прокси или сеть.');
    }, settingsPanel);
  }
  function accountPanel(id) {
    const adapter = app.getAdapter(id);
    panel('Аккаунт ' + adapter.getName(), body => {
      description(body, app.Auth.getState(id).message);
      description(body, 'Авторизация необязательна. Вставьте значение заголовка Cookie из браузера после входа в свой аккаунт. Сессия хранится только на устройстве.');
      if (native.native) {
        option(body, 'Ввести Cookie с клавиатуры ТВ / Google TV', () => native.call('editSession', { source: id }).catch(error => toast(error.message)));
        description(body, 'В системном поле можно вставить текст с телефона через Google TV. Существующая сессия не показывается и не заменяется до сохранения.');
      } else {
        const input = document.createElement('textarea'); input.placeholder = 'Cookie авторизованной сессии'; input.setAttribute('aria-label', 'Cookie'); input.autocomplete = 'off'; input.spellcheck = false; body.appendChild(input);
        option(body, 'Сохранить сессию', () => { const value = input.value.trim().replace(/^cookie\s*:\s*/i, ''); if (!value) return toast('Вставьте Cookie'); app.Auth.setSession(id, value); input.value = ''; toast('Сессия сохранена'); accountPanel(id); });
      }
      option(body, 'Проверить подключение', async () => { toast('Проверка подключения…'); const state = await app.Auth.validate(adapter, true); toast(state.message); if (modal && $('panel-title').textContent === 'Аккаунт ' + adapter.getName()) accountPanel(id); });
      option(body, 'Удалить сессию', () => { app.Auth.clear(adapter); toast('Сессия удалена'); accountPanel(id); });
    }, settingsPanel);
  }
  function videoMenu(item, index) {
    panel(item.title, body => {
      option(body, 'Смотреть во встроенном плеере', () => { closePanel(); play(index); });
      if (/^https:\/\//i.test(item.webpageUrl || '')) option(body, 'Открыть страницу в браузере устройства', async () => {
        closePanel(); try { await native.call('openPage', { url: item.webpageUrl }); } catch (error) { toast(error.message); }
      });
    });
  }
  async function play(index) {
    if (playBusy) return;
    const item = model.state.items[index];
    if (!item) return;
    if (item.offline) return toast('Модель сейчас не в сети');
    if (demo) return toast('Это демонстрационный экран. В APK загружаются реальные источники.');
    const token = ++playVersion;
    playBusy = true; $('busy').hidden = false; $('busy-text').textContent = 'Получение потока…';
    try {
      const video = await app.getAdapter(model.state.source).getVideo(item.id, item);
      if (token !== playVersion) return;
      const streams = Object.fromEntries(Object.entries(video.streams || {}).filter(([, url]) => typeof url === 'string' && /^https:\/\//i.test(url)));
      if (!Object.keys(streams).length) { videoMenu(item, index); throw new Error('Прямой поток недоступен. Можно открыть страницу источника.'); }
      await native.call('play', { title: video.title || item.title, streams, mimeType: video.mimeType || '', headers: video.headers || {} });
      playing = true; playIndex = index;
      lastFocusedCard = String(item.id);
    } catch (error) { toast(error.message || 'Не удалось открыть видео'); }
    finally { if (token === playVersion) { playBusy = false; $('busy-text').textContent = 'Загрузка…'; $('busy').hidden = !model.state.busy; } }
  }
  async function switchVideo(direction) {
    if (playBusy) return;
    let next = playIndex + direction;
    if (next >= model.state.items.length && model.state.page < model.state.totalPages) await model.nextPage();
    if (!model.state.items.length) return;
    next = (next + model.state.items.length) % model.state.items.length;
    play(next);
  }
  function back() {
    if (modal) { if (panelBack) panelBack(); else closePanel(); return; }
    if (playBusy) { ++playVersion; playBusy = false; $('busy').hidden = true; return; }
    if (model.state.query || model.state.favorites) { model.state.favorites = false; model.search(''); return; }
    panel('Выйти из S Videos +?', body => { option(body, 'Остаться', closePanel); option(body, 'Выйти', () => native.call('exit').catch(error => toast(error.message))); });
  }
  function move(direction) {
    const current = document.activeElement;
    if (!modal && current && current.classList.contains('card')) {
      const index = Number(current.dataset.index);
      if (direction === 'right' && (index % 4 === 3 || index === model.state.items.length - 1)) return filterPanel();
      if (direction === 'left') return focus(index % 4 === 0 ? currentSourceButton() : document.querySelectorAll('.card')[index - 1]);
      if (direction === 'up' && index < 4) return focus(document.querySelector('.category.active') || $('search'));
      if (direction === 'down' && index + 4 < model.state.items.length) return focus(document.querySelectorAll('.card')[index + 4]);
      if (direction === 'up' && index >= 4) return focus(document.querySelectorAll('.card')[index - 4]);
    }
    if (!modal && current && current.classList.contains('source') && direction === 'right') {
      return focus(Array.from(document.querySelectorAll('.card')).find(card => card.dataset.id === lastFocusedCard) || document.querySelector('.card'));
    }
    const root = modal ? $('panel') : $('screen');
    const candidates = Array.from(root.querySelectorAll('button:not(:disabled),input,textarea')).filter(node => !node.closest('[hidden]') && node.offsetWidth > 0 && node.id !== 'scrim' && node !== current);
    if (!current || current === document.body) return focus(candidates[0]);
    const origin = current.getBoundingClientRect(), ox = origin.x + origin.width / 2, oy = origin.y + origin.height / 2;
    let best, score = Infinity;
    candidates.forEach(node => {
      const rect = node.getBoundingClientRect(), dx = rect.x + rect.width / 2 - ox, dy = rect.y + rect.height / 2 - oy;
      const primary = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
      const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (primary < 4) return;
      const value = primary + secondary * 4;
      if (value < score) { best = node; score = value; }
    });
    focus(best);
  }
  let enterTimer, enterTarget, longPressed = false;
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' || event.key === 'BrowserBack') { event.preventDefault(); back(); return; }
    const input = /^(INPUT|TEXTAREA)$/.test(event.target.tagName);
    if (event.key.startsWith('Arrow')) {
      if (input && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) return;
      event.preventDefault(); move(event.key.slice(5).toLowerCase()); return;
    }
    if (event.key === 'Enter' && !input) {
      event.preventDefault();
      if (!event.repeat) {
        enterTarget = event.target; longPressed = false;
        enterTimer = setTimeout(() => {
          if (enterTarget && enterTarget.isConnected && document.activeElement === enterTarget) {
            if (enterTarget.dataset.countryId) { longPressed = true; enterTarget.dispatchEvent(new Event('countryhold')); }
            else if (enterTarget.classList.contains('card')) { longPressed = true; videoMenu(model.state.items[Number(enterTarget.dataset.index)], Number(enterTarget.dataset.index)); }
          }
        }, 650);
      }
    }
  });
  document.addEventListener('keyup', event => {
    if (event.key !== 'Enter' || !enterTarget) return;
    event.preventDefault(); clearTimeout(enterTimer);
    if (!longPressed && enterTarget.isConnected) enterTarget.click();
    enterTarget = null;
  });
  global.SVideosEvent = function (type, detail) {
    if (type === 'sessionInput') {
      try {
        const data = JSON.parse(detail);
        const adapter = app.getAdapter(data.source);
        if (!adapter || !adapter.getCapabilities().account || typeof data.value !== 'string') return;
        app.Auth.setSession(data.source, data.value);
        toast('Сессия сохранена');
        if (modal && $('panel-title').textContent === 'Аккаунт ' + adapter.getName()) accountPanel(data.source);
      } catch (error) { toast('Не удалось сохранить сессию'); }
      return;
    }
    if (type === 'back') back();
    if (type === 'next') switchVideo(1);
    if (type === 'previous') switchVideo(-1);
    if (type === 'closed') { playing = false; ++playVersion; playBusy = false; focus(Array.from(document.querySelectorAll('.card')).find(card => card.dataset.id === lastFocusedCard) || document.querySelector('.card')); }
    if (type === 'playerError') toast(detail || 'Ошибка воспроизведения');
    if (type === 'storageError') toast('Не удалось сохранить настройку на устройстве');
  };
  $('search').addEventListener('click', searchPanel); $('filters').addEventListener('click', filterPanel);
  $('settings').addEventListener('click', settingsPanel); $('panel-close').addEventListener('click', closePanel); $('scrim').addEventListener('click', closePanel);
  $('favorites').addEventListener('click', () => { model.state.favorites = true; model.state.query = ''; model.load(); });
  $('next-page').addEventListener('click', () => model.nextPage());
  window.addEventListener('resize', scale); scale(); clock(); setInterval(clock, 30000);
  const initial = app.Settings.get('last_source', 'stripchat');
  model.source(sourceIds.includes(initial) ? initial : 'stripchat').then(() => focus(document.querySelector('.card, .source.active'))).catch(error => toast(error.message));
  global.SVideosUI = { model, move, filterPanel, back };
})(window);
