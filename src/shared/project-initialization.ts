import { z } from 'zod';

// 保留旧内置文本，只用于精确识别未自定义的已存默认规则。
const legacyDefaultCommitRuleContent = `---
alwaysApply: true
scene: git_message
---

# Git Commit Message 规范

## 提交格式

\`\`\`text
<type>：<subject>

1.原因分析：<原因，无则填「无」>
2.修改方法：
1）<具体修改点>
2）<具体修改点>
\`\`\`

- type 后接全角冒号「：」，不空格；作用域可写为 type(scope)：subject。
- type 取「新增文件／代码重构／问题修复／编译代码／文档修改／样式修改／其他提交」，按变更主体归类。
- subject 用一句话说明目的；项目已有版本管理约定时按该约定标注版本。
- 正文固定「原因分析／修改方法」，修改点用 1）2）编号。
- 问题修复必须说明现象、影响和原因；不要使用「更新了一些文件」等模糊描述。
- 提交前检查变更与项目要求的验证结果，只暂存本次相关文件。
- 未经用户明确要求，不自动提交或推送。
`;

export const DEFAULT_COMMIT_RULE_CONTENT = legacyDefaultCommitRuleContent.replace(
  /^---\nalwaysApply: true\nscene: git_message\n---\n\n/, '',
);

const groupedInitializationSchema = z.object({
  basic: z.boolean(),
  agent: z.boolean(),
  git: z.boolean(),
  commitRules: z.boolean(),
  commitRuleContent: z.string().max(10000),
  completeOnImport: z.boolean().default(false),
}).strict().refine(value => !value.agent || !value.commitRules || !!value.commitRuleContent.trim(), '请填写提交规则内容')
  .transform(value => value.commitRuleContent === legacyDefaultCommitRuleContent
    ? { ...value, commitRuleContent: DEFAULT_COMMIT_RULE_CONTENT } : value);
const legacyInitializationSchema = z.object({
  template: z.enum(['none', 'basic']),
  git: z.boolean(),
}).strict().refine(value => value.template !== 'none' || !value.git, '不初始化时不能启用 Git')
  .transform(value => ({
    basic: value.template === 'basic', agent: value.template === 'basic', git: value.git,
    commitRules: true, commitRuleContent: DEFAULT_COMMIT_RULE_CONTENT, completeOnImport: false,
  }));
export const projectInitializationSchema = z.union([groupedInitializationSchema, legacyInitializationSchema]);
export type ProjectInitialization = z.infer<typeof projectInitializationSchema>;
export type ProjectInitializationInput = z.input<typeof projectInitializationSchema>;
export interface ProjectInitializationResult { created: string[]; preserved: string[] }
export const defaultProjectInitialization = (): ProjectInitialization => ({
  basic: false, agent: false, git: false, commitRules: true, commitRuleContent: DEFAULT_COMMIT_RULE_CONTENT, completeOnImport: false,
});
