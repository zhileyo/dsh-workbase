import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectSidebarController } from '../src/client/project-sidebar.js';
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';

const require = createRequire(import.meta.url);
async function load(effects: (() => void)[] = [], buttons: any[] = []) {
  const result = await build({ entryPoints: ['src/client/ProjectSidebar.tsx'], bundle: true, platform: 'node',
    format: 'cjs', jsx: 'automatic', write: false, external: ['react', 'react/jsx-runtime', '@deepseek-ai/*'] });
  const module = { exports: {} as any };
  runInNewContext(result.outputFiles[0]!.text, { module, exports: module.exports,
    require: (name: string) => name === '@deepseek-ai/dsh-client-ui-primitives' ? {
      Button: ({ size: _size, ...props }: any) => { buttons.push(props); return createElement('button', props); },
      Tooltip: ({ children }: any) => children,
      IconPanelLeftOutlineRegular: () => createElement('svg'),
    }
      : name === 'react' ? { ...require(name), useLayoutEffect: (effect: () => void) => { effects.push(effect); } } : require(name) });
  return module.exports;
}
function observable<T>(value: T) {
  const listeners = new Set<() => void>();
  return { getSnapshot: () => value, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    set(next: T) { value = next; for (const fn of [...listeners]) fn(); } };
}

test('正式接线复用官方Root和ExpandButton，所有Tab共享目录会话及原Store，不改变全局面板', async () => {
  const effects: (() => void)[] = [];
  const { installProjectSidebar } = await load(effects);
  const panel = observable<string | null>('dsh-workbase'), mounted = observable<string | undefined>('native');
  const nativeReference = { sessionId: 'native' };
  const nativeViews = observable([{ sessionId: 'native', reference: nativeReference, selected: true, retainTab() {} }]);
  let renderedPanel: string | null | undefined;
  let renderedViews: any[] = [];
  const OfficialRoot = (props: any) => {
    renderedPanel = props.usePanelInfo((value: any) => value.activePanelId);
    renderedViews = props.useViews((value: any) => value);
    return createElement('aside', { 'data-official-root': true });
  };
  const OfficialExpand = () => createElement('button', { 'data-sidebar-right-expand': true }, 'official');
  const store = {};
  const root = { options: {}, children: { 'rightbar.session': { kind: 'single', scope: 'session' } },
    component: OfficialRoot, inject: () => ({ hooks: { views: nativeViews }, mountView() { return () => {}; } }) };
  const seat = { options: {}, store, locale: 'sidebarRight', component() {}, inject() {} };
  const corner = { options: {}, store, locale: 'sidebarRight', component: OfficialExpand,
    inject: (id: string) => ({ identity: id, hooks: { shortcuts: observable([]) } }) };
  // 使用官方声明账本，复现真实宿主拒绝重复children声明的行为。
  const core = new SlotCore();
  const register = core.register.bind(core) as (options: any, component: any) => () => void;
  const removeFrame = register({ name: 'root', children: {
    rightbar: { kind: 'single', scope: 'root' },
    'conversation.session.header.corner': { kind: 'single', scope: 'session' },
    'workbase.sidebar-expand': { kind: 'single', scope: 'session' },
  } }, () => null);
  const removeRoot = register({ name: 'rightbar', ...root }, root.component);
  const removeSeat = register({ name: 'rightbar.session', ...seat }, seat.component);
  const removeCorner = register({ name: 'conversation.session.header.corner', ...corner }, corner.component);
  const originalRoot = core.entries('rightbar')[0]!;
  const originalSeat = core.entries('rightbar.session')[0]!;
  const originalCorner = core.entries('conversation.session.header.corner')[0]!;
  const slots = {
    entries: core.entries.bind(core),
    subscribe: core.subscribe.bind(core),
    inject(_name: string, callback: () => () => void) { return callback(); },
    register,
  };
  const controller = new ProjectSidebarController({
    panel, candidates: () => ['project-session'], subscribeCandidates: () => () => {},
    retain(id) { return { sessionId: id, binding: { ctx: {} }, ready: Promise.resolve(), release() {} } as any; },
    async directory(_ref, project) { return { workspaceId: project.workspaceId, path: project.path, workingDirectory: project.path }; },
    closeRightbar() {},
  });
  const read = mounted.getSnapshot;
  const rootVersion = core.getVersion('rightbar');
  const remove = installProjectSidebar(slots, controller, mounted);
  assert.equal(controller.getSnapshot().available, true, '真实插槽账本下入口可用');
  assert.ok(core.getVersion('rightbar') > rootVersion, '官方生命周期通知已经挂载的renderer重读Root');
  assert.equal((originalRoot.inject!().hooks as any).views, nativeViews);
  assert.equal(originalRoot.children, root.children);
  controller.select({ projectId: 'p', workspaceId: 'w', path: '/project', available: true });
  assert.equal(controller.commandTarget.getSnapshot(), undefined);
  controller.open();
  for (let n = 0; n < 8; n++) await Promise.resolve();
  const adaptedRoot = core.entries('rightbar')[0]!;
  const adaptedCorner = core.entries('workbase.sidebar-expand')[0]!;
  assert.ok(adaptedRoot);
  assert.equal(adaptedRoot, originalRoot, '保留官方声明所有者及子插槽授权');
  assert.equal(adaptedRoot.children, root.children);
  assert.equal(adaptedCorner.store, store);
  assert.equal(adaptedCorner.locale, 'sidebarRight');
  assert.equal(adaptedCorner.inject!('project-session' as never).identity, 'project-session');
  assert.equal(mounted.getSnapshot(), 'project-session');
  const rootProps = { ...adaptedRoot.inject!(),
    useViews: (selector: any) => selector(nativeViews.getSnapshot()),
    usePanelInfo: (selector: any) => selector({ activePanelId: panel.getSnapshot() }) };
  renderToStaticMarkup(createElement(adaptedRoot.component as any, rootProps));
  assert.deepEqual(Array.from(renderedViews, (view: any) => [view.sessionId, view.selected]),
    [['native', false], ['project-session', true]]);
  assert.equal(renderedPanel, null, '仅官方右栏Root看到项目作为前台，会话栏以外的宿主保持真实面板');
  assert.equal(panel.getSnapshot(), 'dsh-workbase');
  const expanded: unknown[] = [];
  assert.match(renderToStaticMarkup(createElement(adaptedCorner.component as any, {
    sessionId: 'project-session', actions: { setExpanded: (...args: unknown[]) => { expanded.push(args); } },
  })), /data-sidebar-right-expand/);
  effects.forEach(effect => { effect(); effect(); });
  assert.deepEqual(expanded, [['project-session', true]], '首次点击直接展开，重复挂载效果不能再次将右栏收起');
  assert.equal(core.entries('rightbar.session')[0], originalSeat, '不复制或替换Tab席位及其业务注入');
  panel.set(null);
  assert.equal(mounted.getSnapshot(), 'native');
  renderToStaticMarkup(createElement(adaptedRoot.component as any, rootProps));
  assert.deepEqual(Array.from(renderedViews, (view: any) => [view.sessionId, view.selected]),
    [['native', true], ['project-session', false]]);
  remove();
  assert.equal(mounted.getSnapshot, read);
  assert.equal(core.entries('rightbar')[0], originalRoot);
  assert.equal(originalRoot.component, OfficialRoot);
  assert.equal(core.entries('conversation.session.header.corner')[0], originalCorner);
  assert.equal(core.entries('workbase.sidebar-expand').length, 0);
  Object.freeze(mounted);
  const frozenStop = installProjectSidebar(slots, controller, mounted);
  assert.equal(controller.getSnapshot().available, false, '不可写的宿主观察源安全撤下，不使插件启动失败');
  assert.equal(mounted.getSnapshot, read);
  assert.equal(core.entries('rightbar')[0], originalRoot);
  assert.equal(originalRoot.component, OfficialRoot);
  frozenStop(); controller.dispose();
  removeCorner(); removeSeat(); removeRoot(); removeFrame();
});

