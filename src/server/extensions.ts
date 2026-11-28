import type { Context } from '@deepseek-ai/cordis';
import { existsSync } from 'node:fs';
import { resolveAgentsHome } from '@deepseek-ai/dsh-home-paths';
import type { ExtensionConfig, ExtensionModule, ExtensionsPort } from '../shared/extensions.js';
import type { Project, State } from '../shared/model.js';
import { migrationTarget } from './migration-ownership.js';
import type { HostPort } from './service.js';
import { SkillsManager, type SkillsContext } from './skills.js';
import { McpManager } from './mcp.js';
import { RssManager } from './rss.js';

/**
 * 扩展侧的项目投影与 `src/server/service.ts:649-661` 保持同一判据：
 * 绑定必须与工作区路径一致，已完成迁移的源项目不再对扩展可见（否则技能/连接器会把已迁走的项目当成还能用）。
 */
/**
 * 投影每次重建都对每个项目做一次同步 stat；项目数一多就变成扩展调用里的固定开销。
 * 目录可用性本来只需要「最近一次观察」，用短 TTL 缓存摊掉重复的系统调用。
 */
const AVAILABLE_TTL_MS = 2000;
const availableCache = new Map<string, { at: number; value: boolean }>();
const pathAvailable = (path: string): boolean => {
  const now = Date.now(), cached = availableCache.get(path);
  if (cached && now - cached.at < AVAILABLE_TTL_MS) return cached.value;
  const value = existsSync(path);
  availableCache.set(path, { at: now, value });
  if (availableCache.size > 64) for (const [key, entry] of availableCache) if (now - entry.at >= AVAILABLE_TTL_MS) availableCache.delete(key);
  return value;
};
export function extensionProjects(
  workspaces: readonly { id: string; path: string; title: string; sessionIds: readonly string[] }[],
  state: State,
): Project[] {
  return workspaces.flatMap(workspace => {
    const binding = state.bindings.find(item => item.workspaceId === workspace.id
      && !item.removed && !item.retired && item.path === workspace.path);
    if (!binding || migrationTarget(state, binding.projectId)) return [];
    return [{ projectId: binding.projectId, workspaceId: workspace.id, title: workspace.title, path: workspace.path,
      available: pathAvailable(workspace.path), archived: binding.archived, sessionIds: [...workspace.sessionIds],
      sessions: [], todos: [], mark: { pinned: false, favorite: false },
      agentCanChangeStatus: binding.agentCanChangeStatus, updatedAt: 0 }];
  });
}

/** 单模块的加载失败不影响项目、会话、待办或其他扩展。 */
export class Extensions implements ExtensionsPort {
  readonly skills: SkillsManager;
  readonly mcp: McpManager;
  readonly rss: RssManager;
  private stopped = false;
  constructor(ctx: Context, home: string, host: HostPort, state: () => State, config: () => ExtensionConfig) {
    const projects = (): Project[] => extensionProjects(ctx.workspaceRegistry.list(), state());
    this.skills = new SkillsManager({ ctx: ctx as unknown as SkillsContext, home, agentsHome: resolveAgentsHome(),
      projects, config: () => config().skills, reveal: host.reveal });
    this.mcp = new McpManager({ ctx, home, projects, config: () => config().mcp });
    this.rss = new RssManager({ home, getConfig: () => config().rss });
  }
  async handle(module: ExtensionModule, method: string, input: unknown, signal: AbortSignal) {
    if (this.stopped) throw new Error('扩展模块已卸载');
    signal.throwIfAborted();
    return this[module].handle(method, input, signal);
  }
  async dispose() {
    this.stopped = true;
    const results = await Promise.allSettled([this.skills.dispose(), this.mcp.dispose(), this.rss.dispose()]);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), '扩展模块资源释放失败');
  }
}
