import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../src/server/rpc.js';
import { WorkbaseService } from '../src/server/service.js';
import { initialState, defaultFields } from '../src/shared/model.js';
import { commandSchema } from '../src/shared/commands.js';

function fixture() {
  let state = initialState();
  let i = 0;
  return new WorkbaseService({ get: () => state, set: async next => { state = next; } }, {
    workspaces: async () => [{ workspaceId: 'w', path: '/project', title: '项目', available: true, sessionIds: [] }],
    sessions: async () => [], rename: async () => {},
  }, () => `id-${++i}`);
}
test('RPC拒绝非owner，不能读取项目和待办', async () => {
  const result = await dispatch(fixture(), { op: 'snapshot' }, false, new AbortController().signal);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'forbidden');
});
test('RPC严格拒绝未知字段、非法操作和空标题', async () => {
  for (const payload of [{ op: 'snapshot', owner: true }, { op: 'wipe' }, { op: 'create', projectId: 'x', title: ' ' }]) {
    const result = await dispatch(fixture(), payload, true, new AbortController().signal);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'invalid');
  }
});
test('已取消RPC不执行写入', async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await dispatch(fixture(), { op: 'snapshot' }, true, controller.signal);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'cancelled');
});
test('前后端合同支持创建读取与版本校验', async () => {
  const service = fixture();
  const signal = new AbortController().signal;
  const view = await service.snapshot();
  const result = await dispatch(service, { op: 'create', projectId: view.projects[0]!.projectId, title: '真实任务' }, true, signal);
  assert.equal(result.ok, true);
  assert.equal((await service.snapshot()).projects[0]!.todos[0]!.title, '真实任务');
});

test('偏好补丁解析不补齐未提交字段，空补丁不生成默认值', () => {
  for (const patch of [{}, { view: 'list' }, { selectedProject: null }, { projectFilter: 'favorite' }]) {
    const parsed = commandSchema.parse({ op: 'preferences', patch });
    assert.equal(parsed.op, 'preferences');
    if (parsed.op === 'preferences') assert.deepEqual(parsed.patch, patch);
  }
});

test('设置里的双关入口状态自动恢复侧边栏入口', async () => {
  const service = fixture();
  const signal = new AbortController().signal;
  const result = await dispatch(service, { op: 'settings', theme: 'dsh', permissions: {}, options: {
    home: initialState().preferences.home, root: '',
    navigation: { sidebarName: '项目概览', sidebarVisible: false, headerButtonVisible: false },
  } }, true, signal);
  assert.equal(result.ok, true);
  const navigation = (await service.snapshot()).preferences.navigation;
  assert.equal(navigation.sidebarVisible, true, '双关状态恢复侧边栏入口');
  assert.equal(navigation.headerButtonVisible, false);
});

test('RPC切换视图、筛选和项目后保留统计卡、根目录及字段配置，重新初始化仍恢复', async () => {
  let state = initialState();
  const store = { get: () => state, set: async (next: typeof state) => { state = next; } };
  const host = { workspaces: async () => [], sessions: async () => [], rename: async () => {} };
  const service = new WorkbaseService(store, host, () => 'p');
  const signal = new AbortController().signal;
  const home = { ...state.preferences.home, stats: true, recentStyle: 'buttons' as const };
  const navigation = { sidebarName: '我的项目', sidebarVisible: true, headerButtonVisible: false, sidebarPosition: 3 };
  assert.equal((await dispatch(service, { op: 'settings', theme: 'violet', permissions: {}, options: { home, root: '/项目根目录', navigation } }, true, signal)).ok, true);
  const fields = { grid: { ...defaultFields('grid'), activity: false }, list: { ...defaultFields('list'), todos: false } };
  for (const patch of [{ fields }, { view: 'list' }, { projectFilter: 'favorite' }, { selectedProject: 'p' }, { selectedProject: null }]) {
    assert.equal((await dispatch(service, { op: 'preferences', patch }, true, signal)).ok, true);
    const snapshot = await service.snapshot();
    assert.deepEqual(snapshot.preferences.home, home);
    assert.equal(snapshot.preferences.root, '/项目根目录');
    assert.deepEqual(snapshot.preferences.fields, fields);
    assert.deepEqual(snapshot.preferences.navigation, navigation);
  }
  const restored = await new WorkbaseService(store, host, () => 'p').snapshot();
  assert.deepEqual(restored.preferences.home, home);
  assert.equal(restored.preferences.root, '/项目根目录');
  assert.deepEqual(restored.preferences.fields, fields);
  assert.deepEqual(restored.preferences.navigation, navigation);
  assert.equal((await dispatch(service, { op: 'settings', theme: 'warm', permissions: {}, options: { home, root: '' } }, true, signal)).ok, true);
  assert.deepEqual((await service.snapshot()).preferences.navigation, navigation, '旧版设置请求保留入口设置');
});

