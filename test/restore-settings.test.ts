import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import type { RestoreStatus } from '../src/shared/restore.js';
import { restoreArchiveLabel } from '../src/client/RestoreSettings.js';

test('恢复列表将新旧长文件名显示为时间和短标识，保留原文件路径', () => {
  for (const name of [
    'dsh-backup-2026-11-10T10-03-40-762Z-5b1ac6a1-d530-47bb-aa24-d3e42f9f1f35.tar.age',
    'dsh-20261110-180426-5b1ac6a1.tar.age',
  ]) {
    const item = { name, path: `/backups/${name}`, modifiedAt: 0, bytes: 123, rollback: false };
    const label = restoreArchiveLabel(item);
    assert.ok(label.startsWith('备份 · ')); assert.ok(label.endsWith(' · 5b1ac6a1'));
    assert.ok(label.length < 50); assert.equal(item.path, `/backups/${name}`);
  }
});

const ready: RestoreStatus = { phase: 'ready', message: '已校验', preview: {
  token: '11111111-1111-4111-8111-111111111111', archive: '/backup.tar.age', createdAt: 0, expiresAt: 100000,
  files: 1, bytes: 100, todos: 2, projects: 1, revision: 5, workbaseBlockers: [], coverage: [],
} };
const nodes = (node: any): any[] => !node || typeof node !== 'object' ? []
  : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
async function harness(call: (command: any) => Promise<unknown>, component: 'RestoreSettings' | 'ArchiveInput' = 'RestoreSettings', extra = {}) {
  const built = await build({ entryPoints: ['src/client/RestoreSettings.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'] });
  const require = createRequire(import.meta.url), react = require('react');
  let cursor = 0, restored = 0;
  const hooks: any[] = [], effects: (() => unknown)[] = [], timers: (() => unknown)[] = [], busy: boolean[] = [];
  const module = { exports: {} as Record<string, (props: any) => any> };
  runInNewContext(built.outputFiles[0]!.text, {
    module, exports: module.exports, setTimeout(fn: () => unknown) { timers.push(fn); return timers.length; }, clearTimeout() {},
    require: (id: string) => id === 'react' ? { ...react,
      useId() { return 'archive-input'; },
      useCallback(fn: unknown) { return fn; },
      useEffect(fn: () => unknown) { const i = cursor++; if (!hooks[i]) { hooks[i] = true; effects.push(fn); } },
      useRef(current: unknown) { const i = cursor++; return hooks[i] ??= { current }; },
      useState(initial: unknown) {
        const i = cursor++; if (!(i in hooks)) hooks[i] = initial;
        return [hooks[i], (value: unknown) => { hooks[i] = value; }];
      },
    } : require(id),
  });
  const props = { call, disabled: false, pickDirectory: async () => null,
    onBusyChange(value: boolean) { busy.push(value); }, onRestored() { restored++; }, ...extra };
  const render = () => { cursor = 0; return nodes(module.exports[component]!(props)); };
  render();
  for (const effect of effects) effect();
  await flush();
  return { props, render, timers, busy, restored: () => restored };
}
test('恢复范围采用说明下拉，预览后直接开始恢复，无需重复确认开关', async () => {
  const calls: any[] = [];
  let status: RestoreStatus = { phase: 'idle', message: '请选择' };
  const h = await harness(async command => {
    calls.push(command);
    if (command.op === 'restore-catalog') return [];
    if (command.op === 'restore-preview') status = ready;
    if (command.op === 'restore-confirm') status = { phase: 'restoring', message: '恢复中' };
    return status;
  });
  h.render().find(n => n.props?.archives)!.props.onChange('/backup.tar.age');
  assert.equal(h.render().some(n => n.props?.['aria-label'] === '恢复密钥文件路径'), false);
  h.render().find(n => n.type === 'button' && n.props.children === '预览恢复')!.props.onClick();
  await flush();
  assert.equal(calls.find(c => c.op === 'restore-preview').keyPath, '');
  assert.equal(calls.filter(c => c.op === 'restore-confirm').length, 0);
  assert.equal(h.render().find(n => n.type === 'button' && n.props.children === '开始恢复')!.props.disabled, true);
  assert.equal(h.render().some(n => n.props?.['aria-label'] === '确认恢复范围和影响'), false);
  const picker = h.render().find(n => n.props?.label === '恢复范围')!;
  assert.equal(picker.props.options.length, 2);
  assert.ok(picker.props.options.every((option: any) => option.description && option.label.length < 12));
  picker.props.onChange('workbase');
  const confirm = h.render().find(n => n.type === 'button' && n.props.children === '开始恢复')!;
  assert.equal(confirm.props.disabled, false);
  confirm.props.onClick(); await flush();
  assert.equal(calls.find(c => c.op === 'restore-confirm').token, ready.preview!.token);
  assert.equal(h.busy.at(-1), true);
  status = { phase: 'completed', message: '完成', result: { mode: 'workbase', path: '/rollback.tar.age', completedAt: 10, revision: 6 } };
  h.timers.shift()!(); await flush();
  assert.equal(h.restored(), 1); assert.equal(h.busy.at(-1), false);
});

