// 隔离会话事件与官方TTS模拟；按钮／Tooltip使用SDK源码，音频使用真实AudioContext。
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { delimiter } from 'node:path';
import { Speech } from '../src/server/speech.ts';
import { speechFetch } from '../src/server/speech-fetch.ts';
import { defaultSpeech } from '../src/shared/speech.ts';
import { visualBrowser, browserOptions, prepareEvidence } from './visual-env.mjs';
import { screenshotWebp } from './evidence-image.mjs';

const root = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const out = await prepareEvidence();
let record;
const sockets = [], sent = [], commands = [];
class Socket extends EventTarget {
  readyState = 0; binaryType = '';
  constructor() {
    super(); sockets.push(this);
    queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); });
  }
  send(raw) {
    const part = JSON.parse(raw); sent.push(part);
    if (part.event === 'text') {
      const samples = new Int16Array(24000);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i / 20) * 1000;
      this.dispatchEvent(new MessageEvent('message', { data: samples.buffer }));
    } else if (part.event === 'finish_text')
      this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ event: 'finish', code: 'success' }) }));
  }
  close() { this.readyState = 3; }
}
const speech = new Speech(() => ({ async readRecord() { return record; },
  async modifyRecord(_key, update) { record = await update(record); } }), fetch, () => new Socket());
const bundle = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {SpeechControl} from './src/client/SpeechControl';import {SpeechReply} from './src/client/SpeechReply';
import {SpeechPlayback} from './src/client/speech-playback';import {setLanguage} from './src/client/i18n';
import {SpeechComponent} from './src/client/speech-component';
import {ICON_SYMBOLS,IconCopyOutlineRegular} from '@deepseek-ai/dsh-client-ui-primitives';
setLanguage(new URLSearchParams(location.search).get('lang')||'zh');
const sprite=document.createElement('div');sprite.innerHTML='<svg style="position:absolute;width:0;height:0">'+
Object.entries(ICON_SYMBOLS).map(([id,svg])=>svg.replace('<svg','<symbol id="'+id+'"').replace('</svg>','</symbol>')).join('')+'</svg>';
document.body.append(sprite);
window.outputs=[];window.retained=0;window.released=0;window.playback=new SpeechPlayback(async command=>{
const res=await fetch('/command',{method:'POST',body:JSON.stringify(command)});
const body=await res.json();if(!res.ok)throw Error(body.message);return body;
});
window.speechComponent=new SpeechComponent(window.playback);window.speechComponent.setEnabled(true);
const start=AudioBufferSourceNode.prototype.start;
AudioBufferSourceNode.prototype.start=function(...args){window.outputs.push(performance.now());return start.apply(this,args);};
const message=(id,text)=>({type:'event',event:{type:'assistant/message',seq:1,data:{turn:1,
message:{id,content:[{type:'text',text},{type:'reasoning',text:'不可朗读的推理'}]}}}});
function source(entries){let snapshot={revision:0,entries,change:{kind:'replace',entries}};const listeners=new Set();
return {getSnapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
emit(change){snapshot={revision:snapshot.revision+1,entries:change.kind==='replace'?change.entries:
[...snapshot.entries,...(change.entries||[])],change};for(const fn of listeners)fn();}};}
window.sources={s:source([message('a','第一条历史回复。'),message('b','第二条历史回复。')]),
other:source([message('c','另一个会话的回复。')])};
const sessions={retain(id){window.retained++;return {ready:Promise.resolve({eventSource:window.sources[id]}),
release(){window.released++;}}}};
window.live=()=>window.sources.s.emit({kind:'append',entries:[{type:'transient',
event:{type:'assistant/live-chunk',seq:20,data:{attemptId:'live',turn:2,step:0,
chunk:{type:'text-delta',index:0,text:'实时自动回复。'}}}}]});
window.late=()=>window.sources.s.emit({kind:'append',entries:[{type:'transient',
event:{type:'assistant/live-chunk',seq:21,data:{attemptId:'live',turn:2,step:0,
chunk:{type:'text-delta',index:0,text:'同一回复的后缀。'}}}}]});
function Fixture(){const [session,setSession]=useState('s'),[open,setOpen]=useState(true);
window.switchSession=()=>setSession('other');window.closeSession=()=>setOpen(false);
return <>{open&&<><header><span>会话</span><SpeechControl sessionId={session} sessions={sessions} playback={window.playback} component={window.speechComponent}/></header>
{(session==='s'?['a','b']:['c']).map(id=><article key={id}><p>{id==='a'?'第一条历史回复。':id==='b'?'第二条历史回复。':'另一个会话的回复。'}</p>
<div className="actions"><button className="native-copy" aria-label="Copy"><IconCopyOutlineRegular/></button>
<SpeechReply sessionId={session} messageId={id} playback={window.playback} component={window.speechComponent}/></div></article>)}</>}</>;}
fetch('/status').then(res=>res.json()).then(status=>{window.playback.configure(status);createRoot(document.getElementById('mount')).render(<Fixture/>);});
` }, bundle: true, write: false, format: 'iife', jsx: 'automatic', outfile: 'fixture.js',
  nodePaths: process.env.NODE_PATH?.split(delimiter),
  plugins: [{ name: 'official-atoms', setup(b) {
    b.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'official-atoms', namespace: 'atoms' }));
    b.onLoad({ filter: /.*/, namespace: 'atoms' }, () => ({ loader: 'ts', resolveDir: root, contents: `
