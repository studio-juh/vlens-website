import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {startServer} from './serve.mjs';

const publicOrigin = 'https://vlens.studiojuh.com';
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1],match[2]]));
const localeOf = pathname => pathname.startsWith('/en/') ? 'en' : 'ja';
const japanesePath = pathname => pathname.startsWith('/en/') ? pathname.slice(3) : pathname;
const counterpart = (pathname, locale) => (locale === 'en' ? '/en' : '') + japanesePath(pathname);
const plain = value => value.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
const hasType = (node,type) => [].concat(node['@type'] || []).includes(type);
const reference = value => typeof value === 'string' ? value : value?.['@id'];
const contentPages = ['/', '/help/', '/guides/psd-lip-sync/', '/guides/vrm-face-tracking/', '/guides/obs-virtual-camera/'];
const server = await startServer(0);
try {
  const origin = 'http://127.0.0.1:' + server.address().port;
  const fetchLocal = async pathname => {
    const response = await fetch(origin + pathname);
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    return response;
  };
  const sitemapResponse = await fetchLocal('/sitemap.xml');
  assert.match(sitemapResponse.headers.get('content-type'), /^application\/xml\b/);
  const sitemap = await sitemapResponse.text();
  const robots = await (await fetchLocal('/robots.txt')).text();
  assert(robots.includes('Sitemap: ' + publicOrigin + '/sitemap.xml'));
  const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(match => match[1]);
  const pages = new Map(entries.map(entry => {
    const url = new URL(entry.match(/<loc>([^<]+)<\/loc>/)?.[1]);
    return [url.pathname,{url,entry}];
  }));
  assert.equal(pages.size, entries.length, 'Duplicate sitemap URL');
  for (const pathname of contentPages) {
    assert(pages.has(pathname), 'Japanese page missing from sitemap: ' + pathname);
    assert(pages.has('/en' + pathname), 'English page missing from sitemap: ' + pathname);
  }

  const titles = new Set();
  const descriptions = new Set();
  const assets = new Set();
  const addAsset = link => {
    const target = new URL(link,publicOrigin);
    if (target.origin === publicOrigin) assets.add(target.pathname);
  };
  for (const [pathname,page] of pages) {
    const {url,entry} = page;
    assert.equal(url.href, publicOrigin + pathname, 'Unexpected sitemap URL');
    const html = await (await fetchLocal(pathname)).text();
    page.html = html;
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const metadata = [...html.matchAll(/<meta\b[^>]*>/g)].map(match => attributes(match[0]));
    const meta = key => metadata.find(tag => tag.name === key || tag.property === key)?.content;
    const description = meta('description');
    assert(title && !titles.has(title), 'Missing or duplicate title: ' + pathname);
    assert(description && !descriptions.has(description), 'Missing or duplicate description: ' + pathname);
    titles.add(title);
    descriptions.add(description);
    const locale = localeOf(pathname);
    assert.equal(html.match(/<html\b[^>]*\blang="([^"]+)"/)?.[1],locale,'Incorrect language: ' + pathname);
    assert(html.includes('<link rel="canonical" href="' + url.href + '">'),'Incorrect canonical: ' + pathname);
    assert(!html.includes('github.com/studio-juh/AvatarCam'),'Do not link visitors to the private app repository');
    assert(!html.includes('getUserMedia'),'The website must not request camera/microphone access');
    assert.match(meta('robots') || '',/max-image-preview:large/,'Large image preview missing: ' + pathname);
    assert(!/noindex|nofollow/i.test(meta('robots') || ''),'Search indexing blocked: ' + pathname);
    assert.equal(meta('og:url'),url.href,'Open Graph URL: ' + pathname);
    assert.equal(plain(meta('og:title') || ''),plain(title),'Open Graph title: ' + pathname);
    assert.equal(meta('og:description'),description,'Open Graph description: ' + pathname);
    assert.equal(meta('og:locale'),locale === 'en' ? 'en_US' : 'ja_JP','Open Graph locale: ' + pathname);
    assert.equal(meta('twitter:card'),'summary_large_image','Social card: ' + pathname);
    assert.equal(meta('twitter:image'),meta('og:image'),'Social image disagreement: ' + pathname);
    assert(meta('og:image:alt') && meta('twitter:image:alt'),'Social image alt text missing: ' + pathname);
    assert(Number(meta('og:image:width')) > 0 && Number(meta('og:image:height')) > 0,'Social image dimensions missing: ' + pathname);
    assert(meta('og:image')?.startsWith(publicOrigin + '/'),'Social image must be an absolute public URL: ' + pathname);
    addAsset(meta('og:image'));
    const links = [...html.matchAll(/<link\b[^>]*>/g)].map(match => attributes(match[0]));
    assert(links.some(link => link.rel === 'icon' && link.type === 'image/png' && /\b192x192\b/.test(link.sizes || '')),'Raster site icon missing: ' + pathname);
    const alternates = links.filter(link => link.rel === 'alternate');
    const sitemapAlternates = [...entry.matchAll(/<xhtml:link\b[^>]*>/g)].map(match => attributes(match[0]));
    for (const language of ['ja','en','x-default']) {
      const expected = publicOrigin + counterpart(pathname,language === 'en' ? 'en' : 'ja');
      const matching = alternates.filter(link => link.hreflang === language);
      assert.equal(matching.length,1,'Missing or duplicate ' + language + ' alternate: ' + pathname);
      assert.equal(matching[0].href,expected,'Incorrect alternate: ' + pathname);
      assert.equal(sitemapAlternates.find(link => link.hreflang === language)?.href,expected,'Sitemap alternate mismatch: ' + pathname);
    }
    const lastmod = entry.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    assert(lastmod && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(lastmod) && !Number.isNaN(Date.parse(lastmod)),'Invalid sitemap lastmod: ' + pathname);

    const switcher = html.match(/<([a-z]+)\b[^>]*class="[^"]*\blanguage-switch\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/)?.[2];
    assert(switcher,'Missing visible language switcher: ' + pathname);
    const languageLinks = [...switcher.matchAll(/<a\b[^>]*>/g)].map(match => attributes(match[0]));
    for (const language of ['ja','en']) {
      const matching = languageLinks.filter(link => link.lang === language && link.hreflang === language);
      assert.equal(matching.length,1,'Missing or duplicate switch link: ' + pathname + ' ' + language);
      assert.equal(new URL(matching[0].href,url).pathname,counterpart(pathname,language),'Wrong switch destination: ' + pathname);
      assert.equal(matching[0]['aria-current'] === 'page',locale === language,'Wrong active language: ' + pathname);
    }
    for (const [,tag] of html.matchAll(/(<a\b[^>]*>)/g)) {
      const link = attributes(tag);
      if (!link.href) continue;
      const target = new URL(link.href,url);
      if (target.origin === publicOrigin && target.pathname.endsWith('/') && !link.hreflang) {
        assert.equal(localeOf(target.pathname),locale,'Navigation leaves the selected language: ' + pathname + ' → ' + link.href);
      }
    }
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(ids.length,new Set(ids).size,'Duplicate HTML ids: ' + pathname);
    page.ids = new Set(ids);
    const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
    assert.equal(headings.length,1,'One main heading expected: ' + pathname);
    const heading = plain(headings[0][1]);
    const graph = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(match => {
      const data = JSON.parse(match[1]);
      assert.equal(data['@context'],'https://schema.org','JSON-LD context: ' + pathname);
      return data['@graph'] || [data];
    });
    const website = graph.find(node => hasType(node,'WebSite'));
    assert.equal(website?.['@id'],publicOrigin + '/#website','Unified website identity: ' + pathname);
    assert.equal(website.url,publicOrigin + '/','Website root URL: ' + pathname);
    assert.equal(website.name,'V Lens','Website name: ' + pathname);
    assert.equal(graph.find(node => hasType(node,'Organization'))?.['@id'],publicOrigin + '/#publisher','Publisher identity: ' + pathname);
    const webpage = graph.find(node => hasType(node,'WebPage'));
    assert.equal(webpage?.['@id'],url.href + '#webpage','Page identity: ' + pathname);
    assert.equal(webpage.url,url.href,'Schema page URL: ' + pathname);
    assert.equal(webpage.inLanguage,locale,'Schema page language: ' + pathname);
    assert.equal(reference(webpage.isPartOf),website['@id'],'Schema site reference: ' + pathname);
    if (japanesePath(pathname) === '/') {
      const app = graph.find(node => hasType(node,'SoftwareApplication'));
      assert.equal(app?.['@id'],publicOrigin + '/#software','Application identity: ' + pathname);
      const download = html.match(/<section\b[^>]*id="download"[^>]*>([\s\S]*?)<\/section>/)?.[1];
      const visibleVersion = download?.match(/V Lens\s+([\d.]+)/)?.[1];
      const downloadUrl = download?.match(/href="(https:\/\/github\.com\/studio-juh\/vlens-website\/releases\/download\/[^\"]+)"/)?.[1];
      assert(visibleVersion && downloadUrl,'Visible release information missing: ' + pathname);
      assert.equal(app.softwareVersion,visibleVersion,'Schema version differs from download: ' + pathname);
      assert.equal(app.downloadUrl,downloadUrl,'Schema installer differs from download: ' + pathname);
      assert.match(app.operatingSystem,/Windows 11/,'Application platform: ' + pathname);
      assert(!app.offers && !app.aggregateRating && !app.review,'Do not add unsubstantiated prices or reviews');
    } else {
      const breadcrumbs = graph.find(node => hasType(node,'BreadcrumbList'));
      assert(breadcrumbs?.itemListElement?.length >= 2,'Breadcrumb schema missing: ' + pathname);
      for (const [index,item] of breadcrumbs.itemListElement.entries()) assert.equal(item.position,index + 1,'Breadcrumb order: ' + pathname);
      assert.equal(breadcrumbs.itemListElement.at(-1).name,heading,'Breadcrumb title differs from visible heading: ' + pathname);
      assert(html.match(/<nav\b[^>]*class="[^"]*\bbreadcrumbs\b/),'Visible breadcrumbs missing: ' + pathname);
      if (pathname.includes('/guides/')) {
        const article = graph.find(node => hasType(node,'TechArticle'));
        assert(article,'Guide article metadata missing: ' + pathname);
        assert.equal(article.headline,heading,'Article headline differs from visible heading: ' + pathname);
        assert.equal(article.inLanguage,locale,'Article language: ' + pathname);
        assert([url.href,webpage['@id']].includes(reference(article.mainEntityOfPage)),'Article page reference: ' + pathname);
      }
    }
    const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1] || '';
    const footerPaths = new Set([...footer.matchAll(/href="([^"]+)"/g)].map(match => new URL(match[1],url).pathname));
    for (const destination of contentPages.slice(1)) assert(footerPaths.has(counterpart(destination,locale)),'Footer guide link missing: ' + pathname + ' → ' + destination);
    const images = [...html.matchAll(/<img\b[^>]*>/g)].map(match => attributes(match[0]));
    for (const image of images) {
      assert(Number(image.width) > 0 && Number(image.height) > 0,'Image dimensions missing: ' + pathname);
      assert(Object.hasOwn(image,'alt'),'Image alt attribute missing: ' + pathname);
      if (image.src.includes('/screenshots/')) {
        assert(image.alt && image.decoding === 'async','Screenshot accessibility/decoding: ' + pathname);
        assert(['eager','lazy'].includes(image.loading),'Screenshot loading policy: ' + pathname);
        if (image.fetchpriority === 'high') assert.equal(image.loading,'eager','Priority image must not be lazy');
        assert(entry.includes('<image:loc>' + new URL(image.src,url).href + '</image:loc>'),'Screenshot missing from sitemap: ' + pathname);
      }
    }
    const pictures = [...html.matchAll(/<picture\b[^>]*>([\s\S]*?)<\/picture>/g)];
    assert.equal(pictures.length,images.filter(image => image.src.includes('/screenshots/')).length,'Screenshot responsive sources missing: ' + pathname);
    for (const picture of pictures) {
      const source = attributes(picture[1].match(/<source\b[^>]*>/)?.[0] || '');
      assert.equal(source.type,'image/webp','Responsive image type: ' + pathname);
      assert(source.sizes && source.srcset,'Responsive image sizes missing: ' + pathname);
      const candidates = source.srcset.split(',').map(candidate => candidate.trim().match(/^(\S+)\s+(\d+)w$/));
      assert(candidates.length >= 2 && candidates.every(Boolean),'Responsive image candidates invalid: ' + pathname);
      const widths = candidates.map(candidate => Number(candidate[2]));
      assert(widths.every((width,index) => width > 0 && (index === 0 || width > widths[index - 1])),'Responsive widths must increase: ' + pathname);
      candidates.forEach(candidate => addAsset(new URL(candidate[1],url).href));
    }
  }

  for (const [pathname,page] of pages) {
    for (const [,link] of page.html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const target = new URL(link,page.url);
      if (target.origin !== publicOrigin) continue;
      if (target.pathname.endsWith('/')) {
        const linked = pages.get(target.pathname);
        assert(linked,'Missing linked page in sitemap: ' + pathname + ' → ' + link);
        if (target.hash) assert(linked.ids.has(decodeURIComponent(target.hash.slice(1))),'Missing anchor: ' + pathname + ' → ' + link);
      } else assets.add(target.pathname);
    }
  }
  const downloadLinks = html => [...html.matchAll(/href="(https:\/\/github\.com\/studio-juh\/vlens-website\/releases\/download\/[^\"]+)"/g)].map(match => match[1]);
  assert.deepEqual(downloadLinks(pages.get('/').html),downloadLinks(pages.get('/en/').html),'Homepages must offer the same installer');
  assert.equal(downloadLinks(pages.get('/en/').html).length,1,'English installer link missing');
  const imageTypes = {'.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
  for (const asset of assets) {
    const response = await fetchLocal(asset);
    const extension = asset.match(/\.[^.]+$/)?.[0];
    if (imageTypes[extension]) assert.equal(response.headers.get('content-type'),imageTypes[extension],'Asset MIME type: ' + asset);
    await response.body.cancel();
  }
  const redirects = (await readFile(new URL('../dist/_redirects',import.meta.url),'utf8')).split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#')).map(line => line.trim().split(/\s+/));
  assert(redirects.length > 0,'Canonical redirects missing');
  const sources = new Set();
  for (const [source,target,status] of redirects) {
    assert(!sources.has(source),'Duplicate redirect: ' + source);sources.add(source);
    assert.equal(status,'301');
    assert(pages.has(target),'Redirect must target a canonical content page: ' + target);
    const response = await fetch(origin + source,{redirect:'manual'});
    assert.equal(response.status,301,'Canonical redirect: ' + source);
    assert.equal(new URL(response.headers.get('location'),origin).pathname,target,'Redirect destination: ' + source);
    await response.body.cancel();
  }
  for (const missing of ['/missing','/en/missing/','/unknown/deep/page/']) {
    const response = await fetch(origin + missing);
    assert.equal(response.status,404,'Missing page must not become a soft 404: ' + missing);
    const html = await response.text();
    assert.match(html,/<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/,'404 must not be indexed');
    assert(html.includes('href="/"') && html.includes('href="/en/"'),'404 must offer both language homepages');
  }
  console.log('PASS: bilingual SEO metadata, structured data, sitemap/alternates, responsive image assets, navigation, canonical redirects and real 404s.');
} finally { server.close(); }
