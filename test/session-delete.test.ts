import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkbaseService, type HostPort } from '../src/server/service.js';
import { initialState } from '../src/shared/model.js';
import { dispatch } from '../src/server/rpc.js';
import { createHost } from '../src/server/host.js';
import type { Context } from '@deepseek-ai/cordis';

test('永久删除检查归属与运行状态，失败保留标记，成功清理工作台关联', async () => {
  let state = initialState(), running = true, fail = false;
  const deleted: string[] = [];
  const host: HostPort & { deleteSession(id: string): Promise<void> } = {
    workspaces: async () => [{ workspaceId: 'w', path: '/project', title: '项目', available: true, sessionIds: ['s'] }],
    sessions: async () => [{ sessionId: 's', title: '会话', running, archived: true, updatedAt: 1 }],
    rename: async () => {},
    deleteSession: async id => { if (fail) throw new Error('存储清理失败'); deleted.push(id); },
  };
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, host, () => 'p');
  await service.snapshot();
  const call = (sessionId = 's', owner = true) => dispatch(service, { op: 'delete-session', projectId: 'p', sessionId }, owner, new AbortController().signal);
  assert.equal((await call('s', false)).ok, false);
  assert.match(JSON.stringify(await call('foreign')), /不属于/);
  assert.match(JSON.stringify(await call()), /运行/);
  assert.deepEqual(deleted, []);
  running = false;
  state.sessionMarks.s = { pinned: true, favorite: true };
  fail = true;
  assert.match(JSON.stringify(await call()), /存储清理失败/);
  assert.ok(state.sessionMarks.s);
  fail = false;
  assert.equal((await call()).ok, true);
  assert.deepEqual(deleted, ['s']);
  assert.equal(state.sessionMarks.s, undefined);
  state.bindings[0]!.archived = true;
  assert.match(JSON.stringify(await call()), /只读/);
});

test('宿主删除不调用外部插件扩展，底层能力缺失时拒绝', async () => {
  const deleted: string[] = [];
  const host = createHost({ workspaceRegistry: { deleteSession: async (id: string) => { deleted.push(id); return { deleted: true }; } } } as unknown as Context);
  assert.equal(typeof host.deleteSession, 'function');
  await assert.rejects(host.deleteSession!('s'), /底层能力/);
  assert.deepEqual(deleted, []);
  const missing = createHost({ workspaceRegistry: {} } as unknown as Context);
  await assert.rejects(missing.deleteSession!('s'), /底层能力/);
});

test('菜单桥接选择模型须经所有者、项目归属与目录可用性校验', async () => {
  let state = initialState(), available = true;
  const selected: unknown[] = [];
  const host: HostPort = {
    workspaces: async () => [{ workspaceId: 'w', path: '/project', title: '项目', available, sessionIds: ['s'] }],
    sessions: async () => [], rename: async () => {},
    configureModel: async (...args) => { selected.push(args); },
  };
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, host, () => 'p');
  const command = { op: 'configure-session-model', projectId: 'p', sessionId: 's', provider: 'provider', model: 'model' };
  const call = (owner = true, sessionId = 's') => dispatch(service, { ...command, sessionId }, owner, new AbortController().signal);
  assert.equal((await call(false)).ok, false);
  assert.equal((await call(true, 'foreign')).ok, false);
  available = false; assert.equal((await call()).ok, false);
  available = true; assert.equal((await call()).ok, true);
  assert.deepEqual(selected, [['s', 'provider', 'model']]);
});
