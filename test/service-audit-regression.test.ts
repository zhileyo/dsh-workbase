import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkbaseService, type HostPort } from '../src/server/service.js';
import { initialState, todoSchema, type HostWorkspace } from '../src/shared/model.js';
import { dispatch } from '../src/server/rpc.js';
import { saveRuleFiles } from '../src/server/project-rules.js';

function fixture() {
  let state = initialState(), writes = 0, failAt = 0, generation = 'generation-1';
  const workspaces: HostWorkspace[] = ['1', '2'].map(id => ({
    workspaceId: `w${id}`, path: `/project${id}`, title: id, available: true, sessionIds: id === '1' ? ['s'] : [],
  }));
  state.bindings = workspaces.map((w, i) => ({ projectId: `p${i + 1}`, workspaceId: w.workspaceId,
    path: w.path, retired: false, removed: false, archived: false, agentCanChangeStatus: true }));
  let sessions = [{ sessionId: 's', title: '会话', updatedAt: 1, running: false, archived: false }];
  let deletes = 0, seq = 0;
  const host: HostPort = {
    workspaces: async () => structuredClone(workspaces), sessions: async () => structuredClone(sessions), rename: async () => {},
    sessionDeletionIdentity: async id => sessions.some(s => s.sessionId === id) ? generation : undefined,
    deleteSession: async id => {
      deletes++; sessions = sessions.filter(s => s.sessionId !== id);
      for (const w of workspaces) w.sessionIds = w.sessionIds.filter(s => s !== id);
    },
    remove: async id => { const index = workspaces.findIndex(w => w.workspaceId === id); if (index >= 0) workspaces.splice(index, 1); },
    register: async path => {
      const w = { workspaceId: `new-${++seq}`, path, title: '', available: true, sessionIds: [] };
      workspaces.push(w); return w;
    },
  };
  const persistence = { get: () => structuredClone(state), set: async (next: typeof state) => {
    if (++writes === failAt) throw new Error('模拟保存失败');
    state = structuredClone(next);
  } };
  const make = () => new WorkbaseService(persistence, host, () => `id-${++seq}`, () => 1000);
  return { service: make(), restart: make, host, persistence, workspaces, state: () => state,
    mutate: (fn: (value: typeof state) => void) => fn(state), deletes: () => deletes,
    failNext: (offset = 1) => { failAt = writes + offset; }, writes: () => writes };
}

test('A02 创建回执在网络丢失及服务重启后按请求身份复用', async () => {
  const f = fixture(); let creates = 0;
  f.host.begin = async () => {
    creates++;
    return { sessionId: 's' };
  };
  const command = { op: 'begin-session', projectId: 'p1', preset: 'standard',
    requestId: '11111111-1111-4111-8111-111111111111' };
  // 第一份成功回执在传输中丢失；下一次请求到重启后的服务。
  assert.equal((await dispatch(f.service, command, true, new AbortController().signal)).ok, true);
  const retry = await dispatch(f.restart(), command, true, new AbortController().signal);
  assert.equal(retry.ok, true);
  if (retry.ok) assert.deepEqual(retry.value, { sessionId: 's' });
  assert.equal(creates, 1);
  const changed = await dispatch(f.restart(), { ...command, projectId: 'p2' }, true, new AbortController().signal);
  assert.equal(changed.ok, false);
  assert.equal(creates, 1);
});

test('A02 宿主创建结果未知时重启后拒绝重复创建', async () => {
  const f = fixture(); let creates = 0;
  f.host.begin = async () => { creates++; throw new Error('回执丢失'); };
  const command = { op: 'begin-session', projectId: 'p1', preset: 'standard',
    requestId: '22222222-2222-4222-8222-222222222222' };
  assert.equal((await dispatch(f.service, command, true, new AbortController().signal)).ok, false);
  assert.equal((await dispatch(f.restart(), command, true, new AbortController().signal)).ok, false);
  assert.equal(creates, 1);
});

