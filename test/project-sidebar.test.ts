import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectSidebarController, bindSidebarTarget, officialProjectSidebarPort, type SidebarReference } from '../src/client/project-sidebar.js';

function observable<T>(value: T) {
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    set(next: T) { value = next; for (const fn of [...listeners]) fn(); },
    get listeners() { return listeners.size; },
  };
}
const project = (id: string) => ({ projectId: id, workspaceId: `w-${id}`, path: `/projects/${id}`, available: true });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const panel = observable<string | null>('dsh-workbase');
  // 记录引用取得，测试port不再提供任何创建或connectWorkspace方法。
  const creates: string[] = [];
  const releases: string[] = [];
  const waits = new Map<string, ReturnType<typeof deferred<string>>>();
  const refs = new Map<string, SidebarReference>();
  let closeCount = 0, directoryMismatch = false;
  const controller = new ProjectSidebarController({
    panel,
    candidates: p => [`s-${p.workspaceId}`],
    subscribeCandidates: () => () => {},
    retain(sessionId) {
      const workspaceId = sessionId.slice(2);
      creates.push(workspaceId);
      const reference = { sessionId, binding: { ctx: {} }, ready: waits.get(workspaceId)?.promise ?? Promise.resolve(),
        release: () => { releases.push(sessionId); } } as unknown as SidebarReference;
      refs.set(sessionId, reference);
      return reference;
    },
    async directory(_reference, p) {
      return { workspaceId: p.workspaceId, path: directoryMismatch ? '/other-project' : p.path, workingDirectory: p.path };
    },
    closeRightbar() { closeCount++; },
  });
  controller.setAvailable(true);
  return { controller, panel, creates, releases, waits, refs,
    mismatch() { directoryMismatch = true; }, get closeCount() { return closeCount; } };
}
const flush = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };

test('没有可用会话不持有引用，新增后可用，点击只复用最近会话，重进优先上次目标', async () => {
  const choices = observable(['recent', 'older']), panel = observable<string | null>('dsh-workbase');
  const retained: string[] = [], released: string[] = [];
  const controller = new ProjectSidebarController({
    panel, candidates: () => choices.getSnapshot(), subscribeCandidates: choices.subscribe,
    retain(id: string) {
      retained.push(id);
      return { sessionId: id, ready: Promise.resolve(), binding: {},
        release() { released.push(id); } } as any;
    },
    async directory(_ref: unknown, p: ReturnType<typeof project>) {
      return { workspaceId: p.workspaceId, path: p.path, workingDirectory: p.path };
    },
    closeRightbar() {},
  } as any);
  controller.setAvailable(true);
  choices.set([]); controller.select(project('a')); controller.open(); await flush();
  assert.deepEqual(retained, []);
  assert.deepEqual(controller.getSnapshot().candidates, []);
  choices.set(['recent', 'older']);
  assert.deepEqual(controller.getSnapshot().candidates, ['recent', 'older']);
  assert.deepEqual(retained, [], '只查看详情不持有会话引用');
  controller.open(); controller.open(); await flush();
  assert.deepEqual(retained, ['recent']);
  controller.select(null);
  choices.set(['newest', 'older', 'recent']);
  controller.select(project('a')); controller.open(); await flush();
  assert.equal(controller.commandTarget.getSnapshot(), 'recent', '上次成功目标优先于最新会话');
  choices.set(['newest', 'older']);
  assert.equal(controller.commandTarget.getSnapshot(), undefined, '旧目标删除后不自动切换会话');
  assert.equal(controller.getSnapshot().pending, false);
  controller.open(); await flush();
  assert.equal(controller.commandTarget.getSnapshot(), 'newest');
  assert.deepEqual(released, ['recent', 'recent']);
  controller.dispose();
  assert.equal(choices.listeners + panel.listeners, 0);
});

