import type { Command } from '../shared/commands.js';
import { projectRulesSchema, type ProjectRules } from '../shared/project-rules.js';

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const normalized = (value: ProjectRules) => {
  const parsed = projectRulesSchema.safeParse(value);
  return parsed.success ? parsed.data : value;
};

/** 只推进已确认的版本；响应不替换输入草稿，失败不自动重试。 */
export class RulesSave {
  draft: ProjectRules;
  saved: ProjectRules;
  error = '';
  saving = false;
  composing = false;
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<boolean>;
  constructor(value: ProjectRules, private readonly send: (command: Command) => Promise<unknown>,
    private readonly changed: () => void, private readonly delay = 650) {
    this.saved = projectRulesSchema.parse(value); this.draft = structuredClone(value);
  }
  get dirty() { return !equal(normalized(this.draft), this.saved); }
  update(value: ProjectRules) {
    this.draft = structuredClone(value);
    this.changed();
    this.schedule();
  }
  composition(value: boolean) { this.composing = value; if (value) this.cancelTimer(); else this.schedule(); }
  private schedule() {
    this.cancelTimer();
    if (!this.composing && !this.error && this.dirty) this.timer = setTimeout(() => { void this.flush(); }, this.delay);
  }
  private cancelTimer() { clearTimeout(this.timer); this.timer = undefined; }
  dispose() { this.cancelTimer(); }
  discard() { this.cancelTimer(); this.draft = structuredClone(this.saved); this.error = ''; this.changed(); }
  async retry() { this.error = ''; return this.flush(); }
  private candidate() {
    const next = structuredClone(this.saved);
    if (projectRulesSchema.safeParse({ global: this.draft.global, projects: [] }).success)
      next.global = structuredClone(this.draft.global);
    // 删除与每条合法草稿单独合并；其他无效草稿不能阻塞它们。
    next.projects = next.projects.filter(rule => this.draft.projects.some(item => item.id === rule.id));
    for (const rule of this.draft.projects) {
      const parsed = projectRulesSchema.safeParse({ global: { enabled: false, content: '' }, projects: [rule] });
      if (!parsed.success) continue;
      const i = next.projects.findIndex(item => item.id === rule.id);
      if (i < 0) next.projects.push(parsed.data.projects[0]!);
      else next.projects[i] = parsed.data.projects[0]!;
    }
    return projectRulesSchema.parse(next);
  }
  flush(): Promise<boolean> {
    this.cancelTimer();
    if (this.pending) return this.pending;
    if (this.composing || this.error) return Promise.resolve(false);
    this.pending = this.drain().finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async drain() {
    try {
      for (;;) {
        if (this.composing) return false;
        const next = this.candidate();
        if (equal(next, this.saved)) return !this.dirty;
        this.saving = true; this.changed();
        const result = await this.send({ op: 'rules-save', rules: next, expectedRules: structuredClone(this.saved) });
        if (result === false) throw new Error('规则保存失败，请重试');
        this.saved = next;
        this.changed();
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : '规则保存失败，请重试';
      return false;
    } finally { this.saving = false; this.changed(); }
  }
}
