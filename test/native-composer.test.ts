import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Context } from '@deepseek-ai/cordis';
import { UiMemory } from '../src/client/api.js';
import { editDraft, prepareNativeComposer, composerModelStatus } from '../src/client/NativeComposer.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Composer } from '../src/client/Composer.js';
import type { ClientPort } from '../src/client/api.js';
import { initialState, emptyMark, type Snapshot } from '../src/shared/model.js';
import { createHost } from '../src/server/host.js';
import { submitNativeMessage } from '../src/client/launch.js';
import * as nativeComposer from '../src/client/NativeComposer.js';

function handoffFixture() {
  const memory = new UiMemory(), events: string[] = [];
  const doc = { text: '@文件 说明', references: [
    { source: 'file', ref: '/path', offset: 0, length: 3, label: '文件', clipboardText: '@文件' },
  ], quotes: [{ offset: 4, length: 2, text: '说明' }] };
  const shell = (id: string, text: string) => ({
    draftSnapshot: { text, references: [], quotes: [] } as typeof doc,
    ids: [] as string[], phase: 'plain', accept: true,
    state: { getSnapshot() { return { attachmentIds: shells[id]!.ids, phase: shells[id]!.phase }; } },
    setDraft(draft: typeof doc) { events.push(`draft:${id}`); this.draftSnapshot = draft; },
    addAttachments(ids: string[]) { events.push(`add:${id}`); if (!this.accept) return false; this.ids.push(...ids); return true; },
    removeAttachment(value: string) { events.push(`remove:${id}`); this.ids = this.ids.filter(v => v !== value); return true; },
  });
  const shells: Record<string, ReturnType<typeof shell>> = { a: shell('a', ''), b: shell('b', '目标已有草稿'), c: shell('c', '') };
  shells.a!.draftSnapshot = doc; shells.a!.ids = ['image'];
  const references = Object.fromEntries(Object.keys(shells).map(id => [id, {
    sessionId: id, ready: Promise.resolve(), binding: { ctx: { id }, session: { getSnapshot: () => ({ subagent: null }) } },
    release() { events.push(`release:${id}:${shells[id]!.ids.join(',')}`); },
  }]));
  const ctx = {
    sessions: { create: async ({ workspaceId }: { workspaceId: string }) => workspaceId, retain: (id: string) => references[id] },
    conversation: { input: { for: ({ id }: { id: string }) => shells[id],
      requestDraftInitialization() { events.push('seed'); } },
      rebindDraftFiles(id: string, ids: string[], ordinary: boolean) { events.push(`rebind:${id}:${ids.join(',')}:${ordinary}`); },
    },
  } as unknown as Context;
  const prepare = prepareNativeComposer as (ctx: Context, memory: UiMemory, workspace: string, signal: AbortSignal,
    preset?: string, from?: unknown) => ReturnType<typeof prepareNativeComposer>;
  return { memory, events, doc, shells, references, ctx, prepare };
}

test('切换项目先接收附件并重新绑定上传，再清空原草稿；原引用释放时不再持有附件', async () => {
  const f = handoffFixture();
  await f.prepare(f.ctx, f.memory, 'b', new AbortController().signal, '', f.references.a);
  assert.deepEqual(f.shells.b!.ids, ['image']);
  assert.deepEqual(f.shells.b!.draftSnapshot, f.doc);
  assert.deepEqual(f.shells.a!.ids, []);
  assert.equal(f.shells.a!.draftSnapshot.text, '');
  f.references.a!.release();
  assert.deepEqual(f.events, ['add:b', 'rebind:b:image:true', 'draft:b', 'draft:a', 'remove:a', 'release:a:']);
});

