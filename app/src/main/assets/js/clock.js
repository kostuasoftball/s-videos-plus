(function (global) {
  'use strict';
  const styles = Object.freeze({ flip: 'Ретро Flip', classic: 'Классические', digital: 'Янтарные цифровые' });
  const face = document.getElementById('clock');
  const settings = global.SisiPlus.Settings;
  let previous = '', timer, tiles = [];
  function style() {
    const saved = settings.get('clock_style', 'flip');
    return Object.prototype.hasOwnProperty.call(styles, saved) ? saved : 'flip';
  }
  function span(className, text) {
    const node = document.createElement('span'); node.className = className; node.textContent = text; return node;
  }
  function refresh() {
    clearTimeout(timer);
    if (global.SVideos.native) return; // Android draws a single clock above both surfaces.
    const now = new Date();
    const value = [now.getHours(), now.getMinutes()].map(n => String(n).padStart(2, '0')).join(':');
    const mode = style();
    if (face.dataset.style !== mode) {
      face.dataset.style = mode; face.textContent = ''; previous = ''; tiles = [];
      if (mode === 'flip') {
        for (const char of value) {
          const tile = span(char === ':' ? 'clock-colon' : 'clock-digit', char);
          tile.setAttribute('aria-hidden', 'true'); face.appendChild(tile); tiles.push(tile);
        }
      }
    }
    if (value !== previous) {
      face.dateTime = value; face.setAttribute('aria-label', value);
      if (mode !== 'flip') face.textContent = value;
      else Array.from(value).forEach((char, i) => {
        if (char === ':' || previous[i] === char) return;
        const tile = tiles[i];
        tile.textContent = char;
        if (!previous || global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        [['out', previous[i]], ['in', char]].forEach(([direction, digit]) => {
          const leaf = span('clock-leaf ' + direction, '');
          leaf.appendChild(span('', digit)); tile.appendChild(leaf);
          leaf.addEventListener('animationend', () => leaf.remove(), { once: true });
        });
      });
      previous = value;
    }
    face.hidden = false;
    if (!document.hidden) timer = setTimeout(refresh, 60010 - now.getTime() % 60000);
  }
  global.SVideosClock = { styles, style, refresh };
  document.addEventListener('visibilitychange', refresh);
  refresh();
})(window);
