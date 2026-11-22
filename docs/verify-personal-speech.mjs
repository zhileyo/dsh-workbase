import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { visualBrowser, browserOptions, prepareEvidence } from './visual-env.mjs';
import { screenshotWebp } from './evidence-image.mjs';
import { localizeClientSource } from '../localize-ui.mjs';
const root = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const out = `${await prepareEvidence()}/`;
const prototype = await readFile(`${root}/docs/ui/ui-directions.html`, 'utf8');
const scripts = [...prototype.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
scripts.forEach((m, i) => new vm.Script(m[1], { filename: `prototype-${i}` }));
const result = await build({
  stdin: { loader: 'tsx', resolveDir: root, contents: `
import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
import {Settings} from './src/client/Settings'; import {initialState} from './src/shared/model';
import {personalFiles} from './src/shared/personalization'; import {defaultSpeech} from './src/shared/speech';
import {themeStyle} from './src/client/theme'; import {setLanguage} from './src/client/i18n';
const p=new URLSearchParams(location.search), lang=p.get('lang')||'zh';setLanguage(lang);
window.calls=[];window.failFile='';window.docs=Object.fromEntries(personalFiles.map(file=>[file,{file,content:'',version:null}]));
window.speech={config:defaultSpeech(),available:true,hasKey:false,version:null};
async function call(command){window.calls.push(command);
 if(command.op==='personal-list')return {directory:'/data/dsh',active:true,documents:structuredClone(Object.values(window.docs))};
 if(command.op==='personal-save'){if(command.file===window.failFile)throw Error('档案保存失败');return window.docs[command.file]={file:command.file,content:command.content,version:'v1'};}
 if(command.op==='speech-status')return structuredClone(window.speech);
 if(command.op==='speech-save'){return window.speech={config:command.config,available:true,hasKey:!command.clearKey&&(!!command.key||window.speech.hasKey),version:'v1'};}
 if(command.op==='rules-save')return true;
 if(command.op==='restore-catalog')return [];
 return {phase:'idle',message:'',coverage:[]};
}
function Fixture(){const [open,setOpen]=useState(true);const [preferences,setPreferences]=useState(initialState().preferences);
 window.preferences=preferences;
 return <div className="wb a" lang={lang} style={{...themeStyle('violet',p.has('dark')),height:'100vh',position:'relative',containerType:'inline-size',containerName:'workbase workbase-dialog'}}>
 <button id="open" onClick={()=>setOpen(true)}>Open</button>{open&&<Settings embedded={false} snapshot={{preferences,revision:0,syncedAt:0,projects:[],conflicts:[],sessionMarks:{}}}
 busy={false} dark={p.has('dark')} preview={()=>{}} call={call} pickDirectory={async()=>null} onClose={()=>setOpen(false)}
 save={async command=>{window.calls.push(command);setPreferences({...preferences,theme:command.theme,...command.options});return true;}}/>}</div>;
}createRoot(document.getElementById('mount')).render(<Fixture/>);
` }, bundle: true, write: false, jsx: 'automatic', format: 'iife',
  plugins: [{ name: 'localize', setup(b) {
    b.onLoad({ filter: /src\/client\/.*\.tsx$/ }, async args => ({
      contents: localizeClientSource(await readFile(args.path, 'utf8'), args.path), loader: 'tsx',
    }));
  } }],
});
const css = await readFile(`${root}/src/client/prototype.css`, 'utf8') + await readFile(`${root}/src/client/styles.css`, 'utf8');
const html = `<html><meta charset="utf-8"><style>body{margin:0}*{box-sizing:border-box}${css}</style><div id="mount"></div><script>${result.outputFiles[0].text}</script></html>`;
const { chromium } = await visualBrowser();
const browser = await chromium.launch(browserOptions);
const checks = [];
try {
  for (const width of [360, 1000]) for (const lang of ['zh', 'en']) for (const dark of [false, true]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    page.setDefaultTimeout(6000);
    const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await page.route('http://fixture.local/**', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto(`http://fixture.local/?lang=${lang}${dark ? '&dark=1' : ''}`);
    await page.locator('#wb-settings-tab-personal').waitFor();
    const navigation = await page.locator('.settings-nav').evaluate(node => [...node.querySelectorAll('button')].map(button => {
      const range = document.createRange(); range.selectNodeContents(button);
      const text = range.getBoundingClientRect(), rect = button.getBoundingClientRect();
      return { label: button.textContent, fits: text.left >= rect.left - 1 && text.right <= rect.right + 1 };
    }));
    assert.ok(navigation.every(item => item.fits), JSON.stringify(navigation));
    const en = lang === 'en';
    const openSpeech = async () => {
      await page.locator('#wb-settings-tab-tools').click();
      const subtab = page.locator('#wb-settings-tools-tab-speech');
      if (!await subtab.isVisible()) await page.getByRole('checkbox', { name: en ? 'Speech output' : '语音播报', exact: true }).check();
      await subtab.click();
    };
    await page.locator('#wb-settings-tab-tools').click();
    assert.equal(await page.locator('#wb-settings-tab-speech').count(), 0);
    assert.equal(await page.locator('#wb-settings-tools-tab-speech').isVisible(), false);
    assert.equal(await page.locator('#wb-settings-tools-panel-general').isVisible(), true);
    assert.equal(await page.getByRole('checkbox', { name: en ? 'Show plugin updates' : '显示插件更新', exact: true }).isVisible(), true);
    await page.locator('#wb-settings-tools-tab-general').focus(); await page.keyboard.press('End');
    assert.equal(await page.locator('#wb-settings-tools-tab-general').getAttribute('aria-selected'), 'true');
    await page.getByRole('checkbox', { name: en ? 'Speech output' : '语音播报', exact: true }).check();
    assert.equal(await page.locator('#wb-settings-tools-tab-speech').isVisible(), true);
    assert.equal(await page.evaluate(() => window.calls.some(command => command.op === 'speech-save')), false);
    await page.locator('#wb-settings-tools-tab-general').focus(); await page.keyboard.press('End');
    assert.equal(await page.locator('#wb-settings-tools-tab-speech').getAttribute('aria-selected'), 'true');
    await page.locator('#wb-settings-tools-tab-general').click();
    await screenshotWebp(page, `${out}components-${width}-${lang}-${dark ? 'dark' : 'light'}.webp`);
    await page.getByRole('button', { name: en ? 'Cancel' : '取消', exact: true }).click();
    assert.equal(await page.evaluate(() => window.preferences.speechComponentEnabled), false);
    await page.locator('#open').click();
    const chooseFile = async file => { await page.locator(`[id="wb-settings-personal-tab-${file}"]`).click(); };
    const edit = async (file, content) => {
      await chooseFile(file);
      const panel = page.locator(`[id="wb-settings-personal-panel-${file}"]`);
      await panel.locator('.rules-md-preview').click();
      await panel.locator('textarea').fill(content);
    };
    await page.locator('#wb-settings-tab-personal').click();
    await edit('IDENTITY.md', '临时草稿');
    await chooseFile('USER.md'); await chooseFile('IDENTITY.md');
    assert.equal(await page.locator('[id="wb-settings-personal-panel-IDENTITY.md"] textarea').inputValue(), '临时草稿');
    await page.getByRole('button', { name: en ? 'Cancel' : '取消', exact: true }).click();
    assert.equal(await page.evaluate(() => window.docs['IDENTITY.md'].content), '');
    await page.locator('#open').click(); await page.locator('#wb-settings-tab-personal').click();
    await edit('IDENTITY.md', '伙伴档案'); await edit('USER.md', '用户档案');
    await page.evaluate(() => { window.failFile = 'USER.md'; });
    await page.locator('button[type=submit]').click();
    await page.getByRole('alert').filter({ hasText: en ? 'Failed to save profiles' : '档案保存失败' }).waitFor();
    assert.equal(await page.evaluate(() => window.docs['IDENTITY.md'].content), '伙伴档案');
    assert.equal(await page.evaluate(() => window.docs['USER.md'].content), '');
    await page.evaluate(() => { window.failFile = ''; });
    await screenshotWebp(page, `${out}personal-${width}-${lang}-${dark ? 'dark' : 'light'}.webp`);
    await page.locator('button[type=submit]').click();
    await page.locator('#open').click(); await openSpeech();
    const panel = page.locator('#wb-settings-tools-panel-speech');
    const provider = panel.getByRole('button', { name: en ? 'Speech service' : '播报服务', exact: true });
    const openPicker = async button => {
      // 先完成测试工具的自动滚动；共享菜单按规范在外层滚动时关闭。
      await button.scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await button.click();
    };
    assert.match(await provider.textContent(), /DeepSeek/);
    assert.equal(await panel.locator('input[type=number]').count(), 0);
    await panel.locator('input[type=checkbox]').nth(0).check();
    await page.locator('button[type=submit]').click();
    await panel.getByRole('alert').filter({ hasText: 'DeepSeek API Key' }).waitFor();
    await openPicker(panel.getByRole('button', { name: en ? 'Voice' : '音色', exact: true }));
    await page.getByRole('option', { name: 'tide', exact: true }).click();
    await panel.locator('input[type=checkbox]').nth(1).uncheck();
    await panel.locator('input[type=password]').fill('demo-credential');
    const geometry = await panel.evaluate(node => ({ overflow: node.scrollWidth > node.clientWidth }));
    assert.equal(geometry.overflow, false);
    await screenshotWebp(page, `${out}speech-${width}-${lang}-${dark ? 'dark' : 'light'}.webp`);
    await page.locator('button[type=submit]').click();
    assert.equal(await page.evaluate(() => window.preferences.speechComponentEnabled), true);
    await page.locator('#open').click(); await openSpeech();
    await page.waitForFunction(() => window.speech.hasKey);
    assert.equal(await panel.locator('input[type=password]').inputValue(), '');
    assert.equal(await panel.getByRole('button', { name: en ? 'Voice' : '音色', exact: true }).textContent(), 'tide');
    await openPicker(provider);
    await page.getByRole('option', { name: 'OpenAI TTS', exact: true }).click();
    assert.equal(await panel.locator('input[type=number]').count(), 1);
    await panel.locator('input[type=text]').nth(0).fill('https://example.com/v1/audio/speech');
    await page.locator('button[type=submit]').click();
    assert.equal(await page.evaluate(() => window.speech.config.provider), 'compatible');
    await page.locator('#open').click(); await openSpeech();
    await openPicker(provider);
    await page.getByRole('option', { name: 'DeepSeek TTS', exact: true }).click();
    await page.getByRole('button', { name: en ? 'Cancel' : '取消', exact: true }).click();
    assert.equal(await page.evaluate(() => window.speech.config.provider), 'compatible');
    // 停用组件不被隐藏页的未完成配置阻塞，不覆盖已保存的服务配置。
    await page.locator('#open').click(); await openSpeech();
    await panel.locator('input[type=text]').nth(0).fill('invalid-address');
    await page.locator('#wb-settings-tools-tab-general').click();
    await page.getByRole('checkbox', { name: en ? 'Speech output' : '语音播报', exact: true }).uncheck();
    assert.equal(await page.locator('#wb-settings-tools-tab-speech').isVisible(), false);
    assert.equal(await page.locator('#wb-settings-tools-panel-general').isVisible(), true);
    await page.locator('button[type=submit]').click();
    assert.equal(await page.evaluate(() => window.preferences.speechComponentEnabled), false);
    assert.equal(await page.evaluate(() => window.speech.config.endpoint), 'https://example.com/v1/audio/speech');
    assert.equal(await page.evaluate(() => window.speech.hasKey), true);
    await page.locator('#open').click(); await openSpeech();
    assert.equal(await panel.locator('input[type=text]').nth(0).inputValue(), 'https://example.com/v1/audio/speech');
    const calls = await page.evaluate(() => window.calls);
    assert.equal(calls.filter(command => command.op === 'personal-save' && command.file === 'IDENTITY.md').length, 1);
    assert.ok(calls.some(command => command.op === 'speech-save' && command.key === 'demo-credential'
      && command.config.provider === 'deepseek' && command.config.voice === 'tide' && !command.config.filterMarkdown));
    assert.deepEqual(errors, []);
    checks.push({ width, lang, dark, componentSubtabs: true, enableCancel: true, keyboardSkipsHidden: true,
      disabledPreservesConfig: true, partialRetry: true, cancel: true, maskedKey: true, geometry, errors });
    await page.close();
  }
  await writeFile(`${out}personal-speech-checks.json`, JSON.stringify({ scripts: scripts.length, checks }, null, 2));
  console.log(JSON.stringify({ scripts: scripts.length, checks: checks.length, errors: 0 }));
} finally { await browser.close(); }
