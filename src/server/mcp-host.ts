import type { Context, Fiber } from '@deepseek-ai/cordis';
import type { ToolDefinition, ToolRegistrationOptions } from '@deepseek-ai/dsh-tools';
import type { McpConnection } from '../shared/mcp.js';
import type { McpBackend, McpLease, McpRuntimeUpdate } from './mcp.js';
import type { McpOAuthVault } from './mcp-oauth.js';

/**
 * Contract evidence: actual desktop 0.2.2-rc.5 package src/index.ts, src/status.ts,
 * src/tools.ts and credentials/src/index.ts, read from the application ASAR.
 * No OAuth provider exists in the exported client Config; no loader config writes.
 */
export interface OfficialClient {
  Config(input: unknown): unknown;
  apply: unknown;
  connectionStatusOf(fiber: Fiber): {
    current(): { state: string; lastError?: string };
    closure(): { closeConfirmed: boolean; cleanupError?: string };
    onChange(listener: () => void): () => void;
  } | undefined;
}
export class McpCleanupError extends Error {
  constructor(readonly lease: McpLease) {
    super('官方连接器客户端资源清理未确认，需要重启宿主');
    this.name = 'McpCleanupError';
  }
}
interface CredentialPort extends McpOAuthVault {
  set(ref: string, value: string): Promise<void>;
  unset(ref: string): Promise<void>;
}
/** 连接器工具按会话身份授权：值来自 agent.session.id，可能命中项目工作区也可能命中其 sessionIds。 */
function sessionIdentity(agent: { session: { id: unknown } } | undefined): string | undefined {
  return agent ? String(agent.session.id) : undefined;
}
/** 只有模块确实不存在时才降级为「宿主没有官方客户端」。 */
export function isMissingMcpClient(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /Cannot find (package|module) '@deepseek-ai\/dsh-mcp-client'/.test(message);
}
export async function createMcpBackend(ctx: Context, verifiedClient?: OfficialClient): Promise<McpBackend> {
  const credentials = ctx.get('credentials') as CredentialPort | undefined;
  const backend: McpBackend = {
    credentials: credentials && typeof credentials.set === 'function' && typeof credentials.unset === 'function'
      ? { set: (ref, value) => credentials.set(ref, value), unset: ref => credentials.unset(ref) } : undefined,
    oauthVault: credentials && typeof credentials.readRecord === 'function' && typeof credentials.modifyRecord === 'function'
      && typeof credentials.deleteRecord === 'function' ? {
        readRecord: key => credentials.readRecord(key),
        modifyRecord: (key, mutate) => credentials.modifyRecord(key, mutate),
        deleteRecord: key => credentials.deleteRecord(key),
      } : undefined,
    foreign: () => {
      const manager = ctx.get('mcpManager') as { list?(): { name: string; configured: boolean }[] } | undefined;
      return manager?.list?.().filter(item => item.configured)
        .map(item => ({ name: item.name, source: '官方连接器管理器或其他插件', readonly: true as const })) ?? [];
    },
  };
  let client: OfficialClient;
  try {
    const specifier = '@deepseek-ai/dsh-mcp-client';
    client = verifiedClient ?? await import(specifier) as OfficialClient;
    if (typeof client.Config !== 'function' || typeof client.apply !== 'function'
      || typeof client.connectionStatusOf !== 'function') {
      // 包在、但导出契约不符，是升级后的契约变更，不能伪装成「这台宿主没有这个能力」。
      backend.issue = '官方连接器客户端缺少 Config／apply／connectionStatusOf 导出，契约可能已变更';
      return backend;
    }
  } catch (error) {
    // 只有「这个包没装」才算宿主没提供官方客户端；装了但加载失败（语法、peer 依赖、初始化抛错）
    // 必须显式报出来，否则用户看到的是「宿主缺少能力」，永远查不到真正的错误。
    if (!isMissingMcpClient(error)) throw new Error('官方连接器客户端加载失败', { cause: error });
    return backend;
  }
  const tools = ctx.get('tools') as {
    register(definition: ToolDefinition, options?: ToolRegistrationOptions): () => void;
  } | undefined;
  if (!tools || typeof tools.register !== 'function') return backend;
  backend.connect = async (record, publish, signal, allowed) => {
    const definitions = new Map<string, ToolDefinition>();
    const disposers = new Set<() => void>();
    const inner = ctx.isolate('tools').isolate('mcpResources').isolate('systemPrompt');
    const removeProvider = inner.provide('tools', {
      register(definition: ToolDefinition) {
        definitions.set(definition.name, definition);
        const enabled = (identity: string | undefined) => allowed(identity, definition.name);
        const remove = tools.register({
          ...definition,
          execute: async (args, execution) => {
            if (!enabled(sessionIdentity(execution.agent))) throw new Error('连接器工具未启用或不在当前登记项目范围');
            return definition.execute(args, execution);
          },
        }, { when: activation => enabled(sessionIdentity(activation.agent)) });
        const dispose = () => { definitions.delete(definition.name); disposers.delete(dispose); remove(); };
        disposers.add(dispose);
        return dispose;
      },
    });
    let fiber: Fiber | undefined, detach: (() => void) | undefined, closing: Promise<void> | undefined;
    const close = () => closing ??= (async () => {
      detach?.();
      signal.removeEventListener('abort', abort);
      let failed = false;
      for (const remove of [...disposers]) { try { remove(); } catch { failed = true; } }
      try {
        if (fiber) {
          await fiber.dispose();
          const result = client.connectionStatusOf(fiber)?.closure();
          if (result && (!result.closeConfirmed || result.cleanupError)) failed = true;
        }
      } catch { failed = true; }
      finally { try { await removeProvider(); } catch { failed = true; } }
      if (failed) throw new McpCleanupError({ dispose: close });
    })();
    const abort = () => { void close().catch(() => undefined); };
    try {
      signal.throwIfAborted();
      fiber = inner.plugin(client as never, officialConfig(record, client) as never);
      signal.addEventListener('abort', abort, { once: true });
      await fiber.await();
      signal.throwIfAborted();
      const cell = client.connectionStatusOf(fiber);
      if (!cell) throw new Error('官方客户端没有提供运行状态');
      const update = () => {
        const status = cell.current();
        const state: McpRuntimeUpdate['state'] = status.state === 'connected' ? 'connected'
          : ['connecting', 'reconnecting'].includes(status.state) ? 'connecting'
            : status.state === 'waiting-credentials' ? 'auth'
              : status.state === 'failed' ? 'error' : 'unknown';
        publish({ state, issue: state === 'error' ? '官方客户端连接失败，请查看宿主诊断'
          : state === 'auth' ? '凭据缺失或已失效，请编辑凭据后重连' : '',
          tools: [...definitions.values()].map(definition => ({
            name: definition.name, description: definition.description ?? '',
            inputSchema: definition.parameters as Record<string, unknown>,
          })) });
      };
      detach = cell.onChange(update); update();
      return { dispose: close };
    } catch (error) { await close(); throw error; }
  };
  return backend;
}
function officialConfig(record: McpConnection, client: OfficialClient) {
  return client.Config({
    serverName: record.prefix,
    transport: record.transport === 'http' ? 'streamable-http' : 'stdio',
    ...(record.transport === 'http' ? { url: record.url, headers: record.headers }
      : { command: record.command, args: record.args, env: record.env, cwd: record.cwd }),
    expandTemplates: true, failOnStartupError: false,
    startupTimeoutMs: record.timeoutSeconds * 1000, toolCallTimeoutMs: record.timeoutSeconds * 1000,
    closeTimeoutMs: 5000, reconnect: { enabled: record.autoReconnect },
  });
}