test('A02 创建意图保存失败不调用宿主，结果保存失败在本进程补齐回执', async () => {
  const f = fixture(); let creates = 0;
  f.host.begin = async () => { creates++; return { sessionId: 's' }; };
  const command = { op: 'begin-session', projectId: 'p1', preset: 'standard',
    requestId: '33333333-3333-4333-8333-333333333333' };
  f.failNext();
  assert.equal((await dispatch(f.service, command, true, new AbortController().signal)).ok, false);
  assert.equal(creates, 0);
  f.failNext(2);
  assert.equal((await dispatch(f.service, command, true, new AbortController().signal)).ok, false);
  assert.equal(creates, 1);
  assert.equal((await dispatch(f.service, command, true, new AbortController().signal)).ok, true);
  assert.equal(creates, 1);
  assert.equal((await dispatch(f.restart(), command, true, new AbortController().signal)).ok, true);
  assert.equal(creates, 1);
});

test('A02 创建成功但结果落盘失败，重启及恢复旧备份均不能再次创建', async () => {
  const f = fixture(), before = structuredClone(f.state()); let creates = 0;
  f.host.begin = async () => { creates++; return { sessionId: 's' }; };
  const command = { op: 'begin-session', projectId: 'p1', preset: 'standard',
    requestId: '44444444-4444-4444-8444-444444444444' };
  f.failNext(2);
  assert.equal((await dispatch(f.service, command, true, new AbortController().signal)).ok, false);
  const restarted = f.restart();
  await restarted.applyRestore(before, f.state().revision, async () => {});
  const result = await dispatch(restarted, command, true, new AbortController().signal);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error.message, /创建结果未知/);
  assert.equal(creates, 1);
  assert.equal(f.state().sessionCreations.length, 1);
});

test('A14 共享待办按项目复合身份撤销删除', async () => {
  const f = fixture();
  const todo = todoSchema.parse({ id: 'shared', projectId: 'p1', title: '共享', note: '', done: false,
    creator: 'user', createdAt: 1, updatedAt: 1, completedAt: null, version: 1 });
  f.mutate(s => { s.todos.push(todo, { ...todo, projectId: 'p2' }); });
  const deleted = await f.service.deleteTodo({ projectId: 'p1', id: todo.id, expectedVersion: 1 });
  await f.service.restoreDeletedTodo({ projectId: 'p1', token: deleted.undoToken });
  assert.equal(f.state().todos.filter(t => t.id === todo.id).length, 2);
});

test('A12 恢复双失败隔离所有后续工作台写入', async () => {
  const f = fixture(), restored = f.state(); restored.preferences.theme = 'warm';
  let writes = 0;
  const persistence = { get: f.persistence.get, set: async (next: typeof restored) => {
    writes++; f.mutate(s => Object.assign(s, next)); throw new Error('存储失败');
  } };
  const service = new WorkbaseService(persistence, f.host, () => 'id');
  await assert.rejects(service.applyRestore(restored, 0, async () => {}), /回滚/);
  const count = writes;
  for (const operation of [
    () => service.setPreferences({ theme: 'fresh' }),
    () => service.createTodo({ projectId: 'p1', title: '拒绝写入' }),
    () => service.repairDiagnostics({ kind: 'orphan', items: [] }, new AbortController().signal),
    () => service.confirmMigration('token'),
  ]) await assert.rejects(operation(), /存储状态未知/);
  assert.equal(writes, count);
});

test('A03 恢复之后旧revision的设置及偏好RPC被拒绝', async () => {
  const f = fixture(), restored = f.state(); restored.preferences.theme = 'warm';
  await f.service.applyRestore(restored, 0, async () => {});
  for (const command of [
    { op: 'settings', theme: 'fresh', permissions: {}, expectedRevision: 0 },
    { op: 'preferences', patch: { theme: 'fresh' }, expectedRevision: 0 },
  ]) {
    const result = await dispatch(f.service, command, true, new AbortController().signal);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'conflict');
  }
  assert.equal(f.state().preferences.theme, 'warm');
  const result = await dispatch(f.service, { op: 'settings', theme: 'fresh', permissions: {}, expectedRevision: 1 },
    true, new AbortController().signal);
  assert.equal(result.ok, true);
});

test('A15 删除意图先落盘，物理删除后的保存失败可在重启后补齐', async () => {
  const f = fixture();
  f.mutate(s => {
    s.sessionMarks.s = { pinned: true, favorite: true };
    s.sessionOwnership.push({ sessionId: 's', projectId: 'p1', workspaceId: 'w1', path: '/project1' });
  });
  f.failNext(2);
  await assert.rejects(f.service.deleteSession('p1', 's'), /保存失败/);
  assert.equal(f.deletes(), 1);
  const restarted = f.restart();
  await assert.rejects(restarted.deleteSession('p2', 's'), /不属于|归属/);
  await restarted.deleteSession('p1', 's');
  assert.equal(f.deletes(), 1);
  assert.equal(f.state().sessionMarks.s, undefined);
  assert.deepEqual(f.state().sessionOwnership, []);
  await assert.rejects(restarted.deleteSession('p1', 'arbitrary-missing'), /不属于|不存在/);
});

