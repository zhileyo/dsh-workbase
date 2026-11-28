import { z } from 'zod';

export const mcpDefaults = { injection: 'always' as const, timeoutSeconds: 30, autoReconnect: true };
const strings = z.record(z.string(), z.string());
export const mcpConfigSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(1000).default(''),
  transport: z.enum(['http', 'stdio']).default('http'),
  url: z.string().default(''), command: z.string().default(''),
  args: z.array(z.string()).default([]), env: strings.default({}),
  cwd: z.string().default(''), headers: strings.default({}),
  auth: z.enum(['none', 'bearer', 'api-key', 'oauth']).default('none'),
  oauthClientId: z.string().trim().max(500).default(''),
  oauthScope: z.string().trim().max(1000).default(''),
  keyHeader: z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/).default('X-API-Key'),
  scope: z.enum(['global', 'project']).default('global'),
  projectIds: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  injection: z.enum(['always', 'session']).default('always'),
  timeoutSeconds: z.number().int().min(1).max(300).default(30),
  autoReconnect: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.transport === 'http') {
    try {
      const url = new URL(value.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
        throw new Error();
    } catch { ctx.addIssue({ code: 'custom', path: ['url'], message: '请输入不含凭据、查询参数或片段的 HTTP/HTTPS 服务地址' }); }
  } else if (!value.command.trim()) ctx.addIssue({ code: 'custom', path: ['command'], message: '请填写命令' });
  if (value.transport === 'stdio' && value.auth !== 'none')
    ctx.addIssue({ code: 'custom', path: ['auth'], message: 'stdio 使用环境变量认证，不支持 HTTP 认证方式' });
});
export type McpConfig = z.infer<typeof mcpConfigSchema>;
export interface McpTool {
  name: string; description: string; inputSchema: Record<string, unknown>; enabled: boolean;
}
export type McpState = 'unknown' | 'connecting' | 'connected' | 'auth' | 'error' | 'disabled' | 'unavailable';
export interface McpConnection extends McpConfig {
  id: string; prefix: string; installedAt: number; revision: number;
  credentialRefs: string[]; hasSecret: boolean; disabledTools: string[];
}
export interface McpConnectionView extends McpConnection {
  state: McpState; issue: string; tools: McpTool[]; busy: boolean;
  authorizationUrl?: string;
}
export interface McpSource {
  id: string; name: string; url: string; enabled: boolean; builtin?: boolean;
}
export const builtinMcpSource: McpSource = {
  id: 'wbmcps-community', name: 'DSH 社区连接器',
  url: 'https://cdn.jsdelivr.net/gh/duhu2000/dsh-mcp-connector-registry@main/catalog.json',
  enabled: true, builtin: true,
};
export interface McpCredentialField {
  key: string; label: string; placeholder: string; description: string; required: boolean; secret: boolean;
  helpLabel: string; helpUrl: string;
  bindings: { target: 'env' | 'headers'; name: string }[];
}
export interface McpCandidateMetadata {
  description: string; vendor: string; category: string; homepage: string;
  credentialName: string; credentialPlaceholder: string; credentialDescription: string;
  credentialHelpLabel: string; credentialHelpUrl: string; credentialFields: McpCredentialField[];
}
export interface McpCandidate {
  name: string; description: string; config: Partial<McpConfig>; sourceId?: string; id?: string; issue?: string;
  metadata?: McpCandidateMetadata;
}
export interface McpSnapshot {
  connections: McpConnectionView[]; sources: McpSource[]; foreign: { name: string; source: string; readonly: true }[];
  capabilities: { connection: boolean; credentials: boolean; oauth: boolean; sessionIsolation: false; issue: string };
  defaults: { injection: 'always' | 'session'; timeoutSeconds: number; autoReconnect: boolean };
}
export const mcpStateLabels: Record<McpState, string> = {
  unknown: '状态未知', connecting: '连接中', connected: '已连接', auth: '需授权',
  error: '连接失败', disabled: '已停用', unavailable: '官方客户端不可用',
};

export function mcpRedactedConfig(record: McpConnection): McpConfig {
  const config = mcpConfigSchema.parse(record);
  return { ...config, headers: {}, env: {}, args: redactMcpArgs(config.args) };
}
export function redactMcpArgs(args: string[]) {
  return args.map((value, index) => isMcpSecretArg(args, index) ? '[redacted]' : value);
}
export function isMcpSecretArg(args: readonly string[], index: number) {
  const sensitive = (value: string) => /token|secret|password|api[_-]?key|authorization|credential|header/i.test(value)
    || value.startsWith('-H');
  const value = args[index] ?? '';
  const previous = args[index - 1] ?? '';
  return value.includes('${credential:') || sensitive(value)
    || !previous.includes('${credential:') && sensitive(previous);
}
