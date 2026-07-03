import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const port = Number(process.env.PORT || process.env.UAT_PORT || 4174);
const host = process.env.UAT_HOST || '127.0.0.1';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function safeJoin(root, requestPath) {
  const cleanPath = decodeURIComponent(requestPath.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const resolved = path.resolve(root, cleanPath);
  if(!resolved.startsWith(root)) return null;
  return resolved;
}

function uatConfigJs() {
  const supabaseUrl = process.env.UAT_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.UAT_SUPABASE_ANON_KEY || '';
  return `window.__PMO_CONFIG__ = ${JSON.stringify({ supabaseUrl, supabaseAnonKey }, null, 2)};\n`;
}

function injectUat(html) {
  const seedScript = [
    '<script src="scripts/resource-uat-fixtures.js"></script>',
    '<script>',
    '  window.seedResourceUatData({ preserveExisting:false });',
    '  window.addEventListener("DOMContentLoaded", function(){',
    '    if(typeof swView === "function") {',
    '      swView("resource", document.querySelector(".sb-item[onclick*=resource]"), "Resource Management");',
    '    }',
    '  });',
    '</script>',
  ].join('\n');

  if(html.includes('<script src="config.js"></script>')) {
    return html.replace('<script src="config.js"></script>', `<script src="config.js"></script>\n${seedScript}`);
  }
  return html.replace('</head>', `${seedScript}\n</head>`);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${host}:${port}`);
    let pathname = url.pathname;
    if(pathname === '/') pathname = '/index.html';

    if(pathname === '/config.js') {
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(uatConfigJs());
      return;
    }

    const filePath = safeJoin(repoRoot, pathname);
    if(!filePath || !existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    let body = await readFile(filePath);
    if(path.basename(filePath) === 'index.html') {
      body = Buffer.from(injectUat(body.toString('utf8')));
    }

    res.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch(error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(error?.stack || String(error));
  }
});

server.listen(port, host, () => {
  const supaMode = process.env.UAT_SUPABASE_URL && process.env.UAT_SUPABASE_ANON_KEY
    ? 'UAT Supabase env is enabled'
    : 'Supabase is disabled; writes stay in browser localStorage';
  console.log(`PMO ERP Resource UAT: http://${host}:${port}/`);
  console.log(supaMode);
});
