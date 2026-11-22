import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { webcrypto as crypto } from 'node:crypto';
import { initialState, type Snapshot } from '../src/shared/model.js';
import { UiMemory } from '../src/client/api.js';

const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const nodes = (node: any): any[] => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes)
  : [node, ...nodes(node.props?.children), ...nodes(node.props?.main), ...nodes(node.props?.detail)];
async function mount(entry: string, name: string, props: any) {
  const output = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false,
    external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'] });
  const require = createRequire(import.meta.url), react = require('react'), hooks: any[] = [], effects: any[] = [];
  let cursor = 0, poll = () => {};
  const module = { exports: {} as any };
  const effect = (fn: any, deps: any[]) => {
    const i = cursor++, old = effects[i];
    if (!old || deps?.some((value, index) => value !== old.deps?.[index])) effects[i] = { fn, deps, cleanup: old?.cleanup, pending: true };
  };
  runInNewContext(output.outputFiles[0]!.text, { module, exports: module.exports, AbortController, Error, TextEncoder, structuredClone, crypto,
    setTimeout, clearTimeout, setInterval(fn: () => void) { poll = fn; return 1; }, clearInterval() {},
    requestAnimationFrame(fn: () => void) { fn(); }, document: { activeElement: null },
    require(id: string) { return id !== 'react' ? require(id) : { ...react,
      useId: () => 'audit', useEffect: effect, useLayoutEffect: effect, useCallback: (fn: any) => fn,
      useSyncExternalStore: (_fn: any, read: any) => read(),
      useRef(value: any) { return hooks[cursor++] ??= { current: value }; },
      useState(initial: any) { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
        return [hooks[i], (value: any) => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }]; },
    }; },
  });
  return { props,
    invoke(...args: any[]) { cursor = 0; return module.exports[name](...args); },
    render() { cursor = 0; return nodes(module.exports[name](props)); },
    commit() { for (const e of effects) if (e?.pending) { e.pending = false; e.cleanup?.(); e.cleanup = e.fn(); } },
    unmount() { for (const e of effects) { e?.cleanup?.(); if (e) e.cleanup = undefined; } }, poll() { poll(); },
  };
}

test('A18：通知和轮询同范围乱序，旧成功与旧失败均不能覆盖最新模块统计', async () => {
  const requests: any[] = [];
  let notify = () => {};
  const api = { call(command: any) { return new Promise((resolve, reject) => requests.push({ command, resolve, reject })); },
    subscribe(fn: () => void) { notify = fn; return () => {}; } };
  const enabled = { skills: true, mcp: true, rss: true };
  const h = await mount('src/client/extension-summary.ts', 'useExtensionSummaries', {});
  h.invoke(api, enabled, 7); h.commit(); notify(); h.poll();
  for (const request of requests.slice(6)) request.resolve({ count: 2, detail: '', errors: 0 });
  await flush();
  for (const request of requests.slice(0, 3)) request.resolve({ count: 99, detail: '', errors: 0 });
  for (const request of requests.slice(3, 6)) request.reject(new Error('旧错误'));
  await flush();
  const state = h.invoke(api, enabled, 7);
  for (const key of ['skills', 'mcp', 'rss']) assert.equal(state[key].value?.count, 2);
  h.unmount();
});

