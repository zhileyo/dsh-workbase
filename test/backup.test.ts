import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, stat, link, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BackupManager } from '../src/server/backup.js';
import { initialState, preferencesSchema } from '../src/shared/model.js';
import { commandSchema } from '../src/shared/commands.js';
import { decryptArchive, encryptArchive, archiveFilename, publishArchive, inventory, verifyArchive } from '../src/server/backup-archive.js';
import { inspectArchive } from '../src/server/restore-archive.js';
import { personalFiles } from '../src/shared/personalization.js';
import { pruneBackups } from '../src/server/backup-retention.js';
import { x } from 'tar';
import { spawn, execFileSync } from 'node:child_process';
import { exportSessions, createBackupSources } from '../src/server/backup-sources.js';
import { copyObserved } from '../src/server/backup-files.js';
import { Header } from 'tar';
import { Encrypter, generateIdentity, identityToRecipient } from 'age-encryption';
import { createHash } from 'node:crypto';
import { WorkbaseService } from '../src/server/service.js';
import { dispatch } from '../src/server/rpc.js';
import type { Context } from '@deepseek-ai/cordis';

test('备份文件名采用本地时间和短标识，发布时拒绝覆盖同名文件', async t => {
  const time = new Date(2026, 10, 10, 18, 4, 26).getTime();
  const id = '5b1ac6a1-d530-47bb-aa24-d3e42f9f1f35';
  assert.equal(archiveFilename('backup', time, id), 'dsh-20261110-180426-5b1ac6a1.tar.age');
  assert.equal(archiveFilename('rollback', time, id), 'dsh-rollback-20261110-180426-5b1ac6a1.tar.age');
  const root = await mkdtemp(path.join(tmpdir(), 'wb-backup-name-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), target = path.join(root, 'target');
  await writeFile(source, 'new'); await writeFile(target, 'existing');
  await assert.rejects(publishArchive(source, target), /EEXIST/);
  assert.equal(await readFile(target, 'utf8'), 'existing');
  await publishArchive(source, path.join(root, 'published'));
  assert.equal(await readFile(path.join(root, 'published'), 'utf8'), 'new');
});

test('旧偏好默认关闭自动备份，增量命令不注入备份默认值', () => {
  const prefs = { ...initialState().preferences } as Record<string, unknown>;
  delete prefs.backup;
  assert.deepEqual(preferencesSchema.parse(prefs).backup, { directory: '', autoOnStartup: false, retentionDays: 0 });
  assert.deepEqual(commandSchema.parse({ op: 'preferences', patch: { backup: { directory: '/chosen' } } }),
    { op: 'preferences', patch: { backup: { directory: '/chosen' } } });
  for (const retentionDays of [0, 7, 14, 30]) assert.ok(commandSchema.safeParse({ op: 'preferences', patch: { backup: { retentionDays } } }).success);
  assert.equal(commandSchema.safeParse({ op: 'preferences', patch: { backup: { retentionDays: 1 } } }).success, false);
  assert.deepEqual(commandSchema.parse({ op: 'preferences', patch: { theme: 'warm' } }),
    { op: 'preferences', patch: { theme: 'warm' } });
  assert.equal(commandSchema.safeParse({ op: 'backup-start', directory: '/arbitrary' }).success, false);
});

test('盘点的39类范围都有导出或明确未支持策略，不退化成仅待办备份', async () => {
  const report = JSON.parse(await readFile('docs/backup-data-inventory.json', 'utf8'));
  const sources = await createBackupSources({ get: () => undefined } as unknown as Context, '/isolated-home',
    { workspaces: async () => [], sessions: async () => [], rename: async () => {} })();
  const ids = new Set(['workbase', ...sources.map(s => s.id)]);
  assert.equal(report.records.length, 39);
  for (const record of report.records) assert.ok(ids.has(record.id), `缺少策略：${record.id}`);
});

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-backup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'dsh'), out = path.join(root, 'out');
  await mkdir(home); await mkdir(out);
  const state = initialState();
  state.preferences.backup = { directory: out, autoOnStartup: true, retentionDays: 0 };
  const manager = new BackupManager({
    home, settings: () => state.preferences.backup, state: async () => state,
    sources: async () => [{ id: 'sample', path: path.join(home, 'sample') }],
    busy: async () => false,
  });
  t.after(() => manager.dispose());
  return { root, home, out, state, manager };
}
test('A04 四个根级私人档案按文件白名单加密归档，不扫描其他根级文件', async t => {
  const f = await fixture(t);
  for (const file of personalFiles) await writeFile(path.join(f.home, file), `synthetic-${file}`);
  await writeFile(path.join(f.home, 'NOT-PERSONAL.md'), 'excluded');
  const sources = (await createBackupSources({ get: () => undefined } as unknown as Context, f.home,
    { workspaces: async () => [], sessions: async () => [], rename: async () => {} })())
    .filter(source => personalFiles.some(file => source.path === path.join(f.home, file)));
  assert.equal(sources.length, 4);
  const manager = new BackupManager({ home: f.home, settings: () => f.state.preferences.backup,
    state: async () => f.state, sources: async () => sources, busy: async () => false });
  t.after(() => manager.dispose());
  await manager.start('manual'); await manager.settled();
  const result = await manager.status(); assert.equal(result.phase, 'completed', result.message);
  const stage = path.join(f.root, 'personal-inspect'); await mkdir(stage);
  const { manifest, payload } = await inspectArchive(result.path!, stage,
    (await readFile(result.keyPath!, 'utf8')).trim(), new AbortController().signal);
  for (const source of sources) {
    assert.equal(await readFile(path.join(payload, 'files', source.id), 'utf8'), `synthetic-${path.basename(source.path!)}`);
    assert.equal(result.coverage.find(row => row.id === source.id)?.status, 'observation');
  }
  assert.equal(manifest.files.some(file => file.path.includes('NOT-PERSONAL')), false);
});
test('A04 四个私人档案缺失时分别报告 absent，其他根级文件不补作备份源', async t => {
  const f = await fixture(t);
  const sources = (await createBackupSources({ get: () => undefined } as unknown as Context, f.home,
    { workspaces: async () => [], sessions: async () => [], rename: async () => {} })())
    .filter(source => source.id.startsWith('personal-'));
  const manager = new BackupManager({ home: f.home, settings: () => f.state.preferences.backup,
    state: async () => f.state, sources: async () => sources, busy: async () => false });
  t.after(() => manager.dispose());
  await manager.start('manual'); await manager.settled();
  const result = await manager.status();
  assert.equal(result.phase, 'completed', result.message);
  assert.equal(result.coverage.filter(row => row.id.startsWith('personal-') && row.status === 'absent').length, 4);
});
test('A05 加密回读在解包前拒绝真实大小写冲突条目，与恢复共用错误边界', async t => {
  const f = await fixture(t), key = await generateIdentity(), signal = new AbortController().signal;
  const data = Buffer.from('synthetic'), sha256 = createHash('sha256').update(data).digest('hex');
  const manifest = { format: 'dsh-workbase-online-backup' as const, version: 1 as const, globalConsistency: false as const,
    startedAt: 1, completedAt: 2, coverage: [], files: ['data', 'DATA'].map(name => ({ path: name, bytes: data.length, sha256 })) };
  const entry = (name: string, content: Buffer) => {
    const header = new Header({ path: name, type: 'File', size: content.length, mode: 0o600 });
    header.encode();
    return Buffer.concat([header.block!, content, Buffer.alloc((512 - content.length % 512) % 512)]);
  };
  const encrypter = new Encrypter(); encrypter.addRecipient(await identityToRecipient(key));
  const archive = path.join(f.root, 'case.age');
  await writeFile(archive, await encrypter.encrypt(Buffer.concat([
    entry('manifest.json', Buffer.from(JSON.stringify(manifest))), entry('data', data), entry('DATA', data), Buffer.alloc(1024),
  ])));
  const verify = path.join(f.root, 'case-verify'), restore = path.join(f.root, 'case-restore');
  await mkdir(verify); await mkdir(restore);
  await assert.rejects(verifyArchive(archive, verify, key, manifest, signal), /大小写冲突/);
  await assert.rejects(inspectArchive(archive, restore, key, signal), /大小写冲突/);
});
for (const names of [['normal:posix.txt'], ['Case.txt', 'case.txt']] as const) {
  test(`A05 无法恢复的路径 ${names.join(',')} 不发布成功归档`, async t => {
    const f = await fixture(t);
    await mkdir(path.join(f.home, 'sample'));
    // API 导出可构造大小写冲突，不依赖本机文件系统是否区分大小写。
    const manager = new BackupManager({ home: f.home, settings: () => f.state.preferences.backup,
      state: async () => f.state, busy: async () => false, sources: async () => [{
        id: 'sample', export: async dest => {
          for (const name of names) await writeFile(path.join(dest, name), 'synthetic');
          return 'sample';
        },
      }] });
    t.after(() => manager.dispose());
    if (names.length === 2) {
      // 在不区分大小写的 macOS 上不能构造两个实际文件，另用清单故障测试覆盖冲突。
      await writeFile(path.join(f.home, 'sample/Case.txt'), 'one');
      await writeFile(path.join(f.home, 'sample/case.txt'), 'two');
      if ((await readdir(path.join(f.home, 'sample'))).length !== 2) {
        t.skip('本机文件系统不区分大小写，清单冲突由独立故障测试覆盖'); return;
      }
    }
    await manager.start('manual'); await manager.settled();
    assert.equal((await manager.status()).phase, 'failed');
    assert.equal((await readdir(f.out)).some(name => name.endsWith('.age')), false);
  });
}
test('A05 导出回读拒绝恢复清单容量上限和清单大小写冲突', async t => {
  const f = await fixture(t), signal = new AbortController().signal;
  await f.manager.start('manual'); await f.manager.settled();
  const key = (await readFile((await f.manager.status()).keyPath!, 'utf8')).trim();
  for (const kind of ['schema', 'count', 'bytes', 'case'] as const) {
    const stage = path.join(f.root, kind); await mkdir(stage);
    await writeFile(path.join(stage, 'data.txt'), 'synthetic');
    const files = await inventory(stage, signal);
    if (kind === 'bytes') files[0]!.bytes = 32 * 1024 ** 3 + 1;
    if (kind === 'count') files.push(...Array.from({ length: 100000 }, (_, index) => ({
      path: `entry-${index}`, bytes: 0, sha256: '0'.repeat(64),
    })));
    if (kind === 'case') files.push({ ...files[0]!, path: 'DATA.txt' });
    const manifest = { format: 'dsh-workbase-online-backup' as const, version: 1 as const,
      globalConsistency: false as const, startedAt: 1, completedAt: 2, coverage: [], files };
    if (kind === 'schema') Object.assign(manifest, { startedAt: 'invalid' });
    await writeFile(path.join(stage, 'manifest.json'), JSON.stringify(manifest));
    const archive = path.join(f.root, `${kind}.age`); await encryptArchive(stage, archive, key, signal);
    const verify = path.join(f.root, `${kind}-verify`); await mkdir(verify);
    await assert.rejects(verifyArchive(archive, verify, key, manifest, signal));
  }
});