test('A15 删除意图持久化失败时不能进行物理删除', async () => {
  const f = fixture(); f.failNext();
  await assert.rejects(f.service.deleteSession('p1', 's'), /保存失败/);
  assert.equal(f.deletes(), 0);
});

test('A15 物理删除后适配器先改内存再保存失败时恢复持久回执', async () => {
  const f = fixture(), set = f.persistence.set;
  let writes = 0;
  f.persistence.set = async next => {
    await set(next);
    if (++writes === 2) throw new Error('部分保存失败');
  };
  await assert.rejects(f.service.deleteSession('p1', 's'), /部分保存失败/);
  assert.equal(f.state().pendingSessionDeletions.length, 1);
  await f.restart().deleteSession('p1', 's');
  assert.deepEqual(f.state().pendingSessionDeletions, []);
  assert.equal(f.deletes(), 1);
});

test('A15 同ID同列表内容但日志生命周期已替换时不能沿用旧回执删除', async () => {
  const f = fixture();
  f.host.deleteSession = async () => { throw new Error('删除前失败'); };
  await assert.rejects(f.service.deleteSession('p1', 's'), /删除前失败/);
  f.host.sessionDeletionIdentity = async () => 'replacement-generation';
  await assert.rejects(f.restart().deleteSession('p1', 's'), /生命周期/);
  assert.equal(f.deletes(), 0);
});

test('A15 列表已消失但日志仍存在不能仅凭not-found补齐删除', async () => {
  const f = fixture(); f.failNext(2);
  await assert.rejects(f.service.deleteSession('p1', 's'), /保存失败/);
  f.host.sessionDeletionIdentity = async () => 'generation-1';
  await assert.rejects(f.restart().deleteSession('p1', 's'), /日志|未确认/);
  assert.equal(f.state().pendingSessionDeletions.length, 1);
});

test('A03 规则预保存也校验revision，不能替旧设置取得恢复后的新revision', async () => {
  const f = fixture(), restored = f.state();
  await f.service.applyRestore(restored, 0, async () => {});
  const result = await dispatch(f.service, { op: 'rules-save', expectedRevision: 0,
    expectedRules: f.state().preferences.rules, rules: f.state().preferences.rules }, true, new AbortController().signal);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'conflict');
});

test('A03 相同偏好恢复后旧提交只持有自身规则保存水位，不能取得最新snapshot水位', async () => {
  const f = fixture();
  f.host.saveRules = async () => ({ rollback: async () => {} });
  const rules = f.state().preferences.rules, edited = structuredClone(rules); edited.global.content = '草稿';
  const own = await f.service.saveRules(rules, edited, 0);
  assert.equal(own.revision, 1);
  const restored = f.state();
  await f.service.applyRestore(restored, own.revision, async () => {});
  const snapshot = await f.restart().snapshot();
  assert.equal(snapshot.revision, 2);
  for (const command of [
    { op: 'settings', theme: 'fresh', permissions: {} },
    { op: 'preferences', patch: { theme: 'fresh' } },
    { op: 'rules-save', expectedRules: snapshot.preferences.rules, rules: snapshot.preferences.rules },
  ]) {
    const result = await dispatch(f.restart(), { ...command, expectedRevision: own.revision },
      true, new AbortController().signal);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'conflict');
  }
  assert.equal(f.state().preferences.theme, restored.preferences.theme);
});

test('A19 原生会话检查使用最新归档、归属和目录状态，创建重试复用已有ID', async () => {
  const f = fixture(), signal = new AbortController().signal;
  let created = 0;
  f.host.begin = async () => { created++; return { sessionId: 'new-session' }; };
  const check = () => dispatch(f.service, { op: 'native-session-check', workspaceId: 'w1', sessionId: 's' }, true, signal);
  assert.equal((await check()).ok, true);
  await f.service.archiveProject({ projectId: 'p1', archived: true });
  const archived = await check();
  assert.equal(archived.ok, false);
  if (!archived.ok) assert.equal(archived.error.code, 'archived');
  await f.service.archiveProject({ projectId: 'p1', archived: false });
  const reused = await dispatch(f.service, { op: 'begin-session', projectId: 'p1', preset: 'standard', sessionId: 's' }, true, signal);
  assert.equal(reused.ok, true);
  if (reused.ok) assert.deepEqual(reused.value, { sessionId: 's' });
  assert.equal(created, 0);
  assert.equal((await dispatch(f.service, { op: 'native-session-check', workspaceId: 'w2', sessionId: 's' }, true, signal)).ok, false);
  f.workspaces[0]!.available = false;
  assert.equal((await check()).ok, false);
});

