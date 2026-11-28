import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import type { Project } from '../shared/model.js';
import { builtinMcpSource, mcpConfigSchema, mcpDefaults, mcpRedactedConfig, type McpConfig, type McpConnection,
  redactMcpArgs, isMcpSecretArg, type McpConnectionView, type McpSnapshot, type McpSource, type McpTool } from '../shared/mcp.js';
import { createMcpBackend, McpCleanupError } from './mcp-host.js';
import { beginMcpOAuth, mcpGrantKey, refreshMcpOAuth, type McpOAuthVault, type McpAuthorization } from './mcp-oauth.js';
import { marketSourceAllowed } from './mcp-market.js';
import { McpMarketCache } from './mcp-market-cache.js';

export interface McpRuntimeUpdate {
  state: McpConnectionView['state']; issue?: string; tools?: Omit<McpTool, 'enabled'>[];
}
export interface McpLease { dispose(): Promise<void> }
/** Optional seam for isolated tests; production uses only the verified official adapter. */
export interface McpBackend {
  credentials?: { set(ref: string, value: string): Promise<void>; unset(ref: string): Promise<void> };
  oauthVault?: McpOAuthVault;
  /** 官方客户端不可用的真实原因；undefined 表示纯能力缺失（宿主确实没提供这个包）。 */
  issue?: string;
  /**
   * sessionId 是 agent.session.id，既可能命中登记项目的 workspaceId，也可能命中它的 sessionIds，
   * 参数名按真实语义命名，不要按名字「修正」成只比对工作区。
   */
  connect?(record: McpConnection, publish: (update: McpRuntimeUpdate) => void,
    signal: AbortSignal, allowed: (sessionId: string | undefined, publicName: string) => boolean): Promise<McpLease>;
  foreign?(): { name: string; source: string; readonly: true }[];
}
export interface McpManagerOptions {
  ctx?: Context; home: string; projects: () => readonly Project[];
  config?: () => { injection: 'always' | 'session'; timeoutSeconds: number; autoReconnect: boolean };
  backend?: McpBackend;
}
interface Runtime {
  update: McpRuntimeUpdate; controller: AbortController; done: Promise<void>; lease?: McpLease;
  timer?: ReturnType<typeof setTimeout>; refreshTimer?: ReturnType<typeof setTimeout>;
  cleanupUnconfirmed?: boolean;
}
const inputObject = z.record(z.string(), z.unknown());
const isolationIssue = '按会话隔离没有当前官方公开契约；OAuth 使用 PKCE 与官方凭据库';
// 引用包含 HEADER / ENV / ARG / AUTH / OAUTH 后缀，不仅是十六进制字符。
const credentialRefPattern = /^WB_MCP_[A-Z0-9_]+$/;
const sourceSchema = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(80),
  url: z.string().url(), enabled: z.boolean().default(true) });
