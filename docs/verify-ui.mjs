import { chromium } from '/tmp/dsh-ui-visual-checks/node_modules/playwright/index.mjs';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { screenshotWebp } from './evidence-image.mjs';

const dir = new URL('./ui/verification/', import.meta.url);
const dirPath = fileURLToPath(dir);
await mkdir(dir, { recursive: true });
await build({ entryPoints: ['docs/visual-fixture.tsx'], bundle: true, outfile: '/tmp/dsh-ui-visual-checks/fixture.js', jsx: 'automatic', loader: { '.css': 'css' } });
const bundle = await readFile('/tmp/dsh-ui-visual-checks/fixture.js');
const css = await readFile('/tmp/dsh-ui-visual-checks/fixture.css');
let data;
const server = createServer((req, res) => {
  if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle); }
  else if (req.url === '/fixture.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
  else res.end(`<!doctype html><meta charset="UTF-8"><style>html,body,#root{margin:0;height:100%;width:100%}</style><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script>window.visualData=${JSON.stringify(data)};</script><script src="/fixture.js"></script>`);
});
await new Promise(resolve => server.listen(8793, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const errors = [], results = [], interactions = [], details = [];
const proto = await browser.newPage(), real = await browser.newPage();
real.on('pageerror', e => errors.push(e.message));
const selectors = ['.app-header','.home-composer','.recent-shortcuts','.project-toolbar','.project-grid','.project-summary','.project-summary-head','.project-summary-metrics','.detail-heading','.detail-content','.sessions','.todos','.section-title','.session-tools','.session-row','.todo-input','.todo-row','.settings-layout','.settings-nav','.settings-panel','.theme-choice','.workspace-settings','.dialog-head','.dialog-footer','.search-panel','.home-stats','.stat-card','.composer-options','.menu'];
async function geometry(page, root) {
  return page.evaluate(({selectors, root}) => {
    const r = document.querySelector(root).getBoundingClientRect();
    return Object.fromEntries(selectors.map(s => {
      const e = [...document.querySelectorAll(s)].find(e => e.getBoundingClientRect().width > 0);
      if (!e) return [s, null];
      const b = e.getBoundingClientRect(), c = getComputedStyle(e);
      return [s, { x: b.x - r.x, y: b.y - r.y, w: b.width, h: b.height, font: c.fontSize, bg: c.backgroundColor, padding: c.padding, gap: c.gap }];
    }));
  }, { selectors, root });
}
async function capture(name) {
  await screenshotWebp(proto, join(dirPath, `${name}-design.webp`), { animations: 'disabled' });
  await screenshotWebp(real, join(dirPath, `${name}-actual.webp`), { animations: 'disabled' });
  const expected = await geometry(proto, '.app'), actual = await geometry(real, '.wb');
  results.push({ name, expected, actual });
}
async function inspectDetails(name, selectors) {
  const inspect = async page => page.evaluate(selectors => Object.fromEntries(selectors.map(selector => [selector,
    [...document.querySelectorAll(selector)].filter(e => e.getBoundingClientRect().width > 0).map(e => {
      const box = e.getBoundingClientRect();
      const parent = e.closest('.stat-card,.project,.session-row,.todo-row,.detail-heading,.menu') ?? e.parentElement;
      const anchor = parent.getBoundingClientRect(), style = getComputedStyle(e);
      const properties = ['backgroundColor','color','padding','borderWidth','borderColor','borderRadius','fontSize','fontFamily','fontWeight','lineHeight','gap','opacity','outlineWidth','outlineColor','display','minWidth','minHeight'];
      return { x: box.x-anchor.x, y: box.y-anchor.y, width: box.width, height: box.height,
        ...Object.fromEntries(properties.map(key => [key, style[key]])) };
    })])), selectors);
  const expected = await inspect(proto), actual = await inspect(real);
  details.push({name, expected, actual});
}
async function buttonStates(name, selector) {
  const targets = [selector, `${selector} svg`, ...(selector === '.stat-card' ? ['.stat-arrow'] : [])];
  await proto.mouse.move(0, 0); await real.mouse.move(0, 0);
  await inspectDetails(`${name}-idle`, targets);
  await proto.locator(selector).first().hover(); await real.locator(selector).first().hover();
  await proto.waitForTimeout(180); await real.waitForTimeout(180);
  await inspectDetails(`${name}-hover`, targets);
  await proto.mouse.move(0,0); await real.mouse.move(0,0);
  await proto.keyboard.press('Tab'); await real.keyboard.press('Tab');
  await proto.locator(selector).first().focus(); await real.locator(selector).first().focus();
  await proto.waitForTimeout(180); await real.waitForTimeout(180);
  await inspectDetails(`${name}-focus`, targets);
  await proto.locator(selector).first().evaluate(e => e.blur());
  await real.locator(selector).first().evaluate(e => e.blur());
}
async function verifyDetail() {
  if (await real.locator('#todo-results').getAttribute('data-group') === 'done') await real.locator('.todo-group-toggle').first().click();
  await real.getByRole('textbox', { name: '新建待办', exact: true }).fill('草稿状态验收');
  await real.locator('.completed-toggle').click();
  await real.waitForFunction(() => document.querySelector('#todo-results')?.getAttribute('data-group') === 'done');
  assert.equal(await real.getByRole('textbox', { name: '新建待办', exact: true }).inputValue(), '草稿状态验收');
  await real.locator('.todo-group-toggle').first().click();
  await real.waitForFunction(() => document.querySelector('#todo-results')?.getAttribute('data-group') === 'pending');
  interactions.push('分组互斥切换保留草稿');
  await real.getByRole('textbox', { name: '新建待办', exact: true }).fill('');
}
try {
  for (const width of [1440, 1280, 750, 420, 390]) {
    for (const theme of ['dsh','fresh','warm']) {
      for (const mode of ['light','dark']) {
        if (width !== 1440 && (theme !== 'fresh' || mode !== 'light')) continue;
        await proto.setViewportSize({ width, height: 900 });
        await real.setViewportSize({ width, height: 900 });
        await proto.goto(`http://127.0.0.1:8765/docs/ui/ui-directions.html?workbaseTheme=${theme}&theme=${mode}`);
        await proto.evaluate(() => {
          document.querySelector('.review').style.display = 'none';
          document.querySelector('.design-intro').style.display = 'none';
          projects = seed(); projectFields = defaultProjectFields();
          view = 'overview'; layout = 'grid'; filter = 'active'; globalQuery='';
          homepage = { composer: true, recent: true, stats: true, projects: true, recentLayout: 'buttons' };
          render();
          app.style.minHeight = '100vh';
        });
        await proto.addStyleTag({content:'.app{height:100vh;overflow:hidden;display:flex;flex-direction:column}.app>.app-header{flex:none}.app>.home-main{flex:1;min-height:0;overflow:auto}.app>.detail-main{flex:1;height:auto;min-height:0}'});
        data = await proto.evaluate(({ theme }) => ({
          transcripts,
          projects: projects.filter(p => !p.archived).map(p => ({ ...p, updatedAt: Date.now() - (6-p.order)*1000, sessions: p.sessions.map(s => ({...s, updatedAt: sessionUpdated(s)})) })),
          preferences: { theme, view: 'grid', layout: 'cards', root, home: { quick: true, recent: true, stats: true, projects: true, recentStyle: 'buttons' } },
        }), { theme });
        if (mode === 'dark') await real.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.body.setAttribute('data-ds-dark-theme','')));
        else await real.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.body.removeAttribute('data-ds-dark-theme')));
        await real.goto('http://127.0.0.1:8793');
        await real.locator('.project-summary').first().waitFor();
        await capture(`home-${width}-${theme}-${mode}`);
        const tag = `${width}-${theme}-${mode}`;
        await inspectDetails(`stats-${tag}`, ['.stat-card','.stat-card>.recent-icon','.stat-card>.recent-icon svg','.stat-label','.stat-value','.stat-detail','.stat-arrow','.stat-arrow svg']);
        await buttonStates(`stats-${tag}`, '.stat-card');
        await buttonStates(`project-grid-${tag}`, '.project-summary .more');
        if (width === 1440) {
          await proto.evaluate(() => {layout='list';render();});
          await real.getByRole('button',{name:'列表视图',exact:true}).click();
          await buttonStates(`project-list-${tag}`, '.project-list .more');
          await real.locator('.project-list .more').first().click();
          await proto.locator('.project-list .more').first().click();
          await inspectDetails(`project-menu-${tag}`, ['.menu button']);
          await capture(`project-menu-${tag}`);
          await real.keyboard.press('Escape'); await proto.keyboard.press('Escape');
          assert.equal(await real.locator('.project-list .more').first().evaluate(e => e === document.activeElement),true);
          await real.locator('.project-list .more').first().click();
          await real.locator('.brand').click();
          assert.equal(await real.locator('.wb-menu').count(),0);
          interactions.push('更多菜单 Escape 恢复按钮焦点及外部点击关闭');
          await proto.evaluate(() => {layout='grid';render();});
          await real.getByRole('button',{name:'宫格视图',exact:true}).click();
        }
        if (width === 1440 && theme === 'fresh' && mode === 'light') {
          await proto.evaluate(() => { layout='list'; render(); });
          await real.getByRole('button', { name: '列表视图', exact: true }).click();
          await capture('home-list');
          await real.getByRole('button', { name: '列表字段显示', exact: true }).click();
          await proto.locator('[data-action="project-fields"]').click();
          await capture('fields-menu');
          await real.keyboard.press('End');
          assert.equal(await real.locator('.wb-menu button').last().evaluate(e => e === document.activeElement), true);
          await real.keyboard.press('Escape'); await proto.keyboard.press('Escape');
          interactions.push('字段菜单 End 与 Escape');
          await real.getByRole('button', { name: '工作台设置', exact: true }).click();
          await proto.locator('[data-action="global-settings"]').click();
          for (const [tab, label] of [['home','首页显示'],['theme','主题'],['general','通用设置'],['permissions','项目权限']]) {
            await real.getByRole('tab', { name: label, exact: true }).click();
            await proto.locator(`[data-settings-tab="${tab}"]`).click();
            await capture(`settings-${tab}`);
          }
          await real.keyboard.press('Escape'); await proto.keyboard.press('Escape');
          assert.equal(await real.locator('dialog[open]').count(), 0);
          interactions.push('设置分类与 Escape 返回');
          await real.getByRole('button', {name:'工作台设置', exact:true}).click();
          await real.getByRole('tab', {name:'首页显示', exact:true}).click();
          await real.getByRole('checkbox', {name:'显示统计卡', exact:true}).check();
          await real.getByRole('button', {name:'保存设置', exact:true}).click();
          await proto.evaluate(() => { homepage.stats=true; homepage.recentLayout='buttons'; render(); });
          await capture('home-stats');
          await real.locator('.stat-card').first().click();
          await proto.locator('[data-action="open-stats"]').first().click();
          await capture('stats-drawer');
          await real.keyboard.press('Escape'); await proto.keyboard.press('Escape');
          await real.getByRole('combobox', {name:'搜索项目、会话和待办'}).fill('工作台');
          await proto.getByRole('combobox', {name:'全局搜索'}).fill('工作台');
          await real.waitForFunction(() => !document.querySelector('[role=status]')?.textContent?.includes('正在检索'));
          await capture('global-search');
          await real.keyboard.press('Escape'); await proto.keyboard.press('Escape');
          assert.equal(await real.locator('.search-panel').count(), 0);
          interactions.push('搜索分类结果与 Escape 关闭');
          await real.getByRole('combobox', {name:'搜索项目、会话和待办'}).fill('');
          await real.keyboard.press('Escape');
          await real.getByRole('button', {name:'添加项目',exact:true}).click();
          await proto.locator('[data-action="add-project"]').click();
          await capture('add-project');
          await real.keyboard.press('Escape'); await proto.keyboard.press('Escape');
        }
        await proto.evaluate(() => { go('detail','p1'); todoLayout='cards'; render(); });
        await real.getByRole('button', { name: 'Harness 工作台', exact: true }).click();
        await real.locator('.session-row').first().waitFor({state:'attached'});
        await capture(`detail-cards-${width}-${theme}-${mode}`);
        if (width > 850) {
          if (await proto.locator('#todo-results').getAttribute('data-group') === 'done') await proto.locator('[data-action="todo-group"][data-group="pending"]').click();
          if (await real.locator('#todo-results').getAttribute('data-group') === 'done') await real.locator('.todo-group-toggle').first().click();
          await buttonStates(`session-${tag}`, '.session-row .more');
          await buttonStates(`todo-${tag}`, '.todo-group-panel[aria-hidden=false] .todo-row .more');
          await real.locator('.session-row .more').first().click();
          await proto.locator('.session-row .more').first().click();
          await inspectDetails(`session-menu-${tag}`, ['.menu button']);
          await capture(`session-menu-${tag}`);
          await real.keyboard.press('Escape'); await proto.keyboard.press('Escape');
        }
        if (width <= 850) {
          await real.getByRole('tab',{name:/^待办/}).click();
          await proto.locator('[data-action="detail-panel"][data-panel="todos"]').click();
          await capture(`detail-todos-${width}`);
        }
        await real.locator('.completed-toggle').click();
        await proto.locator('[data-action="todo-group"][data-group="done"]').click();
        await capture(`detail-done-${width}-${theme}-${mode}`);
        await verifyDetail();
        if (await proto.locator('#todo-results').getAttribute('data-group') === 'done') await proto.locator('[data-action="todo-group"][data-group="pending"]').click();
        await real.getByRole('button',{name:'两栏使用列表布局',exact:true}).click();
        await proto.locator('[data-action="todo-layout"][data-layout="list"]').click();
        await capture(`detail-list-${width}-${theme}-${mode}`);
        if (width > 850) {
          await buttonStates(`session-list-${tag}`, '.session-row .more');
          await buttonStates(`todo-list-${tag}`, '.todo-group-panel[aria-hidden=false] .todo-row .more');
        }
        if (width === 1440 && theme === 'fresh' && mode === 'light') {
          if (await proto.locator('#todo-results').getAttribute('data-group') === 'done') await proto.locator('[data-action="todo-group"][data-group="pending"]').click();
          for (const [label, action, name] of [['查看项目详情','project-details','project-details'],['重命名','rename','project-rename'],['移除项目','remove-project','project-remove']]) {
            await real.getByRole('button',{name:'项目更多操作',exact:true}).click();
            await proto.locator('[data-action="project-menu"][data-id="p1"]').click();
            await real.getByRole('menuitem',{name:label,exact:true}).click();
            await proto.locator(`.menu [data-action="${action}"][data-id="p1"]`).click();
            await capture(name);
            await real.keyboard.press('Escape'); await proto.keyboard.press('Escape');
          }
          for (const [label, action, name] of [['编辑待办','edit-todo','todo-edit'],['查看完整标题与备注','todo-details','todo-details'],['删除待办','delete-todo','todo-delete']]) {
            await real.locator('.todo-row .more').first().click();
            await proto.locator('[data-action="todo-menu"]').first().click();
            await real.getByRole('menuitem',{name:label,exact:true}).click();
            await proto.locator(`.menu [data-action="${action}"]`).first().click();
            await capture(name);
            await real.keyboard.press('Escape'); await proto.keyboard.press('Escape');
          }
          await real.locator('.session-row .more').nth(1).click();
          await proto.locator('[data-action="session-menu"]').nth(1).click();
          await real.getByRole('menuitem',{name:'查看会话详情',exact:true}).click();
          await proto.locator('[data-action="session-details"]').first().click();
          await capture('session-details');
          await real.keyboard.press('Escape'); await proto.keyboard.press('Escape');
          interactions.push('项目、会话、待办详情及编辑、移除、删除确认弹窗');
        }
      }
    }
  }
  assert.deepEqual(errors, []);
  const detailDifferences = details.flatMap(result => Object.entries(result.expected).flatMap(([selector, expected]) => {
    const actual = result.actual[selector];
    if (expected.length !== actual.length) return [{name:result.name,selector,property:'count',expected:expected.length,actual:actual.length}];
    return expected.flatMap((entry,index) => Object.entries(entry).flatMap(([property,value]) => {
      const observed = actual[index][property];
      return typeof value === 'number' ? Math.abs(value-observed)>2 ? [{name:result.name,selector,index,property,expected:value,actual:observed}] : []
        : value !== observed ? [{name:result.name,selector,index,property,expected:value,actual:observed}] : [];
    }));
  }));
  const detailPropertyChecks = details.reduce((total,result)=>total+Object.values(result.expected).reduce((count,entries)=>count+entries.reduce((n,entry)=>n+Object.keys(entry).length,0),0),0);
  await writeFile(new URL('details.json',dir),JSON.stringify({details,detailDifferences},null,2));
  await writeFile(new URL('geometry.json', dir), JSON.stringify(results, null, 2));
  const geometryChecks = results.flatMap(result => Object.entries(result.expected).flatMap(([selector, expected]) => {
    const actual = result.actual[selector];
    if (!expected || !actual || !['.home-composer','.recent-shortcuts','.project-grid','.project-summary','.project-summary-head','.project-summary-metrics','.detail-content','.sessions','.todos','.workspace-settings'].includes(selector)) return [];
    return [{ name: result.name, selector, delta: Math.max(...['x','y','w','h'].map(key=>Math.abs(expected[key]-actual[key]))) }];
  }));
  await writeFile(new URL('checks.json', dir), JSON.stringify({geometryChecks,detailComparisons:details.length,detailPropertyChecks,detailDifferences,interactions,errors},null,2));
  await writeFile(new URL('index.html', dir), `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>逐模块 UI 验收</title><style>body{font:14px/1.6 system-ui;margin:24px;background:#f7f9fb;color:#22303c}article{margin:24px 0;border:1px solid #ccd6dd;border-radius:10px;padding:16px;background:white}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}img{width:100%;border:1px solid #ddd}summary{cursor:pointer;font-weight:600}label{display:block}h1{font-size:24px}</style><h1>工作台逐模块 UI 验收</h1><p>左侧：设计稿；右侧：实际 React 组件。相同视口及原型种子数据，无模型调用。日期、模型名称与宿主不支持的项目状态按实际能力展示。</p><p>${results.length} 组截图，${geometryChecks.length} 项几何比较。交互：${[...new Set(interactions)].join('；')}。</p>${results.map(r=>`<article><details><summary>${r.name}</summary><div class="pair"><label>设计稿<img loading="lazy" src="${r.name}-design.webp"></label><label>实际组件<img loading="lazy" src="${r.name}-actual.webp"></label></div></details></article>`).join('')}</html>`);
  console.log(JSON.stringify({ comparisons: results.length, geometryChecks:geometryChecks.length, differences: geometryChecks.filter(c=>c.delta>2), detailComparisons:details.length, detailDifferenceCount:detailDifferences.length, detailDifferences:detailDifferences.slice(0,30), interactions:[...new Set(interactions)], errors }));
  // 报告只链接本脚本写出的证据；host-details.json 由 verify-host-details.mjs 生成，不在此挂链，免得重建时留下死链。
  const reportPath = new URL('index.html',dir);
  const report = await readFile(reportPath,'utf8');
  await writeFile(reportPath,report.replace('</html>',`<p>控件细节：${details.length} 组、${detailPropertyChecks} 项属性比较，差异 ${detailDifferences.length} 项。覆盖统计卡、项目宫格／列表、会话和待办按钮的静止、悬停、键盘焦点，以及菜单项。尺寸／位置允许 2px，颜色、内边距、字体、圆角、透明度等需完全一致。</p><p><a href="details.json">最终细节数据</a> · <a href="details-before.json">修复前差异证据</a></p><p>真实宿主六外观统计卡：</p>${['dsh','fresh','warm'].flatMap(theme=>['light','dark'].map(mode=>`<article><details><summary>${theme} / ${mode}（真实宿主）</summary><img loading="lazy" src="host-stats-${theme}-${mode}.webp"></details></article>`)).join('')}</html>`));
  assert.deepEqual(detailDifferences, [], '控件细节与设计稿不一致');
  assert.deepEqual(geometryChecks.filter(c=>c.delta>2), [], '主要容器与设计稿的尺寸或位置偏差超过 2px');
} finally { await browser.close(); server.close(); }
