import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkbaseService, type HostPort, type Persistence } from '../src/server/service.js';
import { initialState, type State } from '../src/shared/model.js';

function fixture() {
  let saved: State = initialState();
  let fail = false;
  let tick = 100;
  const persistence: Persistence = {
    get: () => structuredClone(saved),
    set: async next => {
      await Promise.resolve();
      if (fail) throw new Error('disk full');
      saved = structuredClone(next);
    },
  };
  const workspaces = [
    { workspaceId: 'w1', path: '/projects/one', title: '同名', available: true, sessionIds: ['s1'] },
    { workspaceId: 'w2', path: '/projects/two', title: '同名', available: false, sessionIds: ['s2'] },
  ];
  const host: HostPort = {
    workspaces: async () => structuredClone(workspaces),
    sessions: async () => [
      { sessionId: 's1', title: '第一条会话', updatedAt: 1, archived: false, running: false },
      { sessionId: 's2', title: '第二条会话', updatedAt: 2, archived: true, running: false },
    ],
    rename: async (id, title) => { workspaces.find(w => w.workspaceId === id)!.title = title; },
  };
  let id = 0;
  const service = new WorkbaseService(persistence, host, () => `id-${++id}`, () => ++tick);
  return { service, workspaces, saved: () => saved, fail: (value: boolean) => { fail = value; }, advance: (ms: number) => { tick += ms; } };
}

test('删除撤销恢复原始记录，保存失败可重试，不能重复或跨项目恢复', async () => {
  const f = fixture();
  const [a,b] = (await f.service.snapshot()).projects;
  const original = await f.service.createTodo({ projectId: a!.projectId, title: '保留来源和备注', note: '完整备注' }, { kind: 'agent', workspaceId: 'w1' });
  const done = await f.service.updateTodo({ projectId: a!.projectId, id: original.id, expectedVersion: 1, done: true });
  const removed = await f.service.deleteTodo({ projectId: a!.projectId, id: done.id, expectedVersion: done.version });
  assert.equal(f.saved().todos.length, 0);
  await assert.rejects(f.service.restoreDeletedTodo({ projectId: b!.projectId, token: removed.undoToken }), /撤销/);
  f.fail(true);
  await assert.rejects(f.service.restoreDeletedTodo({ projectId: a!.projectId, token: removed.undoToken }), /disk full/);
  f.fail(false);
  const restored = await f.service.restoreDeletedTodo({ projectId: a!.projectId, token: removed.undoToken });
  assert.deepEqual(restored, { ...done, version: done.version + 1 });
  await assert.rejects(f.service.restoreDeletedTodo({ projectId: a!.projectId, token: removed.undoToken }), /撤销/);
});

test('撤销删除限五秒且仅恢复最近一次，归档和 Agent 不能恢复', async () => {
  const f = fixture();
  const projectId = (await f.service.snapshot()).projects[0]!.projectId;
  const a = await f.service.createTodo({ projectId, title: '任务 A' });
  const b = await f.service.createTodo({ projectId, title: '任务 B' });
  const first = await f.service.deleteTodo({ projectId, id: a.id, expectedVersion: 1 });
  const last = await f.service.deleteTodo({ projectId, id: b.id, expectedVersion: 1 });
  await assert.rejects(f.service.restoreDeletedTodo({ projectId, token: first.undoToken }), /撤销/);
  await assert.rejects(f.service.restoreDeletedTodo({ projectId, token: last.undoToken }, { kind: 'agent', workspaceId: 'w1' }), /Agent/);
  await f.service.archiveProject({ projectId, archived: true });
  await assert.rejects(f.service.restoreDeletedTodo({ projectId, token: last.undoToken }), /归档/);
  await f.service.archiveProject({ projectId, archived: false });
  f.advance(5001);
  await assert.rejects(f.service.restoreDeletedTodo({ projectId, token: last.undoToken }), /撤销/);
  assert.equal(f.saved().todos.length, 0);
});

test('同名项目保持不同身份，会话仅按宿主归属关联', async () => {
  const f = fixture();
  const view = await f.service.snapshot();
  assert.equal(new Set(view.projects.map(p => p.projectId)).size, 2);
  assert.deepEqual(view.projects[0]!.sessions.map(s => s.sessionId), ['s1']);
  assert.deepEqual(view.projects[1]!.sessions.map(s => s.sessionId), ['s2']);
});