test('备份列表 Tab 关闭并留在选择入口，禁用后选项不可操作', async () => {
  const props = { value: '', archives: [], onChange() {}, refresh() {}, disabled: false };
  const h = await harness(async () => [], 'ArchiveInput', props);
  const input = () => h.render().find(n => n.type === 'input')!;
  input().props.onClick();
  let prevented = false, stopped = false;
  input().props.onKeyDown({ key: 'Tab', preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  assert.ok(prevented && stopped);
  assert.equal(h.render().some(n => n.props?.role === 'listbox'), false);
  input().props.onClick();
  h.props.disabled = true;
  assert.equal(h.render().some(n => n.props?.role === 'listbox'), false);
});
test('有项目阻断项时禁用工作台替换，目录恢复仍可用', async () => {
  const blocked = { ...ready, preview: { ...ready.preview!, workbaseBlockers: ['缺少对应项目'] } };
  const h = await harness(async command => command.op === 'restore-catalog' ? [] : blocked);
  const tree = h.render();
  const picker = tree.find(n => n.props?.label === '恢复范围')!;
  assert.equal(picker.props.options.find((option: any) => option.value === 'workbase').disabled, true);
  assert.ok(tree.some(n => typeof n.props?.children === 'string' && n.props.children.includes('当前宿主')));
  assert.equal(picker.props.value, 'directory');
  tree.find(n => n.props?.label === '恢复保存目录')!.props.onChange('/recovered');
  assert.equal(h.render().find(n => n.type === 'button' && n.props.children === '开始恢复')!.props.disabled, false);
  h.render().find(n => n.props?.label === '恢复范围')!.props.onChange('workbase');
  assert.equal(h.render().find(n => n.type === 'button' && n.props.children === '开始恢复')!.props.disabled, true);
});
test('旧完成记录不会关闭设置，先于预览发出的迟到轮询不会覆盖新预览', async () => {
  let resolve!: (value: RestoreStatus) => void;
  const h = await harness(async command => command.op === 'restore-catalog' ? []
    : command.op === 'restore-status' ? new Promise<RestoreStatus>(r => { resolve = r; }) : ready);
  h.render().find(n => n.props?.archives)!.props.onChange('/backup.tar.age');
  h.render().find(n => n.type === 'button' && n.props.children === '预览恢复')!.props.onClick();
  await flush();
  resolve({ phase: 'completed', message: '旧完成', result: { mode: 'workbase', path: '/old', completedAt: 0 } });
  await flush();
  assert.equal(h.restored(), 0);
  assert.ok(h.render().some(n => n.type === 'button' && n.props.children === '开始恢复'));
});

test('点击只读备份文件框直接展开，选择显示文件名并保留完整路径', async () => {
  const selected: string[] = [];
  let refreshes = 0;
  const item = { name: 'dsh-20261110-180340-5b1ac6a1.tar.age', path: '/backups/dsh-20261110-180340-5b1ac6a1.tar.age',
    modifiedAt: 0, bytes: 100, rollback: false };
  const h = await harness(async () => [], 'ArchiveInput', {
    value: '', archives: [item], onChange: (value: string) => selected.push(value), refresh: () => refreshes++,
  });
  assert.equal(h.render().filter(n => n.type === 'input').length, 1);
  const input = () => h.render().find(n => n.type === 'input')!;
  assert.equal(input().props.readOnly, true);
  assert.equal(input().props.onChange, undefined);
  input().props.onClick();
  assert.equal(refreshes, 1);
  h.render().find(n => n.props?.role === 'option')!.props.onClick();
  assert.equal(selected.at(-1), item.path);
  assert.equal(h.render().some(n => n.props?.role === 'listbox'), false);
  input().props.onKeyDown({ key: 'Enter', preventDefault() {} });
  assert.equal(h.render().filter(n => n.props?.role === 'option').length, 1);
  input().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(h.render().some(n => n.props?.role === 'listbox'), false);
});
