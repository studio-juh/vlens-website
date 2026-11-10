import assert from 'node:assert/strict';
import {startServer} from './serve.mjs';

const publicOrigin = 'https://vlens.studiojuh.com';
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1],match[2]]));
const localeOf = pathname => pathname.startsWith('/en/') ? 'en' : 'ja';
const japanesePath = pathname => pathname.startsWith('/en/') ? pathname.slice(3) : pathname;
const counterpart = (pathname, locale) => (locale === 'en' ? '/en' : '') + japanesePath(pathname);
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
  const pages = new Map(urls.map(url => [url.pathname, {url}]));
  assert.equal(pages.size, urls.length, 'Duplicate sitemap URL');
  for (const pathname of ['/', '/help/', '/guides/psd-lip-sync/', '/guides/vrm-face-tracking/', '/guides/obs-virtual-camera/']) {
    assert(pages.has(pathname), 'Japanese page missing from sitemap: ' + pathname);
    assert(pages.has('/en' + pathname), 'English page missing from sitemap: ' + pathname);
  }

  const titles = new Set();
  const descriptions = new Set();
  const assets = new Set();
  for (const [pathname, page] of pages) {
    const {url} = page;
    assert.equal(url.href, publicOrigin + pathname, 'Unexpected sitemap URL');
    const html = await (await fetchLocal(pathname)).text();
    page.html = html;
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = html.match(/<meta name="description" content="([^"]+)">/)?.[1];
    assert(title && !titles.has(title), 'Missing or duplicate title: ' + pathname);
    assert(description && !descriptions.has(description), 'Missing or duplicate description: ' + pathname);
    titles.add(title);
    descriptions.add(description);
    const locale = localeOf(pathname);
    assert.equal(html.match(/<html\b[^>]*\blang="([^"]+)"/)?.[1], locale, 'Incorrect language: ' + pathname);
    assert(html.includes('<link rel="canonical" href="' + url.href + '">'), 'Incorrect canonical: ' + pathname);
    assert(!html.includes('github.com/studio-juh/AvatarCam'), 'Do not link visitors to the private app repository');
    assert(!html.includes('getUserMedia'), 'The website must not request camera/microphone access');
    const alternates = [...html.matchAll(/<link\b[^>]*>/g)].map(match => attributes(match[0])).filter(link => link.rel === 'alternate');
    for (const language of ['ja', 'en', 'x-default']) {
      const matching = alternates.filter(link => link.hreflang === language);
      assert.equal(matching.length, 1, 'Missing or duplicate ' + language + ' alternate: ' + pathname);
      assert.equal(matching[0].href, publicOrigin + counterpart(pathname, language === 'en' ? 'en' : 'ja'), 'Incorrect alternate: ' + pathname);
    }
    const switcher = html.match(/<([a-z]+)\b[^>]*class="[^"]*\blanguage-switch\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/)?.[2];
    assert(switcher, 'Missing visible language switcher: ' + pathname);
    const languageLinks = [...switcher.matchAll(/<a\b[^>]*>/g)].map(match => attributes(match[0]));
    for (const language of ['ja', 'en']) {
      const matching = languageLinks.filter(link => link.lang === language && link.hreflang === language);
      assert.equal(matching.length, 1, 'Missing or duplicate switch link: ' + pathname + ' ' + language);
      assert.equal(new URL(matching[0].href, url).pathname, counterpart(pathname, language), 'Wrong switch destination: ' + pathname);
      assert.equal(matching[0]['aria-current'] === 'page', locale === language, 'Wrong active language: ' + pathname);
    }
    for (const [, tag] of html.matchAll(/(<a\b[^>]*>)/g)) {
      const link = attributes(tag);
      if (!link.href) continue;
      const target = new URL(link.href, url);
      if (target.origin === publicOrigin && target.pathname.endsWith('/') && !link.hreflang) {
        assert.equal(localeOf(target.pathname), locale, 'Navigation leaves the selected language: ' + pathname + ' → ' + link.href);
      }
    }
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(ids.length, new Set(ids).size, 'Duplicate HTML ids: ' + pathname);
    page.ids = new Set(ids);
  }

  for (const [pathname, page] of pages) {
    for (const [, link] of page.html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const target = new URL(link, page.url);
      if (target.origin !== publicOrigin) continue;
      if (target.pathname.endsWith('/')) {
        const linked = pages.get(target.pathname);
        assert(linked, 'Missing linked page in sitemap: ' + pathname + ' → ' + link);
        if (target.hash) assert(linked.ids.has(decodeURIComponent(target.hash.slice(1))), 'Missing anchor: ' + pathname + ' → ' + link);
      } else {
        assets.add(target.pathname);
      }
    }
  }
  const downloadLinks = html => [...html.matchAll(/href="(https:\/\/github\.com\/studio-juh\/vlens-website\/releases\/download\/[^\"]+)"/g)].map(match => match[1]);
  assert.deepEqual(downloadLinks(pages.get('/').html), downloadLinks(pages.get('/en/').html), 'Homepages must offer the same installer');
  assert.equal(downloadLinks(pages.get('/en/').html).length, 1, 'English installer link missing');
  for (const asset of assets) {
    const response = await fetchLocal(asset);
    if (asset.endsWith('.jpg')) assert.equal(response.headers.get('content-type'), 'image/jpeg');
    await response.body.cancel();
  }
  assert.equal((await fetch(origin + '/missing')).status, 404);
  console.log('PASS: bilingual sitemap, languages, canonical and reciprocal alternate URLs, switchers, navigation, fragment links, matching installer and assets.');
} finally { server.close(); }
