import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PluginUpdateController, type PluginManagerPort, type UpdateProgress, type Bundle } from '../src/client/plugin-update.js';
import { commandSchema } from '../src/shared/commands.js';
import { initialState, preferencesSchema } from '../src/shared/model.js';

const ok = <T>(value: T) => ({ ok: true as const, value });
const userBundle = (name: string, extra: Partial<Bundle> = {}): Bundle => ({
  name, version: '1.0.0', installed: true, availability: 'profile', official: false,
  source: '^1.0.0', updatable: true, ...extra,
});
const listed = (installed = '1.0.0') => ({
  status: 'listed' as const, installed, registry: 'https://registry.npmjs.org',
  versions: [
    { version: '3.0.0-beta.1', bundle: true, prerelease: true },
    { version: '2.9.0', bundle: true, incompatible: {} },
    { version: '2.8.0', bundle: true, deprecated: 'old' },
    { version: '2.0.0', bundle: true },
  ],
});
const updateSession = () => ({
  version: 1 as const,
  state: { phase: 'idle' as const, open: false, items: [], error: '' },
  listeners: new Set<() => void>(),
  automaticStarted: false,
  automaticChoice: undefined as boolean | undefined,
});

test('自动批次跨工作台热重载保留进度、完成结果和启动去重', async () => {
  const session = updateSession();
  const calls: string[] = [];
  let checks = 0, finish!: () => void;
  const manager = host({
    listBundles: async () => { checks++; return ok(['dsh-workbase', 'one'].map(name => userBundle(name))); },
    updateBundle: async name => {
      calls.push(name);
      if (name === 'dsh-workbase') await new Promise<void>(resolve => { finish = resolve; });
      return ok({ from: '1.0.0', to: '2.0.0', step: 'install', result: { application: 'applied' } });
    },
  });
  const old = new PluginUpdateController(manager, () => 'request', session);
  const pending = old.autoUpdate();
  await new Promise<void>(resolve => setImmediate(resolve));
  old.dispose();
  const next = new PluginUpdateController(manager, () => 'next-request', session);
  assert.equal(next.getSnapshot().phase, 'updating');
  assert.equal(next.getSnapshot().items.find(item => item.name === 'one')?.status, 'updated');
  let notifications = 0;
  const unsubscribe = next.subscribe(() => { notifications++; });
  // 重复清理旧实例不能移除新实例的订阅。
  old.dispose();
  await next.autoUpdate();
  await next.check();
  await next.update();
  assert.equal(checks, 1);
  finish();
  await pending;
  assert.equal(next.getSnapshot().phase, 'done');
  assert.ok(next.getSnapshot().items.every(item => item.status === 'updated'));
  assert.deepEqual(calls, ['one', 'dsh-workbase']);
  assert.ok(notifications > 0);
  unsubscribe(); next.dispose();
});

test('热重载时官方响应丢失保留未确认结果，不重新安装或继续后续目标', async () => {
  const session = updateSession();
  let calls = 0, reject!: (error: Error) => void;
  const manager = host({
    listBundles: async () => ok(['one', 'two'].map(name => userBundle(name))),
    updateBundle: async () => { calls++; return new Promise((_resolve, fail) => { reject = fail; }); },
  });
  const old = new PluginUpdateController(manager, () => 'request', session);
  const pending = old.autoUpdate();
  await new Promise<void>(resolve => setImmediate(resolve));
  old.dispose();
  const next = new PluginUpdateController(manager, () => 'next-request', session);
  assert.equal(next.getSnapshot().phase, 'updating');
  await next.autoUpdate();
  reject(new Error('连接中断'));
  await pending;
  assert.equal(next.getSnapshot().phase, 'done');
  assert.equal(next.getSnapshot().items[0]?.status, 'unknown');
  assert.equal(next.getSnapshot().items[1]?.status, 'available');
  assert.equal(calls, 1);
});

test('启动禁用选择跨热重载保持，真正新客户端可以再次自动更新', async () => {
  const session = updateSession();
  let checks = 0;
  const manager = host({ listBundles: async () => { checks++; return ok([]); } });
  const old = new PluginUpdateController(manager, () => 'request', session);
  await old.autoUpdate(false);
  old.dispose();
  await new PluginUpdateController(manager, () => 'next-request', session).autoUpdate(true);
  assert.equal(checks, 0);
  await new PluginUpdateController(manager, () => 'fresh-request', updateSession()).autoUpdate(true);
  assert.equal(checks, 1);
});

