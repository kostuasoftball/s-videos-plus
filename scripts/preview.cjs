const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../app/src/main/assets');
function serve(port = 4173) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let name;
    try { name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); }
    catch { res.writeHead(400).end(); return; }
    const target = path.resolve(root, '.' + name);
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(target, (error, data) => {
      if (error) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(target)] || 'application/octet-stream');
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}
module.exports = { serve };
if (require.main === module) serve().then(() => console.log('Local demo: http://127.0.0.1:4173/?demo=1'));
