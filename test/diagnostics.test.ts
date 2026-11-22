import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Context } from '@deepseek-ai/cordis';
import { createHost } from '../src/server/host.js';
import { createDiagnostics } from '../src/server/diagnostics.js';
import type { createSessionMaintenance, DeleteOptions } from '../src/server/session-maintenance.js';
import { WorkbaseService } from '../src/server/service.js';
import { dispatch } from '../src/server/rpc.js';
import { initialState } from '../src/shared/model.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

function fixture() {
  const header = (id: string, extra: { origin?: string; parentSession?: string; isSeeded?: boolean; cwd?: string } = {}) =>
    ({ id, version: 4, createdAt: 42, cwd: '/project', isSeeded: false, ...extra });
  const rows = [
    header('workspace'), header('archive'), header('ungrouped', { cwd: '/other' }),
    header('partial'), header('valid'), header('live'), header('busy'), header('im:channel'),
    header('fork', { parentSession: 'gone', isSeeded: true }),
    header('orphan', { origin: 'subagent', parentSession: 'gone' }),
    header('seeded', { origin: 'subagent', parentSession: 'gone', isSeeded: true }),
    header('protected', { origin: 'subagent', parentSession: 'broken-parent' }),
    header('live-child', { origin: 'subagent', parentSession: 'gone' }),
  ];
  const snapshots = new Map<string, unknown>([
    ['valid', { values: { title: null }, asOfSeq: -1 }],
    ['partial', { values: { unrelated: true }, asOfSeq: 1 }],
    ['fork', { values: { title: { title: '分支' } }, asOfSeq: 1 }],
  ]);
  const writes: string[] = [], reads: string[] = [];
  const logEvents = new Map<string, unknown[]>();
  const cache = {
    cachedSnapshot: (h: { id: string }) => snapshots.get(h.id),
    // 官方 coldSnapshot 语义：折叠完整日志、回写缓存行、返回投影快照。
    coldSnapshot: (h: { id: string }, _inherited: number, events: unknown[]) => {
      writes.push('cache');
      const blank = !events.some(event => (event as { type?: string }).type === 'turn/start');
      let lastPromptAt: number | null = null;
      for (const event of events)
        if ((event as { type?: string }).type === 'user/message') lastPromptAt = (event as { time?: number }).time ?? 0;
      const metadata = { blank, lastPromptAt };
      snapshots.set(h.id, { values: { sessionListMetadata: metadata }, asOfSeq: events.length - 1 });
      return { asOfSeq: events.length - 1, values: { sessionListMetadata: metadata } };
    },
  };
  const sessions = { get: (id: string) => ['live', 'live-child'].includes(id) ? { id } : undefined, list: () => [{ id: 'live' }, { id: 'live-child' }] };
  const persistence = {
    list: async () => rows.map(h => ({ header: h, sizeBytes: 123 })),
    stat: async (id: string) => { const h = rows.find(h => h.id === id); return h ? { header: h } : undefined; },
    findLog: async (id: string) => id === 'broken-parent' || rows.some(h => h.id === id) ? { path: '/stored' } : undefined,
    open: async (id: string) => {
      reads.push(id);
      const header = rows.find(h => h.id === id);
      if (!header) throw new Error(`存储中没有会话 ${id}`);
      return { header, inheritedEventCount: 0,
        read: async () => ({ events: logEvents.get(id) ?? [] }), close: async () => {} };
    },
  };
  const workspace = { id: 'w', path: '/project', title: '项目', sessionIds: ['workspace'], status: async () => 'ok' };
  const registry: Record<string, unknown> = { list: () => [workspace], archivedSessionIds: ['archive'] };
  const services: Record<string, unknown> = { sessionProjectionCache: cache, sessionPersistence: persistence, sessions };
  const ctx = {
    get: (name: string) => services[name],
    workspaceRegistry: registry,
    waterfall: async (_: string, { sessionId }: { sessionId: string }) => sessionId === 'busy' ? [{ kind: 'running' }] : [],
  } as unknown as Context;
  // 检测与候选复查用真实实现；磁盘维护单独由 session-maintenance.test 覆盖。
  const supported = { cache: true, orphan: true, empty: true };
  const maintenance: ReturnType<typeof createSessionMaintenance> = {
    capabilities: () => supported,
    exclusive: operation => operation(),
    deletionIdentity: async () => 'generation',
    deleteSession: async () => true,
    deleteWithinQueue: async (_id: string, options: DeleteOptions) => !options.validate || await options.validate(),
    rebuildWithinQueue: async () => true,
  };
  const host = { ...createHost(ctx), ...createDiagnostics(ctx, maintenance) };
  return { host, rows, snapshots, services, persistence, registry, writes, reads, logEvents, maintenance, supported, ctx };
}

