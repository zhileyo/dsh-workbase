import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { webcrypto as crypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { WorkbaseButton } from '../src/client/WorkbaseButton.js';
import type { ClientPort } from '../src/client/api.js';
import { initialState } from '../src/shared/model.js';
import { todoSchema } from '../src/shared/model.js';
import { prepareNativeComposer } from '../src/client/NativeComposer.js';
import { UiMemory } from '../src/client/api.js';
import type { Context } from '@deepseek-ai/cordis';
const nativeRequire = createRequire(import.meta.url);
// 宿主原子组件由运行时 module loader 提供；此处只验证插件接线，避免加载其浏览器依赖。
const hostRequire = (name: string) => name.startsWith('@xterm/') ? {}
  : name === '@deepseek-ai/dsh-client-ui-primitives'
    ? { settingsTextField: (field: string) => ({ field }),
      MarkdownText: ({ text }: { text: string }) => createElement('pre', null, text) } : nativeRequire(name);
const entryExternal = ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*', '@xterm/*'];
// 未提供的可选宿主服务保持不可用；终端显示层由独立组件测试负责。
const optionalServices = { inject() {} };

test('逐条重播只注册官方会话消息插槽，按会话及消息ID绑定，声明卸载时可清理', async () => {
  const result = await build({ entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: entryExternal, loader: { '.css': 'text' } });
  const module = { exports: {} as { apply(context: unknown): void } };
  runInNewContext(result.outputFiles[0]!.text, { module, exports: module.exports, require: hostRequire });
  const entries = new Map<string, any>();
  let ready!: () => (() => void);
  let spec: { kind: string; scope: string } | undefined;
  module.exports.apply({
    ...optionalServices, connection: { rpc: {} }, effect() {},
    slots: {
      spec() { return spec; },
      inject(name: string, callback: typeof ready) {
        if (name === 'conversation.chat.assistant-actions') ready = callback;
      },
      register(options: any, component: any) {
        entries.set(options.name, { options, component }); return () => entries.delete(options.name);
      },
    },
  });
  ready(); assert.equal(entries.has('conversation.chat.assistant-actions'), false);
  spec = { kind: 'single', scope: 'session' };
  ready(); assert.equal(entries.has('conversation.chat.assistant-actions'), false);
  spec = { kind: 'list', scope: 'session' };
  const remove = ready();
  const action = entries.get('conversation.chat.assistant-actions');
  assert.equal(action.options.id, 'workbase.speech-reply');
  const props = action.component({ sessionId: 's', messageId: 'm' }).props;
  assert.equal(props.sessionId, 's'); assert.equal(props.messageId, 'm');
  assert.equal(props.component.getSnapshot(), false, '未启用组件时默认隐藏语音操作');
  assert.equal(action.component({ sessionId: 's', messageId: 'next' }).props.playback, props.playback);
  remove(); assert.equal(entries.has('conversation.chat.assistant-actions'), false);
});

test('正式main入口声明项目右栏Session席位，可选服务缺失不阻塞工作台且退出详情释放引用', async () => {
  const result = await build({ entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: entryExternal, loader: { '.css': 'text' } });
  const module = { exports: {} as { apply(context: unknown): void } };
  runInNewContext(result.outputFiles[0]!.text, { module, exports: module.exports, require: hostRequire });
  const entries = new Map<string, any>(), optional: string[][] = [];
  const source = (value: unknown) => ({ getSnapshot: () => value, subscribe: () => () => {} });
  let connects = 0, released = 0;
  module.exports.apply({
    inject(names: string[]) { optional.push(names); },
    connection: { rpc: {} }, effect() {}, on() {},
    layout: { panelInfo: source({ activePanelId: 'dsh-workbase' }), closeRightbar() {} },
    uiWorkspace: { async connectWorkspace(id: string) { assert.equal(id, 'w'); connects++; return 's'; } },
    workspaces: { list: source({ items: [{ workspaceId: 'w', path: '/p', sessionIds: ['s'] }], archivedSessionIds: [] }) },
    sessions: { list: source({ ids: ['s'], byId: { s: { cwd: '/p', updatedAt: 1 } },
      projectionsBySession: { s: { values: { workingDirectory: '/p' }, state: 'ready' } } }), async refreshProjections() {},
      retain() { return { sessionId: 's', ready: Promise.resolve(),
        binding: { session: { projections: { faceOf: () => source('/p') } } }, release() { released++; } }; } },
    slots: {
      inject(_name: string, callback: () => void) { callback(); },
      register(options: any, component: any) {
        entries.set(options.name, { options, component }); return () => { entries.delete(options.name); };
      },
    },
  });
  const main = entries.get('main');
  assert.equal(main.options.children['workbase.sidebar-expand'].kind, 'single');
  assert.equal(main.options.children['workbase.sidebar-expand'].scope, 'session');
  assert.ok(optional.some(names => names.length === 1 && names[0] === 'sidebarRight'), '右栏按可选服务挂载');
  const api = main.component({ SessionProvider() {}, renderSlot() {} }).props.api;
  assert.equal(typeof api.renderProjectSidebar, 'function');
  api.projectSidebar.select({ projectId: 'p', workspaceId: 'w', path: '/p', available: true });
  await Promise.resolve();
  assert.equal(connects, 0, '右栏服务未就绪时不创建目录会话');
  // 真实可用性由独立installer合同测试核对；这里验证main向控制器实际传递同一项目。
  api.projectSidebar.setAvailable(true);
  for (let n = 0; n < 8; n++) await Promise.resolve();
  assert.equal(connects, 0, '进入详情及服务就绪均不自动连接');
  api.projectSidebar.open();
  for (let n = 0; n < 8; n++) await Promise.resolve();
  assert.equal(connects, 0, '打开右栏只复用已有会话，从不调用connectWorkspace');
  assert.equal(api.projectSidebar.commandTarget.getSnapshot(), 's');
  api.projectSidebar.select(null);
  assert.equal(released, 1);
  api.projectSidebar.dispose();
});

test('待办会话草稿沿用原生输入，打开前不释放引用，界面接管后释放且从不提交消息', async () => {
  const result = await build({
    entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: entryExternal, loader: { '.css': 'text' },
  });
  const module = { exports: {} as { apply(context: unknown): void } };
  runInNewContext(result.outputFiles[0]!.text, { module, exports: module.exports, require: hostRequire, Error, crypto });
  const entries: { name: string; component(): { props: Record<string, unknown> } }[] = [];
  const events: string[] = [], commands: any[] = [];
  let count = 1, notify = () => {}, releases = 0, draft = '';
  module.exports.apply({
    ...optionalServices,
    connection: { rpc: { call: async (_channel: string, _endpoint: string, command: any) => {
      commands.push(command); return { ok: true, value: { sessionId: 'session' } };
    } } }, effect() {},
    slots: {
      inject(_name: string, register: () => void) { register(); },
      register(options: { name: string }, component: typeof entries[number]['component']) { entries.push({ ...options, component }); },
    },
    layout: { beginNavigation: () => new AbortController().signal, selectPanel: () => { events.push('panel'); } },
    uiWorkspace: { openSession: () => { events.push('open'); } },
    sessions: {
      retain: () => ({ ready: Promise.resolve(), binding: { ctx: {}, session: { getSnapshot: () => ({}) } },
        sessionId: 'session', release: () => { releases++; } }),
      retainInfo: () => ({ getSnapshot: () => ({ referenceCount: count }), subscribe: (fn: () => void) => { notify = fn; return () => {}; } }),
    },
    conversation: { input: { for: () => ({ state: { getSnapshot: () => ({ phase: 'plain' }) },
      setDraft: (text: string) => { draft = text; events.push('draft'); }, addAttachments: () => true }) }, createDrafts: () => [] },
  });
  const api = entries.find(e => e.name === 'main')!.component().props.api as ClientPort;
  const todo = todoSchema.parse({ id: 'todo', projectId: 'p', title: '处理附件', note: '必须验证', priority: 'high',
    done: false, creator: 'user', createdAt: 1, updatedAt: 1, completedAt: null, version: 1 });
  await api.openTodoSession!(todo, 'standard');
  assert.deepEqual(events, ['draft', 'open', 'panel']);
  assert.equal(releases, 0);
  assert.equal(draft, '待办任务：处理附件\n待办 ID：todo\n任务描述：\n必须验证\n\n请按上述要求处理此待办，并在验证完成后更新待办状态。');
  assert.deepEqual(commands.map(c => c.op), ['begin-session', 'begin-session', 'begin-session']);
  assert.equal(commands[0].sessionId, undefined);
  assert.deepEqual(commands.slice(1).map(c => c.sessionId), ['session', 'session'], '交接前和导航前仅校验复用已创建身份');
  count = 2; notify(); notify(); assert.equal(releases, 1);
});

test('A02：真实待办入口ready、附件拒绝、图片额度及取消故障后都复用创建身份', async () => {
  const output = await build({ entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'node', format: 'cjs',
    write: false, external: entryExternal, loader: { '.css': 'text' } });
  for (const fault of ['ready', 'attachment', 'limits', 'cancel', 'create-cancel', 'lost-ack']) {
    const module = { exports: {} as { apply(ctx: unknown): void } }, entries = new Map<string, any>();
    let failed = true, created = 0, released = 0, opened = 0, allocated = 0, disposed = 0;
    let signal = new AbortController();
    const commands: any[] = [];
    const receipts = new Map<string, string>();
    const reads: AbortSignal[] = [];
    runInNewContext(output.outputFiles[0]!.text, { module, exports: module.exports, require: hostRequire, Error, crypto, File, Blob, URLSearchParams,
      fetch: async (_url: string, options: { signal: AbortSignal }) => {
        reads.push(options.signal);
        return { ok: true, blob: async () => new Blob(['image'], { type: 'image/png' }) };
      } });
    module.exports.apply({
      ...optionalServices, effect() {},
      connection: { rpc: { async call(_c: string, _e: string, command: any, rpcSignal?: AbortSignal) {
        commands.push({ ...command, rpcSignal });
        const sessionId = command.sessionId ?? receipts.get(command.requestId) ?? `s${++created}`;
        if (!command.sessionId) receipts.set(command.requestId, sessionId);
        if (failed && fault === 'lost-ack' && !command.sessionId) throw new Error('创建回执丢失');
        if (failed && fault === 'create-cancel' && !command.sessionId) {
          signal.abort();
          if (rpcSignal?.aborted) return { ok: false, error: { message: 'RPC取消' } };
        }
        return { ok: true, value: { sessionId } };
      } } },
      layout: { beginNavigation: () => (signal = new AbortController()).signal, selectPanel() {} },
      uiWorkspace: { openSession() { opened++; } },
      slots: { inject(_name: string, fn: () => void) { fn(); },
        register(options: any, component: any) { entries.set(options.name, component); } },
      sessions: {
        retain(id: string) { return { sessionId: id, ready: Promise.resolve().then(() => {
          if (failed && fault === 'ready') throw new Error('加载失败');
          if (failed && fault === 'cancel') signal.abort();
        }), release() { released++; }, binding: { ctx: {}, session: { getSnapshot: () => ({
          imageLimits: { maxImagesPerMessage: failed && fault === 'limits' ? 0 : 10, maxImageBytes: 100, maxMessageImageBytes: 100 },
        }) } } }; },
        retainInfo: () => ({ getSnapshot: () => ({ referenceCount: 2 }), subscribe: () => () => {} }),
      },
      conversation: {
        input: { for: () => ({ state: { getSnapshot: () => ({ phase: 'plain' }) }, setDraft() {},
          addAttachments: () => !(failed && fault === 'attachment') }) },
        createDrafts: () => { allocated++; return [{ id: 'image' }]; },
        releaseDraftAttachments: () => { disposed++; },
      },
    });
    const api = entries.get('main')().props.api as ClientPort;
    const todo = todoSchema.parse({ id: 't', projectId: 'p', title: '任务', note: '', done: false, creator: 'user',
      createdAt: 1, updatedAt: 1, completedAt: null, version: 1, attachments: [
        { attachmentId: 'image', name: 'image.png', mediaType: 'image/png', bytes: 5 },
      ] });
    await assert.rejects(api.openTodoSession!(todo, 'standard'));
    failed = false;
    await api.openTodoSession!(todo, 'standard');
    assert.equal(created, 1, fault);
    assert.equal(opened, 1, fault);
    assert.equal(released, ['create-cancel', 'lost-ack'].includes(fault) ? 1 : 2, '仅实际持有的引用被释放');
    assert.equal(allocated, fault === 'attachment' ? 2 : 1);
    assert.equal(disposed, fault === 'attachment' ? 1 : 0);
    assert.equal(commands.some(c => c.op === 'submit-message'), false);
    assert.equal(commands[0].rpcSignal, undefined, '已开始的创建RPC不能随导航取消');
    assert.ok(reads[0], '创建前附件读取仍使用导航signal');
    if (fault === 'lost-ack')
      assert.equal(commands[0].requestId, commands[1].requestId, '回执未知仍重试原创建请求');
  }
});

test('A02/A19：原生入口创建期间取消仍取得并保留回执；重试复用，创建前校验仍可取消', async () => {
  const output = await build({ entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'node', format: 'cjs',
    write: false, external: entryExternal, loader: { '.css': 'text' } });
  const module = { exports: {} as { apply(ctx: unknown): void } }, entries = new Map<string, any>(), commands: any[] = [];
  const abort = new AbortController();
  let first = true, created = 0;
  runInNewContext(output.outputFiles[0]!.text, { module, exports: module.exports, require: hostRequire, Error });
  module.exports.apply({
    ...optionalServices, effect() {}, layout: {}, uiWorkspace: {},
    connection: { rpc: { async call(_c: string, _e: string, command: any, signal?: AbortSignal) {
      commands.push({ ...command, signal });
      if (command.op === 'native-session-check') return { ok: true, value: { projectId: 'p' } };
      const sessionId = command.sessionId ?? `s${++created}`;
      if (first) { first = false; abort.abort(); if (signal?.aborted) return { ok: false, error: { message: 'RPC取消' } }; }
      return { ok: true, value: { sessionId } };
    } } },
    slots: { inject(_name: string, fn: () => void) { fn(); },
      register(options: any, component: any) { entries.set(options.name, component); } },
  });
  const api = entries.get('main')({ renderSlot() {}, SessionProvider() {} }).props.api as ClientPort;
  const access = (api.renderComposerMenu!({ workspaceId: 'w', preset: 'standard', disabled: false,
    onReady() {}, onState() {} }) as any).props.access;
  const ctx = { sessions: {
    retain: (id: string) => ({ sessionId: id, ready: Promise.resolve(), binding: {}, release() {} }),
  }, conversation: { input: { for: () => ({}), requestDraftInitialization() {} } } } as unknown as Context;
  const memory = new UiMemory();
  await assert.rejects(prepareNativeComposer(ctx, memory, 'w', abort.signal, 'standard', undefined, undefined, access), /abort/i);
  await prepareNativeComposer(ctx, memory, 'w', new AbortController().signal, 'standard', undefined, undefined, access);
  assert.equal(created, 1);
  assert.equal(commands[0].signal, abort.signal);
  assert.equal(commands[1].signal, undefined);
  assert.equal(commands.filter(c => c.op === 'begin-session')[1].sessionId, 's1');
});

test('A19：原生入口使用服务端最新绑定检查，归档后旧草稿创建及复用均被拒绝', async () => {
  const output = await build({ entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'node', format: 'cjs',
    write: false, external: entryExternal, loader: { '.css': 'text' } });
  const module = { exports: {} as { apply(ctx: unknown): void } }, entries = new Map<string, any>(), commands: any[] = [];
  let archived = false;
  runInNewContext(output.outputFiles[0]!.text, { module, exports: module.exports, require: hostRequire, Error });
  module.exports.apply({
    ...optionalServices, effect() {}, layout: {}, uiWorkspace: {},
    connection: { rpc: { async call(_c: string, _e: string, command: any) {
      commands.push(command);
      if (command.op === 'native-session-check') {
        if (archived) return { ok: false, error: { message: '项目已归档' } };
        return { ok: true, value: { projectId: 'p', workspaceId: 'w', sessionId: command.sessionId } };
      }
      assert.equal(command.op, 'begin-session');
      return { ok: true, value: { sessionId: command.sessionId ?? 's' } };
    } } },
    slots: { inject(_name: string, fn: () => void) { fn(); },
      register(options: any, component: any) { entries.set(options.name, component); } },
  });
  const api = entries.get('main')({ renderSlot() {}, SessionProvider() {} }).props.api as ClientPort;
  const access = (api.renderComposerMenu!({ workspaceId: 'w', preset: 'standard', disabled: false,
    onReady() {}, onState() {} }) as any).props.access;
  assert.equal(await access.create('w', 'standard', '', new AbortController().signal), 's');
  archived = true;
  await assert.rejects(access.create('w', 'standard', '', new AbortController().signal), /归档/);
  await assert.rejects(access.create('w', 'standard', 's', new AbortController().signal), /归档/);
  await assert.rejects(access.validate('w', 's', new AbortController().signal), /归档/);
  assert.equal(commands.filter(c => c.op === 'begin-session').length, 1);
  assert.equal(commands.some(c => c.op === 'snapshot'), false);
});

test('A19：提交保护请求保留取消后的令牌回执，释放使用独立owner RPC', async () => {
  const output = await build({ entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'node', format: 'cjs',
    write: false, external: entryExternal, loader: { '.css': 'text' } });
  const module = { exports: {} as { apply(ctx: unknown): void } }, entries = new Map<string, any>(), commands: any[] = [];
  const abort = new AbortController();
  runInNewContext(output.outputFiles[0]!.text, { module, exports: module.exports, require: hostRequire, Error });
  module.exports.apply({
    ...optionalServices, effect() {}, layout: {}, uiWorkspace: {},
    connection: { rpc: { async call(_c: string, _e: string, command: any, signal?: AbortSignal) {
      commands.push({ ...command, signal });
      if (command.op === 'native-session-check') { abort.abort(); return { ok: true, value: { projectId: 'p', token: 'guard' } }; }
      return { ok: true, value: { released: true } };
    } } },
    slots: { inject(_name: string, fn: () => void) { fn(); },
      register(options: any, component: any) { entries.set(options.name, component); } },
  });
  const api = entries.get('main')({ renderSlot() {}, SessionProvider() {} }).props.api as ClientPort;
  const access = (api.renderComposerMenu!({ workspaceId: 'w', preset: 'standard', disabled: false,
    onReady() {}, onState() {} }) as any).props.access;
  assert.equal(await access.validate('w', 's', abort.signal), 'guard');
  assert.equal(commands[0].hold, true);
  assert.equal(commands[0].signal, undefined);
  await access.release('guard');
  assert.equal(commands[1].op, 'native-session-release');
  assert.equal(commands[1].token, 'guard');
  assert.equal(commands[1].signal, undefined);
  await assert.rejects(access.validate('w', 's', abort.signal), /abort/i);
  assert.equal(commands.length, 2);
});

test('快捷模型插槽复用官方注入、语言和标签子插槽，热替换及卸载不残留', async () => {
  const result = await build({
    entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: entryExternal,
    loader: { '.css': 'text' },
  });
  const module = { exports: {} as { apply(context: unknown): void } };
  runInNewContext(result.outputFiles[0]!.text, { module, exports: module.exports, require: hostRequire });
  const entries = new Map<string, any>(), cleanups: (() => void)[] = [];
  let changed = () => {};
  const directory = { getSnapshot: () => ({ current: { provider: 'p', model: 'm', reasoningEffort: 'high' }, routable: true, pending: null }),
    subscribe: () => () => {} };
  const select = () => {};
  let official = { options: {}, locale: 'model', children: { 'conversation.input.model.label': { kind: 'single', scope: 'session', inline: true } },
    inject: (id: string) => { assert.equal(id, 's'); return { directory, select }; },
    component: () => createElement('button', { 'aria-label': '官方模型选择器' }) };
  module.exports.apply({
    ...optionalServices,
    connection: { rpc: {} }, effect() {}, layout: {}, uiWorkspace: {},
    on(name: string, listener: () => void) { if (name === 'slots/changed') changed = listener; return () => { changed = () => {}; }; },
    slots: {
      entriesOfSlot(name: string) { return name === 'conversation.input.model' ? [official] : []; },
      inject(_name: string, register: () => () => void) { cleanups.push(register()); },
      register(options: any, component: any) {
        entries.set(options.name, { options, component });
        return () => { if (entries.get(options.name)?.component === component) entries.delete(options.name); };
      },
    },
  });
  const model = entries.get('workbase.model-selector');
  assert.ok(model);
  assert.equal(model.options.locale, 'model');
  assert.deepEqual(model.options.children, official.children);
  const injected = model.options.inject('s');
  assert.equal(injected.directory, directory);
  assert.equal(injected.select, select, '完整选择含推理强度应直接交给官方 select');
  const owner = { locked: true, onState() {} };
  const wrapper = model.component({ ...injected, ...owner });
  assert.equal(wrapper.props.children.type, official.component);
  assert.equal(wrapper.props.children.props.locked, true);
  official = { ...official, component: () => createElement('button', { 'aria-label': '新模型选择器' }) };
  changed();
  assert.notEqual(entries.get('workbase.model-selector').component, model.component);
  cleanups.reverse().forEach(cleanup => cleanup());
  assert.equal(entries.has('workbase.model-selector'), false);
});

test('启动自动更新等待配置与控制器，后台忙状态可订阅，重连和保存不重复触发', async () => {
  const result = await build({
    entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: entryExternal,
    loader: { '.css': 'text' },
  });
  for (const [delayedOverlay, enabled] of [[false, true], [true, true], [false, false]]) {
    const module = { exports: {} as { apply(context: unknown): void } };
    runInNewContext(result.outputFiles[0]!.text, { module, exports: module.exports,
      require: hostRequire, crypto: { randomUUID: () => 'request' },
      document: { documentElement: { getAttribute: () => 'darwin' } } });
    const entries = new Map<string, any>(), effects: (() => () => void)[] = [], cleanups: (() => void)[] = [];
    let overlay!: () => () => void, reset!: () => void, checks = 0, updates = 0, finish!: () => void;
    let preferences = { ...initialState().preferences, pluginAutoUpdate: enabled === true, pluginUpdateVisible: false };
    module.exports.apply({
      ...optionalServices,
      connection: { rpc: { async call(_channel: string, _endpoint: string, command: any) {
        if (command.op === 'settings') preferences = { ...preferences, ...command.options };
        return { ok: true, value: { revision: 1, preferences } };
      } } },
      effect(callback: () => () => void) { effects.push(callback); },
      on(_event: string, callback: () => void) { reset = callback; return () => {}; },
      layout: { panelInfo: { getSnapshot: () => ({ activePanelId: 'other' }) } }, uiWorkspace: {},
      remote: { pluginManager: {
        async listBundles() { checks++; return { ok: true, value: [{ name: 'one', update: 'registry', installed: true, availability: 'profile', official: false }] }; },
        async listVersions() { return { ok: true, value: { status: 'listed', installed: '1.0.0', registry: null, versions: [{ version: '2.0.0', bundle: true }] } }; },
        async updateBundle() {
          updates++; await new Promise<void>(resolve => { finish = resolve; });
          return { ok: true, value: { from: '1.0.0', to: '2.0.0', step: 'install', result: { application: 'applied' } } };
        },
      } },
      slots: {
        inject(name: string, register: () => () => void) {
          if (delayedOverlay && name === 'shell.overlay') overlay = register;
          else cleanups.push(register());
        },
        register(options: any, component: any) { entries.set(options.name, { component }); return () => entries.delete(options.name); },
      },
    });
    cleanups.push(effects.at(-1)!());
    await new Promise<void>(resolve => setImmediate(resolve));
    if (delayedOverlay) {
      assert.equal(checks, 0, '控制器注册前不能启动更新');
      cleanups.push(overlay());
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    const api = entries.get('main').component().props.api as ClientPort;
    const controller = entries.get('shell.overlay').component().props.controller;
    assert.equal(checks, enabled ? 1 : 0);
    assert.equal(updates, enabled ? 1 : 0);
    assert.equal(controller.getSnapshot().open, false);
    assert.equal(api.pluginUpdateBusy?.getSnapshot(), enabled);
    let notifications = 0;
    const unsubscribe = api.pluginUpdateBusy!.subscribe(() => { notifications++; });
    reset();
    await api.call({ op: 'settings', theme: 'follow', permissions: {},
      options: { home: preferences.home, root: '', pluginAutoUpdate: true } });
    assert.equal(checks, enabled ? 1 : 0);
    if (enabled) finish();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(api.pluginUpdateBusy?.getSnapshot(), false);
    if (enabled) assert.ok(notifications > 0);
    unsubscribe();
    cleanups.reverse().forEach(cleanup => cleanup());
    reset();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(checks, enabled ? 1 : 0);
  }
});

test('工作台入口热重载接续自动更新批次，不重复检查且保留最终结果', async () => {
  const result = await build({
    entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: entryExternal, loader: { '.css': 'text' },
  });
  const browserWindow = {};
  let checks = 0, updates = 0, finish!: () => void;
  const manager = {
    async listBundles() {
      checks++;
      return { ok: true, value: [{ name: 'dsh-workbase', update: 'registry',
        installed: true, availability: 'profile', official: false }] };
    },
    async listVersions() {
      return { ok: true, value: { status: 'listed', installed: '1.0.0', registry: null,
        versions: [{ version: '2.0.0', bundle: true }] } };
    },
    async updateBundle() {
      updates++;
      await new Promise<void>(resolve => { finish = resolve; });
      return { ok: true, value: { from: '1.0.0', to: '2.0.0',
        step: 'install', result: { application: 'applied' } } };
    },
  };
  function mount() {
    const module = { exports: {} as { apply(context: unknown): void } };
    runInNewContext(result.outputFiles[0]!.text, { module, exports: module.exports,
      require: hostRequire, window: browserWindow, crypto: { randomUUID: () => 'request' },
      document: { documentElement: { getAttribute: () => 'darwin' } } });
    const entries = new Map<string, any>();
    const effects: (() => () => void)[] = [], cleanups: (() => void)[] = [];
    module.exports.apply({
      ...optionalServices,
      connection: { rpc: { async call() { return { ok: true, value: {
        revision: 1, preferences: { ...initialState().preferences, pluginAutoUpdate: true },
      } }; } } },
      effect(callback: () => () => void) { effects.push(callback); },
      on() { return () => {}; },
      layout: { panelInfo: { getSnapshot: () => ({ activePanelId: 'other' }) } }, uiWorkspace: {},
      remote: { pluginManager: manager },
      slots: {
        inject(_name: string, register: () => () => void) { cleanups.push(register()); },
        register(options: any, component: any) {
          entries.set(options.name, { component });
          return () => entries.delete(options.name);
        },
      },
    });
    cleanups.push(effects.at(-1)!());
    return {
      controller: entries.get('shell.overlay').component().props.controller,
      api: entries.get('main').component().props.api as ClientPort,
      dispose: () => cleanups.reverse().forEach(cleanup => cleanup()),
    };
  }
  const old = mount();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(updates, 1);
  old.controller.open();
  old.dispose();
  const next = mount();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(next.controller.getSnapshot().phase, 'updating');
  assert.equal(next.controller.getSnapshot().open, true);
  assert.equal(next.api.pluginUpdateBusy?.getSnapshot(), true);
  assert.equal(checks, 1);
  assert.equal(updates, 1);
  finish();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(next.controller.getSnapshot().phase, 'done');
  assert.equal(next.controller.getSnapshot().items[0]?.status, 'updated');
  assert.equal(next.api.pluginUpdateBusy?.getSnapshot(), false);
  next.dispose();
});

test('更新入口声明远程子服务注入，检查可穿过宿主权限边界且卸载取消进度订阅', async () => {
  const result = await build({
    entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: entryExternal,
    loader: { '.css': 'text' },
  });
  const module = { exports: {} as { inject: string[]; apply(context: unknown): void } };
  runInNewContext(result.outputFiles[0]!.text, { module, exports: module.exports, require: hostRequire });
  const entries = new Map<string, any>();
  const cleanups: (() => void)[] = [];
  let calls = 0, unsubscribed = false;
  const remote = {
    get pluginManager() {
      // remote 的注入不能授权子服务，与 Cordis 的命名空间权限边界一致。
      if (!module.exports.inject.includes('remote.pluginManager'))
        throw new Error('cannot get property "remote.pluginManager" without inject');
      return { async listBundles() {
        calls++;
        return { ok: true, value: [{ name: 'local', updatable: false, installed: true, availability: 'profile', official: false }] };
      } };
    },
    $on(name: string) {
      assert.equal(name, 'plugin-manager/update-state');
      return () => { unsubscribed = true; };
    },
  };
  module.exports.apply({
    ...optionalServices,
    remote, connection: { rpc: {} }, effect() {}, layout: {}, uiWorkspace: {},
    slots: {
      inject(_name: string, register: () => () => void) { cleanups.push(register()); },
      register(options: any, component: any) {
        entries.set(options.name, { component });
        return () => entries.delete(options.name);
      },
    },
  });
  const controller = entries.get('shell.overlay').component().props.controller;
  await controller.check();
  assert.equal(controller.getSnapshot().error, '');
  assert.equal(calls, 1);
  assert.equal(controller.getSnapshot().items[0].status, 'skipped');
  cleanups.reverse().forEach(cleanup => cleanup());
  assert.equal(unsubscribed, true);
});

test('工作台导航为带说明的纯图标，网格同时处理无会话与带 contents 包装的会话标题行', async () => {
  const html = renderToStaticMarkup(createElement(WorkbaseButton, { open() {} }));
  assert.match(html, /title="返回工作台"/);
  assert.match(html, /aria-label="返回工作台"/);
  assert.match(html, /<svg[^>]*width="16"/);
  assert.doesNotMatch(html, /<span>|Workbase/);
  const css = await readFile(new URL('../src/client/styles.css', import.meta.url), 'utf8');
  assert.match(css, /header\[data-window-drag\]:has\([^}]*\{grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css, /\[data-conversation-header-leading\]:has\(\.wb-return\)\{[^}]*grid-area:1\/3[^}]*border-inline-start:0\}/);
  assert.match(css, /\[data-conversation-header-leading\]:has\(\.wb-return\)\{[^}]*gap:8px[^}]*padding-inline-start:8px/);
  assert.match(css, /\[data-conversation-header-leading\]:has\(\.wb-return\)::after\{[^}]*width:1px;height:16px/);
  assert.match(css, /\[data-slot="conversation.session.header"\]>div:first-child\{[^}]*grid-template-columns:subgrid;grid-column:1\/-1;grid-row:1/);
});

test('导航配置即时更新真实插槽，旧快照不能恢复已隐藏入口，卸载后不重新注册', async () => {
  const result = await build({
    entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: entryExternal,
    loader: { '.css': 'text' },
  });
  const module = { exports: {} as { apply(context: unknown): void } };
  runInNewContext(result.outputFiles[0]!.text, { module, exports: module.exports, require: hostRequire });
  const entries = new Map<string, any>();
  const cleanups: (() => void)[] = [];
  let preferences = initialState().preferences, revision = 1;
  module.exports.apply({
    ...optionalServices,
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
  const updateVisibility = entries.get('shell.overlay').component().props.visibility;
  assert.equal(updateVisibility.getSnapshot(), true);
  assert.equal(entries.get('sidebar.panellist').label(), '项目概览');
  await api.call({ op: 'settings', theme: 'follow', permissions: {}, options: {
    home: preferences.home, root: '', pluginUpdateVisible: false, navigation: { sidebarName: '我的项目', sidebarVisible: false, headerButtonVisible: true, sidebarPosition: 2 },
  } });
  assert.equal(entries.has('sidebar.panellist'), false);
  assert.ok(entries.has('conversation.header.leading'), '关闭侧边栏入口时 Header 按钮仍显示');
  assert.equal(updateVisibility.getSnapshot(), false, '保存后即时隐藏更新组件');
  revision = 0;
  preferences = initialState().preferences;
  await api.call({ op: 'snapshot' });
  assert.equal(entries.has('sidebar.panellist'), false, '乱序旧快照不覆盖新配置');
  assert.equal(updateVisibility.getSnapshot(), false, '旧快照不恢复更新组件');
  revision = 3;
  await api.call({ op: 'settings', theme: 'follow', permissions: {}, options: {
    home: preferences.home, root: '', pluginUpdateVisible: true, navigation: { sidebarName: '我的项目', sidebarVisible: true, headerButtonVisible: true, sidebarPosition: 3 },
  } });
  assert.equal(entries.get('sidebar.panellist').label(), '我的项目');
  assert.equal(entries.get('sidebar.panellist').order, 3);
  assert.ok(entries.has('conversation.header.leading'));
  assert.equal(updateVisibility.getSnapshot(), true);
  cleanups.forEach(cleanup => cleanup());
  await api.call({ op: 'snapshot' });
  assert.equal(entries.size, 0);
});

test('侧栏顺序及倒序前三项按实际入口计算，增减入口动态重排且卸载取消订阅', async () => {
  const result = await build({
    entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: entryExternal,
    loader: { '.css': 'text' },
  });
  const module = { exports: {} as { apply(context: unknown): void } };
  runInNewContext(result.outputFiles[0]!.text, { module, exports: module.exports, require: hostRequire });
  const entries = new Map<string, any>();
  const cleanups: (() => void)[] = [];
  const listeners = new Set<() => void>();
  let preferences = initialState().preferences, revision = 1, registrations = 0;
  const emit = () => [...listeners].forEach(listener => listener());
  const add = (id: string, order: number) => { entries.set(id, { options: { name: 'sidebar.panellist', id, order } }); emit(); };
  add('first', 10); add('middle', 20); add('last', 30);
  module.exports.apply({
    ...optionalServices,
    connection: { rpc: { async call(_channel: string, _endpoint: string, command: any) {
      if (command.op === 'settings') { preferences = { ...preferences, ...command.options }; revision++; }
      return { ok: true, value: command.op === 'snapshot' ? { revision, preferences } : { saved: true } };
    } } },
    effect() {}, layout: {}, uiWorkspace: {},
    slots: {
      inject(_name: string, register: () => () => void) { cleanups.push(register()); },
      entriesOfSlot(name: string) { return [...entries.values()].filter(entry => entry.options.name === name); },
      subscribe(_name: string, callback: () => void) { listeners.add(callback); return () => listeners.delete(callback); },
      register(options: any, component: any) {
        assert.ok(++registrations < 100, '自身注册通知不能导致重注册循环');
        const key = options.id ?? options.name;
        entries.set(key, { options, component }); emit();
        return () => { entries.delete(key); emit(); };
      },
    },
  });
  const api = entries.get('main').component().props.api as ClientPort;
  const ids = () => [...entries.values()].filter(e => e.options.name === 'sidebar.panellist')
    .sort((a, b) => a.options.order - b.options.order).map(e => e.options.id);
  const setPosition = async (sidebarPosition: number) => api.call({ op: 'settings', theme: 'follow', permissions: {}, options: {
    home: preferences.home, root: preferences.root,
    navigation: { ...preferences.navigation, sidebarPosition },
  } });
  assert.equal(ids()[1], 'dsh-workbase');
  await setPosition(-1); assert.equal(ids().at(-1), 'dsh-workbase');
  add('new-last', 100); assert.equal(ids().at(-1), 'dsh-workbase');
  await setPosition(-2); assert.equal(ids().at(-2), 'dsh-workbase');
  entries.delete('new-last'); emit(); assert.equal(ids().at(-2), 'dsh-workbase');
  await setPosition(-3); assert.equal(ids().at(-3), 'dsh-workbase');
  add('new-last', 100); assert.equal(ids().at(-3), 'dsh-workbase');
  entries.delete('new-last'); emit(); assert.equal(ids().at(-3), 'dsh-workbase');
  await setPosition(1); assert.equal(ids()[0], 'dsh-workbase');
  await setPosition(3); assert.equal(ids()[2], 'dsh-workbase');
  for (const id of ['first', 'middle']) entries.delete(id);
  emit(); assert.equal(ids().at(-1), 'dsh-workbase', '不足三个时顺序位置放在末尾');
  await setPosition(-3); assert.equal(ids()[0], 'dsh-workbase', '不足三个时倒序位置放在最前');
  entries.delete('last'); emit(); assert.deepEqual(ids(), ['dsh-workbase']);
  cleanups.reverse().forEach(cleanup => cleanup());
  assert.equal(listeners.size, 0);
  emit(); assert.equal(entries.size, 0);
});

test('会话导航插槽可在无会话时返回工作台，保留当前会话并复用宿主目录选择', async () => {
  const result = await build({
    entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: entryExternal,
    loader: { '.css': 'text' },
  });
  const module = { exports: {} as { apply(context: unknown): void } };
  runInNewContext(result.outputFiles[0]!.text, { module, exports: module.exports, require: hostRequire });
  const entries: { name: string; priority?: number; component(): { props: Record<string, unknown> } }[] = [];
  const selections: unknown[] = [];
  let sessionChanges = 0, picks = 0;
  module.exports.apply({
    ...optionalServices,
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

test('桌面启动偏好只导航一次，等待主插槽且尊重后续导航与卸载', async () => {
  const result = await build({
    entryPoints: ['src/client/entry.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: entryExternal,
    loader: { '.css': 'text' },
  });
  const settle = () => new Promise<void>(resolve => setImmediate(resolve));
  const harness = (platform: string, enabled: boolean, delayedMain = false) => {
    const module = { exports: {} as { apply(context: unknown): void } };
    const entries = new Map<string, any>();
    const cleanups: (() => void)[] = [];
    const events = new Map<string, () => void>();
    const controller = new AbortController();
    const selections: unknown[] = [];
    const pending: ((snapshot: unknown) => void)[] = [];
    const backupRequests: string[] = [];
    let registerMain: (() => void) | undefined;
    runInNewContext(result.outputFiles[0]!.text, {
      module, exports: module.exports, require: hostRequire,
      setInterval: () => 1, clearInterval() {},
      window: { addEventListener() {}, removeEventListener() {} }, document: {
        documentElement: { getAttribute: () => platform },
        createElement: () => ({ remove() {} }), head: { append() {} },
      },
    });
    module.exports.apply({
      ...optionalServices,
      connection: { rpc: { call: (_channel: string, _endpoint: string, command: { op: string }) => {
        if (command.op === 'speech-status') return Promise.resolve({ ok: true, value: {
          config: { enabled: false }, available: false, hasKey: false, version: null,
        } });
        if (command.op === 'backup-startup') {
          backupRequests.push(command.op);
          return Promise.resolve({ ok: true, value: { phase: 'idle', message: '', coverage: [] } });
        }
        return new Promise(resolve => pending.push(resolve));
      } } },
      effect(callback: () => void | (() => void)) { const cleanup = callback(); if (cleanup) cleanups.push(cleanup); },
      on(name: string, callback: () => void) { events.set(name, callback); return () => events.delete(name); },
      slots: {
        entries: () => [],
        subscribe: () => () => {},
        inject(name: string, register: () => () => void) {
          const invoke = () => { const cleanup = register(); if (cleanup) cleanups.push(cleanup); };
          if (name === 'main' && delayedMain) registerMain = invoke; else invoke();
        },
        register(options: any, component: any) {
          entries.set(options.name, { ...options, component });
          return () => { entries.delete(options.name); };
        },
      },
      layout: {
        panelInfo: { getSnapshot: () => ({ activePanelId: null }) },
        beginNavigation: () => controller.signal,
        selectPanel(id: unknown) { selections.push(id); controller.abort(); },
      },
    });
    return {
      entries, selections, events, controller, backupRequests,
      registerMain: () => registerMain?.(),
      resolve() { pending.shift()?.({ ok: true, value: { revision: 1, preferences: { ...initialState().preferences, openOnStartup: enabled } } }); },
      dispose() { cleanups.reverse().forEach(cleanup => cleanup()); },
    };
  };
  const desktop = harness('darwin', true, true);
  desktop.resolve(); await settle();
  assert.equal(desktop.selections.length, 0, '面板注册前不选择尚不存在的 key');
  assert.equal(desktop.backupRequests.length, 0, '主插槽准备就绪前不通知后端启动备份');
  desktop.registerMain(); await settle();
  assert.deepEqual(desktop.selections, ['dsh-workbase']);
  assert.equal(desktop.backupRequests.length, 1);
  desktop.events.get('connection/reset')?.(); desktop.resolve(); await settle();
  assert.equal(desktop.selections.length, 1, '重连不重新抢占页面');
  assert.equal(desktop.backupRequests.length, 1, '重连不重复通知启动备份');
  const disabled = harness('darwin', false);
  disabled.resolve(); await settle();
  assert.equal(disabled.selections.length, 0);
  const web = harness('', true);
  web.resolve(); await settle();
  assert.equal(web.selections.length, 0, '普通 Web 不应用桌面启动设置');
  const cancelled = harness('win32', true);
  cancelled.controller.abort(); cancelled.resolve(); await settle();
  assert.equal(cancelled.selections.length, 0, '慢配置响应不覆盖用户后续导航');
  const disposed = harness('linux', true);
  disposed.dispose(); disposed.resolve(); await settle();
  assert.equal(disposed.selections.length, 0, '卸载后不导航');
  assert.equal(disposed.backupRequests.length, 0, '卸载后不通知启动备份');
});
