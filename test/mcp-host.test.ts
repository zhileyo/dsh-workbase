import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { openSync, readSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Context } from '@deepseek-ai/cordis';
import { createMcpBackend, type OfficialClient } from '../src/server/mcp-host.js';
import { McpManager } from '../src/server/mcp.js';
import type { Project } from '../src/shared/model.js';
import { beginMcpOAuth, mcpGrantKey, refreshMcpOAuth, type McpOAuthVault } from '../src/server/mcp-oauth.js';

interface ArchiveEntry { files?: Record<string, ArchiveEntry>; offset?: string; size?: number; unpacked?: boolean }
// Opt-in: this test reads the actual app but never loads the user's profile.
async function officialClient(home: string, withCredentials = false) {
  const archive = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar';
  const fd = openSync(archive, 'r'), header = Buffer.alloc(16);
  try {
    readSync(fd, header, 0, 16, 0);
    const raw = Buffer.alloc(header.readUInt32LE(12)); readSync(fd, raw, 0, raw.length, 16);
    const entries = new Map<string, ArchiveEntry>();
    const walk = (entry: ArchiveEntry, name = '') => {
      for (const [key, value] of Object.entries(entry.files ?? {})) {
        const full = name ? `${name}/${key}` : key;
        if (value.files) walk(value, full); else entries.set(full, value);
      }
    };
    walk(JSON.parse(raw.toString()) as ArchiveEntry);
    const root = 'dsh/node_modules/';
    const text = async (name: string) => {
      const entry = entries.get(name); if (!entry) throw new Error(`官方包文件缺失: ${name}`);
      if (entry.unpacked) return readFile(`${archive}.unpacked/${name}`, 'utf8');
      const data = Buffer.alloc(entry.size ?? 0);
      readSync(fd, data, 0, data.length, 8 + header.readUInt32LE(4) + Number(entry.offset));
      return data.toString();
    };
    const seen = new Set<string>();
    const copy = async (name: string) => {
      if (seen.has(name)) return; seen.add(name);
      const prefix = `${root}${name}/`;
      if (!entries.has(`${prefix}package.json`)) throw new Error(`官方运行时依赖缺失: ${name}`);
      const imports = new Set<string>();
      for (const filename of entries.keys()) {
        if (!filename.startsWith(prefix) || !/\.(?:[cm]?js|json)$/.test(filename)) continue;
        const value = await text(filename);
        const target = path.join(home, 'node_modules', filename.slice(root.length));
        await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, value);
        if (/\.[cm]?js$/.test(filename)) for (const match of value.matchAll(/(?:from\s*|import\s*(?:\(\s*)?|require\(\s*)["']([^"']+)["']/g)) {
          const specifier = match[1]!;
          if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) continue;
          const parts = specifier.split('/');
          const dependency = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
          if (entries.has(`${root}${dependency}/package.json`)) imports.add(dependency);
        }
      }
      for (const dependency of imports) await copy(dependency);
    };
    await copy('@deepseek-ai/dsh-mcp-client'); await copy('@deepseek-ai/cordis');
    if (withCredentials) await copy('@deepseek-ai/dsh-credentials-local');
    const output = path.join(home, 'node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js');
    const cordis = await import(pathToFileURL(path.join(home, 'node_modules/@deepseek-ai/cordis/lib/index.js')).href);
    const credentials = withCredentials ? await import(pathToFileURL(path.join(home,
      'node_modules/@deepseek-ai/dsh-credentials-local/lib/index.js')).href) : undefined;
    return { client: await import(pathToFileURL(output).href) as OfficialClient,
      Context: cordis.Context as typeof import('@deepseek-ai/cordis').Context, credentials };
  } finally { closeSync(fd); }
}
function rpc(request: { id?: number; method?: string; params?: { protocolVersion?: string } }) {
  if (request.id === undefined) return undefined;
  const result = request.method === 'initialize'
    ? { protocolVersion: request.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'local-fixture', version: '1' } }
    : request.method === 'tools/list' ? { tools: [{ name: 'echo', description: 'Local echo',
      inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } }] }
      : request.method === 'tools/call' ? { content: [{ type: 'text', text: 'local-result' }] } : {};
  return { jsonrpc: '2.0', id: request.id, result };
}
test('实际官方 rc.5 客户端在隔离 Context 完成 HTTP/stdio 握手、C03 秘密参数展开、工具调用及停用释放', {
  skip: process.env.DSH_MCP_HOST_TEST !== '1', timeout: 90_000,
}, async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'mcp-official-'));
  let manager: McpManager | undefined, ctx: Context | undefined;
  const server = createServer((request, response) => {
    if (request.method !== 'POST') { response.writeHead(405).end(); return; }
    let body = ''; request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      const result = rpc(JSON.parse(body));
      if (!result) response.writeHead(202).end();
      else response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
    });
  });
  try {
    const { client, Context: OfficialContext, credentials } = await officialClient(home, true);
    ctx = new OfficialContext() as Context;
    const credentialFiber = ctx.plugin(credentials!.LocalCredentialProvider, {
      path: path.join(home, '.credentials.yaml'), dshHome: home, watch: false,
    });
    await credentialFiber.await();
    const registered = new Map<string, { execute: (args: unknown, context: unknown) => Promise<unknown>;
      when?: (context: { agent?: { session: { id: string } } }) => boolean }>();
    ctx.provide('tools', { register(definition: { name: string; execute: (args: unknown, context: unknown) => Promise<unknown> },
      options?: { when?: (context: { agent?: { session: { id: string } } }) => boolean }) {
      registered.set(definition.name, { ...definition, when: options?.when }); return () => { registered.delete(definition.name); };
    } });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    manager = new McpManager({ home, projects: () => [
      { projectId: 'p1', workspaceId: 'workspace', sessionIds: ['permitted'], available: true, archived: false } as unknown as Project,
    ], backend: await createMcpBackend(ctx, client) });
    await manager.handle('save', { name: 'HTTP', url: `http://127.0.0.1:${address.port}/mcp`, autoReconnect: false,
      scope: 'project', projectIds: ['p1'], timeoutSeconds: 5 });
    await manager.settle();
    let snapshot = await manager.snapshot();
    assert.equal(snapshot.connections[0]?.state, 'connected', snapshot.connections[0]?.issue);
    const httpTool = snapshot.connections[0]!.tools[0]!;
    const execution = { agent: { session: { id: 'permitted' } }, signal: new AbortController().signal };
    assert.equal(registered.get(httpTool.name)!.when?.(execution), true);
    assert.equal(registered.get(httpTool.name)!.when?.({ agent: { session: { id: 'denied' } } }), false);
    await assert.rejects(registered.get(httpTool.name)!.execute({ value: 'local' },
      { agent: { session: { id: 'denied' } }, signal: execution.signal }), /范围/);
    assert.ok(JSON.stringify(await registered.get(httpTool.name)!.execute({ value: 'local' },
      execution)).includes('local-result'));
    await manager.handle('tool', { id: snapshot.connections[0]!.id, name: httpTool.name, enabled: false });
    assert.equal(registered.get(httpTool.name)!.when?.(execution), false);
    await assert.rejects(registered.get(httpTool.name)!.execute({ value: 'local' }, execution), /未启用/);
    await manager.handle('reconnect', { id: snapshot.connections[0]!.id }); await manager.settle();
    assert.equal(registered.get(httpTool.name)!.when?.(execution), false);
    await manager.handle('tool', { id: snapshot.connections[0]!.id, name: httpTool.name, enabled: true });
    assert.ok(JSON.stringify(await registered.get(httpTool.name)!.execute({ value: 'local' }, execution)).includes('local-result'));
    const fixture = path.join(home, 'stdio.cjs');
    const secretArgs = ['--authorization', 'synthetic-stdio-alpha', '--header', 'X-Custom: synthetic-stdio-beta',
      '-H', 'Authorization: synthetic-stdio-gamma', '--credential=synthetic-stdio-delta', '--port', '8080'];
    await writeFile(fixture, `require('node:assert/strict').deepEqual(process.argv.slice(2),${JSON.stringify(secretArgs)});
const readline=require('node:readline');const rpc=${rpc.toString()};
readline.createInterface({input:process.stdin}).on('line',line=>{const result=rpc(JSON.parse(line));if(result)process.stdout.write(JSON.stringify(result)+'\\n');});`);
    await manager.handle('save', { name: 'stdio', transport: 'stdio', command: process.execPath, args: [fixture, ...secretArgs],
      autoReconnect: false, timeoutSeconds: 5 });
    await manager.settle(); snapshot = await manager.snapshot();
    assert.ok(!JSON.stringify(snapshot).includes('synthetic-stdio-'));
    assert.ok(snapshot.connections.every(connection => connection.state === 'connected'), JSON.stringify(snapshot));
    const stdioTool = snapshot.connections.find(c => c.name === 'stdio')!.tools[0]!;
    assert.ok(JSON.stringify(await registered.get(stdioTool.name)!.execute({ value: 'local' },
      { agent: undefined, signal: new AbortController().signal })).includes('local-result'));
    for (const connection of snapshot.connections) await manager.handle('toggle', { id: connection.id, enabled: false });
    assert.equal(registered.size, 0);
  } finally {
    await manager?.dispose();
    await ctx?.fiber.dispose();
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});

