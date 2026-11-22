import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { McpManager, type McpBackend } from '../src/server/mcp.js';
import type { Project } from '../src/shared/model.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { McpCleanupError } from '../src/server/mcp-host.js';
import { redactMcpArgs, type McpConnection } from '../src/shared/mcp.js';

test('社区连接器是默认内置源，开关可持久化且初始化不连接', async () => {
  let connects = 0;
  const s = await setup({ connect: async () => { connects++; return { async dispose() {} }; } });
  try {
    const source = (await s.manager.snapshot()).sources.find(row => row.name === 'DSH 社区连接器')!;
    assert.ok(source);
    assert.equal(source.url, 'https://cdn.jsdelivr.net/gh/duhu2000/dsh-mcp-connector-registry@main/catalog.json');
    assert.equal(source.builtin, true);
    await s.manager.handle('sourceToggle', { id: source.id, enabled: false });
    await s.manager.dispose();
    const reloaded = new McpManager({ home: s.home, projects: () => [], backend: {} });
    try { assert.equal((await reloaded.snapshot()).sources.find(row => row.id === source.id)?.enabled, false); }
    finally { await reloaded.dispose(); }
    assert.equal(connects, 0);
  } finally { await s.close(); }
});
test('已有相同社区地址升级为内置名称，保留来源身份和停用选择', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'mcp-builtin-'));
  const filename = path.join(home, 'workbase', 'mcp.json');
  await mkdir(path.dirname(filename));
  await writeFile(filename, JSON.stringify({ version: 1, connections: [], sources: [
    { id: 'existing', name: '我的社区', url: 'https://cdn.jsdelivr.net/gh/duhu2000/dsh-mcp-connector-registry@main/catalog.json', enabled: false },
    { id: 'custom', name: '自定义', url: 'https://example.org/catalog.json', enabled: true },
  ] }));
  const manager = new McpManager({ home, projects: () => [], backend: {} });
  try {
    const sources = (await manager.snapshot()).sources;
    assert.equal(sources.length, 2);
    assert.deepEqual(sources.find(row => row.id === 'existing'), {
      id: 'existing', name: 'DSH 社区连接器',
      url: 'https://cdn.jsdelivr.net/gh/duhu2000/dsh-mcp-connector-registry@main/catalog.json', enabled: false, builtin: true,
    });
    assert.equal(JSON.parse(await readFile(filename, 'utf8')).sources.find((row: any) => row.id === 'existing').name, 'DSH 社区连接器');
    await assert.rejects(manager.handle('sourceRemove', { id: 'existing' }), /内置/);
    await assert.rejects(manager.handle('sourceSave', { id: 'existing', name: '改名', url: 'https://example.org/other' }), /内置/);
  } finally { await manager.dispose(); await rm(home, { recursive: true, force: true }); }
});
const draft = { name: '本地服务', transport: 'http', url: 'https://example.org/mcp', enabled: true };
for (const [keyHeader, secret] of [['X-New', ''], ['x-old', ''], ['X-New', 'synthetic-new']] as const) {
  test(`A09 API Key 改名 ${keyHeader}，${secret ? '替换' : '保留'}凭据且保留其他请求头`, async () => {
    const vault = new Map<string, string>();
    const s = await setup({ credentials: {
      set: async (key, value) => { vault.set(key, value); }, unset: async key => { vault.delete(key); },
    } });
    try {
      const saved = await s.manager.handle('save', { ...draft, enabled: false, auth: 'api-key',
        keyHeader: 'X-Old', secret: 'synthetic-old', headers: { 'X-Other': 'synthetic-other' } }) as McpConnection;
      const edited = await s.manager.handle('save', { id: saved.id, keyHeader, secret }) as McpConnection;
      assert.deepEqual(Object.keys(edited.headers).sort(), [keyHeader, 'X-Other'].sort());
      const ref = edited.headers[keyHeader]!.match(/credential:([^}]+)/)![1]!;
      assert.equal(vault.get(ref), secret || 'synthetic-old');
      assert.equal(edited.headers['X-Other'], saved.headers['X-Other']);
      if (!secret) assert.equal(vault.size, 2);
    } finally { await s.close(); }
  });
}
test('A09 目标认证头冲突拒绝保存且不改写原配置或凭据', async () => {
  const vault = new Map<string, string>();
  const s = await setup({ credentials: {
    set: async (key, value) => { vault.set(key, value); }, unset: async key => { vault.delete(key); },
  } });
  try {
    const saved = await s.manager.handle('save', { ...draft, enabled: false, auth: 'api-key',
      keyHeader: 'X-Old', secret: 'synthetic-old', headers: { 'x-new': 'synthetic-other' } }) as McpConnection;
    const before = await readFile(path.join(s.home, 'workbase/mcp.json'), 'utf8');
    await assert.rejects(s.manager.handle('save', { id: saved.id, keyHeader: 'X-New', secret: '' }), /冲突/);
    assert.equal(await readFile(path.join(s.home, 'workbase/mcp.json'), 'utf8'), before);
    assert.equal(vault.size, 2);
  } finally { await s.close(); }
});
test('A09 改名并替换密钥时凭据写失败，原认证头、配置和凭据保持不变', async () => {
  const vault = new Map<string, string>();
  let fail = false;
  const s = await setup({ credentials: {
    set: async (key, value) => { if (fail) throw new Error('synthetic failure'); vault.set(key, value); },
    unset: async key => { vault.delete(key); },
  } });
  try {
    const saved = await s.manager.handle('save', { ...draft, enabled: false, auth: 'api-key',
      keyHeader: 'X-Old', secret: 'synthetic-old' }) as McpConnection;
    const before = await readFile(path.join(s.home, 'workbase/mcp.json'), 'utf8');
    fail = true;
    await assert.rejects(s.manager.handle('save', { id: saved.id, keyHeader: 'X-New', secret: 'synthetic-new' }), /原配置保留/);
    assert.equal(await readFile(path.join(s.home, 'workbase/mcp.json'), 'utf8'), before);
    assert.deepEqual([...vault.values()], ['synthetic-old']);
  } finally { await s.close(); }
});
for (const auth of ['none', 'api-key'] as const) test(`A10 ${auth} HTTP 导出往返保留显式 transport 和旧 command`, async () => {
  const s = await setup(), target = await setup();
  try {
    const old = await s.manager.handle('save', { name: 'roundtrip', transport: 'stdio',
      command: 'synthetic-local', args: ['--port', '8080'], enabled: false }) as McpConnection;
    const saved = await s.manager.handle('save', { id: old.id, transport: 'http', url: draft.url, auth }) as McpConnection;
    const exported = await s.manager.handle('export', saved) as { content: string };
    const preview = await target.manager.handle('previewImport', { text: exported.content }) as { config: McpConnection }[];
    assert.equal(preview[0]!.config.transport, 'http');
    assert.deepEqual(await target.manager.handle('import', { text: exported.content, names: ['roundtrip'] }),
      { added: 1, skipped: 0, failed: [] });
    assert.equal((await target.manager.snapshot()).connections[0]!.transport, 'http');
    await assert.rejects(target.manager.handle('previewImport', { text: JSON.stringify({
      mcpServers: { invalid: { transport: 'invalid', command: 'synthetic-local' } },
    }) }));
  } finally { await s.close(); await target.close(); }
});
async function setup(backend?: McpBackend, projects: () => readonly Project[] = () => []) {
  const home = await mkdtemp(path.join(tmpdir(), 'workbase-mcp-'));
  const manager = new McpManager({ home, projects, backend });
  return { manager, home, close: async () => { await manager.dispose(); await rm(home, { recursive: true, force: true }); } };
}
test('缺少官方客户端仅保存配置，不假报已连接；身份和安装时间稳定', async () => {
  const s = await setup();
  try {
    const saved = await s.manager.handle('save', draft) as { id: string; prefix: string; installedAt: number };
    const edited = await s.manager.handle('save', { ...draft, id: saved.id, name: '改名' }) as typeof saved;
    assert.equal(edited.prefix, saved.prefix);
    assert.equal(edited.installedAt, saved.installedAt);
    assert.equal((await s.manager.summary()).count, 0);
    assert.equal((await s.manager.snapshot()).connections[0]?.state, 'unavailable');
    await assert.rejects(s.manager.handle('reconnect', { id: saved.id }), /官方/);
  } finally { await s.close(); }
});
test('损坏配置不会因未观察 ready 拒绝终止宿主，snapshot 保留读取失败', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'mcp-invalid-'));
  try {
    await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
      import { mkdir, writeFile } from 'node:fs/promises';
      import { McpManager } from './src/server/mcp.ts';
      await mkdir(${JSON.stringify(path.join(home, 'workbase'))}, { recursive: true });
      await writeFile(${JSON.stringify(path.join(home, 'workbase', 'mcp.json'))}, '{invalid');
      const manager = new McpManager({ home: ${JSON.stringify(home)}, projects: () => [], backend: {} });
      await new Promise(resolve => setTimeout(resolve, 50));
      try { await manager.snapshot(); process.exitCode = 2; }
      catch (error) { if (!error.message.includes('配置读取失败')) process.exitCode = 3; }
      await manager.dispose();
    `], { cwd: path.resolve(new URL('..', import.meta.url).pathname), timeout: 5000 });
  } finally { await rm(home, { recursive: true, force: true }); }
});
test('项目范围在声明与调用时实时检查，工具开关跨重连保留，停用后拒绝调用', async () => {
  let project = { projectId: 'p1', workspaceId: 'workspace', sessionIds: ['session'], available: true, archived: false } as unknown as Project;
  let allowed!: (identity: string | undefined, name: string) => boolean;
  let starts = 0, stops = 0;
  const s = await setup({ connect: async (_record, publish, _signal, permission) => {
    starts++; allowed = permission;
    publish({ state: 'connected', tools: [{ name: 'lookup', description: '查询', inputSchema: {} }] });
    return { dispose: async () => { stops++; } };
  } }, () => [project]);
  try {
    const saved = await s.manager.handle('save', { ...draft, scope: 'project', projectIds: ['p1'] }) as { id: string };
    await s.manager.settle();
    assert.equal(allowed('session', 'lookup'), true);
    assert.equal(allowed('workspace', 'lookup'), true);
    assert.equal(allowed('other', 'lookup'), false);
    assert.equal(allowed(undefined, 'lookup'), false);
    project = { ...project, archived: true }; assert.equal(allowed('session', 'lookup'), false);
    project = { ...project, archived: false };
    await s.manager.handle('tool', { id: saved.id, name: 'lookup', enabled: false });
    assert.equal(allowed('session', 'lookup'), false);
    await s.manager.handle('reconnect', saved); await s.manager.settle();
    assert.equal(starts, 2); assert.equal(stops, 1);
    assert.equal(allowed('session', 'lookup'), false);
    assert.equal((await s.manager.snapshot()).connections[0]!.tools[0]!.enabled, false);
    await s.manager.handle('tool', { id: saved.id, name: 'lookup', enabled: true });
    assert.equal(allowed('session', 'lookup'), true);
    await s.manager.handle('toggle', { id: saved.id, enabled: false });
    assert.equal(allowed('session', 'lookup'), false); assert.equal(stops, 2);
  } finally { await s.close(); }
});
test('替换配置前旧连接清理失败，保留旧配置，不写新凭据，并阻断后续重连', async () => {
  const vault = new Map<string, string>(); let fail = true;
  const s = await setup({ credentials: {
    set: async (key, value) => { vault.set(key, value); }, unset: async key => { vault.delete(key); },
  }, connect: async (_record, publish) => {
    publish({ state: 'connected' });
    return { dispose: async () => { if (fail) { fail = false; throw new Error('cleanup'); } } };
  } });
  try {
    const saved = await s.manager.handle('save', draft) as { id: string };
    await s.manager.settle();
    await assert.rejects(s.manager.handle('save', { ...draft, id: saved.id, auth: 'bearer', secret: 'committed-secret' }), /清理未确认/);
    assert.equal(vault.size, 0);
    const record = (await s.manager.snapshot()).connections[0]!;
    assert.equal(record.auth, 'none'); assert.equal(record.state, 'error');
    assert.ok(!(await readFile(path.join(s.home, 'workbase', 'mcp.json'), 'utf8')).includes('committed-secret'));
    await assert.rejects(s.manager.handle('reconnect', { id: saved.id }), /清理未确认/);
  } finally { await assert.rejects(s.manager.dispose(), /清理/); await rm(s.home, { recursive: true, force: true }); }
});
test('启动失败伴随清理未确认时保留关闭句柄，禁止第二次启动及配置删除', async () => {
  let starts = 0, closes = 0;
  const s = await setup({ connect: async () => {
    starts++;
    throw new McpCleanupError({ dispose: async () => { closes++; } });
  } });
  try {
    const saved = await s.manager.handle('save', draft) as { id: string };
    await s.manager.settle();
    assert.match((await s.manager.snapshot()).connections[0]!.issue, /清理未确认/);
    for (const [method, input] of [
      ['reconnect', saved], ['save', { ...draft, id: saved.id, name: 'replacement' }],
      ['toggle', { id: saved.id, enabled: false }], ['remove', saved],
    ] as const) await assert.rejects(s.manager.handle(method, input), /清理未确认/);
    assert.equal(starts, 1); assert.equal(closes, 0);
    assert.equal((await s.manager.snapshot()).connections[0]!.name, draft.name);
  } finally { await assert.rejects(s.manager.dispose(), /清理/); await rm(s.home, { recursive: true, force: true }); }
});
test('排队操作取消后不执行，已经开始的后台连接不继承请求取消', async () => {
  let release!: () => void, writing!: () => void, aborted = false;
  const entered = new Promise<void>(resolve => { writing = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const s = await setup({ credentials: {
    set: async () => { writing(); await gate; }, unset: async () => undefined,
  }, connect: async (_record, publish, signal) => {
    signal.addEventListener('abort', () => { aborted = true; });
    publish({ state: 'connected' }); return { dispose: async () => undefined };
  } });
  try {
    const firstSignal = new AbortController(), queuedSignal = new AbortController();
    const first = s.manager.handle('save', { ...draft, auth: 'bearer', secret: 'local' }, firstSignal.signal);
    await entered;
    const queued = s.manager.handle('save', { ...draft, name: 'must-not-run' }, queuedSignal.signal);
    queuedSignal.abort(); release(); await first;
    await assert.rejects(queued, /abort/i);
    firstSignal.abort(); await s.manager.settle();
    assert.equal(aborted, false);
    assert.equal((await s.manager.snapshot()).connections.length, 1);
  } finally { release(); await s.close(); }
});
test('握手超时不是成功，停用释放未完成后台连接', async () => {
  let aborted = false;
  const s = await setup({ connect: async (_record, _publish, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
  }) });
  try {
    await s.manager.handle('save', { ...draft, timeoutSeconds: 1 });
    // Keep an explicit waiter alive; production timers must not pin the process.
    await new Promise(resolve => setTimeout(resolve, 1100));
    await s.manager.settle();
    assert.equal(aborted, true);
    assert.equal((await s.manager.summary()).count, 0);
    assert.equal((await s.manager.snapshot()).connections[0]?.state, 'error');
  } finally { await s.close(); }
});
test('凭据仅写官方存储；摘要、磁盘、导出不含原文，空编辑保留，显式清除', async () => {
  const vault = new Map<string, string>();
  const s = await setup({
    credentials: { set: async (key, value) => { vault.set(key, value); }, unset: async key => { vault.delete(key); } },
  });
  try {
    const saved = await s.manager.handle('save', { ...draft, auth: 'bearer', secret: 'private-token', headers: { 'X-Custom': 'header-secret' } }) as { id: string };
    assert.equal(vault.size, 2);
    const disk = await readFile(path.join(s.home, 'workbase', 'mcp.json'), 'utf8');
    for (const text of [disk, JSON.stringify(await s.manager.snapshot()), JSON.stringify(await s.manager.handle('export', saved))]) {
      assert.ok(!text.includes('private-token'));
      assert.ok(!text.includes('header-secret'));
    }
    await s.manager.handle('save', { ...draft, id: saved.id, auth: 'bearer', secret: '' });
    assert.equal(vault.size, 2);
    await s.manager.handle('clearCredentials', saved);
    assert.equal(vault.size, 0);
  } finally { await s.close(); }
});
test('保存请求头、环境变量、参数、认证及 OAuth 引用后可重载，空编辑保留引用且不改写配置', async () => {
  const vault = new Map<string, string>();
  const s = await setup({ credentials: {
    set: async (key, value) => { vault.set(key, value); }, unset: async key => { vault.delete(key); },
  } });
  let reloaded: McpManager | undefined;
  try {
    await s.manager.handle('save', { ...draft, enabled: false, auth: 'bearer', secret: 'test-auth',
      headers: { 'X-Test': 'test-header' }, env: { TEST_KEY: 'test-env' }, args: ['--token', 'test-arg'] });
    const oauth = await s.manager.handle('save', { ...draft, name: 'OAuth', enabled: false, auth: 'oauth' }) as { id: string };
    const filename = path.join(s.home, 'workbase', 'mcp.json');
    const before = await readFile(filename, 'utf8');
    const refs: string[] = JSON.parse(before).connections.flatMap((row: any) => row.credentialRefs);
    for (const suffix of ['HEADER', 'ENV', 'ARG', 'AUTH', 'OAUTH']) assert.ok(refs.some(ref => ref.endsWith(`_${suffix}`)));
    await s.manager.dispose();
    reloaded = new McpManager({ home: s.home, projects: () => [], backend: {} });
    assert.equal((await reloaded.snapshot()).connections.length, 2);
    assert.equal(await readFile(filename, 'utf8'), before, '读取不改写已有配置');
    await reloaded.handle('save', { ...draft, id: oauth.id, name: 'OAuth', enabled: false, auth: 'oauth' });
    const afterRefs: string[] = JSON.parse(await readFile(filename, 'utf8')).connections.flatMap((row: any) => row.credentialRefs);
    assert.deepEqual(afterRefs, refs, 'OAuth 空编辑复用原凭据引用');
  } finally { await reloaded?.dispose(); await s.close(); }
});
test('实际状态与工具发现驱动成功，停用和dispose释放自有资源', async () => {
  let stopped = 0;
  const s = await setup({
    connect: async (_record, publish) => {
      publish({ state: 'connected', tools: [{ name: 'lookup', description: '查询', inputSchema: { type: 'object' } }] });
      return { dispose: async () => { stopped++; } };
    },
  });
  try {
    const saved = await s.manager.handle('save', draft) as { id: string };
    await s.manager.settle();
    assert.equal((await s.manager.summary()).count, 1);
    await s.manager.handle('tool', { id: saved.id, name: 'lookup', enabled: false });
    assert.equal((await s.manager.snapshot()).connections[0]?.tools[0]?.enabled, false);
    await s.manager.handle('toggle', { id: saved.id, enabled: false });
    assert.equal(stopped, 1);
    await assert.rejects(s.manager.handle('remove', { id: 'foreign' }), /自有/);
  } finally { await s.close(); }
});
test('JSON预览脱敏，确认重新去重，非法范围和会话隔离拒绝', async () => {
  const vault = new Map<string, string>();
  const s = await setup({ credentials: {
    set: async (key, value) => { vault.set(key, value); }, unset: async key => { vault.delete(key); },
  } });
  try {
    await assert.rejects(s.manager.handle('save', { ...draft, injection: 'session' }), /会话/);
    await assert.rejects(s.manager.handle('save', { ...draft, scope: 'project', projectIds: ['unknown'] }), /项目/);
    const input = { text: JSON.stringify({ mcpServers: { A: { url: draft.url, headers: { Authorization: 'never-return' } } } }) };
    assert.ok(!JSON.stringify(await s.manager.handle('previewImport', input)).includes('never-return'));
    await s.manager.handle('import', { ...input, names: ['A'] });
    await s.manager.handle('import', { ...input, names: ['A'] });
    assert.equal((await s.manager.snapshot()).connections.length, 1);
    assert.deepEqual([...vault.values()], ['never-return']);
  } finally { await s.close(); }
});
test('导入部分成功明确反馈并可重试，参数值不泄露，生效失败不能回滚已保存凭据', async () => {
  const vault = new Map<string, string>();
  const s = await setup({ credentials: {
    set: async (key, value) => { if (value === 'fail') throw new Error(); vault.set(key, value); },
    unset: async key => { vault.delete(key); },
  } });
  try {
    const input = { names: ['A', 'B'], text: JSON.stringify({ mcpServers: {
      A: { command: 'local', args: ['--token', 'arg-secret'], env: { KEY: 'env-secret' } },
      B: { url: draft.url, headers: { KEY: 'fail' } },
    } }) };
    const result = await s.manager.handle('import', input) as { added: number; failed: { name: string }[] };
    assert.equal(result.added, 1);
    assert.equal(result.failed[0]?.name, 'B');
    const again = await s.manager.handle('import', input) as { skipped: number };
    assert.equal(again.skipped, 1);
    const saved = (await s.manager.snapshot()).connections[0]!;
    assert.ok(!JSON.stringify(await s.manager.handle('export', { id: saved.id })).includes('arg-secret'));
    assert.ok([...vault.values()].includes('arg-secret'));
  } finally { await s.close(); }
});

test('C03 Authorization、credential、header 参数在保存、导入预览和导出使用同一秘密规则', async () => {
  const vault = new Map<string, string>();
  const s = await setup({ credentials: {
    set: async (key, value) => { vault.set(key, value); }, unset: async key => { vault.delete(key); },
  } });
  const args = ['--authorization', 'synthetic-alpha', '--credential=synthetic-beta',
    '--header', 'Authorization: synthetic-gamma', '-H', 'X-Custom: synthetic-delta',
    '-HAuthorization: synthetic-epsilon', '--credential', 'synthetic-zeta', '--port', '8080'];
  const secrets = ['synthetic-alpha', 'synthetic-beta', 'synthetic-gamma', 'synthetic-delta',
    'synthetic-epsilon', 'synthetic-zeta'];
  try {
    const text = JSON.stringify({ mcpServers: { protected: { command: 'local', args } } });
    const preview = await s.manager.handle('previewImport', { text });
    const saved = await s.manager.handle('save', { name: 'protected', transport: 'stdio',
      command: 'local', args, enabled: false }) as McpConnection;
    for (const output of [JSON.stringify(redactMcpArgs(args)), JSON.stringify(preview),
      await readFile(path.join(s.home, 'workbase', 'mcp.json'), 'utf8'),
      JSON.stringify(await s.manager.snapshot()), JSON.stringify(await s.manager.handle('export', saved))]) {
      for (const secret of secrets) assert.ok(!output.includes(secret), `秘密参数泄露: ${secret}`);
    }
    for (const secret of secrets) assert.ok([...vault.values()].some(value => value.includes(secret)));
    assert.deepEqual(saved.args.slice(-2), ['--port', '8080']);
    const edited = await s.manager.handle('save', { ...saved, description: 'edited' }) as McpConnection;
    assert.deepEqual(edited.args, saved.args);
    await s.manager.handle('remove', saved);
    assert.equal(vault.size, 0);
    assert.deepEqual(await s.manager.handle('import', { text, names: ['protected'] }),
      { added: 1, skipped: 0, failed: [] });
    const imported = (await s.manager.snapshot()).connections[0]!;
    for (const secret of secrets) assert.ok(!JSON.stringify(imported).includes(secret));
  } finally { await s.close(); }
});

for (const days of [1, 30, 365]) test(`C11 ${days} 天 OAuth 分段定时不会提前重连，到刷新窗口只重连一次`, async t => {
  const now = 1_800_000_000_000, maxDelay = 2_147_483_647, lifetime = days * 86_400_000;
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const delays: number[] = [], setTimer = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback: (...args: any[]) => void, delay?: number, ...args: any[]) => {
    delays.push(delay ?? 0);
    // 模拟 Node 对溢出延迟归一化为 1ms，虚拟计时器本身不执行此归一化。
    return setTimer(callback, delay && delay > maxDelay ? 1 : delay, ...args);
  });
  let connects = 0, disposes = 0, refreshes = 0, writes = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    refreshes++;
    return new Response(JSON.stringify({ token_type: 'Bearer', access_token: 'synthetic-refreshed', expires_in: 3600 }));
  });
  let stored = { kind: 'grant', payload: { resource: draft.url, tokenEndpoint: 'https://example.org/token',
    clientId: 'synthetic-client', accessToken: 'synthetic-initial', refreshToken: 'synthetic-refresh',
    expiresAt: now + lifetime } } as { kind: string; payload: unknown } | undefined;
  const s = await setup({
    credentials: { set: async () => { writes++; }, unset: async () => undefined },
    oauthVault: { readRecord: async () => stored, deleteRecord: async () => { stored = undefined; },
      modifyRecord: async (_key, mutate) => { stored = await mutate(stored) ?? stored; return stored; } },
    connect: async (_record, publish) => { connects++; publish({ state: 'connected' });
      return { dispose: async () => { disposes++; } }; },
  });
  try {
    await s.manager.handle('save', { ...draft, auth: 'oauth' });
    await s.manager.settle();
    assert.equal(connects, 1);
    const deadline = lifetime - 55_000;
    let elapsed = 0;
    while (elapsed < deadline - 1) {
      const step = Math.min(maxDelay, deadline - 1 - elapsed);
      t.mock.timers.tick(step); elapsed += step; await s.manager.settle();
      assert.equal(connects, 1, '刷新窗口前不能重连');
      assert.equal(disposes, 0);
      assert.equal(refreshes, 0);
      assert.equal(writes, 1);
    }
    assert.ok(delays.every(delay => delay <= maxDelay), '所有定时延迟必须符合 Node 上限');
    t.mock.timers.tick(1); await s.manager.settle();
    assert.equal(connects, 2);
    assert.equal(disposes, 1);
    assert.equal(refreshes, 1);
    assert.equal(writes, 2);
    t.mock.timers.tick(1000); await s.manager.settle();
    assert.equal(connects, 2);
    const saved = (await s.manager.snapshot()).connections[0]!;
    await s.manager.handle('toggle', { id: saved.id, enabled: false });
    t.mock.timers.tick(lifetime); await s.manager.settle();
    assert.equal(connects, 2, '停用必须取消后续刷新');
  } finally { await s.close(); t.mock.restoreAll(); t.mock.timers.reset(); }
});
