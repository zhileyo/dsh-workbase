import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as native from '../src/client/NativeComposer.js';
import * as composer from '../src/client/Composer.js';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { UiMemory } from '../src/client/api.js';
import { initialState, emptyMark } from '../src/shared/model.js';

const file = (name: string, type = 'image/png', size = 2) => ({ name, type, size }) as File;
const limits = { mediaTypes: ['image/png'], maxImagesPerMessage: 2, maxImageBytes: 5, maxMessageImageBytes: 6 };
test('菜单切换effect清理保留旧引用，连续切换仅最后目标交接，卸载释放当前引用', async () => {
  const output = await build({ entryPoints: ['src/client/NativeComposer.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'] });
  const require = createRequire(import.meta.url), react = require('react');
  const hooks: any[] = [], pendingEffects: (() => void)[] = [];
  let cursor = 0;
  const module = { exports: {} as { ComposerMenu(props: any): any } };
  runInNewContext(output.outputFiles[0]!.text, {
    module, exports: module.exports, AbortController,
    require: (id: string) => id === 'react' ? { ...react, useLayoutEffect() {},
      useRef: (current: unknown) => { const i = cursor++; return hooks[i] ??= { current }; },
      useState: (initial: unknown) => { const i = cursor++; return [hooks[i] ??= initial, (value: unknown) => { hooks[i] = value; }]; },
      useEffect: (fn: () => any, deps: unknown[]) => {
        const i = cursor++, prev = hooks[i];
        if (!prev || deps.some((d, n) => d !== prev.deps[n])) {
          pendingEffects.push(() => { prev?.dispose?.(); hooks[i] = { deps, dispose: fn() }; });
        }
      },
    } : require(id),
  });
  const events: string[] = [];
  const store = (snapshot: () => any) => ({ getSnapshot: snapshot, subscribe: () => () => {} });
  const shells: Record<string, any> = {};
  const references: Record<string, any> = {};
  for (const id of ['a', 'b', 'c']) {
    const shell: any = { ids: id === 'a' ? ['image'] : [], draftSnapshot: { text: id === 'a' ? '正文' : '', references: [] },
      setDraft(doc: any) { this.draftSnapshot = doc; },
      addAttachments(ids: string[]) { this.ids.push(...ids); return true; },
      removeAttachment(value: string) { this.ids = this.ids.filter((v: string) => v !== value); return true; },
      notices: store(() => null), bindDraftPersistence: () => () => {}, bindFilePicker: () => () => {} };
    shell.state = store(() => ({ attachmentIds: shell.ids, draft: shell.draftSnapshot.text, phase: 'plain' }));
    shells[id] = shell;
    references[id] = { sessionId: id, ready: Promise.resolve(), binding: { ctx: { id }, session: { getSnapshot: () => ({ subagent: null }) } },
      release() { events.push(`release:${id}:${shell.ids.join(',')}`); } };
  }
  let readyB!: () => void;
  references.b.ready = new Promise<void>(resolve => { readyB = resolve; });
  const ctx = { sessions: { create: async ({ workspaceId }: any) => workspaceId, retain: (id: string) => references[id] },
    get: () => ({ sessionOf: () => ({}) }),
    conversation: { input: { for: ({ id }: any) => shells[id], requestDraftInitialization() {} },
      fileUploads: store(() => ({ image: { status: 'uploading' } })),
      resolveDraftAttachments: (ids: string[]) => ids.map(id => ({ id, file: file('图片') })),
      rebindDraftFiles(id: string) { events.push(`rebind:${id}`); } } };
  const memory = new UiMemory();
  let bridge: any;
  const render = (workspaceId: string) => {
    cursor = 0;
    module.exports.ComposerMenu({ ctx, memory, workspaceId, preset: '', disabled: false, onReady: (v: any) => { bridge = v; },
      onState() {}, SessionProvider() {}, renderSlot() {} });
    pendingEffects.splice(0).forEach(effect => effect());
  };
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  render('a'); await settle(); assert.equal(bridge.sessionId, 'a');
  render('b'); await settle();
  assert.equal(events.some(e => e.startsWith('release:a')), false, '切换清理不能取消旧附件');
  assert.equal(bridge, null);
  render('c'); readyB(); await settle();
  assert.equal((bridge as any).sessionId, 'c');
  assert.deepEqual(shells.c.ids, ['image']);
  assert.deepEqual(shells.b.ids, []);
  assert.deepEqual(events.filter(e => e.startsWith('rebind:')), ['rebind:c']);
  assert.ok(events.includes('release:a:'));
  hooks.forEach(h => h?.dispose?.());
  assert.equal(events.filter(e => e.startsWith('release:c:')).length, 1);
});

