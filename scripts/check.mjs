import assert from 'node:assert/strict';
import {startServer} from './serve.mjs';

const publicOrigin = 'https://vlens.studiojuh.com';
const server = await startServer(0);
try {
  const origin = 'http://127.0.0.1:' + server.address().port;
  const fetchLocal = async pathname => {
    const response = await fetch(origin + pathname);
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    return response;
  };
  const sitemap = await fetchLocal('/sitemap.xml');
  assert.match(sitemap.headers.get('content-type'), /^application\/xml\b/);
  const robots = await (await fetchLocal('/robots.txt')).text();
  assert(robots.includes('Sitemap: ' + publicOrigin + '/sitemap.xml'));
  const urls = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]));
  const pages = new Map(urls.map(url => [url.pathname, url]));
  assert.equal(pages.size, urls.length, 'Duplicate sitemap URL');
  assert(pages.has('/'), 'Homepage is missing from the sitemap');

  const titles = new Set();
  const descriptions = new Set();
  const assets = new Set();
  for (const url of urls) {
    assert.equal(url.href, publicOrigin + url.pathname, 'Unexpected sitemap URL');
    const html = await (await fetchLocal(url.pathname)).text();
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = html.match(/<meta name="description" content="([^"]+)">/)?.[1];
    assert(title && !titles.has(title), 'Missing or duplicate title: ' + url.pathname);
    assert(description && !descriptions.has(description), 'Missing or duplicate description: ' + url.pathname);
    titles.add(title);
    descriptions.add(description);
    assert(html.includes('<link rel="canonical" href="' + url.href + '">'), 'Incorrect canonical: ' + url.pathname);
    assert(!html.includes('github.com/studio-juh/AvatarCam'), 'Do not link visitors to the private app repository');
    assert(!html.includes('getUserMedia'), 'The website must not request camera/microphone access');

    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(ids.length, new Set(ids).size, 'Duplicate HTML ids: ' + url.pathname);
    for (const [, link] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const target = new URL(link, url);
      if (target.origin !== publicOrigin) continue;
      if (target.pathname === url.pathname && target.hash) {
        assert(ids.includes(target.hash.slice(1)), 'Missing anchor: ' + link);
      } else if (target.pathname.endsWith('/')) {
        assert(pages.has(target.pathname), 'Missing linked page in sitemap: ' + link);
      } else {
        assets.add(target.pathname);
      }
    }
  }

  for (const asset of assets) {
    const response = await fetchLocal(asset);
    if (asset.endsWith('.jpg')) assert.equal(response.headers.get('content-type'), 'image/jpeg');
    await response.body.cancel();
  }
  assert.equal((await fetch(origin + '/missing')).status, 404);
  console.log('PASS: sitemap, canonical URLs, unique page metadata, internal links and assets.');
} finally { server.close(); }