for (const action of ['edit', 'cancel', 'unmount', 'restore', 'double-submit']) {
  test(`A03：预保存等待期间 ${action} 不允许旧设置迟到写入`, async () => {
    const snapshot = { revision: 1, preferences: initialState().preferences, projects: [] } as unknown as Snapshot;
    let finish!: (value: any) => void, closes = 0;
    const writes: any[] = [];
    const h = await mount('src/client/Settings.tsx', 'Settings', { snapshot, busy: false, preview() {}, pickDirectory: async () => null,
      onClose() { closes++; }, save: async (command: any) => { writes.push(command); return true; },
      call(command: any) { if (command.op === 'rules-save') return new Promise(resolve => { finish = resolve; });
        if (command.op === 'snapshot') return Promise.resolve(snapshot); return Promise.resolve({}); },
    });
    h.render(); h.commit();
    const rules = () => h.render().find(n => n.type?.name === 'ProjectRulesSettings' && n.props.scope === 'global')!;
    rules().props.onChange({ ...snapshot.preferences.rules, global: { ...snapshot.preferences.rules.global, content: 'changed' } });
    const submit = () => h.render().find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} });
    submit();
    assert.equal(typeof finish, 'function');
    if (action === 'edit') h.render().find(n => n.props?.['aria-label'] === '启动打开首页')!.props.onChange({ target: { checked: true } });
    if (action === 'cancel') h.render().find(n => n.type === 'button' && n.props.children === '取消')!.props.onClick();
    if (action === 'unmount') h.unmount();
    if (action === 'restore') h.render().find(n => n.type?.name === 'BackupSettings')!.props.onRestoreBusyChange(true);
    if (action === 'double-submit') submit();
    finish({ ...snapshot.preferences.rules, global: { ...snapshot.preferences.rules.global, content: 'changed' } });
    await flush();
    assert.equal(writes.length, action === 'double-submit' ? 1 : 0);
    assert.equal(closes, action === 'cancel' || action === 'double-submit' ? 1 : 0);
    h.unmount();
  });
}

test('A19：原生已准备草稿在另一窗口归档后，实际发送重新校验且不调用shell.submit', async () => {
  let archived = false, sent = 0, phase = 'plain', draft = '任务', bridge: any;
  const listeners = new Set<() => void>();
  const source = (value: any) => ({ getSnapshot: () => value, subscribe: () => () => {} });
  const shell = {
    state: { getSnapshot: () => ({ phase, draft, attachmentIds: [] }), subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); } },
    draftSnapshot: { text: '任务', references: [] }, notices: source(null), setDraft() {},
    bindDraftPersistence: () => () => {}, bindFilePicker: () => () => {},
    submit() { sent++; phase = 'sending'; for (const fn of listeners) fn(); phase = 'plain'; draft = ''; for (const fn of listeners) fn(); },
  };
  const ctx = { sessions: {
    create: async () => 's', retain: () => ({ sessionId: 's', ready: Promise.resolve(),
      binding: { ctx: {}, session: source({ blank: false }) }, release() {} }),
  }, get: () => ({ sessionOf: () => ({ toggleSource() {}, arbitrate() { return 'pass'; } }) }),
    conversation: { input: { for: () => shell, requestDraftInitialization() {} }, fileUploads: source({}), resolveDraftAttachments: () => [] } };
  const access = { create: async () => 's', validate: async () => { if (archived) throw new Error('项目已归档'); } };
  const h = await mount('src/client/NativeComposer.tsx', 'ComposerMenu', {
    ctx, memory: new UiMemory(), workspaceId: 'w', preset: 'standard', disabled: false, access,
    onReady(value: any) { bridge = value; }, onState() {}, renderSlot() {}, SessionProvider() {},
  });
  h.render(); h.commit(); await flush();
  assert.ok(bridge);
  archived = true;
  await assert.rejects(bridge.submit(), /归档/);
  assert.equal(sent, 0);
  h.unmount();
});

