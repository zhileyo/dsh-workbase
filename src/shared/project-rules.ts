import { z } from 'zod';

// 覆盖50条规则、200个项目引用及新旧全文的最坏JSON转义预算。
export const RULES_ENDPOINT = 'workbase/rules';
export const MAX_RULES_REQUEST_BYTES = 40 * 1024 * 1024;
export const MESSAGE_ENDPOINT = 'workbase/message';
export const MAX_MESSAGE_REQUEST_BYTES = 128 * 1024;
export const MAX_RPC_REQUEST_BYTES = 32768;
const content = z.string().max(20000).refine(value => !value.includes('dsh-workbase:rules'), '规则正文不能包含工作台区块标记');
const rule = z.object({ enabled: z.boolean(), content }).strict();
export const projectRulesSchema = z.object({
  global: rule,
  projects: z.array(rule.extend({
    id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
    name: z.string().trim().min(1).max(100).refine(value => !/[\r\n]/.test(value) && !value.includes('dsh-workbase:rules')),
    projectIds: z.array(z.string().min(1).max(200)).max(200),
  }).strict()).max(50),
}).strict().superRefine((value, ctx) => {
  const ids = new Set<string>();
  for (const [i, entry] of value.projects.entries()) {
    if (ids.has(entry.id)) ctx.addIssue({ code: 'custom', path: ['projects', i, 'id'], message: '规则标识重复' });
    ids.add(entry.id);
    if (new Set(entry.projectIds).size !== entry.projectIds.length)
      ctx.addIssue({ code: 'custom', path: ['projects', i, 'projectIds'], message: '适用项目重复' });
    if (entry.enabled && (!entry.content.trim() || !entry.projectIds.length))
      ctx.addIssue({ code: 'custom', path: ['projects', i], message: '请填写规则正文并选择适用项目' });
  }
  if (value.global.enabled && !value.global.content.trim())
    ctx.addIssue({ code: 'custom', path: ['global', 'content'], message: '请填写全局规则正文' });
});
export type ProjectRules = z.infer<typeof projectRulesSchema>;
export const defaultProjectRules = (): ProjectRules => ({ global: { enabled: false, content: '' }, projects: [] });
export interface RuleTarget { projectId: string; path: string }
export interface RuleReceipt { rollback(): Promise<void> }