test('官方Store契约不匹配时不接管Root或前台源，不创建目录会话', async () => {
  const { installProjectSidebar } = await load();
  const mounted = observable<string | undefined>('native'), read = mounted.getSnapshot;
  const entries: any[] = [];
  let available = true;
  const controller = { setAvailable(value: boolean) { available = value; } };
  const slots = { inject(_name: string, callback: () => () => void) { return callback(); },
    entries: () => [], subscribe: () => () => {},
    register(options: any) { entries.push(options); return () => {}; } };
  const stop = installProjectSidebar(slots, controller, mounted);
  assert.equal(available, false);
  assert.equal(entries.length, 0);
  assert.equal(mounted.getSnapshot, read);
  stop();
});

test('无可用会话隐藏入口及分隔符，新增后显示，点击才加载，失败重试，删除后再次隐藏', async () => {
  const buttons: any[] = [], { ProjectSidebarHeader } = await load([], buttons);
  const panel = observable<string | null>('dsh-workbase');
  const candidates = observable<string[]>([]);
  let calls = 0, reject!: (error: Error) => void;
  const controller = new ProjectSidebarController({
    panel,
    candidates: () => candidates.getSnapshot(), subscribeCandidates: candidates.subscribe,
    retain(id) {
      calls++;
      return { sessionId: id, ready: calls === 1 ? new Promise((_resolve, no) => { reject = no; }) : Promise.resolve(),
        binding: {}, release() {} } as any;
    },
    async directory(_ref, project) { return { workspaceId: project.workspaceId, path: project.path, workingDirectory: project.path }; },
    closeRightbar() {},
  });
  controller.setAvailable(true);
  const props = {
    controller,
    SessionProvider: ({ session, children }: any) => createElement('div', { 'data-session': session.sessionId }, children),
    renderSlot: () => createElement('span', { 'data-official-entry': true }),
  };
  const render = () => renderToStaticMarkup(createElement(ProjectSidebarHeader, props));
  assert.equal(render(), '');
  controller.select({ projectId: 'p', workspaceId: 'w', path: '/p', available: true });
  assert.equal(render(), '', '没有可用会话时不显示按钮或分隔符');
  controller.open();
  assert.equal(calls, 0);
  candidates.set(['s']);
  assert.match(render(), /data-state="idle"/);
  assert.equal(calls, 0);
  assert.equal(buttons.at(-1).disabled, false);
  assert.equal(buttons.at(-1)['aria-label'], '打开项目右栏');
  buttons.at(-1).onClick(); buttons.at(-1).onClick();
  assert.equal(calls, 1);
  assert.match(render(), /data-state="loading"/);
  assert.equal(buttons.at(-1).disabled, true);
  assert.equal(buttons.at(-1)['aria-busy'], true);
  reject(new Error('连接失败'));
  for (let n = 0; n < 8; n++) await Promise.resolve();
  render();
  assert.equal(buttons.at(-1).disabled, false);
  assert.equal(buttons.at(-1)['aria-label'], '重试打开项目右栏');
  buttons.at(-1).onClick();
  for (let n = 0; n < 8; n++) await Promise.resolve();
  assert.equal(calls, 2);
  assert.match(render(), /data-session="s".*data-official-entry/);
  candidates.set([]);
  assert.equal(render(), '');
  assert.equal(controller.commandTarget.getSnapshot(), undefined);
  controller.dispose();
});
