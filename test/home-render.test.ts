import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Home, fitRecentButtons, type HomeProps } from '../src/client/Home.js';
import { UiMemory, type ClientPort } from '../src/client/api.js';
import { initialState, emptyMark, type Snapshot } from '../src/shared/model.js';

function fixture(): Snapshot {
  const now = Date.now();
  return {
    revision: 1, syncedAt: now, conflicts: [], sessionMarks: {},
    preferences: initialState().preferences,
    projects: Array.from({ length: 4 }, (_, i) => ({
      projectId: `p${i}`, workspaceId: `w${i}`, path: `/验收/项目${i}`, title: `项目${i}`,
      available: true, sessionIds: [], agentCanChangeStatus: true, mark: emptyMark(), updatedAt: now - i, archived: false,
      todos: [], sessions: Array.from({ length: 3 }, (_, j) => ({
        sessionId: `s${i}-${j}`, title: `会话${i}-${j}`, archived: j === 2,
        running: i === 0 && j === 0, updatedAt: now - (i * 3 + j) * 1000,
      })),
    })),
  };
}
function render(snapshot: Snapshot) {
  const noop = () => {};
  const props: HomeProps = {
    snapshot, api: { forgeAvailable: () => false } as unknown as ClientPort, memory: new UiMemory(), busy: false,
    mutate: async () => true, navigate: noop, rename: noop, removeProject: noop, notify: noop, refresh: async () => {},
  };
  return renderToStaticMarkup(createElement(Home, props));
}
// 本测试验证实际组件输出与需求组合；不将服务端渲染当作浏览器视觉验收。
function serverWarnings(t: TestContext) {
  const original = console.error;
  t.mock.method(console, 'error', (...args: unknown[]) => {
    if (String(args[0]).includes('useLayoutEffect does nothing on the server')) return;
    original(...args);
  });
}

test('实际首页组件支持四模块全部16组合，关闭模块不残留内容', t => {
  serverWarnings(t);
  for (let mask = 0; mask < 16; mask++) {
    const s = fixture();
    const keys = ['quick', 'recent', 'stats', 'projects'] as const;
    keys.forEach((key, bit) => { s.preferences.home[key] = !!(mask & (1 << bit)); });
    const html = render(s);
    const markers = ['aria-label="开始新会话"', 'aria-label="最近会话"', 'aria-label="工作台统计"', 'wb-project-grid project-grid'];
    markers.forEach((marker, bit) => assert.equal(html.includes(marker), !!(mask & (1 << bit)), `${mask}: ${keys[bit]}`));
  }
});

test('最近卡片只取5条未归档会话，按钮保留候选供宽度计算，统计开启强制按钮', t => {
  serverWarnings(t);
  const s = fixture();
  s.preferences.home.projects = false;
  s.preferences.home.recent = true;
  s.preferences.home.stats = false;
  let html = render(s);
  assert.equal((html.match(/class="wb-recent-copy recent-copy"/g) ?? []).length, 5);
  assert.ok(!html.includes('会话0-2'));
  s.preferences.home.recentStyle = 'buttons';
  html = render(s);
  assert.equal((html.match(/class="wb-recent-copy recent-copy"/g) ?? []).length, 8);
  s.preferences.home.recentStyle = 'cards';
  s.preferences.home.stats = true;
  html = render(s);
  assert.ok(html.includes('wb-recent-buttons'));
  assert.equal((html.match(/class="wb-recent-copy recent-copy"/g) ?? []).length, 8);
  assert.equal((html.match(/class="wb-stat-card stat-card"/g) ?? []).length, 4);
  assert.ok(!html.includes('最近活动：'), '卡片最近活动不带前缀，避免截断');
});

test('最近会话按钮按实际宽度和间距显示完整前缀，宽屏可以超过3条', () => {
  assert.equal(fitRecentButtons(500, [80, 90, 100, 110, 120]), 4);
  assert.equal(fitRecentButtons(600, [80, 90, 100, 110, 120]), 5);
  assert.equal(fitRecentButtons(200, [80, 90, 100]), 2);
  assert.equal(fitRecentButtons(50, [80, 30]), 0);
  assert.equal(fitRecentButtons(178, [80, 90]), 2);
  assert.equal(fitRecentButtons(0, []), 0);
});