test('官方候选只接受宿主列表中的未归档项目成员且有效目录匹配，按最近活动排序', () => {
  const p = project('a');
  const list = observable({ ids: ['older', 'recent', 'archived', 'worktree', 'foreign', 'child'],
    byId: Object.fromEntries(['older', 'recent', 'archived', 'worktree', 'foreign', 'child', 'retained-only']
      .map((id, index) => [id, { id, cwd: p.path, updatedAt: index,
        ...(id === 'child' ? { parentId: 'parent', origin: 'subagent' } : {}) }])),
    projectionsBySession: Object.fromEntries(['older', 'recent', 'archived', 'worktree', 'foreign', 'child', 'retained-only']
      .map(id => [id, { values: { workingDirectory: id === 'worktree' ? '/worktree' : p.path }, state: 'ready' }])) });
  const workspaces = observable({ items: [{ workspaceId: p.workspaceId, path: p.path,
    sessionIds: ['older', 'recent', 'archived', 'worktree', 'child', 'retained-only'] }], archivedSessionIds: ['archived'] });
  const port = officialProjectSidebarPort({
    layout: { panelInfo: observable({ activePanelId: 'dsh-workbase' }), closeRightbar() {} },
    workspaces: { list: workspaces },
    sessions: { list, retain() { throw new Error('不应打开会话'); }, async refreshProjections() {} },
  } as any)!;
  assert.ok(port, '不依赖可创建会话的uiWorkspace服务');
  assert.deepEqual(port.candidates(p), ['recent', 'older']);
  workspaces.set({ ...workspaces.getSnapshot(), archivedSessionIds: ['archived', 'recent', 'older'] });
  assert.deepEqual(port.candidates(p), []);
});

test('会话加载中被归档或删除立即取消，迟到引用释放；新候选出现后仍等待点击', async () => {
  const choices = observable(['a']), waiting = deferred<void>(), panel = observable<string | null>('dsh-workbase');
  const retained: string[] = [], released: string[] = [];
  let closes = 0;
  const controller = new ProjectSidebarController({
    panel, candidates: () => choices.getSnapshot(), subscribeCandidates: choices.subscribe,
    retain(id) {
      retained.push(id);
      return { sessionId: id, ready: id === 'a' ? waiting.promise : Promise.resolve(),
        binding: {}, release() { released.push(id); } } as any;
    },
    async directory(_ref, p) { return { workspaceId: p.workspaceId, path: p.path, workingDirectory: p.path }; },
    closeRightbar() { closes++; },
  });
  controller.setAvailable(true); controller.select(project('a')); controller.open();
  assert.equal(controller.getSnapshot().pending, true);
  choices.set([]);
  assert.equal(controller.getSnapshot().pending, false);
  assert.equal(controller.commandTarget.getSnapshot(), undefined);
  choices.set(['b']);
  waiting.resolve(); await flush();
  assert.deepEqual(retained, ['a']);
  assert.deepEqual(released, ['a']);
  assert.equal(controller.commandTarget.getSnapshot(), undefined);
  controller.open(); await flush();
  assert.equal(controller.commandTarget.getSnapshot(), 'b');
  assert.equal(closes, 1);
  controller.dispose();
});

test('有效目录变更撤下目标并保留后台Tab资源，最后一个可用会话归档后候选清空', async () => {
  const p = project('a'), choices = observable(['s']), panel = observable<string | null>('dsh-workbase');
  const projection = observable(p.path);
  let released = 0, closed = 0;
  const controller = new ProjectSidebarController({
    panel, candidates: () => projection.getSnapshot() === p.path ? choices.getSnapshot() : [],
    subscribeCandidates(listener) {
      const sessions = choices.subscribe(listener), directory = projection.subscribe(listener);
      return () => { sessions(); directory(); };
    },
    retain(id) { return { sessionId: id, ready: Promise.resolve(), binding: {}, release() { released++; } } as any; },
    async directory() { return { workspaceId: p.workspaceId, path: p.path, workingDirectory: projection.getSnapshot() }; },
    closeRightbar() { closed++; },
  });
  controller.setAvailable(true); controller.select(p); controller.open(); await flush();
  const view = controller.getSnapshot().views[0]!, tab = new AbortController();
  const unmount = view.mount(); view.retainTab('terminal', tab.signal);
  projection.set('/worktree');
  assert.equal(controller.commandTarget.getSnapshot(), undefined);
  assert.deepEqual(controller.getSnapshot().candidates, []);
  assert.equal(released, 0, '后台终端继续持有原会话资源');
  unmount(); tab.abort();
  assert.equal(released, 1);
  projection.set(p.path);
  assert.deepEqual(controller.getSnapshot().candidates, ['s']);
  assert.equal(controller.commandTarget.getSnapshot(), undefined, '目录恢复只显示入口，不自动打开');
  choices.set([]);
  assert.deepEqual(controller.getSnapshot().candidates, []);
  assert.equal(closed, 1);
  controller.dispose();
});

