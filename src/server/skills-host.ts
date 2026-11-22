import type { SkillProvider, SkillProviderControl, SkillRegistry } from '@deepseek-ai/dsh-skill';

export interface SkillAgent {
  id: string;
  ctx: { get(name: 'skills'): SkillRegistry | undefined };
}
interface HostContext {
  get(name: string): unknown;
  on?(event: string, callback: (payload: { agent: SkillAgent }) => void): () => void;
  emit?(event: string, ...args: unknown[]): void;
}

/** 官方预设在更近的作用域注册技能；策略必须同时注册到每个 Agent。 */
export class SkillsHost {
  private invalidators = new Set<() => void>();
  private registrations = new Map<string, () => void>();
  private stops: (() => void)[] = [];
  failure?: string;
  constructor(context: unknown, factory: (scoped: boolean) => SkillProvider) {
    const ctx = context as HostContext | undefined;
    this.ctx = ctx;
    const register = (registry: SkillRegistry | undefined, scoped: boolean) => {
      if (!registry?.registerProvider) return;
      let invalidate: (() => void) | undefined;
      const dispose = registry.registerProvider((control: SkillProviderControl) => {
        invalidate = control.invalidate;
        this.invalidators.add(invalidate);
        return factory(scoped);
      });
      return () => { dispose(); if (invalidate) this.invalidators.delete(invalidate); };
    };
    const install = (agent: SkillAgent) => {
      if (!agent || this.registrations.has(agent.id)) return;
      try {
        const stop = register(agent.ctx?.get('skills'), true);
        if (stop) this.registrations.set(agent.id, stop);
      } catch (error) { this.failure = String(error); }
    };
    try {
      const stop = register(ctx?.get('skills') as SkillRegistry | undefined, false);
      if (stop) this.stops.push(stop);
      if (ctx?.on) {
        this.stops.push(ctx.on('agent/created', ({ agent }) => install(agent)));
        this.stops.push(ctx.on('agent/disposed', ({ agent }) => {
          this.registrations.get(agent.id)?.(); this.registrations.delete(agent.id);
        }));
      }
      const agents = ctx?.get('agents') as { list?(): SkillAgent[] } | undefined;
      for (const agent of agents?.list?.() ?? []) install(agent);
    } catch (error) { this.failure = String(error); }
  }
  private ctx?: HostContext;
  agents() {
    const agents = this.ctx?.get('agents') as { list?(): SkillAgent[] } | undefined;
    return agents?.list?.() ?? [];
  }
  refresh() {
    for (const invalidate of this.invalidators) {
      try { invalidate(); } catch (error) { this.failure = String(error); }
    }
    try {
      this.ctx?.emit?.('commands/change');
      const sessions = this.ctx?.get('sessions') as {
        list?(): { id?: string; header?: { id?: string; agentPreset?: string } }[];
      } | undefined;
      for (const session of sessions?.list?.() ?? []) {
        const id = session.id ?? session.header?.id, preset = session.header?.agentPreset;
        // 官方客户端只转发此事件来清理当前会话的斜杠菜单缓存。
        if (id && preset) this.ctx?.emit?.('agent-preset/selected', id, preset);
      }
    } catch (error) { this.failure = String(error); }
  }
  dispose() {
    for (const stop of this.stops.splice(0)) stop();
    for (const stop of this.registrations.values()) stop();
    this.registrations.clear(); this.invalidators.clear();
  }
}