test('目标拒绝附件或输入正在提交时保留原草稿和附件，释放目标引用供重试', async () => {
  const f = handoffFixture();
  f.shells.b!.accept = false;
  await assert.rejects(f.prepare(f.ctx, f.memory, 'b', new AbortController().signal, '', f.references.a), /附件/);
  assert.deepEqual(f.shells.a!.ids, ['image']);
  assert.equal(f.shells.a!.draftSnapshot, f.doc);
  assert.equal(f.shells.b!.draftSnapshot.text, '目标已有草稿');
  assert.equal(f.memory.composer.nativeSessionId, '');
  assert.ok(f.events.includes('release:b:'));
  f.shells.a!.phase = 'sending';
  await assert.rejects(f.prepare(f.ctx, f.memory, 'c', new AbortController().signal, '', f.references.a), /提交/);
  assert.deepEqual(f.shells.c!.ids, []);
});

test('无附件切换保留结构化正文，空原草稿不覆盖目标；陈旧缓存不覆盖目标服务草稿', async () => {
  const f = handoffFixture();
  f.shells.a!.ids = [];
  await f.prepare(f.ctx, f.memory, 'b', new AbortController().signal, '', f.references.a);
  assert.deepEqual(f.shells.b!.draftSnapshot, f.doc);
  await f.prepare(f.ctx, f.memory, 'b', new AbortController().signal, '', f.references.a);
  assert.deepEqual(f.shells.b!.draftSnapshot, f.doc);
  f.memory.composer.nativeWorkspaceId = 'a'; f.memory.composer.nativeDraft = f.doc;
  await f.prepare(f.ctx, f.memory, 'c', new AbortController().signal);
  assert.equal(f.shells.c!.draftSnapshot.text, '');
});

test('加载取消不会转移附件，后续目标从原会话接续；加载失败也保留原附件', async () => {
  const f = handoffFixture(), abort = new AbortController();
  let ready!: () => void;
  f.references.b!.ready = new Promise<void>(resolve => { ready = resolve; });
  const pending = f.prepare(f.ctx, f.memory, 'b', abort.signal, '', f.references.a);
  await Promise.resolve();
  abort.abort(); ready();
  await assert.rejects(pending, /abort/i);
  assert.deepEqual(f.shells.a!.ids, ['image']);
  assert.deepEqual(f.shells.b!.ids, []);
  assert.equal(f.events.filter(e => e.startsWith('release:b')).length, 1);
  f.references.b!.ready = Promise.reject(new Error('打开失败'));
  await assert.rejects(f.prepare(f.ctx, f.memory, 'b', new AbortController().signal, '', f.references.a), /打开失败/);
  await f.prepare(f.ctx, f.memory, 'c', new AbortController().signal, '', f.references.a);
  assert.deepEqual(f.shells.c!.ids, ['image']);
  assert.deepEqual(f.shells.a!.ids, []);
});

test('快捷下拉始终位于按钮下方，最多360px且按面板剩余空间收缩', () => {
  const bounds = (nativeComposer as unknown as { composerDropdownBounds?: (
    anchor: { bottom: number }, frame: { top: number; bottom: number }
  ) => { top: number; maxHeight: number } }).composerDropdownBounds;
  assert.equal(typeof bounds, 'function');
  assert.deepEqual(bounds!({ bottom: 100 }, { top: 0, bottom: 900 }), { top: 108, maxHeight: 360 });
  assert.deepEqual(bounds!({ bottom: 100 }, { top: 0, bottom: 260 }), { top: 108, maxHeight: 144 });
  assert.deepEqual(bounds!({ bottom: 250 }, { top: 0, bottom: 260 }), { top: 258, maxHeight: 0 });
  assert.deepEqual(bounds!({ bottom: 0 }, { top: 30, bottom: 260 }), { top: 38, maxHeight: 214 });
});

test('官方模型配置未就绪、不可用或正在切换时禁止发送', () => {
  const status = composerModelStatus;
  assert.deepEqual(status({ current: null, routable: null, pending: null }), { ready: false, busy: false });
  const current = { provider: 'p', model: 'm', reasoningEffort: 'high' };
  assert.deepEqual(status({ current, routable: true, pending: null }), { ready: true, busy: false });
  assert.deepEqual(status({ current, routable: false, pending: null }), { ready: false, busy: false });
  assert.deepEqual(status({ current, routable: true, pending: current }), { ready: true, busy: true });
});