test('并发创建串行保存，不丢失待办', async () => {
  const f = fixture();
  const projectId = (await f.service.snapshot()).projects[0]!.projectId;
  await Promise.all(Array.from({ length: 20 }, (_, i) =>
    f.service.createTodo({ projectId, title: `任务 ${i}` })));
  assert.equal(f.saved().todos.length, 20);
  assert.equal(new Set(f.saved().todos.map(t => t.id)).size, 20);
});

test('保存失败不发布，后续重试仍能保存', async () => {
  const f = fixture();
  const projectId = (await f.service.snapshot()).projects[0]!.projectId;
  f.fail(true);
  await assert.rejects(f.service.createTodo({ projectId, title: '未保存' }), /disk full/);
  assert.equal(f.saved().todos.length, 0);
  f.fail(false);
  await f.service.createTodo({ projectId, title: '已保存' });
  assert.equal(f.saved().todos.length, 1);
});

test('状态两态流转，重新打开清除完成时间，过期修改被拒绝', async () => {
  const f = fixture();
  const projectId = (await f.service.snapshot()).projects[0]!.projectId;
  const t = await f.service.createTodo({ projectId, title: '任务' });
  const done = await f.service.updateTodo({ projectId, id: t.id, expectedVersion: t.version, done: true });
  assert.ok(done.completedAt);
  await assert.rejects(f.service.updateTodo({ projectId, id: t.id, expectedVersion: t.version, done: false }), /已经变化/);
  const reopened = await f.service.updateTodo({ projectId, id: t.id, expectedVersion: done.version, done: false });
  assert.equal(reopened.completedAt, null);
});

test('跨项目更新删除被拒绝，目录失效仍可编辑待办', async () => {
  const f = fixture();
  const [a, b] = (await f.service.snapshot()).projects;
  const t = await f.service.createTodo({ projectId: b!.projectId, title: '目录不可用仍可保存' });
  await assert.rejects(f.service.updateTodo({ projectId: a!.projectId, id: t.id, expectedVersion: 1, title: '窜改' }), /不存在/);
  await assert.rejects(f.service.deleteTodo({ projectId: a!.projectId, id: t.id, expectedVersion: 1 }), /不存在/);
  assert.equal(f.saved().todos.length, 1);
});

test('Agent 只允许当前项目，旧状态权限仍受校验，全局开启后可删除', async () => {
  const f = fixture();
  const [a, b] = (await f.service.snapshot()).projects;
  await f.service.setAgentStatus(a!.projectId, false);
  const actor = { kind: 'agent' as const, workspaceId: 'w1' };
  await assert.rejects(f.service.createTodo({ projectId: b!.projectId, title: '跨项目' }, actor), /当前项目/);
  const t = await f.service.createTodo({ projectId: a!.projectId, title: 'Agent任务' }, actor);
  assert.equal(t.creator, 'agent');
  const edited = await f.service.updateTodo({ projectId: a!.projectId, id: t.id, expectedVersion: 1, title: '更新标题' }, actor);
  await assert.rejects(f.service.updateTodo({ projectId: a!.projectId, id: t.id, expectedVersion: edited.version, done: true }, actor), /状态/);
  await f.service.setAgentStatus(a!.projectId, true);
  const done = await f.service.updateTodo({ projectId: a!.projectId, id: t.id, expectedVersion: edited.version, done: true }, actor);
  assert.equal(done.done, true);
  await f.service.deleteTodo({ projectId: a!.projectId, id: t.id, expectedVersion: done.version }, actor);
  assert.equal(f.saved().todos.length, 0);
});