test('C10 实际官方 rc.5 凭据库在隔离目录接受省略字段的 OAuth 授权和刷新 grant', {
  skip: process.env.DSH_MCP_HOST_TEST !== '1', timeout: 90_000,
}, async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'mcp-official-grant-'));
  let ctx: Context | undefined, base = '', tokenFields: Record<string, unknown> = {};
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', base);
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/.well-known/oauth-protected-resource/mcp')
      return response.end(JSON.stringify({ resource: `${base}/mcp`, authorization_servers: [base] }));
    if (url.pathname === '/.well-known/oauth-authorization-server')
      return response.end(JSON.stringify({ issuer: base, authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`, code_challenge_methods_supported: ['S256'] }));
    if (url.pathname === '/token') {
      request.resume();
      return request.on('end', () => response.end(JSON.stringify({
        token_type: 'Bearer', access_token: 'synthetic-access', ...tokenFields,
      })));
    }
    response.writeHead(404).end('{}');
  });
  const controller = new AbortController();
  try {
    const official = await officialClient(home, true);
    ctx = new official.Context() as Context;
    const filename = path.join(home, '.credentials.yaml');
    const fiber = ctx.plugin(official.credentials!.LocalCredentialProvider, {
      path: filename, dshHome: home, watch: false,
    });
    await fiber.await();
    const vault = ctx.get('credentials') as McpOAuthVault;
    assert.ok(vault);
    // 负向对照证明实际模块确实执行严格 JSON 校验，目标文件仅在临时目录。
    await assert.rejects(vault.modifyRecord(mcpGrantKey('synthetic-invalid'), async () =>
      ({ kind: 'grant', payload: { optional: undefined } })), TypeError);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    base = `http://127.0.0.1:${address.port}`;
    for (const [index, fields] of [{}, { expires_in: 3600 }, { refresh_token: 'synthetic-refresh' }].entries()) {
      tokenFields = fields;
      const authorization = await beginMcpOAuth(`${base}/mcp`, 'synthetic-client', '', controller.signal);
      const url = new URL(authorization.url), callback = new URL(url.searchParams.get('redirect_uri')!);
      callback.searchParams.set('code', 'synthetic-code'); callback.searchParams.set('state', url.searchParams.get('state')!);
      assert.equal((await fetch(callback)).status, 200);
      const grant = await authorization.done, id = `synthetic-${index}`;
      await vault.modifyRecord(mcpGrantKey(id), async () => ({ kind: 'grant', payload: grant }));
      assert.deepEqual((await vault.readRecord(mcpGrantKey(id)))?.payload, grant);
      if (grant.refreshToken) {
        tokenFields = {};
        const refreshed = await refreshMcpOAuth(vault, id, controller.signal, true);
        assert.equal(refreshed.refreshToken, 'synthetic-refresh');
        assert.equal(Object.hasOwn(refreshed, 'expiresAt'), false);
        assert.deepEqual((await vault.readRecord(mcpGrantKey(id)))?.payload, refreshed);
      }
    }
    assert.ok((await readFile(filename, 'utf8')).includes('synthetic-0'));
  } finally {
    controller.abort();
    await ctx?.fiber.dispose();
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});