test('A19 提交保护与归档共用队列，全部保护释放之前拒绝归档且非owner不能释放', async () => {
  const f = fixture(), signal = new AbortController().signal;
  const hold = () => dispatch(f.service, { op: 'native-session-check', workspaceId: 'w1', sessionId: 's', hold: true }, true, signal);
  const first = hold();
  const archive = f.service.archiveProject({ projectId: 'p1', archived: true });
  const blocked = assert.rejects(archive, /提交|结果未确认/);
  const result = await first;
  await blocked;
  assert.equal(result.ok, true);
  const token = (result as any).value.token;
  assert.equal(typeof token, 'string');
  const second = await hold();
  const token2 = (second as any).value.token;
  assert.notEqual(token, token2);
  const release = (token: string, owner = true) => dispatch(f.service, { op: 'native-session-release', token }, owner, signal);
  assert.equal((await release(token, false)).ok, false);
  await assert.rejects(f.service.archiveProject({ projectId: 'p1', archived: true }), /提交|结果未确认/);
  assert.equal((await release(token)).ok, true);
  assert.equal((await release(token)).ok, true, '释放幂等');
  await assert.rejects(f.service.archiveProject({ projectId: 'p1', archived: true }), /提交|结果未确认/);
  await f.service.archiveProject({ projectId: 'p2', archived: true });
  await release(token2);
  await f.service.archiveProject({ projectId: 'p1', archived: true });
  assert.equal(f.state().bindings[0]!.archived, true);
  assert.equal((await hold()).ok, false);
});

test('A19 保护无超时；只读检查及取消的保护请求不能留下令牌', async () => {
  const f = fixture(), signal = new AbortController().signal;
  const check = await dispatch(f.service, { op: 'native-session-check', workspaceId: 'w1', sessionId: 's' }, true, signal);
  assert.equal(check.ok, true);
  const abort = new AbortController(); abort.abort();
  assert.equal((await dispatch(f.service, { op: 'native-session-check', workspaceId: 'w1', sessionId: 's', hold: true }, true, abort.signal)).ok, false);
  await f.service.archiveProject({ projectId: 'p1', archived: true });
  await f.service.archiveProject({ projectId: 'p1', archived: false });
  assert.equal((await dispatch(f.service, { op: 'native-session-check', workspaceId: 'w1', hold: true }, true, signal)).ok, false);
  const held = await dispatch(f.service, { op: 'native-session-check', workspaceId: 'w1', sessionId: 's', hold: true }, true, signal);
  assert.equal(held.ok, true);
  await f.service.snapshot();
  await assert.rejects(f.service.archiveProject({ projectId: 'p1', archived: true }), /提交|结果未确认/);
});

test('A22 宿主已移除后抛错保持移除方向，并按原路径恢复身份', async () => {
  const f = fixture(), remove = f.host.remove!;
  f.host.remove = async id => { await remove(id); throw new Error('响应丢失'); };
  await f.service.removeProject('p1');
  assert.equal(f.state().bindings[0]!.removed, true);
  assert.equal((await f.service.addProject('/project1')).projectId, 'p1');
});

test('A22 宿主移除未知时保留回执，重试只核对而不重复移除', async () => {
  const f = fixture(), list = f.host.workspaces!;
  let removes = 0, unknown = false;
  f.host.remove = async () => { removes++; unknown = true; throw new Error('未知移除结果'); };
  f.host.workspaces = async () => { if (unknown) throw new Error('读回失败'); return list(); };
  await assert.rejects(f.service.removeProject('p1'), /读回|未知/);
  assert.equal(f.state().bindings[0]!.removed, true);
  unknown = false;
  await assert.rejects(f.restart().removeProject('p1'), /仍|失败|确认/);
  assert.equal(removes, 1);
  assert.equal(f.state().bindings[0]!.removed, false);
});

