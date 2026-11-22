import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialState, stateSchema, type HostWorkspace, type HostSession } from '../src/shared/model.js';
import { WorkbaseService, type HostPort } from '../src/server/service.js';
import { MIGRATION_UNDO_MS } from '../src/shared/migration.js';

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-migrate-execute-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'), target = join(root, 'target'), file = join(root, 'state.json');
  await mkdir(source); await mkdir(target);
  let state = initialState(), tick = 1000, fail = 0, writes = 0, seq = 0;
  state.bindings = ['p1', 'p2'].map((projectId, index) => ({
    projectId, workspaceId: `w${index + 1}`, path: index ? target : source,
    retired: false, removed: false, archived: false, agentCanChangeStatus: true,
  }));
  state.preferences.selectedProject = 'p1';
  state.preferences.detail.p1 = { ratio: 55, group: 'done', sessionFilter: 'archived' };
  state.preferences.detail.p2 = { ratio: 60, group: 'pending', sessionFilter: 'active' };
  const workspaces: HostWorkspace[] = [
    { workspaceId: 'w1', path: source, title: '源', available: true, sessionIds: ['s1', 's2'] },
    { workspaceId: 'w2', path: target, title: '目标', available: true, sessionIds: ['s3'] },
  ];
  const sessions: HostSession[] = ['s1', 's2', 's3'].map((sessionId, i) => ({
    sessionId, title: '同标题', updatedAt: i + 1, archived: i === 1, running: false,
  }));
  const calls: string[] = [];
  const removed = new Set<string>();
  let removeFailure = false, registerSeq = 0;
  const host: HostPort = {
    workspaces: async () => structuredClone(workspaces.filter(w => !removed.has(w.workspaceId))), sessions: async () => structuredClone(sessions),
    remove: async id => {
      calls.push(`remove:${id}`);
      if (removeFailure) throw new Error('模拟登记移除失败');
      removed.add(id);
    },
    register: async (path, title) => {
      await stat(path);
      const workspace = { workspaceId: `registered-${++registerSeq}`, path, title: title ?? '', available: true, sessionIds: [] };
      workspaces.push(workspace); calls.push(`register:${workspace.workspaceId}`);
      return workspace;
    },
    rename: async () => { throw new Error('禁止改宿主目录'); },
    renameSession: async (id, title) => { calls.push(id); sessions.find(s => s.sessionId === id)!.title = title; },
    readSession: async () => ({ hasEarlier: false, messages: [] }),
    submit: async input => { calls.push(input.sessionId); },
  };
  const persistence = {
    get: () => structuredClone(state),
    set: async (next: typeof state) => {
      writes++;
      state = structuredClone(next);
      if (fail) { fail--; throw new Error('模拟落盘失败'); }
      await writeFile(`${file}.tmp`, JSON.stringify(next)); await rename(`${file}.tmp`, file);
    },
  };
  const service = () => new WorkbaseService(persistence, host, () => `id-${++seq}`, () => tick);
  await persistence.set(state);
  return { service: service(), restart: async () => {
    state = stateSchema.parse(JSON.parse(await readFile(file, 'utf8'))); return service();
  }, source, sessions, workspaces, calls, host, removed, state: () => state, writes: () => writes,
  removeFailure: (value: boolean) => { removeFailure = value; },
  fail: (count = 1) => { fail = count; }, advance: (ms: number) => { tick += ms; } };
}
const preview = (service: WorkbaseService) => service.previewProjectMigration(
  { projectId: 'p1', targetProjectId: 'p2' }, new AbortController().signal);