test('检查中热重载会收尾，不遗留永久忙状态或自动开始安装', async () => {
  const session = updateSession();
  let finish!: () => void, updates = 0;
  const manager = host({
    listBundles: async () => {
      await new Promise<void>(resolve => { finish = resolve; });
      return ok([userBundle('one')]);
    },
    updateBundle: async () => { updates++; throw new Error('不应安装'); },
  });
  const old = new PluginUpdateController(manager, () => 'request', session);
  const pending = old.autoUpdate();
  old.dispose();
  const next = new PluginUpdateController(manager, () => 'next-request', session);
  finish();
  await pending;
  assert.equal(next.getSnapshot().phase, 'done');
  assert.match(next.getSnapshot().error, /重新加载/);
  assert.equal(updates, 0);
});

test('新版宿主仅返回update时仍检查registry插件，Git不误走registry更新', async () => {
  const checked: string[] = [];
  const controller = new PluginUpdateController(host({
    listBundles: async () => ok([
      { name: 'dsh-context', version: '0.83.1', installed: true, availability: 'profile', official: false, update: 'registry' },
      { name: 'git-copy', installed: true, availability: 'profile', official: false, update: 'git', updatable: true },
    ]),
    listVersions: async name => { checked.push(name); return ok(listed('0.83.1')); },
  }));
  await controller.check();
  assert.deepEqual(checked, ['dsh-context']);
  assert.deepEqual(controller.getSnapshot().items.map(item => item.status), ['available', 'skipped']);
});
function host(overrides: Partial<PluginManagerPort> = {}): PluginManagerPort {
  return {
    listBundles: async () => ok([userBundle('one'), userBundle('local', { updatable: false })]),
    listVersions: async () => ok(listed()),
    updateBundle: async () => ok({ from: '1.0.0', to: '2.0.0', step: 'install', result: { application: 'applied' } }),
    ...overrides,
  };
}
test('插件更新开关兼容旧偏好，增量保存不重置开关', () => {
  const preferences = initialState().preferences;
  assert.equal(preferences.pluginUpdateVisible, true);
  const { pluginUpdateVisible: _removed, ...old } = preferences;
  assert.equal(preferencesSchema.parse(old).pluginUpdateVisible, true);
  const patch = commandSchema.parse({ op: 'preferences', patch: { root: '/tmp' } });
  assert.equal(patch.op === 'preferences' && 'pluginUpdateVisible' in patch.patch, false);
  assert.doesNotThrow(() => commandSchema.parse({ op: 'settings', theme: 'follow', permissions: {},
    options: { home: preferences.home, root: '', pluginUpdateVisible: false } }));
});

test('自动更新默认关闭，旧数据补齐且增量请求不覆盖已保存选择', () => {
  const preferences = initialState().preferences;
  assert.equal(preferences.pluginAutoUpdate, false);
  const { pluginAutoUpdate: _removed, ...old } = preferences;
  assert.equal(preferencesSchema.parse(old).pluginAutoUpdate, false);
  const patch = commandSchema.parse({ op: 'preferences', patch: { root: '/tmp' } });
  assert.equal(patch.op === 'preferences' && 'pluginAutoUpdate' in patch.patch, false);
  assert.doesNotThrow(() => commandSchema.parse({ op: 'settings', theme: 'follow', permissions: {},
    options: { home: preferences.home, root: '', pluginAutoUpdate: true } }));
});

test('自动检查后后台更新且只执行一次，打开进度不重复批次', async () => {
  let checks = 0, updates = 0, finish!: () => void;
  const controller = new PluginUpdateController(host({
    listBundles: async () => { checks++; return ok([userBundle('one')]); },
    updateBundle: async () => {
      updates++;
      await new Promise<void>(resolve => { finish = resolve; });
      return ok({ from: '1.0.0', to: '2.0.0', step: 'install', result: { application: 'applied' } });
    },
  }), () => 'request');
  const pending = controller.autoUpdate();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(controller.busy, true);
  assert.equal(controller.getSnapshot().open, false);
  assert.equal(controller.getSnapshot().phase, 'updating');
  controller.open();
  controller.close();
  await controller.autoUpdate();
  assert.equal(checks, 1);
  assert.equal(updates, 1);
  finish();
  await pending;
  assert.equal(controller.busy, false);
  assert.equal(controller.getSnapshot().items[0]?.status, 'updated');
  await controller.autoUpdate();
  assert.equal(checks, 1);
});