const validate = () => {
  const fn = (native as unknown as { composerFileRejection?: (
    files: readonly File[], attachments: readonly { kind: string; file: File }[], policy?: typeof limits
  ) => string | null }).composerFileRejection;
  assert.equal(typeof fn, 'function');
  return fn!;
};
test('文件批次按宿主图片限制拒绝超数量、单张和总大小，普通文件不占图片额度', () => {
  const check = validate();
  const existing = [{ kind: 'image', file: file('已有') }];
  assert.match(check([file('a'), file('b')], existing, limits)!, /2/);
  assert.match(check([file('a', 'image/png', 6)], [], limits)!, /单张/);
  assert.match(check([file('a', 'image/png', 5)], existing, limits)!, /总大小/);
  assert.equal(check([file('a'), file('b.txt', 'text/plain', 100)], existing, limits), null);
  assert.equal(check([file('a')], [], undefined), null);
});

test('原生桥委托官方文件入口，校验拒绝不分配附件，上传失败阻止提交并可重试，卸载后失效', async () => {
  const output = await build({ entryPoints: ['src/client/NativeComposer.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'] });
  const require = createRequire(import.meta.url), react = require('react');
  const effects: (() => (() => void) | void)[] = [], changes: unknown[] = [], calls: unknown[] = [];
  const states: unknown[] = [], listeners: (() => void)[] = [];
  let cursor = 0;
  const module = { exports: {} as { ComposerMenu(props: any): any } };
  runInNewContext(output.outputFiles[0]!.text, {
    module, exports: module.exports, AbortController,
    require: (id: string) => id === 'react' ? { ...react,
      useEffect: (fn: () => void) => effects.push(fn), useLayoutEffect() {},
      useRef: (current: unknown) => ({ current }),
      useState: (initial: unknown) => {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (next: unknown) => { states[index] = next; changes.push(next); }];
      },
    } : require(id),
  });
  let phase = 'plain', permission = true, attachments: string[] = [], disabled = false, upload: any;
  let bridge: any, releases = 0, subscriptions = 0;
  const store = (getSnapshot: () => any) => ({ getSnapshot, subscribe: (listener: () => void) => {
    subscriptions++; listeners.push(listener); return () => { subscriptions--; };
  } });
  const shell = { draftSnapshot: { text: '草稿', references: [] }, setDraft() {},
    state: store(() => ({ draft: '草稿', attachmentIds: attachments, phase })),
    notices: store(() => null), bindDraftPersistence: () => () => {}, bindFilePicker: () => () => {} };
  const ctx = {
    sessions: { create: async () => 's', retain: () => ({ sessionId: 's', ready: Promise.resolve(),
      binding: { ctx: {}, session: { projections: { faceOf: () => ({ getSnapshot: () => limits }) } } }, release() { releases++; } }) },
    get: (name: string) => name === 'remoteAccess' ? { source: () => ({ getSnapshot: () => permission }) }
      : { sessionOf: () => ({ toggleSource() {}, arbitrate: () => 'pass' }) },
    slots: { entriesOfSlot: (name: string) => {
      assert.equal(name, 'conversation.composer.bar');
      return [{ inject: (id: string) => {
        assert.equal(id, 's');
        return { addFiles: (...args: unknown[]) => { calls.push(args); return null; } };
      } }];
    } },
    conversation: { input: { for: () => shell, requestDraftInitialization() {} },
      fileUploads: store(() => ({ a: upload })),
      resolveDraftAttachments: () => attachments.map(id => ({ id, kind: 'image', file: file('已有') })),
      retryFileUpload: (...args: unknown[]) => calls.push(args),
    },
  };
  const props = { ctx, memory: new UiMemory(), workspaceId: 'w', preset: 'standard', get disabled() { return disabled; },
    onReady: (value: any) => { if (value) bridge = value; }, onState() {}, SessionProvider() {}, renderSlot() {} };
  const tree = module.exports.ComposerMenu(props);
  const disposers = effects.map(effect => effect());
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.ok(bridge);
  const folder = file('folder', ''), directories = new Set([folder]);
  assert.equal(bridge.addFiles([folder], directories), null);
  assert.equal((calls[0] as any[])[0][0], folder);
  assert.equal((calls[0] as any[])[1], directories);
  attachments = ['a'];
  assert.match(bridge.addFiles([file('a'), file('b')]), /最多/);
  permission = false;
  assert.match(bridge.addFiles([file('a')]), /权限/);
  permission = true; phase = 'sending';
  assert.match(bridge.addFiles([file('a')]), /正在提交/);
  assert.equal(calls.length, 1);
  phase = 'plain'; upload = { status: 'uploading' };
  await assert.rejects(bridge.submit(), /仍在上传/);
  upload = { status: 'error', message: '网络失败' };
  await assert.rejects(bridge.submit(), /网络失败/);
  const input = tree.props.children.find((node: any) => node?.type === 'input');
  const target = { files: [file('a')], value: 'selected' };
  input.props.onChange({ target });
  assert.equal(target.value, '');
  assert.equal(calls.length, 2, '文件选择器也经过同一官方入口');
  listeners.forEach(listener => listener());
  cursor = 0;
  const failedTree = module.exports.ComposerMenu(props);
  const findRetry = (node: any): any => {
    if (!node || typeof node !== 'object') return undefined;
    if (node.type === 'button' && node.props.children === '重试上传') return node;
    return (Array.isArray(node) ? node : [node.props?.children]).flat().map(findRetry).find(Boolean);
  };
  const retry = findRetry(failedTree);
  assert.ok(retry, '上传失败时提供单附件重试');
  retry.props.onClick();
  assert.equal((calls[2] as any[])[0], 's');
  assert.equal((calls[2] as any[])[1], 'a');
  disposers.forEach(dispose => dispose?.());
  assert.equal(subscriptions, 0);
  assert.equal(releases, 1);
  assert.match(bridge.addFiles([file('a')]), /会话已切换/);
});
test('剪贴板和拖入保留文件顺序、目录身份，items缺失时使用files且不重复', () => {
  const read = (composer as unknown as { composerTransferFiles?: (data: DataTransfer) => {
    files: File[]; directories: Set<File>;
  } }).composerTransferFiles;
  assert.equal(typeof read, 'function');
  const a = file('a'), directory = file('folder', '');
  const data = { items: [
    { kind: 'string' },
    { kind: 'file', getAsFile: () => a },
    { kind: 'file', getAsFile: () => directory, webkitGetAsEntry: () => ({ isDirectory: true }) },
    { kind: 'file', getAsFile: () => null },
  ], files: [a, directory] } as unknown as DataTransfer;
  const result = read!(data);
  assert.deepEqual(result.files, [a, directory]);
  assert.deepEqual([...result.directories], [directory]);
  assert.deepEqual(read!({ items: [], files: [a] } as unknown as DataTransfer).files, [a]);
});

