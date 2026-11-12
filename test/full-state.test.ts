import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, stateSchema } from '../src/shared/model.js';
import { WorkbaseService, type HostPort } from '../src/server/service.js';

test('插件更新显示开关持久化，旧设置请求保留选择，写入失败整体回滚', async () => {
  let state = initialState(), reject = false;
  const host: HostPort = { workspaces: async () => [], sessions: async () => [], rename: async () => {} };
  const store = { get: () => state, set: async (next: typeof state) => {
    if (reject) throw new Error('写入失败');
    state = stateSchema.parse(next);
  } };
  const service = new WorkbaseService(store, host, () => 'p');
  await service.saveSettings('follow', {}, { home: state.preferences.home, root: '', pluginUpdateVisible: false });
  const restored = new WorkbaseService(store, host, () => 'p');
  assert.equal((await restored.snapshot()).preferences.pluginUpdateVisible, false);
  await restored.saveSettings('warm', {}, { home: state.preferences.home, root: '' });
  assert.equal(state.preferences.pluginUpdateVisible, false);
  reject = true;
  await assert.rejects(restored.saveSettings('dsh', {}, { home: state.preferences.home, root: '', pluginUpdateVisible: true }));
  assert.equal(state.preferences.pluginUpdateVisible, false);
  assert.equal(state.preferences.theme, 'warm');
});

test('自动更新偏好持久化，隐藏入口保留自动选择，旧请求与写入失败不重置', async () => {
  let state = initialState(), reject = false;
  const host: HostPort = { workspaces: async () => [], sessions: async () => [], rename: async () => {} };
  const store = { get: () => state, set: async (next: typeof state) => {
    if (reject) throw new Error('写入失败');
    state = stateSchema.parse(next);
  } };
  const service = new WorkbaseService(store, host, () => 'p');
  await service.saveSettings('follow', {}, { home: state.preferences.home, root: '', pluginAutoUpdate: true });
  await service.setPreferences({ view: 'list', pluginUpdateVisible: false });
  await service.saveSettings('warm', {}, { home: state.preferences.home, root: '' });
  assert.equal((await new WorkbaseService(store, host, () => 'p').snapshot()).preferences.pluginAutoUpdate, true);
  reject = true;
  await assert.rejects(service.saveSettings('dsh', {}, { home: state.preferences.home, root: '', pluginAutoUpdate: false }));
  assert.equal(state.preferences.pluginAutoUpdate, true);
  assert.equal(state.preferences.theme, 'warm');
});

test('侧栏位置支持顺序和倒序前三项，旧第4–9项迁移为顺序第3项', () => {
  const state = initialState();
  const parse = (sidebarPosition: number) => stateSchema.parse({
    ...state, preferences: { ...state.preferences, navigation: { ...state.preferences.navigation, sidebarPosition } },
  }).preferences.navigation.sidebarPosition;
  for (const position of [1, 2, 3, -1, -2, -3]) assert.equal(parse(position), position);
  for (const position of [4, 5, 6, 7, 8, 9]) assert.equal(parse(position), 3);
  for (const position of [0, -4, 10, 1.5]) assert.throws(() => parse(position));
});

test('启动工作台开关默认关闭，旧状态兼容，设置保存后可恢复', async () => {
  let state = initialState();
  assert.equal(state.preferences.openOnStartup, false);
  const legacy = structuredClone(state) as any;
  delete legacy.preferences.openOnStartup;
  assert.equal(stateSchema.parse(legacy).preferences.openOnStartup, false);
  const host: HostPort = { workspaces: async () => [], sessions: async () => [], rename: async () => {} };
  const store = { get: () => state, set: async (next: typeof state) => { state = stateSchema.parse(next); } };
  const service = new WorkbaseService(store, host, () => 'p');
  await service.saveSettings('follow', {}, { home: state.preferences.home, root: '', openOnStartup: true });
  await service.setPreferences({ view: 'list' });
  const restored = new WorkbaseService(store, host, () => 'p');
  assert.equal((await restored.snapshot()).preferences.openOnStartup, true);
  await restored.saveSettings('warm', {}, { home: state.preferences.home, root: '' });
  assert.equal(state.preferences.openOnStartup, true, '旧设置请求不覆盖启动偏好');
});

test('首版偏好包含四模块、两套七字段与根目录，旧数据补齐不覆盖已有选择', () => {
  const state = initialState();
  assert.deepEqual(state.preferences.home, { quick: true, recent: false, stats: true, projects: true, recentStyle: 'cards', statCards: { running: true, recent: true, pending: true, diagnostic: true }, statDays: 7 });
  assert.equal(state.preferences.fields.grid.status, false);
  assert.equal(state.preferences.fields.list.recent, false);
  assert.equal(Object.keys(state.preferences.fields.grid).length, 7);
  const legacy = structuredClone(state) as any;
  delete legacy.preferences.home;
  delete legacy.preferences.fields;
  delete legacy.preferences.root;
  delete legacy.preferences.navigation;
  legacy.preferences.theme = 'warm';
  assert.equal(stateSchema.parse(legacy).preferences.theme, 'warm');
  assert.equal(stateSchema.parse(legacy).preferences.root, '');
  assert.deepEqual(stateSchema.parse(legacy).preferences.navigation, {
    sidebarName: '项目概览', sidebarVisible: true, headerButtonVisible: true, sidebarPosition: 2,
  });
});

