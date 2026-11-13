(function (global) {
  'use strict';
  const styles = Object.freeze({
    flip: 'Ретро Flip', classic: 'Классические', digital: 'Янтарные цифровые',
    vfd: 'Зелёная электроника 90-х', lcd: 'Карманный LCD', led: 'Красный LED',
    nixie: 'Ламповые Nixie', analog: 'Стрелочные'
  });
  const palettes = { vfd: ['#0b211b', '#8effbb', '#1b3a30'], lcd: ['#bcc39c', '#222b21', '#a5ae8b'], led: ['#2a111a', '#ff575e', '#48212a'] };
  const masks = [63, 6, 91, 79, 102, 109, 125, 7, 127, 111];
  const segments = [[4,0,14,3],[18,4,3,10],[18,18,3,10],[4,29,14,3],[1,18,3,10],[1,4,3,10],[4,14.5,14,3]];
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
  // Match the Android overlay's 138 × 46 drawing area, without loading fonts or images.
  function drawFace(mode, value, now) {
    const ns = 'http://www.w3.org/2000/svg';
    function draw(parent, name, attrs, label) {
      const node = document.createElementNS(ns, name);
      Object.keys(attrs).forEach(key => node.setAttribute(key, attrs[key]));
      if (label) node.textContent = label;
      parent.appendChild(node); return node;
    }
    face.textContent = '';
    const svg = draw(face, 'svg', { viewBox: '0 0 138 46', 'aria-hidden': 'true' });
    const rect = (x,y,width,height,fill,rx = 1) => draw(svg, 'rect', { x,y,width,height,fill,rx });
    const dot = (cx,cy,r,fill) => draw(svg, 'circle', { cx,cy,r,fill });
    const label = (x,y,size,fill,family,value) => draw(svg, 'text', {
      x,y,fill,'font-size':size,'font-family':family,'text-anchor':'middle','dominant-baseline':'central'
    }, value);
    const palette = palettes[mode];
    if (palette) {
      rect(0,0,138,46,palette[0],7);
      const digits = value.replace(':', '');
      [9,37,79,107].forEach((x, i) => segments.forEach(([dx,dy,w,h], bit) =>
        rect(x+dx,7+dy,w,h,masks[Number(digits[i])] & (1 << bit) ? palette[1] : palette[2])));
      [17,29].forEach(y => dot(69,y,2,palette[1]));
    } else if (mode === 'nixie') {
      [0,30,80,110].forEach((x,i) => {
        rect(x,0,28,46,'#2b1812',11); rect(x+2,2,24,40,'#412518',10);
        label(x+14,22,32,'#ff9a51','serif',value.replace(':','')[i]);
      });
      [17,29].forEach(y => dot(69,y,2,'#ff9a51'));
    } else {
      rect(0,0,138,46,'#172534',7); dot(23,23,20,'#f2eadc');
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        dot(23+Math.sin(a)*16,23-Math.cos(a)*16,i % 3 ? 1 : 1.6,'#293241');
      }
      const hand = (turn, length, color, width) => draw(svg, 'line', { x1:23,y1:23,
        x2:23+Math.sin(turn*2*Math.PI)*length,y2:23-Math.cos(turn*2*Math.PI)*length,
        stroke:color,'stroke-width':width,'stroke-linecap':'round' });
      hand((now.getHours()+now.getMinutes()/60)/12,9,'#202a38',3);
      hand(now.getMinutes()/60,14,'#b14736',2);
      dot(23,23,2,'#202a38'); label(90,23,23,'#f2eadc','sans-serif',value);
    }
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
      if (mode === 'classic' || mode === 'digital') face.textContent = value;
      else if (mode !== 'flip') drawFace(mode, value, now);
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
