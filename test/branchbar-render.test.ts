import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BranchBar, type BranchBarProps } from '../src/client/BranchBar.js';

// 本测试锁死分支条的三件事：显隐只跟平台插件开关（forge）走、Git 信息缺失时降级、
// 勾选工作树后切换为基准分支选择器。渲染为 SSR 输出，不代表浏览器视觉验收。
function serverWarnings(t: TestContext) {
  const original = console.error;
  t.mock.method(console, 'error', (...args: unknown[]) => {
    if (String(args[0]).includes('useLayoutEffect does nothing on the server')) return;
    original(...args);
  });
}
function render(overrides: Partial<BranchBarProps> = {}) {
  const props: BranchBarProps = {
    forge: true, branches: null, worktree: false, branch: '', busy: false, pending: false, projectPath: '/项目',
    onBranch: () => {}, onWorktree: () => {}, ...overrides,
  };
  return renderToStaticMarkup(createElement(BranchBar, props));
}

test('插件开关关闭时分支条整体不渲染', t => {
  serverWarnings(t);
  const html = render({ forge: false, branches: { git: true, current: 'main', branches: ['main'] } });
  assert.equal(html, '');
});

test('插件开关开启时非 Git 项目也保留分支条并降级提示', t => {
  serverWarnings(t);
  const html = render({ branches: { git: false, current: '', branches: [] } });
  assert.ok(html.includes('class="composer-branchbar"'));
  assert.ok(html.includes('非 Git 项目'));
  assert.ok(!html.includes('forge-toggle'), '非 Git 项目不提供工作树开关');
});

test('分支未读完时分支条显示读取态而不闪退', t => {
  serverWarnings(t);
  const html = render({ branches: null });
  assert.ok(html.includes('class="composer-branchbar"'));
  assert.ok(html.includes('读取分支…'));
});

test('Git 项目显示当前分支与工作树开关，勾选后切换为基准分支选择器', t => {
  serverWarnings(t);
  const branches = { git: true, current: 'main', branches: ['main', 'feature'] };
  let html = render({ branches });
  assert.ok(html.includes('当前分支'));
  assert.ok(html.includes('main'));
  // 工作树位是原生复选框：未勾选没有 checked，勾选后由浏览器绘制品牌色对勾。
  assert.ok(html.includes('type="checkbox"'), '工作树位使用原生 checkbox');
  assert.ok(!html.includes('checked=""'), '未勾选工作树');
  assert.ok(!html.includes('基于 main'), '未勾选工作树时只显示静态分支');
  html = render({ branches, worktree: true, branch: 'main' });
  assert.ok(html.includes('checked=""'), '已勾选工作树');
  assert.ok(html.includes('基于 main'));
});