test('真实迁移一次提交，重启后归属、权限、待办和72小时撤销都保持', async t => {
  const f = await fixture(t);
  const todo = await f.service.createTodo({ projectId: 'p1', title: '源待办' });
  const targetTodo = await f.service.createTodo({ projectId: 'p2', title: '目标原有' });
  const settings = structuredClone(f.state().preferences.detail.p2);
  const p = await preview(f.service); assert.equal(p.executable, true);
  const writes = f.writes(), record = await f.service.confirmMigration(p.token);
  assert.equal(record.status, 'completed'); assert.equal(f.writes(), writes + 1);
  assert.equal(record.undoUntil - record.completedAt, MIGRATION_UNDO_MS);
  assert.equal(f.state().preferences.selectedProject, 'p2');
  assert.deepEqual(f.state().preferences.detail.p2, settings);
  assert.equal(f.state().todos.find(t => t.id === todo.id)!.projectId, 'p2');
  const restarted = await f.restart(), snapshot = await restarted.snapshot();
  assert.equal(snapshot.projects.some(p => p.projectId === 'p1'), false);
  assert.deepEqual(snapshot.projects.find(p => p.projectId === 'p2')!.sessions.map(s => s.sessionId), ['s1', 's2', 's3']);
  assert.equal(restarted.workspaceForSession('s1', 'w1'), 'w2');
  assert.equal((await restarted.listForAgent(restarted.workspaceForSession('s1', 'w1'))).projectId, 'p2');
  await assert.rejects(restarted.renameSession('p1', 's1', '错误项目'), /项目已迁入/);
  await restarted.renameSession('p2', 's1', '迁移后编辑');
  assert.equal((await restarted.sessionPreview({ projectId: 'p2', sessionId: 's1' })).title, '迁移后编辑');
  assert.equal((await restarted.migrationRecords('p1'))[0]!.canUndo, true);
  assert.equal((await restarted.migrationRecords('p2'))[0]!.id, record.id);
  const moved = f.state().todos.find(t => t.id === todo.id)!;
  await restarted.updateTodo({ id: moved.id, projectId: 'p2', expectedVersion: moved.version, title: '迁移后编辑' });
  const added = await restarted.createTodo({ projectId: 'p2', title: '目标新增' });
  const reverted = await restarted.undoMigration(record.id); assert.equal(reverted.status, 'reverted');
  const again = await f.restart(), after = await again.snapshot();
  assert.equal(after.projects.find(p => p.projectId === 'p1')!.todos[0]!.title, '迁移后编辑');
  assert.deepEqual(after.projects.find(p => p.projectId === 'p2')!.todos.map(t => t.id), [targetTodo.id, added.id]);
  assert.equal(again.workspaceForSession('s1', 'w1'), 'registered-1');
  assert.equal(after.projects.find(p => p.projectId === 'p1')!.sessions[0]!.title, '迁移后编辑');
});

test('持久化失败完整回滚，令牌可重试，重复确认和重启重试不重复迁移', async t => {
  const f = await fixture(t), p = await preview(f.service), before = structuredClone(f.state());
  f.fail(); await assert.rejects(f.service.confirmMigration(p.token), /模拟落盘失败/);
  assert.deepEqual(f.state(), before);
  const record = await f.service.confirmMigration(p.token), writes = f.writes();
  assert.deepEqual(await f.service.confirmMigration(p.token), record);
  const restarted = await f.restart();
  assert.deepEqual(await restarted.confirmMigration(p.token), record);
  assert.equal(f.writes(), writes); assert.equal(f.state().migrations.length, 1);
});

test('确认重新核验同数量但不同ID的宿主会话以及运行状态', async t => {
  const f = await fixture(t), p = await preview(f.service), before = structuredClone(f.state());
  f.sessions[0]!.running = true;
  await assert.rejects(f.service.confirmMigration(p.token), /运行中的会话/);
  f.sessions[0]!.running = false;
  f.sessions[0]!.sessionId = 's4'; f.workspaces[0]!.sessionIds = ['s4', 's2'];
  await assert.rejects(f.service.confirmMigration(p.token), /宿主项目或会话已变化/);
  assert.deepEqual(f.state(), before);
});