test('备份加密、回读摘要、保留断链记录，重开状态可读取', async t => {
  const f = await fixture(t);
  await mkdir(path.join(f.home, 'sample'));
  await writeFile(path.join(f.home, 'sample', 'secret.json'), '{"token":"private-sample"}');
  await symlink('missing', path.join(f.home, 'sample', 'broken'));
  const first = await f.manager.start('manual');
  const duplicate = await f.manager.start('manual');
  assert.equal(first.id, duplicate.id);
  await f.manager.settled();
  const result = await f.manager.status();
  assert.equal(result.phase, 'completed', result.message);
  assert.equal(result.coverage.find(c => c.id === 'sample')?.status, 'observation');
  assert.equal((await stat(result.path!)).mode & 0o777, 0o600);
  const encrypted = await readFile(result.path!);
  assert.equal(encrypted.includes(Buffer.from('private-sample')), false);
  const corrupt = path.join(f.root, 'corrupt.age');
  const changed = Buffer.from(encrypted); changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
  await writeFile(corrupt, changed);
  await assert.rejects(decryptArchive(corrupt, path.join(f.root, 'corrupt.tar'), (await readFile(result.keyPath!, 'utf8')).trim(),
    new AbortController().signal));
  const extract = path.join(f.root, 'extract');
  await mkdir(extract);
  const tar = path.join(extract, 'payload.tar');
  await decryptArchive(result.path!, tar, (await readFile(result.keyPath!, 'utf8')).trim(), new AbortController().signal);
  await x({ file: tar, cwd: extract });
  const manifest = JSON.parse(await readFile(path.join(extract, 'manifest.json'), 'utf8'));
  assert.equal(manifest.globalConsistency, false);
  assert.equal(await readFile(path.join(extract, 'files/sample/secret.json'), 'utf8'), '{"token":"private-sample"}');
  assert.ok(manifest.files.some((i: { path: string }) => i.path === 'links.json'));
  const other = new BackupManager({
    home: f.home, settings: () => f.state.preferences.backup,
    state: async () => f.state, sources: async () => [], busy: async () => false,
  });
  t.after(() => other.dispose());
  assert.equal((await other.status()).path, result.path);
});

