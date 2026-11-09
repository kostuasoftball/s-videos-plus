(function (global) {
  'use strict';
  const pending = new Map();
  let seq = 0;
  const bridge = global.SVideosAndroid;
  global.SVideosNativeResult = function (id, result) {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    clearTimeout(request.timer);
    if (result.ok) request.resolve(result.value);
    else {
      const error = new Error(result.error || 'Ошибка Android');
      error.status = result.status || 0;
      request.reject(error);
    }
  };
  function call(method, data) {
    if (!bridge) return Promise.reject(new Error('Для этого действия установите Android-приложение'));
    return new Promise((resolve, reject) => {
      const id = String(++seq);
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Превышено время ожидания')); }, 45000);
      pending.set(id, { resolve, reject, timer });
      try { bridge.dispatch(id, method, JSON.stringify(data || {})); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }
  let values = {};
  try { values = bridge ? JSON.parse(bridge.readSettings()) : JSON.parse(localStorage.getItem('svideos_settings') || '{}'); }
  catch (error) { values = {}; }
  const registry = new Map();
  class Adapter {
    constructor(id) { this.id = id; }
    getCategories() { return Promise.resolve([]); }
    getFilters() { return Promise.resolve([]); }
    getCapabilities() { return {}; }
  }
  const app = global.SisiPlus = {
    Adapter,
    registerAdapter(adapter) {
      if (!adapter || !adapter.id || registry.has(adapter.id)) throw new Error('Ошибка регистрации источника');
      registry.set(adapter.id, adapter);
    },
    getAdapter: id => registry.get(id),
    getAdapters: () => Array.from(registry.values()),
    Settings: {
      get: (key, fallback) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback,
      set(key, value) {
        values[key] = value;
        if (bridge) bridge.writeSetting(key, JSON.stringify(value));
        else if (!key.startsWith('account_session_')) localStorage.setItem('svideos_settings', JSON.stringify(
          Object.fromEntries(Object.entries(values).filter(([name]) => !name.startsWith('account_session_')))
        ));
        return value;
      }
    }
  };
  global.SVideos = { native: Boolean(bridge), call, app };
})(window);
