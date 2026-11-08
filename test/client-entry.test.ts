import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import type { ClientPort } from '../src/client/api.js';
import { initialState } from '../src/shared/model.js';

test('导航配置即时更新真实插槽，旧快照不能恢复已隐藏入口，卸载后不重新注册', async () => {
  const result = await build({
    entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'],
    loader: { '.css': 'text' },
  });
  const module = { exports: {} as { apply(context: unknown): void } };
  runInNewContext(result.outputFiles[0]!.text, { module, exports: module.exports, require: createRequire(import.meta.url) });
  const entries = new Map<string, any>();
  const cleanups: (() => void)[] = [];
  let preferences = initialState().preferences, revision = 1;
  module.exports.apply({
    connection: { rpc: { async call(_channel: string, _endpoint: string, command: any) {
      if (command.op === 'settings') { preferences = { ...preferences, ...command.options }; revision++; }
      return { ok: true, value: command.op === 'snapshot' ? { revision, preferences } : { saved: true } };
    } } },
    effect() {},
    slots: {
      inject(_name: string, register: () => () => void) { cleanups.push(register()); },
      register(options: any, component: any) {
        entries.set(options.name, { ...options, component });
        return () => { entries.delete(options.name); };
      },
    },
    layout: {}, uiWorkspace: {},
  });
  const api = entries.get('main').component().props.api as ClientPort;
  assert.equal(entries.get('sidebar.panellist').label(), '项目概览');
  await api.call({ op: 'settings', theme: 'follow', permissions: {}, options: {
    home: preferences.home, root: '', navigation: { sidebarName: '我的项目', sidebarVisible: false, headerButtonVisible: true, sidebarPosition: 2 },
  } });
  assert.equal(entries.has('sidebar.panellist'), false);
  assert.ok(entries.has('conversation.header.leading'), '关闭侧边栏入口时 Header 按钮仍显示');
  revision = 0;
  preferences = initialState().preferences;
  await api.call({ op: 'snapshot' });
  assert.equal(entries.has('sidebar.panellist'), false, '乱序旧快照不覆盖新配置');
  revision = 3;
  await api.call({ op: 'settings', theme: 'follow', permissions: {}, options: {
    home: preferences.home, root: '', navigation: { sidebarName: '我的项目', sidebarVisible: true, headerButtonVisible: true, sidebarPosition: 5 },
  } });
  assert.equal(entries.get('sidebar.panellist').label(), '我的项目');
  assert.equal(entries.get('sidebar.panellist').order, 5);
  assert.ok(entries.has('conversation.header.leading'));
  cleanups.forEach(cleanup => cleanup());
  await api.call({ op: 'snapshot' });
  assert.equal(entries.size, 0);
});

test('会话导航插槽可在无会话时返回工作台，保留当前会话并复用宿主目录选择', async () => {
  const result = await build({
    entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'],
    loader: { '.css': 'text' },
  });
  const module = { exports: {} as { apply(context: unknown): void } };
  runInNewContext(result.outputFiles[0]!.text, { module, exports: module.exports, require: createRequire(import.meta.url) });
  const entries: { name: string; priority?: number; component(): { props: Record<string, unknown> } }[] = [];
  const selections: unknown[] = [];
  let sessionChanges = 0, picks = 0;
  module.exports.apply({
    connection: { rpc: {} },
    effect() {},
    slots: {
      inject(_name: string, register: () => void) { register(); },
      register(options: { name: string; priority?: number }, component: typeof entries[number]['component']) {
        entries.push({ ...options, component });
      },
    },
    layout: { selectPanel(id: unknown) { selections.push(id); } },
    uiWorkspace: {
      openSession() { sessionChanges++; },
      async pickDirectory() { picks++; return '/本地/选择目录'; },
    },
  });
  const leading = entries.find(entry => entry.name === 'conversation.header.leading')!;
  assert.ok(leading, '入口不依赖当前存在会话');
  assert.equal(leading.priority, 10, '保留其他插件默认优先级的导航入口');
  (leading.component().props.open as () => void)();
  assert.deepEqual(selections, ['dsh-workbase']);
  assert.equal(sessionChanges, 0);
  const main = entries.find(entry => entry.name === 'main')!;
  const api = main.component().props.api as ClientPort;
  assert.equal(await api.pickDirectory(), '/本地/选择目录');
  assert.equal(picks, 1);
});
