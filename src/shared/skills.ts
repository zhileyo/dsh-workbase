import { z } from 'zod';
import { hasWindowsIllegalChar, isWindowsReservedName } from './fs-name.js';

export const MAX_SKILL_UPLOAD = 2 * 1024 * 1024;
/** 显示名同时用于目录名称；只保留文件系统和资源长度约束。 */
export const skillNameSchema = z.string().trim().min(1).max(100).refine(name =>
  !name.startsWith('.') && !/[\\/\x00-\x1f\x7f]|[. ]$/.test(name)
  && !hasWindowsIllegalChar(name) && !isWindowsReservedName(name)
  && new TextEncoder().encode(name).length <= 240,
  '技能名称不可包含路径分隔符、控制字符或系统保留名称，最多 100 个字符／240 字节');
export const skillContentSchema = z.object({
  name: skillNameSchema,
  description: z.string().trim().min(1).max(2000),
  body: z.string().trim().min(1).max(MAX_SKILL_UPLOAD),
  enabled: z.boolean().optional(),
  frontmatter: z.string().max(MAX_SKILL_UPLOAD).optional(),
});
export const skillScopeSchema = z.object({
  scope: z.enum(['global', 'project']),
  projectIds: z.array(z.string().min(1)).max(100).default([]),
}).refine(value => value.scope === 'global' ? !value.projectIds.length : value.projectIds.length > 0,
  '全局范围不可包含项目，项目范围至少选择一个项目');
export const skillSaveSchema = skillContentSchema.extend({
  id: z.string().optional(), version: z.number().int().positive().optional(),
  sourceId: z.string().optional(), scope: z.enum(['global', 'project']),
  projectIds: z.array(z.string().min(1)).max(100).default([]),
}).strict();
export type SkillContent = z.infer<typeof skillContentSchema>;
export interface SkillSource {
  id: string; name: string; path: string; enabled: boolean; writable: boolean;
  kind: 'dsh' | 'agents' | 'project' | 'custom'; projectId?: string; issue?: string;
  readonly?: boolean; scope?: 'global' | 'project';
}
export interface SkillInstallation { path: string; projectId?: string; digest: string }
export interface SkillRecord extends SkillContent {
  id: string; version: number; sourceId: string; scope: 'global' | 'project'; projectIds: string[];
  enabled: boolean; installedAt: number; owner: 'workbase' | 'external';
  installations: SkillInstallation[]; files: string[]; issue?: string; deletedAt?: number;
  effective?: 'effective' | 'pending' | 'unavailable' | 'shadowed' | 'disabled' | 'error';
  instructionPath?: string; realInstructionPath?: string;
  invocation?: { modelInvocable: boolean; userInvocable: boolean };
  invocationName?: string;
}
export interface SkillMarketSource { id: string; name: string; url: string; enabled: boolean; issue?: string }
export interface SkillMarketItem extends SkillContent {
  id: string; marketSourceId: string; files?: string[];
  catalog?: { kind: 'skillsh'; source: string; skillId: string } | { kind: 'clawhub'; owner: string; slug: string }
    | { kind: 'skillhub'; slug: string; namespace?: string; version?: string };
}
export interface SkillsSummary { count: number | null; detail: string; errors: number; global: number | null; project: number | null; issues: number; checkedAt: number | null }
export interface SkillsSnapshot {
  revision: number; skills: SkillRecord[]; sources: SkillSource[];
  marketSources: SkillMarketSource[]; market: SkillMarketItem[];
  marketPage?: { query: string; token: string; hasMore: boolean };
  summary: SkillsSummary; disabledDirectory: string; stagingPath: string; legacyStagedCount?: number; issue?: string;
  recoverable?: boolean;
}
export interface SkillReceipt {
  skill: SkillRecord; saved: true; effective: NonNullable<SkillRecord['effective']>; message: string;
}
export function skillMarkdown(skill: Pick<SkillContent, 'name' | 'description' | 'body' | 'frontmatter'>) {
  const retained: string[] = []; let removing = false;
  for (const line of skill.frontmatter?.split(/\r?\n/) ?? []) {
    if (/^(?:name|description):/.test(line)) { removing = true; continue; }
    if (/^\S/.test(line)) removing = false;
    if (!removing) retained.push(line);
  }
  const metadata = retained.length ? `${retained.join('\n')}\n` : '';
  return `---\nname: ${JSON.stringify(skill.name)}\ndescription: ${JSON.stringify(skill.description)}\n${metadata}---\n\n${skill.body}\n`;
}
/** SKILL.md 的公共文档边界：剥 BOM 与首尾空白后切出 frontmatter 与正文；目录发现与上传两条解析入口共用同一判定。 */
export function splitSkillDocument(text: string): { frontmatter: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text.replace(/^\uFEFF/, '').trim());
  if (!match) throw new Error('SKILL.md 需要名称、说明 frontmatter 与正文');
  return { frontmatter: match[1]!, body: match[2]! };
}
/** 上传格式明确限定为原型中的标量 frontmatter；复杂 YAML 不猜测解析结果。 */
export function parseSkillUpload(text: string): SkillContent[] {
  if (new TextEncoder().encode(text).length > MAX_SKILL_UPLOAD) throw new Error('技能文件最大 2 MB');
  const content = text.replace(/^\uFEFF/, '').trim();
  if (content.startsWith('{')) {
    const parsed = z.object({ version: z.literal(1), skills: z.array(skillContentSchema).max(200) }).parse(JSON.parse(content));
    return parsed.skills;
  }
  const { frontmatter, body } = splitSkillDocument(content);
  const fields = new Map<string, string>();
  for (const line of frontmatter.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const field = /^([a-zA-Z][\w-]*):[ \t]*(.*)$/.exec(line);
    if (!field) throw new Error('上传 frontmatter 仅支持单行标量，请使用技能 JSON 上传复杂内容');
    if (fields.has(field[1]!)) throw new Error('frontmatter 字段重复');
    fields.set(field[1]!, field[2]!);
  }
  const scalar = (key: string) => {
    const value = fields.get(key) ?? '';
    if (value.startsWith('"')) return JSON.parse(value) as unknown;
    if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
    if (/^[>|&*!{[]/.test(value)) throw new Error('不支持此 YAML 标量，请使用单行说明或技能 JSON');
    return value.replace(/\s+#.*$/, '').trim();
  };
  return [skillContentSchema.parse({ name: scalar('name'), description: scalar('description'), body, frontmatter })];
}
export function toggleSkillScope(values: readonly string[], value: string): string[] {
  if (value === 'global') return values.includes('global') ? [] : ['global'];
  const selected = values.filter(id => id !== 'global');
  return selected.includes(value) ? selected.filter(id => id !== value) : [...selected, value];
}
export function normalizeSkillMarketUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash)
    throw new Error('数据源仅接受不含凭据和片段的 HTTP／HTTPS 地址');
  return url.href;
}
