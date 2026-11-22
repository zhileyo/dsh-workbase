import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialState, stateSchema } from '../src/shared/model.js';
import { WorkbaseService } from '../src/server/service.js';
import { dispatch } from '../src/server/rpc.js';
import { MIGRATION_UNDO_MS, migrationRecordSchema } from '../src/shared/migration.js';

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-migration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'), target = join(root, 'target');
  await mkdir(source); await mkdir(target);
  let state = initialState(), writes = 0, tick = 1000;
  state.bindings.push({ projectId: 'p1', workspaceId: 'w1', path: source,
    retired: false, removed: false, archived: false, agentCanChangeStatus: true });
  const sessions = [
    { sessionId: 's1', title: '相同标题', updatedAt: 1, archived: false, running: false },
    { sessionId: 's2', title: '相同标题', updatedAt: 2, archived: true, running: false },
  ];
  const workspaces = [{ workspaceId: 'w1', title: '源项目', path: source, available: true, sessionIds: ['s1', 's2'] }];
  const service = new WorkbaseService({
    get: () => structuredClone(state), set: async next => { writes++; state = structuredClone(next); },
  }, { workspaces: async () => structuredClone(workspaces), sessions: async () => structuredClone(sessions),
    rename: async () => { throw new Error('不应修改宿主'); } }, () => '00000000-0000-4000-8000-000000000001', () => tick);
  return { root, source, target, service, workspaces, sessions, state: () => state, writes: () => writes, advance: (ms: number) => { tick += ms; } };
}

test('迁移预览统计全部会话和待办，保留身份，不支持事务时不写入', async t => {
  const f = await fixture(t);
  await f.service.createTodo({ projectId: 'p1', title: '待办' });
  const before = structuredClone(f.state()), writes = f.writes();
  const preview = await f.service.previewMigration({ projectId: 'p1', directory: f.target }, new AbortController().signal);
  assert.equal(preview.kind, 'directory');
  assert.equal(preview.source.projectId, 'p1');
  assert.deepEqual(preview.source.counts, { active: 1, archived: 1, pending: 1, done: 0 });
  assert.equal(preview.executable, false);
  assert.ok(preview.blockers.includes('当前宿主未提供安全迁移事务，暂不能执行迁移'));
  await assert.rejects(f.service.confirmMigration(preview.token), /未提供安全迁移事务/);
  assert.deepEqual(f.state(), before); assert.equal(f.writes(), writes);
  assert.deepEqual(await f.service.migrationRecords('p1'), []);
});

test('预览识别已有目标、运行中、归档及符号链接同目录', async t => {
  const f = await fixture(t);
  f.state().bindings.push({ ...f.state().bindings[0]!, projectId: 'p2', workspaceId: 'w2', path: f.target, archived: true });
  f.workspaces.push({ workspaceId: 'w2', title: '目标', path: f.target, available: true, sessionIds: [] });
  f.sessions[0]!.running = true;
  let preview = await f.service.previewMigration({ projectId: 'p1', directory: f.target }, new AbortController().signal);
  assert.equal(preview.kind, 'merge'); assert.equal(preview.target.projectId, 'p2');
  assert.ok(preview.blockers.includes('项目存在运行中的会话'));
  assert.ok(preview.blockers.includes('目标项目已归档'));
  const alias = join(f.root, 'alias'); await symlink(f.source, alias);
  preview = await f.service.previewMigration({ projectId: 'p1', directory: alias }, new AbortController().signal);
  assert.ok(preview.blockers.includes('目标目录与原目录相同'));
});

test('迁移 RPC 拒绝非所有者、取消和无效目录，旧状态无记录', async t => {
  const f = await fixture(t), signal = new AbortController().signal;
  assert.equal((await dispatch(f.service, { op: 'migration-preview', projectId: 'p1', directory: f.target }, false, signal)).ok, false);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.service.previewMigration({ projectId: 'p1', directory: f.target }, controller.signal));
  await assert.rejects(f.service.previewMigration({ projectId: 'p1', directory: 'relative' }, signal), /绝对路径/);
  await assert.rejects(f.service.previewMigration({ projectId: 'p1', directory: join(f.root, 'missing') }, signal), /目录不可用/);
  const { migrations: _, ...old } = initialState();
  assert.deepEqual(stateSchema.parse(old).migrations, []);
  assert.equal(f.writes(), 0);
});