test('诊断卡汇总异常数量，完整检查才显示正常，旧快照明确未完成', t => {
  serverWarnings(t);
  const s = fixture();
  const card = () => render(s).match(/<button[^>]*data-stat-tab="diagnostic"[\s\S]*?<\/button>/)![0];
  let html = card();
  assert.match(html, /data-state="unknown"/);
  assert.match(html, /检查未完成/);
  s.diagnostics = { checkedAt: s.syncedAt, checks: [{ kind: 'directory', status: 'ok' }, { kind: 'cache', status: 'ok' }, { kind: 'orphan', status: 'ok' }],
    issues: [], repair: { cache: true, orphan: true } };
  assert.match(card(), /data-state="unknown"/, '旧三项检查结果不能冒充已完成空会话检测');
  s.diagnostics.checks.push({ kind: 'empty', status: 'ok' });
  html = card();
  assert.match(html, /data-state="normal"/);
  assert.match(html, /class="stat-value">0<\/strong>/);
  assert.match(html, /class="stat-detail"[^>]*>检查正常<\/span>/);
  s.projects[0]!.available = false;
  s.projects[1]!.available = false;
  s.diagnostics.issues = s.projects.filter(p => !p.available).map(p => ({
    id: `directory:${p.projectId}`, kind: 'directory', title: '目录不可用', detail: p.path,
    projectId: p.projectId, projectTitle: p.title, path: p.path,
  }));
  html = card();
  assert.match(html, /data-state="error"/);
  assert.match(html, /class="stat-value">2<\/strong>/);
  assert.match(html, /class="stat-detail"[^>]*>目录 2<\/span>/);
});

test('归档项目只出现在归档范围，活跃范围不含归档项目', t => {
  serverWarnings(t);
  const s = fixture();
  s.projects[0]!.archived = true;
  s.preferences.home.quick = s.preferences.home.recent = s.preferences.home.stats = false;
  const active = { ...s, preferences: { ...s.preferences, projectFilter: 'active' as const } };
  let html = render(active);
  assert.ok(!html.includes('项目0'), '活跃范围不含归档项目');
  assert.ok(html.includes('项目1'));
  const archived = { ...active, preferences: { ...active.preferences, projectFilter: 'archived' as const } };
  html = render(archived);
  assert.ok(html.includes('项目0'));
  assert.ok(!html.includes('项目1'));
});

test('统计卡按单卡显隐过滤，全部关闭时整个统计区域不渲染', t => {
  serverWarnings(t);
  const s = fixture();
  s.preferences.home.projects = false;
  s.preferences.home.statCards = { running: true, recent: false, pending: true, diagnostic: false };
  let html = render(s);
  assert.equal((html.match(/class="wb-stat-card stat-card"/g) ?? []).length, 2);
  assert.ok(html.includes('data-stat-tab="running"'));
  assert.ok(!html.includes('data-stat-tab="recent"'));
  assert.ok(!html.includes('data-stat-tab="diagnostic"'));
  s.preferences.home.statDays = 14;
  s.preferences.home.statCards = { running: true, recent: true, pending: true, diagnostic: false };
  html = render(s);
  assert.ok(html.includes('最近 14 天'), '统计时间范围反映到卡片小字');
  s.preferences.home.statCards = { running: false, recent: false, pending: false, diagnostic: false };
  html = render(s);
  assert.ok(!html.includes('aria-label="工作台统计"'));
});

test('没有会话与活动数据时隐藏可选区域，保留零值统计和项目入口', t => {
  serverWarnings(t);
  const s = fixture();
  s.projects.forEach(p => { p.sessions = []; p.updatedAt = 0; });
  s.preferences.home.stats = true;
  const html = render(s);
  assert.ok(!html.includes('aria-label="最近会话"'));
  assert.ok(!html.includes('recent-empty'));
  assert.ok(!html.includes('project-summary-latest'));
  assert.ok(!html.includes('class="activity"'));
  assert.ok(!html.includes('class="sort"'));
  assert.ok(html.includes('项目总览'));
  assert.equal((html.match(/class="wb-stat-card stat-card"/g) ?? []).length, 4);
  assert.equal((html.match(/class="wb-project project project-summary"/g) ?? []).length, 4);
});

test('实际列表七字段表头顺序对应数据列，两套字段设置互不影响', t => {
  serverWarnings(t);
  const s = fixture();
  s.preferences.home.quick = s.preferences.home.recent = false;
  s.preferences.view = 'list';
  Object.keys(s.preferences.fields.list).forEach(key => {
    s.preferences.fields.list[key as keyof typeof s.preferences.fields.list] = true;
  });
  let html = render(s);
  const fields = [...html.matchAll(/class="project-list-cell" data-field="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(fields.slice(0, 6), ['recent','pending','archived','latest','activity','status']);
  assert.ok(html.includes('directory-name'));
  s.preferences.fields.list.directory = false;
  html = render(s);
  assert.ok(!html.includes('directory-name'));
  assert.equal(s.preferences.fields.grid.directory, true);
  assert.ok(html.includes('列表字段显示'));
});