test('未知目录只读检查合并，迁移必需或失败投影不可用，不打开或创建会话', async () => {
  const p = project('a'), wait = deferred<void>();
  const ids = ['unknown', 'migration', 'failed'];
  const list = observable({ ids, byId: Object.fromEntries(ids.map(id => [id, { id, cwd: p.path, updatedAt: 1 }])),
    projectionsBySession: {
      unknown: { state: 'idle', values: {} },
      migration: { state: 'migration-required', values: { workingDirectory: p.path } },
      failed: { state: 'error', values: { workingDirectory: p.path } },
    } });
  const workspaces = observable({ items: [{ workspaceId: p.workspaceId, path: p.path, sessionIds: ids }], archivedSessionIds: [] });
  const reads: string[] = [];
  const port = officialProjectSidebarPort({
    layout: { panelInfo: observable({ activePanelId: 'dsh-workbase' }), closeRightbar() {} },
    workspaces: { list: workspaces },
    sessions: { list, retain() { throw new Error('禁止持有会话'); },
      async refreshProjections(id: string) { reads.push(id); await wait.promise; } },
  } as any)!;
  assert.deepEqual(port.candidates(p), []);
  port.refreshCandidates!(p); port.refreshCandidates!(p); await flush();
  assert.deepEqual(reads, ['unknown']);
  wait.resolve(); await flush();
  assert.deepEqual(port.candidates(p), []);
});

test('进入详情及刷新不连接会话，点击后才持有目录目标，退出撤下并释放', async () => {
  const f = fixture();
  await flush();
  assert.equal(f.creates.length, 0);
  f.controller.select(project('a'));
  await flush();
  f.controller.select({ ...project('a') });
  await flush();
  assert.equal(f.creates.length, 0);
  assert.equal(f.controller.getSnapshot().pending, false);
  assert.equal(f.controller.commandTarget.getSnapshot(), undefined);
  f.controller.open();
  f.controller.open();
  await flush();
  assert.deepEqual(f.creates, ['w-a']);
  assert.equal(f.controller.commandTarget.getSnapshot(), 's-w-a');
  const previousCloses = f.closeCount;
  f.panel.set('settings');
  assert.equal(f.closeCount, previousCloses + 1, '首次离开详情立即撤下右栏布局');
  assert.equal(f.controller.commandTarget.getSnapshot(), undefined);
  f.panel.set('dsh-workbase');
  assert.equal(f.controller.commandTarget.getSnapshot(), 's-w-a');
  f.controller.select(null);
  assert.equal(f.controller.commandTarget.getSnapshot(), undefined);
  assert.deepEqual(f.releases, ['s-w-a']);
  f.controller.dispose();
  assert.equal(f.panel.listeners, 0);
});

test('A切到B先撤下A，A的迟到加载不能覆盖B，返回A仍等待点击', async () => {
  const f = fixture(), pending = deferred<string>();
  f.waits.set('w-a', pending);
  f.controller.select(project('a'));
  f.controller.open();
  f.controller.select(project('b'));
  assert.equal(f.controller.commandTarget.getSnapshot(), undefined);
  await flush();
  assert.deepEqual(f.creates, ['w-a'], '切换项目不自动连接新项目');
  f.controller.open();
  await flush();
  assert.equal(f.controller.commandTarget.getSnapshot(), 's-w-b');
  pending.resolve('s-w-a');
  await flush();
  assert.equal(f.controller.commandTarget.getSnapshot(), 's-w-b');
  assert.ok(f.releases.includes('s-w-a'), '迟到加载释放已持有的旧引用');
  f.controller.select(project('a'));
  await flush();
  assert.equal(f.controller.commandTarget.getSnapshot(), undefined, '返回旧项目仍等待点击');
  f.controller.open();
  await flush();
  assert.equal(f.controller.commandTarget.getSnapshot(), 's-w-a');
  assert.equal(f.creates.filter(c => c === 'w-a').length, 2);
  assert.equal(f.creates.at(-1), 'w-a', '没有成功打开的迟到目标不写入上次目标记录');
  f.controller.dispose();
});