test('禁止目的目录位于源目录内，失败不发布正式档', async t => {
  const f = await fixture(t);
  f.state.preferences.backup.directory = path.join(f.home, 'sample', 'backups');
  await f.manager.start('manual'); await f.manager.settled();
  assert.equal((await f.manager.status()).phase, 'failed');
  assert.equal((await readdir(f.home)).some(n => n.endsWith('.age')), false);
});

test('启动关闭时不执行，打开后等下次启动；单进程启动去重', async t => {
  const f = await fixture(t);
  f.state.preferences.backup.autoOnStartup = false;
  assert.equal((await f.manager.start('startup')).phase, 'idle');
  f.state.preferences.backup.autoOnStartup = true;
  assert.equal((await f.manager.start('startup')).phase, 'idle');
  assert.equal((await readdir(f.out)).length, 0);
});

test('备份 RPC 拒绝非 owner 和取消请求，启动返回任务而不等待归档', async () => {
  let starts = 0;
  const state = initialState();
  const service = new WorkbaseService({ get: () => state, set: async () => {} },
    { workspaces: async () => [], sessions: async () => [], rename: async () => {} }, () => 'id', Date.now, {
      status: async () => ({ phase: 'idle', message: '', coverage: [] }),
      start: async () => { starts++; return { phase: 'exporting', message: '', coverage: [] }; },
    });
  for (const op of ['backup-start', 'backup-startup', 'backup-status']) {
    const denied = await dispatch(service, { op }, false, new AbortController().signal);
    assert.equal(denied.ok, false);
  }
  const cancel = new AbortController(); cancel.abort();
  assert.equal((await dispatch(service, { op: 'backup-start' }, true, cancel.signal)).ok, false);
  assert.equal(starts, 0);
  assert.equal((await dispatch(service, { op: 'backup-start' }, true, new AbortController().signal)).ok, true);
  assert.equal(starts, 1);
});

