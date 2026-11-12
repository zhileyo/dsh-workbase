import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Header } from 'tar';
import { Encrypter, generateIdentity, identityToRecipient } from 'age-encryption';
import { inspectArchive, archivePathSafe } from '../src/server/restore-archive.js';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BackupManager } from '../src/server/backup.js';
import { RestoreManager } from '../src/server/restore.js';
import { initialState } from '../src/shared/model.js';
import { WorkbaseService } from '../src/server/service.js';
import { dispatch } from '../src/server/rpc.js';

async function fixture(t: TestContext, ttlMs?: number) {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-restore-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'dsh'), out = path.join(root, 'backups'), recovered = path.join(root, 'recovered');
  await mkdir(home); await mkdir(out); await mkdir(recovered);
  let state = initialState(), fail = false;
  state.preferences.backup.directory = out;
  const backup = new BackupManager({ home, state: async () => state,
    settings: () => state.preferences.backup, sources: async () => [], busy: async () => false });
  const service = new WorkbaseService({ get: () => state, set: async next => {
    if (fail) { fail = false; throw new Error('写入失败'); }
    state = next;
  } }, { workspaces: async () => [], sessions: async () => [], rename: async () => {} }, () => 'id');
  const restore = new RestoreManager({ home, backup, state: () => service.exportBackupState(),
    inspect: value => service.inspectRestore(value), apply: (value, revision, before) => service.applyRestore(value, revision, before),
    roots: async () => [home], ttlMs });
  t.after(() => { restore.dispose(); backup.dispose(); });
  await backup.start('manual'); await backup.settled();
  const archived = await backup.status();
  const run = {
    preview: async (input: Parameters<RestoreManager['preview']>[0]) => {
      await restore.preview(input); await restore.settled(); return restore.status();
    },
    confirm: async (input: Parameters<RestoreManager['confirm']>[0]) => {
      await restore.confirm(input); await restore.settled(); return restore.status();
    },
  };
  return { root, home, out, recovered, backup, restore: run, manager: restore, service,
    archive: archived.path!, keyPath: archived.keyPath!, state: () => state, fail: () => { fail = true; } };
}
test('恢复必须先校验预览，确认后更新正式存储并保存可读取的加密回滚副本', async t => {
  const f = await fixture(t);
  await f.service.setPreferences({ theme: 'warm' });
  const ready = await f.restore.preview({ archive: f.archive, keyPath: '' });
  assert.equal(ready.phase, 'ready'); assert.equal(f.state().preferences.theme, 'warm');
  assert.equal(ready.preview!.revision, 1);
  const result = await f.restore.confirm({ token: ready.preview!.token, mode: 'workbase' });
  assert.equal(result.phase, 'completed'); assert.equal(f.state().preferences.theme, 'follow');
  assert.equal(f.state().revision, 2);
  const rollback = await f.restore.preview({ archive: result.result!.path, keyPath: '' });
  assert.equal(rollback.phase, 'ready');
  await f.restore.confirm({ token: rollback.preview!.token, mode: 'workbase' });
  assert.equal(f.state().preferences.theme, 'warm');
  assert.equal(f.state().revision, 3);
});
test('预览后发生写入则拒绝覆盖，失效 token 和重复确认不执行恢复', async t => {
  const f = await fixture(t);
  const ready = await f.restore.preview({ archive: f.archive, keyPath: '' });
  await f.service.setPreferences({ theme: 'warm' });
  const failed = await f.restore.confirm({ token: ready.preview!.token, mode: 'workbase' });
  assert.equal(failed.phase, 'failed'); assert.equal(f.state().preferences.theme, 'warm');
  await assert.rejects(f.restore.confirm({ token: 'forged', mode: 'workbase' }));
  await assert.rejects(f.restore.confirm({ token: ready.preview!.token, mode: 'workbase' }));
});
test('写入失败保留原状态和加密回滚副本', async t => {
  const f = await fixture(t);
  await f.service.setPreferences({ theme: 'warm' });
  const ready = await f.restore.preview({ archive: f.archive, keyPath: '' });
  f.fail();
  const result = await f.restore.confirm({ token: ready.preview!.token, mode: 'workbase' });
  assert.equal(result.phase, 'failed'); assert.equal(f.state().preferences.theme, 'warm');
  assert.ok(result.result?.path);
  assert.ok((await readFile(result.result!.path)).length);
});
test('完整归档恢复到新的隔离目录，不替换现有目录或重建外部链接', async t => {
  const f = await fixture(t);
  const ready = await f.restore.preview({ archive: f.archive, keyPath: '' });
  const result = await f.restore.confirm({ token: ready.preview!.token, mode: 'directory', directory: f.recovered });
  assert.equal(result.phase, 'completed');
  const restored = JSON.parse(await readFile(path.join(result.result!.path, 'workbase.json'), 'utf8'));
  assert.equal(restored.revision, 0); assert.equal(f.state().revision, 0);
  assert.equal((await readdir(f.recovered)).length, 1);
});
test('损坏的归档、错误密钥、目录越界均不能激活恢复', async t => {
  const f = await fixture(t);
  const bad = path.join(f.root, 'bad.age'); await writeFile(bad, 'bad-archive');
  assert.equal((await f.restore.preview({ archive: bad, keyPath: '' })).phase, 'failed');
  const ready = await f.restore.preview({ archive: f.archive, keyPath: '' });
  const result = await f.restore.confirm({ token: ready.preview!.token, mode: 'directory', directory: f.home });
  assert.equal(result.phase, 'failed'); assert.equal(f.state().revision, 0);
});
test('恢复RPC仅owner可用，前端不能伪造恢复状态或省略确认', async () => {
  const state = initialState();
  const service = new WorkbaseService({ get: () => state, set: async () => {} },
    { workspaces: async () => [], sessions: async () => [], rename: async () => {} }, () => 'id');
  for (const op of ['restore-status', 'restore-catalog', 'restore-preview', 'restore-confirm', 'restore-discard']) {
    assert.equal((await dispatch(service, { op }, false, new AbortController().signal)).ok, false);
  }
  for (const payload of [{ op: 'restore-confirm', mode: 'workbase' }, { op: 'restore-preview', archive: '/file', state }]) {
    assert.equal((await dispatch(service, payload, true, new AbortController().signal)).ok, false);
  }
});
test('恢复预览通过真实RPC传给管理器，默认与指定密钥均可校验且不修改状态', async t => {
  const f = await fixture(t);
  const gateway = new WorkbaseService({ get: () => f.state(), set: async () => { throw new Error('预览不得写入'); } },
    { workspaces: async () => [], sessions: async () => [], rename: async () => {} }, () => 'id', Date.now, f.backup, f.manager);
  for (const keyPath of ['', f.keyPath]) {
    const response = await dispatch(gateway, { op: 'restore-preview', archive: f.archive, keyPath }, true, new AbortController().signal);
    assert.equal(response.ok, true, JSON.stringify(response));
    await f.manager.settled();
    const ready = await f.manager.status();
    assert.equal(ready.phase, 'ready', ready.message);
    assert.equal(ready.preview!.archive, f.archive);
    assert.equal(f.state().revision, 0);
    assert.equal((await dispatch(gateway, { op: 'restore-discard', token: ready.preview!.token }, true,
      new AbortController().signal)).ok, true);
  }
});
test('最近备份与回滚列表排除链接，取消预览销毁确认令牌', async t => {
  const f = await fixture(t);
  await symlink(f.archive, path.join(f.out, 'link.tar.age'));
  assert.equal((await f.manager.catalog()).length, 1);
  const ready = await f.restore.preview({ archive: f.archive, keyPath: '' });
  assert.equal((await f.manager.discard(ready.preview!.token)).phase, 'idle');
  await assert.rejects(f.restore.confirm({ token: ready.preview!.token, mode: 'workbase' }));
});
test('错误密钥和过期预览均不能确认', async t => {
  const f = await fixture(t, 1000);
  const wrong = path.join(f.root, 'wrong-key.txt');
  await writeFile(wrong, await generateIdentity(), { mode: 0o600 });
  assert.equal((await f.restore.preview({ archive: f.archive, keyPath: wrong })).phase, 'failed');
  const ready = await f.restore.preview({ archive: f.archive, keyPath: '' });
  // 注入固定过去时间，无需等待真实计时器。
  const now = Date.now;
  Date.now = () => ready.preview!.expiresAt + 1;
  try { await assert.rejects(f.manager.confirm({ token: ready.preview!.token, mode: 'workbase' })); }
  finally { Date.now = now; }
});
test('预览后文件或清单变化拒绝目录发布', async t => {
  const f = await fixture(t);
  for (const file of ['workbase.json', 'manifest.json']) {
    const ready = await f.restore.preview({ archive: f.archive, keyPath: '' });
    const stage = path.join(f.home, 'backup', 'restore-staging', (await readdir(path.join(f.home, 'backup', 'restore-staging')))[0]!, 'payload');
    await writeFile(path.join(stage, file), '{}');
    const result = await f.restore.confirm({ token: ready.preview!.token, mode: 'directory', directory: f.recovered });
    assert.equal(result.phase, 'failed'); assert.equal((await readdir(f.recovered)).length, 0);
  }
});
test('预览、确认与备份互斥，停机等待预约期间不会启动恢复', async t => {
  const f = await fixture(t);
  await f.manager.preview({ archive: f.archive, keyPath: '' });
  await assert.rejects(f.manager.preview({ archive: f.archive, keyPath: '' }));
  await assert.rejects(f.backup.start('manual'));
  await f.manager.settled();
  let released = false, resolve!: (release: () => void) => void;
  const manager = new RestoreManager({ home: f.home, backup: { reserveRestore: () => new Promise(r => { resolve = r; }) },
    state: async () => f.state(), inspect: v => f.service.inspectRestore(v),
    apply: (v, rev, cb) => f.service.applyRestore(v, rev, cb), roots: async () => [f.home] });
  await manager.status();
  const task = manager.preview({ archive: f.archive, keyPath: '' });
  while (!resolve) await Promise.resolve();
  manager.dispose(); resolve(() => { released = true; });
  await assert.rejects(task, /已停止/); assert.equal(released, true);
});
test('部分写入失败自动恢复原数据，回滚再次失败返回明确错误且副本先完成', async () => {
  for (const rollbackFails of [false, true]) {
    let state = initialState(), writes = 0, saved = false;
    const input = initialState(); input.preferences.theme = 'warm';
    const service = new WorkbaseService({ get: () => state, set: async next => {
      assert.equal(saved, true);
      if (++writes === 1) { state = next; throw new Error('部分写入失败'); }
      if (rollbackFails) throw new Error('回滚失败');
      state = next;
    } }, { workspaces: async () => [], sessions: async () => [], rename: async () => {} }, () => 'id');
    await assert.rejects(service.applyRestore(input, 0, async () => { saved = true; }), rollbackFails ? /自动回滚均失败/ : /部分写入失败/);
    assert.equal(writes, 2);
    if (!rollbackFails) { assert.equal(state.preferences.theme, 'follow'); assert.equal(state.revision, 2); }
  }
});
test('工作台恢复拒绝无法核实的工作树归属且保留当前备份配置', async t => {
  const f = await fixture(t);
  const input = initialState();
  input.bindings.push({ projectId: 'p', workspaceId: 'old', path: '/project', agentCanChangeStatus: true, archived: false, retired: false, removed: false });
  input.worktreeSessions.push({ sessionId: 'foreign', projectId: 'p' });
  const check = await f.service.inspectRestore(input);
  assert.ok(check.blockers.some(b => b.includes('工作树会话')));
  const ready = await f.restore.preview({ archive: f.archive, keyPath: '' });
  await f.restore.confirm({ token: ready.preview!.token, mode: 'workbase' });
  assert.equal(f.state().preferences.backup.directory, f.out);
  assert.equal(f.state().preferences.pluginAutoUpdate, false);
});
test('恢复扫描拒绝穿越、链接、重复条目、漏清单和伪造摘要', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-restore-attack-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const key = await generateIdentity();
  const content = Buffer.from('payload');
  const manifest = Buffer.from(JSON.stringify({ format: 'dsh-workbase-online-backup', version: 1, globalConsistency: false,
    startedAt: 0, completedAt: 0, coverage: [], files: [{ path: 'data', bytes: content.length,
      sha256: createHash('sha256').update(content).digest('hex') }] }));
  const entry = (name: string, data = Buffer.alloc(0), type: 'File' | 'SymbolicLink' = 'File') => {
    const header = new Header({ path: name, type, size: data.length, mode: 0o600, linkpath: type === 'SymbolicLink' ? '/outside' : '' });
    header.encode();
    return Buffer.concat([header.block!, data, Buffer.alloc((512 - data.length % 512) % 512)]);
  };
  const valid = [entry('manifest.json', manifest), entry('data', content)];
  const cases = [
    [...valid, entry('../outside', content)], [...valid, entry('link', Buffer.alloc(0), 'SymbolicLink')],
    [...valid, entry('data', content)], [entry('data', content)],
    [entry('manifest.json', manifest), entry('data', Buffer.from('altered'))],
    [...valid, entry('DATA', content)],
  ];
  for (const [i, entries] of cases.entries()) {
    const encrypter = new Encrypter(); encrypter.addRecipient(await identityToRecipient(key));
    const encrypted = await encrypter.encrypt(Buffer.concat([...entries, Buffer.alloc(1024)]));
    const archive = path.join(root, `${i}.age`), stage = path.join(root, `stage-${i}`);
    await writeFile(archive, encrypted); await mkdir(stage);
    await assert.rejects(inspectArchive(archive, stage, key, new AbortController().signal));
    assert.equal((await readdir(root)).includes('outside'), false);
  }
  for (const name of ['../x', '/x', 'a\\b', 'a:b', 'NUL.txt', 'x./a', 'a//b']) assert.equal(archivePathSafe(name), false);
});
