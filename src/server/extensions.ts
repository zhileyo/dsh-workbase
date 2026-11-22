import type { Context } from '@deepseek-ai/cordis';
import { existsSync } from 'node:fs';
import { resolveAgentsHome } from '@deepseek-ai/dsh-home-paths';
import type { ExtensionConfig, ExtensionModule, ExtensionsPort } from '../shared/extensions.js';
import type { Binding, Project } from '../shared/model.js';
import type { HostPort } from './service.js';
import { SkillsManager, type SkillsContext } from './skills.js';
import { McpManager } from './mcp.js';
import { RssManager } from './rss.js';

/** 单模块的加载失败不影响项目、会话、待办或其他扩展。 */
export class Extensions implements ExtensionsPort {
  readonly skills: SkillsManager;
  readonly mcp: McpManager;
  readonly rss: RssManager;
  private stopped = false;
  constructor(ctx: Context, home: string, host: HostPort, bindings: () => Binding[], config: () => ExtensionConfig) {
    const projects = (): Project[] => ctx.workspaceRegistry.list().flatMap(workspace => {
      const binding = bindings().find(item => item.workspaceId === workspace.id && !item.removed && !item.retired);
      if (!binding) return [];
      return [{ projectId: binding.projectId, workspaceId: workspace.id, title: workspace.title, path: workspace.path,
        available: existsSync(workspace.path), archived: binding.archived, sessionIds: [...workspace.sessionIds],
        sessions: [], todos: [], mark: { pinned: false, favorite: false },
        agentCanChangeStatus: binding.agentCanChangeStatus, updatedAt: 0 }];
    });
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
