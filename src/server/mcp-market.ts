import { createHash } from 'node:crypto';
import { mcpConfigSchema, type McpCandidate, type McpConfig, type McpCandidateMetadata, type McpCredentialField } from '../shared/mcp.js';

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const text = (value: unknown, max = 1000) => typeof value === 'string' ? value.slice(0, max) : '';
const list = (value: unknown) => Array.isArray(value) ? value.slice(0, 500) as unknown[] : [];
const variable = /\$\{|[{}]/;
const sensitive = /authorization|token|secret|password|api[_-]?key|credential/i;

/** 目录只生成待确认草稿；模板和敏感原文不成为连接凭据。 */
function fields(value: unknown, environment = false) {
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(object(value) ?? {}).slice(0, 100)) {
    if (typeof raw !== 'string' || key.length > 200) continue;
    result[key] = environment || sensitive.test(key) || variable.test(raw)
      || !/^(accept|content-type|user-agent|mcp-protocol-version)$/i.test(key) ? '' : raw.slice(0, 2000);
  }
  return result;
}
function argumentsFor(values: unknown) {
  const args: string[] = [];
  for (const raw of list(values)) {
    if (typeof raw === 'string') { args.push(raw); continue; }
    const item = object(raw); if (!item) continue;
    const name = text(item.name, 200);
    if (item.type === 'named' && name) args.push(name);
    const value = text(item.value, 2000);
    args.push(item.isSecret === true || variable.test(value) ? '' : value);
  }
  return args.map((value, index) => variable.test(value) || value.includes('${credential:')
    || !value.startsWith('-') && (sensitive.test(value) || sensitive.test(args[index - 1] ?? ''))
    || value.startsWith('-') && sensitive.test(value) && value.includes('=')
    ? '' : value);
}
function draft(name: string, description: string, config: Partial<McpConfig>, unsupported = ''): McpCandidate {
  const parsed = mcpConfigSchema.safeParse({ ...config, name: name.slice(0, 80), description });
  const issue = unsupported || (!parsed.success ? '此目录条目需要手工补充兼容的连接配置。'
    : [...Object.values(config.headers ?? {}), ...Object.values(config.env ?? {}), ...(config.args ?? [])].includes('')
      ? '请填写目录中的请求头、环境变量或参数后再保存。' : '');
  return { name: name.slice(0, 80), description, config: unsupported || !parsed.success ? {} : parsed.data,
    ...(issue ? { issue } : {}) };
}