test('目录核验失败不挂载目标、不回落旧会话，释放引用并展示错误', async () => {
  const f = fixture();
  f.mismatch();
  f.controller.select(project('a'));
  f.controller.open();
  await flush();
  assert.equal(f.controller.commandTarget.getSnapshot(), undefined);
  assert.equal(f.controller.getSnapshot().views.length, 0);
  assert.match(f.controller.getSnapshot().error, /目录/);
  assert.deepEqual(f.releases, ['s-w-a']);
  f.controller.dispose();
});

test('目录不可用、官方席位未就绪不创建；同一项目刷新不重复创建', async () => {
  const f = fixture();
  f.controller.select({ ...project('a'), available: false });
  f.controller.open();
  await flush();
  assert.equal(f.creates.length, 0);
  f.controller.setAvailable(false);
  f.controller.select(project('a'));
  f.controller.open();
  await flush();
  assert.equal(f.creates.length, 0);
  f.controller.setAvailable(true);
  await flush();
  assert.equal(f.creates.length, 0, '官方服务重新就绪也不自动连接');
  f.controller.open();
  await flush();
  assert.equal(f.creates.length, 1);
  f.controller.select({ ...project('a') });
  await flush();
  assert.equal(f.creates.length, 1);
  f.controller.dispose();
});

test('切换项目时已初始化Tab保留旧会话，取消Tab生命周期后释放，卸载释放所有引用', async () => {
  const f = fixture();
  f.controller.select(project('a'));
  f.controller.open();
  await flush();
  const a = f.controller.getSnapshot().views[0]!, tab = new AbortController();
  const unmount = a.mount(), releaseTab = a.retainTab('terminal-a', tab.signal);
  f.controller.select(project('b'));
  f.controller.open();
  await flush();
  unmount();
  assert.equal(f.releases.includes('s-w-a'), false);
  assert.equal(f.controller.getSnapshot().views.length, 2);
  assert.equal(f.controller.commandTarget.getSnapshot(), 's-w-b');
  tab.abort(); releaseTab();
  assert.deepEqual(f.releases, ['s-w-a']);
  f.controller.dispose();
  assert.deepEqual(f.releases, ['s-w-a', 's-w-b']);
});

test('官方前台只读源合成当前项目目标，所有命令读同一目标，退出与卸载恢复原读接口', () => {
  const native = observable<string | undefined>('native-session');
  const target = observable<{ active: boolean; sessionId?: string }>({ active: false });
  const get = native.getSnapshot, subscribe = native.subscribe;
  const remove = bindSidebarTarget(native, target);
  let updates = 0;
  const stop = native.subscribe(() => { updates++; });
  assert.equal(native.getSnapshot(), 'native-session');
  target.set({ active: true, sessionId: 'project-a' });
  assert.equal(native.getSnapshot(), 'project-a');
  native.set('other-native');
  assert.equal(native.getSnapshot(), 'project-a');
  target.set({ active: true });
  assert.equal(native.getSnapshot(), undefined, '项目切换准备期间不允许命令落到旧目标');
  target.set({ active: false });
  assert.equal(native.getSnapshot(), 'other-native');
  assert.equal(updates, 4);
  stop(); remove(); remove();
  assert.equal(native.getSnapshot, get);
  assert.equal(native.subscribe, subscribe);
  assert.equal(native.listeners, 0);
  assert.equal(target.listeners, 0);
});