test('预览令牌失效和工作台变化不会绕过执行限制', async t => {
  const f = await fixture(t);
  await assert.rejects(f.service.confirmMigration('missing'), /预览已失效/);
  const preview = await f.service.previewMigration({ projectId: 'p1', directory: f.target }, new AbortController().signal);
  f.service.discardMigration(preview.token);
  await assert.rejects(f.service.confirmMigration(preview.token), /预览已失效/);
  const refreshed = await f.service.previewMigration({ projectId: 'p1', directory: f.target }, new AbortController().signal);
  await f.service.setPreferences({ theme: 'warm' });
  await assert.rejects(f.service.confirmMigration(refreshed.token), /数据已变化/);
  const response = await dispatch(f.service, { op: 'migration-preview', projectId: 'p1', directory: f.target }, true, new AbortController().signal);
  assert.equal(response.ok, true);
  f.advance(10 * 60 * 1000);
  await assert.rejects(f.service.confirmMigration(refreshed.token), /预览已失效/);
});

test('记录按项目筛选且72小时截止只读，不产生撤销写入', async t => {
  const f = await fixture(t);
  const endpoint = { projectId: 'p1', workspaceId: 'w1', title: '源', path: f.source };
  const record = migrationRecordSchema.parse({ id: 'r1', kind: 'directory', source: endpoint,
    target: { ...endpoint, path: f.target }, status: 'completed', completedAt: 0, undoUntil: 1000, revertedAt: null, entities: [] });
  f.state().migrations.push(record);
  const records = await f.service.migrationRecords('p1');
  assert.equal(records.length, 1); assert.equal(records[0]!.expired, true); assert.equal(records[0]!.canUndo, false);
  records[0]!.source.title = '修改返回值不应修改存储';
  assert.equal(f.state().migrations[0]!.source.title, '源');
  await assert.rejects(f.service.undoMigration('r1'), /超过撤销期限/);
  f.state().migrations[0]!.undoUntil = MIGRATION_UNDO_MS;
  await assert.rejects(f.service.undoMigration('r1'), /未提供安全迁移事务/);
  const preview = await f.service.previewMigration({ projectId: 'p1', directory: f.target }, new AbortController().signal);
  assert.ok(preview.blockers.includes('项目存在未结束的可撤销迁移'));
  assert.equal(migrationRecordSchema.safeParse({ ...record, undoUntil: MIGRATION_UNDO_MS + 1 }).success, false);
  assert.equal(f.writes(), 0);
});

test('目录占用、失效关联、缺失会话和不同内容同ID待办分别阻止迁移', async t => {
  const f = await fixture(t), signal = new AbortController().signal;
  f.workspaces.push({ workspaceId: 'w2', title: '未关联目标', path: f.target, available: true, sessionIds: [] });
  f.workspaces[0]!.sessionIds.push('missing');
  let preview = await f.service.previewMigration({ projectId: 'p1', directory: f.target }, signal);
  assert.ok(preview.blockers.includes('目标目录存在未解决的项目关联或占用'));
  assert.ok(preview.blockers.includes('会话身份或状态无法核实'));
  f.state().bindings.push({ ...f.state().bindings[0]!, projectId: 'p2', workspaceId: 'w2', path: f.target, removed: true });
  preview = await f.service.previewMigration({ projectId: 'p1', directory: f.target }, signal);
  assert.ok(preview.blockers.includes('目标项目已移除或关联失效'));
  const todo = await f.service.createTodo({ projectId: 'p1', title: '相同标题' });
  f.state().todos.push({ ...todo, projectId: 'p2' });
  preview = await f.service.previewMigration({ projectId: 'p1', directory: f.target }, signal);
  assert.ok(!preview.blockers.includes('待办身份存在冲突'));
  f.state().todos.at(-1)!.note = '内容不同';
  preview = await f.service.previewMigration({ projectId: 'p1', directory: f.target }, signal);
  assert.ok(preview.blockers.includes('待办身份存在冲突'));
});