test('启动任务在忙时延后，手动请求复用等待任务，宿主退出中断等待', async t => {
  const f = await fixture(t);
  let busy = true;
  const manager = new BackupManager({ home: f.home, settings: () => f.state.preferences.backup,
    state: async () => f.state, sources: async () => [], busy: async () => busy, retryMs: 5 });
  t.after(() => manager.dispose());
  const first = await manager.start('startup');
  assert.equal(first.phase, 'waiting');
  assert.equal((await manager.start('manual')).id, first.id);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await manager.status()).phase, 'waiting');
  busy = false;
  // 保留一个有引用的定时器，模拟宿主常驻事件循环。
  const keepAlive = setTimeout(() => {}, 1000);
  await manager.settled(); clearTimeout(keepAlive);
  assert.equal((await manager.status()).phase, 'completed');
  assert.equal((await manager.start('startup')).id, first.id);
  const interrupted = new BackupManager({ home: f.home, settings: () => f.state.preferences.backup,
    state: async () => f.state, sources: async () => [], busy: async () => true });
  await interrupted.start('startup'); interrupted.dispose(); await interrupted.settled();
  assert.equal((await interrupted.status()).phase, 'interrupted');
});

test('会话只读分块导出固定前缀，保留 fork 边界，活动追加不延长导出', async t => {
  const f = await fixture(t), dir = path.join(f.root, 'session-export');
  await mkdir(dir);
  const calls: string[] = [], meta = { id: '中文/会话', version: 4, createdAt: 1, isSeeded: true, parentSession: 'parent' };
  const events = Array.from({ length: 1100 }, (_, seq) => ({ seq, type: 'sample', value: seq }));
  await exportSessions({
    flush: async () => { calls.push('flush'); },
    list: async () => { calls.push('list'); return [{ header: meta, eventCount: 1025 }]; },
    open: async (id, access) => {
      assert.equal(id, meta.id); assert.equal(access, 'read');
      return { header: meta, inheritedEventCount: 6,
        read: async (offset, length) => { calls.push(`read:${offset}:${length}`); return { events: events.slice(offset, offset + length) }; },
        close: async () => { calls.push('close'); } };
    },
  }, dir, new AbortController().signal);
  assert.deepEqual(calls, ['flush', 'list', 'read:0:512', 'read:512:512', 'read:1024:1', 'close']);
  const index = JSON.parse(await readFile(path.join(dir, 'index.json'), 'utf8'));
  const lines = (await readFile(path.join(dir, index[0].file), 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1026);
  assert.equal(JSON.parse(lines[0]!).inheritedEventCount, 6);
  assert.equal(JSON.parse(lines.at(-1)!).seq, 1024);
});

test('缺少前缀长度或序号断裂拒绝会话导出，读句柄总会关闭', async t => {
  const f = await fixture(t), dir = path.join(f.root, 'bad-sessions');
  await mkdir(dir);
  const meta = { id: 's', version: 4, createdAt: 1, isSeeded: false };
  let closed = false;
  const persistence = { flush: async () => {}, list: async () => [{ header: meta }],
    open: async () => { throw new Error('不应打开'); } };
  await assert.rejects(exportSessions(persistence, dir, new AbortController().signal), /前缀长度/);
  await assert.rejects(exportSessions({
    ...persistence, list: async () => [{ header: meta, eventCount: 1 }],
    open: async () => ({ header: meta, inheritedEventCount: 0, read: async () => ({ events: [{ seq: 2 }] }),
      close: async () => { closed = true; } }),
  }, dir, new AbortController().signal), /序号/);
  assert.equal(closed, true);
});

test('SQLite 在线快照保留 WAL 已提交记录，硬链接和外部链接不丢失说明', async t => {
  const f = await fixture(t), source = path.join(f.home, 'sample'), dest = path.join(f.root, 'sqlite-copy');
  await mkdir(source);
  const db = path.join(source, 'index.db');
  const writer = spawn('sqlite3', [db], { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { writer.stdin.end(); writer.kill(); });
  const ready = new Promise<void>((resolve, reject) => {
    let output = '';
    writer.stdout.on('data', chunk => { output += String(chunk); if (output.includes('ready')) resolve(); });
    writer.once('error', reject);
    writer.once('exit', code => { if (!output.includes('ready')) reject(new Error(`SQLite fixture exited: ${code}`)); });
  });
  writer.stdin.write("PRAGMA journal_mode=WAL;\nCREATE TABLE items(value TEXT);\nINSERT INTO items VALUES('committed-in-wal');\nSELECT 'ready';\n");
  await ready;
  assert.ok((await stat(`${db}-wal`)).size > 0);
  await writeFile(path.join(source, 'file'), 'linked-data'); await link(path.join(source, 'file'), path.join(source, 'alias'));
  await symlink(path.join(f.root, 'outside'), path.join(source, 'external'));
  const links: Parameters<typeof copyObserved>[3] = [];
  const copied = await copyObserved(source, dest, new AbortController().signal, links, 'files/sample');
  assert.equal(copied.sqlite, 1);
  assert.equal(execFileSync('sqlite3', ['-readonly', path.join(dest, 'index.db'), 'SELECT value FROM items;'], { encoding: 'utf8' }).trim(), 'committed-in-wal');
  assert.ok(links.some(i => i.type === 'hardlink'));
  assert.ok(links.some(i => i.type === 'symlink' && i.target.endsWith('outside')));
  assert.equal((await readdir(dest)).includes('external'), false);
  assert.equal((await readdir(dest)).includes('index.db-wal'), false);
});

test('密钥权限异常或目的目录不可用不生成正式备份，未完成任务重启显示中断', async t => {
  const f = await fixture(t);
  await mkdir(path.join(f.home, 'backup'));
  await writeFile(path.join(f.home, 'backup/identity.txt'), 'not-a-key');
  await chmod(path.join(f.home, 'backup/identity.txt'), 0o644);
  await f.manager.start('manual'); await f.manager.settled();
  assert.equal((await f.manager.status()).phase, 'failed');
  assert.equal((await readdir(f.out)).length, 0);
  const notDirectory = path.join(f.root, 'not-directory');
  await writeFile(notDirectory, 'fixture');
  f.state.preferences.backup.directory = notDirectory;
  await f.manager.start('manual'); await f.manager.settled();
  assert.equal((await f.manager.status()).phase, 'failed');
  assert.equal((await readdir(f.out)).length, 0);
  await writeFile(path.join(f.home, 'backup/last-result.json'), JSON.stringify({ phase: 'exporting', message: '', coverage: [] }));
  const manager = new BackupManager({ home: f.home, settings: () => f.state.preferences.backup,
    state: async () => f.state, sources: async () => [], busy: async () => false });
  t.after(() => manager.dispose());
  assert.equal((await manager.status()).phase, 'interrupted');
});

test('磁盘配额错误中止整项任务，不发布半份正式档', async t => {
  const f = await fixture(t);
  const manager = new BackupManager({ home: f.home, settings: () => f.state.preferences.backup,
    state: async () => f.state, busy: async () => false, sources: async () => [{
      id: 'full-disk', export: async () => { throw Object.assign(new Error('测试磁盘已满'), { code: 'ENOSPC' }); },
    }] });
  t.after(() => manager.dispose());
  await manager.start('manual'); await manager.settled();
  assert.equal((await manager.status()).phase, 'failed');
  assert.equal((await readdir(f.out)).length, 0);
});

test('备份配置按正式存储保存，旧设置和其他增量命令不重置自动选择', async () => {
  let state = initialState();
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } },
    { workspaces: async () => [], sessions: async () => [], rename: async () => {} }, () => 'id');
  await service.setPreferences({ backup: { directory: '/chosen', autoOnStartup: true, retentionDays: 14 } });
  await service.setPreferences({ backup: { directory: '/chosen' } });
  await service.saveSettings('warm', {}, { home: state.preferences.home, root: '' });
  assert.deepEqual((await service.exportBackupState()).preferences.backup, { directory: '/chosen', autoOnStartup: true, retentionDays: 14 });
});