test('原生发送沿用官方模型与推理强度，不在发送前重新配置模型', async () => {
  const submit = submitNativeMessage;
  const memory = new UiMemory();
  memory.composer.draft = '消息';
  memory.composer.nativeSessionId = 's';
  memory.composer.nativeDraft = { text: '消息', references: [] };
  const calls: unknown[] = [];
  const selected = { provider: 'p', model: 'm', reasoningEffort: 'high' };
  const api = { call: async (command: unknown) => { calls.push(command); },
    requestWorktree: async (sessionId: string, branch: string) => { calls.push([sessionId, branch]); return true; } } as unknown as ClientPort;
  const bridge = { sessionId: 's', submit: async () => { calls.push({ ...selected }); return true; } };
  assert.equal(await submit(api, memory, bridge, 'main'), true);
  assert.deepEqual(calls, [['s', 'main'], selected]);
  assert.equal(memory.composer.nativeSessionId, '');
  assert.equal(memory.composer.nativeDraft, null);
  assert.equal(memory.composer.draft, '');
  memory.composer.draft = '失败保留';
  await assert.rejects(submit(api, memory, { ...bridge, submit: async () => { throw new Error('发送失败'); } }), /发送失败/);
  assert.equal(memory.composer.draft, '失败保留');
});

test('原生输入复用未发送会话，迁移草稿不覆盖官方草稿，取消时释放引用', async () => {
  const memory = new UiMemory();
  memory.composer.draft = '原草稿';
  const requests: unknown[] = [], seeds: unknown[] = [];
  let releases = 0;
  const reference = { sessionId: 's', binding: {}, ready: Promise.resolve({}), release() { releases++; } };
  const ctx = {
    sessions: {
      create: async (options: unknown) => { requests.push(options); return 's'; },
      retain: () => reference,
    },
    conversation: { input: { for: () => ({}), requestDraftInitialization(_binding: unknown, options: unknown) { seeds.push(options); return 'preserved'; } } },
  } as unknown as Context;
  const controller = new AbortController();
  const result = await prepareNativeComposer(ctx, memory, 'w', controller.signal);
  assert.equal(result, reference);
  assert.deepEqual(requests[0], { workspaceId: 'w' });
  assert.deepEqual(seeds[0], { prompt: '原草稿', whenDraftExists: 'keep' });
  reference.release();
  await prepareNativeComposer(ctx, memory, 'w', controller.signal);
  assert.deepEqual(requests[1], { workspaceId: 'w', sessionId: 's' });
  assert.equal(seeds.length, 2, '重复初始化保留官方草稿');
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(prepareNativeComposer(ctx, memory, 'w', cancelled.signal), /abort/i);
  assert.equal(requests.length, 2);
  assert.equal(releases, 1);
});

test('官方添加菜单接入后保留原 textarea、左右按钮与分支条布局', t => {
  t.mock.method(console, 'error', () => {});
  const memory = new UiMemory(); memory.composer.preset = 'standard';
  const snapshot: Snapshot = { revision: 0, syncedAt: 0, conflicts: [], sessionMarks: {}, preferences: initialState().preferences,
    projects: [{ projectId: 'p', workspaceId: 'w', path: '/project', title: '项目', available: true, archived: false, sessionIds: [], sessions: [], todos: [], mark: emptyMark(), updatedAt: 0, agentCanChangeStatus: true }] };
  const api = { renderComposerMenu: () => createElement('button', { 'aria-label': '官方添加菜单' }) } as unknown as ClientPort;
  const html = renderToStaticMarkup(createElement(Composer, { api, memory, snapshot }));
  assert.match(html, /<textarea[^>]*id="quick-input"/);
  assert.match(html.match(/<textarea[^>]*>/)?.[0] ?? '', /disabled/, '输入服务加载与交接期间不能编辑尚未绑定的草稿');
  assert.match(html, /composer-leading[^]*官方添加菜单[^]*会话项目[^]*Agent 模式/);
  assert.match(html, /composer-trailing[^]*会话模型[^]*composer-send/);
  assert.doesNotMatch(html, /wb-native-composer|data-conversation-content/);
  assert.doesNotMatch(html.match(/aria-label="会话项目"[^>]*/)?.[0] ?? '', /\/project/);
});