test('官方目录适配同时核对workspace成员、header.cwd及workingDirectory，订阅改变即撤下命令目标', async () => {
  const p = project('a'), projection = observable<unknown>(undefined);
  const panelInfo = observable({ activePanelId: 'dsh-workbase' as string | null });
  const workspaces = observable({ items: [{ workspaceId: p.workspaceId, path: p.path, sessionIds: ['s'] }], archivedSessionIds: [] });
  const sessions = observable({ ids: ['s'], byId: { s: { cwd: p.path, updatedAt: 1 } },
    projectionsBySession: { s: { values: {} as Record<string, unknown>, state: 'idle' } } });
  let refreshes = 0, releases = 0;
  const reference = { sessionId: 's', ready: Promise.resolve(),
    binding: { session: { projections: { faceOf: () => projection } } }, release() { releases++; } };
  const port = officialProjectSidebarPort({
    layout: { panelInfo, closeRightbar() {} },
    workspaces: { list: workspaces },
    sessions: {
      list: sessions,
      retain(id: string, options: { source: string }) {
        assert.equal(id, 's'); assert.equal(options.source, 'workbaseSidebar'); return reference;
      },
      async refreshProjections() {
        refreshes++; projection.set(p.path);
        sessions.set({ ...sessions.getSnapshot(), projectionsBySession: { s: { values: { workingDirectory: p.path }, state: 'ready' } } });
      },
    },
  } as any)!;
  assert.ok(port);
  const controller = new ProjectSidebarController(port);
  controller.setAvailable(true); controller.select(p);
  await flush();
  assert.equal(releases, 0);
  assert.deepEqual(controller.getSnapshot().candidates, ['s']);
  controller.open();
  await flush();
  assert.equal(controller.commandTarget.getSnapshot(), 's');
  assert.equal(refreshes, 1);
  sessions.set({ ...sessions.getSnapshot(), byId: { s: { cwd: '/elsewhere', updatedAt: 1 } } });
  assert.equal(controller.commandTarget.getSnapshot(), undefined, '文件树目录改变即拒绝继续操作');
  assert.deepEqual(controller.getSnapshot().candidates, []);
  assert.equal(releases, 1);
  controller.dispose();
  assert.equal(projection.listeners + sessions.listeners + workspaces.listeners + panelInfo.listeners, 0);
  sessions.set({ ...sessions.getSnapshot(), byId: { s: { cwd: p.path, updatedAt: 1 } } });
  projection.set('/worktree');
  assert.notEqual(port.currentDirectory!(reference as unknown as SidebarReference, p).workingDirectory, p.path);
  projection.set(p.path);
  workspaces.set({ ...workspaces.getSnapshot(), items: [{ workspaceId: p.workspaceId, path: p.path, sessionIds: [] }] });
  assert.equal(port.currentDirectory!(reference as unknown as SidebarReference, p).workspaceId, '');
});

test('缺少官方会话读取、目录投影刷新或面板观察能力时不安装目录适配', () => {
  assert.equal(officialProjectSidebarPort({} as any), undefined);
});

test('点击后的展开意图只消费一次，离开详情期间的迟到连接不能挂载或自动展开', async () => {
  const f = fixture(), pending = deferred<string>();
  f.waits.set('w-a', pending);
  f.controller.select(project('a'));
  f.controller.open(); f.controller.open();
  assert.equal(f.creates.length, 1);
  f.panel.set(null);
  assert.equal(f.controller.getSnapshot().pending, false);
  pending.resolve('s-w-a');
  await flush();
  f.panel.set('dsh-workbase');
  assert.equal(f.controller.commandTarget.getSnapshot(), undefined);
  assert.deepEqual(f.releases, ['s-w-a']);
  f.controller.open();
  await flush();
  const expanded: boolean[] = [];
  f.controller.initializeExpansion('s-w-a', value => expanded.push(value));
  f.controller.initializeExpansion('s-w-a', value => expanded.push(value));
  assert.deepEqual(expanded, [true, false], '连接后首个挂载响应点击，后续重进详情只显示入口');
  f.controller.dispose();
});

test('连接失败保留可重试入口，再次点击只重试当前项目', async () => {
  const f = fixture(), pending = deferred<string>();
  f.waits.set('w-a', pending);
  f.controller.select(project('a')); f.controller.open();
  pending.reject(new Error('连接失败'));
  await flush();
  assert.equal(f.controller.getSnapshot().pending, false);
  assert.equal(f.controller.getSnapshot().error, '连接失败');
  assert.equal(f.controller.commandTarget.getSnapshot(), undefined);
  f.waits.delete('w-a');
  f.controller.open(); f.controller.open();
  await flush();
  assert.deepEqual(f.creates, ['w-a', 'w-a']);
  assert.equal(f.controller.commandTarget.getSnapshot(), 's-w-a');
  f.controller.dispose();
});