test('会话预览返回轻量信息与正文，打开目录走服务端并保留平台优先回退', async () => {
  let state = initialState();
  const store = { get: () => state, set: async (next: typeof state) => { state = next; } };
  const revealed: string[] = [];
  const host = {
    workspaces: async () => [{ workspaceId: 'w', path: '/project', title: '项目', available: true, sessionIds: ['s1'] }],
    sessions: async () => [{ sessionId: 's1', title: '会话标题', archived: false, running: true, updatedAt: 42 }],
    rename: async () => {},
    readSession: async () => ({ hasEarlier: true, messages: [{ seq: 3, role: 'assistant' as const, text: '第一答', time: 12 }] }),
    reveal: async (path: string) => { revealed.push(path); },
  };
  const service = new WorkbaseService(store, host, () => 'p');
  const signal = new AbortController().signal;
  await dispatch(service, { op: 'snapshot' }, true, signal);
  const projectId = (await service.snapshot()).projects[0]!.projectId;
  const preview = await dispatch(service, { op: 'session-preview', projectId, sessionId: 's1' }, true, signal);
  assert.equal(preview.ok, true);
  if (preview.ok) {
    const value = preview.value as { title: string; projectName: string; running: boolean; hasEarlier: boolean; messages: { text: string }[] };
    assert.equal(value.title, '会话标题');
    assert.equal(value.projectName, '项目');
    assert.equal(value.running, true);
    assert.equal(value.hasEarlier, true);
    assert.equal(value.messages[0]!.text, '第一答');
  }
  const foreign = await dispatch(service, { op: 'session-preview', projectId, sessionId: 's-other' }, true, signal);
  assert.equal(foreign.ok, false, '不属于当前项目的会话拒绝预览');
  const revealed1 = await dispatch(service, { op: 'reveal-directory', projectId }, true, signal);
  assert.equal(revealed1.ok, true);
  assert.deepEqual(revealed, ['/project']);
});

test('git 分支读取返回当前分支与本地分支列表', async () => {
  let state = initialState();
  const store = { get: () => state, set: async (next: typeof state) => { state = next; } };
  const host = {
    workspaces: async () => [{ workspaceId: 'w', path: 'D:/tmp/repo', title: '项目', available: true, sessionIds: [] }],
    sessions: async () => [], rename: async () => {},
    gitBranches: async () => ({ git: true, current: 'main', branches: ['main', 'feature'] }),
  };
  const service = new WorkbaseService(store, host, () => 'p');
  const signal = new AbortController().signal;
  await dispatch(service, { op: 'snapshot' }, true, signal);
  const projectId = (await service.snapshot()).projects[0]!.projectId;
  const branches = await dispatch(service, { op: 'git-branches', projectId }, true, signal);
  assert.deepEqual(branches.ok && branches.value, { git: true, current: 'main', branches: ['main', 'feature'] });
});

test('worktreeSessions 登记的会话提交放行，未登记仍拒绝', async () => {
  let state = initialState();
  state.worktreeSessions.push({ sessionId: 'wt-1', projectId: 'p' });
  const store = { get: () => state, set: async (next: typeof state) => { state = next; } };
  const host = {
    workspaces: async () => [{ workspaceId: 'w', path: 'D:/tmp/repo', title: '项目', available: true, sessionIds: [] }],
    sessions: async () => [], rename: async () => {},
    submit: async () => {},
  };
  const service = new WorkbaseService(store, host, () => 'p');
  const signal = new AbortController().signal;
  const submit = await dispatch(service, { op: 'submit-message', projectId: 'p', sessionId: 'wt-1', provider: 'p', model: 'm',
    text: '在工作树里执行', requestId: '11111111-1111-4111-8111-111111111111' }, true, signal);
  assert.equal(submit.ok, true, '登记过的会话放行');
  const foreign = await dispatch(service, { op: 'submit-message', projectId: 'p', sessionId: 'wt-x', provider: 'p', model: 'm',
    text: 'x', requestId: '22222222-2222-4222-8222-222222222222' }, true, signal);
  assert.equal(foreign.ok, false, '未登记的会话仍拒绝');
});

test('归档项目业务只读：写入被拒绝，个人标记可用，恢复后继续可写', async () => {
  let state = initialState();
  const store = { get: () => state, set: async (next: typeof state) => { state = next; } };
  const host = {
    workspaces: async () => [{ workspaceId: 'w', path: '/project', title: '项目', available: true, sessionIds: [] }],
    sessions: async () => [],
    rename: async () => {},
  };
  const service = new WorkbaseService(store, host, () => 'p');
  const signal = new AbortController().signal;
  await dispatch(service, { op: 'snapshot' }, true, signal);
  const projectId = (await service.snapshot()).projects[0]!.projectId;
  assert.equal((await dispatch(service, { op: 'archive-project', projectId, archived: true }, true, signal)).ok, true);
  const blocked = await dispatch(service, { op: 'create', projectId, title: '归档中写入' }, true, signal);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.error.code, 'archived');
  assert.equal((await dispatch(service, { op: 'mark', projectId, field: 'favorite', value: true }, true, signal)).ok, true, '个人标记不受归档限制');
  assert.equal((await dispatch(service, { op: 'archive-project', projectId, archived: false }, true, signal)).ok, true);
  assert.equal((await dispatch(service, { op: 'create', projectId, title: '恢复后写入' }, true, signal)).ok, true);
});