test('缺失源目录仍可迁移，撤销要求目录恢复且不创建目录', async t => {
  const f = await fixture(t);
  await f.service.createTodo({ projectId: 'p1', title: '保留待办' });
  await rm(f.source, { recursive: true }); f.workspaces[0]!.available = false;
  const p = await preview(f.service); assert.equal(p.executable, true);
  const r = await f.service.confirmMigration(p.token);
  assert.equal(f.state().todos[0]!.projectId, 'p2');
  await assert.rejects(f.service.undoMigration(r.id), { code: 'ENOENT' });
  assert.equal(f.state().todos[0]!.projectId, 'p2');
  await assert.rejects(readFile(f.source), { code: 'ENOENT' });
  await mkdir(f.source);
  await f.service.undoMigration(r.id);
  assert.equal(f.state().todos[0]!.projectId, 'p1');
});

test('撤销失败回滚且不复活已删除待办，目标已有同ID内容按最新编辑恢复原关联', async t => {
  const f = await fixture(t);
  const shared = await f.service.createTodo({ projectId: 'p2', title: '共享ID' });
  f.state().todos.push({ ...shared, projectId: 'p1' });
  const deleted = await f.service.createTodo({ projectId: 'p1', title: '之后删除' });
  const r = await f.service.confirmMigration((await preview(f.service)).token);
  const current = f.state().todos.find(t => t.id === deleted.id)!;
  await f.service.deleteTodo({ id: current.id, projectId: 'p2', expectedVersion: current.version });
  await f.service.updateTodo({ id: shared.id, projectId: 'p2', expectedVersion: shared.version, title: '共享编辑' });
  const before = structuredClone(f.state());
  f.fail(); await assert.rejects(f.service.undoMigration(r.id), /模拟落盘失败/);
  assert.deepEqual(f.state(), before);
  await f.service.undoMigration(r.id);
  assert.equal(f.state().todos.filter(t => t.id === shared.id).length, 2);
  assert.ok(f.state().todos.every(t => t.title === '共享编辑'));
  assert.ok(f.state().todos.every(t => t.id !== deleted.id));
  const writes = f.writes(); await f.service.undoMigration(r.id); assert.equal(f.writes(), writes);
});

test('撤销拒绝运行中、目标归档和72小时到期，重复并发确认只产生一批', async t => {
  const f = await fixture(t), p = await preview(f.service);
  const [r, same] = await Promise.all([f.service.confirmMigration(p.token), f.service.confirmMigration(p.token)]);
  assert.deepEqual(r, same);
  f.sessions[0]!.running = true; await assert.rejects(f.service.undoMigration(r.id), /运行中的会话/);
  f.sessions[0]!.running = false;
  f.state().bindings[1]!.archived = true; await assert.rejects(f.service.undoMigration(r.id), /项目已归档/);
  f.state().bindings[1]!.archived = false;
  f.advance(MIGRATION_UNDO_MS); await assert.rejects(f.service.undoMigration(r.id), /超过撤销期限/);
  assert.equal((await f.service.migrationRecords('p2'))[0]!.canUndo, false);
});

test('回滚也失败时隔离后续写入，重启读取磁盘结果后可继续', async t => {
  const f = await fixture(t), p = await preview(f.service);
  f.fail(2); await assert.rejects(f.service.confirmMigration(p.token), /回滚失败/);
  const writes = f.writes();
  await assert.rejects(f.service.confirmMigration(p.token), /存储状态未知/);
  await assert.rejects(f.service.createTodo({ projectId: 'p2', title: '不能覆盖未知结果' }), /存储状态未知/);
  assert.equal(f.writes(), writes);
  const restarted = await f.restart();
  const record = await restarted.confirmMigration((await preview(restarted)).token);
  assert.equal(record.status, 'completed');
});