test('空会话检测使用官方blank与lastPromptAt，排除输入会话、活动、fork、子代理和有后代的会话', async () => {
  const f = fixture();
  for (const h of f.rows) f.snapshots.set(h.id, { values: { title: null,
    sessionListMetadata: { blank: true, lastPromptAt: null } }, asOfSeq: 2 });
  f.snapshots.set('valid', { values: { title: null, sessionListMetadata: { blank: false, lastPromptAt: 42 } } });
  f.snapshots.set('partial', { values: { title: null, sessionListMetadata: { blank: true, lastPromptAt: 42 } } });
  f.rows.push({ ...f.rows[0]!, id: 'parent' });
  f.rows.push({ ...f.rows[0]!, id: 'descendant', parentSession: 'parent', isSeeded: true });
  f.snapshots.set('parent', { values: { sessionListMetadata: { blank: true, lastPromptAt: null } } });
  const report = await f.host.diagnose!(new AbortController().signal);
  assert.deepEqual(report.issues.filter(i => (i.kind as string) === 'empty').map(i => i.sessionId), ['workspace', 'archive', 'ungrouped']);
  assert.equal(report.checks.find(c => (c.kind as string) === 'empty')?.status, 'ok');
  assert.deepEqual(f.reads, []);
});

test('空会话投影缺失或损坏时检查未完成，不把未命名或缓存缺失判作空会话', async () => {
  const f = fixture();
  const report = await f.host.diagnose!(new AbortController().signal);
  assert.deepEqual(report.issues.filter(i => (i.kind as string) === 'empty'), []);
  assert.equal(report.checks.find(c => (c.kind as string) === 'empty')?.status, 'error');
  delete f.services.sessionProjectionCache;
  const missing = await f.host.diagnose!(new AbortController().signal);
  assert.equal(missing.checks.find(c => (c.kind as string) === 'empty')?.status, 'unsupported');
});

test('空会话缓存水位落后于存储事件数量时不能作为删除候选', async () => {
  const f = fixture();
  f.snapshots.set('workspace', { values: { sessionListMetadata: { blank: true, lastPromptAt: null } }, asOfSeq: 2 });
  const list = f.persistence.list;
  f.persistence.list = async () => (await list()).map(row => ({ ...row, eventCount: 5 }));
  const report = await f.host.diagnose!(new AbortController().signal);
  assert.equal(report.issues.some(i => i.kind === 'empty'), false);
  assert.equal(report.checks.find(c => c.kind === 'empty')?.status, 'error');
});

test('批量删除空会话逐项复查并跳过已变非空或更换生命周期的记录，失败不中断后续', async () => {
  const f = fixture();
  for (const id of ['workspace', 'archive', 'ungrouped']) f.snapshots.set(id, { values: {
    title: null, sessionListMetadata: { blank: true, lastPromptAt: null },
  }, asOfSeq: 2 });
  const report = await f.host.diagnose!(new AbortController().signal);
  const items = report.issues.filter(i => (i.kind as string) === 'empty').map(i => ({ sessionId: i.sessionId, identity: i.identity }));
  assert.equal(items.length, 3);
  const deleted: string[] = [];
  f.maintenance.deleteWithinQueue = async (id: string) => {
    deleted.push(id);
    if (id === 'workspace') {
      f.snapshots.set('archive', { values: { sessionListMetadata: { blank: false, lastPromptAt: 42 } } });
      throw new Error('磁盘写入失败');
    }
    return true;
  };
  const repair = f.host.repairDiagnostics!;
  const result = await repair('empty', items);
  assert.deepEqual(result, { succeeded: ['ungrouped'], skipped: ['archive'], failures: [{ sessionId: 'workspace', message: '磁盘写入失败' }] });
  assert.deepEqual(deleted, ['workspace', 'ungrouped']);
  f.rows.find(h => h.id === 'ungrouped')!.createdAt++;
  assert.deepEqual((await repair('empty', [items.find(i => i.sessionId === 'ungrouped')!])).skipped, ['ungrouped']);
});