for (const fault of ['success', 'not-started', 'upload', 'cancel-before-start', 'cancel-active', 'throw-active', 'unknown', 'release-failure', 'double-submit', 'subscribe-failure', 'state-failure', 'terminal-draft']) {
  test(`A19：原生提交保护 ${fault} 只在未启动或已知终态释放`, async () => {
    let phase = 'plain', draft = '任务', bridge: any, sent = 0, releases = 0, refs = 0, validations = 0;
    let finishValidation!: () => void;
    const listeners = new Set<() => void>();
    const notify = () => { for (const fn of [...listeners]) fn(); };
    const source = (value: any) => ({ getSnapshot: () => value, subscribe: () => () => {} });
    const shell = {
      state: { getSnapshot: () => {
        if (fault === 'state-failure' && phase === 'sending') throw new Error('状态未知');
        return { phase, draft, attachmentIds: fault === 'upload' ? ['file'] : [] };
      }, subscribe(fn: () => void) {
        if (fault === 'subscribe-failure' && listeners.size) throw new Error('订阅失败');
        listeners.add(fn); return () => listeners.delete(fn);
      } },
      draftSnapshot: { text: '任务', references: [] }, notices: source(null), setDraft() {},
      bindDraftPersistence: () => () => {}, bindFilePicker: () => () => {},
      submit() {
        sent++;
        if (fault === 'not-started') return;
        phase = fault === 'unknown' ? 'unknown' : 'sending'; notify();
        if (fault === 'throw-active') throw new Error('宿主抛错但已开始');
        if (['success', 'release-failure', 'terminal-draft'].includes(fault)) {
          phase = 'plain'; if (fault !== 'terminal-draft') draft = ''; notify();
        }
      },
    };
    const ctx = { sessions: { retain: () => {
      refs++;
      return { sessionId: 's', ready: Promise.resolve(), binding: { ctx: {}, session: source({ blank: false }) }, release() { refs--; } };
    } }, get: () => ({ sessionOf: () => ({ toggleSource() {}, arbitrate() { return 'pass'; } }) }),
      conversation: { input: { for: () => shell, requestDraftInitialization() {} },
        fileUploads: source(fault === 'upload' ? { file: { status: 'uploading' } } : {}),
        resolveDraftAttachments: () => [] } };
    const access = { create: async () => 's', validate: async () => {
      validations++;
      if (fault === 'cancel-before-start' || fault === 'double-submit')
        await new Promise<void>(resolve => { finishValidation = resolve; });
      return 'guard';
    }, release: async (token: string) => {
      assert.equal(token, 'guard'); releases++;
      if (fault === 'release-failure') throw new Error('释放失败');
    } };
    const h = await mount('src/client/NativeComposer.tsx', 'ComposerMenu', {
      ctx, memory: new UiMemory(), workspaceId: 'w', preset: 'standard', disabled: false, access,
      onReady(value: any) { bridge = value; }, onState() {}, renderSlot() {}, SessionProvider() {},
    });
    h.render(); h.commit(); await flush();
    const current = bridge;
    const outcome = current.submit().then(() => 'ok', (e: Error) => e.message);
    if (fault === 'double-submit') {
      const duplicate = current.submit().then(() => 'ok', (e: Error) => e.message);
      await flush();
      assert.equal(validations, 1);
      assert.match(await duplicate, /正在提交/); finishValidation();
    }
    if (fault === 'cancel-before-start') { h.unmount(); finishValidation(); }
    await flush();
    if (['cancel-active', 'unknown'].includes(fault)) h.unmount();
    if (['cancel-active', 'throw-active', 'unknown', 'state-failure'].includes(fault)) {
      await outcome;
      assert.equal(releases, 0, '活动或未知状态取消／抛错不能释放保护');
      assert.ok(listeners.size > 0, '取消后仍订阅宿主终态');
      assert.ok(refs > 0, '终态订阅必须保留会话引用');
      phase = 'claimed'; draft = ''; notify(); await flush();
      assert.equal(releases, 1);
    } else if (fault === 'double-submit') {
      phase = 'plain'; draft = ''; notify(); await outcome;
      assert.equal(releases, 1);
    } else {
      const result = await outcome;
      assert.equal(releases, 1);
      assert.equal(sent, ['upload', 'cancel-before-start', 'subscribe-failure'].includes(fault) ? 0 : 1);
      if (fault === 'release-failure') assert.match(result, /释放失败/);
      if (fault === 'terminal-draft') assert.match(result, /提交未完成/);
    }
    h.unmount();
    assert.equal(refs, 0);
    assert.equal(listeners.size, 0);
  });
}

test('A03：预保存与恢复确认及备份偏好写入共用同步锁', async () => {
  const snapshot = { revision: 1, preferences: initialState().preferences, projects: [] } as unknown as Snapshot;
  let finish!: (value: any) => void;
  const calls: any[] = [];
  const h = await mount('src/client/Settings.tsx', 'Settings', { snapshot, busy: false, preview() {}, pickDirectory: async () => null,
    onClose() {}, save: async () => true, call(command: any) {
      calls.push(command);
      if (command.op === 'rules-save') return new Promise(resolve => { finish = resolve; });
      return Promise.resolve(snapshot);
    } });
  h.render(); h.commit();
  h.render().find(n => n.type?.name === 'ProjectRulesSettings')!.props.onChange({
    ...snapshot.preferences.rules, global: { ...snapshot.preferences.rules.global, content: 'changed' },
  });
  h.render().find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} });
  const call = h.render().find(n => n.type?.name === 'BackupSettings')!.props.call;
  await assert.rejects(call({ op: 'restore-confirm', token: 't', mode: 'workbase' }), /正在处理/);
  await assert.rejects(call({ op: 'preferences', patch: { backup: snapshot.preferences.backup } }), /正在处理/);
  assert.deepEqual(calls.map(c => c.op), ['rules-save']);
  finish(snapshot.preferences.rules); await flush(); h.unmount();
});

