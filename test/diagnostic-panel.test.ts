import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiagnosticsPanel, diagnosticEmptyState, diagnosticSummary, fallbackDiagnosis, runDiagnosticRepair } from '../src/client/DiagnosticsPanel.js';
import { initialState, type Snapshot } from '../src/shared/model.js';
import type { Diagnosis } from '../src/shared/diagnostics.js';
import type { ClientPort } from '../src/client/api.js';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

test('空会话分类和一键删除通过确认后分批调用修复，排除归档项，保留反馈并刷新', async () => {
  const result = await build({ entryPoints: ['src/client/DiagnosticsPanel.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'] });
  const require = createRequire(import.meta.url), react = require('react');
  let cursor = 0;
  const hooks: any[] = [];
  const module = { exports: {} as { DiagnosticsPanel(props: any): any } };
  runInNewContext(result.outputFiles[0]!.text, {
    module, exports: module.exports, AbortController, TextEncoder,
    require: (id: string) => id === 'react' ? { ...react,
      useEffect() {}, useRef: (current: unknown) => { const i = cursor++; return hooks[i] ??= { current }; },
      useState: (initial: unknown) => { const i = cursor++; return [hooks[i] ??= initial, (v: unknown) => { hooks[i] = v; }]; },
    } : require(id),
  });
  const issues = Array.from({ length: 22 }, (_, i) => ({ id: `empty:${i}`, kind: 'empty', title: '空会话', detail: '未开始对话',
    projectId: 'p', projectTitle: '项目', path: '/p', sessionId: `s${i}`, identity: `i${i}`, readOnly: i === 21 }));
  const data = { checkedAt: 42, issues, repair: { empty: true, cache: false, orphan: false },
    checks: ['directory', 'cache', 'orphan', 'empty'].map(kind => ({ kind, status: 'ok' })) };
  const calls: any[] = [];
  let refreshed = false;
  const props = { report: data, busy: false, openProject() {}, onReport() { refreshed = true; },
    api: { async call(command: any) {
      calls.push(command);
      return command.op === 'diagnose' ? { ...data, issues: [] }
        : { succeeded: command.items.map((i: any) => i.sessionId), skipped: [], failures: [] };
    } } };
  const render = () => { cursor = 0; return module.exports.DiagnosticsPanel(props); };
  const nodes = (node: any): any[] => !node || typeof node !== 'object' ? []
    : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const tree = render();
  const panel = nodes(tree).find(n => n.props?.categories);
  assert.ok(panel.props.categories.some((c: any) => c.id === 'empty' && c.title === '空会话'));
  assert.equal(nodes(tree).some(n => n.props?.className === 'diagnostic-toolbar'), false, '只有空会话时不占用独立工具栏');
  assert.equal(nodes(panel.props.resultHeader('cache', 0)).some(n => n.type === 'button'), false, '其他分类没有空会话删除按钮');
  const header = panel.props.resultHeader('empty', 1);
  const all = nodes(header).find(n => n.type === 'button' && String(n.props.children).includes('删除全部'));
  assert.ok(all, '空会话有一键删除全部入口');
  assert.match(renderToStaticMarkup(header), /删除全部（21）/, '搜索只剩一条时仍显示全部可清理数量');
  all.props.onClick();
  assert.equal(calls.length, 0, '确认前不删除');
  const confirmation = nodes(render()).find(n => n.props?.title === '删除空会话');
  assert.ok(confirmation);
  const confirm = nodes(confirmation).find(n => n.type === 'button' && n.props.children === '永久删除');
  confirm.props.onClick();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.deepEqual(calls.filter(c => c.op === 'repair-diagnostics').map(c => [c.kind, c.items.length]), [['empty', 20], ['empty', 1]]);
  assert.equal(calls.some(c => c.items?.some((i: any) => i.sessionId === 's21')), false);
  assert.equal(refreshed, true);
});