test('空会话删除RPC仅所有者，禁止伪造候选与归档项目，成功移除工作台标记', async () => {
  const f = fixture();
  f.snapshots.set('workspace', { values: { title: null, sessionListMetadata: { blank: true, lastPromptAt: null } } });
  const deleted: string[] = [];
  f.maintenance.deleteWithinQueue = async (id: string) => { deleted.push(id); return true; };
  let state = initialState();
  f.host.sessions = async () => [];
  const service = new WorkbaseService({ get: () => state, set: async s => { state = s; } }, f.host, () => 'p');
  const snapshot = await service.snapshot();
  const issue = snapshot.diagnostics!.issues.find(i => (i.kind as string) === 'empty')!;
  assert.ok(issue);
  state.sessionMarks.workspace = { pinned: true, favorite: false };
  const call = (identity = issue.identity, owner = true) => dispatch(service, {
    op: 'repair-diagnostics', kind: 'empty', items: [{ sessionId: 'workspace', identity }],
  }, owner, new AbortController().signal);
  assert.equal((await call(undefined, false)).ok, false);
  const forged = await call('forged');
  assert.equal(forged.ok, true);
  if (forged.ok) assert.deepEqual(forged.value, { succeeded: [], skipped: ['workspace'], failures: [] });
  state.bindings[0]!.archived = true;
  assert.equal((await call()).ok, false);
  assert.deepEqual(deleted, []);
  state.bindings[0]!.archived = false;
  assert.equal((await call()).ok, true);
  assert.deepEqual(deleted, ['workspace']);
  assert.equal(state.sessionMarks.workspace, undefined);
});

test('绑定已退休或宿主不再列出工作区时，空会话清理不再报项目绑定不可用', async () => {
  const prepare = () => {
    const f = fixture();
    f.snapshots.set('workspace', { values: { title: null, sessionListMetadata: { blank: true, lastPromptAt: null } }, asOfSeq: 2 });
    f.host.sessions = async () => [];
    return f;
  };
  const deleted: string[] = [];
  const count = async (service: WorkbaseService) => (await service.diagnose()).issues
    .filter(i => i.kind === 'empty').map(i => ({ sessionId: i.sessionId!, identity: i.identity! }));
  // 情形一：绑定已退休，项目与工作区都还在。
  const retired = prepare();
  retired.maintenance.deleteWithinQueue = async (id: string, options: DeleteOptions) => {
    await options.authorize?.({ sessionId: id, path: '/project', identity: 'generation' });
    deleted.push(id);
    return true;
  };
  let state = initialState();
  const service = new WorkbaseService({ get: () => state, set: async s => { state = s; } }, retired.host, () => 'p');
  await service.snapshot();
  state.bindings[0]!.retired = true;
  const items = await count(service);
  assert.deepEqual(items.map(i => i.sessionId), ['workspace']);
  const retiredCall = await dispatch(service, { op: 'repair-diagnostics', kind: 'empty', items }, true, new AbortController().signal);
  assert.equal(retiredCall.ok, true);
  if (retiredCall.ok) assert.deepEqual(retiredCall.value, { succeeded: ['workspace'], skipped: [], failures: [] });
  // 情形二：绑定仍生效，但宿主已不再列出对应工作区。
  const orphaned = prepare();
  orphaned.maintenance.deleteWithinQueue = async (id: string, options: DeleteOptions) => {
    await options.authorize?.({ sessionId: id, path: '/project', identity: 'generation' });
    deleted.push(id);
    return true;
  };
  let second = initialState();
  const detached = new WorkbaseService({ get: () => second, set: async s => { second = s; } }, orphaned.host, () => 'p');
  await detached.snapshot();
  orphaned.host.workspaces = async () => [];
  const detachedItems = await count(detached);
  assert.deepEqual(detachedItems.map(i => i.sessionId), ['workspace']);
  const detachedCall = await dispatch(detached, { op: 'repair-diagnostics', kind: 'empty', items: detachedItems }, true, new AbortController().signal);
  assert.equal(detachedCall.ok, true);
  if (detachedCall.ok) assert.deepEqual(detachedCall.value, { succeeded: ['workspace'], skipped: [], failures: [] });
  assert.deepEqual(deleted, ['workspace', 'workspace']);
});