test('自动更新无新版本或检查失败均保留结果；手动检查和卸载不被自动批次重置', async () => {
  let updates = 0;
  for (const listBundles of [async () => ok([]), async () => { throw new Error('网络失败'); }]) {
    const controller = new PluginUpdateController(host({
      listBundles, updateBundle: async () => { updates++; throw new Error('不应更新'); },
    }));
    await controller.autoUpdate();
    assert.equal(controller.getSnapshot().phase, 'done');
    assert.equal(controller.getSnapshot().open, false);
    assert.equal(updates, 0);
  }
  const controller = new PluginUpdateController(host());
  await controller.check();
  await controller.autoUpdate();
  assert.equal(controller.getSnapshot().phase, 'confirm');
  controller.dispose();
  await controller.autoUpdate();
  assert.equal(controller.getSnapshot().phase, 'confirm');
});

test('逐项检查全部来源，排除预发布、不兼容及弃用版本，失败不中断其他检查', async () => {
  const checked: string[] = [];
  const states: string[] = [];
  const controller = new PluginUpdateController(host({
    listBundles: async () => ok([
      userBundle('one'), userBundle('broken'),
      userBundle('local', { updatable: false }), userBundle('latest'),
    ]),
    listVersions: async name => {
      checked.push(name);
      if (name === 'broken') throw new Error('网络错误');
      return ok(name === 'latest' ? { ...listed(), versions: [] } : listed());
    },
  }), () => 'request');
  controller.subscribe(() => states.push(controller.getSnapshot().phase));
  await controller.check();
  assert.deepEqual(checked, ['one', 'broken', 'latest']);
  assert.ok(states.includes('checking'));
  assert.equal(controller.getSnapshot().phase, 'confirm');
  assert.deepEqual(controller.getSnapshot().items.map(item => item.status), ['available', 'failed', 'skipped', 'current']);
  assert.equal(controller.getSnapshot().items[0]?.to, '2.0.0');
  assert.equal(controller.getSnapshot().items[1]?.detail, '网络错误');
});

test('仅列用户已安装插件，宿主自带、官方目录及缺失项目均不参与检查或更新', async () => {
  const checked: string[] = [], updated: string[] = [];
  const controller = new PluginUpdateController(host({
    listBundles: async () => ok([
      userBundle('third-party'),
      userBundle('local', { updatable: false, source: 'file:local.tgz' }),
      userBundle('internal', { availability: 'installation', installed: false }),
      userBundle('official', { official: true }),
      userBundle('catalog', { installed: false, availability: 'missing' }),
      userBundle('removed', { installed: false }),
    ]),
    listVersions: async name => { checked.push(name); return ok(listed()); },
    updateBundle: async name => {
      updated.push(name);
      return ok({ from: '1.0.0', to: '2.0.0', step: 'install', result: { application: 'applied' } });
    },
  }), () => 'request');
  await controller.check();
  assert.deepEqual(controller.getSnapshot().items.map(item => item.name), ['third-party', 'local']);
  assert.deepEqual(checked, ['third-party']);
  await controller.update();
  assert.deepEqual(updated, ['third-party']);
});

test('官方默认安装源null可确认并原样传给更新服务', async () => {
  let registry: unknown = 'unset';
  const controller = new PluginUpdateController(host({
    listVersions: async () => ok({ ...listed(), registry: null }),
    updateBundle: async (_name, _version, options) => {
      registry = options.registry;
      return ok({ from: '1.0.0', to: '2.0.0', step: 'install', result: { application: 'applied' } });
    },
  }), () => 'request');
  await controller.check();
  assert.equal(controller.getSnapshot().phase, 'confirm');
  await controller.update();
  assert.equal(registry, null);
});