const report: Diagnosis = {
  checkedAt: 42, checks: [{ kind: 'directory', status: 'ok' }, { kind: 'cache', status: 'ok' }, { kind: 'orphan', status: 'ok' }, { kind: 'empty', status: 'ok' }],
  repair: { cache: true, orphan: false },
  issues: [
    { id: 'directory:p', kind: 'directory', title: '目录不可用', detail: '/one', projectId: 'p', projectTitle: '项目', path: '/one' },
    { id: 'cache:a', kind: 'cache', title: '列表缓存异常', detail: 'a', sessionId: 'a', identity: 'a', projectId: 'p', projectTitle: '项目', path: '/one' },
    { id: 'orphan:b', kind: 'orphan', title: '孤儿子代理残留', detail: 'b', sessionId: 'b', identity: 'b', projectId: null, projectTitle: '未分组会话', path: '/other' },
  ],
};
const api = {} as ClientPort;
test('空会话批量操作位于列表滚动区域外，能力缺失时禁用且无候选时隐藏', () => {
  const issue = { id: 'empty:s', kind: 'empty' as const, title: '空会话', detail: '',
    projectId: null, projectTitle: '未分组会话', path: '', sessionId: 's', identity: 'i' };
  const render = (issues: Diagnosis['issues'], repair = false) => renderToStaticMarkup(createElement(DiagnosticsPanel, {
    report: { ...report, issues, repair: { cache: false, orphan: false, empty: repair } }, api, busy: false, onReport() {}, openProject() {},
  }));
  const html = render([issue], true);
  assert.match(html, /class="diagnostic-list-header"><strong>全部异常 · 1<\/strong><button[\s\S]*?删除全部空会话（1）<\/button><\/div><div class="stats-group-results"/);
  assert.doesNotMatch(html, /diagnostic-toolbar/);
  assert.match(render([issue]), /class="diagnostic-list-header">[\s\S]*?<button[^>]*disabled=""[^>]*title="[^"]*底层能力/);
  assert.doesNotMatch(render([]), /删除全部/);
});
test('诊断卡摘要只列有异常的类型，空会话不会被零值项挤出', () => {
  const emptyIssue = { id: 'empty:s', kind: 'empty' as const, title: '空会话', detail: '',
    projectId: null, projectTitle: '未分组会话', path: '' };
  assert.deepEqual(diagnosticSummary({ ...report, issues: Array.from({ length: 6 }, (_, i) => ({ ...emptyIssue, id: `empty:${i}` })) }),
    { count: 6, state: 'error', detail: '空会话 6' });
  assert.equal(diagnosticSummary({ ...report, issues: [report.issues[1]!, emptyIssue] }).detail, '缓存 1／空会话 1');
});
test('诊断数值合并三类异常，能力缺失或失败时不显示全部正常', () => {
  assert.deepEqual(diagnosticSummary(report), { count: 3, state: 'error', detail: '目录 1／缓存 1／孤儿 1' });
  const empty = { ...report, issues: [] };
  assert.deepEqual(diagnosticSummary(empty), { count: 0, state: 'normal', detail: '检查正常' });
  assert.deepEqual(diagnosticSummary({ ...empty, checks: [{ kind: 'cache', status: 'error', message: '不可读' }] }),
    { count: 0, state: 'unknown', detail: '检查未完成' });
});
test('诊断页展示三类状态、未分组问题、刷新及按能力禁用修复', () => {
  const html = renderToStaticMarkup(createElement(DiagnosticsPanel, {
    report, api, busy: false, onReport() {}, openProject() {},
  }));
  assert.doesNotMatch(html, /diagnostic-summary|最近检查/);
  assert.match(html, /stats-group-count">3<\/span>/);
  assert.doesNotMatch(html, /diagnostic-check/);
  assert.match(html, /列表缓存/);
  assert.match(html, /孤儿子代理/);
  assert.match(html, /未分组会话/);
  assert.match(html, /class="stats-page-header"><h3 class="stats-page-heading">项目诊断<\/h3><button[^>]*class="diagnostic-refresh"[\s\S]*?重新检查<\/button><\/div>/);
  assert.match(html, /重建列表缓存/);
  assert.match(html, /disabled=""[^>]*title="[^"]*底层能力[^"]*"[^>]*>清理残留/);
  assert.equal((html.match(/class="wb-stat-item stats-item diagnostic-item"/g) ?? []).length, 3);
  assert.match(html, /全部异常/);
  assert.match(html, /data-diagnostic-group="directory"/);
  assert.match(html, /data-diagnostic-group="cache"/);
  assert.match(html, /data-diagnostic-group="orphan"/);
  assert.doesNotMatch(html, /全部项目|搜索统计项目|data-project-group=/);
  assert.match(html, /\/other/);
});
test('诊断移除状态卡后，空状态区分正常、缺失检查和失败，不漏掉能力提示', () => {
  const normal = { ...report, issues: [] };
  assert.deepEqual(diagnosticEmptyState(normal, 'directory'), { title: '目录正常', detail: '所有项目目录均可访问' });
  const html = renderToStaticMarkup(createElement(DiagnosticsPanel, {
    report: normal, api, busy: false, onReport() {}, openProject() {},
  }));
  assert.doesNotMatch(html, /diagnostic-summary|最近检查/);
  assert.match(html, /检查不读取正文/);
  assert.match(html, /diagnostic-results-empty/);
  assert.match(html, /<strong>未发现异常<\/strong><p>目录、列表缓存、孤儿子代理及空会话检查均已完成<\/p>/);
  const partial: Diagnosis = { ...normal, checks: [{ kind: 'directory', status: 'ok' },
    { kind: 'cache', status: 'error', message: '缓存不可读' }] };
  assert.equal(diagnosticEmptyState(partial).title, '检查未完成');
  assert.match(diagnosticEmptyState(partial).detail, /列表缓存：检查失败（缓存不可读）.*孤儿子代理：尚未检查/);
  assert.equal(diagnosticEmptyState({ ...normal, checks: [{ kind: 'cache', status: 'unsupported', message: '能力缺失' }] }, 'cache').detail,
    '列表缓存：能力不可用（能力缺失）');
  const failed = renderToStaticMarkup(createElement(DiagnosticsPanel, {
    report: partial, api, busy: false, onReport() {}, openProject() {},
  }));
  assert.match(failed, /<strong>检查未完成<\/strong>/);
  assert.match(failed, /缓存不可读/);
  assert.doesNotMatch(failed, /未发现异常|检查完成 ·/);
});
test('旧快照只含目录信息时标为检查未完成，保留已有目录异常', () => {
  const snapshot: Snapshot = { projects: [], conflicts: [], revision: 0, preferences: initialState().preferences, syncedAt: 42, sessionMarks: {} };
  const value = fallbackDiagnosis(snapshot);
  assert.equal(diagnosticSummary(value).state, 'unknown');
  assert.equal(value.checks.find(c => c.kind === 'cache')?.status, 'unsupported');
});

test('修复按20条分批，保留部分失败与进度，关闭页面后不发送下一批', async () => {
  const items = Array.from({ length: 43 }, (_, i) => ({ sessionId: `s${i}`, identity: `i${i}` }));
  const batches: number[] = [], progress: number[] = [];
  const result = await runDiagnosticRepair({ call: async command => {
    assert.equal(command.op, 'repair-diagnostics');
    if (command.op !== 'repair-diagnostics') throw new Error('操作错误');
    batches.push(command.items.length);
    if (batches.length === 2) throw new Error('保存失败');
    return { succeeded: command.items.map(i => i.sessionId), skipped: [], failures: [] };
  } }, 'cache', items, done => progress.push(done));
  assert.deepEqual(batches, [20, 20, 3]);
  assert.deepEqual(progress, [20, 40, 43]);
  assert.equal(result.succeeded.length, 23);
  assert.equal(result.failures.length, 20);
  assert.equal(result.failures[0]?.sessionId, 's20');
  let active = true, calls = 0;
  const stopped = await runDiagnosticRepair({ call: async command => {
    calls++; active = false;
    return { succeeded: command.op === 'repair-diagnostics' ? command.items.map(i => i.sessionId) : [], skipped: [], failures: [] };
  } }, 'cache', items, () => {}, () => active);
  assert.equal(calls, 1);
  assert.equal(stopped.succeeded.length, 20);
});

test('长中文路径的生命周期见证按字节拆批，不超过HTTP请求32KiB上限', async () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ sessionId: `s${i}`, identity: '路'.repeat(3900) }));
  const sizes: number[] = [];
  const result = await runDiagnosticRepair({ call: async command => {
    sizes.push(new TextEncoder().encode(JSON.stringify({ rpcId: 'id', payload: command })).length);
    return { succeeded: command.op === 'repair-diagnostics' ? command.items.map(i => i.sessionId) : [], skipped: [], failures: [] };
  } }, 'cache', items);
  assert.ok(sizes.every(size => size < 32 * 1024));
  assert.ok(sizes.length > 1);
  assert.equal(result.succeeded.length, 8);
});
