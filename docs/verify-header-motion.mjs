// 实际 React 组件的模拟宿主验收；不连接正式 profile、不调用模型。
// DSH_UI_PLAYWRIGHT 覆盖 playwright 入口，DSH_UI_CHROME 覆盖浏览器可执行文件；缺省保持 macOS 本地环境。
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.DSH_UI_PLAYWRIGHT ?? '/tmp/dsh-ui-visual-checks/node_modules/playwright/index.mjs').href);
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { screenshotWebp } from './evidence-image.mjs';
import assert from 'node:assert/strict';

const bundle = await build({
  entryPoints: ['docs/visual-fixture.tsx'], bundle: true, write: false,
  outfile: 'fixture.js', jsx: 'automatic', loader: { '.css': 'css' },
});
const js = bundle.outputFiles.find(f => f.path.endsWith('.js')).text;
const css = bundle.outputFiles.find(f => f.path.endsWith('.css')).text;
const data = {
  preferences: { theme: 'violet', home: { quick: true, recent: false, stats: true, projects: true, recentStyle: 'buttons' } },
  transcripts: {},
  projects: Array.from({ length: 30 }, (_, i) => ({
    id: `p${i}`, name: `验收项目 ${i}`, path: `/验收/项目${i}`, updatedAt: Date.now(),
    allowAgent: true, sessions: [], todos: [],
  })),
};
const server = createServer((req, res) => {
  if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(js); }
  else if (req.url === '/fixture.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
  else {
    const collapsed = req.url.includes('collapsed=1');
    res.end(`<!doctype html><html data-platform="darwin"><meta charset="utf-8"><style>
      html,body{margin:0;height:100%;overflow:hidden}
      #frame{height:100%;box-sizing:border-box;padding-left:${collapsed ? 0 : 240}px;--dsh-frame-leading-clearance:${collapsed ? 160 : 0}px}
      #root{height:100%}
      </style><link rel="stylesheet" href="/fixture.css"><div id="frame" ${collapsed ? 'data-sidebar-collapsed' : ''}><div id="root"></div></div>
      <script>window.visualData=${JSON.stringify(data)}</script><script src="/fixture.js"></script></html>`);
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.DSH_UI_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage();
const results = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
const measure = () => page.evaluate(() => {
  const box = selector => {
    const b = document.querySelector(selector).getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };
  return {
    header: box('.wb-header'), search: box('.global-search input'), add: box('.header-add'),
    home: box('.wb-home'), scroll: document.querySelector('.wb-home').scrollTop,
    brand: box('.brand-mark'), brandPath: document.querySelector('.brand-mark path')?.getAttribute('d'),
    titleHidden: getComputedStyle(document.querySelector('.brand-title')).display === 'none',
  };
});
try {
  for (const width of [1440, 1168, 888, 650]) for (const collapsed of [false, true]) {
    await page.setViewportSize({ width, height: 768 });
    await page.goto(`http://127.0.0.1:${server.address().port}/?collapsed=${Number(collapsed)}`);
    await page.locator('.stat-card').first().waitFor();
    const geometry = await measure();
    assert.equal(geometry.header.h, 52);
    assert.equal(geometry.search.h, 32);
    assert.equal(geometry.add.h, 32);
    if (geometry.header.w > 650) {
      assert.ok(Math.abs(geometry.search.x + geometry.search.w / 2 - geometry.header.x - geometry.header.w / 2) < 1, '搜索框偏离工作台中心');
      assert.ok(geometry.search.x >= geometry.brand.x + geometry.brand.w, '搜索框覆盖品牌');
      assert.ok(geometry.search.x + geometry.search.w <= geometry.add.x, '搜索框覆盖操作按钮');
    }
    if (collapsed) {
      assert.equal(geometry.brand.w, 28);
      assert.equal(geometry.brandPath, 'M1 2 9 30 18 12 27 30 35 2');
      assert.equal(geometry.titleHidden, true);
      assert.equal(geometry.brand.x, 160, '与官方末个控件起点124px保持36px步长');
    }
    for (const target of ['.stat-card', '[aria-label="工作台设置"]']) {
      await page.locator(target).first().scrollIntoViewIfNeeded();
      const before = await measure();
      await page.locator(target).first().click();
      await page.locator('.wb-drawer').waitFor();
      const frames = await page.evaluate(async () => {
        const frames = [];
        for (let i = 0; i < 18; i++) {
          await new Promise(requestAnimationFrame);
          const dialog = document.querySelector('.wb-drawer'), b = dialog.getBoundingClientRect();
          const style = getComputedStyle(dialog), transform = new DOMMatrix(style.transform);
          frames.push({
            y: b.y - transform.m42, height: b.height,
            scroll: document.querySelector('.wb-home').scrollTop,
            homeTop: document.querySelector('.wb-home').getBoundingClientRect().y,
            animation: style.animationName, duration: style.animationDuration,
          });
        }
        return frames;
      });
      frames.forEach(frame => {
        assert.ok(Math.abs(frame.y - frames[0].y) < 1, '动画期间弹窗基准位置跳动');
        assert.equal(frame.height, frames[0].height, '动画期间弹窗高度改变');
        assert.equal(frame.scroll, before.scroll, '聚焦导致首页滚动');
        assert.equal(frame.homeTop, before.home.y, '弹窗导致背景布局变化');
        assert.equal(frame.animation, 'wb-settings-slide-up');
        assert.equal(frame.duration, '0.2s');
      });
      assert.equal(await page.locator('.wb-dialog').evaluate(e => e.contains(document.activeElement)), true);
      await page.keyboard.press('Escape');
      assert.equal((await measure()).scroll, before.scroll);
    }
    results.push({ width, collapsed, geometry, stableDialogs: ['统计', '设置'] });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('[aria-label="工作台设置"]').click();
  await page.getByRole('tab', { name: '通用设置', exact: true }).click();
  const sidebarToggle = page.getByRole('checkbox', { name: '显示侧边栏工作台入口', exact: true });
  const headerToggle = page.getByRole('checkbox', { name: '显示 Header 工作台按钮', exact: true });
  const position = page.getByRole('button', { name: '侧边栏菜单位置', exact: true });
  assert.equal(await page.getByRole('textbox', { name: '侧边栏名称', exact: true }).inputValue(), '项目概览');
  assert.equal(await sidebarToggle.isChecked(), true);
  assert.equal(await headerToggle.isChecked(), true);
  assert.equal(await position.isDisabled(), false, '侧边栏入口开启时位置可配置');
  assert.ok((await position.textContent()).includes('第 2 个'), '菜单位置默认第 2 个');
  await position.click();
  await page.getByRole('option', { name: '第 3 个' }).click();
  await sidebarToggle.uncheck();
  assert.equal(await sidebarToggle.isChecked(), false);
  assert.equal(await headerToggle.isChecked(), true, '关闭侧边栏入口时 Header 按钮自动开启');
  assert.equal(await position.isDisabled(), true, '侧边栏入口关闭时位置不可配置');
  await headerToggle.uncheck();
  assert.equal(await headerToggle.isChecked(), false);
  assert.equal(await sidebarToggle.isChecked(), true, '关闭 Header 按钮时侧边栏入口自动开启');
  await page.getByRole('textbox', { name: '侧边栏名称', exact: true }).fill('我的项目');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await page.locator('.wb-drawer').waitFor({ state: 'detached' });
  await page.locator('[aria-label="工作台设置"]').click();
  await page.getByRole('tab', { name: '通用设置', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: '侧边栏名称', exact: true }).inputValue(), '我的项目');
  assert.equal(await page.getByRole('checkbox', { name: '显示侧边栏工作台入口', exact: true }).isChecked(), true);
  assert.equal(await page.getByRole('checkbox', { name: '显示 Header 工作台按钮', exact: true }).isChecked(), false, '互斥后保存的是关闭 Header 时的合法状态');
  assert.ok((await position.textContent()).includes('第 3 个'), '菜单位置保存后保持第 3 个');
  await page.getByRole('textbox', { name: '侧边栏名称', exact: true }).fill(' ');
  assert.equal(await page.getByRole('button', { name: '保存设置', exact: true }).isDisabled(), true);
  await page.getByRole('textbox', { name: '侧边栏名称', exact: true }).fill('取消修改');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.locator('[aria-label="工作台设置"]').click();
  await page.getByRole('tab', { name: '通用设置', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: '侧边栏名称', exact: true }).inputValue(), '我的项目');
  await screenshotWebp(page, 'docs/ui/verification/navigation-settings-026.webp');
  await page.keyboard.press('Escape');
  // 搜索弹层层叠：弹层展开时必须盖住下方 composer 的 position:relative 控件（transform 层叠上下文回归）。
  await page.locator('.global-search input').click();
  await page.locator('.wb-search-popover').waitFor();
  const stacking = await page.evaluate(() => {
    const panel = document.querySelector('.wb-search-popover').getBoundingClientRect();
    const composer = document.querySelector('.home-composer .composer-actions');
    if (!composer) return { overlap: false, covered: false };
    const r = composer.getBoundingClientRect();
    const x = Math.max(panel.left, r.left) + 40, y = Math.max(panel.top, r.top) + 10;
    if (x >= Math.min(panel.right, r.right) || y >= Math.min(panel.bottom, r.bottom)) return { overlap: false, covered: false };
    const hit = document.elementFromPoint(x, y);
    return { overlap: true, covered: hit instanceof Element && hit.closest('.wb-search-popover') !== null };
  });
  if (stacking.overlap) assert.equal(stacking.covered, true, '搜索弹层被 composer 控件穿透');
  await page.keyboard.press('Escape');
  // 首页模块间距（0.2.38）：随窗口高度伸缩的 clamp，按当前视口算出期望值再比对。
  // header→输入框 / 页尾 clamp(48,6vh,72)；输入框→统计卡 clamp(44,5vh,64)；统计卡→项目总览 clamp(56,7vh,88)。
  const spacing = await page.evaluate(() => {
    const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
    const header = rect('.app-header'), composer = rect('.composer-shell'), stats = rect('.home-stats'), toolbar = rect('.project-toolbar');
    if (!composer || !stats || !toolbar || !header) return { present: false };
    return {
      present: true,
      viewportHeight: window.innerHeight,
      headerToComposer: +(composer.top - header.bottom).toFixed(1),
      composerToStats: +(stats.top - composer.bottom).toFixed(1),
      statsToToolbar: +(toolbar.top - stats.bottom).toFixed(1),
    };
  });
  const clampPx = (min, vh, max) => Math.min(max, Math.max(min, viewportHeight * vh / 100));
  const viewportHeight = spacing.viewportHeight;
  assert.equal(spacing.present, true, '首页模块未渲染齐全');
  assert.ok(Math.abs(spacing.headerToComposer - clampPx(48, 6, 72)) <= 1, `header→输入框间距应为 clamp(48,6vh,72)=${clampPx(48, 6, 72).toFixed(0)}`);
  assert.ok(Math.abs(spacing.composerToStats - clampPx(44, 5, 64)) <= 1, `输入框→统计卡间距应为 clamp(44,5vh,64)=${clampPx(44, 5, 64).toFixed(0)}`);
  assert.ok(Math.abs(spacing.statsToToolbar - clampPx(56, 7, 88)) <= 1, `统计卡→项目总览间距应为 clamp(56,7vh,88)=${clampPx(56, 7, 88).toFixed(0)}`);
  // 节奏规则：章节分隔必须大于同一区块内的缝隙，否则「项目总览」会黏在统计卡上。
  assert.ok(spacing.statsToToolbar > spacing.composerToStats, '章节分隔应大于区块内缝隙');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[aria-label="工作台设置"]').click();
  assert.equal(await page.locator('.wb-drawer').evaluate(e => getComputedStyle(e).animationName), 'none');
  assert.deepEqual(errors, []);
  await writeFile('docs/ui/verification/header-motion-checks.json', JSON.stringify({
    environment: '实际 React 组件／模拟 macOS 宿主，不等同于正式桌面验收',
    results, navigationSettings: ['默认值', '保存恢复', '入口互斥', '菜单位置', '空名称校验', '取消保留'],
    searchPopoverStacking: stacking, homeSpacing: spacing, reducedMotion: true, errors,
  }, null, 2));
  console.log(`通过：${results.length} 组顶栏布局、16 次弹窗稳定性、6 项导航设置（含入口互斥与菜单位置）、搜索弹层层叠${stacking.overlap ? '（遮盖 composer）' : '（无重叠未触发）'}、首页间距按视口 clamp 校验（${spacing.headerToComposer}/${spacing.composerToStats}/${spacing.statsToToolbar}）、减少动态效果；浏览器错误 0。`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