test('编辑正文保留未修改引用身份、偏移与命令，穿过引用时才移除', () => {
  const doc = { text: '/goal @文件 说明', command: { token: '/goal ' }, references: [
    { source: 'file', ref: 'owner/path', offset: 6, length: 3, label: '文件', clipboardText: '@文件' },
  ] };
  assert.deepEqual(editDraft(doc, '/goal @文件 新说明').references, doc.references);
  assert.deepEqual(editDraft(doc, '/goal 前@文件 说明').references[0], { ...doc.references[0], offset: 7 });
  assert.equal(editDraft(doc, '/goal @新文件 说明').references.length, 0);
  assert.deepEqual(editDraft(doc, '/goal @文件 新说明').command, doc.command);
  assert.equal(editDraft(doc, '文字 @文件 说明').command, undefined);
});

test('菜单桥接按所选模式创建会话，并恢复结构化引用草稿', async () => {
  const memory = new UiMemory();
  memory.composer.nativeDraft = { text: '@文件', references: [
    { source: 'file', ref: '/path', offset: 0, length: 3, label: '文件', clipboardText: '@文件' },
  ] };
  const requests: unknown[] = [], restored: unknown[] = [];
  const ctx = {
    sessions: { create: async (options: unknown) => { requests.push(options); return 's'; },
      retain: () => ({ ready: Promise.resolve(), binding: { ctx: {} }, release() {} }) },
    conversation: { input: { for: () => ({ setDraft: (doc: unknown) => restored.push(doc) }) } },
  } as unknown as Context;
  await prepareNativeComposer(ctx, memory, 'w', new AbortController().signal, 'ptc');
  await prepareNativeComposer(ctx, memory, 'w', new AbortController().signal, 'ptc');
  assert.deepEqual(requests, [{ workspaceId: 'w', agentPreset: 'ptc' }, { workspaceId: 'w', agentPreset: 'ptc', sessionId: 's' }]);
  assert.deepEqual(restored, [memory.composer.nativeDraft, memory.composer.nativeDraft]);
});

test('模式菜单沿用官方内置名称与说明，自定义同名模式不被替换', async () => {
  const ctx = {
    agentPresets: { remoteExportList: async () => ({ presets: [
      { id: 'standard', isDefault: true }, { id: 'ptc', isDefault: false },
      { id: 'cordis', isDefault: false }, { id: 'minimal', name: '我的极简', description: '自定义说明', isDefault: false },
    ] }) },
    sessionController: { modelCatalog: async () => ({ groups: [], default: { provider: 'p', model: 'm' }, failures: [] }) },
  } as unknown as Context;
  const catalog = await createHost(ctx).catalog!();
  assert.equal(catalog.presets[0]!.name, '标准模式');
  assert.match(catalog.presets[0]!.description!, /检索、编辑和终端/);
  assert.equal(catalog.presets[1]!.requiresCodingTools, true);
  assert.equal(catalog.presets[2]!.name, '创造模式');
  assert.equal(catalog.presets[3]!.name, '我的极简');
  assert.equal(catalog.presets[3]!.description, '自定义说明');
  assert.equal(catalog.presets[3]!.requiresCodingTools, false);
});

test('原生输入初始加载失败及加载中取消均释放持有引用', async () => {
  const controller = new AbortController();
  let releases = 0;
  const ctx = { sessions: {
    create: async () => 's',
    retain: () => ({ ready: Promise.reject(new Error('打开失败')), release() { releases++; } }),
  } } as unknown as Context;
  await assert.rejects(prepareNativeComposer(ctx, new UiMemory(), 'w', controller.signal), /打开失败/);
  assert.equal(releases, 1);
  ctx.sessions.retain = (() => ({
    ready: Promise.resolve().then(() => controller.abort()),
    release() { releases++; },
  })) as unknown as typeof ctx.sessions.retain;
  await assert.rejects(prepareNativeComposer(ctx, new UiMemory(), 'w', controller.signal), /abort/i);
  assert.equal(releases, 2);
});