test('备份恢复映射新的项目身份和宿主ID后保留迁移归属及撤销', async t => {
  const f = await fixture(t);
  const record = await f.service.confirmMigration((await preview(f.service)).token);
  const backup = await f.service.exportBackupState();
  f.state().bindings[0]!.projectId = 'new-source';
  f.state().bindings[1]!.projectId = 'new-target';
  f.state().bindings[0]!.workspaceId = 'new-w1';
  f.state().bindings[1]!.workspaceId = 'new-w2';
  f.workspaces[0]!.workspaceId = 'new-w1'; f.workspaces[1]!.workspaceId = 'new-w2';
  f.state().sessionOwnership.forEach(owner => { owner.projectId = 'new-target'; owner.workspaceId = 'new-w2'; });
  const inspect = await f.service.inspectRestore(backup); assert.deepEqual(inspect.blockers, []);
  await f.service.applyRestore(backup, inspect.revision, async () => {});
  assert.equal(f.service.workspaceForSession('s1', 'new-w1'), 'new-w2');
  assert.equal(f.state().migrations[0]!.source.projectId, 'new-source');
  assert.equal(f.state().migrations[0]!.source.workspaceId, 'new-w1');
  await f.service.undoMigration(record.id);
  assert.equal(f.service.workspaceForSession('s1', 'new-w1'), 'new-w1');
});

test('显式恢复被宿主重建的目标项目关联后保留迁入会话和撤销期限', async t => {
  const f = await fixture(t), r = await f.service.confirmMigration((await preview(f.service)).token);
  f.workspaces[1]!.workspaceId = 'recreated-w2';
  await f.service.resolveBinding({ projectId: 'p2', workspaceId: 'recreated-w2', choice: 'restore' });
  assert.equal(f.service.workspaceForSession('s1', 'w1'), 'recreated-w2');
  const record = (await f.service.migrationRecords('p1'))[0]!;
  assert.equal(record.canUndo, true); assert.equal(record.undoUntil, r.undoUntil);
  assert.equal((await f.service.snapshot()).projects.find(p => p.projectId === 'p2')!.sessions.length, 3);
  await f.service.undoMigration(r.id);
  assert.equal(f.service.workspaceForSession('s1', 'w1'), 'registered-1');
});

test('迁移源项目从列表与诊断移除，目标保留记录，到期和同步不让源项目重新出现', async t => {
  const f = await fixture(t);
  const r = await f.service.confirmMigration((await preview(f.service)).token);
  f.workspaces[0]!.available = false;
  const restarted = await f.restart();
  const snapshot = await restarted.snapshot();
  assert.deepEqual(snapshot.projects.map(p => p.projectId), ['p2']);
  assert.equal(snapshot.diagnostics?.issues.some(issue => issue.projectId === 'p1'), false);
  assert.equal(snapshot.conflicts.some(issue => issue.projectId === 'p1'), false);
  assert.equal(f.state().bindings.some(b => b.projectId === 'p1'), true, '撤销身份仍保留');
  assert.deepEqual((await f.host.workspaces()).map(w => w.workspaceId), ['w2'], '移除宿主源登记');
  assert.equal((await restarted.migrationRecords('p2'))[0]!.id, r.id);
  await assert.rejects(restarted.createTodo({ projectId: 'p1', title: '隐藏源不能编辑' }), /项目已迁入/);
  await assert.rejects(restarted.archiveProject({ projectId: 'p1', archived: true }), /项目已迁入/);
  await assert.rejects(preview(restarted), /项目已迁入/);
  f.advance(MIGRATION_UNDO_MS);
  assert.deepEqual((await restarted.snapshot()).projects.map(p => p.projectId), ['p2']);
  const record = (await restarted.migrationRecords('p2'))[0]!;
  assert.equal(record.expired, true); assert.equal(record.canUndo, false);
});