export {Button} from './node_modules/@deepseek-ai/dsh-client-ui-primitives/src/Button.tsx';
export {Tooltip} from './node_modules/@deepseek-ai/dsh-client-ui-primitives/src/Tooltip.tsx';
export {ICON_SYMBOLS,IconCopyOutlineRegular,IconPlayOutlineRegular,IconStopFillRegular} from './node_modules/@deepseek-ai/dsh-client-ui-primitives/src/icons/index.tsx';
` }));
  } }],
});
const css = await readFile(`${root}/src/client/styles.css`, 'utf8');
const html = `<meta charset="utf-8"><style>
:root{--dsw-radius-sm:8px;--dsw-alias-label-primary:#222;--dsw-alias-label-secondary:#555;--dsw-alias-label-tertiary:#888;
--dsw-alias-interactive-bg-hover:#eee;--dsw-alias-button-toolbar-label:#777;--dsw-alias-button-toolbar-fill:transparent}
body{margin:24px;font:14px system-ui;background:white;color:#222}body.dark{background:#202020;color:#eee;
--dsw-alias-label-primary:#eee;--dsw-alias-label-secondary:#ccc;--dsw-alias-label-tertiary:#aaa;--dsw-alias-interactive-bg-hover:#444}
header{display:flex;align-items:center;justify-content:space-between}article{margin-top:32px}.actions{display:flex;align-items:center;gap:8px}
.native-copy{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:6px;border:none;border-radius:8px;background:transparent;color:#888}
.native-copy svg{width:17px;height:17px}
${css}${bundle.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n')}
</style><div id="mount"></div><script>if(new URLSearchParams(location.search).has('dark'))document.body.classList.add('dark');</script>
<script>${bundle.outputFiles.find(file => file.path.endsWith('.js')).text}</script>`;
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/' || req.url.startsWith('/?')) { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
    if (req.url === '/status') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(await speech.status())); return; }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    if (req.url === '/api/workbase/speech-stream') {
      const abort = new AbortController(); res.on('close', () => abort.abort());
      const response = await speechFetch(speech, new Request('https://simulation/api/workbase/speech-stream',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: abort.signal }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      const reader = response.body.getReader();
      try { for (;;) { const part = await reader.read(); if (part.done) break; res.write(part.value); } }
      finally { reader.releaseLock(); res.end(); }
    } else if (req.url === '/command') {
      const command = JSON.parse(body); commands.push(command);
      let result = null;
      if (command.op === 'speech-save') result = await speech.save(command.version, command.config);
      else if (command.op === 'speech-stream-text') speech.pushStream(command.id, command.seq, command.text, command.finish);
      else if (command.op === 'speech-stream-cancel') speech.cancelStream(command.id);
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result));
    } else { res.writeHead(404); res.end(); }
  } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: error.message })); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await visualBrowser();
const browser = await chromium.launch(browserOptions);
const checks = [];
try {
  for (const lang of ['zh', 'en']) for (const dark of [false, true]) {
    const before = await speech.status();
    await speech.save(before.version, defaultSpeech(), 'simulation-key');
    const page = await browser.newPage({ viewport: { width: 760, height: 500 } }); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?lang=${lang}${dark ? '&dark' : ''}`);
    await page.locator('.wb-speech-reply').first().waitFor();
    const auto = page.locator('[data-workbase-speech-auto]');
    assert.equal(await page.locator('header button').count(), 1);
    assert.equal(await auto.getAttribute('aria-pressed'), 'false');
    const offIcon = await auto.locator('svg').innerHTML();
    assert.equal(await auto.locator('.wb-speech-wave').count(), 0);
    assert.equal(await auto.getAttribute('aria-label'), lang === 'en' ? 'Enable automatic speech' : '启用自动播报');
    assert.equal(await page.evaluate(() => window.outputs.length), 0);
    const sizes = await page.locator('.wb-speech-reply').first().evaluate(button => ({
      button: button.getBoundingClientRect().width, icon: button.querySelector('svg').getBoundingClientRect().width }));
    const native = await page.locator('.native-copy').first().evaluate(button => ({
      button: button.getBoundingClientRect().width, icon: button.querySelector('svg').getBoundingClientRect().width }));
    assert.deepEqual(sizes, native);
    assert.equal(sizes.button, 28);
    await screenshotWebp(page, `${out}/speech-actions-${lang}-${dark ? 'dark' : 'light'}.webp`);
    await page.locator('.wb-speech-reply').nth(1).click();
    await page.waitForFunction(() => window.outputs.length === 4);
    assert.equal(sent.filter(part => part.event === 'text').at(-1).text, '第二条历史回复。');
    assert.equal(await page.locator('.wb-speech-reply').nth(1).getAttribute('aria-label'), lang === 'en' ? 'Stop speech' : '停止播报');
    assert.equal(await auto.getAttribute('data-playing'), 'true');
    assert.equal(await auto.getAttribute('aria-pressed'), 'false');
    const animated = page.locator('.wb-speech-reply').nth(1).locator('.wb-speech-wave').first();
    assert.equal(await animated.evaluate(wave => getComputedStyle(wave).animationName), 'wb-speech-wave');
    assert.equal(await page.locator('.wb-speech-reply').first().locator('.wb-speech-wave').first()
      .evaluate(wave => getComputedStyle(wave).animationName), 'none');
    const motion = await animated.evaluate(wave => {
      const animation = wave.getAnimations()[0]; animation.pause();
      animation.currentTime = 0; const before = getComputedStyle(wave).opacity;
      animation.currentTime = 500; const after = getComputedStyle(wave).opacity;
      animation.play(); return { before, after };
    });
    assert.notEqual(motion.before, motion.after);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await animated.evaluate(wave => getComputedStyle(wave).animationName), 'none');
    assert.equal(await auto.locator('.wb-speech-wave').first().evaluate(wave => getComputedStyle(wave).animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await screenshotWebp(page, `${out}/speech-actions-animated-${lang}-${dark ? 'dark' : 'light'}.webp`);
    await page.locator('.wb-speech-reply').nth(1).click();
    await page.waitForFunction(() => !window.playback.playing);
    assert.equal(await auto.getAttribute('data-playing'), null);
    assert.equal(await auto.locator('svg').innerHTML(), offIcon);
    await auto.click();
    await page.waitForFunction(() => window.playback.status.config.enabled && !window.playback.saving);
    assert.equal(await auto.getAttribute('aria-pressed'), 'true');
    assert.notEqual(await auto.locator('svg').innerHTML(), offIcon);
    assert.equal(await auto.locator('.wb-speech-wave').first().evaluate(wave => getComputedStyle(wave).animationName), 'none');
    await screenshotWebp(page, `${out}/speech-actions-enabled-${lang}-${dark ? 'dark' : 'light'}.webp`);
    assert.equal((await speech.status()).config.enabled, true);
    // 新实时attempt在手动播放期间静音，手动结束后其后缀也不自动续读。
    await page.locator('.wb-speech-reply').first().click();
    await page.waitForFunction(() => window.outputs.length === 8);
    await page.evaluate(() => window.live());
    await page.waitForFunction(() => !window.playback.playing);
    await page.evaluate(() => window.late());
    assert.equal(await page.evaluate(() => window.outputs.length), 8);
    await auto.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => !window.playback.status.config.enabled && !window.playback.saving);
    assert.equal((await speech.status()).config.enabled, false);
    assert.equal(await auto.locator('svg').innerHTML(), offIcon);
    await page.locator('.wb-speech-reply').first().click();
    await page.waitForFunction(() => window.outputs.length === 12);
    await page.evaluate(() => window.switchSession());
    await page.waitForFunction(() => !window.playback.playing && !window.playback.reply('s','a'));
    await page.locator('.wb-speech-reply').first().waitFor();
    await page.locator('.wb-speech-reply').first().click();
    await page.waitForFunction(() => window.outputs.length === 16);
    assert.equal(sent.filter(part => part.event === 'text').at(-1).text, '另一个会话的回复。');
    await screenshotWebp(page, `${out}/speech-actions-playing-${lang}-${dark ? 'dark' : 'light'}.webp`);
    await page.evaluate(() => window.speechComponent.setEnabled(false));
    await page.waitForFunction(() => !window.playback.playing && !window.playback.reply('other','c'));
    assert.equal(await page.locator('[data-workbase-speech-auto]').count(), 0);
    assert.equal(await page.locator('.wb-speech-reply').count(), 0);
    assert.equal(await page.evaluate(() => window.playback.status.config.enabled), false);
    await page.evaluate(() => window.speechComponent.setEnabled(true));
    await page.locator('.wb-speech-reply').first().waitFor();
    await page.locator('.wb-speech-reply').first().click();
    await page.waitForFunction(() => window.outputs.length === 20);
    await page.evaluate(() => window.closeSession());
    await page.waitForFunction(() => !window.playback.playing && !window.playback.reply('other','c'));
    assert.equal(await page.evaluate(() => window.retained === window.released), true);
    assert.deepEqual(errors, []);
    checks.push({ lang, dark, sizes, singleHeaderButton: true, toggleSynced: true,
      distinctToggleIcons: true, playingWavesAnimate: true, idleWavesStatic: true, reducedMotion: true,
      disablingComponentHidesControlsAndStops: true, reenableSeedsHistory: true,
      manualWithAutoOff: true, messageIsolated: true, manualSuppressesLive: true, switchCancels: true, released: true, errors });
    await page.close();
  }
  assert.ok(sockets.every(socket => socket.readyState === 3));
  assert.ok(commands.filter(command => command.op === 'speech-save').every(command => !('key' in command)));
  await writeFile(`${out}/speech-actions-checks.json`, JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, errors: 0 }));
} finally { await browser.close(); speech.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