test('A13 迁移清理源区块，共享规则可编辑与停用，撤销按当前规则恢复源区块', async t => {
  const f = fixture(), root = await mkdtemp(join(tmpdir(), 'service-audit-rules-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home'); await mkdir(home);
  for (const [i, w] of f.workspaces.entries()) {
    w.path = join(root, `p${i + 1}`); await mkdir(w.path); await writeFile(join(w.path, 'AGENTS.md'), '# 原文\n');
    f.mutate(s => { s.bindings[i]!.path = w.path; });
  }
  const source = f.workspaces[0]!.path, target = f.workspaces[1]!.path;
  f.host.saveRules = (previous, next, targets) => saveRuleFiles(home, previous, next, targets);
  const rules = f.state().preferences.rules;
  const shared = structuredClone(rules);
  shared.projects.push({ id: 'shared', name: '共用规则', content: '初始正文', enabled: true, projectIds: ['p1', 'p2'] });
  await f.service.saveRules(rules, shared);
  const preview = await f.service.previewProjectMigration({ projectId: 'p1', targetProjectId: 'p2' }, new AbortController().signal);
  const record = await f.service.confirmMigration(preview.token);
  assert.equal(await readFile(join(source, 'AGENTS.md'), 'utf8'), '# 原文\n');
  const edited = structuredClone(f.state().preferences.rules); edited.projects[0]!.content = '更新正文';
  await f.service.saveRules(f.state().preferences.rules, edited);
  assert.match(await readFile(join(target, 'AGENTS.md'), 'utf8'), /更新正文/);
  await f.restart().undoMigration(record.id);
  assert.match(await readFile(join(source, 'AGENTS.md'), 'utf8'), /更新正文/);
  const migrated = await f.service.confirmMigration((await f.service.previewProjectMigration(
    { projectId: 'p1', targetProjectId: 'p2' }, new AbortController().signal)).token);
  const disabled = structuredClone(f.state().preferences.rules); disabled.projects[0]!.enabled = false;
  await f.service.saveRules(f.state().preferences.rules, disabled);
  assert.equal(await readFile(join(target, 'AGENTS.md'), 'utf8'), '# 原文\n');
  await f.service.undoMigration(migrated.id);
  assert.equal(await readFile(join(source, 'AGENTS.md'), 'utf8'), '# 原文\n');
  await f.service.saveRules(f.state().preferences.rules, { ...disabled, projects: [] });
});

test('A13 已有迁移的源区块安全清理，存储失败恢复文件后可重试', async t => {
  const f = fixture(), root = await mkdtemp(join(tmpdir(), 'service-audit-legacy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home'); await mkdir(home);
  for (const [i, w] of f.workspaces.entries()) {
    w.path = join(root, `p${i + 1}`); await mkdir(w.path); await writeFile(join(w.path, 'AGENTS.md'), '# 原文\n');
    f.mutate(s => { s.bindings[i]!.path = w.path; });
  }
  const source = f.workspaces[0]!.path;
  f.host.saveRules = (old, value, targets) => saveRuleFiles(home, old, value, targets);
  const empty = f.state().preferences.rules, rules = structuredClone(empty);
  rules.projects.push({ id: 'legacy', name: '规则', enabled: true, content: '旧正文', projectIds: ['p1', 'p2'] });
  await f.service.saveRules(empty, rules);
  const preview = await f.service.previewProjectMigration({ projectId: 'p1', targetProjectId: 'p2' }, new AbortController().signal);
  f.failNext();
  await assert.rejects(f.service.confirmMigration(preview.token), /保存失败/);
  assert.match(await readFile(join(source, 'AGENTS.md'), 'utf8'), /旧正文/);
  const record = await f.service.confirmMigration(preview.token);
  // 模拟升级前已完成迁移，但源文件与关联仍保留的持久状态。
  await saveRuleFiles(home, empty, rules, [{ projectId: 'p1', path: source }]);
  f.mutate(s => { s.detachedMigrationRules = []; });
  const edited = structuredClone(rules); edited.projects[0]!.content = '新正文';
  await f.restart().saveRules(rules, edited);
  assert.equal(await readFile(join(source, 'AGENTS.md'), 'utf8'), '# 原文\n');
  await f.restart().undoMigration(record.id);
  assert.match(await readFile(join(source, 'AGENTS.md'), 'utf8'), /新正文/);
});
