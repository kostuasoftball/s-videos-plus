const fs = require('node:fs');
const path = require('node:path');
let sharp;
try { sharp = require('sharp'); }
catch { sharp = require('C:/Users/matyugin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'); }
const logo = fs.readFileSync(path.resolve(__dirname, '../app/src/main/assets/logo.svg'), 'utf8');
const inner = logo.replace(/<svg[^>]*>/, '').replace('</svg>', '');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#111722"/><svg x="48" y="104" width="124" height="124" viewBox="0 0 108 108">${inner}</svg><text x="192" y="168" font-family="Arial,sans-serif" font-weight="700" font-size="48" fill="#eef4fc">S Videos <tspan fill="#86e3c1">+</tspan></text><text x="194" y="207" font-family="Arial,sans-serif" font-size="18" letter-spacing="3" fill="#8c9bb1">ANDROID TV</text><path d="M60 262h520" stroke="#263144"/></svg>`;
const target = path.resolve(__dirname, '../app/src/main/res/drawable-nodpi');
fs.mkdirSync(target, { recursive: true });
sharp(Buffer.from(svg)).resize(320, 180).png().toFile(path.join(target, 'tv_banner.png')).then(() => console.log('TV launcher banner generated'));