function safeLink(value: unknown) {
  try {
    const url = new URL(text(value, 2000));
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
function connectorMetadata(connector: Record<string, unknown>, server: Record<string, unknown>): McpCandidateMetadata {
  const auth = object(connector.auth);
  const credentialFields: McpCredentialField[] = [];
  for (const [rawFields, rawBindings, target] of [
    [auth?.credentialFields, server.credentialBindings, 'env'],
    [auth?.headerCredentialFields, server.headerCredentialBindings, 'headers'],
  ] as const) {
    for (const raw of list(rawFields).slice(0, 50)) {
      const field = object(raw), key = text(field?.key, 200);
      if (!key || ['__proto__', 'constructor', 'prototype'].includes(key) || credentialFields.some(f => f.key === key)) continue;
      const bindings = Object.entries(object(rawBindings) ?? {}).slice(0, 100)
        .filter(([name, value]) => value === key && name.length <= 200
          && !['__proto__', 'constructor', 'prototype'].includes(name)
          && (target === 'env' ? /^[A-Za-z_][A-Za-z0-9_]*$/ : /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/).test(name))
        .map(([name]) => ({ target, name }));
      if (!bindings.length) continue;
      credentialFields.push({ key, label: text(field?.label, 200) || key, placeholder: text(field?.placeholder, 500),
        description: text(field?.description), required: field?.required === true, secret: field?.secret !== false,
        helpLabel: text(field?.helpLabel, 200), helpUrl: safeLink(field?.helpUrl), bindings });
    }
  }
  return {
    description: text(connector.description, 12000), vendor: text(connector.vendor, 200), category: text(connector.category, 200),
    homepage: safeLink(connector.homepage), credentialName: text(auth?.credentialName, 200),
    credentialPlaceholder: text(auth?.credentialPlaceholder, 500), credentialDescription: text(auth?.credentialDescription, 4000),
    credentialHelpLabel: text(auth?.credentialHelpLabel, 200), credentialHelpUrl: safeLink(auth?.credentialHelpUrl), credentialFields,
  };
}
function serverDraft(server: Record<string, unknown>, name: string, description: string, auth?: Record<string, unknown>, metadata?: McpCandidateMetadata) {
  const transport = text(server.transport) || (server.command ? 'stdio' : 'streamable-http');
  if (transport === 'sse') return draft(name, description, {}, '当前工作台不支持 SSE 传输，请配置 Streamable HTTP 或 stdio。');
  if (!['stdio', 'streamable-http', 'http'].includes(transport))
    return draft(name, description, {}, '此目录条目的传输方式尚不支持。');
  const mode = text(auth?.mode);
  if (mode && !['none', 'oauth2-pkce', 'oauth', 'bearer', 'api-key'].includes(mode))
    return draft(name, description, {}, '此目录条目的认证方式需要手工配置。');
  const authMode = transport === 'stdio' ? 'none' : mode === 'oauth2-pkce' || mode === 'oauth' ? 'oauth'
    : mode === 'bearer' || mode === 'api-key' ? mode : 'none';
  const env = fields(server.env, true), headers = fields(server.headers);
  for (const field of metadata?.credentialFields ?? []) for (const binding of field.bindings)
    (binding.target === 'env' ? env : headers)[binding.name] = '';
  return draft(name, description, {
    transport: transport === 'stdio' ? 'stdio' : 'http', url: text(server.url, 4000),
    command: text(server.command, 500), args: argumentsFor(server.args), env, headers,
    auth: authMode, keyHeader: text(auth?.apiKeyHeader, 200) || 'X-API-Key',
    oauthScope: text(auth?.scope), cwd: '', // 市场不能指定用户机器的工作目录。
  });
}

function packageDraft(pkg: Record<string, unknown>, name: string, description: string): McpCandidate {
  const registry = text(pkg.registryType), identifier = text(pkg.identifier, 300), version = text(pkg.version, 100);
  const transport = object(pkg.transport);
  if (transport?.type !== 'stdio' || !['npm', 'pypi'].includes(registry) || !identifier || identifier.startsWith('-')
    || !/^[\w@/.-]+$/.test(identifier) || version && !/^[\w.+-]+$/.test(version))
    return draft(name, description, {}, '此市场包需要手工配置启动命令。');
  const env: Record<string, string> = {};
  for (const raw of list(pkg.environmentVariables)) {
    const row = object(raw), key = text(row?.name, 200);
    if (key && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
      env[key] = row?.isSecret === true || variable.test(text(row?.value)) ? '' : text(row?.value, 2000);
  }
  const runtime = argumentsFor(pkg.runtimeArguments), args = argumentsFor(pkg.packageArguments);
  return draft(name, description, {
    transport: 'stdio', command: registry === 'npm' ? 'npx' : 'uvx', auth: 'none', env,
    args: registry === 'npm' ? [...runtime, '-y', `${identifier}${version ? `@${version}` : ''}`, ...args]
      : [...runtime, `${identifier}${version ? `==${version}` : ''}`, ...args],
  });
}

/** 兼容工作台简化目录、社区 ConnectorDescriptor 及官方 Registry。 */
export function parseMcpMarket(payload: unknown): McpCandidate[] {
  const data = object(payload), result: McpCandidate[] = [];
  const connectors = Array.isArray(payload) ? payload : data?.connectors;
  if (Array.isArray(connectors)) {
    for (const raw of list(connectors)) {
      const connector = object(raw);
      if (!connector || connector.published === false) continue;
      const name = text(connector.name, 80), description = text(connector.summary || connector.description);
      if (!name) continue;
      const servers = list(connector.servers);
      for (const raw of servers) {
        const server = object(raw); if (!server) continue;
        const suffix = text(server.serverKey || server.serverName, 40);
        const metadata = connectorMetadata(connector, server);
        result.push({ ...serverDraft(server, servers.length > 1 ? `${name.slice(0, 36)} · ${suffix}` : name, description,
          object(connector.auth), metadata), metadata });
      }
    }
  } else if (Array.isArray(data?.servers)) {
    for (const raw of list(data.servers)) {
      const row = object(raw); if (!row) continue;
      const server = object(row.server);
      if (!server) {
        const name = text(row.name, 80);
        if (name) {
          const config = object(row.config);
          result.push(draft(name, text(row.description), config ? {
            ...config, headers: fields(config.headers), env: fields(config.env, true), args: argumentsFor(config.args), cwd: '',
          } : {}));
        }
        continue;
      }
      const status = object(object(row._meta)?.['io.modelcontextprotocol.registry/official']);
      if (status?.status && status.status !== 'active' || status?.isLatest === false) continue;
      const name = text(server.title || server.name, 80), description = text(server.description);
      if (!name) continue;
      const remotes = list(server.remotes), packages = list(server.packages), multiple = remotes.length + packages.length > 1;
      for (const [index, raw] of remotes.entries()) {
        const remote = object(raw); if (!remote) continue;
        const headers: Record<string, string> = {};
        for (const raw of list(remote.headers)) {
          const header = object(raw), key = text(header?.name, 200);
          if (key) headers[key] = header?.isSecret === true ? '' : text(header?.value, 2000);
        }
        result.push(serverDraft({ ...remote, transport: remote.type, headers },
          multiple ? `${name.slice(0, 50)} · HTTP ${index + 1}` : name, description));
      }
      for (const [index, raw] of packages.entries()) {
        const pkg = object(raw); if (!pkg) continue;
        result.push(packageDraft(pkg, multiple ? `${name.slice(0, 50)} · ${text(pkg.registryType, 10)} ${index + 1}` : name, description));
      }
      if (!remotes.length && !packages.length) result.push(draft(name, description, {}));
    }
  } else throw new Error('市场目录格式不支持');
  return result;
}

export function mcpMarketUrl(value: string, query: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash)
    throw new Error('市场地址必须是不含凭据的 HTTP/HTTPS 地址');
  const official = url.origin === 'https://registry.modelcontextprotocol.io';
  if (official && ['/', '/v0.1/servers', '/v0/servers'].includes(url.pathname)) {
    if (url.pathname === '/') url.pathname = '/v0.1/servers';
    url.searchParams.set('limit', '100');
    if (query) url.searchParams.set('search', query); else url.searchParams.delete('search');
    url.searchParams.delete('cursor');
  }
  return { url, official };
}

async function fetchPage(url: URL, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted();
  const response = await fetch(url.href, { signal, redirect: 'error' });
  if (!response.ok) throw new Error(`市场目录 HTTP ${response.status}`);
  if (Number(response.headers.get('content-length') ?? 0) > 2 * 1024 * 1024) {
    await response.body?.cancel(); throw new Error('市场目录最大 2 MB');
  }
  const reader = response.body?.getReader(); if (!reader) throw new Error('市场目录没有响应内容');
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 2 * 1024 * 1024) throw new Error('市场目录最大 2 MB');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks).toString()) as unknown;
}

export async function loadMcpMarket(value: string, query: string, signal: AbortSignal) {
  const { url, official } = mcpMarketUrl(value, query), seen = new Set<string>(), cursors = new Set<string>();
  const candidates: McpCandidate[] = [];
  let truncated = false;
  for (let page = 0; page < 5; page++) {
    const payload = await fetchPage(url, signal);
    for (const row of parseMcpMarket(payload)) {
      if (!official && !`${row.name} ${row.description}`.toLowerCase().includes(query.toLowerCase())) continue;
      const id = createHash('sha256').update(JSON.stringify([row.name, row.config])).digest('hex');
      if (seen.has(id)) continue;
      if (candidates.length >= 500) { truncated = true; return { candidates, truncated }; }
      seen.add(id); candidates.push({ ...row, id });
    }
    const cursor = object(object(payload)?.metadata)?.nextCursor;
    if (!official || typeof cursor !== 'string' || !cursor) break;
    if (cursor.length > 4096 || cursors.has(cursor)) throw new Error('市场分页游标无效');
    cursors.add(cursor); url.searchParams.set('cursor', cursor); truncated = page === 4;
  }
  return { candidates, truncated };
}