test('空会话在检测后开始对话时跳过该项，服务仍继续删除同批其他空会话', async () => {
  const f = fixture();
  for (const id of ['workspace', 'ungrouped']) f.snapshots.set(id, { values: {
    title: null, sessionListMetadata: { blank: true, lastPromptAt: null },
  } });
  const deleted: string[] = [];
  f.maintenance.deleteWithinQueue = async (id: string) => { deleted.push(id); return true; };
  let state = initialState(); f.host.sessions = async () => [];
  const service = new WorkbaseService({ get: () => state, set: async s => { state = s; } }, f.host, () => 'p');
  const report = await service.diagnose();
  const items = report.issues.filter(i => i.kind === 'empty').map(i => ({ sessionId: i.sessionId!, identity: i.identity! }));
  f.snapshots.set('workspace', { values: { sessionListMetadata: { blank: false, lastPromptAt: 42 } } });
  const response = await dispatch(service, { op: 'repair-diagnostics', kind: 'empty', items }, true, new AbortController().signal);
  assert.equal(response.ok, true);
  if (response.ok) assert.deepEqual(response.value, { succeeded: ['ungrouped'], skipped: ['workspace'], failures: [] });
  assert.deepEqual(deleted, ['ungrouped']);
});

test('诊断只读头部与缓存，缓存缺失不再是异常，孤儿检测不读正文', async () => {
  const f = fixture();
  assert.equal(typeof f.host.diagnose, 'function');
  const report = await f.host.diagnose!(new AbortController().signal);
  // 官方缓存是可丢失的派生加速数据：缺失走正常冷读，不再作为异常上报。
  assert.deepEqual(report.issues.filter(i => i.kind === 'cache'), []);
  assert.equal(report.issues.some(i => i.sessionId === 'partial'), false);
  assert.deepEqual(report.issues.filter(i => i.kind === 'orphan').map(i => i.sessionId), ['orphan', 'seeded']);
  assert.equal(report.issues.find(i => i.sessionId === 'orphan')?.sizeBytes, 123);
  assert.deepEqual(f.reads, []);
  assert.deepEqual(f.writes, []);
});

test('母会话日志尚存或物理检查失败时不误报孤儿，失败显示检查不完整', async () => {
  const f = fixture();
  f.persistence.findLog = async () => { throw new Error('磁盘访问失败'); };
  const report = await f.host.diagnose!(new AbortController().signal);
  assert.deepEqual(report.issues.filter(i => i.kind === 'orphan'), []);
  assert.equal(report.checks.find(c => c.kind === 'orphan')?.status, 'error');
  assert.match(report.checks.find(c => c.kind === 'orphan')?.message ?? '', /磁盘访问失败/);
});

test('能力缺失与存储读取失败不会报告全部正常，缓存有title空值仍可用', async () => {
  const f = fixture();
  delete f.services.sessionProjectionCache;
  let report = await f.host.diagnose!(new AbortController().signal);
  assert.equal(report.checks.find(c => c.kind === 'cache')?.status, 'unsupported');
  assert.equal(report.checks.find(c => c.kind === 'orphan')?.status, 'ok');
  f.persistence.list = async () => { throw new Error('存储不可读'); };
  report = await f.host.diagnose!(new AbortController().signal);
  assert.equal(report.checks.find(c => c.kind === 'orphan')?.status, 'error');
  assert.deepEqual(report.issues, []);
});