test('更新串行执行并匹配请求进度，保留回滚及重启结果，工作台自身最后更新', async () => {
  const calls: string[] = [];
  let controller: PluginUpdateController;
  controller = new PluginUpdateController(host({
    listBundles: async () => ok(['dsh-workbase', 'one', 'broken'].map(name => userBundle(name))),
    updateBundle: async (name, _version, options) => {
      calls.push(name);
      const progress: UpdateProgress = { requestId: options.requestId, step: 'installing' };
      controller.progress({ ...progress, requestId: 'other' });
      assert.deepEqual(controller.getSnapshot().items.find(item => item.name === name)?.steps, []);
      controller.progress(progress);
      assert.deepEqual(controller.getSnapshot().items.find(item => item.name === name)?.steps, ['installing']);
      if (name === 'broken') return ok({ from: '1.0.0', to: '2.0.0', step: 'install',
        result: { application: 'failed', error: { diagnostic: '安装失败' }, packageResult: { output: 'pnpm failed' } },
        restore: { application: 'applied' } });
      return ok({ from: '1.0.0', to: '2.0.0', step: 'install', result: { application: name === 'one' ? 'restart-required' : 'applied' } });
    },
  }), () => calls.length.toString());
  await controller.check();
  await controller.update();
  assert.deepEqual(calls, ['one', 'broken', 'dsh-workbase']);
  assert.equal(controller.getSnapshot().phase, 'done');
  assert.equal(controller.getSnapshot().items.find(item => item.name === 'one')?.status, 'restart');
  const broken = controller.getSnapshot().items.find(item => item.name === 'broken');
  assert.equal(broken?.status, 'failed');
  assert.match(broken!.detail, /已恢复 1.0.0/);
  assert.equal(broken?.output, 'pnpm failed');
  assert.deepEqual(broken?.steps, ['checking', 'installing', 'restoring']);
});

test('重复点击不并发，检查可后台继续，更新响应丢失时停止后续更新', async () => {
  let resolve!: (value: ReturnType<typeof ok<ReturnType<typeof listed>>>) => void;
  let checks = 0, updates = 0;
  const controller = new PluginUpdateController(host({
    listBundles: async () => ok([userBundle('one'), userBundle('two')]),
    listVersions: async () => { checks++; return checks === 1 ? new Promise(done => { resolve = done; }) : ok(listed()); },
    updateBundle: async () => { updates++; throw new Error('连接断开'); },
  }), () => 'request');
  const pending = controller.check();
  await new Promise<void>(done => setImmediate(done));
  await controller.check();
  controller.close();
  assert.equal(controller.getSnapshot().phase, 'checking');
  assert.equal(controller.getSnapshot().open, false);
  controller.open();
  assert.equal(controller.getSnapshot().open, true);
  assert.equal(checks, 1);
  resolve(ok(listed()));
  await pending;
  await Promise.all([controller.update(), controller.update()]);
  assert.equal(updates, 1);
  assert.equal(controller.getSnapshot().items[0]?.status, 'unknown');
  assert.equal(controller.getSnapshot().items[1]?.status, 'available');
  assert.match(controller.getSnapshot().error, /连接断开/);
});

test('关闭再打开保留后台更新进度和结果，串行批次不重复启动', async () => {
  let finish!: () => void;
  const calls: string[] = [];
  let checks = 0;
  const controller = new PluginUpdateController(host({
    listBundles: async () => { checks++; return ok(['one', 'two'].map(name => userBundle(name))); },
    updateBundle: async name => {
      calls.push(name);
      if (name === 'one') await new Promise<void>(resolve => { finish = resolve; });
      return ok({ from: '1.0.0', to: '2.0.0', step: 'install', result: { application: 'applied' } });
    },
  }), () => 'request');
  controller.open();
  await new Promise<void>(resolve => setImmediate(resolve));
  const pending = controller.update();
  controller.close();
  controller.progress({ requestId: 'request', step: 'installing' });
  assert.equal(controller.getSnapshot().open, false);
  assert.equal(controller.getSnapshot().phase, 'updating');
  controller.open();
  await controller.check();
  await controller.update();
  assert.deepEqual(controller.getSnapshot().items[0]?.steps, ['installing']);
  assert.equal(checks, 1);
  assert.deepEqual(calls, ['one']);
  controller.close();
  finish();
  await pending;
  assert.equal(controller.getSnapshot().open, false);
  assert.equal(controller.getSnapshot().phase, 'done');
  controller.open();
  assert.equal(checks, 1);
  assert.deepEqual(calls, ['one', 'two']);
  assert.deepEqual(controller.getSnapshot().items.map(item => item.status), ['updated', 'updated']);
});
