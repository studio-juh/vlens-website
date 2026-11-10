// Regenerate committed responsive images with Microsoft Edge's WebP encoder.
// No npm dependencies are needed; JPEG originals and the source SVG stay intact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {startServer} from './serve.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'dist');
const preview=path.join(root,'.preview');
fs.mkdirSync(preview,{recursive:true});
const profile=fs.mkdtempSync(path.join(preview,'images-'));
const edge=[process.env['PROGRAMFILES(X86)'],process.env.PROGRAMFILES,process.env.LOCALAPPDATA].filter(Boolean)
  .map(base=>path.join(base,'Microsoft/Edge/Application/msedge.exe')).find(fs.existsSync);
assert(edge,'Microsoft Edge is required to regenerate the committed images');
const server=await startServer(0);
let browser,socket,exited;
try {
  browser=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--disable-background-networking','--disable-component-update','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],
    {windowsHide:true,stdio:'ignore'});
  exited=once(browser,'exit');
  await once(browser,'spawn');
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;!fs.existsSync(portFile);i++){
    assert(i<500 && browser.exitCode===null,'Edge debug endpoint did not start');await delay(20);
  }
  const port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  await once(socket,'open');
  let sequence=0;
  const pending=new Map();
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id){
      const request=pending.get(message.id);pending.delete(message.id);
      message.error?request?.reject(Error(JSON.stringify(message.error))):request?.resolve(message.result);
    }
  });
  const call=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence;
    const timeout=setTimeout(()=>{pending.delete(id);reject(Error('Timeout: '+method));},15000);
    pending.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject:error=>{clearTimeout(timeout);reject(error);}});
    socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{
    const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;
  };
  const origin='http://127.0.0.1:'+server.address().port;
  await call('Page.navigate',{url:origin+'/'});
  for(let i=0;i<200;i++){
    if(await evaluate("document.readyState==='complete' && !!document.querySelector('.hero-shot')"))break;
    assert(i<199,'Local page did not load');await delay(20);
  }
  const convert=async(source,width,type,quality=0.9)=>evaluate('('+String(async function(source,width,type,quality){
    const image=new Image();image.src=source;await image.decode();
    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=Math.round(image.naturalHeight*width/image.naturalWidth);
    const context=canvas.getContext('2d');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
    context.drawImage(image,0,0,canvas.width,canvas.height);
    return {width:canvas.width,height:canvas.height,sourceWidth:image.naturalWidth,sourceHeight:image.naturalHeight,data:canvas.toDataURL(type,quality)};
  })+')('+JSON.stringify(source)+','+width+','+JSON.stringify(type)+','+quality+')');
  for(const name of ['output-monitor','psd-editor','vrm-avatar']){
    const original=fs.statSync(path.join(output,'screenshots',name+'.jpg')).size;
    const source=await convert('/screenshots/'+name+'.jpg',640,'image/webp');
    const widths=[640,960,source.sourceWidth].filter((width,index,all)=>width<=source.sourceWidth && all.indexOf(width)===index);
    for(const width of widths){
      const image=width===640?source:await convert('/screenshots/'+name+'.jpg',width,'image/webp');
      assert(image.data.startsWith('data:image/webp;base64,'),'Edge does not support WebP encoding');
      const bytes=Buffer.from(image.data.split(',')[1],'base64');
      assert(bytes.length<original,'WebP candidate is larger than the original: '+name+' '+width);
      const file='screenshots/'+name+'-'+width+'.webp';
      fs.writeFileSync(path.join(output,file),bytes);
      console.log(file+' '+image.width+'x'+image.height+' '+bytes.length+' bytes (original '+original+')');
    }
  }
  for(const width of [192,512]){
    const image=await convert('/favicon.svg',width,'image/png');
    assert.equal(image.width,image.height,'Favicon must stay square');
    const bytes=Buffer.from(image.data.split(',')[1],'base64');
    fs.writeFileSync(path.join(output,'icon-'+width+'.png'),bytes);
    console.log('icon-'+width+'.png '+bytes.length+' bytes');
  }
  await call('Browser.close').catch(()=>{});await exited;
}finally{
  socket?.close();
  if(browser && browser.exitCode===null && browser.signalCode===null){browser.kill();await exited.catch(()=>{});}
  server.closeAllConnections();server.close();
  const relative=path.relative(fs.realpathSync(preview),fs.realpathSync(profile));
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative),'Unexpected temporary profile path');
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
