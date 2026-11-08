// 真实隔离宿主的样式集成检查；仅临时调整该实例偏好，finally 恢复，不调用模型。
import { chromium } from '/tmp/dsh-ui-visual-checks/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenshotWebp } from './evidence-image.mjs';
import assert from 'node:assert/strict';

const dir = new URL('./ui/verification/', import.meta.url);
const dirPath = fileURLToPath(dir);
const login = (await readFile('/tmp/dsh-workbase-host-022rc1/host.log','utf8')).match(/http:\/\/127\.0\.0\.1:8791\/\?token=[A-Za-z0-9._~%-]+/)?.[0];
assert.ok(login,'隔离实例未启动');
const references = JSON.parse(await readFile(new URL('details.json',dir),'utf8')).details;
const browser = await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page = await browser.newPage({viewport:{width:1440,height:900}});
const results = [], errors = [], differences = [];
page.on('pageerror',e=>errors.push(e.message));
let original, originalDark;
async function dispatch(command) {
  return page.evaluate(async payload => {
    const response = await fetch('/api/workbase/dispatch',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({type:'client-request',rpcId:'visual-details',method:'workbase/dispatch',payload})});
    const body = await response.json();
    if (!body.result?.ok) throw new Error('隔离实例验收请求失败');
    return body.result.value;
  },command);
}
try {
  await page.goto(login);
  await page.getByRole('button',{name:'稍后配置',exact:true}).waitFor({state:'visible',timeout:5000}).catch(()=>{});
  if (await page.getByRole('button',{name:'稍后配置',exact:true}).count()) await page.getByRole('button',{name:'稍后配置',exact:true}).click();
  await page.getByText('工作台',{exact:true}).first().click();
  await page.locator('.wb .wb-sync').waitFor();
  await page.getByRole('button',{name:'稍后配置',exact:true}).waitFor({state:'visible',timeout:5000}).catch(()=>{});
  if (await page.getByRole('button',{name:'稍后配置',exact:true}).count()) await page.getByRole('button',{name:'稍后配置',exact:true}).click();
  original = (await dispatch({op:'snapshot'})).preferences;
  originalDark = await page.evaluate(()=>[document.body.hasAttribute('data-ds-dark-theme'),document.documentElement.hasAttribute('data-ds-dark-theme')]);
  const properties = ['backgroundColor','color','padding','borderWidth','borderRadius','fontSize','fontFamily','fontWeight','lineHeight','gap','opacity','minWidth','minHeight'];
  for (const theme of ['dsh','fresh','warm']) for (const mode of ['light','dark']) {
    await dispatch({op:'preferences',patch:{theme,selectedProject:null,view:'grid',home:{...original.home,stats:true,projects:true,recent:true,recentStyle:'buttons'}}});
    await page.locator('.wb-sync').click();
    // 采用宿主的明暗主题属性检查集成，不写宿主正式外观配置。
    await page.evaluate(dark=>{document.body.toggleAttribute('data-ds-dark-theme',dark);document.documentElement.toggleAttribute('data-ds-dark-theme',dark);},mode==='dark');
    await page.waitForFunction(({theme,mode})=>document.querySelector('.wb')?.getAttribute('data-theme')===theme && document.querySelector('.wb')?.classList.contains(mode),{theme,mode});
    await page.locator('.stat-card').first().waitFor();
    await page.mouse.move(0,0);
    await screenshotWebp(page.locator('.wb'),join(dirPath,`host-stats-${theme}-${mode}.webp`),{animations:'disabled'});
    const reference = references.find(r=>r.name===`stats-1440-${theme}-${mode}`).expected;
    const actual = await page.evaluate(({selectors,properties})=>Object.fromEntries(selectors.map(selector=>[selector,
      [...document.querySelectorAll(`.wb ${selector}`)].map(e=>Object.fromEntries(properties.map(key=>[key,getComputedStyle(e)[key]])))
    ])),{selectors:Object.keys(reference),properties});
    for (const [selector,entries] of Object.entries(reference)) entries.forEach((expected,index)=>{
      for (const property of properties) if (expected[property]!==actual[selector][index]?.[property])
        differences.push({theme,mode,selector,index,property,expected:expected[property],actual:actual[selector][index]?.[property]});
    });
    await page.locator('.project-summary .more').first().click();
    assert.equal(await page.locator('.wb-menu button').first().evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('End'); await page.keyboard.press('Home');
    assert.equal(await page.locator('.wb-menu button').first().evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('End');
    assert.equal(await page.locator('.wb-menu button').last().evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.project-summary .more').first().evaluate(e=>e===document.activeElement),true);
    results.push({theme,mode,stats:4,menuKeyboard:true});
  }
} finally {
  if (original) {
    await dispatch({op:'preferences',patch:original});
    assert.deepEqual((await dispatch({op:'snapshot'})).preferences,original,'隔离实例偏好未完整恢复');
    await page.locator('.wb-sync').click();
  }
  if (originalDark) await page.evaluate(flags=>{
    document.body.toggleAttribute('data-ds-dark-theme',flags[0]);
    document.documentElement.toggleAttribute('data-ds-dark-theme',flags[1]);
  },originalDark);
  await browser.close();
}
await writeFile(new URL('host-details.json',dir),JSON.stringify({results,differences,errors,preferencesRestored:!!original,modelInvocations:0},null,2));
console.log(JSON.stringify({appearances:results.length,differences,errors,preferencesRestored:!!original,modelInvocations:0}));
assert.deepEqual(differences,[],'真实宿主统计卡样式与设计稿不同');
assert.deepEqual(errors,[]);
