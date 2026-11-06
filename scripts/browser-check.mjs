import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {startServer} from './serve.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.preview');
fs.mkdirSync(output, {recursive:true});
const profile = fs.mkdtempSync(path.join(output, 'edge-'));
const edge = [process.env['PROGRAMFILES(X86)'],process.env.PROGRAMFILES,process.env.LOCALAPPDATA].filter(Boolean).map(base=>path.join(base,'Microsoft/Edge/Application/msedge.exe')).find(fs.existsSync);
assert(edge, 'Microsoft Edge is required');
const server = await startServer(0);
let browser, socket, exited;
try {
  browser = spawn(edge, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'], {windowsHide:true,stdio:'ignore'});
  exited = once(browser, 'exit');
  await once(browser, 'spawn');
  const portFile = path.join(profile,'DevToolsActivePort');
  for(let i=0;!fs.existsSync(portFile);i++){assert(i<500 && browser.exitCode===null);await delay(20);}
  const port = Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);
  const targets = await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket = new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await once(socket,'open');
  let seq=0;const pending=new Map();const errors=[];
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
    if(message.id){const request=pending.get(message.id);pending.delete(message.id);message.error?request?.reject(Error(JSON.stringify(message.error))):request?.resolve(message.result);}
  });
  const call=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('timeout: '+method));},15000);
    pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
    socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  for(let i=0;i<200;i++){if(await evaluate("document.readyState==='complete' && !!document.querySelector('.hero-shot')"))break;assert(i<199);await delay(20);}
  for(const [name,width,height] of [['desktop',1440,1100],['tablet',820,1000],['mobile',390,844],['small',320,750]]){
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await delay(100);
    const layout=await evaluate("({width:innerWidth,content:document.documentElement.scrollWidth,broken:[...document.images].some(i=>!i.complete||i.naturalWidth===0)})");
    assert(layout.content<=layout.width, name+' horizontal overflow: '+JSON.stringify(layout));assert(!layout.broken);
    const capture=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:await evaluate('document.documentElement.scrollHeight'),scale:1}});
    fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(capture.data,'base64'));
  }
  const screenshots = await evaluate("[...document.querySelectorAll('.screenshot img')].map(img=>({width:img.naturalWidth,height:img.naturalHeight,source:img.src,link:img.parentElement.href}))");
  assert.equal(screenshots.length, 2);
  for (const image of screenshots) {
    assert(image.width > 0 && image.height > 0, 'Screenshot did not load');
    assert.equal(image.link, image.source, 'Screenshot must link to the original image');
  }
  await evaluate("document.querySelector('summary').click()");
  assert(await evaluate("document.querySelector('details').open"),'FAQ did not open');
  await evaluate("document.querySelector('summary').click()");
  assert(!await evaluate("document.querySelector('details').open"),'FAQ did not close');
  const guides = await evaluate("[...document.querySelectorAll('#start .guide-links a')].map(a => a.href)");
  assert(guides.length > 0, 'No guide links found');
  for (const url of guides) {
    await call('Page.navigate',{url});
    for (let i=0;i<200;i++) {
      if (await evaluate("document.readyState==='complete' && !!document.querySelector('.guide h1')")) break;
      assert(i<199, 'Guide did not load: ' + url);
      await delay(20);
    }
    assert(await evaluate("location.href") === url, 'Guide loaded at the wrong URL');
    assert(await evaluate("document.documentElement.scrollWidth <= innerWidth"), 'Guide has horizontal overflow: ' + url);
    assert(await evaluate("[...document.images].every(img => img.complete && img.naturalWidth > 0)"), 'Guide image did not load: ' + url);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: 4 viewport widths, no overflow, screenshots and original image links, FAQ, mobile guides, no script errors.');
  await call('Browser.close').catch(()=>{});await exited;
}finally{
  socket?.close();
  if(browser && browser.exitCode===null && browser.signalCode===null){browser.kill();await exited.catch(()=>{});}
  server.closeAllConnections();server.close();
  const relative=path.relative(output,fs.realpathSync(profile));assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}

