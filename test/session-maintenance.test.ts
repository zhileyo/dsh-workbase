import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Context } from '@deepseek-ai/cordis';
import { mkdtemp, mkdir, writeFile, readFile, rm, access, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSessionMaintenance, sessionIdentity, sessionStorageDirectory } from '../src/server/session-maintenance.js';
import { createDiagnostics } from '../src/server/diagnostics.js';
import { WorkbaseService } from '../src/server/service.js';
import { initialState } from '../src/shared/model.js';
import { createHost } from '../src/server/host.js';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-maintenance-'));
  const header = (id: string, extra = {}) => ({ id, version: 4, createdAt: 42, isSeeded: false, cwd: '/project', ...extra });
  const headers = new Map([header('parent'), header('child', { origin: 'subagent', parentSession: 'parent' }),
    header('fork', { parentSession: 'parent', isSeeded: true })].map(h => [h.id, h]));
  const locations = new Map<string, string>();
  for (const h of headers.values()) {
    const log = path.join(root, '--project--', h.id, 'session.v4.jsonl');
    await mkdir(path.dirname(log), { recursive: true });
    await writeFile(log, JSON.stringify(h));
    locations.set(h.id, log);
  }
  const rows = new Map([...headers].map(([id, h]) => [id, { header: h, revision: '1' }]));
  const snapshots = new Map<string, unknown>();
  const busy = new Set<string>(), live = new Map<string, unknown>(), removed: string[] = [];
  let failCache = false, failFlush = false;
  const table = new Map([['w', { sessionIds: ['parent', 'child', 'fork'], updatedAt: '' }]]);
  let state = { workspaceIds: ['w'], archivedSessionIds: ['parent'], pinnedSessionIds: ['parent'] };
  const registry = {
    headers, sessionPaths: new Map([...headers].map(([id]) => [id, '/project'])), entities: new Map(),
    enqueueOperation: async <T>(action: () => Promise<T>) => action(),
    requireState: () => state, setState: async (next: typeof state) => { state = next; },
    requireTable: () => ({ get: (id: string) => table.get(id),
      update: async (id: string, update: (row: { sessionIds: string[]; updatedAt: string }) => { sessionIds: string[]; updatedAt: string }) => {
        const next = update(table.get(id)!); table.set(id, next); return next;
      } }),
  };
  const persistence = {
    name: 'session-persistence-jsonl', root,
    list: async () => [...rows.values()].filter(row => headers.has(row.header.id)),
    stat: async (id: string) => {
      try { await access(locations.get(id)!); return rows.get(id); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    },
    locate: (h: { id: string }) => ({ kind: 'jsonl', path: locations.get(h.id)! }),
    open: async (id: string) => ({ header: headers.get(id)!, inheritedEventCount: 0,
      read: async () => ({ events: [] }), close: async () => {} }),
    flush: async () => {},
  };
  const cache = {
    cachedSnapshot: (h: { id: string }) => snapshots.get(h.id),
    put: async (id: string) => {
      if (failCache) throw new Error('缓存写入失败');
      snapshots.set(id, { values: { title: { title: '重建' } }, asOfSeq: -1 });
    },
    requireTable: () => ({ delete: async (id: string) => {
      if (failCache) throw new Error('缓存删除失败'); snapshots.delete(id);
    } }),
  };
  const services: Record<string, unknown> = { sessionPersistence: persistence, sessionProjectionCache: cache,
    sessionProjections: { restore: () => ({ checkpoint: {}, snapshot: { values: { title: { title: '重建' } }, asOfSeq: -1 } }) },
    sessions: { get: (id: string) => live.get(id), list: () => [...live.values()],
      flush: async () => { if (failFlush) throw new Error('日志刷盘失败'); },
      liveEntryFor: (session: unknown) => session,
      detachEntered: (session: { id: string }) => { live.delete(session.id); } } };
  const ctx = { workspaceRegistry: registry, get: (name: string) => services[name],
    waterfall: async (_name: string, { sessionId }: { sessionId: string }) => busy.has(sessionId) ? ['running'] : [],
    emit: (_name: string, id: string) => { removed.push(id); } } as unknown as Context;
  return { root, headers, locations, rows, snapshots, busy, live, removed, table, services, persistence, ctx,
    maintenance: createSessionMaintenance(ctx), setFailCache: () => { failCache = true; },
    setFailFlush: () => { failFlush = true; }, state: () => state };
}
test('独立删除级联子代理、清理日志目录及官方记账，保留独立fork', async () => {
  const f = await fixture();
  try {
    await writeFile(path.join(path.dirname(f.locations.get('parent')!), 'session.jsonl.zstd'), '旧代际');
    assert.deepEqual(f.maintenance.capabilities(), { cache: true, orphan: true, empty: true });
    assert.equal(await f.maintenance.deleteSession('parent'), true);
    assert.deepEqual(f.removed, ['child', 'parent']);
    await assert.rejects(access(path.dirname(f.locations.get('parent')!)));
    assert.ok(await readFile(f.locations.get('fork')!, 'utf8'));
    assert.deepEqual(f.table.get('w')!.sessionIds, ['fork']);
    assert.deepEqual(f.state().archivedSessionIds, []);
    assert.deepEqual(f.state().pinnedSessionIds, []);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('A06 全部级联实体的归属校验必须发生在任何物理副作用之前', async () => {
  const f = await fixture();
  try {
    const checked: string[] = [];
    const options = { authorize: async (header: { sessionId: string }) => {
      checked.push(header.sessionId);
      if (header.sessionId === 'parent') throw new Error('归档项目只读');
    } };
    await assert.rejects(f.maintenance.deleteSession('parent', options), /归档项目只读/);
    assert.deepEqual(checked, ['child', 'parent']);
    assert.deepEqual(f.removed, []);
    assert.ok(await readFile(f.locations.get('child')!, 'utf8'));
    assert.ok(await readFile(f.locations.get('parent')!, 'utf8'));
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('A15 日志生命周期与持久删除见证不符时不能清理', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.maintenance.deleteSession('parent', { expectedIdentity: 'old-generation' }), /生命周期/);
    assert.deepEqual(f.removed, []);
    assert.ok(await readFile(f.locations.get('parent')!));
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('A15 宿主删除适配必须把持久见证传递给底层维护', async () => {
  const f = await fixture();
  try {
    const host = createHost(f.ctx);
    assert.equal(typeof host.sessionDeletionIdentity, 'function');
    assert.equal(await host.sessionDeletionIdentity!('parent'), await f.maintenance.deletionIdentity('parent'));
    await assert.rejects(host.deleteSession!('parent', 'old-generation'), /生命周期/);
    assert.deepEqual(f.removed, []);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('A06 真实孤儿修复拒绝跨项目归档后代，保留全部日志', async () => {
  const f = await fixture();
  try {
    Object.assign(f.headers.get('parent')!, { origin: 'subagent', parentSession: 'missing-root' });
    const stat = f.persistence.stat;
    f.persistence.stat = async id => id === 'missing-root' ? undefined : stat(id);
    const child = f.headers.get('child')!;
    child.cwd = '/archived';
    const location = path.join(f.root, '--archived--', 'child', 'session.v4.jsonl');
    await mkdir(path.dirname(location), { recursive: true });
    await writeFile(location, JSON.stringify(child)); f.locations.set('child', location);
    let state = initialState();
    state.bindings = [
      { projectId: 'active', workspaceId: 'active-w', path: '/project', archived: false, retired: false, removed: false, agentCanChangeStatus: true },
      { projectId: 'archived', workspaceId: 'archived-w', path: '/archived', archived: true, retired: false, removed: false, agentCanChangeStatus: true },
    ];
    const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } }, {
      ...createDiagnostics(f.ctx), workspaces: async () => [
        { workspaceId: 'active-w', path: '/project', title: '活跃', available: true, sessionIds: ['parent'] },
        { workspaceId: 'archived-w', path: '/archived', title: '归档', available: true, sessionIds: ['child'] },
      ], sessions: async () => [], rename: async () => {},
    }, () => 'id');
    const issue = (await service.diagnose()).issues.find(i => i.kind === 'orphan' && i.sessionId === 'parent')!;
    assert.ok(issue);
    const result = await service.repairDiagnostics({ kind: 'orphan',
      items: [{ sessionId: issue.sessionId!, identity: issue.identity! }] }, new AbortController().signal);
    assert.deepEqual(result.succeeded, []);
    assert.match(result.failures[0]!.message, /归档/);
    assert.deepEqual(f.removed, []);
    assert.ok(await readFile(location));
    assert.ok(await readFile(f.locations.get('parent')!));
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

for (const change of ['nonblank', 'updated', 'parent', 'descendant', 'revision', 'flush', 'cache-descendant'] as const) {
  test(`C02 临时日志在首次确认后 ${change} 变化时不能物理删除`, async () => {
    const f = await fixture();
    try {
      const child = f.rows.get('child')!;
      f.rows.delete('child'); f.rows.delete('fork');
      let blank = true, updatedAt = 11;
      f.live.set('parent', { id: 'parent', header: f.headers.get('parent') });
      (f.ctx as unknown as { sessionController: unknown }).sessionController = { list: async () => ({
        items: f.live.has('parent') ? [{ sessionId: 'parent', blank, running: false, updatedAt }] : [],
      }) };
      const diagnostics = createDiagnostics(f.ctx);
      const candidate = (await diagnostics.diagnose(new AbortController().signal)).issues.find(i => i.kind === 'empty')!;
      assert.ok(candidate);
      const list = f.persistence.list;
      let lists = 0;
      f.persistence.list = async () => {
        // repair 第一次 list 是首次确认，第二次是 deleteCore 快照。
        if (++lists === 2) {
          if (change === 'nonblank') blank = false;
          if (change === 'updated') updatedAt++;
          if (change === 'parent') Object.assign(f.rows.get('parent')!.header, { parentSession: 'other' });
          if (change === 'descendant') f.rows.set('child', child);
          if (change === 'revision') f.rows.get('parent')!.revision = '2';
        }
        return list();
      };
      if (change === 'flush') (f.services.sessions as { flush(): Promise<void> }).flush = async () => {
        f.rows.get('parent')!.revision = '2';
      };
      if (change === 'cache-descendant') (f.services.sessionProjectionCache as {
        requireTable(): { delete(id: string): Promise<void> };
      }).requireTable = () => ({ delete: async () => { f.rows.set('child', child); } });
      const result = await diagnostics.repairDiagnostics('empty', [candidate]);
      assert.deepEqual(result.succeeded, []);
      assert.deepEqual(result.skipped, ['parent']);
      await access(f.locations.get('parent')!);
      await access(f.locations.get('child')!);
      assert.deepEqual(f.removed, []);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
}

test('C02 已确认驱逐且首次日志见证一致时允许空会话收尾', async () => {
  const f = await fixture();
  try {
    f.rows.delete('child'); f.rows.delete('fork');
    f.live.set('parent', { id: 'parent', header: f.headers.get('parent') });
    (f.ctx as unknown as { sessionController: unknown }).sessionController = { list: async () => ({
      items: f.live.has('parent') ? [{ sessionId: 'parent', blank: true, running: false, updatedAt: 11 }] : [],
    }) };
    const diagnostics = createDiagnostics(f.ctx);
    const candidate = (await diagnostics.diagnose(new AbortController().signal)).issues.find(i => i.kind === 'empty')!;
    assert.deepEqual((await diagnostics.repairDiagnostics('empty', [candidate])).succeeded, ['parent']);
    await assert.rejects(access(f.locations.get('parent')!));
    assert.deepEqual(f.removed, ['parent']);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('C02 已驱逐但缺少日志水位见证不能仅凭控制器消失删除', async () => {
  const f = await fixture();
  try {
    f.rows.delete('child'); f.rows.delete('fork');
    delete (f.rows.get('parent')! as { revision?: string }).revision;
    f.live.set('parent', { id: 'parent', header: f.headers.get('parent') });
    (f.ctx as unknown as { sessionController: unknown }).sessionController = { list: async () => ({
      items: f.live.has('parent') ? [{ sessionId: 'parent', blank: true, running: false, updatedAt: 11 }] : [],
    }) };
    const diagnostics = createDiagnostics(f.ctx);
    const candidate = (await diagnostics.diagnose(new AbortController().signal)).issues.find(i => i.kind === 'empty')!;
    assert.deepEqual((await diagnostics.repairDiagnostics('empty', [candidate])).skipped, ['parent']);
    await access(f.locations.get('parent')!);
    assert.deepEqual(f.removed, []);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test('活动后代阻止整个级联，批量冷会话保护已加载目标', async () => {
  const f = await fixture();
  try {
    f.busy.add('child');
    await assert.rejects(f.maintenance.deleteSession('parent'), /正在使用/);
    assert.deepEqual(f.removed, []);
    await access(f.locations.get('parent')!);
    f.busy.clear(); f.live.set('parent', { id: 'parent', header: f.headers.get('parent') });
    assert.equal(await f.maintenance.deleteSession('parent', { coldOnly: true }), false);
    assert.deepEqual(f.removed, []);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test('候选复查或缓存持久化失败时日志与记账保留', async () => {
  const f = await fixture();
  try {
    assert.equal(await f.maintenance.deleteSession('parent', { coldOnly: true, validate: async () => false }), false);
    f.setFailCache();
    await assert.rejects(f.maintenance.deleteSession('parent'), /缓存删除失败/);
    await access(f.locations.get('parent')!);
    assert.deepEqual(f.removed, []);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test('缓存删除后不再用已删除的投影验证，但日志revision变化会阻止物理删除', async () => {
  const f = await fixture();
  try {
    f.snapshots.set('fork', { values: {} });
    assert.equal(await f.maintenance.deleteSession('fork', { coldOnly: true,
      validate: async () => f.snapshots.has('fork') }), true);
    const cache = f.services.sessionProjectionCache as { requireTable(): { delete(id: string): Promise<void> } };
    cache.requireTable = () => ({ delete: async id => { f.rows.get(id)!.revision = '2'; } });
    assert.equal(await f.maintenance.deleteSession('child', { coldOnly: true }), false);
    await access(f.locations.get('child')!);
    assert.deepEqual(f.removed, ['fork']);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test('活会话刷盘失败不能detach或删除，目录链接不能递归删除', async () => {
  const f = await fixture();
  try {
    f.live.set('fork', { id: 'fork', header: f.headers.get('fork') });
    f.setFailFlush();
    await assert.rejects(f.maintenance.deleteSession('fork'), /刷盘失败/);
    assert.ok(f.live.has('fork'));
    await access(f.locations.get('fork')!);
    f.live.clear();
    const target = path.dirname(f.locations.get('child')!), outside = path.join(f.root, 'outside');
    await mkdir(outside); await writeFile(path.join(outside, 'keep'), '保留');
    await rm(target, { recursive: true }); await symlink(outside, target);
    await assert.rejects(f.maintenance.deleteSession('parent'), /符号链接/);
    assert.equal(await readFile(path.join(outside, 'keep'), 'utf8'), '保留');
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test('缓存重建等待持久化，失败可重试；过期生命周期及活动目标跳过', async () => {
  const f = await fixture();
  try {
    const identity = sessionIdentity(f.headers.get('parent')!);
    assert.equal(await f.maintenance.rebuildWithinQueue('parent', '旧生命周期'), false);
    f.busy.add('parent');
    assert.equal(await f.maintenance.rebuildWithinQueue('parent', identity), false);
    f.busy.clear();
    assert.equal(await f.maintenance.rebuildWithinQueue('parent', identity), true);
    f.snapshots.delete('parent'); f.setFailCache();
    await assert.rejects(f.maintenance.rebuildWithinQueue('parent', identity), /缓存写入失败/);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test('仅官方专属JSONL目录可清理，拒绝外部路径和未知后端', () => {
  const header = { id: '../foreign', cwd: '/project', version: 4, createdAt: 42, isSeeded: false };
  const store = { root: '/sessions', name: 'session-persistence-jsonl' };
  assert.equal(sessionStorageDirectory(store, header, { kind: 'jsonl', path: '/sessions/foreign/session.v4.jsonl' }), undefined);
  assert.equal(sessionStorageDirectory(store, header, { kind: 'jsonl', path: '/outside/session.v4.jsonl' }), undefined);
  assert.equal(sessionStorageDirectory({ ...store, name: 'custom' }, header,
    { kind: 'jsonl', path: '/sessions/--project--/..~002Fforeign/session.v4.jsonl' }), undefined);
});

test('已加载但空闲的会话先驱逐再重建缓存，活动会话仍跳过', async () => {
  const f = await fixture();
  try {
    const identity = sessionIdentity(f.headers.get('parent')!);
    f.snapshots.delete('parent');
    f.live.set('parent', { id: 'parent', header: f.headers.get('parent') });
    f.busy.add('parent');
    assert.equal(await f.maintenance.rebuildWithinQueue('parent', identity), false);
    assert.equal(f.live.has('parent'), true);
    f.busy.delete('parent');
    assert.equal(await f.maintenance.rebuildWithinQueue('parent', identity), true);
    // 列表里点开过的会话都在内存里，重建前必须先释放，否则永远判成非冷态。
    assert.equal(f.live.has('parent'), false);
    assert.ok(f.snapshots.has('parent'));
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test('驱逐已加载的空闲会话需要显式evict，活动会话即使evict也拒绝', async () => {
  const f = await fixture();
  try {
    f.live.set('fork', { id: 'fork', header: f.headers.get('fork') });
    assert.equal(await f.maintenance.deleteSession('fork', { coldOnly: true }), false);
    assert.equal(f.live.has('fork'), true);
    await access(f.locations.get('fork')!);
    f.busy.add('fork');
    assert.equal(await f.maintenance.deleteSession('fork', { coldOnly: true, evict: true }), false);
    assert.equal(f.live.has('fork'), true);
    f.busy.delete('fork');
    assert.equal(await f.maintenance.deleteSession('fork', { coldOnly: true, evict: true }), true);
    assert.equal(f.live.has('fork'), false);
    await assert.rejects(access(path.dirname(f.locations.get('fork')!)));
    assert.deepEqual(f.removed, ['fork']);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
