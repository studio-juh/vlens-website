import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const dist=path.join(root,'dist');
const config=JSON.parse(fs.readFileSync(path.join(root,'scripts/seo-pages.json'),'utf8'));
const origin='https://vlens.studiojuh.com';
const check=process.argv.includes('--check');
const files=new Map();
const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const text=value=>value.replace(/<[^>]*>/g,'').replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').trim();
const imageInfo={
  'output-monitor':{width:1052,height:830,widths:[640,960,1052]},
  'psd-editor':{width:1052,height:830,widths:[640,960,1052]},
  'vrm-avatar':{width:1250,height:850,widths:[640,960,1250]}
};
function meta(html,kind,key,value) {
  const expression=new RegExp('<meta\\b(?=[^>]*\\b'+kind+'="'+key.replaceAll(':','\\:')+'")[^>]*>','g');
  const tag='<meta '+kind+'="'+key+'" content="'+esc(value)+'">';
  return expression.test(html) ? html.replace(expression,tag) : html.replace('</head>','  '+tag+'\n</head>');
}
function save(file,content) {
  const current=fs.existsSync(file)?fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'):'';
  if(current===content)return;
  if(check)throw Error('SEO output is stale: '+path.relative(root,file)+'. Run npm run prepare:seo.');
  fs.writeFileSync(file,content);
}
for(const [route,modified] of Object.entries(config)) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(modified))throw Error('Invalid content date for '+route);
  const file=path.join(dist,route,'index.html');
  let html=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
  const en=route.startsWith('/en/');
  const lang=en?'en':'ja';
  const home=en?'/en/':'/';
  const ja=en?route.slice(3):route;
  const url=origin+route;
  const title=text(html.match(/<title>([\s\S]*?)<\/title>/)?.[1]??'');
  const description=text(html.match(/<meta name="description" content="([^"]+)">/)?.[1]??'');
  const heading=text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]??'');
  if(!title||!description||!heading)throw Error('Missing page content: '+route);
  const homepage=ja==='/';
  const guide=ja.startsWith('/guides/');
  const imagePath=html.match(/<meta property="og:image" content="([^"]+)">/)?.[1]??origin+'/screenshots/output-monitor.jpg';
  const imageName=new URL(imagePath).pathname.split('/').pop().replace(/\.jpg$/,'');
  const image=imageInfo[imageName];
  if(!image)throw Error('Unknown social image: '+imagePath);
  html=meta(html,'name','robots','index, follow, max-image-preview:large');
  for(const [key,value] of Object.entries({
    'og:type':guide?'article':'website','og:locale':en?'en_US':'ja_JP',
    'og:locale:alternate':en?'ja_JP':'en_US','og:site_name':'V Lens',
    'og:url':url,'og:title':title,'og:description':description,'og:image':imagePath,
    'og:image:type':'image/jpeg','og:image:width':image.width,'og:image:height':image.height
  }))html=meta(html,'property',key,value);
  const imageAlt=text(html.match(/<meta property="og:image:alt" content="([^"]+)">/)?.[1]??(en?'V Lens app screenshot':'V Lensのアプリ画面'));
  html=meta(html,'property','og:image:alt',imageAlt);
  for(const [key,value] of Object.entries({'twitter:card':'summary_large_image','twitter:title':title,'twitter:description':description,'twitter:image':imagePath,'twitter:image:alt':imageAlt}))html=meta(html,'name',key,value);
  html=html.replace(/\s*<link rel="icon"[^>]*>/g,'');
  html=html.replace('</head>','  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">\n  <link rel="icon" type="image/svg+xml" href="/favicon.svg">\n</head>');
  let imageIndex=0;
  // Keep original JPEG links and fallbacks; responsive WebP sources are derivatives.
  html=html.replace(/(?:<picture>[\s\S]*?<\/picture>|<img\b[^>]*>)/g,markup=>{
    const original=markup.match(/<img\b[^>]*src="(?:\.\/|\/)?screenshots\/([^"/]+)\.jpg"[^>]*>/)?.[0];
    if(!original)return markup;
    const name=original.match(/screenshots\/([^"/]+)\.jpg/)[1];
    const details=imageInfo[name];
    if(!details)throw Error('Unknown screenshot: '+name);
    const first=imageIndex++===0;
    const sizes=homepage?'(max-width: 650px) calc(100vw - 32px), (max-width: 850px) calc(63.64vw - 45.82px), (max-width: 1292px) calc(63.64vw - 70px), 752px':'(max-width: 650px) calc(100vw - 32px), (max-width: 668px) calc(100vw - 48px), 620px';
    const srcset=details.widths.map(width=>'/screenshots/'+name+'-'+width+'.webp '+width+'w').join(', ');
    const img=original.replace(/\s(?:loading|decoding|fetchpriority)="[^"]*"/g,'')
      .replace(/src="[^"]+"/,'src="/screenshots/'+name+'.jpg"')
      .replace(/\s*\/?>(\s*)$/,' loading="'+(first?'eager':'lazy')+'" decoding="async"'+(first?' fetchpriority="high"':'')+'>');
    return '<picture><source type="image/webp" srcset="'+srcset+'" sizes="'+sizes+'">'+img+'</picture>';
  });
  if(!homepage) {
    html=html.replace(/\s*<nav class="breadcrumbs"[\s\S]*?<\/nav>/,'')
      .replace(/\s*<p class="guide-back">[\s\S]*?<\/p>/,'');
    const breadcrumb='<nav class="breadcrumbs" aria-label="'+(en?'Breadcrumb':'パンくず')+'"><ol><li><a href="'+home+'">V Lens</a></li><li aria-current="page">'+esc(heading)+'</li></ol></nav>';
    html=html.replace(/(<main class="wrap guide" id="main">)/,'$1\n    '+breadcrumb);
  }
  const links=en?[
    ['/help/','Help'],['/guides/psd-lip-sync/','PSD lip sync'],['/guides/vrm-face-tracking/','VRM tracking'],['/guides/obs-virtual-camera/','OBS setup']
  ]:[
    ['/help/','ヘルプ'],['/guides/psd-lip-sync/','PSD口パク'],['/guides/vrm-face-tracking/','VRMトラッキング'],['/guides/obs-virtual-camera/','OBS連携']
  ];
  const footer='<footer class="wrap site-footer"><a class="brand" href="'+home+'">V Lens</a><nav class="footer-links" aria-label="'+(en?'Guides and help':'ガイドとヘルプ')+'">'+links.map(([href,label])=>'<a href="'+(en?'/en':'')+href+'">'+label+'</a>').join('')+'</nav><small>© studio-juh</small></footer>';
  html=html.replace(/<footer class="wrap site-footer">[\s\S]*?<\/footer>/,footer);
  const graph=[
    {'@type':'Organization','@id':origin+'/#publisher',name:'studio-juh',url:origin+'/'},
    {'@type':'WebSite','@id':origin+'/#website',name:'V Lens',alternateName:'Vlens',url:origin+'/',inLanguage:['ja','en'],publisher:{'@id':origin+'/#publisher'}},
    {'@type':'WebPage','@id':url+'#webpage',url,name:title,description,inLanguage:lang,isPartOf:{'@id':origin+'/#website'},about:{'@id':origin+'/#software'}}
  ];
  const webpage=graph[2];
  if(homepage) {
    const download=html.match(/href="(https:\/\/github\.com\/studio-juh\/vlens-website\/releases\/download\/v([^/]+)\/[^"<>]+\.exe)"/);
    if(!download)throw Error('Missing installer link: '+route);
    graph.push({'@type':'SoftwareApplication','@id':origin+'/#software',name:'V Lens',alternateName:'Vlens',url:origin+'/',applicationCategory:'MultimediaApplication',operatingSystem:'Windows 11 (x64)',softwareVersion:download[2],inLanguage:'ja',description,downloadUrl:download[1],installUrl:origin+home+'#download',image:{'@type':'ImageObject',url:origin+'/icon-512.png',width:512,height:512},screenshot:['vrm-avatar','output-monitor','psd-editor'].map(name=>origin+'/screenshots/'+name+'.jpg'),publisher:{'@id':origin+'/#publisher'}});
    webpage.mainEntity={'@id':origin+'/#software'};
  } else {
    graph.push({'@type':'BreadcrumbList','@id':url+'#breadcrumb',itemListElement:[
      {'@type':'ListItem',position:1,name:'V Lens',item:origin+home},
      {'@type':'ListItem',position:2,name:heading,item:url}
    ]});
    webpage.breadcrumb={'@id':url+'#breadcrumb'};
    if(guide) {
      graph.push({'@type':'TechArticle','@id':url+'#article',headline:heading,description,inLanguage:lang,mainEntityOfPage:{'@id':url+'#webpage'},isPartOf:{'@id':origin+'/#website'},publisher:{'@id':origin+'/#publisher'},image:{'@type':'ImageObject',url:imagePath,contentUrl:imagePath,width:image.width,height:image.height}});
      webpage.mainEntity={'@id':url+'#article'};
    }
  }
  html=html.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g,'');
  const structured=JSON.stringify({'@context':'https://schema.org','@graph':graph},null,2).replaceAll('<','\\u003c');
  html=html.replace('</head>','  <script type="application/ld+json">\n'+structured+'\n  </script>\n</head>');
  files.set(route,{html,modified,images:[...new Set([...html.matchAll(/<img\b[^>]*src="(\/screenshots\/[^"<>]+\.jpg)"/g)].map(match=>match[1]))]});
  save(file,html);
}
const sitemap='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'+[...files].map(([route,page])=>{
  const ja=route.startsWith('/en/')?route.slice(3):route;
  return '  <url>\n    <loc>'+origin+route+'</loc>\n    <lastmod>'+page.modified+'</lastmod>\n'+
    [['ja',ja],['en','/en'+ja],['x-default',ja]].map(([lang,url])=>'    <xhtml:link rel="alternate" hreflang="'+lang+'" href="'+origin+url+'" />').join('\n')+'\n'+
    page.images.map(image=>'    <image:image><image:loc>'+origin+image+'</image:loc></image:image>').join('\n')+(page.images.length?'\n':'')+'  </url>';
}).join('\n')+'\n</urlset>\n';
save(path.join(dist,'sitemap.xml'),sitemap);
console.log(check?'PASS: generated SEO metadata, structured data, image sources and sitemap are current.':'Updated SEO metadata, structured data, responsive images and sitemap for '+files.size+' pages.');