test('全局管理覆盖已有与新增项目，写入失败不生效，Agent 删除不覆盖用户撤销', async () => {
  const f = fixture();
  const snapshot = await f.service.snapshot();
  const projectId = snapshot.projects[0]!.projectId;
  const options = { home: snapshot.preferences.home, root: '', agentManageTodos: false };
  f.fail(true);
  await assert.rejects(f.service.saveSettings('follow', {}, options), /disk full/);
  assert.equal(f.saved().preferences.agentManageTodos, true);
  f.fail(false);
  await f.service.saveSettings('follow', {}, options);
  f.workspaces.push({ workspaceId: 'w3', path: '/projects/three', title: '新增项目', available: true, sessionIds: [] });
  const added = (await f.service.snapshot()).projects.find(p => p.workspaceId === 'w3')!;
  await assert.rejects(f.service.createTodo({ projectId: added.projectId, title: '禁止' }, { kind: 'agent', workspaceId: 'w3' }), /管理待办/);
  const userTodo = await f.service.createTodo({ projectId, title: '用户可操作' });
  const removed = await f.service.deleteTodo({ projectId, id: userTodo.id, expectedVersion: 1 });
  await f.service.saveSettings('follow', {}, { ...options, agentManageTodos: true });
  const agent = { kind: 'agent' as const, workspaceId: 'w1' };
  const agentTodo = await f.service.createTodo({ projectId, title: 'Agent 可操作' }, agent);
  await f.service.deleteTodo({ projectId, id: agentTodo.id, expectedVersion: 1 }, agent);
  const restored = await f.service.restoreDeletedTodo({ projectId, token: removed.undoToken });
  assert.equal(restored.id, userTodo.id);
});

test('外部重新注册同目录需显式恢复原身份，原待办保留', async () => {
  const f = fixture();
  const a = (await f.service.snapshot()).projects[0]!;
  await f.service.createTodo({ projectId: a.projectId, title: '原任务' });
  f.workspaces[0]!.workspaceId = 'w3';
  const conflict = (await f.service.snapshot()).conflicts[0]!;
  assert.equal(conflict.projectId, a.projectId);
  await assert.rejects(f.service.createTodo({ projectId: a.projectId, title: '拒绝自动关联' }), /绑定/);
  await f.service.resolveBinding({ projectId: a.projectId, workspaceId: 'w3', choice: 'restore' });
  const restored = (await f.service.snapshot()).projects.find(p => p.workspaceId === 'w3')!;
  assert.equal(restored.projectId, a.projectId);
  assert.equal(restored.todos.length, 1);
});

test('选择作为新项目保留旧数据，不复制待办', async () => {
  const f = fixture();
  const a = (await f.service.snapshot()).projects[0]!;
  await f.service.createTodo({ projectId: a.projectId, title: '旧任务' });
  f.workspaces[0]!.workspaceId = 'w3';
  await f.service.snapshot();
  await f.service.resolveBinding({ projectId: a.projectId, workspaceId: 'w3', choice: 'new' });
  const next = (await f.service.snapshot()).projects.find(p => p.workspaceId === 'w3')!;
  assert.notEqual(next.projectId, a.projectId);
  assert.equal(next.todos.length, 0);
  assert.equal(f.saved().todos.length, 1);
});

test('项目从宿主移除后不能写入，返回相同身份恢复', async () => {
  const f = fixture();
  const a = (await f.service.snapshot()).projects[0]!;
  const removed = f.workspaces.shift()!;
  await assert.rejects(f.service.createTodo({ projectId: a.projectId, title: '不可写' }), /绑定/);
  f.workspaces.unshift(removed);
  assert.equal((await f.service.snapshot()).projects.find(p => p.workspaceId === 'w1')!.projectId, a.projectId);
});

test('重命名仅调用宿主，不更改路径与身份', async () => {
  const f = fixture();
  const a = (await f.service.snapshot()).projects[0]!;
  await f.service.renameProject(a.projectId, '新名字');
  const updated = (await f.service.snapshot()).projects[0]!;
  assert.equal(updated.title, '新名字');
  assert.equal(updated.path, a.path);
  assert.equal(updated.projectId, a.projectId);
});

test('多项目设置保存遇到无效项目或写入失败时整体回滚', async () => {
  const f = fixture();
  const a = (await f.service.snapshot()).projects[0]!;
  const before = structuredClone(f.saved());
  await assert.rejects(f.service.saveSettings('warm', { [a.projectId]: true, missing: true }), /绑定/);
  assert.deepEqual(f.saved(), before);
  f.fail(true);
  await assert.rejects(f.service.saveSettings('warm', { [a.projectId]: true }), /disk full/);
  assert.deepEqual(f.saved(), before);
  f.fail(false);
  await f.service.saveSettings('warm', { [a.projectId]: true });
  assert.equal(f.saved().preferences.theme, 'warm');
  assert.equal((await f.service.snapshot()).projects[0]!.agentCanChangeStatus, true);
});
