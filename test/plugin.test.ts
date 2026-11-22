import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workbaseDomain, isEmptyState, inheritLegacyStorage, modernizeHomeState, inject, apply } from '../src/server/index.js';
import { assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools';
import { initialState, stateSchema } from '../src/shared/model.js';
import type { Context } from '@deepseek-ai/cordis';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RPC_CHANNEL, RPC_ENDPOINT } from '../src/shared/commands.js';

test('插件声明可由官方SDK加载，存储域名符合要求', () => {
  assert.match(workbaseDomain.name, /^[a-z][a-z0-9_]*$/);
  assert.ok(inject.includes('connection'));
  assert.equal(workbaseDomain.global.initial.todos.length, 0);
  assert.equal(workbaseDomain.version, 1, 'single JSON 宿主不能使用 compatibleVersions 升级格式戳');
});
test('空的新存储域自动继承旧域数据，非空新域与双空状态保持不动', async () => {
  const stores = new Map<string, ReturnType<typeof stateSchema.parse>>();
  const ctx = { storageDomain: { open: async (domain: { name: string; global: { initial: ReturnType<typeof stateSchema.parse> } }) => {
    if (!stores.has(domain.name)) stores.set(domain.name, domain.global.initial);
    return { global: { get: () => stores.get(domain.name)!, set: async (next: ReturnType<typeof stateSchema.parse>) => { stores.set(domain.name, next); } }, close: async () => {} };
  } } };
  const domain = { global: { get: () => stores.get(workbaseDomain.name)!, set: async (next: ReturnType<typeof stateSchema.parse>) => { stores.set(workbaseDomain.name, next); } } };
  stores.set(workbaseDomain.name, initialState() as ReturnType<typeof stateSchema.parse>);
  // 旧域有数据：整份搬迁到新域
  stores.set('dsh_workbench', stateSchema.parse({ ...initialState(), revision: 7 }));
  assert.equal(await inheritLegacyStorage(ctx as never, domain), true);
  assert.equal(stores.get(workbaseDomain.name)!.revision, 7);
  assert.equal(stores.get('dsh_workbench')!.revision, 7, '旧域保留作备份');
  // 新域已有数据：不迁移
  assert.equal(await inheritLegacyStorage(ctx as never, domain), false);
  // 新旧域都为空：不迁移
  stores.set('dsh_workbench', initialState() as ReturnType<typeof stateSchema.parse>);
  stores.set(workbaseDomain.name, initialState() as ReturnType<typeof stateSchema.parse>);
  assert.equal(await inheritLegacyStorage(ctx as never, domain), false);
  assert.equal(isEmptyState(stores.get(workbaseDomain.name)!), true);
});
test('旧首页默认组合一次性迁移为会话隐藏、统计卡显示，新默认保持不变', () => {
  const legacy = stateSchema.parse({ ...initialState(), preferences: { ...initialState().preferences,
    home: { quick: true, recent: true, stats: false, projects: true, recentStyle: 'cards' as const, statCards: { running: true, recent: true, pending: true, diagnostic: true } } } });
  const modernized = modernizeHomeState(legacy, 'dsh_workbench');
  assert.equal(modernized.preferences.home.recent, false);
  assert.equal(modernized.preferences.home.stats, true);
  assert.equal(modernizeHomeState(modernized), modernized, '新默认组合原样返回');
  // 用户显式开启过统计：仅隐藏会话模块，统计保持开启
  const statsOn = stateSchema.parse({ ...initialState(), preferences: { ...initialState().preferences,
    home: { quick: true, recent: true, stats: true, projects: true, recentStyle: 'buttons' as const, statCards: { running: true, recent: true, pending: true, diagnostic: true } } } });
  const modernizedStats = modernizeHomeState(statsOn, 'dsh_workbench');
  assert.equal(modernizedStats.preferences.home.recent, false);
  assert.equal(modernizedStats.preferences.home.stats, true);
  assert.equal(modernizedStats.preferences.home.recentStyle, 'buttons');
});
test('待办工具输出schema被官方注册器支持', () => {
  assert.doesNotThrow(() => assertSupportedJsonSchema({
    type: 'object', properties: { data: { type: 'string' } }, required: ['data'], additionalProperties: false,
  }));
});

test('C09 当前存储格式的已保存首页偏好不在启用时重置', () => {
  const saved = stateSchema.parse({ ...initialState(), revision: 8,
    preferences: { ...initialState().preferences, home: { ...initialState().preferences.home, recent: true, stats: false } } });
  assert.equal(modernizeHomeState(saved), saved);
});

test('C09 旧域迁入后经设置RPC保存首页偏好，再次apply启用仍保留', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-plugin-'));
  const previousHome = process.env.DSH_HOME, previousAgents = process.env.DSH_AGENTS_HOME;
  process.env.DSH_HOME = root;
  process.env.DSH_AGENTS_HOME = path.join(root, 'agents');
  const cleanups: (() => unknown)[] = [];
  const stores = new Map([
    ['dsh_workbase', stateSchema.parse(initialState())],
    ['dsh_workbench', stateSchema.parse({ ...initialState(), revision: 7,
      preferences: { ...initialState().preferences, home: { ...initialState().preferences.home, recent: true, stats: false } } })],
  ]);
  let writes = 0, legacyOpens = 0;
  let rpc: ((request: Request) => Promise<Response>) | undefined;
  const stop = async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); };
  const ctx = {
    get: () => undefined,
    inject() {}, emit() {},
    workspaceRegistry: { list: () => [] },
    sessionController: {},
    effect: (install: () => (() => unknown) | undefined) => { const cleanup = install(); if (cleanup) cleanups.push(cleanup); },
    storageDomain: { open: async (domain: { name: string }) => {
      if (domain.name === 'dsh_workbench') legacyOpens++;
      return { global: { get: () => stores.get(domain.name)!,
        set: async (next: ReturnType<typeof stateSchema.parse>) => { writes++; stores.set(domain.name, stateSchema.parse(next)); } },
        close: async () => {} };
    } },
    connection: { fetch: { register: (route: { path: string; fetch(request: Request): Promise<Response> }) => {
      if (route.path === `${RPC_CHANNEL}/${RPC_ENDPOINT}`) rpc = route.fetch;
      return () => {};
    } } },
    tools: { register: () => () => {} },
  } as unknown as Context;
  try {
    await apply(ctx);
    assert.equal(stores.get('dsh_workbase')!.preferences.home.recent, false);
    assert.equal(stores.get('dsh_workbase')!.preferences.home.stats, true);
    assert.equal(writes, 1);
    const home = { ...stores.get('dsh_workbase')!.preferences.home, recent: true, stats: false };
    const response = await rpc!(new Request('http://fake/rpc', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'settings', method: RPC_ENDPOINT,
        payload: { op: 'settings', theme: 'violet', permissions: {}, options: { home, root: '' } } }),
    }));
    assert.equal((await response.json()).result.ok, true);
    const savedWrites = writes;
    await stop();
    await apply(ctx);
    assert.deepEqual(stores.get('dsh_workbase')!.preferences.home, home);
    assert.equal(writes, savedWrites, '再次启用不改写当前域');
    assert.equal(legacyOpens, 1, '旧域只迁入一次');
  } finally {
    await stop();
    if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
    if (previousAgents === undefined) delete process.env.DSH_AGENTS_HOME; else process.env.DSH_AGENTS_HOME = previousAgents;
    await rm(root, { recursive: true, force: true });
  }
});
