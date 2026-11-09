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
  function scale() {
    const ratio = Math.min(innerWidth / 1600, innerHeight / 900);
    $('screen').style.transform = 'scale(' + ratio + ')';
    $('screen').style.left = (innerWidth - 1600 * ratio) / 2 + 'px';
    $('screen').style.top = (innerHeight - 900 * ratio) / 2 + 'px';
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
  function panel(title, draw, back) {
    if (!modal) restoreFocus = document.activeElement;
    modal = true; panelBack = back || null; $('modal-layer').hidden = false;
    $('panel-title').textContent = title; $('panel-body').replaceChildren();
    draw($('panel-body'));
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
      $('sources').replaceChildren(...sourceIds.map(id => button(app.getAdapter(id).getName(), 'source' + (state.source === id ? ' active' : ''), () => selectSource(id))));
      $('categories').replaceChildren(...state.categories.map(item => button(item.title, 'category' + (state.category === item.id ? ' active' : ''), () => model.chooseCategory(item.id))));
    }
    const newKey = JSON.stringify([state.source, state.category, state.country, state.query, state.favorites, state.items.map(item => item.id)]);
    if (newKey !== catalogKey) {
      const prior = document.activeElement;
      const priorId = prior && prior.dataset ? prior.dataset.id : '';
      const hadCardFocus = prior && prior.classList.contains('card');
      catalogKey = newKey;
      $('cards').replaceChildren(...state.items.map((item, index) => {
        const card = button('', 'card', () => play(index)); card.dataset.id = String(item.id); card.dataset.index = String(index); card.setAttribute('role', 'listitem');
        card.addEventListener('focus', () => { lastFocusedCard = String(item.id); });
        card.addEventListener('contextmenu', event => { event.preventDefault(); videoMenu(item, index); });
        const poster = document.createElement('div'); poster.className = 'poster placeholder';
        if (/^https:\/\//i.test(item.poster || '')) {
          const image = document.createElement('img'); image.src = item.poster; image.loading = 'lazy'; image.alt = ''; image.referrerPolicy = 'no-referrer';
          image.addEventListener('error', () => image.remove()); image.addEventListener('load', () => poster.classList.remove('placeholder')); poster.appendChild(image);
        }
        const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = item.offline ? 'OFFLINE' : item.badge || 'Смотреть'; poster.appendChild(badge);
        const title = document.createElement('span'); title.className = 'card-title'; title.textContent = item.title;
        const meta = document.createElement('span'); meta.className = 'card-meta';
        const country = document.createElement('span'); country.textContent = item.country ? app.AdapterUtils.countryLabel(item.country) : '';
        meta.appendChild(country); card.append(poster, title, meta); return card;
      }));
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
  function countryPanel() {
    const filter = model.state.filters.find(item => item.id === 'country');
    if (!filter) { toast('У этого источника нет фильтра стран'); return; }
    panel(filter.title, body => filter.options.forEach(item => {
      if (item.heading || item.separator) { const heading = document.createElement('div'); heading.className = 'group-title'; heading.textContent = item.title; body.appendChild(heading); }
      else option(body, item.title + (item.id === model.state.country ? '  ✓' : ''), () => { closePanel(); model.chooseCountry(item.id); }, item.id === model.state.country);
    }), filterPanel);
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
      description(body, 'S Videos + · 0.1.0-alpha.2');
      option(body, 'Резервный публичный прокси: ' + (app.Settings.get('public_proxy', false) ? 'Включён' : 'Выключен'), () => { app.Settings.set('public_proxy', !app.Settings.get('public_proxy', false)); settingsPanel(); });
      description(body, 'Прокси — внешний сервис для публичных каталогов. По умолчанию выключен. Cookie аккаунта через него не передаются.');
      ['stripchat', 'chaturbate'].forEach(id => option(body, 'Аккаунт ' + app.getAdapter(id).getName() + '  ›', () => accountPanel(id)));
      option(body, 'Очистить кэш каталогов', () => { app.Api.cache.clear(); toast('Кэш очищен'); });
      option(body, 'О приложении', () => panel('S Videos +', panelBody => description(panelBody, 'Отдельное приложение Android TV. Восемь независимых адаптеров, интерфейс Calm и нативный плеер Media3. Данные сайтов могут изменяться. Исходники плагина Lampa не изменяются.'), settingsPanel));
    });
  }
  function accountPanel(id) {
    const adapter = app.getAdapter(id);
    panel('Аккаунт ' + adapter.getName(), body => {
      description(body, app.Auth.getState(id).message);
      description(body, 'Авторизация необязательна. Вставьте значение заголовка Cookie из браузера после входа в свой аккаунт. Сессия хранится только на устройстве.');
      const input = document.createElement('textarea'); input.placeholder = 'Cookie авторизованной сессии'; input.setAttribute('aria-label', 'Cookie'); input.autocomplete = 'off'; input.spellcheck = false; body.appendChild(input);
      option(body, 'Сохранить сессию', () => { const value = input.value.trim().replace(/^cookie\s*:\s*/i, ''); if (!value) return toast('Вставьте Cookie'); app.Auth.setSession(id, value); input.value = ''; toast('Сессия сохранена'); accountPanel(id); });
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
      await native.call('play', { title: video.title || item.title, streams, headers: video.headers || {} });
      playing = true; playIndex = index;
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
      if (direction === 'left' && index % 4 === 0) return focus(document.querySelector('.source.active'));
      if (direction === 'up' && index < 4) return focus(document.querySelector('.category.active') || $('search'));
      if (direction === 'down' && index + 4 < model.state.items.length) return focus(document.querySelectorAll('.card')[index + 4]);
      if (direction === 'up' && index >= 4) return focus(document.querySelectorAll('.card')[index - 4]);
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
          if (enterTarget && enterTarget.classList.contains('card')) { longPressed = true; videoMenu(model.state.items[Number(enterTarget.dataset.index)], Number(enterTarget.dataset.index)); }
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