test('A03：普通设置仅接续规则写入回执的revision，外部变化由CAS拒绝并保留草稿', async () => {
  for (const changed of [false, true]) {
    const snapshot = { revision: 1, preferences: initialState().preferences, projects: [] } as unknown as Snapshot;
    const latest = { ...snapshot, revision: changed ? 12 : 8, preferences: { ...snapshot.preferences,
      openOnStartup: changed ? !snapshot.preferences.openOnStartup : snapshot.preferences.openOnStartup } };
    const writes: any[] = [];
    let closed = 0;
    const h = await mount('src/client/Settings.tsx', 'Settings', { snapshot, busy: false, preview() {}, pickDirectory: async () => null,
      onClose() { closed++; }, save: async (command: any) => { writes.push(command); return command.expectedRevision === latest.revision; },
      call: async (command: any) => command.op === 'rules-save' ? { saved: true, revision: 8 } : latest });
    h.render(); h.commit();
    h.render().find(n => n.type?.name === 'ProjectRulesSettings')!.props.onChange({
      ...snapshot.preferences.rules, global: { ...snapshot.preferences.rules.global, content: 'changed' },
    });
    h.render().find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} }); await flush();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].expectedRevision, 8);
    assert.equal(closed, changed ? 0 : 1);
    h.unmount();
  }
});

test('A03：立即备份的偏好写入也传播本实例固定revision，不采纳外部新snapshot', async () => {
  const snapshot = { revision: 1, preferences: initialState().preferences, projects: [] } as unknown as Snapshot;
  const writes: any[] = [];
  const h = await mount('src/client/Settings.tsx', 'Settings', { snapshot, busy: false, preview() {}, pickDirectory: async () => null,
    onClose() {}, save: async () => true, call: async (command: any) => {
      if (command.op === 'snapshot') return { ...snapshot, revision: 9 };
      writes.push(command); return { saved: true, revision: 10 };
    } });
  h.render(); h.commit();
  await h.render().find(n => n.type?.name === 'BackupSettings')!.props.call({
    op: 'preferences', patch: { backup: { ...snapshot.preferences.backup, directory: '/backup' } },
  });
  assert.equal(writes[0].expectedRevision, 1);
  h.unmount();
});

test('A03：同偏好恢复交错不能借最新snapshot放行旧提交，规则请求也携带revision', async () => {
  const snapshot = { revision: 1, preferences: initialState().preferences, projects: [] } as unknown as Snapshot;
  let finish!: (value: any) => void, revision = 1, closed = 0;
  const commands: any[] = [], writes: any[] = [];
  const h = await mount('src/client/Settings.tsx', 'Settings', { snapshot, busy: false, preview() {}, pickDirectory: async () => null,
    onClose() { closed++; },
    save: async (command: any) => { writes.push(command); if (command.expectedRevision !== revision) return false; return true; },
    call(command: any) {
      commands.push(command);
      if (command.op === 'rules-save') return new Promise(resolve => { finish = resolve; });
      return Promise.resolve({ ...snapshot, revision, projects: [{ restored: true }] });
    },
  });
  h.render(); h.commit();
  h.render().find(n => n.type?.name === 'ProjectRulesSettings')!.props.onChange({
    ...snapshot.preferences.rules, global: { ...snapshot.preferences.rules.global, content: 'changed' },
  });
  h.render().find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} });
  assert.equal(commands[0].expectedRevision, 1);
  revision = 7; // 规则保存后另一窗口恢复了不同待办/绑定，普通偏好完全相同。
  finish({ saved: true, revision: 2 }); await flush();
  assert.equal(writes[0].expectedRevision, 2);
  assert.equal(closed, 0);
  h.unmount();
});
