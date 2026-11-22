import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { localizeClientSource } from '../localize-ui.mjs';
import { formatRssContent } from '../src/server/rss-format.ts';
// 从仓库根运行：node --import tsx docs/verify-rss-reading.mjs
// 可用DSH_UI_PLAYWRIGHT、DSH_UI_CHROME及DSH_RSS_EVIDENCE_DIR覆盖本机环境。
const { build } = createRequire(new URL('../package.json', import.meta.url))('esbuild');
const { chromium } = await import(pathToFileURL(process.env.DSH_UI_PLAYWRIGHT ?? '/tmp/dsh-rss-browser/node_modules/playwright/index.mjs').href);
const evidenceDir = process.env.DSH_RSS_EVIDENCE_DIR ?? '/tmp/dsh-rss-browser';
await mkdir(evidenceDir, { recursive: true });
const content = formatRssContent('<h2>项目介绍</h2><p>统一的阅读排版，保留链接和段落。</p><ul><li>功能一</li><li>功能二</li></ul><pre><code>const value = 1;\n' + 'long_code_'.repeat(40) + '</code></pre><table><tr><th>名称</th><th>详情</th></tr><tr><td>项目</td><td>' + 'long_cell_'.repeat(40) + '</td></tr></table>', 'https://news.org/article');
const output = await build({
  stdin: { resolveDir: process.cwd(), sourcefile: 'rss-fixture.tsx', loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';import {RssReading} from './src/client/RssPanel';import {setLanguage} from './src/client/i18n';
const params=new URLSearchParams(location.search);setLanguage(params.get('lang')||'zh');
const article={id:'a',feedId:'f',key:'a',title:'文章',summary:'不应闪现的摘要',body:'',url:'https://news.org/article',sequence:1,publishedAt:1,fetchedAt:1};
const api={call(){return new Promise(resolve=>{window.finish=()=>resolve({...article,body:${JSON.stringify(content.text)},bodyContent:${JSON.stringify(content.nodes)}})})}};
createRoot(document.getElementById('root')).render(<div className={'wb a '+(params.has('dark')?'dark':'')} style={{height:'100%',container:'workbase / inline-size','--font-ui':'"PingFang SC",sans-serif','--font-heading':'"PingFang SC",sans-serif'}}><div className="integration-detail"><RssReading article={article} api={api}/></div></div>);
` }, bundle: true, format: 'iife', platform: 'browser', write: false,
  plugins: [{ name: 'translate', setup(b) { b.onLoad({ filter: /src\/client\/.*\.tsx?$/ }, async args => ({ contents: localizeClientSource(await readFile(args.path, 'utf8'), args.path), loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' })); } }],
});
const css = await readFile('src/client/prototype.css', 'utf8') + '\n' + await readFile('src/client/styles.css', 'utf8');
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/fixture.js' ? output.outputFiles[0].text : `<!doctype html><meta charset="utf-8"><style>html,body,#root{margin:0;width:100%;height:100%}${css}</style><div id="root"></div><script src="/fixture.js"></script>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.DSH_UI_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const results = [];
try {
  for (const width of [1100,650,360]) for (const lang of ['zh','en']) for (const dark of [false,true]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } }), errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => requests.push(r.url()));
    await page.goto(`http://127.0.0.1:${server.address().port}/?lang=${lang}${dark ? '&dark' : ''}`);
    await page.locator('.rss-reader-loading').waitFor();
    assert.equal(await page.locator('.rss-reader-summary-note,.integration-reading').count(), 0);
    assert.equal(await page.locator('[aria-busy=true]').count(), 1);
    assert.match(await page.locator('.rss-reader-loading').textContent(), lang === 'en' ? /Fetching/ : /正在拉取/);
    await page.evaluate(() => window.finish());
    await page.locator('.rss-reader-content').waitFor();
    const geometry = await page.locator('.rss-reader-content').evaluate(e => ({
      whiteSpace: getComputedStyle(e).whiteSpace,
      width: e.getBoundingClientRect().width,
      overflow: document.documentElement.scrollWidth > innerWidth,
      paragraphMargin: getComputedStyle(e.querySelector('p')).marginBottom,
      codeOverflow: e.querySelector('pre').scrollWidth > e.querySelector('pre').clientWidth,
      tableOverflow: e.querySelector('table').scrollWidth > e.querySelector('table').clientWidth,
    }));
    assert.equal(geometry.whiteSpace, 'normal');
    assert.equal(geometry.overflow, false);
    assert.equal(geometry.paragraphMargin, '16px');
    assert.equal(geometry.codeOverflow, true);
    assert.ok(geometry.width <= width);
    assert.equal(errors.length, 0);
    assert.equal(requests.some(url => !url.startsWith('http://127.0.0.1:')), false);
    const png = await page.screenshot();
    const webp = await page.evaluate(async png => {
      const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/webp',0.82).split(',')[1];
    }, png.toString('base64'));
    await writeFile(`${evidenceDir}/${width}-${lang}-${dark ? 'dark' : 'light'}.webp`, Buffer.from(webp, 'base64'));
    results.push({viewportWidth:width,lang,dark,...geometry});await page.close();
  }
  await writeFile(`${evidenceDir}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
