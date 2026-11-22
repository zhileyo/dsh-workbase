import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, request } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { beginMcpOAuth, refreshMcpOAuth, type McpOAuthVault, type McpGrantRecord } from '../src/server/mcp-oauth.js';

async function fakeOAuth(tokenFields: Record<string, unknown> = { refresh_token: 'refresh-private', expires_in: 3600 }) {
  let base = '', challenge = '', refreshes = 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', base);
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/.well-known/oauth-protected-resource/mcp')
      return response.end(JSON.stringify({ resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: ['read'] }));
    if (url.pathname === '/.well-known/oauth-authorization-server')
      return response.end(JSON.stringify({ issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`,
        registration_endpoint: `${base}/register`, code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] }));
    if (url.pathname === '/register') return response.end(JSON.stringify({ client_id: 'local-client', token_endpoint_auth_method: 'none' }));
    if (url.pathname === '/token') {
      let body = ''; request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        const params = new URLSearchParams(body);
        assert.equal(params.get('resource'), `${base}/mcp`);
        if (params.get('grant_type') === 'authorization_code') {
          assert.equal(params.get('client_id'), 'local-client');
          assert.equal(createHash('sha256').update(params.get('code_verifier')!).digest('base64url'), challenge);
        } else { refreshes++; assert.equal(params.get('refresh_token'), 'refresh-private'); }
        response.end(JSON.stringify({ token_type: 'Bearer', access_token: `access-private-${refreshes}`, ...tokenFields }));
      });
      return;
    }
    response.writeHead(404).end('{}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  base = `http://127.0.0.1:${address.port}`;
  return { base, challenge: (value: string) => { challenge = value; }, refreshes: () => refreshes,
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
test('A08 畸形及非 origin-form 回调返回400，监听仍可完成正常授权', async () => {
  const fake = await fakeOAuth(), controller = new AbortController();
  try {
    const authorization = await beginMcpOAuth(`${fake.base}/mcp`, 'local-client', '', controller.signal);
    const url = new URL(authorization.url); fake.challenge(url.searchParams.get('code_challenge')!);
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    // 隔离子进程承受未修复时的 uncaughtException，避免终止测试主进程。
    await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { request } from 'node:http';
      import { beginMcpOAuth } from './src/server/mcp-oauth.ts';
      const controller = new AbortController();
      const authorization = await beginMcpOAuth(${JSON.stringify(`${fake.base}/mcp`)}, 'local-client', '', controller.signal);
      try {
        const callback = new URL(new URL(authorization.url).searchParams.get('redirect_uri'));
        for (const path of ['http://[', 'http://invalid-host/callback', '//invalid-host/callback', '/%zz']) {
          const status = await new Promise((resolve, reject) => {
            const req = request({ hostname: callback.hostname, port: callback.port, path }, res => {
              res.resume(); res.on('end', () => resolve(res.statusCode));
            }); req.on('error', reject); req.end();
          });
          assert.equal(status, 400);
        }
      } finally { controller.abort(); await authorization.done.catch(() => {}); }
    `], { cwd: process.cwd(), timeout: 10000 });
    callback.searchParams.set('code', 'local-code'); callback.searchParams.set('state', url.searchParams.get('state')!);
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(callback, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject); req.end();
    });
    assert.equal(status, 200);
    assert.equal((await authorization.done).accessToken, 'access-private-0');
  } finally { controller.abort(); await fake.close(); }
});
test('本地 OAuth 元数据、动态注册、PKCE、state 校验、回调及令牌刷新形成完整闭环', async () => {
  const fake = await fakeOAuth(), controller = new AbortController();
  try {
    const authorization = await beginMcpOAuth(`${fake.base}/mcp`, '', '', controller.signal);
    const url = new URL(authorization.url); fake.challenge(url.searchParams.get('code_challenge')!);
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('scope'), 'read');
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    callback.searchParams.set('code', 'local-code'); callback.searchParams.set('state', 'wrong');
    assert.equal((await fetch(callback)).status, 400);
    callback.searchParams.set('state', url.searchParams.get('state')!);
    assert.equal((await fetch(callback)).status, 200);
    const grant = await authorization.done;
    assert.equal(grant.accessToken, 'access-private-0');
    let stored: McpGrantRecord | undefined = { kind: 'grant', payload: grant };
    const vault: McpOAuthVault = {
      readRecord: async () => stored, deleteRecord: async () => { stored = undefined; },
      modifyRecord: async (_key, mutate) => { stored = await mutate(stored) ?? stored; return stored; },
    };
    await refreshMcpOAuth(vault, 'wbmcp-local', controller.signal);
    assert.equal(fake.refreshes(), 0);
    assert.equal((await refreshMcpOAuth(vault, 'wbmcp-local', controller.signal, true)).accessToken, 'access-private-1');
  } finally { controller.abort(); await fake.close(); }
});
test('OAuth 取消释放回调监听，不假报授权成功；拒绝传输不安全的外部端点', async () => {
  const fake = await fakeOAuth(), controller = new AbortController();
  try {
    const authorization = await beginMcpOAuth(`${fake.base}/mcp`, 'local-client', '', controller.signal);
    const callback = new URL(new URL(authorization.url).searchParams.get('redirect_uri')!);
    controller.abort();
    await assert.rejects(authorization.done, /取消/);
    await assert.rejects(fetch(callback));
    await assert.rejects(beginMcpOAuth('http://example.org/mcp', '', '', new AbortController().signal), /HTTPS/);
  } finally { controller.abort(); await fake.close(); }
});

function assertStrictJson(value: unknown): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || typeof value === 'number' && Number.isFinite(value)) return;
  assert.ok(typeof value === 'object' && value !== null, '官方 grant 不接受 undefined 或非 JSON 值');
  for (const item of Object.values(value)) assertStrictJson(item);
}
for (const fields of [{}, { expires_in: 3600 }, { refresh_token: 'refresh-private' }]) {
  test(`C10 授权响应省略可选字段仍可存入严格 JSON vault: ${JSON.stringify(Object.keys(fields))}`, async () => {
    const fake = await fakeOAuth(fields), controller = new AbortController();
    try {
      const authorization = await beginMcpOAuth(`${fake.base}/mcp`, 'local-client', '', controller.signal);
      const url = new URL(authorization.url); fake.challenge(url.searchParams.get('code_challenge')!);
      const callback = new URL(url.searchParams.get('redirect_uri')!);
      callback.searchParams.set('code', 'local-code'); callback.searchParams.set('state', url.searchParams.get('state')!);
      assert.equal((await fetch(callback)).status, 200);
      const grant = await authorization.done;
      assertStrictJson({ kind: 'grant', payload: grant });
      assert.equal(Object.hasOwn(grant, 'refreshToken'), Object.hasOwn(fields, 'refresh_token'));
      assert.equal(Object.hasOwn(grant, 'expiresAt'), Object.hasOwn(fields, 'expires_in'));
    } finally { controller.abort(); await fake.close(); }
  });
}
test('C10 刷新省略 refresh_token、scope、expires_in 保留可用旧值但不保存旧过期时间或 undefined', async () => {
  const omitted = await fakeOAuth({}), controller = new AbortController();
  try {
    let stored: McpGrantRecord | undefined = { kind: 'grant', payload: {
      resource: `${omitted.base}/mcp`, tokenEndpoint: `${omitted.base}/token`, clientId: 'local-client',
      accessToken: 'synthetic-old', refreshToken: 'refresh-private', expiresAt: Date.now() - 1000,
    } };
    const vault: McpOAuthVault = { readRecord: async () => stored, deleteRecord: async () => { stored = undefined; },
      modifyRecord: async (_key, mutate) => {
        const next = await mutate(stored); if (next) { assertStrictJson(next); stored = next; } return stored;
      } };
    const grant = await refreshMcpOAuth(vault, 'synthetic-id', controller.signal);
    assert.equal(grant.refreshToken, 'refresh-private');
    assert.equal(Object.hasOwn(grant, 'expiresAt'), false);
    assert.equal(Object.hasOwn(grant, 'scope'), false);
    await refreshMcpOAuth(vault, 'synthetic-id', controller.signal);
    assert.equal(omitted.refreshes(), 1, '无到期时间不能重复刷新');
  } finally { controller.abort(); await omitted.close(); }
});