test('有限保留只删除校验通过且清单已过期的普通备份，永久与回滚不清理', async t => {
  const f = await fixture(t);
  await f.manager.start('manual'); await f.manager.settled();
  const result = await f.manager.status(), key = (await readFile(result.keyPath!, 'utf8')).trim();
  const stage = path.join(f.root, 'old'); await mkdir(stage);
  const oldTime = Date.now() - 31 * 86400000;
  await writeFile(path.join(stage, 'manifest.json'), JSON.stringify({
    format: 'dsh-workbase-online-backup', version: 1, globalConsistency: false,
    startedAt: oldTime, completedAt: oldTime, coverage: [], files: [],
  }));
  const old = path.join(f.out, archiveFilename('backup', oldTime, 'aaaaaaaa'));
  const rollback = path.join(f.out, archiveFilename('rollback', oldTime, 'bbbbbbbb'));
  await encryptArchive(stage, old, key, new AbortController().signal);
  await encryptArchive(stage, rollback, key, new AbortController().signal);
  const broken = path.join(f.out, archiveFilename('backup', oldTime, 'cccccccc'));
  await writeFile(broken, 'broken');
  const alias = path.join(f.out, archiveFilename('backup', oldTime, 'dddddddd'));
  await symlink(old, alias);
  await pruneBackups(f.out, 0, result.path!, key, new AbortController().signal);
  assert.ok((await readdir(f.out)).includes(path.basename(old)));
  const cleaned = await pruneBackups(f.out, 30, result.path!, key, new AbortController().signal);
  assert.equal(cleaned.removed, 1);
  assert.equal(cleaned.skipped, 1);
  for (const file of [rollback, broken, alias, result.path!]) assert.ok((await readdir(f.out)).includes(path.basename(file)));
  await encryptArchive(stage, old, key, new AbortController().signal);
  f.state.preferences.backup.retentionDays = 30;
  f.state.preferences.backup.directory = path.join(f.home, 'sample', 'backups');
  await f.manager.start('manual'); await f.manager.settled();
  assert.equal((await f.manager.status()).phase, 'failed');
  assert.ok((await readdir(f.out)).includes(path.basename(old)), '新备份失败不得删除旧档');
  f.state.preferences.backup.directory = f.out;
  await f.manager.start('manual'); await f.manager.settled();
  const latest = await f.manager.status();
  assert.equal(latest.phase, 'completed', latest.message);
  assert.ok(!(await readdir(f.out)).includes(path.basename(old)));
  assert.ok((await readdir(f.out)).includes(path.basename(latest.path!)));
  assert.match(latest.message, /已清理 1 份过期备份/);
});
