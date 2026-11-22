import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandSchema } from '../src/shared/commands.js';
import { defaultStatCards, initialState, preferencesSchema } from '../src/shared/model.js';
import { extensionConfigSchema } from '../src/shared/extensions.js';
import { dispatch } from '../src/server/rpc.js';
import { WorkbaseService } from '../src/server/service.js';
import { Extensions } from '../src/server/extensions.js';

test('旧标准偏好迁移为五张统计卡；七项最多启用六项', () => {
  const old = { running: true, recent: true, pending: true, diagnostic: true };
  const preferences = initialState().preferences;
  const { statOrder: _order, ...home } = preferences.home;
  const next = preferencesSchema.parse({ ...preferences, home: { ...home, statCards: old } });
  assert.deepEqual(next.home.statCards, defaultStatCards());
  const seven = Object.fromEntries(Object.keys(defaultStatCards()).map(key => [key, true]));
  assert.equal(commandSchema.safeParse({ op: 'preferences', patch: {
    home: { ...preferences.home, statCards: seven },
  } }).success, false);
});

test('扩展默认值与连接超时边界在服务端校验', () => {
  assert.deepEqual(extensionConfigSchema.parse({}), {
    skills: { defaultSourceId: '', defaultEnabled: true },
    mcp: { injection: 'always', timeoutSeconds: 30, autoReconnect: true },
    rss: { refreshMinutes: 0 },
  });
  for (const timeoutSeconds of [0, 301, 1.5]) {
    assert.equal(extensionConfigSchema.safeParse({ mcp: { timeoutSeconds } }).success, false);
  }
  const result = commandSchema.parse({ op: 'preferences', patch: { selectedProject: null } });
  assert.equal('extensionConfig' in (result as { patch: object }).patch, false);
});

test('扩展RPC复用owner权限，未授权或已取消请求不调用模块', async () => {
  let state = initialState();
  const service = new WorkbaseService({ get: () => state, set: async next => { state = next; } },
    { workspaces: async () => [], sessions: async () => [], rename: async () => {} }, () => 'id');
  let calls = 0;
  const extensions = { handle: async () => { calls++; return { count: 2 }; } };
  const payload = { op: 'extensions', module: 'skills', method: 'summary' };
  assert.equal((await dispatch(service, payload, false, new AbortController().signal, extensions)).ok, false);
  assert.equal(calls, 0);
  const cancelled = new AbortController(); cancelled.abort();
  assert.equal((await dispatch(service, payload, true, cancelled.signal, extensions)).ok, false);
  assert.equal(calls, 0);
  assert.deepEqual(await dispatch(service, payload, true, new AbortController().signal, extensions),
    { ok: true, value: { count: 2 } });
  assert.equal(calls, 1);
  assert.equal((await dispatch(service, payload, true, new AbortController().signal)).ok, false);
});

test('扩展聚合入口将调用信号传给RSS，排队取消不会丢失', async () => {
  const controller = new AbortController();
  let supplied: AbortSignal | undefined;
  const extensions = Object.assign(Object.create(Extensions.prototype) as Extensions, {
    rss: { handle: async (_method: string, _input: unknown, signal: AbortSignal) => {
      supplied = signal;
      await Promise.resolve();
      signal.throwIfAborted();
    } },
  });
  const pending = extensions.handle('rss', 'feed.create', { name: 'RSS' }, controller.signal);
  controller.abort();
  await assert.rejects(pending);
  assert.equal(supplied, controller.signal);
});