test('输入卡真实事件回调接入导入桥：普通粘贴放行，混合粘贴保留文字，拖入禁止打开文件', async () => {
  const output = await build({ entryPoints: ['src/client/Composer.tsx'], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', write: false, external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'] });
  const require = createRequire(import.meta.url), react = require('react');
  const module = { exports: {} as { Composer(props: any): any } };
  runInNewContext(output.outputFiles[0]!.text, {
    module, exports: module.exports,
    require: (id: string) => id === 'react' ? { ...react,
      useId: () => 'composer-error', useEffect() {}, useLayoutEffect() {}, useCallback: (fn: unknown) => fn,
      useRef: (current: unknown) => ({ current }),
      useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, () => {}],
    } : require(id),
  });
  for (const blocked of [false, true]) {
    const memory = new UiMemory(); memory.composer.preset = 'standard';
    if (blocked) memory.composer.pending = { projectId: 'p', sessionId: 's', provider: 'p', model: 'm', text: 'x', requestId: 'r' };
    const calls: unknown[] = [];
    const api = { renderComposerMenu: (props: any) => {
      props.onReady({ change: (text: string) => calls.push(text), addFiles: (...args: unknown[]) => { calls.push(args); return null; } });
      return null;
    } };
    const tree = module.exports.Composer({ api, memory, snapshot: { preferences: initialState().preferences,
      projects: [{ projectId: 'p', workspaceId: 'w', title: 'p', available: true, archived: false, mark: emptyMark() }] } });
    const body = tree.props.children[0], textarea = body.props.children[0];
    assert.equal(typeof textarea.props.onPaste, 'function');
    assert.equal(typeof body.props.onDrop, 'function');
    let prevented = 0;
    const target = { value: '前后', selectionStart: 1, selectionEnd: 1 };
    const data = (files: File[], text: string) => ({ items: [], files, types: files.length ? ['Files'] : ['text/plain'], getData: () => text });
    textarea.props.onPaste({ clipboardData: data([], '普通文字'), currentTarget: target, preventDefault() { prevented++; } });
    assert.equal(prevented, 0);
    const image = file('粘贴图片');
    textarea.props.onPaste({ clipboardData: data([image], '粘贴文字'), currentTarget: target, preventDefault() { prevented++; } });
    assert.equal(prevented, 1);
    if (!blocked) {
      assert.equal(calls[0], '前粘贴文字后');
      assert.equal((calls[1] as any[])[0][0], image);
    } else assert.equal(calls.length, 0);
    body.props.onDrop({ dataTransfer: data([image], ''), preventDefault() { prevented++; } });
    assert.equal(prevented, 2);
    assert.equal(calls.length, blocked ? 0 : 3);
    body.props.onDrop({ dataTransfer: data([], '拖入文字'), preventDefault() { prevented++; } });
    assert.equal(prevented, 2, '纯文字拖入保留原生行为');
    body.props.onDragOver({ dataTransfer: data([image], ''), preventDefault() { prevented++; } });
    assert.equal(prevented, 3);
    body.props.onDragLeave({ currentTarget: { contains: () => false }, relatedTarget: null });
  }
});
