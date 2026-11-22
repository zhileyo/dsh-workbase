import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { z } from 'zod';

const grantSchema = z.object({
  resource: z.string(), tokenEndpoint: z.string(), clientId: z.string(),
  accessToken: z.string().min(1), refreshToken: z.string().optional(),
  expiresAt: z.number().optional(), scope: z.string().optional(),
});
export type McpOAuthGrant = z.infer<typeof grantSchema>;
export interface McpGrantRecord { kind: 'grant'; payload: unknown }
export interface McpOAuthVault {
  readRecord(key: string): Promise<{ kind: string; payload?: unknown } | undefined>;
  modifyRecord(key: string, mutate: (current: { kind: string; payload?: unknown } | undefined) =>
    Promise<McpGrantRecord | undefined>): Promise<{ kind: string; payload?: unknown } | undefined>;
  deleteRecord(key: string): Promise<void>;
}
export function mcpGrantKey(id: string) { return `dsh-workbase/${id}`; }
function endpoint(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.hash || !(url.protocol === 'https:'
    || url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)))
    throw new Error('OAuth 端点必须使用 HTTPS，本地回环测试除外');
  return url.href;
}
async function json(url: string, signal: AbortSignal, init: RequestInit = {}) {
  const response = await fetch(endpoint(url), { ...init, signal, redirect: 'error' });
  if (!response.ok) throw new Error('OAuth 服务拒绝请求');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('OAuth 服务没有响应');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 128 * 1024) throw new Error('OAuth 元数据或令牌响应过大');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks).toString()) as unknown;
}
async function token(url: string, body: URLSearchParams, signal: AbortSignal,
  previous: Pick<McpOAuthGrant, 'resource' | 'tokenEndpoint' | 'clientId' | 'refreshToken' | 'scope'>): Promise<McpOAuthGrant> {
  const value = z.object({ access_token: z.string().min(1), token_type: z.string(),
    refresh_token: z.string().min(1).optional(), expires_in: z.number().positive().max(31_536_000).optional(),
    scope: z.string().optional() }).parse(await json(url, signal, { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }));
  if (value.token_type.toLowerCase() !== 'bearer' || /[\r\n]/.test(value.access_token))
    throw new Error('OAuth 返回不支持的令牌类型');
  const grant: McpOAuthGrant = { resource: previous.resource, tokenEndpoint: previous.tokenEndpoint,
    clientId: previous.clientId, accessToken: value.access_token };
  const refreshToken = value.refresh_token ?? previous.refreshToken, scope = value.scope ?? previous.scope;
  if (refreshToken !== undefined) grant.refreshToken = refreshToken;
  if (scope !== undefined) grant.scope = scope;
  if (value.expires_in !== undefined) grant.expiresAt = Date.now() + value.expires_in * 1000;
  return grant;
}
export interface McpAuthorization {
  url: string; done: Promise<McpOAuthGrant>; cancel(): void;
}
export async function beginMcpOAuth(resource: string, clientId: string, scope: string,
  signal: AbortSignal): Promise<McpAuthorization> {
  endpoint(resource);
  const resourceUrl = new URL(resource);
  const protectedMetadata = new URL(`/.well-known/oauth-protected-resource${resourceUrl.pathname === '/' ? '' : resourceUrl.pathname}`, resourceUrl);
  let metadata: { resource: string; authorization_servers: string[]; scopes_supported?: string[] };
  try {
    metadata = z.object({ resource: z.string(), authorization_servers: z.array(z.string()).min(1),
      scopes_supported: z.array(z.string()).optional() }).parse(await json(protectedMetadata.href, signal));
  } catch (error) {
    signal.throwIfAborted();
    const root = new URL('/.well-known/oauth-protected-resource', resourceUrl);
    if (root.href === protectedMetadata.href) throw error;
    metadata = z.object({ resource: z.string(), authorization_servers: z.array(z.string()).min(1),
      scopes_supported: z.array(z.string()).optional() }).parse(await json(root.href, signal));
  }
  if (new URL(metadata.resource).href !== resourceUrl.href) throw new Error('OAuth 资源元数据与连接地址不匹配');
  const issuer = new URL(endpoint(metadata.authorization_servers[0]!));
  const discovery = new URL(`/.well-known/oauth-authorization-server${issuer.pathname === '/' ? '' : issuer.pathname}`, issuer);
  const auth = z.object({ issuer: z.string(), authorization_endpoint: z.string(), token_endpoint: z.string(),
    registration_endpoint: z.string().optional(), code_challenge_methods_supported: z.array(z.string()),
    token_endpoint_auth_methods_supported: z.array(z.string()).optional() }).parse(await json(discovery.href, signal));
  if (new URL(auth.issuer).href !== issuer.href || !auth.code_challenge_methods_supported.includes('S256')
    || auth.token_endpoint_auth_methods_supported && !auth.token_endpoint_auth_methods_supported.includes('none'))
    throw new Error('OAuth 服务不支持公开客户端 PKCE S256 或 issuer 不匹配');
  endpoint(auth.token_endpoint);
  const verifier = randomBytes(32).toString('base64url'), state = randomBytes(32).toString('base64url');
  const callbackPath = `/mcp/${randomBytes(24).toString('hex')}`;
  const controller = new AbortController();
  let resolve!: (grant: McpOAuthGrant) => void, reject!: (error: Error) => void, finished = false;
  const done = new Promise<McpOAuthGrant>((yes, no) => { resolve = yes; reject = no; });
  // A callback may fail before the caller has attached its completion listener.
  void done.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    if (timer) clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
    controller.abort(); server.closeAllConnections(); server.close();
  };
  const fail = (error: Error) => { if (finished) return; finished = true; close(); reject(error); };
  const cancel = () => { controller.abort(); fail(new Error('OAuth 授权已取消，配置保留')); close(); };
  let redirectUri = '';
  const server = createServer((request, response) => {
    let url: URL;
    try {
      const target = request.url ?? '';
      if (!target.startsWith('/') || target.startsWith('//') || target.includes('\\') || target.includes('#'))
        throw new Error('Invalid request target');
      // URL 容忍非法百分号；回调只接受可解码的 origin-form。
      decodeURI(target);
      url = new URL(target, redirectUri || 'http://127.0.0.1');
    } catch {
      response.writeHead(400).end('Invalid OAuth callback'); return;
    }
    const supplied = Buffer.from(url.searchParams.get('state') ?? '');
    if (request.method !== 'GET' || url.pathname !== callbackPath || url.searchParams.getAll('state').length !== 1
      || supplied.length !== Buffer.byteLength(state) || !timingSafeEqual(supplied, Buffer.from(state))) {
      response.writeHead(400).end('Invalid OAuth callback'); return;
    }
    if (finished || url.searchParams.getAll('code').length > 1) { response.writeHead(409).end('Callback already consumed'); return; }
    if (url.searchParams.has('error') || !url.searchParams.get('code')) {
      response.writeHead(400).end('Authorization denied'); fail(new Error('OAuth 授权被拒绝或缺少授权码')); return;
    }
    finished = true;
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'" }).end('Authorization received. Return to Workbase.');
    const body = new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code')!,
      redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier, resource });
    void token(auth.token_endpoint, body, controller.signal, { resource, tokenEndpoint: auth.token_endpoint, clientId, scope })
      .then(resolve, () => reject(new Error('OAuth 令牌交换失败，需要重新授权'))).finally(close);
  });
  server.headersTimeout = 5000; server.requestTimeout = 5000;
  try {
    signal.throwIfAborted();
    await new Promise<void>((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('OAuth 回调监听失败');
    redirectUri = `http://127.0.0.1:${address.port}${callbackPath}`;
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    timer = setTimeout(() => { controller.abort(); fail(new Error('OAuth 授权超时，配置保留')); }, 180_000);
    timer.unref();
    if (!clientId) {
      if (!auth.registration_endpoint) throw new Error('OAuth 服务没有动态注册端点，请填写公开客户端 ID');
      const registration = z.object({ client_id: z.string().min(1), token_endpoint_auth_method: z.string().optional() })
        .parse(await json(auth.registration_endpoint, controller.signal, { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'DeepSeek Workbase',
            redirect_uris: [redirectUri], grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'], token_endpoint_auth_method: 'none' }) }));
      if (registration.token_endpoint_auth_method && registration.token_endpoint_auth_method !== 'none')
        throw new Error('OAuth 注册不支持公开客户端');
      clientId = registration.client_id;
    }
    const url = new URL(endpoint(auth.authorization_endpoint));
    url.searchParams.set('response_type', 'code'); url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri); url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
    url.searchParams.set('code_challenge_method', 'S256'); url.searchParams.set('resource', resource);
    if (scope || metadata.scopes_supported?.length) url.searchParams.set('scope', scope || metadata.scopes_supported!.join(' '));
    signal.throwIfAborted();
    return { url: url.href, done, cancel };
  } catch (error) { fail(new Error('OAuth 授权初始化失败')); throw error; }
}
export async function refreshMcpOAuth(vault: McpOAuthVault, id: string, signal: AbortSignal, force = false) {
  const record = await vault.modifyRecord(mcpGrantKey(id), async current => {
    if (current?.kind !== 'grant') throw new Error('OAuth 凭据缺失，需要重新授权');
    const grant = grantSchema.parse(current.payload);
    if (!force && (!grant.expiresAt || grant.expiresAt > Date.now() + 60_000)) return undefined;
    if (!grant.refreshToken) throw new Error('OAuth 令牌到期且无法刷新，需要重新授权');
    const next = await token(grant.tokenEndpoint, new URLSearchParams({ grant_type: 'refresh_token',
      refresh_token: grant.refreshToken, client_id: grant.clientId, resource: grant.resource }), signal, grant);
    return { kind: 'grant', payload: next };
  });
  if (record?.kind !== 'grant') throw new Error('OAuth 凭据缺失');
  return grantSchema.parse(record.payload);
}