test('完成回执持久化后才移除宿主源，重复确认不重复移除；失败只补移除', async t => {
  const f = await fixture(t), p = await preview(f.service);
  f.fail();
  await assert.rejects(f.service.confirmMigration(p.token), /模拟落盘失败/);
  assert.equal(f.calls.length, 0);
  f.removeFailure(true);
  await assert.rejects(f.service.confirmMigration(p.token), /登记移除失败/);
  assert.equal(f.state().migrations.length, 1);
  assert.equal(f.state().sessionOwnership[0]!.projectId, 'p2');
  const writes = f.writes();
  f.removeFailure(false);
  await f.service.confirmMigration(p.token);
  await f.service.confirmMigration(p.token);
  assert.equal(f.writes(), writes);
  assert.deepEqual(f.calls, ['remove:w1', 'remove:w1']);
  assert.deepEqual((await f.host.workspaces()).map(w => w.workspaceId), ['w2']);
  assert.ok((await stat(f.source)).isDirectory());
});

test('同步补齐旧迁移移除，只删除回执的原登记，不删除后来同目录新登记', async t => {
  const f = await fixture(t);
  await f.service.confirmMigration((await preview(f.service)).token);
  f.removed.delete('w1'); f.calls.length = 0;
  const restarted = await f.restart();
  await restarted.snapshot();
  assert.deepEqual(f.calls, ['remove:w1']);
  const replacement = await f.host.register!(f.source, '重新打开');
  await restarted.snapshot();
  assert.ok((await f.host.workspaces()).some(w => w.workspaceId === replacement.workspaceId));
  await restarted.undoMigration(f.state().migrations[0]!.id);
  assert.equal(f.state().bindings[0]!.workspaceId, replacement.workspaceId);
  assert.equal(f.calls.filter(call => call.startsWith('register:')).length, 1);
});

test('撤销保存失败移除本次新登记，重试重新登记并更新全部会话身份', async t => {
  const f = await fixture(t), record = await f.service.confirmMigration((await preview(f.service)).token);
  const before = structuredClone(f.state());
  f.fail();
  await assert.rejects(f.service.undoMigration(record.id), /模拟落盘失败/);
  assert.deepEqual(f.state(), before);
  assert.deepEqual((await f.host.workspaces()).map(w => w.workspaceId), ['w2']);
  await f.service.undoMigration(record.id);
  assert.equal(f.state().bindings[0]!.workspaceId, 'registered-2');
  assert.equal(f.state().migrations[0]!.source.workspaceId, 'registered-2');
  assert.ok(f.state().sessionOwnership.every(owner => owner.workspaceId === 'registered-2'));
});

test('宿主移除报错但读回已删除时复用结果；旧批次运行或新增会话阻止清理', async t => {
  const f = await fixture(t);
  f.host.remove = async id => { f.removed.add(id); throw new Error('响应丢失'); };
  const record = await f.service.confirmMigration((await preview(f.service)).token);
  assert.equal(record.status, 'completed');
  f.removed.delete('w1');
  f.sessions[0]!.running = true;
  assert.match((await f.service.syncMigratedWorkspaces())[0]!, /运行中的会话/);
  assert.equal(f.removed.has('w1'), false);
  f.sessions[0]!.running = false;
  f.workspaces[0]!.sessionIds = [...f.workspaces[0]!.sessionIds, 's4'];
  f.sessions.push({ ...f.sessions[0]!, sessionId: 's4' });
  assert.match((await f.service.syncMigratedWorkspaces())[0]!, /新增会话/);
  assert.equal(f.removed.has('w1'), false);
});

test('已移除源登记的迁移备份可恢复并保留撤销；缺少宿主能力阻止新迁移', async t => {
  const f = await fixture(t), record = await f.service.confirmMigration((await preview(f.service)).token);
  const backup = await f.service.exportBackupState();
  const inspect = await f.service.inspectRestore(backup);
  assert.deepEqual(inspect.blockers, []);
  await f.service.applyRestore(backup, inspect.revision, async () => {});
  await f.service.undoMigration(record.id);
  assert.equal(f.service.workspaceForSession('s1', 'w1'), 'registered-1');
  delete f.host.remove;
  const p = await preview(f.service);
  assert.equal(p.executable, false);
  await assert.rejects(f.service.confirmMigration(p.token), /宿主未提供工作区/);
});