test('仅stat返回undefined不足以判孤儿，取消检测不继续扫描', async () => {
  const f = fixture();
  delete (f.persistence as Partial<typeof f.persistence>).findLog;
  const report = await f.host.diagnose!(new AbortController().signal);
  assert.equal(report.checks.find(c => c.kind === 'orphan')?.status, 'unsupported');
  assert.deepEqual(report.issues.filter(i => i.kind === 'orphan'), []);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(f.host.diagnose!(controller.signal), /abort/i);
});

test('母会话只剩坏日志目录时仍保护子代理，根目录不存在时报检查失败', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbase-diagnosis-'));
  try {
    const f = fixture();
    const persistence = f.persistence as typeof f.persistence & { root: string };
    persistence.root = root;
    delete (persistence as Partial<typeof persistence>).findLog;
    await mkdir(path.join(root, 'project', 'gone'), { recursive: true });
    await mkdir(path.join(root, 'project', 'broken-parent'), { recursive: true });
    await writeFile(path.join(root, 'project', 'gone', 'session.v4.jsonl'), '{坏头部');
    await writeFile(path.join(root, '.DS_Store'), '普通文件不应当成项目目录');
    const report = await f.host.diagnose!(new AbortController().signal);
    assert.deepEqual(report.issues.filter(i => i.kind === 'orphan'), []);
    assert.equal(report.checks.find(c => c.kind === 'orphan')?.status, 'ok');
    persistence.root = path.join(root, 'missing');
    const failed = await f.host.diagnose!(new AbortController().signal);
    assert.equal(failed.checks.find(c => c.kind === 'orphan')?.status, 'error');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('修复只使用内部维护接口，缺少底层能力时不调用外部扩展', async () => {
  const f = fixture();
  const independent = createDiagnostics(f.ctx);
  f.registry.rebuildSessionCaches = async () => { throw new Error('不得调用外部扩展'); };
  await assert.rejects(independent.repairDiagnostics('cache', [{ sessionId: 'workspace', identity: 'x' }]), /底层能力/);
  const received: unknown[] = [];
  f.maintenance.rebuildWithinQueue = async (...input) => {
    received.push(input); return true;
  };
  const report = await f.host.diagnose!(new AbortController().signal);
  const deleted: unknown[] = [];
  f.maintenance.deleteWithinQueue = async (id, options) => {
    deleted.push([id, options.coldOnly, options.evict]); return id === 'orphan';
  };
  assert.deepEqual(await f.host.repairDiagnostics!('orphan', report.issues.filter(i => i.kind === 'orphan').map(i => ({ sessionId: i.sessionId, identity: i.identity }))),
    { succeeded: ['orphan'], skipped: ['seeded'], failures: [] });
  assert.deepEqual(deleted[0], ['orphan', true, false]);
  assert.deepEqual(f.writes, []);
});

test('缓存不再作为异常上报，伪造的缓存修复候选被复查跳过', async () => {
  const f = fixture();
  const received: unknown[] = [];
  f.maintenance.rebuildWithinQueue = async (...input) => { received.push(input); return false; };
  const result = await f.host.repairDiagnostics!('cache', [{ sessionId: 'workspace', identity: 'forged' }]);
  assert.deepEqual(result, { succeeded: [], skipped: ['workspace'], failures: [] });
  assert.deepEqual(received, []);
});

test('服务快照合并目录与会话异常，同一路径归项目，未登记会话单独分组', async () => {
  const f = fixture();
  (f.ctx as unknown as { sessionController: unknown }).sessionController = { list: async () => ({ items: [
    { sessionId: 'workspace', blank: true, running: false, updatedAt: 11 },
    { sessionId: 'ungrouped', blank: true, running: false, updatedAt: 12 },
  ] }) };
  let state = initialState();
  f.host.sessions = async () => [];
  const service = new WorkbaseService({ get: () => state, set: async s => { state = s; } }, f.host, () => 'p');
  const snapshot = await service.snapshot();
  assert.ok(snapshot.diagnostics);
  assert.equal(snapshot.diagnostics.issues.find(i => i.sessionId === 'workspace')?.kind, 'empty');
  assert.equal(snapshot.diagnostics.issues.find(i => i.sessionId === 'workspace')?.projectId, 'p');
  assert.equal(snapshot.diagnostics.issues.find(i => i.sessionId === 'ungrouped')?.projectId, null);
  assert.equal(snapshot.diagnostics.issues.find(i => i.sessionId === 'ungrouped')?.path, '/other');
  assert.equal(snapshot.diagnostics.checks.find(c => c.kind === 'directory')?.status, 'ok');
});

test('修复RPC仅所有者可用，拒绝非诊断候选和过期生命周期，失败保留可重试结果', async () => {
  const f = fixture();
  (f.ctx as unknown as { sessionController: unknown }).sessionController = { list: async () => ({ items: [
    { sessionId: 'workspace', blank: true, running: false, updatedAt: 11 },
  ] }) };
  f.host.sessions = async () => [];
  const called: unknown[] = [];
  f.maintenance.deleteWithinQueue = async (...input) => {
    called.push(input); throw new Error('写入失败');
  };
  let state = initialState();
  const service = new WorkbaseService({ get: () => state, set: async s => { state = s; } }, f.host, () => 'p');
  const snapshot = await service.snapshot();
  const issue = snapshot.diagnostics!.issues.find(i => i.sessionId === 'workspace')!;
  const call = (items: unknown, owner = true) => dispatch(service, { op: 'repair-diagnostics', kind: 'empty', items }, owner, new AbortController().signal);
  const items = [{ sessionId: 'workspace', identity: issue.identity }];
  assert.equal((await call(items, false)).ok, false);
  const stale = await call([{ sessionId: 'workspace', identity: 'stale' }]);
  assert.equal(stale.ok, true);
  if (stale.ok) assert.deepEqual(stale.value, { succeeded: [], skipped: ['workspace'], failures: [] });
  assert.deepEqual(called, []);
  const result = await call(items);
  assert.equal(result.ok, true);
  assert.match(JSON.stringify(result), /写入失败/);
  assert.equal(called.length, 1);
  state.bindings[0]!.archived = true;
  assert.equal((await call(items)).ok, false);
  assert.equal(called.length, 1);
});

test('内部维护失败保留错误，修复请求数量与字段严格校验', async () => {
  const f = fixture();
  f.maintenance.deleteWithinQueue = async () => { throw new Error('日志删除未确认'); };
  const report = await f.host.diagnose!(new AbortController().signal);
  const issue = report.issues.find(i => i.kind === 'orphan')!;
  const repaired = await f.host.repairDiagnostics!('orphan', [{ sessionId: issue.sessionId, identity: issue.identity }]);
  assert.deepEqual(repaired.succeeded, []);
  assert.match(repaired.failures[0]!.message, /日志删除未确认/);
  f.host.sessions = async () => [];
  let state = initialState();
  const service = new WorkbaseService({ get: () => state, set: async s => { state = s; } }, f.host, () => 'p');
  for (const items of [[], Array(21).fill({ sessionId: 'orphan', identity: 'x' }), [{ sessionId: 'orphan', identity: 'x', path: '/forged' }]]) {
    const response = await dispatch(service, { op: 'repair-diagnostics', kind: 'orphan', items }, true, new AbortController().signal);
    assert.equal(response.ok, false);
    assert.match(JSON.stringify(response), /invalid/);
  }
});

test('空会话以宿主会话控制器的blank与running为准，内存缓存里有对象不算在用', async () => {
  const f = fixture();
  (f.ctx as unknown as { sessionController: unknown }).sessionController = { list: async () => ({ items: [
    { sessionId: 'workspace', blank: true, running: false, updatedAt: 11 },
    { sessionId: 'live', blank: true, running: false, updatedAt: 12 },
    { sessionId: 'busy', blank: true, running: true, updatedAt: 13 },
    { sessionId: 'valid', blank: false, running: false, updatedAt: 14 },
  ] }) };
  // valid 的缓存行证明其非空，检测不应为复核它而读取日志。
  f.snapshots.set('valid', { values: { title: null, sessionListMetadata: { blank: false, lastPromptAt: 42 } } });
  const report = await f.host.diagnose!(new AbortController().signal);
  // live 在 sessions 内存缓存里有对象，但宿主说它空且未运行，仍应作为候选。
  assert.deepEqual(report.issues.filter(i => i.kind === 'empty').map(i => i.sessionId), ['workspace', 'live']);
  assert.equal(report.checks.find(c => c.kind === 'empty')?.status, 'ok');
  assert.deepEqual(f.reads, []);
});

test('宿主冷列表因缓存缺失显示非空时，检测折叠日志复核空会话并回写缓存', async () => {
  const f = fixture();
  (f.ctx as unknown as { sessionController: unknown }).sessionController = { list: async () => ({ items: [
    { sessionId: 'workspace', blank: false, running: false, updatedAt: 11 },
  ] }) };
  const report = await f.host.diagnose!(new AbortController().signal);
  assert.deepEqual(report.issues.filter(i => i.kind === 'cache'), []);
  assert.deepEqual(report.issues.filter(i => i.kind === 'empty').map(i => i.sessionId), ['workspace']);
  assert.deepEqual(f.reads, ['workspace']);
  assert.deepEqual(f.writes, ['cache']);
  assert.deepEqual(JSON.parse(report.issues.find(i => i.kind === 'empty')!.identity!), ['[4,42,"/project",false]', 42]);
  // 回写缓存行后宿主列表改为空会话，身份保持一致且不再读日志。
  (f.ctx as unknown as { sessionController: unknown }).sessionController = { list: async () => ({ items: [
    { sessionId: 'workspace', blank: true, running: false, updatedAt: 42 },
  ] }) };
  const again = await f.host.diagnose!(new AbortController().signal);
  assert.equal(again.issues.find(i => i.kind === 'empty')!.identity, report.issues.find(i => i.kind === 'empty')!.identity);
  assert.deepEqual(f.reads, ['workspace']);
});

test('折叠日志发现已开始对话的会话不作为空会话，缓存证明非空时不读日志', async () => {
  const f = fixture();
  (f.ctx as unknown as { sessionController: unknown }).sessionController = { list: async () => ({ items: [
    { sessionId: 'workspace', blank: false, running: false, updatedAt: 11 },
    { sessionId: 'ungrouped', blank: false, running: false, updatedAt: 12 },
  ] }) };
  f.logEvents.set('workspace', [
    { type: 'turn/start', seq: 0 },
    { type: 'user/message', time: 5, seq: 1, data: { source: { kind: 'user' } } },
  ]);
  f.snapshots.set('ungrouped', { values: { title: null, sessionListMetadata: { blank: false, lastPromptAt: 42 } }, asOfSeq: 2 });
  const report = await f.host.diagnose!(new AbortController().signal);
  assert.deepEqual(report.issues.filter(i => i.kind === 'empty'), []);
  assert.equal(report.checks.find(c => c.kind === 'empty')?.status, 'ok');
  assert.deepEqual(f.reads, ['workspace']);
});

test('缓存缺失的空会话候选可删除，删除中复查身份保持一致', async () => {
  const f = fixture();
  (f.ctx as unknown as { sessionController: unknown }).sessionController = { list: async () => ({ items: [
    { sessionId: 'workspace', blank: false, running: false, updatedAt: 11 },
  ] }) };
  const report = await f.host.diagnose!(new AbortController().signal);
  const item = { sessionId: 'workspace', identity: report.issues.find(i => i.kind === 'empty')!.identity! };
  const options: DeleteOptions[] = [];
  f.maintenance.deleteWithinQueue = async (_id: string, value: DeleteOptions) => {
    options.push(value);
    return await value.validate!();
  };
  assert.deepEqual(await f.host.repairDiagnostics!('empty', [item]), { succeeded: ['workspace'], skipped: [], failures: [] });
  assert.equal(options.length, 1);
  assert.equal(options[0]!.evict, true);
});

test('空会话候选身份带上宿主更新时间，修复时声明驱逐已加载会话', async () => {
  const f = fixture();
  let updatedAt = 11;
  (f.ctx as unknown as { sessionController: unknown }).sessionController = { list: async () => ({ items: [
    { sessionId: 'workspace', blank: true, running: false, updatedAt },
  ] }) };
  const options: DeleteOptions[] = [];
  f.maintenance.deleteWithinQueue = async (_id: string, value: DeleteOptions) => { options.push(value); return true; };
  const report = await f.host.diagnose!(new AbortController().signal);
  const item = report.issues.find(i => i.kind === 'empty')!;
  assert.deepEqual(JSON.parse(item.identity!), ['[4,42,"/project",false]', 11]);
  updatedAt = 12;
  assert.deepEqual((await f.host.repairDiagnostics!('empty', [{ sessionId: 'workspace', identity: item.identity! }])).skipped, ['workspace']);
  const fresh = (await f.host.diagnose!(new AbortController().signal)).issues.find(i => i.kind === 'empty')!;
  assert.deepEqual((await f.host.repairDiagnostics!('empty', [{ sessionId: 'workspace', identity: fresh.identity! }])).succeeded, ['workspace']);
  assert.equal(options.at(-1)?.evict, true);
  assert.equal(options.at(-1)?.coldOnly, true);
});

for (const change of ['nonblank', 'running', 'updated', 'parent', 'origin', 'descendant', 'revision', 'events', 'missing'] as const) {
  test(`C02 首次确认后 ${change} 变化必须停止删除`, async () => {
    const f = fixture();
    let items = [{ sessionId: 'workspace', blank: true, running: false, updatedAt: 11 }];
    let revision = '1';
    let eventCount = 0;
    const list = f.persistence.list;
    f.persistence.list = async () => (await list()).map(row => ({ ...row, revision, eventCount }));
    (f.ctx as unknown as { sessionController: unknown }).sessionController = { list: async () => ({ items }) };
    const candidate = (await f.host.diagnose!(new AbortController().signal)).issues.find(i => i.kind === 'empty')!;
    f.maintenance.deleteWithinQueue = async (_id, options) => {
      if (change === 'nonblank') items[0]!.blank = false;
      if (change === 'running') items[0]!.running = true;
      if (change === 'updated') items[0]!.updatedAt++;
      if (change === 'parent') f.rows[0]!.parentSession = 'new-parent';
      if (change === 'origin') f.rows[0]!.origin = 'subagent';
      if (change === 'descendant') f.rows.push({ ...f.rows[0]!, id: 'new-child', parentSession: 'workspace' });
      if (change === 'revision') revision = '2';
      if (change === 'events') eventCount++;
      if (change === 'missing') items = [];
      return await options.validate!();
    };
    assert.deepEqual(await f.host.repairDiagnostics!('empty', [candidate]),
      { succeeded: [], skipped: ['workspace'], failures: [] });
  });
}

test('C02 驱逐后控制器返回损坏结果不能当作目标消失', async () => {
  const f = fixture();
  let broken = false;
  const list = f.persistence.list;
  f.persistence.list = async () => (await list()).map(row => ({ ...row, revision: '1' }));
  (f.ctx as unknown as { sessionController: unknown }).sessionController = { list: async () =>
    broken ? {} : { items: [{ sessionId: 'workspace', blank: true, running: false, updatedAt: 11 }] } };
  const candidate = (await f.host.diagnose!(new AbortController().signal)).issues.find(i => i.kind === 'empty')!;
  f.maintenance.deleteWithinQueue = async (_id, options) => {
    broken = true;
    return options.validate!({ evicted: true });
  };
  const result = await f.host.repairDiagnostics!('empty', [candidate]);
  assert.deepEqual(result.succeeded, []);
  assert.equal(result.failures.length, 1);
});
