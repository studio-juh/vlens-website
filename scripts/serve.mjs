import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
export async function startServer(port = 4173) {
  const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8'};
  const redirects = new Map((await readFile(path.join(root, '_redirects'), 'utf8')).split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
    const [source, destination, status, ...extra] = line.trim().split(/\s+/);
    if (!source?.startsWith('/') || !destination?.startsWith('/') || status !== '301' || extra.length) throw Error('Invalid static redirect: ' + line);
    return [source, destination];
  }));
  const notFound = await readFile(path.join(root, '404.html'));
  const headers = contentType => ({
    'Content-Type':contentType,
    'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      const target = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
      const relative = path.relative(root, target);
      if (relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(403).end(); return; }
      const destination = redirects.get(pathname);
      if (destination) { res.writeHead(301, {'Location': destination + url.search}).end(); return; }
      const body = await readFile(target);
      res.writeHead(200, headers(types[path.extname(target)] || 'application/octet-stream'));
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, headers('text/html; charset=utf-8'));
      res.end(req.method === 'HEAD' ? undefined : notFound);
    }
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startServer(Number(process.env.PORT || 4173));
  console.log('Local: http://127.0.0.1:' + server.address().port);
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
