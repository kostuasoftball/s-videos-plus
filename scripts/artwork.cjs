const fs = require('node:fs');
const path = require('node:path');
let sharp;
try { sharp = require('sharp'); }
catch { sharp = require('C:/Users/matyugin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'); }
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" rx="0" fill="#111722"/><circle cx="550" cy="50" r="200" fill="#86e3c1" opacity=".04"/><rect x="60" y="98" width="96" height="96" rx="26" fill="#86e3c1"/><path d="m96 124 38 22-38 22z" fill="#10251d"/><text x="188" y="162" font-family="Arial,sans-serif" font-weight="700" font-size="48" fill="#eef4fc">S Videos <tspan fill="#86e3c1">+</tspan></text><text x="190" y="201" font-family="Arial,sans-serif" font-size="18" letter-spacing="3" fill="#8c9bb1">ANDROID TV</text><path d="M60 262h520" stroke="#263144"/></svg>`;
const target = path.resolve(__dirname, '../app/src/main/res/drawable-nodpi');
fs.mkdirSync(target, { recursive: true });
sharp(Buffer.from(svg)).resize(320, 180).png().toFile(path.join(target, 'tv_banner.png')).then(() => console.log('TV launcher banner generated'));