test('按目标项目标识预览，不接受同名项目或客户端路径替代目标身份', async t => {
  const f = await fixture(t), signal = new AbortController().signal;
  f.state().bindings.push({ ...f.state().bindings[0]!, projectId: 'p2', workspaceId: 'w2', path: f.target });
  f.workspaces.push({ workspaceId: 'w2', title: '源项目', path: f.target, available: true, sessionIds: [] });
  const result = await dispatch(f.service, { op: 'migration-preview-project', projectId: 'p1', targetProjectId: 'p2' }, true, signal);
  assert.equal(result.ok, true);
  if (result.ok) {
    const preview = result.value as { kind: string; target: { projectId: string; path: string } };
    assert.equal(preview.kind, 'merge'); assert.equal(preview.target.projectId, 'p2'); assert.equal(preview.target.path, await realpath(f.target));
  }
  await assert.rejects(f.service.previewProjectMigration({ projectId: 'p1', targetProjectId: 'p1' }, signal), /其他项目/);
  await assert.rejects(f.service.previewProjectMigration({ projectId: 'p1', targetProjectId: 'missing' }, signal), /目标项目/);
  f.state().bindings[1]!.removed = true;
  await assert.rejects(f.service.previewProjectMigration({ projectId: 'p1', targetProjectId: 'p2' }, signal), /目标项目/);
  assert.equal((await dispatch(f.service, { op: 'migration-preview-project', projectId: 'p1', targetProjectId: 'p2', directory: f.target }, true, signal)).ok, false);
  assert.equal(f.writes(), 0);
});

test('源目录已丢失但绑定有效时仍预览保留内容，不把缺失目录误报为关联失效', async t => {
  const f = await fixture(t), signal = new AbortController().signal;
  await f.service.createTodo({ projectId: 'p1', title: '保留待办' });
  await rm(f.source, { recursive: true });
  f.workspaces[0]!.available = false;
  const before = structuredClone(f.state()), writes = f.writes();
  const preview = await f.service.previewMigration({ projectId: 'p1', directory: f.target }, signal);
  assert.equal(preview.blockers.includes('源项目目录不可用或关联失效'), false);
  assert.ok(preview.notices?.some(message => message.includes('源项目目录已不存在')));
  assert.equal(preview.source.counts.pending, 1);
  assert.equal(preview.executable, false);
  await assert.rejects(f.service.confirmMigration(preview.token), /未提供安全迁移事务/);
  assert.deepEqual(f.state(), before); assert.equal(f.writes(), writes);
  f.workspaces[0]!.workspaceId = 'other';
  const invalid = await f.service.previewMigration({ projectId: 'p1', directory: f.target }, signal);
  assert.ok(invalid.blockers.includes('源项目目录不可用或关联失效'));
});

test('迁移预览按真实路径核对绑定，保留真实宿主不可用阻断并去重结果数量', async t => {
  const f = await fixture(t), signal = new AbortController().signal;
  const alias = join(f.root, 'source-alias'); await symlink(f.source, alias);
  f.state().bindings.push({ ...f.state().bindings[0]!, projectId: 'p2', workspaceId: 'w2', path: f.target });
  f.workspaces.push({ workspaceId: 'w2', title: '目标', path: f.target, available: true, sessionIds: [] });
  const todo = await f.service.createTodo({ projectId: 'p2', title: '共同待办' });
  f.state().todos.push({ ...todo, projectId: 'p1' });
  f.workspaces[0]!.path = alias;
  let preview = await f.service.previewMigration({ projectId: 'p1', directory: f.target }, signal);
  assert.equal(preview.blockers.includes('源项目目录不可用或关联失效'), false);
  assert.deepEqual(preview.resultCounts, { active: 1, archived: 1, pending: 1, done: 0 });
  f.workspaces[0]!.available = false;
  preview = await f.service.previewMigration({ projectId: 'p1', directory: f.target }, signal);
  assert.ok(preview.blockers.includes('源项目目录不可用或关联失效'));
});