test('持久化的双关入口状态在解析时恢复侧边栏入口，单关不受影响', () => {
  const state = initialState();
  const legacy = structuredClone(state) as any;
  legacy.preferences.navigation = { sidebarName: '项目概览', sidebarVisible: false, headerButtonVisible: false };
  const parsed = stateSchema.parse(legacy).preferences.navigation;
  assert.equal(parsed.sidebarVisible, true, '双关状态恢复侧边栏入口');
  assert.equal(parsed.headerButtonVisible, false);
  const kept = stateSchema.parse({
    ...structuredClone(state), preferences: { ...state.preferences,
      navigation: { sidebarName: '项目概览', sidebarVisible: false, headerButtonVisible: true, sidebarPosition: 4 } },
  }).preferences.navigation;
  assert.equal(kept.sidebarVisible, false, '合法的单关状态保持不变');
  assert.equal(kept.sidebarPosition, 3);
});

test('新项目 Agent 默认可切换状态，已有显式关闭保持关闭', async () => {
  let state = initialState();
  const host: HostPort = {
    workspaces: async () => [{ workspaceId: 'w', title: '项目', path: '/project', available: true, sessionIds: [] }],
    sessions: async () => [], rename: async () => {},
  };
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, host, () => 'p');
  assert.equal((await service.snapshot()).projects[0]!.agentCanChangeStatus, true);
  await service.setAgentStatus('p', false);
  assert.equal((await service.snapshot()).projects[0]!.agentCanChangeStatus, false);
});

test('紫晶主题通过设置保存并在服务重新初始化后恢复', async () => {
  let state = initialState();
  const host: HostPort = { workspaces: async () => [], sessions: async () => [], rename: async () => {} };
  const store = { get: () => state, set: async (next: typeof state) => { state = stateSchema.parse(next); } };
  const service = new WorkbaseService(store, host, () => 'p');
  await service.saveSettings('violet', {});
  const restored = new WorkbaseService(store, host, () => 'p');
  assert.equal((await restored.snapshot()).preferences.theme, 'violet');
});

test('移除保留数据，工作台重新添加相同目录直接复用身份', async () => {
  let state = initialState();
  let registered = true;
  let workspaceId = 'w1';
  const workspace = () => ({ workspaceId, title: '项目', path: '/project', available: true, sessionIds: [] });
  const host: HostPort = {
    workspaces: async () => registered ? [workspace()] : [], sessions: async () => [], rename: async () => {},
    remove: async () => { registered = false; },
    register: async () => { registered = true; workspaceId = 'w2'; return workspace(); },
  };
  let id = 0;
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, host, () => `p${++id}`);
  const project = (await service.snapshot()).projects[0]!;
  await service.createTodo({ projectId: project.projectId, title: '保留任务' });
  await service.removeProject(project.projectId);
  assert.equal((await service.snapshot()).projects.length, 0);
  assert.equal(state.todos.length, 1);
  const restored = await service.addProject('/project');
  assert.equal(restored.projectId, project.projectId);
  assert.equal((await service.snapshot()).projects[0]!.todos.length, 1);
  const duplicate = await service.addProject('/project');
  assert.equal(duplicate.duplicate, true);
});

test('宿主移除失败恢复绑定，持久化失败不调用宿主删除', async () => {
  let state = initialState();
  let failSave = false;
  let removes = 0;
  const host: HostPort = {
    workspaces: async () => [{ workspaceId: 'w', path: '/project', title: '项目', available: true, sessionIds: [] }],
    sessions: async () => [], rename: async () => {},
    remove: async () => { removes++; throw new Error('宿主失败'); },
  };
  const service = new WorkbaseService({ get: () => state, set: async next => { if (failSave) throw new Error('写入失败'); state = next; } }, host, () => 'p');
  await service.snapshot();
  await assert.rejects(service.removeProject('p'), /宿主失败/);
  assert.equal((await service.snapshot()).projects.length, 1);
  assert.equal(state.bindings[0]!.removed, false);
  failSave = true;
  await assert.rejects(service.removeProject('p'), /写入失败/);
  assert.equal(removes, 1);
  assert.equal(state.bindings[0]!.removed, false);
});

test('统计开启不覆盖样式偏好，关闭后恢复用户选择的卡片', async () => {
  let state = initialState();
  const host: HostPort = { workspaces: async () => [], sessions: async () => [], rename: async () => {} };
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, host, () => 'p');
  await service.saveSettings('follow', {}, { root: '', home: { ...state.preferences.home, stats: true, recentStyle: 'cards' } });
  assert.equal(state.preferences.home.recentStyle, 'cards');
  await service.setPreferences({ home: { ...state.preferences.home, stats: false } });
  assert.equal(state.preferences.home.recentStyle, 'cards');
});

test('全局 Agent 管理开关兼容旧状态，保存和其他偏好补丁互不覆盖', async () => {
  let state = initialState();
  const legacy = structuredClone(state) as any;
  delete legacy.preferences.agentManageTodos;
  assert.equal(stateSchema.parse(legacy).preferences.agentManageTodos, true);
  const host: HostPort = { workspaces: async () => [], sessions: async () => [], rename: async () => {} };
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, host, () => 'p');
  await service.saveSettings('follow', {}, { root: '', home: state.preferences.home, agentManageTodos: false });
  await service.setPreferences({ view: 'list' });
  assert.equal(state.preferences.agentManageTodos, false);
  await service.saveSettings('warm', {}, { root: '', home: state.preferences.home });
  assert.equal(state.preferences.agentManageTodos, false);
});