const storedSchema = z.object({ version: z.literal(1), connections: z.array(z.unknown()), sources: z.array(sourceSchema.extend({ id: z.string() })) });
export class McpManager {
  private records: McpConnection[] = [];
  private sources: McpSource[] = [];
  private backend: McpBackend = {};
  private readonly runtime = new Map<string, Runtime>();
  private readonly authorizations = new Map<string, { controller: AbortController; task?: McpAuthorization }>();
  private tail: Promise<unknown> = Promise.resolve();
  private readonly ready: Promise<void>;
  private stopped = false;
  private readonly lifecycle = new AbortController();
  private readonly filename: string;
  private readonly marketCache: McpMarketCache;
  constructor(private readonly options: McpManagerOptions) {
    this.filename = path.join(options.home, 'workbase', 'mcp.json');
    // 市场目录缓存独立成类；lifecycle 是字段初始化的 AbortController，构造体内已可用。
    this.marketCache = new McpMarketCache(path.join(options.home, 'workbase', 'mcp-market.json'), this.lifecycle.signal);
    this.ready = this.initialize();
    void this.ready.catch(() => undefined);
  }
  private defaults() { return { ...mcpDefaults, ...this.options.config?.() }; }
  private async initialize() {
    this.backend = this.options.backend ?? (this.options.ctx ? await createMcpBackend(this.options.ctx) : {});
    try {
      const data = storedSchema.parse(JSON.parse(await readFile(this.filename, 'utf8')));
      this.records = data.connections.map(raw => {
        const item = inputObject.parse(raw);
        const oldScope = String(item.scope ?? 'global');
        const scope = oldScope === 'global' ? 'global' : 'project';
        const config = mcpConfigSchema.parse({ ...mcpDefaults, ...item, scope,
          projectIds: item.projectIds ?? (oldScope !== 'global' && oldScope !== 'project' ? [oldScope] : []) });
        const meta = z.object({ id: z.string().regex(/^wbmcp-[a-f0-9-]+$/), prefix: z.string().regex(/^wb_[a-f0-9]{24}$/),
          installedAt: z.number(), revision: z.number().int(), credentialRefs: z.array(z.string().regex(credentialRefPattern)),
          hasSecret: z.boolean(), disabledTools: z.array(z.string()) }).parse(item);
        return { ...config, ...meta };
      });
      this.sources = data.sources;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('连接器配置读取失败，原文件未改写');
    }
    const existing = this.sources.find(source => source.url === builtinMcpSource.url || source.id === builtinMcpSource.id);
    const builtin = { ...builtinMcpSource, id: existing?.id ?? builtinMcpSource.id, enabled: existing?.enabled ?? true };
    const sources = [...this.sources.filter(source => source !== existing), builtin];
    if (!existing || existing.name !== builtin.name || existing.url !== builtin.url) await this.persist(this.records, sources);
    else this.sources = sources;
    await this.marketCache.load();
    for (const record of this.records) this.start(record);
  }
  private queue<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const run = this.tail.then(async () => {
      await this.ready; signal?.throwIfAborted();
      if (this.stopped) throw new Error('连接器模块已卸载'); return operation();
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
  private async persist(records = this.records, sources = this.sources) {
    await mkdir(path.dirname(this.filename), { recursive: true, mode: 0o700 });
    const temp = `${this.filename}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify({ version: 1, connections: records, sources }), { mode: 0o600, flag: 'wx' });
      await rename(temp, this.filename);
    } finally { await rm(temp, { force: true }); }
    this.records = records;
    this.sources = sources;
  }
  private owned(id: unknown) {
    const record = this.records.find(item => item.id === id);
    if (!record) throw new Error('只能管理工作台自有连接器条目');
    return record;
  }
  private validateScope(config: McpConfig) {
    if (config.injection === 'session') throw new Error('官方宿主未提供按会话隔离，此选项不可用');
    if (config.scope === 'global') { config.projectIds = []; return; }
    config.projectIds = [...new Set(config.projectIds)];
    if (!config.projectIds.length || config.projectIds.some(id =>
      !this.options.projects().some(project => project.projectId === id && project.available && !project.archived)))
      throw new Error('请至少选择一个可用且未归档的登记项目');
  }
  private start(record: McpConnection) {
    if (!record.enabled || this.stopped || this.runtime.has(record.id)) return;
    const controller = new AbortController();
    const runtime: Runtime = { controller, update: { state: 'connecting' }, done: Promise.resolve() };
    this.runtime.set(record.id, runtime);
    const publish = (update: McpRuntimeUpdate) => {
      if (controller.signal.aborted || this.runtime.get(record.id) !== runtime) return;
      runtime.update = { ...runtime.update, ...update };
      // 看门狗只兜「握手还没有结果」：任何终态都必须停掉，否则等待授权的连接会被改写成超时错误。
      if (update.state !== 'connecting') clearTimeout(runtime.timer);
    };
    if (!this.backend.connect) { publish({ state: 'unavailable', issue: this.backend.issue ?? '缺少官方连接器客户端，不能建立连接' }); return; }
    runtime.timer = setTimeout(() => { publish({ state: 'error', issue: '连接握手或工具发现超时' }); controller.abort(); }, record.timeoutSeconds * 1000);
    runtime.timer.unref();
    runtime.done = (async () => {
      if (record.auth === 'oauth') {
        if (!this.backend.oauthVault || !this.backend.credentials) throw new Error('oauth');
        const grant = await refreshMcpOAuth(this.backend.oauthVault, record.id, controller.signal);
        if (grant.resource !== record.url) throw new Error('oauth');
        const ref = this.oauthTokenRef(record);
        await this.backend.credentials.set(ref, `Bearer ${grant.accessToken}`);
        controller.signal.throwIfAborted();
        if (grant.expiresAt) {
          const deadline = Math.max(Date.now() + 1000, grant.expiresAt - 55_000);
          const schedule = () => {
            if (controller.signal.aborted || this.runtime.get(record.id) !== runtime) return;
            runtime.refreshTimer = setTimeout(() => {
              if (Date.now() < deadline) { schedule(); return; }
              void this.queue(async () => {
                if (this.runtime.get(record.id) !== runtime) return;
                await this.stop(record.id); this.start(this.owned(record.id));
              }).catch(() => undefined);
            }, Math.min(2_147_483_647, Math.max(1, deadline - Date.now())));
            runtime.refreshTimer.unref();
          };
          schedule();
        }
      }
      return this.backend.connect!(record, publish, controller.signal, (sessionId, name) =>
        this.toolAllowed(record, runtime, sessionId, name));
    })().then(async lease => {
      runtime.lease = lease;
      if (controller.signal.aborted) await lease.dispose();
    }).catch(error => {
      clearTimeout(runtime.timer);
      if (error instanceof McpCleanupError) {
        runtime.cleanupUnconfirmed = true; runtime.lease = error.lease;
        clearTimeout(runtime.refreshTimer);
        runtime.update = { ...runtime.update, state: 'error', issue: error.message };
        return;
      }
      publish({ state: record.auth === 'oauth' ? 'auth' : 'error', issue: record.auth === 'oauth'
        ? 'OAuth 凭据缺失、过期或启动失败，需要重新授权'
        : '官方客户端启动、握手或工具注册失败，请检查服务与宿主诊断' });
    });
  }
  /** 工具授权判定：会话身份、项目归属、启用状态与连接状态只在这里合成一次。 */
  private toolAllowed(record: McpConnection, runtime: Runtime, sessionId: string | undefined, publicName: string) {
    const current = this.records.find(r => r.id === record.id);
    const project = this.options.projects().find(p =>
      (p.workspaceId === sessionId || p.sessionIds.includes(sessionId ?? '')) && p.available && !p.archived);
    return !!current && current.enabled && runtime.update.state === 'connected'
      && !current.disabledTools.includes(publicName) && (current.scope === 'global' || !!project && current.projectIds.includes(project.projectId));
  }
  private oauthTokenRef(record: McpConnection) {
    const ref = record.headers.Authorization?.match(/^\$\{credential:([A-Z0-9_]+)\}$/)?.[1];
    if (!ref || !credentialRefPattern.test(ref) || !record.credentialRefs.includes(ref)) throw new Error('OAuth 凭据引用缺失');
    return ref;
  }
  private async stop(id: string) {
    const authorization = this.authorizations.get(id);
    authorization?.controller.abort(); authorization?.task?.cancel(); this.authorizations.delete(id);
    const runtime = this.runtime.get(id);
    if (!runtime) return;
    runtime.controller.abort();
    clearTimeout(runtime.timer); clearTimeout(runtime.refreshTimer);
    await runtime.done;
    if (runtime.cleanupUnconfirmed) throw new Error('官方连接器客户端资源清理未确认，需要重启宿主');
    try { await runtime.lease?.dispose(); }
    catch {
      runtime.cleanupUnconfirmed = true;
      runtime.update = { ...runtime.update, state: 'error', issue: '官方连接器客户端资源清理未确认，需要重启宿主' };
      throw new Error(runtime.update.issue);
    }
    this.runtime.delete(id);
  }
  async settle() { await this.ready; await this.tail; await Promise.all([...this.runtime.values()].map(r => r.done)); }
  async snapshot(): Promise<McpSnapshot> {
    await this.ready;
    const connections = this.records.map(record => {
      const runtime = this.runtime.get(record.id);
      const state = !record.enabled ? 'disabled' as const : runtime?.update.state ?? 'unknown';
      return { ...structuredClone(record), state, issue: runtime?.update.issue ?? '',
        authorizationUrl: this.authorizations.get(record.id)?.task?.url,
        busy: state === 'connecting', tools: (runtime?.update.tools ?? []).map(tool =>
          ({ ...tool, enabled: !record.disabledTools.includes(tool.name) })) };
    });
    return { connections, sources: structuredClone(this.sources), foreign: (this.backend.foreign?.() ?? [])
      .filter(item => !this.records.some(record => record.prefix === item.name)),
      defaults: this.defaults(), capabilities: { connection: !!this.backend.connect, credentials: !!this.backend.credentials,
        oauth: !!this.backend.connect && !!this.backend.oauthVault && !!this.backend.credentials,
        sessionIsolation: false,
        // 加载失败或导出契约变更要带上真实原因，不能伪装成「这台宿主没有这个能力」。
        issue: this.backend.issue ? `${this.backend.issue}；${isolationIssue}` : isolationIssue } };
  }
  async summary() {
    const snapshot = await this.snapshot();
    const count = snapshot.connections.filter(c => c.state === 'connected').length;
    const errors = snapshot.connections.filter(c => ['error', 'auth', 'unavailable'].includes(c.state)).length;
    return { count, detail: `${snapshot.connections.length} 个配置${errors ? ` · ${errors} 个异常` : ''}`, errors };
  }
  async handle(method: string, input: unknown = {}, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    if (method === 'snapshot') return this.snapshot();
    if (method === 'summary') return this.summary();
    if (method === 'market.cached') {
      await this.ready; signal?.throwIfAborted(); this.lifecycle.signal.throwIfAborted();
      const params = inputObject.parse(input), query = z.string().max(100).parse(params.query ?? '').trim();
      return this.marketCache.cached(this.sources, query);
    }
    return this.queue(async () => {
      const params = inputObject.parse(input);
      if (method === 'save') return this.save(params);
      if (method === 'export') {
        const record = this.owned(params.id);
        return { filename: 'mcp.json', content: JSON.stringify({ mcpServers: { [record.name]: mcpRedactedConfig(record) } }, null, 2) };
      }
      if (method === 'previewImport' || method === 'import') {
        const candidates = this.parseImport(params);
        if (method === 'previewImport') return candidates.map(c => ({ name: c.name,
          duplicate: this.records.some(r => r.name === c.name), config: { ...c, headers: {}, env: {}, args: redactMcpArgs(c.args) } }));
        const names = z.array(z.string()).parse(params.names);
        let added = 0, skipped = 0;
        const failed: { name: string; message: string }[] = [];
        for (const candidate of candidates.filter(c => names.includes(c.name))) {
          if (this.records.some(r => r.name === candidate.name)) { skipped++; continue; }
          try { await this.save(candidate); added++; }
          catch { failed.push({ name: candidate.name, message: '配置或官方凭据保存失败，未导入；可重试' }); }
        }
        return { added, skipped, failed };
      }
      if (method === 'sourceSave') {
        const source = sourceSchema.parse(params);
        if (this.sources.some(s => s.id === source.id && s.builtin)) throw new Error('内置市场来源仅支持启停');
        const url = this.sourceUrl(source.url);
        if (this.sources.some(s => s.id !== source.id && (s.name === source.name || s.url === url))) throw new Error('来源名称或地址重复');
        if (source.id && !this.sources.some(s => s.id === source.id)) throw new Error('来源不存在');
        const saved = { ...source, url, id: source.id ?? `wbmcps-${randomUUID()}` };
        await this.persist(this.records, [...this.sources.filter(s => s.id !== saved.id), saved]);
        return saved;
      }
      if (method === 'sourceToggle' || method === 'sourceRemove') {
        const source = this.sources.find(s => s.id === params.id);
        if (!source) throw new Error('来源不存在');
        if (method === 'sourceRemove' && source.builtin) throw new Error('内置市场来源仅支持启停');
        await this.persist(this.records, method === 'sourceRemove' ? this.sources.filter(s => s !== source)
          : this.sources.map(s => s === source ? { ...s, enabled: z.boolean().parse(params.enabled) } : s));
        return { saved: true };
      }
      if (method === 'market') return this.marketCache.fetch(this.sources, z.string().max(100).parse(params.query ?? '').trim(), signal);
      const record = this.owned(params.id);
      if (method === 'oauth') return this.authorize(record);
      if (method === 'refreshToken') {
        if (record.auth !== 'oauth' || !record.enabled || !this.backend.oauthVault) throw new Error('OAuth 刷新不可用');
        await this.stop(record.id);
        try {
          await refreshMcpOAuth(this.backend.oauthVault, record.id, AbortSignal.timeout(15_000), true);
        } catch { this.start(record); throw new Error('OAuth 刷新失败，需要重新授权'); }
        this.start(record); return { queued: true };
      }
      if (method === 'cancelOAuth') {
        await this.stop(record.id); this.start(record);
        return { cancelled: true, configurationRetained: true };
      }
      if (method === 'reconnect') {
        if (!this.backend.connect) throw new Error('缺少官方连接器客户端');
        if (!record.enabled) throw new Error('连接已停用');
        await this.stop(record.id); this.start(record); return { queued: true };
      }
      if (method === 'toggle') return this.save({ ...record, enabled: z.boolean().parse(params.enabled) });
      if (method === 'tool') {
        if (this.runtime.get(record.id)?.update.state !== 'connected') throw new Error('当前连接不可用，工具开关已禁用');
        const name = z.string().parse(params.name), enabled = z.boolean().parse(params.enabled);
        if (!this.runtime.get(record.id)?.update.tools?.some(t => t.name === name)) throw new Error('工具不存在');
        const next = { ...record, disabledTools: enabled ? record.disabledTools.filter(n => n !== name) : [...new Set([...record.disabledTools, name])],
          revision: record.revision + 1 };
        await this.persist(this.records.map(r => r === record ? next : r));
        return { saved: true };
      }
      if (method === 'clearCredentials') {
        if (!this.backend.credentials) throw new Error('官方凭据存储不可用');
        await this.stop(record.id);
        // 逐项清除并记录进度：中途失败必须说明已经清掉了多少项，不能只报「清除失败」。
        const cleared: string[] = [], failures: string[] = [];
        for (const ref of record.credentialRefs) {
          try { await this.backend.credentials.unset(ref); cleared.push(ref); }
          catch (error) { failures.push(`${ref}：${error instanceof Error ? error.message : String(error)}`); }
        }
        if (failures.length) {
          // 部分失败不能让已启用记录停在「无 runtime 的 unknown」状态：先恢复连接再如实报错，
          // 已清除的项不写回配置（credentialRefs 仍被请求头引用，不能删名）。
          this.start(record);
          throw new Error(`凭据未能全部清除（已清除 ${cleared.length} 项，共 ${record.credentialRefs.length} 项）：${failures.join('；')}`);
        }
        await this.backend.oauthVault?.deleteRecord(mcpGrantKey(record.id));
        const next = { ...record, hasSecret: false, revision: record.revision + 1 };
        await this.persist(this.records.map(r => r === record ? next : r)); this.start(next);
        return { cleared: true };
      }
      if (method === 'remove') {
        await this.stop(record.id);
        await this.persist(this.records.filter(r => r !== record));
        const failures: string[] = [];
        for (const ref of record.credentialRefs) {
          try { await this.backend.credentials?.unset(ref); } catch { failures.push(ref); }
        }
        try { await this.backend.oauthVault?.deleteRecord(mcpGrantKey(record.id)); } catch { failures.push('oauth'); }
        return { removed: true, credentialCleanupPending: failures.length };
      }
      throw new Error('未知连接器操作');
    }, signal);
  }
  private async save(params: Record<string, unknown>) {
    const old = params.id ? this.owned(params.id) : undefined;
    if (params.revision !== undefined && old && params.revision !== old.revision) throw new Error('配置已更新，请重新读取后保存');
    const config = mcpConfigSchema.parse({ ...this.defaults(), ...old, ...params });
    if (old?.auth === 'api-key' && config.auth === 'api-key' && old.keyHeader !== config.keyHeader) {
      const oldNames = Object.keys(old.headers).filter(name => name.toLowerCase() === old.keyHeader.toLowerCase());
      const oldValue = oldNames.length === 1 ? old.headers[oldNames[0]!] : undefined;
      const sourceNames = new Set(oldNames);
      const destinations = Object.keys(config.headers).filter(name =>
        name.toLowerCase() === config.keyHeader.toLowerCase() && !sourceNames.has(name));
      if (oldNames.length > 1 || destinations.some(name => config.headers[name] !== oldValue))
        throw new Error('认证请求头与目标请求头冲突，请先处理其他同名请求头');
      for (const name of oldNames) {
        if (config.headers[name] === oldValue) delete config.headers[name];
      }
      for (const name of destinations) delete config.headers[name];
      if (oldValue !== undefined) config.headers[config.keyHeader] = oldValue;
    }
    if (old && old.auth !== config.auth) {
      const header = old.auth === 'api-key' ? old.keyHeader : 'Authorization';
      if (old.auth !== 'none' && config.headers[header] === old.headers[header]) delete config.headers[header];
    }
    this.validateScope(config);
    if (this.records.some(r => r !== old && r.name === config.name)) throw new Error('连接名称重复');
    const id = old?.id ?? `wbmcp-${randomUUID()}`;
    const prefix = old?.prefix ?? `wb_${id.replaceAll('-', '').slice(-24)}`;
    const refs = [...(old?.credentialRefs ?? [])];
    const secrets = new Map<string, string>();
    const protect = (value: string, field: string) => {
      if (value.startsWith('${credential:')) {
        const ref = value.match(/^\$\{credential:([A-Z0-9_]+)\}$/)?.[1];
        if (!ref || !credentialRefPattern.test(ref) || !refs.includes(ref)) throw new Error('不能引用其他条目的凭据');
        return value;
      }
      const ref = `WB_MCP_${randomUUID().replaceAll('-', '').toUpperCase()}_${field}`;
      refs.push(ref); secrets.set(ref, value);
      return `\${credential:${ref}}`;
    };
    // Treat every header/env value as sensitive, not just well-known token field names.
    config.headers = Object.fromEntries(Object.entries(config.headers).map(([k, v]) => [k, v ? protect(v, 'HEADER') : v]));
    config.env = Object.fromEntries(Object.entries(config.env).map(([k, v]) => [k, v ? protect(v, 'ENV') : v]));
    config.args = config.args.map((value, index, args) => {
      if (isMcpSecretArg(args, index)) return protect(value, 'ARG');
      return value;
    });
    const secret = z.string().optional().parse(params.secret);
    let hasSecret = secrets.size > 0 || (old?.hasSecret ?? false);
    if (config.auth === 'oauth') {
      const ref = old?.auth === 'oauth' ? this.oauthTokenRef(old) : `WB_MCP_${randomUUID().replaceAll('-', '').toUpperCase()}_OAUTH`;
      if (!refs.includes(ref)) refs.push(ref);
      config.headers.Authorization = `\${credential:${ref}}`;
    }
    if (secret) {
      if (!['bearer', 'api-key'].includes(config.auth) || config.transport !== 'http') throw new Error('此认证字段只适用于 HTTP');
      const value = protect(config.auth === 'bearer' ? `Bearer ${secret}` : secret, 'AUTH');
      config.headers[config.auth === 'bearer' ? 'Authorization' : config.keyHeader] = value;
      hasSecret = true;
    }
    if (secrets.size && !this.backend.credentials) throw new Error('官方凭据存储不可用，不能保存敏感值');
    const stored: string[] = [];
    let committed = false;
    try {
      if (old) await this.stop(old.id);
      for (const [ref, value] of secrets) { await this.backend.credentials!.set(ref, value); stored.push(ref); }
      const record: McpConnection = { ...config, id, prefix, installedAt: old?.installedAt ?? Date.now(),
        revision: (old?.revision ?? 0) + 1, credentialRefs: refs, hasSecret, disabledTools: old?.disabledTools ?? [] };
      await this.persist([...this.records.filter(r => r !== old), record]);
      committed = true;
      this.start(record);
      return (await this.snapshot()).connections.find(r => r.id === id)!;
    } catch (error) {
      if (committed) throw new Error('连接器配置与凭据已保存，但旧连接资源清理失败；请重启宿主后重试');
      // 回滚同样可能失败：失败时不能再对外声称「原配置保留」。
      const rollbackFailures: string[] = [];
      for (const ref of stored) {
        try { await this.backend.credentials?.unset(ref); }
        catch (error) { rollbackFailures.push(`${ref}：${error instanceof Error ? error.message : String(error)}`); }
      }
      if (rollbackFailures.length) {
        throw new Error(`连接器保存失败，且新写入的凭据未能回滚（${rollbackFailures.join('；')}）；请重新保存或手动清理后重试`);
      }
      if (old && !this.runtime.has(old.id)) this.start(old);
      if (old && this.runtime.get(old.id)?.cleanupUnconfirmed) throw new Error('官方连接器客户端资源清理未确认，需要重启宿主');
      throw error instanceof z.ZodError ? new Error('连接器字段格式无效，请检查输入') : new Error('连接器配置或凭据保存失败，原配置保留');
    }
  }
  private parseImport(params: Record<string, unknown>) {
    const text = z.string().parse(params.text);
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error('JSON 文件不能超过 2 MB');
    const root = inputObject.parse(JSON.parse(text));
    const servers = inputObject.parse(root.mcpServers);
    if (Object.keys(servers).length > 500) throw new Error('一次最多导入 500 个连接');
    return Object.entries(servers).map(([name, value]) => {
      const item = inputObject.parse(value);
      const config = mcpConfigSchema.parse({ ...this.defaults(), ...item, name,
        transport: item.transport === undefined ? (item.command ? 'stdio' : 'http') : item.transport,
        scope: params.scope ?? 'global', projectIds: params.projectIds ?? [] });
      this.validateScope(config);
      return config;
    });
  }
  private sourceUrl(value: string) {
    const url = new URL(value);
    if (!marketSourceAllowed(url) || url.username || url.password) throw new Error('来源需要 HTTPS 地址（仅本机回环允许 http）');
    url.hash = ''; return url.href;
  }
  async dispose() {
    this.stopped = true;
    this.lifecycle.abort();
    this.marketCache.clear();
    await this.ready.catch(() => undefined);
    await this.tail;
    for (const job of this.authorizations.values()) { job.controller.abort(); job.task?.cancel(); }
    this.authorizations.clear();
    const results = await Promise.allSettled([...this.runtime.keys()].map(id => this.stop(id)));
    if (results.some(result => result.status === 'rejected')) throw new Error('部分连接器资源清理未确认，请重启宿主');
  }
  private async authorize(record: McpConnection) {
    if (record.auth !== 'oauth' || !record.enabled || !this.backend.connect || !this.backend.oauthVault || !this.backend.credentials)
      throw new Error('OAuth 需要启用 HTTP 连接、官方客户端与官方凭据库');
    if (this.authorizations.has(record.id)) throw new Error('授权正在进行，请完成或取消后重试');
    await this.stop(record.id);
    const controller = new AbortController(), job: { controller: AbortController; task?: McpAuthorization } = { controller };
    this.authorizations.set(record.id, job);
    const timeout = setTimeout(() => controller.abort(), 180_000); timeout.unref();
    try {
      job.task = await beginMcpOAuth(record.url, record.oauthClientId, record.oauthScope,
        AbortSignal.any([controller.signal, this.lifecycle.signal, AbortSignal.timeout(180_000)]));
      const runtime: Runtime = { controller: new AbortController(), done: Promise.resolve(),
        update: { state: 'auth', issue: '等待 OAuth 授权，可打开授权页或取消' } };
      this.runtime.set(record.id, runtime);
      void job.task.done.then(grant => this.queue(async () => {
        if (controller.signal.aborted || this.authorizations.get(record.id) !== job) return;
        await this.backend.oauthVault!.modifyRecord(mcpGrantKey(record.id), async () => ({ kind: 'grant', payload: grant }));
        await this.backend.credentials!.set(this.oauthTokenRef(record), `Bearer ${grant.accessToken}`);
        const next = { ...this.owned(record.id), hasSecret: true };
        await this.persist(this.records.map(r => r.id === next.id ? next : r));
        this.authorizations.delete(record.id); await this.stop(record.id); this.start(next);
      })).catch(() => {
        if (this.authorizations.get(record.id) !== job) return;
        runtime.update = { state: 'auth', issue: controller.signal.aborted ? 'OAuth 已取消或超时，配置保留' : 'OAuth 授权或凭据保存失败，需要重新授权' };
      }).finally(() => { clearTimeout(timeout); if (this.authorizations.get(record.id) === job) this.authorizations.delete(record.id); });
      return { authorizationUrl: job.task.url, pending: true };
    } catch {
      clearTimeout(timeout); this.authorizations.delete(record.id);
      controller.abort(); this.start(record);
      throw new Error('OAuth 初始化失败，请检查服务元数据、PKCE 支持或公开客户端 ID');
    }
  }
}
